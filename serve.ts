// Solmar Bay — local play server.
//
// A no-dependency dev server for trying the game in a desktop browser:
// `node serve.ts` puts the game folder on http://localhost:8080, and
// `node serve.ts --port 9000` picks another port instead. It only ever
// hands out files from inside game/, answers with the content type each
// file needs, and never reaches the wider internet. Nothing here is
// meant for production hosting — it is a convenience for playtesting.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The folder we are allowed to serve, resolved once at startup.
const gameDir = resolve(fileURLToPath(new URL('./game', import.meta.url)));

// Which port to listen on: --port N when given, 8080 when not, and 8080
// again when the value given is not a usable port number.
const cliArgs = process.argv.slice(2);
const portFlag = cliArgs.indexOf('--port');
const wanted = portFlag === -1 ? 8080 : Number(cliArgs[portFlag + 1]);
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;

// Content types for the kinds of files a browser game actually loads.
// Anything unlisted falls back to a generic binary type below.
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = createServer((req, res) => {
  const rawUrl = new URL(req.url ?? '/', 'http://localhost');
  let path: string;
  try {
    path = decodeURIComponent(rawUrl.pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  // A bare directory means its index page.
  if (path.endsWith('/')) path += 'index.html';

  // Resolve the requested file and refuse anything that escapes game/.
  const target = resolve(join(gameDir, normalize(path)));
  if (target !== gameDir && !target.startsWith(gameDir + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  let bytes: number;
  try {
    const info = statSync(target);
    if (!info.isFile()) throw new Error('not a file');
    bytes = info.size;
  } catch {
    res.writeHead(404).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': types[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': bytes,
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Solmar Bay is on http://localhost:${port}`);
});
