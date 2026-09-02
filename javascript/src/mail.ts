import { JustDeployValidationError } from './errors.js';
import { Transport } from './transport.js';
import type { Mail, MailPage, PageOptions, RequestOptions, SendMailInput } from './types.js';
import { pageQuery, pathSegment } from './validation.js';

export class MailClient {
  constructor(private readonly transport: Transport) {}

  async send(input: SendMailInput): Promise<Mail> {
    if (!input || typeof input !== 'object') throw new JustDeployValidationError('mail input is required.');
    const headers: Record<string, string> = {};
    if (input.idempotencyKey !== undefined) {
      if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length === 0 || input.idempotencyKey.length > 256) {
        throw new JustDeployValidationError('idempotencyKey must contain between 1 and 256 characters.');
      }
      headers['idempotency-key'] = input.idempotencyKey;
    }
    const body = {
      from: input.from,
      to: input.to,
      subject: input.subject,
      ...(input.html !== undefined ? { html: input.html } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.tag !== undefined ? { tag: input.tag } : {}),
    };
    const result = await this.transport.organizationRequest<{ mail: Mail }>('POST', '/mails', {
      ...(input.signal ? { signal: input.signal } : {}),
      headers,
      body,
    });
    return result.mail;
  }

  async list(options: PageOptions = {}): Promise<MailPage> {
    return this.transport.organizationRequest<MailPage>('GET', `/mails${pageQuery(options, 100)}`, options);
  }

  async get(mailId: string, options: RequestOptions = {}): Promise<Mail> {
    const result = await this.transport.organizationRequest<{ mail: Mail }>('GET', `/mails/${pathSegment(mailId, 'mailId')}`, options);
    return result.mail;
  }
}
