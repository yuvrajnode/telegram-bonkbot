// tsc only emits JS, so the .sql migrations need a lift into dist/.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'src', 'db', 'migrations');
const to = path.join(root, 'dist', 'db', 'migrations');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
process.stdout.write(`copied migrations -> ${path.relative(root, to)}\n`);
