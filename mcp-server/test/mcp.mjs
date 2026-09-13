import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(join(tmpdir(), 'jt-mcp-'));

const client = new Client({ name: 'smoke-client', version: '0.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'src', 'server.mjs')],
  env: { ...process.env, JURATOOLS_OUT_DIR: out }
}));

const { tools } = await client.listTools();
assert.equal(tools.length, 1);
assert.equal(tools[0].name, 'create_share_transfer_instrument');
assert.ok(tools[0].inputSchema.properties.transferor, 'transferor is part of the published schema');

const res = await client.callTool({
  name: 'create_share_transfer_instrument',
  arguments: {
    company: { nameThai: 'บริษัท ตัวอย่าง จำกัด', nameEnglish: 'EXAMPLE CO., LTD.' },
    transferor: { nameThai: 'นายสมชาย ใจดี', nameEnglish: 'Mr. Somchai Jaidee', date: '2026-09-12' },
    transferee: { nameThai: 'นางสาวสมหญิง รักไทย', nameEnglish: 'Miss Somying Rakthai', date: '2026-09-12' },
    shares: { count: 25000, numbersFrom: 1, numbersTo: 25000, parValue: 10, stampDutyLine: true }
  }
});

const text = res.content.map(c => c.text).join('\n');
assert.ok(/Saved to .*\.docx/.test(text), 'reports where it saved the file');
assert.ok(text.includes('250 baht on the Original'), 'reports the computed duty');
assert.ok(text.includes('Draft only'), 'flags the document as a draft for review');

const files = await readdir(out);
assert.equal(files.length, 1);
assert.ok(files[0].endsWith('.docx'));

/* The same instrument twice must not overwrite the first one. */
await client.callTool({
  name: 'create_share_transfer_instrument',
  arguments: {
    company: { nameThai: 'บริษัท ตัวอย่าง จำกัด' },
    transferor: { nameThai: 'นายสมชาย ใจดี', date: '2026-09-12' },
    transferee: { nameThai: 'นางสาวสมหญิง รักไทย', date: '2026-09-12' },
    shares: { count: 25000, parValue: 10 }
  }
});
assert.equal((await readdir(out)).length, 2, 'a second call lands beside the first');

await client.close();
console.log(`ok — MCP round trip, ${files[0]}`);
