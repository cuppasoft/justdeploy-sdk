import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import { AuthManager } from '../dist/esm/auth.js';
import { Databases } from '../dist/esm/databases.js';
import { JustDeploy, JustDeployAuthenticationError, JustDeployConfigurationError, JustDeployError, JustDeployValidationError } from '../dist/esm/index.js';
import { MailClient } from '../dist/esm/mail.js';
import { Storages } from '../dist/esm/storages.js';
import { Transport } from '../dist/esm/transport.js';
import { SDK_VERSION } from '../dist/esm/version.js';

const API = 'https://api.justdeploy.net';
const ORG = 'abcdefghijklmnop';
const EXPIRY = '2099-01-01T00:00:00.000Z';

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function session(token = 'session-token') {
  return json({ token, organizationId: ORG, expiresAt: EXPIRY });
}

function header(init, name) {
  return new Headers(init.headers).get(name);
}

function credentialStack(fetcher, now) {
  const auth = new AuthManager({
    env: { JUSTDEPLOY_ACCESS_KEY: 'ak_test', JUSTDEPLOY_SECRET_KEY: 'sk_test' },
    identityPath: '/path/that/does/not/exist',
    fetcher,
    ...(now ? { now } : {}),
  });
  return new Transport(auth, fetcher);
}

test('query parameters stay separate from SQL and preserve the existing signal and response', async () => {
  const calls = [];
  const transport = credentialStack(async (input, init) => {
    if (String(input).endsWith('/auth/credential')) return session();
    calls.push({ body: JSON.parse(init.body), signal: init.signal });
    return json({ rows: [{ answer: 42 }] });
  });
  const database = new Databases(transport);
  const params = ["한글 ' \\ 😀 ?; DROP TABLE notes;", null, true, false, 1.5, 42, '9007199254740993', '0.00000000000000000001'];
  const sql = `SELECT ${params.map(() => '?').join(', ')}`;
  const controller = new AbortController();
  assert.deepEqual(await database.query('db', sql, { params, signal: controller.signal }), { rows: [{ answer: 42 }] });
  assert.deepEqual(calls[0].body, { query: sql, params });
  controller.abort();
  assert.equal(calls[0].signal.aborted, true);
  await database.query('db', "SELECT '?'", { params: [] });
  assert.deepEqual(calls[1].body, { query: "SELECT '?'", params: [] });
  await database.query('db', 'SELECT 1');
  assert.deepEqual(calls[2].body, { query: 'SELECT 1' });
});

test('invalid query parameters are rejected before authentication without exposing values', async () => {
  const database = new Databases(credentialStack(async () => { assert.fail('invalid input must not cause network I/O'); }));
  for (const params of [null, 'secret-value', {}, [undefined], [NaN], [Infinity], [2 ** 53], [[1]], [{ secret: 'value' }], new Array(1)]) {
    await assert.rejects(database.query('db', 'SELECT ?', { params }), (error) => {
      assert.ok(error instanceof JustDeployValidationError);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
});

test('response body interruptions stay structured and never retry a write', async () => {
  for (const status of [200, 503]) {
    let writes = 0;
    const transport = credentialStack(async (input) => {
      if (String(input).endsWith('/auth/credential')) return session();
      writes += 1;
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error('secret-body-and-url')); } }), {
        status, headers: { 'x-request-id': 'body-request' },
      });
    });
    await assert.rejects(transport.organizationRequest('POST', '/databases/db/query', { body: { query: 'SELECT 1' } }), (error) => {
      assert.ok(error instanceof JustDeployError);
      assert.equal(error.status, status);
      assert.equal(error.requestId, 'body-request');
      assert.match(error.message, /API response could not be fully read/);
      assert.doesNotMatch(JSON.stringify(error), /secret-body-and-url/);
      return true;
    });
    assert.equal(writes, 1);
  }
});

