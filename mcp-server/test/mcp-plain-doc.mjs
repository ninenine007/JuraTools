import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(join(tmpdir(), 'jt-mcp-plain-'));

const client = new Client({ name: 'plain-doc-client', version: '0.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'src', 'server.mjs')],
  env: { ...process.env, JURATOOLS_OUT_DIR: out }
}));

const { tools } = await client.listTools();
const plainTool = tools.find(t => t.name === 'create_plain_document');
assert.ok(plainTool, 'create_plain_document is registered');
assert.ok(plainTool.outputSchema?.properties?.location, 'an outputSchema is published');

const res = await client.callTool({
  name: 'create_plain_document',
  arguments: {
    title: 'Memo to file',
    blocks: [
      { type: 'paragraph', text: 'This confirms the call held today.' },
      { type: 'heading2', text: 'Next steps' },
      { type: 'bullet', text: 'Send the draft to the client' },
      { type: 'bullet', text: 'ติดตามผลสัปดาห์หน้า' }
    ]
  }
});

const text = res.content.map(c => c.text).join('\n');
assert.ok(/Saved to .*\.docx/.test(text), 'reports where it saved the file');

const sc = res.structuredContent;
assert.ok(sc, 'structuredContent is present alongside the text content');
assert.ok(sc.location.endsWith('.docx'));
assert.ok(sc.fileSizeKB > 0);

const files = await readdir(out);
assert.equal(files.length, 1);
assert.ok(files[0].startsWith('Memo to file'), 'the file name comes from the title');

await client.close();
console.log(`ok — plain document MCP round trip, ${files[0]}`);
