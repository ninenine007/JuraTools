/* node --test document-automation/_build/os4/test/
   Fictional people and numbers only (tax IDs built to pass the check digit, e.g. 1234567890121). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const OS4 = require('../os4-engine.js');
const { engine } = require('../fill.js');

const base = () => ({
  office: 'บางรัก',
  filingDate: '2026-03-02',
  transferor: { name: 'นายสมมุติ ตัวอย่าง', tin: '1234567890121', address: '10 ถนนสมมุติ แขวงทดสอบ เขตทดลอง กรุงเทพมหานคร 10100' },
  transferee: { name: 'บริษัท ตัวอย่าง จำกัด', tin: '0105551000001', branch: '00000', address: '99/1 หมู่ 2 ตำบลบ้านใหม่ อำเภอเมือง จังหวัดนนทบุรี 11000' },
  instrument: { date: '2026-03-02' },
  shares: { count: 1000, parValue: 100 },
  signer: { name: 'นายสมมุติ ตัวอย่าง' }
});

test('item 2: 1 baht per 1,000 or part — rounded up, never down', () => {
  const d = (price) => OS4.plan({ ...base(), shares: { count: 1, parValue: 1, price } }).stampDuty;
  assert.equal(d('2845316.40').dutyOnOriginalBaht, 2846);      // value ÷ 1,000 would say 2,845.32
  assert.equal(d('91204583.70').dutyOnOriginalBaht, 91205);    // … and 91,204.58
  assert.equal(d(1000000).dutyOnOriginalBaht, 1000);             // exact multiple: no extra baht
  assert.equal(d('1000000.01').dutyOnOriginalBaht, 1001);
  assert.equal(d(1).dutyOnOriginalBaht, 1);
});

test('item 2: the greater of the paid-up value and the price', () => {
  const r = OS4.plan({ ...base(), shares: { count: 10000, parValue: 100, price: 500000 } });
  assert.equal(r.stampDuty.basisFrom, 'paidUp');
  assert.equal(r.stampDuty.basisBaht, '1000000');
  assert.equal(r.stampDuty.dutyOnOriginalBaht, 1000);
  assert.equal(r.forms[0].fields['Text2.5'], '1000000');            // มูลค่า = the basis (user's choice)
  assert.ok(r.notes.some(n => /below the paid-up value/.test(n)));
  const partly = OS4.plan({ ...base(), shares: { count: 10000, parValue: 100, paidUpPercent: 25 } });
  assert.equal(partly.stampDuty.paidUpValueBaht, '250000');
  const perShare = OS4.plan({ ...base(), shares: { count: 3, parValue: 10, pricePerShare: '333.33' } });
  assert.equal(perShare.stampDuty.priceBaht, '999.99');
  assert.equal(perShare.stampDuty.dutyOnOriginalBaht, 1);
});

test('item 23: 1 baht where the original is 5 or less, else 5 — per duplicate', () => {
  const r = p => OS4.plan({ ...base(), shares: { count: 1, parValue: 1, price: p } }).stampDuty;
  assert.equal(r(5000).dutyOnDuplicateBaht, 1);
  assert.equal(r(5001).dutyOnDuplicateBaht, 5);
  const two = OS4.plan({ ...base(), counterparts: 2, shares: { count: 1, parValue: 1, price: 9000 } });
  assert.equal(two.stampDuty.dutyOnDuplicateBaht, 10);
  assert.equal(two.forms[0].fields['Text3.4'], '2');
  assert.equal(two.forms[0].fields['Text5.4'], '3');
});

test('the table: the firm\'s officer columns, the RD guide\'s numbering and total count', () => {
  const f = OS4.plan({ ...base(), shares: { count: 1, parValue: 1, price: '9431062.35' } }).forms[0].fields;
  assert.deepEqual([f['Text2.1'], f['Text2.2'], f['Text2.3'], f['Text2.4'], f['Text2.5'], f['Text2.6']], ['1', '2.', 'ตราสารการโอนหุ้น', '1', '9431062', '35']);
  assert.deepEqual([f['Text2.8'], f['Text2.9'], f['Text2.10'], f['Text2.12']], ['9432', '00', '0', '9432']);
  assert.deepEqual([f['Text3.2'], f['Text3.3'], f['Text3.5'], f['Text3.6'], f['Text3.8']], ['23.', 'คู่ฉบับ', '0', '00', '5']);
  assert.deepEqual([f['Text5.4'], f['Text5.5'], f['Text5.6'], f['Text5.8'], f['Text5.12']], ['2', '9431062', '35', '9437', '9437']);
  assert.equal(f['Text2.7'], undefined);                           // อัตราอากร stays the officer's
  const rd = OS4.plan({ ...base(), options: { officerColumns: false, counterpartValue: 'blank', itemDots: false } }).forms[0].fields;
  assert.equal(rd['Text2.8'], undefined);
  assert.equal(rd['Text3.5'], undefined);
  assert.equal(rd['Text2.2'], '2');
});

test('who pays: one form by the transferor (default), by the transferee, or split in two', () => {
  const one = OS4.plan(base());
  assert.equal(one.forms.length, 1);
  assert.equal(one.forms[0].fields['Text1.5'], 'นายสมมุติ ตัวอย่าง');
  assert.equal(one.forms[0].fields['Text1.20'], 'บริษัท ตัวอย่าง จำกัด');
  const tfe = OS4.plan({ ...base(), payer: 'transferee' });
  assert.equal(tfe.forms[0].fields['Text1.5'], 'บริษัท ตัวอย่าง จำกัด');
  assert.equal(tfe.forms[0].fields['Num1'], '0 1055 51000 00 1');
  assert.equal(tfe.forms[0].fields['Text1.6'], '00000');
  const split = OS4.plan({ ...base(), payer: 'split' });
  assert.equal(split.forms.length, 2);
  assert.equal(split.forms[0].fields['Text2.2'], '2.');
  assert.equal(split.forms[0].fields['Text3.1'], undefined);
  assert.equal(split.forms[1].fields['Text1.5'], 'บริษัท ตัวอย่าง จำกัด');
  assert.equal(split.forms[1].fields['Text2.2'], '23.');
  assert.equal(split.forms[1].fields['Text2.8'], '5');              // original 100 baht (> 5) → duplicate 5
  assert.notEqual(split.forms[0].fileName, split.forms[1].fileName);
});

test('ม.113: the dates suggest the surcharge; a mode given wins', () => {
  const s = (filingDate, mode) => OS4.plan({ ...base(), filingDate, surcharge: mode ? { mode } : undefined, shares: { count: 1, parValue: 1, price: 1000000 } });
  assert.equal(s('2026-03-02').stampDuty.surchargeBaht, 0);
  assert.equal(s('2026-03-17').stampDuty.surchargeMode, 's113_15');      // 15 days: none
  const late = s('2026-03-18');                                           // 16 days
  assert.equal(late.stampDuty.surchargeMode, 's113_90');
  assert.equal(late.stampDuty.surchargeBaht, 2000 + 10);                  // 2× each row (5 → 10 ≥ 4)
  assert.ok(late.warnings.some(w => /16 days/.test(w)));
  assert.equal(s('2026-07-01').stampDuty.surchargeMode, 's113_over90');
  assert.equal(s('2026-07-01', 'normal').stampDuty.surchargeBaht, 0);
  const small = OS4.plan({ ...base(), filingDate: '2026-04-01', shares: { count: 1, parValue: 1, price: 1000 } });
  assert.equal(small.stampDuty.surchargeBaht, 4 + 4);                     // 2× 1 baht → minimum 4, per row
});

test('tax IDs: formatted into the comb, check digit verified, zeros mean none', () => {
  assert.equal(OS4.tinValid('1234567890121'), true);
  assert.equal(OS4.tinValid('1234567890122'), false);
  assert.equal(OS4.tinFormat('1234567890121'), '1 2345 67890 12 1');
  const bad = OS4.plan({ ...base(), transferor: { ...base().transferor, tin: '1-2345-67890-12-2' } });
  assert.ok(bad.warnings.some(w => /check digit/.test(w)));
  const zeros = OS4.plan({ ...base(), transferee: { ...base().transferee, tin: '0 0000 00000 00 0' } });
  assert.equal(zeros.warnings.length, 0);
  assert.equal(zeros.forms[0].fields['Num2'], '0 0000 00000 00 0');
  const blank = OS4.plan({ ...base(), options: { noTin: 'blank' }, transferee: { name: 'EXAMPLE HOLDINGS LIMITED', tin: 'none', address: {} } });
  assert.equal(blank.forms[0].fields['Num2'], undefined);
  assert.throws(() => OS4.plan({ ...base(), transferor: { ...base().transferor, tin: '12345' } }), /13/);
  assert.equal(OS4.tinDigits('๑๒๓๔'), '1234');
});

test('addresses: one line into the thirteen boxes', () => {
  const s = line => OS4.splitAddress(line).parts;
  assert.deepEqual(s('10/5 ซอยสมมุติ 3 แขวงทดสอบ เขตทดลอง กรุงเทพมหานคร 10500'),
    { building: '', room: '', floor: '', village: '', no: '10/5', moo: '', soi: 'สมมุติ 3', yaek: '', road: '', subdistrict: 'ทดสอบ', district: 'ทดลอง', province: 'กรุงเทพมหานคร', postcode: '10500' });
  const p = s('เลขที่ 88/12 หมู่ 7 อาคารตัวอย่างพาร์ค ชั้น 9 ถนนสมมุติ ตำบลบ้านทดสอบ อำเภอเมืองทดลอง จังหวัดนนทบุรี 11000');
  assert.deepEqual([p.no, p.moo, p.building, p.floor, p.road, p.subdistrict, p.district, p.province, p.postcode],
    ['88/12', '7', 'ตัวอย่างพาร์ค', '9', 'สมมุติ', 'บ้านทดสอบ', 'เมืองทดลอง', 'นนทบุรี', '11000']);
  const q = s('88 ม.5 ซ.ลาดพร้าว 101 แยก 3 ถ.ลาดพร้าว ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540');
  assert.deepEqual([q.no, q.moo, q.soi, q.yaek, q.road, q.subdistrict, q.district, q.province], ['88', '5', 'ลาดพร้าว 101', '3', 'ลาดพร้าว', 'บางพลีใหญ่', 'บางพลี', 'สมุทรปราการ']);
  const r = s('1 อาคารตัวอย่าง ห้องเลขที่ 2101 ชั้น 21 หมู่บ้านสมมุติ ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120');
  assert.deepEqual([r.no, r.building, r.room, r.floor, r.village, r.province], ['1', 'ตัวอย่าง', '2101', '21', 'สมมุติ', 'กรุงเทพมหานคร']);
  const soiName = s('7 ซอยตัวอย่าง 16 (สมมุติ) แขวงทดสอบ เขตทดลอง กรุงเทพมหานคร 10500');
  assert.equal(soiName.soi, 'ตัวอย่าง 16 (สมมุติ)');
  const foreign = OS4.splitAddress('Unit 2101, 21/F, Example Tower, Central, Hong Kong');
  assert.ok(foreign.rest.length && !foreign.complete);                     // kept, never dropped
  const w = OS4.plan({ ...base(), transferee: { name: 'EXAMPLE LIMITED', tin: 'none', address: 'Unit 2101, Example Tower, Hong Kong' } });
  assert.ok(w.warnings.some(x => /could not be placed/.test(x)));
});

test('dashes go in the boxes that do not apply, not in an address never given', () => {
  const f = OS4.plan(base()).forms[0].fields;
  assert.equal(f['Text1.7'], '-');              // อาคาร
  assert.equal(f['Text1.19'], '10100');
  assert.equal(f['Text1.15'], 'สมมุติ');
  const none = OS4.plan({ ...base(), transferee: { name: 'นางสาวไม่มี ที่อยู่' } }).forms[0];
  assert.equal(none.fields['Text1.22'], undefined);
  assert.ok(none.blank.includes('ที่อยู่คู่สัญญา'));
});

test('dates: Thai month and Buddhist year; loose input read and reported; two-digit years refused', () => {
  const r = OS4.plan({ ...base(), instrument: { date: '2569-01-15' }, filingDate: '16/01/2569' });
  assert.equal(r.forms[0].fields['Text1.37'], '15 มกราคม 2569');
  assert.deepEqual([r.forms[0].fields['Text1.2'], r.forms[0].fields['Text1.3'], r.forms[0].fields['Text1.4']], ['16', 'มกราคม', '2569']);
  assert.ok(r.notes.some(n => /Buddhist-era/.test(n)));
  const monthOnly = OS4.plan({ ...base(), filingDate: '2026-03' });
  assert.equal(monthOnly.forms[0].fields['Text1.2'], undefined);
  assert.equal(monthOnly.forms[0].fields['Text1.3'], 'มีนาคม');
  assert.throws(() => OS4.plan({ ...base(), instrument: { date: '15/01/69' } }), /two-digit/);
  assert.throws(() => OS4.plan({ ...base(), instrument: { date: '2026-02-30' } }), /no day 30/);
});

test('input problems name the field', () => {
  assert.throws(() => OS4.plan({ ...base(), transferor: {} }), e => e.input && e.field === 'transferor.name');
  assert.throws(() => OS4.plan({ ...base(), shares: {} }), e => e.field === 'shares');
  assert.throws(() => OS4.plan({ ...base(), payer: 'buyer' }), e => e.field === 'payer');
  assert.throws(() => OS4.plan({ ...base(), endorsement: { submitted: false } }), e => e.field === 'endorsement.reason');
});

test('the PDF: the RD\'s file untouched, then one incremental update', async () => {
  const r = await engine();
  const plan = OS4.plan({ ...base(), shares: { count: 1, parValue: 1, price: '2845316.40' } });
  const bytes = r.pdf(plan.forms[0]);
  const rd = fs.readFileSync(path.join(__dirname, '../assets/OS4_150861.pdf'));
  assert.ok(Buffer.from(bytes.subarray(0, rd.length)).equals(rd), 'the RD\'s bytes are a prefix');
  const tail = Buffer.from(bytes.subarray(rd.length)).toString('latin1');
  assert.match(tail, /\/Type \/XRef .*\/Prev 545999 \/Root 313 0 R/);
  assert.match(tail, /startxref\n\d+\n%%EOF\n$/);
  assert.match(tail, /\/FontFile2/);
  assert.ok(!/\/NeedAppearances/.test(tail));
  // deterministic: the same input writes the same bytes
  assert.ok(Buffer.from(r.pdf(plan.forms[0])).equals(Buffer.from(bytes)));
  // every value has an appearance; Thai tone marks positioned by HarfBuzz
  const L = r.layoutForm(plan.forms[0]);
  assert.deepEqual(L.missing, []);
  assert.ok(L.fields['Text1.5'].glyphs.length > 5);
  const shaped = r.shape('ที่');
  assert.equal(shaped.length, 3);
});

test('the print-ready PDF: the same values drawn on the page, no fields left', async () => {
  const r = await engine();
  const form = OS4.plan({ ...base(), shares: { count: 1, parValue: 1, price: '1875000' } }).forms[0];
  const flat = r.pdf(form, null, { flatten: true });
  const rd = fs.readFileSync(path.join(__dirname, '../assets/OS4_150861.pdf'));
  assert.ok(Buffer.from(flat.subarray(0, rd.length)).equals(rd), 'the RD\'s bytes are a prefix');
  const tail = Buffer.from(flat.subarray(rd.length)).toString('latin1');
  assert.match(tail, /\n314 0 obj\n<<[\s\S]*\/Contents \[\d+ 0 R 316 0 R 317 0 R 318 0 R 319 0 R 320 0 R 321 0 R 322 0 R 323 0 R \d+ 0 R\]/);
  assert.ok(!/\/Annots/.test(tail.split('\n314 0 obj\n')[1].split('endobj')[0]), 'the page has no annotations');
  assert.ok(!/\/AcroForm/.test(tail.split('\n313 0 obj\n')[1].split('endobj')[0]), 'the catalog has no form');
  assert.match(tail, /\/OS4R0 472 0 R/);                          // the RD's own tick for "อื่นๆ"
  assert.match(tail, /\/OS4R1 621 0 R/);                          // … and for "ได้ยื่นตราสาร"
  assert.ok(!Buffer.from(flat).equals(Buffer.from(r.pdf(form))));
});