test('caller deadlines and cancellation are distinguished for API and file requests', async () => {
  for (const [reason, expected] of [[new DOMException('private reason', 'TimeoutError'), /timed out/], [new Error('private reason'), /canceled/]]) {
    for (const phase of ['request', 'body', 'file']) {
      const signal = AbortSignal.abort(reason);
      const transport = credentialStack(async (input) => {
        if (String(input).endsWith('/auth/credential')) return session();
        if (phase !== 'body') throw reason;
        return new Response(new ReadableStream({ start(controller) { controller.error(reason); } }));
      });
      const promise = phase === 'file'
        ? transport.presigned('https://files.example.test/file', { method: 'PUT', signal })
        : transport.organizationRequest('POST', '/mails', { signal });
      await assert.rejects(promise, (error) => {
        assert.ok(error instanceof JustDeployError);
        assert.match(error.message, expected);
        assert.match(error.message, phase === 'file' ? /file transfer/ : /JustDeploy/);
        assert.doesNotMatch(error.message, /private reason/);
        return true;
      });
    }
  }
});

test('invalid JSON retains response diagnostics without exposing the body', async () => {
  const transport = credentialStack(async (input) => String(input).endsWith('/auth/credential')
    ? session()
    : new Response('secret non-JSON', { status: 502, headers: { 'x-request-id': 'invalid-json' } }));
  await assert.rejects(transport.organizationRequest('GET', '/databases'), (error) => {
    assert.ok(error instanceof JustDeployError);
    assert.equal(error.status, 502);
    assert.equal(error.requestId, 'invalid-json');
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});

test('authentication deadlines identify the authentication stage', async (t) => {
  t.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('private reason', 'TimeoutError')));
  for (const bodyFailure of [false, true]) {
    const auth = new AuthManager({ env: { JUSTDEPLOY_ACCESS_KEY: 'test', JUSTDEPLOY_SECRET_KEY: 'test' }, identityPath: '/does/not/exist', fetcher: async () => {
      if (!bodyFailure) throw new Error('private reason');
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error('private reason')); } }));
    } });
    await assert.rejects(auth.getSession(), (error) => error instanceof JustDeployAuthenticationError && error.message === 'JustDeploy authentication timed out.');
  }
});

test('exports work from ESM and CommonJS without doing network I/O', () => {
  assert.equal(typeof JustDeploy, 'function');
  assert.ok(new JustDeploy().databases);

  const require = createRequire(import.meta.url);
  const commonjs = require('../dist/cjs/index.js');
  assert.equal(typeof commonjs.JustDeploy, 'function');
  assert.ok(new commonjs.JustDeploy().storages);
});

