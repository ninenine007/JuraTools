/* หนังสือมอบอำนาจให้ฟ้องคดี. Every name, number and address below is fictional —
   the firm's own files hold real client and lawyer data and never come near a test. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { buildPowerOfAttorney, loadPwa, PWAEngine as E } from '../src/power-of-attorney.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(here, '..', '..', 'document-automation', 'power-of-attorney.html'), 'utf8');
const D = await loadPwa();

/* ── the server builds what the page builds ─────────────────────── */
const pageData = JSON.parse(html.match(/<script id="pwa-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
for (const k of ['frags', 'alt', 'geom', 'tpl']) assert.deepEqual(D[k], pageData[k], `${k} is the page’s — run npm run sync-templates`);
const engineSrc = (await readFile(join(here, '..', 'src', 'pwa-engine.cjs'), 'utf8')).replace(/^\/\* GENERATED[\s\S]*?\*\/\n/, '').trim();
assert.ok(html.includes(engineSrc), 'src/pwa-engine.cjs is the engine the page ships');

/* ── helpers ────────────────────────────────────────────────────── */
function wellFormed(xml) {
  const stack = [];
  for (const m of xml.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (m[0].startsWith('<?')) continue;
    if (m[3]) continue;
    if (m[1]) { assert.equal(stack.pop(), m[2], `closing ${m[2]}`); } else stack.push(m[2]);
  }
  assert.equal(stack.length, 0, 'every element is closed');
}
const bare = r => r.replace(/<w:cs\/>/g, '').replace(/<w:highlight w:val="yellow"\/>/g, '');
const templateRprs = new Set([...JSON.stringify(D).matchAll(/<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>/g)].map(m => bare(JSON.parse('"' + m[0] + '"'))));
const count = (s, sub) => s.split(sub).length - 1;

/* ── 1 · a company, three attorneys, two witnesses ──────────────── */
const company = {
  matter: 'ทดสอบ บริษัท', place: 'เลขที่ 1 ถนนสมมุติ แขวงทดลอง เขตตัวอย่าง กรุงเทพมหานคร 10000', date: '2026-10-01',
  grantor: { type: 'company', company: { name: 'บริษัท ตัวอย่างทดสอบ จำกัด', registrationNumber: '0105500000001',
    headOfficeAddress: '1 ถนนสมมุติ แขวงทดลอง เขตตัวอย่าง กรุงเทพมหานคร', directors: [{ name: 'นายกรรมการ ทดสอบ' }] } },
  attorneys: [{ name: 'นายกิตติ ทดสอบระบบ', idNumber: '1101700203450' }, { name: 'นางสาวนภา ทดลอง' }, { name: 'Mr. John Example' }],
  matterFacts: { counterparty: 'บริษัท คู่กรณีสมมุติ จำกัด', courts: ['ศาลแพ่ง', 'ศาลอาญา'],
    cause: 'นิติสัมพันธ์ตามสัญญาซื้อขายสินค้า ลงวันที่ 1 มีนาคม 2569 หากแต่คู่กรณีผิดสัญญาไม่ชำระราคาสินค้าดังกล่าว', definedTerm: 'การผิดสัญญา' },
  extraClauses: [{ afterClause: 3, text: 'ให้มีอำนาจทดสอบข้อที่เพิ่ม' }],
  witnesses: ['นายพยาน ทดสอบ', '']
};
let r = await buildPowerOfAttorney(company);
let x = r.xml;
wellFormed(x);
assert.ok(!/⟦/.test(x), 'no marker left');
assert.equal(r.fileName, 'ทดสอบ บริษัท - หนังสือมอบอำนาจฟ้องคดี 20261001.docx');
for (const s of ['บริษัท ตัวอย่างทดสอบ จำกัด ', 'ทะเบียนนิติบุคคลเลขที่ 0105500000001', 'สำนักงานแห่งใหญ่ตั้งอยู่ ณ เลขที่ 1 ถนนสมมุติ',
  'โดยนายกรรมการ ทดสอบ กรรมการผู้มีอำนาจลงลายมือชื่อและประทับตราสำคัญกระทำการแทนได้', '1 1017 00203 45 0', '1 ตุลาคม 2569',
  'ต่อศาลแพ่ง ศาลอาญา หรือศาลสถิตยุติธรรมที่มีเขตอำนาจ องค์กร หน่วยงานของรัฐ', '“การผิดสัญญา”', 'ให้มีอำนาจทดสอบข้อที่เพิ่ม'])
  assert.ok(x.replace(/<[^>]+>/g, '').includes(s), `document says ${s}`);
assert.ok(x.replace(/<[^>]+>/g, '').includes('ต่อศาลแพ่ง ศาลอาญา หรือศาลสถิตยุติธรรมอื่นใด'), 'clause 1 does not double "ศาล"');
assert.equal(count(x, 'numId w:val="3"'), 9, 'eight fixed clauses and one added');
assert.equal(r.derived.stamp.auto, 90, '3 attorneys acting separately: 3 × 30');
assert.equal(r.derived.stamp.item, '7(ค)');
assert.ok(x.includes('>90<'), 'the duty is printed');
assert.equal(count(x, '>ลงชื่อ<'), 1 + 3 + 2, 'one line per signer');
assert.ok(x.includes('w:type="page"'), 'signatures start on a new page by default');
assert.deepEqual(r.report.blank, [], 'nothing blank');
assert.deepEqual(r.report.invalidIds, [], 'the ID passes its check digit');

/* formatting: every run property in the document is one the template already had
   (Thai runs gain <w:cs/>, Latin runs lose it — the only change typing makes) */
for (const m of x.matchAll(/<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>/g))
  assert.ok(templateRprs.has(bare(m[0])), 'run properties come from the template: ' + m[0]);
const latin = x.match(/<w:r[^>]*>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)<w:t xml:space="preserve">Mr\. John Example<\/w:t>/);
assert.ok(latin && !latin[1].includes('<w:cs/>'), 'a Latin name is not tagged complex script');
const thai = x.match(/<w:r[^>]*>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)<w:t xml:space="preserve">นางสาวนภา ทดลอง<\/w:t>/);
assert.ok(thai && thai[1].includes('<w:cs/>'), 'a Thai name is tagged complex script');
assert.ok(!x.includes('w:highlight'), 'no highlight unless a value is "(*)"');

