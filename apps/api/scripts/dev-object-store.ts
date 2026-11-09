/**
 * Disk-backed S3 double for laptops without Docker:  npm run dev:storage   (port 9100)
 * Point the API at it with S3_ENDPOINT=http://127.0.0.1:9100 S3_BUCKET=bmstore S3_FORCE_PATH_STYLE=1
 * S3_PUBLIC_BASE_URL=http://localhost:9100/bmstore (any access key / secret). Objects live in apps/api/.dev-storage.
 * Not for production: no auth, no listing. docker compose brings real MinIO; R2/S3 in production.
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const PORT = Number(process.env.DEV_STORAGE_PORT ?? 9100);
const ROOT = join(__dirname, '..', '.dev-storage');
mkdirSync(ROOT, { recursive: true });
const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', avif: 'image/avif' };

createServer((req, res) => {
  const key = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.replace(/^\//, ''));
  const file = normalize(join(ROOT, key));
  if (!file.startsWith(ROOT) || !key) { res.writeHead(400); return res.end(); }
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.method === 'PUT') {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      writeFileSync(`${file}.type`, String(req.headers['content-type'] ?? TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream'));
      res.writeHead(200, { ETag: '"dev"' }); return res.end();
    }
    if (req.method === 'DELETE') { rmSync(file, { force: true }); rmSync(`${file}.type`, { force: true }); res.writeHead(204); return res.end(); }
    if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
    const data = readFileSync(file);
    const type = existsSync(`${file}.type`) ? readFileSync(`${file}.type`, 'utf8') : TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Length': String(data.length), 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*', 'Last-Modified': new Date().toUTCString(), ETag: '"dev"' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`dev object store on http://127.0.0.1:${PORT}  (files in ${ROOT})`));
