export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface RequestOptions {
  /**
   * Cancels the API/file request, not a shared authentication exchange.
   * Canceling a write does not prove that the server rolled it back.
   */
  signal?: AbortSignal;
}

export interface PageOptions extends RequestOptions {
  limit?: number;
  cursor?: number;
}

export interface QueryOptions extends RequestOptions {
  /** Values for ? placeholders, never identifiers or SQL fragments. Use strings for large integers and exact decimals. */
  params?: readonly JsonPrimitive[];
}

export interface Database {
  id: string;
  name: string;
  stage: 'production' | 'development';
  createdAt: string;
  updatedAt: string;
}

export type ColumnType = 'string' | 'text' | 'integer' | 'float' | 'boolean' | 'date' | 'json';

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  nullable?: boolean;
  unique?: boolean;
  default?: string | number | boolean | null;
  comment?: string;
}

export interface Column extends Omit<ColumnDefinition, 'comment'> {
  nullable: boolean;
  unique: boolean;
  default: string | number | boolean | null;
  comment: string | null;
}

export interface Table {
  name: string;
  comment: string | null;
  columns: Column[];
}

export interface CreateTableInput {
  name: string;
  columns: ColumnDefinition[];
  comment?: string;
}

export interface UpdateTableInput {
  add?: ColumnDefinition[];
  modify?: ColumnDefinition[];
  rename?: { from: string; to: string }[];
  drop?: string[];
  reorder?: string[];
  comment?: string | null;
}

export type QueryResult = { rows: JsonObject[] } | { id: number };

export interface Storage {
  id: string;
  name: string;
  status: 'active' | 'deleting' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface StoredFile {
  id: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  /** Metadata state: a completed upload may still be pending while its bytes are already readable. */
  status: 'pending' | 'active' | 'deleted';
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileInfo extends StoredFile {
  /** Short-lived download URL. Use for browser redirects; use download() to read bytes on the server. */
  url: string;
}

export type UploadBody = string | Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

export interface CreateUploadUrlInput {
  name: string;
  mime: string;
  signal?: AbortSignal;
}

export interface UploadUrl {
  fileId: string;
  /** Temporary bearer URL. Do not log/store it or send organization credentials with it. */
  url: string;
  method: 'PUT';
  headers: { 'content-type': string };
  /** Latest expiry reported by the server; may be invalidated earlier. Not a one-time URL. */
  expiresAt: string;
}

export interface UploadInput extends CreateUploadUrlInput {
  data: UploadBody;
  /** Exact byte length. Required only for ReadableStream and AsyncIterable uploads. */
  size?: number;
}

export interface FilePage {
  files: StoredFile[];
  nextCursor: number | null;
}

export interface FileDownload {
  file: StoredFile;
  stream: ReadableStream<Uint8Array>;
  contentType: string | null;
  contentLength: number | null;
}

export type MailStatus = 'sent' | 'delivered' | 'bounced' | 'complained' | 'rejected' | 'failed';

export interface Mail {
  id: string;
  from: string;
  to: string;
  status: MailStatus;
  tag: string | null;
  /** Recipient server acceptance, not proof of inbox placement. */
  deliveredAt: string | null;
  /** Tracking-image activity, not proof a person read the mail; clients may block or preload it. */
  openedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMailInput {
  /** Sender address. The REST request and returned Mail use the field name from. */
  sender: string;
  to: string;
  subject: string;
  /** HTML messages currently include the platform's open-tracking image; there is no opt-out input yet. */
  html?: string;
  text?: string;
  tag?: string;
  /**
   * One key per logical message. Retry that message with the same key and payload;
   * new actions (such as another password reset) need new keys. Changed content
   * with the same key is rejected with 409. The SDK does not generate keys.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface MailPage {
  mails: Mail[];
  nextCursor: number | null;
}
