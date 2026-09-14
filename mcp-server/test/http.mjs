import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8911;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'tok_test_somchai';

const child = spawn(process.execPath, [join(root, 'src', 'http.mjs')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    JURATOOLS_TOKENS: `somchai:${TOKEN},malee:tok_test_malee`
  },
  stdio: ['ignore', 'inherit', 'inherit']
});

const stop = () => child.kill();
process.on('exit', stop);

for (let i = 0; ; i++) {
  try { await fetch(`${BASE}/health`); break; }
  catch { if (i > 100) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 100)); }
}

const anon = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
});
assert.equal(anon.status, 401, 'no token is refused');

const wrong = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer nope' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
});
assert.equal(wrong.status, 401, 'an unknown token is refused');

const client = new Client({ name: 'http-smoke', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } }
}));

const { tools } = await client.listTools();
assert.equal(tools[0].name, 'create_share_transfer_instrument');

const res = await client.callTool({
  name: 'create_share_transfer_instrument',
  arguments: {
    company: { nameThai: 'บริษัท ตัวอย่าง จำกัด' },
    transferor: { nameThai: 'นายสมชาย ใจดี', date: '2026-09-12' },
    transferee: { nameThai: 'นางสาวสมหญิง รักไทย', date: '2026-09-12' },
    shares: { count: 25000, parValue: 10, stampDutyLine: true }
  }
});

const text = res.content.map(c => c.text).join('\n');
const url = text.match(/(http:\/\/\S+\.docx)/)?.[1];
assert.ok(url, `a download link is returned — got: ${text}`);
assert.ok(text.includes('250 baht on the Original'), 'duty is reported');
assert.equal(res.structuredContent?.location, url, 'structuredContent.location matches the link in the text');

const dl = await fetch(url);
assert.equal(dl.status, 200);
assert.match(dl.headers.get('content-type'), /wordprocessingml\.document/);
assert.match(dl.headers.get('content-disposition'), /filename\*=UTF-8''/);
const buf = Buffer.from(await dl.arrayBuffer());
assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'the link serves a real .docx');

const missing = await fetch(`${BASE}/files/00000000-0000-0000-0000-000000000000/x.docx`);
assert.equal(missing.status, 404, 'an unknown id is not served');

await client.close();
stop();
console.log(`ok — HTTP round trip, ${(buf.length / 1024).toFixed(0)} KB served over a one-time link`);