/* the package: document.xml replaced, footer total is Word's own field, author fields blank */
const zip = await JSZip.loadAsync(r.buffer);
assert.equal(await zip.file('word/document.xml').async('string'), x);
assert.ok((await zip.file('word/footer1.xml').async('string')).includes('NUMPAGES'), 'page total is a field');
assert.ok((await zip.file('docProps/core.xml').async('string')).includes('<dc:creator></dc:creator>'));
for (const n of Object.keys(zip.files)) if (/\.(xml|rels)$/.test(n)) assert.ok(!(await zip.file(n).async('string')).includes('⟦'), n);

/* ── 2 · individuals: two grantors, one attorney, no witness name, "(*)" ── */
r = await buildPowerOfAttorney({
  grantor: { type: 'individual', persons: [
    { name: 'นายผู้มอบ ทดสอบ', idNumber: '1101700203450', address: '9 ถนนสมมุติ ตำบลทดลอง อำเภอตัวอย่าง จังหวัดนนทบุรี' },
    { name: 'Ms. Jane Example', idType: 'passport', idNumber: 'AB1234567' }],
    capacity: 'ในฐานะทายาทโดยธรรมของผู้ตาย' },
  attorneys: [{ name: 'นายกิตติ ทดสอบระบบ', idNumber: '1101700203452' }],
  matterFacts: { counterparty: '(*)', courts: ['ศาลจังหวัดนนทบุรี'], cause: 'การทำละเมิดสมมุติ', definedTerm: 'การทำละเมิด' },
  witnesses: [''], signaturesOnNextPage: false
});
x = r.xml;
wellFormed(x);
const text = x.replace(/<[^>]+>/g, '');
assert.ok(text.includes('โดยหนังสือฉบับนี้ ข้าพเจ้า นายผู้มอบ ทดสอบ บัตรประจำตัวประชาชนเลขที่ 1 1017 00203 45 0 ภูมิลำเนาอยู่ ณ เลขที่ 9 ถนนสมมุติ'), text.slice(0, 400));
assert.ok(text.includes('และMs. Jane Example หนังสือเดินทางเลขที่ AB1234567 (“ผู้มอบอำนาจ”) ในฐานะทายาทโดยธรรมของผู้ตาย ขอมอบอำนาจ'));
assert.equal(r.derived.stamp.auto, 60, 'one attorney: 30 baht, counted for each of two principals');
assert.equal(r.derived.stamp.item, '7(ข)');
assert.deepEqual(r.report.invalidIds, ['นายกิตติ ทดสอบระบบ']);
assert.ok(r.report.blank.includes('ทำที่') && r.report.blank.includes('วันที่'));
assert.ok(x.includes('<w:highlight w:val="yellow"/>'), '"(*)" is highlighted');
assert.equal(count(x, '>ลงชื่อ<'), 2 + 1 + 1);
assert.ok(!x.includes('w:type="page"'), 'no page break when asked');
assert.ok(text.includes('(' + E.BLANK_NAME + ')'), 'a blank witness gets a line to write on');

/* ── 3 · overrides are printed as given ─────────────────────────── */
r = await buildPowerOfAttorney({ ...company, stampDuty: { amountOverride: '150', principals: 2 },
  matterFacts: { ...company.matterFacts, narrativeOverride: 'ต่อศาลทดสอบ อันเนื่องมาจากเหตุทดสอบ\n', clause1CourtsOverride: 'ศาลทดสอบ' } });
x = r.xml;
assert.equal(r.derived.stamp.auto, 180);
assert.equal(r.derived.stamp.amount, '150');
assert.ok(x.includes('>150<'));
assert.ok(x.replace(/<[^>]+>/g, '').includes('ต่อศาลทดสอบ หรือศาลสถิตยุติธรรมอื่นใด'), 'clause 1 override, first "ศาล" dropped');
assert.ok(/อันเนื่องมาจากเหตุทดสอบ<\/w:t><w:br\/>/.test(x), 'a line break in the narrative becomes Word\'s own');

if (process.env.PWA_WRITE) {
  await mkdir(process.env.PWA_WRITE, { recursive: true });
  await writeFile(join(process.env.PWA_WRITE, 'pwa-test.docx'), r.buffer);
}
console.log('power-of-attorney: ok');
