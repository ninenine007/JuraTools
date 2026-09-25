/* create_power_of_attorney over MCP (stdio). Fictional data only. */
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import JSZip from 'jszip';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(join(tmpdir(), 'jt-pwa-'));

const client = new Client({ name: 'pwa-client', version: '0.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'src', 'server.mjs')],
  env: { ...process.env, JURATOOLS_OUT_DIR: out }
}));

const { tools } = await client.listTools();
const tool = tools.find(t => t.name === 'create_power_of_attorney');
assert.ok(tool, 'create_power_of_attorney is registered');
assert.deepEqual(tool.inputSchema.properties.grantor.properties.type.enum, ['company', 'individual']);
assert.ok(tool.outputSchema?.properties?.stampDuty, 'an outputSchema is published');

const res = await client.callTool({ name: 'create_power_of_attorney', arguments: {
  matter: 'ทดสอบ MCP', date: '2026-10-01', place: 'กรุงเทพมหานคร',
  grantor: { type: 'company', company: { name: 'บริษัท ตัวอย่างทดสอบ จำกัด', registrationNumber: '0105500000001',
    headOfficeAddress: '1 ถนนสมมุติ กรุงเทพมหานคร', directors: [{ name: 'นายกรรมการ หนึ่ง' }, { name: 'นางกรรมการ สอง' }] } },
  attorneys: [{ name: 'นายกิตติ ทดสอบระบบ', idNumber: '1101700203450' }, { name: 'นางสาวนภา ทดลอง', idNumber: '1234567890123' }],
  matterFacts: { counterparty: 'นายคู่กรณี สมมุติ', courts: ['ศาลแพ่ง'], cause: 'สัญญากู้ยืมเงิน ลงวันที่ 1 มกราคม 2569 หากแต่คู่กรณีผิดนัดไม่ชำระหนี้', definedTerm: 'การผิดสัญญา' }
} });
assert.ok(!res.isError, JSON.stringify(res.content));
const sc = res.structuredContent;
assert.equal(sc.fileName, 'ทดสอบ MCP - หนังสือมอบอำนาจฟ้องคดี 20261001.docx');
assert.deepEqual(sc.stampDuty, { scheduleItem: '7(ค)', attorneys: 2, principals: 1, computedBaht: 60, printed: '60', overridden: false });
assert.deepEqual(sc.invalidIdNumbers, ['นางสาวนภา ทดลอง']);
assert.deepEqual(sc.blankFields, []);
assert.equal(sc.isDraft, true);
assert.ok(res.content[0].text.includes('Draft only'));
assert.equal((await readdir(out)).length, 1);

const xml = await (await JSZip.loadAsync(await readFile(sc.location))).file('word/document.xml').async('string');
assert.ok(!xml.includes('⟦'));
assert.equal(xml.split('>ลงชื่อ<').length - 1, 2 + 2 + 2, 'two directors, two attorneys, two witnesses');
assert.ok(xml.includes('>บริษัท ตัวอย่างทดสอบ จำกัด<'), 'the company name heads its directors');

await client.close();
console.log('mcp create_power_of_attorney: ok');
