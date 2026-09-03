import {
  JustDeploy,
  JustDeployError,
  type CreateTableInput,
  type QueryResult,
  type SendMailInput,
  type StoredFile,
} from '@justdeploy/sdk';

const client = new JustDeploy();

async function useSdk(databaseId: string, storageId: string): Promise<void> {
  const query: QueryResult = await client.databases.query(databaseId, 'SELECT * FROM orders');
  const table: CreateTableInput = { name: 'orders', columns: [{ name: 'total', type: 'float' }] };
  await client.databases.createTable(databaseId, table);

  const file: StoredFile = await client.storages.upload(storageId, {
    name: 'hello.txt',
    mime: 'text/plain',
    data: new Uint8Array(),
  });
  await client.storages.deleteFile(storageId, file.id);

  const message: SendMailInput = { sender: 'hello@example.com', to: 'user@example.net', subject: 'Hello', text: 'Hi' };
  await client.mail.send(message);
  void query;
}

void useSdk;
void JustDeployError;
