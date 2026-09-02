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

function protectedStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          reader.releaseLock();
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch {
        reader.releaseLock();
        controller.error(new JustDeployError('The file transfer was interrupted.'));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
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
      headers: { 'content-type': input.mime },
      body: input.data as BodyInit,
      redirect: 'error',
    };
    if (input.signal) request.signal = input.signal;
    if (requiresDuplex(input.data)) (request as RequestInit & { duplex: 'half' }).duplex = 'half';

    const uploaded = await this.transport.presigned(file.url, request);
    if (!uploaded.ok) {
      await uploaded.body?.cancel().catch(() => undefined);
      throw new JustDeployError(`The file upload failed with status ${uploaded.status}.`, { status: uploaded.status });
    }
    await uploaded.body?.cancel().catch(() => undefined);
    return withoutUrl(file);
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
      throw new JustDeployError(`The file download failed with status ${downloaded.status}.`, { status: downloaded.status });
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
}
