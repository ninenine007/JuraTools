/* create_attorney_appointment over MCP (stdio). Fictional data only. */
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import JSZip from 'jszip';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(join(tmpdir(), 'jt-poa-'));

const client = new Client({ name: 'poa-client', version: '0.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'src', 'server.mjs')],
  env: { ...process.env, JURATOOLS_OUT_DIR: out, JURATOOLS_OFFICE_PHONE: '02-000-0000' }
}));

const { tools } = await client.listTools();
const tool = tools.find(t => t.name === 'create_attorney_appointment');
assert.ok(tool, 'create_attorney_appointment is registered');
assert.deepEqual(tool.inputSchema.properties.form.enum, ['JDA', 'PY']);
assert.ok(tool.outputSchema?.properties?.documents, 'an outputSchema is published');

const lawyers = [
  { key: 'KT', name: 'นายกิตติ ทดสอบระบบ', idNumber: '1101700203451', licenseNumber: '1234/2567', phone: '081-234-5678', email: 'kitti.t@example.com' },
  { key: 'NB', name: 'นางสาวนภา ทดลอง', licenseNumber: '555/2560', phone: '082-000-0000', email: 'napa@example.com' }
];
const base = {
  form: 'JDA',
  case: { matter: '01 ทดสอบ', blackNo: 'พ.1234', blackYear: '2569', court: 'ศาลแพ่งกรุงเทพใต้', date: '2026-10-01',
          partyTop: 'ธนาคารสมมติ จำกัด (มหาชน)', partyBottom: 'นายสมชาย ใจดี กับพวกรวม 3 คน' },
  lawyers
};

/* 1 · two lawyers → two documents, both fit */
let res = await client.callTool({ name: 'create_attorney_appointment', arguments: {
  ...base, clients: [{ name: 'นายสมชาย ใจดี', role: 'จำเลยที่ 1', appointer: 'นางสาวสมหญิง ใจดี', lawyers: ['KT', 'NB', 'XX'] }]
} });
let sc = res.structuredContent;
const text = res.content.map(c => c.text).join('\n');
assert.equal(sc.form, 'JDA');
assert.equal(sc.withdrawalWording, 'การถอนคำให้การ');
assert.equal(sc.documents.length, 2);
assert.deepEqual(sc.documents.map(d => d.fit), ['ok', 'ok']);
assert.equal(sc.documents[0].fileName, '01 ทดสอบ - ใบแต่งทนายความ - จำเลยที่ 1 KT.docx');
assert.deepEqual(sc.unmatchedLawyerKeys, ['XX']);
assert.deepEqual(sc.invalidIdNumbers, ['นายกิตติ ทดสอบระบบ'], 'the made-up ID fails its check digit and is reported');
assert.ok(sc.blankFields.includes('เลขประจำตัวประชาชน'), 'NB has no ID number — reported blank');
assert.ok(text.includes('Draft only'));
assert.equal((await readdir(out)).length, 2);

/* the document itself: the page's values, in Thai digits, nothing left over */
const zip = await JSZip.loadAsync(await readFile(sc.documents[0].location));
const xml = await zip.file('word/document.xml').async('string');
assert.ok(!xml.includes('⟦'), 'no marker left');
for (const s of ['พ.๑๒๓๔', 'แพ่งกรุงเทพใต้', 'ตุลาคม', 'ผู้รับมอบอำนาจจำเลยที่ ๑', 'นายกิตติ ทดสอบระบบ', '๐๒-๐๐๐-๐๐๐๐', 'kitti.t@example.com'])
  assert.ok(xml.includes(s), `document carries ${s}`);
assert.ok(!xml.includes('ศาลแพ่งกรุงเทพใต้'), 'the printed "ศาล" is not doubled');

/* 2 · a company signer that needs condensing, and one that cannot fit */
res = await client.callTool({ name: 'create_attorney_appointment', arguments: {
  ...base, form: 'PY',
  clients: [
    { name: 'บริษัท สมมติอุตสาหกรรมอาหาร (ประเทศไทย) จำกัด', role: 'โจทก์',
      appointer: 'บริษัท สมมติอุตสาหกรรมอาหาร (ประเทศไทย) จำกัด โดยนายสมศักดิ์ ทดลองยาว', lawyers: ['NB'] },
    { name: 'บริษัท สมมติ จำกัด', role: 'โจทก์',
      appointer: 'บริษัท สมมติอุตสาหกรรมอาหารและเครื่องดื่มนานาชาติ (ประเทศไทย) จำกัด โดยนายสมศักดิ์ ทดลองยาวมาก', lawyers: ['NB'] }
  ]
} });
sc = res.structuredContent;
assert.equal(sc.withdrawalWording, 'การถอนฟ้อง');
assert.equal(sc.documents[0].fit, 'condensed');
assert.equal(sc.documents[0].condensed[0].field, 'appointer');
assert.ok(sc.documents[0].condensed[0].points > 0 && sc.documents[0].condensed[0].points <= 0.75);
assert.equal(sc.documents[1].fit, 'overflow');
assert.equal(sc.documents[1].overflow[0].field, 'appointer');
assert.ok(res.content[0].text.includes('TOO LONG'));

await client.close();
console.log(`ok — create_attorney_appointment over MCP: ${sc.documents.length + 2} documents, condensed + overflow reported`);
