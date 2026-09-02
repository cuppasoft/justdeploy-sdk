import { AuthManager } from './auth.js';
import { Databases } from './databases.js';
import { JustDeployConfigurationError } from './errors.js';
import { MailClient } from './mail.js';
import { Storages } from './storages.js';
import { Transport } from './transport.js';

export class JustDeploy {
  readonly databases: Databases;
  readonly storages: Storages;
  readonly mail: MailClient;

  constructor() {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new JustDeployConfigurationError('The JustDeploy SDK supports server-side Node.js 22 and 24 only.');
    }
    const major = Number(process.versions.node.split('.')[0]);
    if (major !== 22 && major !== 24) {
      throw new JustDeployConfigurationError('The JustDeploy SDK supports server-side Node.js 22 and 24 only.');
    }
    const transport = new Transport(new AuthManager());
    this.databases = new Databases(transport);
    this.storages = new Storages(transport);
    this.mail = new MailClient(transport);
  }
}
