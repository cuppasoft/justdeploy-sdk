import { JustDeployError, JustDeployValidationError } from './errors.js';
import { Transport } from './transport.js';
import type { FileDownload, FileInfo, FilePage, PageOptions, RequestOptions, Storage, StoredFile, UploadBody, UploadInput } from './types.js';
import { pageQuery, pathSegment } from './validation.js';

function withoutUrl(file: FileInfo): StoredFile {
  const { url: _url, ...stored } = file;
  return stored;
}
function requiresDuplex(body: UploadBody): boolean {
  return typeof body === 'object' && body !== null && (body instanceof ReadableStream || Symbol.asyncIterator in body);
}

function knownByteLength(body: UploadBody): number | null {
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (body instanceof Uint8Array) return body.byteLength;
  return null;
}

function uploadByteLength(body: UploadBody, supplied: number | undefined): number {
  if (supplied !== undefined && (!Number.isSafeInteger(supplied) || supplied < 0)) {
    throw new JustDeployValidationError('upload size must be a non-negative safe integer.');
  }

  const known = knownByteLength(body);
  if (known !== null) {
    if (supplied !== undefined && supplied !== known) {
      throw new JustDeployValidationError(`upload size ${supplied} does not match the ${known}-byte data.`);
    }
    return known;
  }
  if (supplied === undefined) {
    throw new JustDeployValidationError('upload size is required when data is streamed. Provide the exact byte length.');
  }
  return supplied;
}

function protectedStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          release();
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch {
        release();
        controller.error(new JustDeployError('The file transfer was interrupted.'));
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch {
        // Consumer cancellation is already final; only ensure the lock is released.
      } finally {
        release();
      }
    },
  });
}

export class Storages {
  constructor(private readonly transport: Transport) {}

  async list(options: RequestOptions = {}): Promise<Storage[]> {
    const result = await this.transport.organizationRequest<{ storages: Storage[] }>('GET', '/storages', options);
    return result.storages;
  }

  async listFiles(storageId: string, options: PageOptions = {}): Promise<FilePage> {
    return this.transport.organizationRequest<FilePage>(
      'GET',
      `/storages/${pathSegment(storageId, 'storageId')}/files${pageQuery(options, 200)}`,
      options,
    );
  }

  async getFile(storageId: string, fileId: string, options: RequestOptions = {}): Promise<FileInfo> {
    const result = await this.transport.organizationRequest<{ file: FileInfo }>(
      'GET',
      `/storages/${pathSegment(storageId, 'storageId')}/files/${pathSegment(fileId, 'fileId')}`,
      options,
    );
    return result.file;
  }

  async upload(storageId: string, input: UploadInput): Promise<StoredFile> {
    if (typeof input?.name !== 'string' || input.name.length === 0) {
      throw new JustDeployValidationError('upload name must be a non-empty string.');
    }
    if (typeof input.mime !== 'string' || input.mime.length === 0) {
      throw new JustDeployValidationError('upload mime must be a non-empty string.');
    }
    if (input.data === undefined || input.data === null) {
      throw new JustDeployValidationError('upload data is required.');
    }
    // S3 presigned PUT rejects HTTP chunked transfer. Validate before creating the
    // pending file record so an invalid stream cannot leave an orphaned row.
    const size = uploadByteLength(input.data, input.size);

    const createOptions = {
      body: { files: [{ name: input.name, mime: input.mime }] },
      ...(input.signal ? { signal: input.signal } : {}),
    };
    const created = await this.transport.organizationRequest<{ files: FileInfo[] }>(
      'POST',
      `/storages/${pathSegment(storageId, 'storageId')}/files`,
      createOptions,
    );
    const file = created.files[0];
    if (!file || typeof file.url !== 'string') {
      throw new JustDeployError('JustDeploy returned an invalid file upload response.');
    }

    const request: RequestInit = {
      method: 'PUT',
      headers: { 'content-type': input.mime, 'content-length': String(size) },
      body: input.data as BodyInit,
      redirect: 'error',
    };
    if (input.signal) request.signal = input.signal;
    if (requiresDuplex(input.data)) (request as RequestInit & { duplex: 'half' }).duplex = 'half';

    let uploaded: Response;
    try {
      uploaded = await this.transport.presigned(file.url, request);
    } catch (error) {
      await this.cleanupFailedUpload(storageId, file.id);
      throw error;
    }
    if (!uploaded.ok) {
      await uploaded.body?.cancel().catch(() => undefined);
      await this.cleanupFailedUpload(storageId, file.id);
      throw new JustDeployError(`The file upload failed with status ${uploaded.status}.`, { status: uploaded.status });
    }
    await uploaded.body?.cancel().catch(() => undefined);
    // The creation record still has size=0 until the upload event is processed.
    // A successful PUT already confirms this exact byte length; no extra read is needed.
    return { ...withoutUrl(file), size };
  }

  async download(storageId: string, fileId: string, options: RequestOptions = {}): Promise<FileDownload> {
    const file = await this.getFile(storageId, fileId, options);
    const downloaded = await this.transport.presigned(file.url, {
      method: 'GET',
      redirect: 'error',
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!downloaded.ok) {
      await downloaded.body?.cancel().catch(() => undefined);
      const message =
        file.status === 'pending' && (downloaded.status === 403 || downloaded.status === 404)
          ? 'The file upload has not finished yet. Try the download again shortly.'
          : `The file download failed with status ${downloaded.status}.`;
      throw new JustDeployError(message, { status: downloaded.status });
    }
    if (!downloaded.body) throw new JustDeployError('The file download returned no data.', { status: downloaded.status });

    const rawLength = downloaded.headers.get('content-length');
    const parsedLength = rawLength === null ? null : Number(rawLength);
    return {
      file: withoutUrl(file),
      stream: protectedStream(downloaded.body),
      contentType: downloaded.headers.get('content-type'),
      contentLength: parsedLength !== null && Number.isSafeInteger(parsedLength) && parsedLength >= 0 ? parsedLength : null,
    };
  }

  async deleteFile(storageId: string, fileId: string, options: RequestOptions = {}): Promise<void> {
    await this.transport.organizationRequest<unknown>(
      'DELETE',
      `/storages/${pathSegment(storageId, 'storageId')}/files/${pathSegment(fileId, 'fileId')}`,
      options,
    );
  }

  private async cleanupFailedUpload(storageId: string, fileId: string): Promise<void> {
    try {
      await this.deleteFile(storageId, fileId);
    } catch {
      // Keep the transfer failure as the actionable error. This compensation is
      // best-effort because the API itself may be unreachable.
    }
  }
}
