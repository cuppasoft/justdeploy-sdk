import { JustDeployValidationError } from './errors.js';
import { Transport } from './transport.js';
import type { CreateTableInput, Database, QueryResult, RequestOptions, Table, UpdateTableInput } from './types.js';
import { pathSegment } from './validation.js';

export class Databases {
  constructor(private readonly transport: Transport) {}

  async list(options: RequestOptions = {}): Promise<Database[]> {
    const result = await this.transport.organizationRequest<{ databases: Database[] }>('GET', '/databases', options);
    return result.databases;
  }

  async query(databaseId: string, sql: string, options: RequestOptions = {}): Promise<QueryResult> {
    if (typeof sql !== 'string' || sql.trim().length === 0) {
      throw new JustDeployValidationError('sql must be a non-empty string.');
    }
    return this.transport.organizationRequest<QueryResult>('POST', `/databases/${pathSegment(databaseId, 'databaseId')}/query`, {
      ...options,
      body: { query: sql },
    });
  }

  async listTables(databaseId: string, options: RequestOptions = {}): Promise<Table[]> {
    const result = await this.transport.organizationRequest<{ tables: Table[] }>(
      'GET',
      `/databases/${pathSegment(databaseId, 'databaseId')}/tables`,
      options,
    );
    return result.tables;
  }

  async createTable(databaseId: string, input: CreateTableInput, options: RequestOptions = {}): Promise<Table> {
    const result = await this.transport.organizationRequest<{ table: Table }>(
      'POST',
      `/databases/${pathSegment(databaseId, 'databaseId')}/tables`,
      { ...options, body: input },
    );
    return result.table;
  }

  async updateTable(databaseId: string, tableName: string, input: UpdateTableInput, options: RequestOptions = {}): Promise<Table> {
    const result = await this.transport.organizationRequest<{ table: Table }>(
      'PUT',
      `/databases/${pathSegment(databaseId, 'databaseId')}/tables/${pathSegment(tableName, 'tableName')}`,
      { ...options, body: input },
    );
    return result.table;
  }

  async deleteTable(databaseId: string, tableName: string, options: RequestOptions = {}): Promise<void> {
    await this.transport.organizationRequest<unknown>(
      'DELETE',
      `/databases/${pathSegment(databaseId, 'databaseId')}/tables/${pathSegment(tableName, 'tableName')}`,
      options,
    );
  }
}
