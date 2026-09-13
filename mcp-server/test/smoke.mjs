import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildDocx, dutyOf, fileNameOf, normalizeTransfer, unresolved } from '../src/transfer.mjs';

const t = normalizeTransfer({
  co: { th: 'บริษัท ตัวอย่าง จำกัด', en: 'EXAMPLE CO., LTD.' },
  tfr: {
    nameTh: 'นายสมชาย ใจดี', nameEn: 'Mr. Somchai Jaidee',
    addrTh: '99 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',
    addrEn: '99 Sukhumvit Road, Khlong Toei, Bangkok',
    date: '2026-09-12'
  },
  tfe: {
    nameTh: 'นางสาวสมหญิง รักไทย', nameEn: 'Miss Somying Rakthai',
    addrTh: '1 ถนนพระราม 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร',
    addrEn: '1 Rama IV Road, Silom, Bang Rak, Bangkok',
    date: '2026-09-12'
  },
  sh: { count: 25000, from: 1, to: 25000, par: 10, paidUp: '100', stampOn: true }
});

const duty = dutyOf(t);
assert.equal(duty.ok, true);
assert.equal(duty.paidValue, 250000, 'paid-up value = par × paid-up% × shares');
assert.equal(duty.duty, 250, 'duty = 1 baht per 1,000 of basis');
assert.equal(duty.dup, 5, 'counterpart duty is 5 where the original exceeds 5');
assert.equal(duty.total, 255);

const buf = await buildDocx(t);
assert.ok(Buffer.isBuffer(buf), 'buildDocx returns a Node buffer');
assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'output is a zip');

const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');

/* Thai and Latin land in separate runs, so the document only reads as one
   string once the runs are joined back together. */
const plain = (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
  .map(s => s.replace(/<[^>]+>/g, ''))
  .join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

assert.ok(!/\{\{[A-Z_0-9]+\}\}/.test(xml), 'no tokens left unfilled');
assert.ok(plain.includes('นายสมชาย ใจดี'), 'transferor Thai name is written');
assert.ok(plain.includes('Miss Somying Rakthai'), 'transferee English name is written');
assert.ok(plain.includes('25,000'), 'share count is grouped');
assert.ok(plain.includes('10.-'), 'par value uses the whole-baht convention');
assert.ok(plain.includes('12 กันยายน 2569'), 'Thai date is Buddhist-era');
assert.ok(plain.includes('12 September 2026'), 'English date is Gregorian');
assert.ok(plain.includes('ปิดอากรแสตมป์ 250 บาท'), 'the original carries its computed duty');
assert.ok(plain.includes('ปิดอากรแสตมป์ 5 บาท'), 'the duplicate carries the counterpart duty');
assert.ok(xml.includes('<w:cs/>'), 'Thai runs are tagged complex-script');

assert.equal(fileNameOf(t), '2026.09.12 Share Transfer Instrument นายสมชาย ใจดี - นางสาวสมหญิง รักไทย');

const open = unresolved(t);
assert.equal(open.placeholder.length, 0);

console.log(`ok — ${(buf.length / 1024).toFixed(0)} KB docx, duty ${duty.duty} + ${duty.dup} = ${duty.total} baht`);
console.log(`   blank tokens: ${open.blank.length ? open.blank.join(', ') : 'none'}`);
