import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildPlainDocx, fileNameOfPlain } from '../src/plain-doc.mjs';

const buf = await buildPlainDocx({
  title: 'บันทึกภายใน',
  blocks: [
    { type: 'heading1', text: 'Background' },
    { type: 'paragraph', text: 'เรื่องนี้เกี่ยวกับ the transfer of shares.', bold: false },
    { type: 'paragraph', text: 'This line is bold.', bold: true },
    { type: 'heading2', text: 'Action items' },
    { type: 'bullet', text: 'First item' },
    { type: 'bullet', text: 'ข้อสอง' }
  ]
});

assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'produces a real zip/.docx');

const zip = await JSZip.loadAsync(buf);
const xml = await zip.file('word/document.xml').async('string');

assert.match(xml, /<w:pStyle w:val="Title"\/>/, 'title paragraph uses the Title style');
assert.match(xml, /<w:pStyle w:val="Heading1"\/>/);
assert.match(xml, /<w:pStyle w:val="Heading2"\/>/);
assert.match(xml, /<w:pStyle w:val="ListParagraph"\/>/);
assert.match(xml, /This line is bold\.<\/w:t><\/w:r>/);
assert.ok(xml.includes('<w:b/>'), 'bold run is marked');
assert.ok(xml.includes('•'), 'bullets get a bullet glyph');
assert.match(xml, /<w:cs\/>/, 'Thai runs are tagged as complex script');

assert.equal(fileNameOfPlain({ title: 'ร่าง: สัญญา/ทดสอบ' }), 'ร่าง สัญญา ทดสอบ', 'unsafe filename characters are stripped');
assert.equal(fileNameOfPlain({ title: 'x', fileName: 'My File' }), 'My File', 'an explicit fileName wins over the title');
assert.equal(fileNameOfPlain({}), 'Document', 'falls back when neither is given');

console.log(`ok — plain docx engine, ${(buf.length / 1024).toFixed(1)} KB`);
