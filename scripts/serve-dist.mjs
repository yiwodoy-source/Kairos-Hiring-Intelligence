import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const rootDir = new URL('../dist/', import.meta.url);
const port = Number(process.env.FRONTEND_PORT || 3003);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const cacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
};

function getFileUrl(requestPath) {
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const relativePath = safePath === '/' ? 'index.html' : safePath.replace(/^[/\\]/, '');
  return new URL(relativePath, rootDir);
}

const server = createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let fileUrl = getFileUrl(requestUrl.pathname);

  if (!existsSync(fileUrl) || (existsSync(fileUrl) && statSync(fileUrl).isDirectory())) {
    fileUrl = new URL('index.html', rootDir);
  }

  if (!existsSync(fileUrl)) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...cacheHeaders
    });
    res.end('Not found');
    return;
  }

  const ext = extname(fileUrl.pathname);
  const type = contentTypes[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    ...cacheHeaders
  });
  createReadStream(fileUrl).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Static dist server running on http://localhost:${port}`);
});
