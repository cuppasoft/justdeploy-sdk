const { JustDeploy } = require('@justdeploy/sdk');
const { randomUUID } = require('node:crypto');

exports.handler = async () => {
  const databaseId = process.env.JUSTDEPLOY_DATABASE_ID;
  const storageId = process.env.JUSTDEPLOY_STORAGE_ID;
  const sender = process.env.SDK_TEST_FROM;
  if (!databaseId || !storageId || !sender) {
    throw new Error('Set JUSTDEPLOY_DATABASE_ID, JUSTDEPLOY_STORAGE_ID and SDK_TEST_FROM after preparing the Playground resources through MCP.');
  }
  const justdeploy = new JustDeploy();
  const payload = new TextEncoder().encode('JustDeploy SDK streaming check');
  let rowId;
  let fileId;

  try {
    const inserted = await justdeploy.databases.query(
      databaseId,
      `INSERT INTO \`sdk_checks\` (\`label\`, \`value\`) VALUES (?, ?)`,
      { params: ['before', 1] },
    );
    if (!Number.isSafeInteger(inserted.id)) throw new Error('The insert did not return a row ID.');
    rowId = inserted.id;
    const selected = await justdeploy.databases.query(
      databaseId,
      `SELECT \`label\`, \`value\` FROM \`sdk_checks\` WHERE \`id\` = ?`,
      { params: [rowId] },
    );
    if (JSON.stringify(selected.rows) !== JSON.stringify([{ label: 'before', value: 1 }])) {
      throw new Error('Unexpected inserted row.');
    }

    await justdeploy.databases.query(
      databaseId,
      `UPDATE \`sdk_checks\` SET \`label\` = ?, \`value\` = ? WHERE \`id\` = ?`,
      { params: ['after', 2, rowId] },
    );
    const updated = await justdeploy.databases.query(
      databaseId,
      `SELECT \`label\`, \`value\` FROM \`sdk_checks\` WHERE \`id\` = ?`,
      { params: [rowId] },
    );
    if (JSON.stringify(updated.rows) !== JSON.stringify([{ label: 'after', value: 2 }])) {
      throw new Error('Unexpected updated row.');
    }

    await justdeploy.databases.query(databaseId, `DELETE FROM \`sdk_checks\` WHERE \`id\` = ?`, { params: [rowId] });
    const deleted = await justdeploy.databases.query(databaseId, `SELECT \`id\` FROM \`sdk_checks\` WHERE \`id\` = ?`, { params: [rowId] });
    if (deleted.rows.length !== 0) throw new Error('The database row was not deleted.');
    rowId = undefined;

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
      sdk: 'javascript/0.2.2',
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
      if (rowId !== undefined) {
        await justdeploy.databases.query(databaseId, 'DELETE FROM `sdk_checks` WHERE `id` = ?', { params: [rowId] });
      }
    }
  }
};
