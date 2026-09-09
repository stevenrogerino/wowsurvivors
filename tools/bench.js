#!/usr/bin/env node
/* The tuning bench server.
 *
 *   node tools/bench.js            then open http://localhost:8770
 *   (or double-click bench.bat on Windows)
 *
 * It serves the repository so the bench page can run the real game in a frame
 * beside the controls, and it accepts exactly one write: the bench posting a
 * new src/data/tuning.js. That is the whole API. Nothing here takes a path
 * from the client, so there is no request that can make it write anywhere
 * else.
 *
 * It binds to 127.0.0.1 only, and refuses a POST whose Origin is not this
 * server - a page on the open internet must not be able to reach a tool that
 * writes files, and a browser will happily send it one if nothing says no.
 *
 * No dependencies, because the game has none and a balance tool is not the
 * place to start.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BENCH = path.join(__dirname, 'bench');
const TUNING = path.join(ROOT, 'src', 'data', 'tuning.js');
const CHANGELOG = path.join(ROOT, 'CHANGELOG-BALANCE.md');
const HOST = '127.0.0.1';
const PORT = +(process.env.PORT || process.argv[2] || 8770);
const MAX_BODY = 4 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/** A path is served only if it resolves to a real file inside the repository. */
function resolveInside(base, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.resolve(base, rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

/** The tuning file, rendered from a plain object. This is the one thing the
 *  bench writes, and it has to come back out through the game's own script
 *  loader, so it is emitted as source rather than JSON. */
function renderTuning(overrides, savedAt) {
  const keys = Object.keys(overrides).sort();
  const lines = keys.map((k) =>
    `      ${JSON.stringify(k)}: ${JSON.stringify(overrides[k])},`);
  return `/* Local tuning overrides. WRITTEN BY THE TUNING BENCH - edit by hand if you
 * like, but expect the bench to rewrite the whole file when you save.
 *
 *   node tools/bench.js        (or double-click bench.bat on Windows)
 *
 * Shipped values live in the other data files and are never touched. Each key
 * below is a dotted path applied over the top of them at load; delete a line
 * and that value goes back to what the game ships. An empty list here means
 * the game is running exactly as it shipped.
 *
 * See src/data/tuning-apply.js for what a path may point at.
 */
'use strict';
(function (WS) {

  WS.Tuning = {
    savedAt: ${JSON.stringify(savedAt)},
    overrides: {
${lines.join('\n')}${lines.length ? '\n' : ''}    },
  };

})(window.WS);
`;
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type || 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;

  if (req.method === 'POST' && p === '/api/save') {
    /* A browser will send a cross-site POST without being asked. This tool
     * writes to the repository, so anything that did not come from the bench
     * page itself is refused outright. */
    const origin = req.headers.origin;
    if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) {
      return send(res, 403, 'refused: this endpoint only answers the bench page');
    }
    let body = '', tooBig = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return send(res, 413, 'that is far too much tuning');
      let payload;
      try { payload = JSON.parse(body); } catch (e) {
        return send(res, 400, 'could not read that as JSON');
      }
      const overrides = payload && payload.overrides;
      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return send(res, 400, 'expected an "overrides" object');
      }
      const savedAt = new Date().toISOString();
      try {
        fs.writeFileSync(TUNING, renderTuning(overrides, savedAt), 'utf8');
        let logged = false;
        const notes = typeof payload.markdown === 'string' ? payload.markdown.trim() : '';
        if (notes) {
          const head = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8')
            : '# Balance changelog\n\nWritten by the tuning bench, newest first.\n';
          const marker = '\n<!-- new entries go directly below -->\n';
          const body2 = head.includes(marker) ? head.replace(marker, marker + '\n' + notes + '\n')
            : head.trimEnd() + '\n' + marker + '\n' + notes + '\n';
          fs.writeFileSync(CHANGELOG, body2, 'utf8');
          logged = true;
        }
        const n = Object.keys(overrides).length;
        console.log(`saved ${n} override${n === 1 ? '' : 's'} -> src/data/tuning.js`
          + (logged ? ' (+ CHANGELOG-BALANCE.md)' : ''));
        send(res, 200, JSON.stringify({ ok: true, count: n, savedAt, logged }),
          'application/json; charset=utf-8');
      } catch (e) {
        console.error('save failed:', e.message);
        send(res, 500, JSON.stringify({ ok: false, error: e.message }),
          'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'only GET and the one POST');
  }

  // The bench itself at the root; everything else is the repository, so the
  // frame runs the real game from the real source files.
  let file;
  if (p === '/') file = path.join(BENCH, 'index.html');
  else if (p.startsWith('/bench/')) file = resolveInside(BENCH, p.slice('/bench/'.length));
  else file = resolveInside(ROOT, p);
  if (!file) return send(res, 403, 'not somewhere this server serves from');
  let stat;
  try { stat = fs.statSync(file); } catch (e) { return send(res, 404, 'not found'); }
  if (stat.isDirectory()) {
    file = path.join(file, 'index.html');
    try { fs.statSync(file); } catch (e) { return send(res, 404, 'not found'); }
  }
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  The Ember Watch - tuning bench');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  Everything runs on this machine. Leave this window open while you tune;');
  console.log('  close it when you are done.');
  console.log('');
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already busy - another bench may still be running.`);
    console.error(`Close it, or start this one on a different port:  node tools/bench.js 8771`);
    process.exit(1);
  }
  throw e;
});
