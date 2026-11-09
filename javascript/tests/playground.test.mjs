import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../examples/playground/javascript-cron/index.js', import.meta.url), 'utf8');
const environment = { JUSTDEPLOY_DATABASE_ID: 'database', JUSTDEPLOY_STORAGE_ID: 'storage', SDK_TEST_FROM: 'test@example.com' };

function fixture({ env = environment, failAt } = {}) {
  const calls = [];
  const payload = new TextEncoder().encode('JustDeploy SDK streaming check');
  let row;
  const sdk = {
    databases: {
      async query(database, sql, { params }) {
        assert.equal(database, environment.JUSTDEPLOY_DATABASE_ID);
        assert.match(sql, /`sdk_checks`/);
        const operation = sql.split(' ')[0];
        calls.push(operation);
        if (operation === 'INSERT') { row = { label: params[0], value: params[1] }; return { id: 42 }; }
        assert.equal(params.at(-1), 42, 'Only this run’s row may be read or changed');
        if (operation === 'DELETE') { row = undefined; return {}; }
        if (operation === 'UPDATE') { row = { label: params[0], value: params[1] }; return {}; }
        assert.equal(operation, 'SELECT');
        if (failAt === 'query') throw new Error('query failed');
        return { rows: row ? [row] : [] };
      },
    },
    storages: {
      async upload(storage, { data, size }) {
        assert.equal(storage, environment.JUSTDEPLOY_STORAGE_ID);
        assert.equal(size, payload.length);
        assert.deepEqual(new Uint8Array(await new Response(data).arrayBuffer()), payload);
        calls.push('upload');
        return { id: 'own-file' };
      },
      async download(storage, id) {
        assert.equal(storage, environment.JUSTDEPLOY_STORAGE_ID);
        assert.equal(id, 'own-file');
        calls.push('download');
        if (failAt === 'download') throw new Error('download failed');
        return { stream: new Response(payload).body };
      },
      async deleteFile(storage, id) {
        assert.equal(storage, environment.JUSTDEPLOY_STORAGE_ID);
        assert.equal(id, 'own-file');
        calls.push('deleteFile');
      },
    },
    mail: {
      async send(input) {
        assert.equal(input.to, 'success@simulator.amazonses.com');
        calls.push(input);
        return { id: 'own-mail' };
      },
    },
  };
  const exports = {};
  runInNewContext(source, {
    exports, process: { env }, TextEncoder, ReadableStream, Response, Uint8Array, Buffer,
    console: { log() {} },
    require(name) {
      if (name === '@justdeploy/sdk') return { JustDeploy: class { constructor() { return sdk; } } };
      assert.equal(name, 'node:crypto');
      return { randomUUID };
    },
  });
  return { run: exports.handler, calls };
}

test('Playground uses only prepared resources, per-row DML and file/mail data calls', async () => {
  const { run, calls } = fixture();
  const result = await run();
  assert.equal(result.databaseDml, true);
  assert.equal(result.storageStreaming, true);
  assert.equal(result.mailIdempotency, true);
  assert.equal(calls.filter(call => call === 'DELETE').length, 1);
  assert.equal(calls.at(-1), 'deleteFile');
  const mailCalls = calls.filter(call => typeof call === 'object');
  assert.equal(mailCalls.length, 2);
  assert.deepEqual(mailCalls[0], mailCalls[1]);
});

test('Playground rejects missing setup before SDK calls', async () => {
  for (const key of Object.keys(environment)) {
    const { run, calls } = fixture({ env: { ...environment, [key]: '' } });
    await assert.rejects(run(), /preparing the Playground resources through MCP/);
    assert.deepEqual(calls, []);
  }
});

test('Playground cleans only its known row or file after a later failure', async () => {
  for (const failAt of ['query', 'download']) {
    const { run, calls } = fixture({ failAt });
    await assert.rejects(run(), new RegExp(`${failAt} failed`));
    assert.equal(calls.at(-1), failAt === 'query' ? 'DELETE' : 'deleteFile');
    assert.equal(calls.filter(call => call === 'DELETE').length, 1);
    assert.ok(!calls.some(call => typeof call === 'object'), 'A failed data check must not send mail');
  }
});
