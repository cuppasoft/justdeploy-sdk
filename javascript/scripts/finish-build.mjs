import { mkdir, writeFile } from 'node:fs/promises';

const commonjsDirectory = new URL('../dist/cjs/', import.meta.url);
await mkdir(commonjsDirectory, { recursive: true });
await writeFile(new URL('package.json', commonjsDirectory), '{"type":"commonjs"}\n');
