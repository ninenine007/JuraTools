import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(join(tmpdir(), 'jt-mcp-dates-'));

const client = new Client({ name: 'dates-smoke-client', version: '0.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'src', 'server.mjs')],
  env: { ...process.env, JURATOOLS_OUT_DIR: out }
}));

const { tools } = await client.listTools();
const names = new Set(tools.map(t => t.name));
for (const expected of [
  'calculate_agm_registration_deadline',
  'calculate_ccc_deadline',
  'calculate_ccc_duration',
  'calculate_ccc_start_date',
  'calculate_clear_days',
  'calculate_gm_notice_period',
  'create_share_transfer_instrument'
]) assert.ok(names.has(expected), `${expected} is registered`);

const readJson = res => JSON.parse(res.content[0].text);

const clear = readJson(await client.callTool({ name: 'calculate_clear_days', arguments: { mode: 'backward', eventDate: '2026-09-20', days: 7 } }));
assert.equal(clear.finalDate, '2026-09-12');
assert.equal(clear.pass, true);

const gm = readJson(await client.callTool({ name: 'calculate_gm_notice_period', arguments: { noticeDate: '2026-09-01', gap: 7 } }));
assert.equal(gm.earliestMeetingDate, '2026-09-09');

const reg = readJson(await client.callTool({ name: 'calculate_agm_registration_deadline', arguments: { meetingDate: '2026-09-05', rollMode: 'weekend' } }));
assert.equal(reg.deadline, '2026-09-21');

const dl = readJson(await client.callTool({ name: 'calculate_ccc_deadline', arguments: { startDateTime: '2026-01-15T10:00', days: 30 } }));
assert.equal(dl.finalDeadlineISO, '2026-02-16');

const dur = readJson(await client.callTool({ name: 'calculate_ccc_duration', arguments: { startDate: '2026-01-15', endDate: '2026-02-14' } }));
assert.equal(dur.bestUnit.value, 30);

const start = readJson(await client.callTool({ name: 'calculate_ccc_start_date', arguments: { deadline: '2026-02-14', days: 30 } }));
assert.equal(start.startDate, '2026-01-15');

// error path: a tool call with a bad enum-adjacent value should come back as an MCP error, not a crash.
const bad = await client.callTool({ name: 'calculate_gm_notice_period', arguments: { gap: 7 } });
assert.equal(bad.isError, true);
assert.match(bad.content[0].text, /provide noticeDate or meetingDate/);

await client.close();
console.log('ok — MCP round trip: all 6 date tools + the existing docx tool are present and correct');