test('credential exchange has priority and supplies the API session header', async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/auth/credential')) return session();
    return json({ databases: [] });
  };
  const databases = new Databases(credentialStack(fetcher));

  assert.deepEqual(await databases.list(), []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${API}/auth/credential`);
  assert.equal(header(calls[0].init, 'authorization'), 'Bearer ak_test:sk_test');
  assert.equal(calls[0].init.body, '{}');
  assert.equal(calls[1].url, `${API}/organizations/${ORG}/databases`);
  assert.equal(header(calls[1].init, 'authorization'), 'Bearer session-token');
  assert.equal(header(calls[1].init, 'x-justdeploy-sdk'), `javascript/${SDK_VERSION}`);
});

test('partial or empty local credentials fail and never fall back to identity', async () => {
  for (const env of [
    { JUSTDEPLOY_ACCESS_KEY: 'ak_test' },
    { JUSTDEPLOY_SECRET_KEY: 'sk_test' },
    { JUSTDEPLOY_ACCESS_KEY: '', JUSTDEPLOY_SECRET_KEY: 'sk_test' },
  ]) {
    const auth = new AuthManager({ env, identityPath: '/does/not/exist', fetcher: async () => session() });
    await assert.rejects(auth.getSession(), JustDeployAuthenticationError);
  }
});

test('build identity signs the exact request and selects its API origin', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'justdeploy-sdk-'));
  const path = join(directory, 'identity.json');
  const buildId = '123e4567-e89b-12d3-a456-426614174000';
  const origin = 'https://api.dev.justdeploy.test';
  const issuedAt = 1_800_000_000;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  writeFileSync(
    path,
    JSON.stringify({ protocolVersion: 1, buildId, privateKey: privateKeyDer.toString('base64'), apiBaseUrl: origin }),
    { mode: 0o444 },
  );
  chmodSync(path, 0o444);

  try {
    const fetcher = async (input, init) => {
      assert.equal(String(input), `${origin}/auth/build`);
      const body = JSON.parse(init.body);
      assert.deepEqual(body, { buildId, issuedAt });
      const signingInput = `justdeploy-build-auth-v1\n${origin}\nPOST\n/auth/build\n${buildId}\n${issuedAt}`;
      assert.equal(verify(null, Buffer.from(signingInput), publicKey, Buffer.from(header(init, 'x-justdeploy-build-signature'), 'base64url')), true);
      assert.equal(header(init, 'authorization'), null);
      return session('build-token');
    };
    const auth = new AuthManager({ env: {}, identityPath: path, fetcher, now: () => issuedAt * 1000 });
    const result = await auth.getSession();
    assert.equal(result.apiOrigin, origin);
    assert.equal(result.token, 'build-token');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('deployed credentials use the identity origin, while writable files and links are rejected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'justdeploy-sdk-'));
  const path = join(directory, 'identity.json');
  const link = join(directory, 'identity-link.json');
  const origin = 'https://api-dev.justdeploy.net';
  writeFileSync(path, JSON.stringify({ protocolVersion: 1, apiBaseUrl: origin }), { mode: 0o444 });
  chmodSync(path, 0o444);

  try {
    const auth = new AuthManager({
      env: { JUSTDEPLOY_ACCESS_KEY: 'ak_test', JUSTDEPLOY_SECRET_KEY: 'sk_test' },
      identityPath: path,
      fetcher: async (input) => {
        assert.equal(String(input), `${origin}/auth/credential`);
        return session();
      },
    });
    assert.equal((await auth.getSession()).apiOrigin, origin);

    chmodSync(path, 0o644);
    const writable = new AuthManager({ env: {}, identityPath: path, fetcher: async () => session() });
    await assert.rejects(writable.getSession(), JustDeployConfigurationError);

    chmodSync(path, 0o444);
    symlinkSync(path, link);
    const linked = new AuthManager({ env: {}, identityPath: link, fetcher: async () => session() });
    await assert.rejects(linked.getSession(), JustDeployConfigurationError);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('credential exchange failure does not fall back to the build identity', async () => {
  let calls = 0;
  const auth = new AuthManager({
    env: { JUSTDEPLOY_ACCESS_KEY: 'ak_bad', JUSTDEPLOY_SECRET_KEY: 'sk_bad' },
    identityPath: '/does/not/exist',
    fetcher: async () => {
      calls += 1;
      return json({ message: 'Rejected', retryAfter: 2, requestId: 'auth-request', reason: 'invalid' }, 401);
    },
  });
  await assert.rejects(auth.getSession(), (error) => {
    assert.ok(error instanceof JustDeployAuthenticationError);
    assert.equal(error.status, 401);
    assert.equal(error.retryAfter, 2);
    assert.equal(error.requestId, 'auth-request');
    assert.equal(error.details.reason, 'invalid');
    return true;
  });
  assert.equal(calls, 1);
});

test('concurrent token requests collapse and tokens refresh inside three minutes', async () => {
  let exchanges = 0;
  let now = 1_700_000_000_000;
  const fetcher = async () => {
    exchanges += 1;
    await Promise.resolve();
    return json({ token: `token-${exchanges}`, organizationId: ORG, expiresAt: new Date(now + 10 * 60_000).toISOString() });
  };
  const auth = new AuthManager({
    env: { JUSTDEPLOY_ACCESS_KEY: 'ak_test', JUSTDEPLOY_SECRET_KEY: 'sk_test' },
    identityPath: '/does/not/exist',
    fetcher,
    now: () => now,
  });

  const first = await Promise.all([auth.getSession(), auth.getSession(), auth.getSession()]);
  assert.equal(exchanges, 1);
  assert.ok(first.every((value) => value.token === 'token-1'));
  now += 7 * 60_000 + 1;
  assert.equal((await auth.getSession()).token, 'token-2');
  assert.equal(exchanges, 2);
});

test('one GET is replayed after 401, while a mutation is never replayed', async () => {
  let exchanges = 0;
  let getCalls = 0;
  const getFetcher = async (input) => {
    if (String(input).includes('/auth/')) return session(`token-${++exchanges}`);
    getCalls += 1;
    return getCalls === 1 ? json({ message: 'expired' }, 401) : json({ databases: [] });
  };
  const databases = new Databases(credentialStack(getFetcher));
  assert.deepEqual(await databases.list(), []);
  assert.equal(exchanges, 2);
  assert.equal(getCalls, 2);

  let mutationCalls = 0;
  const mutationFetcher = async (input) => {
    if (String(input).includes('/auth/')) return session();
    mutationCalls += 1;
    return json({ message: 'expired' }, 401);
  };
  const mutations = new Databases(credentialStack(mutationFetcher));
  await assert.rejects(mutations.query('database-id', 'SELECT 1'), (error) => error instanceof JustDeployError && error.status === 401);
  assert.equal(mutationCalls, 1);
});

test('database and mail methods use the exact API paths, bodies, and pagination', async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return session();
    if (url.endsWith('/query')) return json({ rows: [{ value: 1 }] });
    if (url.endsWith('/tables') && init.method === 'GET') return json({ tables: [] });
    if (url.endsWith('/tables') && init.method === 'POST') return json({ table: { name: 'orders', columns: [], comment: null } }, 201);
    if (url.includes('/tables/orders') && init.method === 'PUT') return json({ table: { name: 'orders', columns: [], comment: 'updated' } });
    if (url.includes('/tables/orders') && init.method === 'DELETE') return json({ table: 'orders' });
    if (url.endsWith('/mails') && init.method === 'POST') return json({ mail: { id: 'mail-id' } }, 201);
    if (url.includes('/mails?')) return json({ mails: [], nextCursor: null });
    if (url.endsWith('/mails/mail-id')) return json({ mail: { id: 'mail-id' } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const transport = credentialStack(fetcher);
  const databases = new Databases(transport);
  const mail = new MailClient(transport);

  assert.deepEqual(await databases.query('db/id', 'SELECT 1'), { rows: [{ value: 1 }] });
  await databases.listTables('db/id');
  await databases.createTable('db/id', { name: 'orders', columns: [] });
  await databases.updateTable('db/id', 'orders', { comment: 'updated' });
  await databases.deleteTable('db/id', 'orders');
  await mail.send({ sender: 'hello@example.com', to: 'user@example.net', subject: 'Hello', text: 'Hi', idempotencyKey: 'welcome-1' });
  await mail.list({ limit: 20, cursor: 42 });
  await mail.get('mail-id');

  const dataCalls = calls.slice(1);
  assert.equal(dataCalls[0].url, `${API}/organizations/${ORG}/databases/db%2Fid/query`);
  assert.deepEqual(JSON.parse(dataCalls[0].init.body), { query: 'SELECT 1' });
  assert.equal(dataCalls[5].url, `${API}/organizations/${ORG}/mails`);
  assert.equal(header(dataCalls[5].init, 'idempotency-key'), 'welcome-1');
  assert.deepEqual(JSON.parse(dataCalls[5].init.body), {
    from: 'hello@example.com',
    to: 'user@example.net',
    subject: 'Hello',
    text: 'Hi',
  });
  assert.equal(dataCalls[6].url, `${API}/organizations/${ORG}/mails?limit=20&cursor=42`);
});

test('browser upload preparation returns only PUT permission and never transfers bytes', async () => {
  const calls = [];
  const url = 'https://files.example.test/upload?signature=private';
  const storages = new Storages(credentialStack(async (input, init) => {
    if (String(input).endsWith('/auth/credential')) return session();
    calls.push({ url: String(input), body: JSON.parse(init.body), method: init.method });
    return json({ files: [{ id: `file-${calls.length}`, url, expiresAt: EXPIRY, status: 'pending', unexpected: 'not-for-browser' }] }, 201);
  }));
  const first = await storages.createUploadUrl('storage-id', { name: 'image.jpg', mime: 'image/jpeg' });
  assert.deepEqual(first, { fileId: 'file-1', url, method: 'PUT', headers: { 'content-type': 'image/jpeg' }, expiresAt: EXPIRY });
  assert.equal((await storages.createUploadUrl('storage-id', { name: 'image.jpg', mime: 'image/jpeg' })).fileId, 'file-2');
  assert.ok(calls.every((call) => call.url === `${API}/organizations/${ORG}/storages/storage-id/files` && call.method === 'POST'));
  assert.deepEqual(calls[0].body, { files: [{ name: 'image.jpg', mime: 'image/jpeg' }] });
});

test('browser upload does not guess expiry or retry preparation failures', async () => {
  for (const result of [null, { files: [] }, { files: [{ id: 'f', url: 'https://files.example.test/secret' }] }, { files: [{ id: 'f', url: 'https://files.example.test/secret', expiresAt: 'bad' }] }]) {
    let calls = 0;
    const storages = new Storages(credentialStack(async (input) => {
      if (String(input).endsWith('/auth/credential')) return session();
      calls += 1;
      return json(result);
    }));
    await assert.rejects(storages.createUploadUrl('storage', { name: 'file', mime: 'text/plain' }), (error) => error instanceof JustDeployError && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const storages = new Storages(credentialStack(async (input) => {
    if (String(input).endsWith('/auth/credential')) return session();
    calls += 1;
    return json({ message: 'expired' }, 401);
  }));
  await assert.rejects(storages.createUploadUrl('storage', { name: 'file', mime: 'text/plain' }), JustDeployError);
  assert.equal(calls, 1);
  const invalid = new Storages(credentialStack(async () => { assert.fail('invalid input must not authenticate'); }));
  await assert.rejects(invalid.createUploadUrl('storage', { name: '', mime: 'text/plain' }), JustDeployValidationError);
});

test('null authentication payload remains an authentication error', async () => {
  const auth = new AuthManager({ env: { JUSTDEPLOY_ACCESS_KEY: 'test', JUSTDEPLOY_SECRET_KEY: 'test' }, identityPath: '/does/not/exist', fetcher: async () => json(null) });
  await assert.rejects(auth.getSession(), JustDeployAuthenticationError);
});

test('presigned upload and download never receive JustDeploy authentication headers', async () => {
  const calls = [];
  const uploadUrl = 'https://uploads.example.test/object?signature=upload';
  const downloadUrl = 'https://files.example.test/object?signature=download';
  const file = {
    id: 'file-id', name: 'hello.txt', path: 'file-id', mime: 'text/plain', size: 5,
    status: 'active', error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return session();
    if (url.endsWith('/files') && init.method === 'POST') return json({ files: [{ ...file, size: 0, status: 'pending', url: uploadUrl, expiresAt: EXPIRY }] }, 201);
    if (url === uploadUrl) return new Response(null, { status: 200 });
    if (url.endsWith('/files/file-id')) return json({ file: { ...file, url: downloadUrl } });
    if (url === downloadUrl) return new Response('hello', { status: 200, headers: { 'content-type': 'text/plain', 'content-length': '5' } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const storages = new Storages(credentialStack(fetcher));

  const uploaded = await storages.upload('storage-id', { name: 'hello.txt', mime: 'text/plain', data: new TextEncoder().encode('hello') });
  assert.equal('url' in uploaded, false);
  assert.equal('expiresAt' in uploaded, false);
  assert.equal(uploaded.size, 5);
  assert.equal(uploaded.status, 'pending');
  const downloaded = await storages.download('storage-id', 'file-id');
  assert.equal(await new Response(downloaded.stream).text(), 'hello');
  assert.equal(downloaded.contentLength, 5);
  assert.equal('url' in downloaded.file, false);

  for (const target of calls.filter((call) => call.url === uploadUrl || call.url === downloadUrl)) {
    assert.equal(header(target.init, 'authorization'), null);
    assert.equal(header(target.init, 'x-justdeploy-sdk'), null);
  }
  const uploadCall = calls.find((call) => call.url === uploadUrl);
  assert.deepEqual([...new Headers(uploadCall.init.headers).keys()], ['content-length', 'content-type']);
  assert.equal(header(uploadCall.init, 'content-length'), '5');
});

test('canceling a download releases the source stream', async () => {
  const downloadUrl = 'https://files.example.test/object?signature=download';
  let canceled = false;
  const source = new ReadableStream({ cancel() { canceled = true; } });
  const fetcher = async (input) => {
    const url = String(input);
    if (url.includes('/auth/')) return session();
    if (url.endsWith('/files/file-id')) {
      return json({
        file: {
          id: 'file-id', name: 'file', path: 'file-id', mime: 'application/octet-stream', size: 0,
          status: 'active', error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', url: downloadUrl,
        },
      });
    }
    if (url === downloadUrl) return new Response(source);
    throw new Error(`Unexpected URL ${url}`);
  };

  const downloaded = await new Storages(credentialStack(fetcher)).download('storage-id', 'file-id');
  assert.equal(source.locked, true);
  await downloaded.stream.cancel();
  assert.equal(source.locked, false);
  assert.equal(canceled, true);
});

test('downloading a pending file explains the upload race', async () => {
  const downloadUrl = 'https://files.example.test/object?signature=download';
  const fetcher = async (input) => {
    const url = String(input);
    if (url.includes('/auth/')) return session();
    if (url.endsWith('/files/file-id')) {
      return json({
        file: {
          id: 'file-id', name: 'file', path: 'file-id', mime: 'application/octet-stream', size: 0,
          status: 'pending', error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', url: downloadUrl,
        },
      });
    }
    if (url === downloadUrl) return new Response(null, { status: 404 });
    throw new Error(`Unexpected URL ${url}`);
  };

  await assert.rejects(
    new Storages(credentialStack(fetcher)).download('storage-id', 'file-id'),
    (error) => error.status === 404 && error.message === 'The file upload has not finished yet. Try the download again shortly.',
  );
});

test('stream upload requires and forwards an exact byte size before creating a file record', async () => {
  const calls = [];
  const uploadUrl = 'https://uploads.example.test/object?signature=upload';
  const file = {
    id: 'file-id', name: 'hello.txt', path: 'file-id', mime: 'text/plain', size: 0,
    status: 'pending', error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', url: uploadUrl,
  };
  const fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return session();
    if (url.endsWith('/files')) return json({ files: [file] }, 201);
    if (url === uploadUrl) {
      assert.equal(header(init, 'content-length'), '5');
      assert.equal(await new Response(init.body).text(), 'hello');
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const storages = new Storages(credentialStack(fetcher));

  const missingSize = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('hello')); controller.close(); } });
  await assert.rejects(
    storages.upload('storage-id', { name: 'hello.txt', mime: 'text/plain', data: missingSize }),
    (error) => error instanceof JustDeployValidationError && /size is required/.test(error.message),
  );
  assert.equal(calls.length, 0);

  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('hello')); controller.close(); } });
  const uploaded = await storages.upload('storage-id', { name: 'hello.txt', mime: 'text/plain', data: stream, size: 5 });
  assert.equal(uploaded.size, 5);
  assert.equal(calls.length, 3);
});

test('failed upload removes its pending file record and preserves the transfer error', async () => {
  const calls = [];
  const uploadUrl = 'https://uploads.example.test/object?signature=upload';
  const file = {
    id: 'file-id', name: 'hello.txt', path: 'file-id', mime: 'text/plain', size: 0,
    status: 'pending', error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', url: uploadUrl,
  };
  const fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init.method });
    if (url.includes('/auth/')) return session();
    if (url.endsWith('/files')) return json({ files: [file] }, 201);
    if (url === uploadUrl) return new Response(null, { status: 501 });
    if (url.endsWith('/files/file-id') && init.method === 'DELETE') return new Response(null, { status: 200 });
    throw new Error(`Unexpected URL ${url}`);
  };
  const storages = new Storages(credentialStack(fetcher));

  await assert.rejects(
    storages.upload('storage-id', { name: 'hello.txt', mime: 'text/plain', data: new TextEncoder().encode('hello') }),
    (error) => error instanceof JustDeployError && error.status === 501,
  );
  assert.deepEqual(calls.map(({ method }) => method), ['POST', 'POST', 'PUT', 'DELETE']);
});

test('structured errors retain safe API fields without retaining request bodies', async () => {
  const secretSql = "SELECT 'private-value'";
  const fetcher = async (input) => {
    if (String(input).includes('/auth/')) return session();
    return json({ status: 503, message: 'Database is temporarily unavailable.', retryAfter: 2, requestId: 'request-1', reason: 'busy' }, 503);
  };
  const databases = new Databases(credentialStack(fetcher));
  await assert.rejects(databases.query('database-id', secretSql), (error) => {
    assert.ok(error instanceof JustDeployError);
    assert.equal(error.status, 503);
    assert.equal(error.retryAfter, 2);
    assert.equal(error.requestId, 'request-1');
    assert.equal(error.details.reason, 'busy');
    assert.equal(JSON.stringify(error).includes(secretSql), false);
    return true;
  });
});
