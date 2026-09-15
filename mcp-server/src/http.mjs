#!/usr/bin/env node
/* Office use: the server runs in one place, each colleague connects their own
   Claude to it with their own token. */
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer } from './tools.mjs';
import { buildPlainDocx, fileNameOfPlain, PlainDocumentInput } from './plain-doc.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const TTL_MS = Number(process.env.FILE_TTL_MINUTES || 30) * 60_000;

/* "somchai:tok_xxx,malee:tok_yyy" — one token per person, so a leaked token can
   be withdrawn without disturbing anyone else. */
function readTokens() {
  const raw = process.env.JURATOOLS_TOKENS || '';
  const map = new Map();
  for (const pair of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const i = pair.indexOf(':');
    if (i < 1) continue;
    map.set(pair.slice(i + 1).trim(), pair.slice(0, i).trim());
  }
  return map;
}

const TOKENS = readTokens();
if (!TOKENS.size) {
  console.error('Refusing to start: set JURATOOLS_TOKENS="name:token,name:token" first.');
  process.exit(1);
}

/* Generated documents carry client names and addresses, so they are held in
   memory and expire — nothing a colleague generates is left on the server's
   disk for someone to find later. */
const files = new Map();
const sweep = () => {
  const now = Date.now();
  for (const [id, f] of files) if (now - f.at > TTL_MS) files.delete(id);
};
setInterval(sweep, 60_000).unref();

/* Behind a proxy (Tailscale, a PaaS router) the Host header is the public name
   while the server itself listens on loopback, so both have to be allowed or
   every request is turned away as a rebinding attempt. */
const allowedHosts = PUBLIC_URL
  ? [new URL(PUBLIC_URL).host, 'localhost', '127.0.0.1', `localhost:${PORT}`, `127.0.0.1:${PORT}`]
  : undefined;
const app = createMcpExpressApp({ host: HOST, allowedHosts });

/* Render (and any PaaS router) terminates TLS at the edge and forwards plain
   HTTP to the container, so without this req.protocol always reports "http" —
   a download link built from it would read https:// on the way in and come
   back http:// in the reply. PUBLIC_URL below is the authoritative fix; this
   is the fallback for a deploy that forgets to set it. */
app.set('trust proxy', true);

app.use((req, res, next) => {
  if (req.path.startsWith('/files/') || req.path === '/health' || req.path === '/openapi.json') return next();
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const user = token && TOKENS.get(token);
  if (!user) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'a valid bearer token is required' });
  }
  req.user = user;
  next();
});

/* Shared by the MCP transport and the plain REST action below — the same
   in-memory, TTL'd, unguessable-link delivery either way. */
function makeDeliver(base) {
  return async (name, buf) => {
    sweep();
    const id = randomUUID();
    files.set(id, { name, buf, at: Date.now() });
    const minutes = Math.round(TTL_MS / 60_000);
    const location = `${base}/files/${id}/${encodeURIComponent(name)}.docx`;
    return { message: `Download it within ${minutes} minutes: ${location}`, location };
  };
}

app.post('/mcp', async (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const deliver = makeDeliver(base);

  /* A server per request: nothing one colleague sends can end up in another's
     session, and there is no session state to lose when a container restarts. */
  const server = createMcpServer({ deliver, user: req.user });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('request failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'internal error' });
  }
});

const noSessions = (_req, res) => res.status(405).json({ error: 'this server is stateless; POST /mcp only' });
app.get('/mcp', noSessions);
app.delete('/mcp', noSessions);

/* A plain REST twin of create_plain_document, for callers that speak OpenAPI
   Actions rather than MCP (ChatGPT's Custom GPTs, as of when this was written,
   fall in that category). Same bearer auth, same delivery, same engine —
   only the transport differs. */
app.post('/actions/plain-document', async (req, res) => {
  let args;
  try {
    args = PlainDocumentInput.parse(req.body);
  } catch (err) {
    return res.status(400).json({ error: 'invalid request', details: err.issues?.map(i => i.message) ?? [String(err)] });
  }

  try {
    const buf = await buildPlainDocx(args);
    const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const delivery = await makeDeliver(base)(fileNameOfPlain(args), buf);
    if (req.user) {
      console.error(`[${new Date().toISOString()}] ${req.user} created a plain document via Action: ${args.title || 'untitled'}`);
    }
    res.json({ location: delivery.location, fileSizeKB: Math.round(buf.length / 1024) });
  } catch (err) {
    console.error('plain-document action failed:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

/* The schema a Custom GPT Action imports. Served unauthenticated, like any
   API's own published spec — it describes the shape of the door, not what is
   behind it. */
app.get('/openapi.json', async (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const spec = JSON.parse(await readFile(join(root, 'openapi', 'plain-document.json'), 'utf8'));
  spec.servers = [{ url: base }];
  res.json(spec);
});

/* The link is the capability: a browser following it cannot send the bearer
   token, so the unguessable id and the short life are what protect the file. */
app.get('/files/:id/:name', (req, res) => {
  const f = files.get(req.params.id);
  if (!f || Date.now() - f.at > TTL_MS) {
    files.delete(req.params.id);
    return res.status(404).send('This link has expired. Ask Claude to generate the document again.');
  }
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name + '.docx')}`,
    'Cache-Control': 'no-store'
  });
  res.send(f.buf);
});

app.get('/health', (_req, res) => res.json({ ok: true, people: TOKENS.size, pending: files.size }));

app.listen(PORT, HOST, () => {
  console.error(`juratools-share-docs on http://${HOST}:${PORT}/mcp — ${TOKENS.size} tokens loaded`);
});
