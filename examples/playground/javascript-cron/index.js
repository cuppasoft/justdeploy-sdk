const { JustDeploy } = require('@justdeploy/sdk');
const { randomUUID } = require('node:crypto');

exports.handler = async () => {
  const justdeploy = new JustDeploy();
  const [databases, storages] = await Promise.all([
    justdeploy.databases.list(),
    justdeploy.storages.list(),
  ]);
  if (databases.length === 0 || storages.length === 0) {
    throw new Error('The Playground organization needs at least one database and one storage.');
  }

  const databaseId = databases[0].id;
  const storageId = storages[0].id;
  const sender = process.env.SDK_TEST_FROM;
  if (!sender) throw new Error('SDK_TEST_FROM is required for the Playground mail check.');
  const tableName = `jd_sdk_verify_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const payload = new TextEncoder().encode('JustDeploy SDK streaming check');
  let tableCreated = false;
  let fileId;

  try {
    await justdeploy.databases.createTable(databaseId, {
      name: tableName,
      columns: [
        { name: 'label', type: 'string', nullable: false },
        { name: 'value', type: 'integer', nullable: false },
      ],
    });
    tableCreated = true;

    const inserted = await justdeploy.databases.query(
      databaseId,
      `INSERT INTO \`${tableName}\` (\`label\`, \`value\`) VALUES (?, ?)`,
      { params: ['before', 1] },
    );
    const rowId = inserted.id;
    const selected = await justdeploy.databases.query(
      databaseId,
      `SELECT \`label\`, \`value\` FROM \`${tableName}\` WHERE \`id\` = ?`,
      { params: [rowId] },
    );
    if (JSON.stringify(selected.rows) !== JSON.stringify([{ label: 'before', value: 1 }])) {
      throw new Error('Unexpected inserted row.');
    }

    await justdeploy.databases.query(
      databaseId,
      `UPDATE \`${tableName}\` SET \`label\` = ?, \`value\` = ? WHERE \`id\` = ?`,
      { params: ['after', 2, rowId] },
    );
    const updated = await justdeploy.databases.query(
      databaseId,
      `SELECT \`label\`, \`value\` FROM \`${tableName}\` WHERE \`id\` = ?`,
      { params: [rowId] },
    );
    if (JSON.stringify(updated.rows) !== JSON.stringify([{ label: 'after', value: 2 }])) {
      throw new Error('Unexpected updated row.');
    }

    await justdeploy.databases.query(databaseId, `DELETE FROM \`${tableName}\` WHERE \`id\` = ?`, { params: [rowId] });
    const deleted = await justdeploy.databases.query(databaseId, `SELECT \`id\` FROM \`${tableName}\` WHERE \`id\` = ?`, { params: [rowId] });
    if (deleted.rows.length !== 0) throw new Error('The database row was not deleted.');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(payload.slice(0, 11));
        controller.enqueue(payload.slice(11));
        controller.close();
      },
    });
    const stored = await justdeploy.storages.upload(storageId, {
      name: 'justdeploy-sdk-streaming-check.txt',
      mime: 'text/plain',
      data: stream,
      size: payload.byteLength,
    });
    fileId = stored.id;
    const download = await justdeploy.storages.download(storageId, fileId);
    const downloaded = new Uint8Array(await new Response(download.stream).arrayBuffer());
    if (!Buffer.from(downloaded).equals(Buffer.from(payload))) {
      throw new Error('The downloaded storage content did not match the upload.');
    }

    const idempotencyKey = `javascript-sdk-check-${randomUUID()}`;
    const mailInput = {
      sender,
      to: 'success@simulator.amazonses.com',
      subject: 'JustDeploy JavaScript SDK development check',
      text: 'This message validates the development-only SDK path.',
      tag: 'sdk-development-check',
      idempotencyKey,
    };
    const firstMail = await justdeploy.mail.send(mailInput);
    const replayedMail = await justdeploy.mail.send(mailInput);
    if (firstMail.id !== replayedMail.id) {
      throw new Error('The same mail idempotency key created two messages.');
    }

    const result = {
      sdk: 'javascript/0.2.0',
      databaseDml: true,
      storageStreaming: true,
      mailIdempotency: true,
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    try {
      if (fileId !== undefined) await justdeploy.storages.deleteFile(storageId, fileId);
    } finally {
      if (tableCreated) await justdeploy.databases.deleteTable(databaseId, tableName);
    }
  }
};
