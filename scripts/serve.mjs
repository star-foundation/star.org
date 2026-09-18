#!/usr/bin/env node
/** 本地预览 _site/（仅用于验收，不参与线上架构）。用法：node scripts/serve.mjs [port] */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/config.mjs';

const port = Number(process.argv[2] || process.env.PORT || 4321);
const root = PATHS.out;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, url);
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) {
    const notFound = path.join(root, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`预览地址：http://127.0.0.1:${port}/`);
});
