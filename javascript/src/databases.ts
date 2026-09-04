import { JustDeployValidationError } from './errors.js';
import { Transport } from './transport.js';
import type { CreateTableInput, Database, JsonPrimitive, QueryOptions, QueryResult, RequestOptions, Table, UpdateTableInput } from './types.js';
import { pathSegment } from './validation.js';

export class Databases {
  constructor(private readonly transport: Transport) {}

  async list(options: RequestOptions = {}): Promise<Database[]> {
    const result = await this.transport.organizationRequest<{ databases: Database[] }>('GET', '/databases', options);
    return result.databases;
  }

  /**
   * Executes one statement; separate calls do not share a transaction.
   * Pass user values in options.params for ? placeholders. Never interpolate raw input.
   */
  async query(databaseId: string, sql: string, options: QueryOptions = {}): Promise<QueryResult> {
    if (typeof sql !== 'string' || sql.trim().length === 0) {
      throw new JustDeployValidationError('sql must be a non-empty string.');
    }
    const params: JsonPrimitive[] = [];
    if (options.params !== undefined) {
      const invalid = () => new JustDeployValidationError('params must be an array of strings, finite numbers, booleans, or null. Use strings for large integers and exact decimals.');
      if (!Array.isArray(options.params)) throw invalid();
      for (const value of options.params) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)))) params.push(value);
        else throw invalid();
      }
    }
    const { params: _params, ...requestOptions } = options;
    return this.transport.organizationRequest<QueryResult>('POST', `/databases/${pathSegment(databaseId, 'databaseId')}/query`, {
      ...requestOptions,
      body: { query: sql, ...(options.params === undefined ? {} : { params }) },
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
