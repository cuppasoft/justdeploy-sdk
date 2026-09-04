import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = process.env.RELEASE_VERSION;
assert.match(version ?? '', /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'RELEASE_VERSION must be a stable version.');
const action = process.argv[2];
assert.ok(['version', 'prepare', 'verify'].includes(action), 'Expected version, prepare, or verify.');
const npmVersion = JSON.parse(await readFile(`${root}/javascript/package.json`, 'utf8')).version;
const jsVersion = (await readFile(`${root}/javascript/src/version.ts`, 'utf8')).match(/SDK_VERSION = '([^']+)'/)[1];
const pyVersion = (await readFile(`${root}/python/src/justdeploy/_version.py`, 'utf8')).match(/__version__ = "([^"]+)"/)[1];
for (const actual of [npmVersion, jsVersion, pyVersion]) assert.equal(actual, version, 'Requested version must match both SDKs.');
if (action === 'version') {
  console.info(`Both SDKs match approved version ${version}.`);
  process.exit(0);
}

const paths = [`npm/justdeploy-sdk-${version}.tgz`, `pypi/justdeploy_sdk-${version}-py3-none-any.whl`, `pypi/justdeploy_sdk-${version}.tar.gz`];
const files = [];
for (const path of paths) {
  const filename = `${root}/release/${path}`;
  const bytes = await readFile(filename);
  if (action === 'prepare') {
    const zip = path.endsWith('.whl');
    const program = zip ? 'unzip' : 'tar';
    const entries = execFileSync(program, zip ? ['-Z1', filename] : ['-tzf', filename], {encoding: 'utf8'}).trim().split('\n').filter(entry => !entry.endsWith('/'));
    assert.ok(entries.some(entry => /(?:^|\/)(?:LICENSE|licenses\/LICENSE)$/.test(entry)), `${path}: license missing`);
    assert.ok(entries.some(entry => /(?:\.d\.ts|py\.typed)$/.test(entry)), `${path}: type information missing`);
    for (const entry of entries) {
      assert.ok(!entry.startsWith('/') && !entry.split('/').includes('..'), `${path}: unsafe archive path`);
      assert.ok(!/(?:^|\/)(?:\.env[^/]*|identity\.json|node_modules|\.venv|tests?)(?:\/|$)/.test(entry), `${path}: private file in archive`);
      const content = execFileSync(program, zip ? ['-p', filename, entry] : ['-xOf', filename, entry], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
      assert.ok(!/\b(?:ak_|sk_|npm_|pypi-)[A-Za-z0-9_-]{30,}/.test(content), `${path}: possible credential`);
      assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{20}/.test(content), `${path}: possible private key`);
    }
  }
  files.push({path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}

if (action === 'prepare') {
  await writeFile(`${root}/release/SHA256SUMS`, files.map(file => `${file.sha256}  ${file.path}\n`).join(''));
  console.info(JSON.stringify({version, files}, null, 2));
} else {
  async function get(url) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(30000), headers: {'Cache-Control': 'no-cache'}});
      if (response.status === 200) return response;
      // A new version can take a short time to appear on a registry's download hosts.
      if (attempt < 5 && [404, 429, 500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        await setTimeout(5000);
        continue;
      }
      throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
    }
  }
  const npm = await (await get(`https://registry.npmjs.org/@justdeploy%2fsdk/${version}`)).json();
  const pypi = await (await get(`https://pypi.org/pypi/justdeploy-sdk/${version}/json`)).json();
  assert.equal(npm.name, '@justdeploy/sdk');
  assert.equal(npm.version, version);
  assert.equal(pypi.info.name, 'justdeploy-sdk');
  assert.equal(pypi.info.version, version);
  assert.equal(pypi.urls.length, 2);
  const urls = [npm.dist.tarball, ...paths.slice(1).map(path => {
    const file = pypi.urls.find(file => file.filename === path.split('/').at(-1));
    assert.ok(file && !file.yanked, `${path}: missing or yanked`);
    return file.url;
  })];
  for (let index = 0; index < files.length; index += 1) {
    const url = new URL(urls[index]);
    assert.equal(url.protocol, 'https:');
    assert.ok(['registry.npmjs.org', 'files.pythonhosted.org'].includes(url.hostname));
    const bytes = Buffer.from(await (await get(url)).arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), files[index].sha256, 'Published file differs from tested archive.');
  }
  console.info(`npm and PyPI ${version}: all three anonymous downloads match the tested archives.`);
}
