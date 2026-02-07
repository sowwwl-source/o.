import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_ROOT = path.resolve(__dirname, '..', 'sowwwl-front');

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '127.0.0.1';
const API_ORIGIN = process.env.API_ORIGIN || 'https://api.sowwwl.com';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
]);

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeDecodePath(urlPath) {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return urlPath;
  }
}

function stripQuery(url) {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function injectLiveReload(html) {
  const snippet =
    '\n<script>(function(){try{window.__O_PREVIEW__=true;var es=new EventSource("/__dev/events");es.onmessage=function(){location.reload();};}catch(e){}})();</script>\n';
  // Prefer <head> so the __O_PREVIEW__ flag is available to body scripts.
  if (html.includes('</head>')) return html.replace('</head>', `${snippet}</head>`);
  if (html.includes('</body>')) return html.replace('</body>', `${snippet}</body>`);
  return html + snippet;
}

function stripApiPrefix(urlPath) {
  // "/api/health" -> "/health"
  if (urlPath === '/api') return '/';
  if (urlPath === '/api/') return '/';
  return urlPath.startsWith('/api/') ? urlPath.slice(4) : urlPath;
}

function rewriteSetCookie(setCookie) {
  if (!setCookie) return setCookie;
  const items = Array.isArray(setCookie) ? setCookie : [setCookie];
  return items.map((c) =>
    String(c)
      .replace(/;\s*Secure/gi, '') // allow cookies over http://localhost
      .replace(/;\s*Domain=[^;]+/gi, ''), // keep host-only
  );
}

function proxyApi(req, res) {
  const urlPath = stripQuery(req.url || '/');
  const targetPath = stripApiPrefix(urlPath);

  const target = new URL(API_ORIGIN);
  const requestOptions = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: targetPath + (req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
    headers: {
      ...req.headers,
      host: target.host,
      'accept-encoding': 'identity',
      connection: 'close',
    },
  };

  // Node adds "transfer-encoding" on its own when piping; avoid conflicting length.
  delete requestOptions.headers['content-length'];

  const client = target.protocol === 'https:' ? https : http;
  const upstream = client.request(requestOptions, (up) => {
    const headers = { ...up.headers };
    if (headers['set-cookie']) headers['set-cookie'] = rewriteSetCookie(headers['set-cookie']);
    res.writeHead(up.statusCode || 502, headers);
    up.pipe(res);
  });

  upstream.on('error', (e) => {
    send(res, 502, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ error: 'proxy_failed', detail: String(e?.message || e) }));
  });

  req.pipe(upstream);
}

async function serveFile(urlPath, res) {
  let rel = safeDecodePath(urlPath);
  rel = stripQuery(rel);

  if (rel === '/') rel = '/index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  const abs = path.resolve(SITE_ROOT, '.' + rel);
  if (!abs.startsWith(SITE_ROOT + path.sep)) {
    send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'Bad request');
    return;
  }

  try {
    const st = await stat(abs);
    if (!st.isFile()) throw new Error('not_file');

    const ext = path.extname(abs).toLowerCase();
    const ct = MIME.get(ext) || 'application/octet-stream';

    if (ext === '.html') {
      const raw = await readFile(abs, 'utf8');
      const body = injectLiveReload(raw);
      send(res, 200, { 'content-type': ct, 'cache-control': 'no-store' }, body);
      return;
    }

    const body = await readFile(abs);
    send(res, 200, { 'content-type': ct, 'cache-control': 'no-store' }, body);
  } catch {
    // 404 fallback
    try {
      const p404 = path.resolve(SITE_ROOT, '404.html');
      const raw = await readFile(p404, 'utf8');
      const body = injectLiveReload(raw);
      send(res, 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body);
    } catch {
      send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
    }
  }
}

const sseClients = new Set();
let pendingReload = null;

function broadcastReload() {
  for (const res of sseClients) {
    try {
      res.write('data: reload\n\n');
    } catch {}
  }
}

function debounceReload() {
  if (pendingReload) clearTimeout(pendingReload);
  pendingReload = setTimeout(() => {
    pendingReload = null;
    broadcastReload();
  }, 120);
}

// Watch static files and trigger reload
try {
  watch(
    SITE_ROOT,
    { recursive: true },
    (eventType, filename) => {
      if (!filename) return;
      const ext = path.extname(String(filename)).toLowerCase();
      if (!['.html', '.css', '.js', '.mjs', '.json', '.svg'].includes(ext)) return;
      debounceReload();
    },
  );
} catch {
  // Ignore watcher errors; manual refresh still works.
}

const server = http.createServer(async (req, res) => {
  const urlPath = stripQuery(req.url || '/');

  if (urlPath === '/__dev/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (urlPath === '/__dev/ping') {
    send(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: true }));
    return;
  }

  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  await serveFile(urlPath, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-web] root: ${SITE_ROOT}`);
  console.log(`[dev-web] site: http://${HOST}:${PORT}`);
  console.log(`[dev-web] api : http://${HOST}:${PORT}/api/health -> ${API_ORIGIN}/health`);
  console.log(`[dev-web] live reload: enabled (SSE)`);
});
