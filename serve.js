/**
 * Servidor estático mínimo para previsualizar dist/ en local.
 *   node serve.js            → http://localhost:4321
 *   node serve.js 8080       → puerto personalizado
 * Sin dependencias.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.argv[2]) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(ROOT)) {
  console.error('No existe dist/. Ejecuta primero:  node build.js');
  process.exit(1);
}

http
  .createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p><a href="/">Volver al inicio</a></p>');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Recetario en  http://localhost:${PORT}`);
  });
