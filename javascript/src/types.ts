export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface PageOptions extends RequestOptions {
  limit?: number;
  cursor?: number;
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
  status: 'pending' | 'active' | 'deleted';
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileInfo extends StoredFile {
  /** A short-lived URL. Prefer `storages.download()` when reading bytes. */
  url: string;
}

export type UploadBody = string | Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

export interface UploadInput {
  name: string;
  mime: string;
  data: UploadBody;
  /** Exact byte length. Required only for ReadableStream and AsyncIterable uploads. */
  size?: number;
  signal?: AbortSignal;
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
  deliveredAt: string | null;
  openedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMailInput {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  tag?: string;
  /** Use a stable unique value when a caller may retry after a timeout. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface MailPage {
  mails: Mail[];
  nextCursor: number | null;
}
