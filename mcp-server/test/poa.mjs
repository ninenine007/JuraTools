/* ใบแต่งทนายความ v2. Every name, number and address below is fictional — the
   firm's own files hold real client and lawyer data and never come near a test. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import JSZip from 'jszip';
import { documentsOf, fillDocument, buildDocx, valuesFor, normalize, idValid, loadPoa } from '../src/poa.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(here, '..', '..', 'litigation-tools', 'attorney-appointment.html');
const html = await readFile(PAGE, 'utf8');
const { D } = await loadPoa();

/* ── the server fills what the page fills ───────────────────────── */
const pageData = JSON.parse(html.match(/<script id="poa-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(D.spec, pageData.spec, 'field spec is the page’s — run npm run sync-templates');
assert.deepEqual(D.widths, pageData.widths, 'font widths are the page’s');
assert.deepEqual(D.tpl, pageData.tpl, 'templates are the page’s');
const engineSrc = (await readFile(join(here, '..', 'src', 'poa-engine.cjs'), 'utf8')).replace(/^\/\* GENERATED[\s\S]*?\*\/\n/, '').trim();
assert.ok(html.includes(engineSrc), 'src/poa-engine.cjs is the engine the page ships');

/* The page's own glue, lifted out of its script and run as-is, is the oracle
   for valuesFor/fileName — "mirror that logic" checked, not asserted. */
function pageFn(name) {
  const at = html.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `page defines ${name}`);
  let i = html.indexOf('{', at), depth = 0;
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(at, i + 1);
}
const PAGE_FNS = ['norm', 'toArab', 'yy', 'autoAppointerRole', 'autoAppointerSig', 'appointerRoleOf', 'appointerSigOf',
  'autoDate', 'dateOf', 'officePhone', 'courtOf', 'blankLawyer', 'valuesFor', 'fillOpts', 'safe', 'fileName', 'idValid'];
const page = vm.createContext({});
vm.runInContext(
  html.match(/var MONTHS = \[[^\]]*\];/)[0] + html.match(/var THD = '[^']*';/)[0] + "var OFFICE_PHONE = ''; var S;" +
  PAGE_FNS.map(pageFn).join('\n'), page);

/* ── a fictional case ───────────────────────────────────────────── */
const FILE = {
  tool: 'attorney-appointment', version: 2,
  state: {
    tpl: 'JDA',
    cse: {
      matter: '01 บริษัท ก.', blackNo: 'พ.123', blackYear: '2569', redNo: '', redYear: '',
      court: 'ศาลแพ่งกรุงเทพใต้', caseType: 'แพ่ง', dateIso: '2026-10-01', day: null, month: null, year: null,
      partyA: 'บริษัท ก. จำกัด', roleA: 'โจทก์', partyB: 'นาย ข. ตัวอย่าง กับพวกรวม 3 คน', roleB: 'จำเลย'
    },
    clients: [
      // a proxy signs for the client
      { name: 'นาย ข. ตัวอย่าง', role: 'จำเลยที่ 1', appointer: 'นาย ค. ตัวอย่าง', appointerRole: null, appointerSig: null, lawyers: ['KT', 'MS'] },
      // the client signs for itself
      { name: 'นาง ง. ตัวอย่าง', role: 'จำเลยที่ 2', appointer: 'นาง ง. ตัวอย่าง', appointerRole: null, appointerSig: null, lawyers: ['KT'] },
      // a company, through its attorney-in-fact
      { name: 'บริษัท จ. จำกัด', role: 'จำเลยที่ 3', appointer: 'บริษัท จ. จำกัด โดยนาย ฉ. ตัวอย่าง ผู้รับมอบอำนาจ',
        appointerRole: '', appointerSig: null, lawyers: ['KT', 'ZZ'] }
    ],
    firm: { officePhone: '02-000-0000' },
    opts: { thaiDigits: true, maxCondense: 15 }
  },
  lawyers: [
    { key: 'KT', name: 'นาย ก. ตัวอย่าง', idNo: '1-2345-67890-12-1', licenseNo: '1234/2567', phone: '080-000-0000', email: 'kt@example.com' },
    { key: 'MS', name: 'นางสาว ม. สมมติ', idNo: '', licenseNo: '5678/2568', phone: '', email: '' },
    { key: 'KT', name: '', idNo: '', licenseNo: '', phone: '', email: 'ignored@example.com' }    // a duplicate only fills blanks
  ]
};

assert.ok(idValid('1-2345-67890-12-1'), 'the fictional ID passes the mod-11 check');

const { state: S, lawyers, docs, unmatched } = documentsOf(FILE);
assert.equal(lawyers.length, 2, 'duplicate keys merge');
assert.equal(lawyers[0].email, 'kt@example.com', 'a later duplicate never overwrites');
assert.deepEqual(unmatched, [{ client: 2, key: 'ZZ' }], 'a key with no lawyer is reported, not guessed');
assert.deepEqual(docs.map(d => d.fileName), [
  '01 บริษัท ก. - ใบแต่งทนายความ - จำเลยที่ 1 KT.docx',
  '01 บริษัท ก. - ใบแต่งทนายความ - จำเลยที่ 1 MS.docx',
  '01 บริษัท ก. - ใบแต่งทนายความ - จำเลยที่ 2 KT.docx',
  '01 บริษัท ก. - ใบแต่งทนายความ - จำเลยที่ 3 KT.docx'
], 'one document per client per lawyer');

/* ── derivations ───────────────────────────────────────────────── */
const v = docs.map(d => valuesFor(S, d.c, d.l));
assert.equal(v[0].court, 'แพ่งกรุงเทพใต้', 'a leading ศาล is stripped');
assert.equal(v[0].blackYear, '69', 'four-digit years keep the last two');
assert.deepEqual([v[0].day, v[0].month, v[0].year], ['1', 'ตุลาคม', '69']);
assert.equal(v[0].appointerRole, 'ผู้รับมอบอำนาจจำเลยที่ 1');
assert.equal(v[0].appointerSig, 'นาย ค. ตัวอย่าง');
assert.equal(v[2].appointerRole, 'จำเลยที่ 2', 'a client signing for itself gets its bare role');
assert.equal(v[3].appointerRole, '', 'an explicit "" overrides the auto role');
assert.equal(v[3].appointerSig, 'นาย ฉ. ตัวอย่าง ผู้รับมอบอำนาจ', 'the signature takes what follows โดย');
for (const k of ['lawyerA', 'lawyerB', 'lawyerC', 'lawyerD', 'certifier']) assert.equal(v[0][k], 'นาย ก. ตัวอย่าง');
assert.equal(v[0].officePhone, '02-000-0000');

/* ── parity with the page ─────────────────────────────────────── */
page.S = S;
docs.forEach((d, i) => {
  assert.deepEqual(valuesFor(S, d.c, d.l), JSON.parse(JSON.stringify(vm.runInContext('valuesFor', page)(d.c, d.l))), `valuesFor matches the page (doc ${i})`);
  assert.equal(d.fileName, vm.runInContext('fileName', page)(d), `fileName matches the page (doc ${i})`);
});
assert.equal(vm.runInContext('idValid', page)('1-2345-67890-12-1'), true);

/* ── the filled documents ─────────────────────────────────────── */
const rprs = xml => new Set(xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) || []);
const runs = xml => (xml.match(/<w:r[ >]/g) || []).length;
const text = xml => (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(s => s.replace(/<[^>]+>/g, '')).join('');

async function check(d, label) {
  const tplXml = (await loadPoa()).xml[d.S.tpl];
  const { buffer, xml, report, missing, summary } = await buildDocx(d);
  assert.deepEqual(missing, [], `${label}: every marker has a value`);
  assert.equal(summary.level, 'ok', `${label}: every field fits without condensing — ${JSON.stringify(summary)}`);
  assert.equal(Object.keys(report).length, D.spec[d.S.tpl].length, `${label}: every field reported`);

  const zip = await JSZip.loadAsync(buffer);
  const src = await JSZip.loadAsync(D.tpl[d.S.tpl], { base64: true });
  const parts = z => Object.keys(z.files).filter(n => !z.files[n].dir).sort();   // JSZip adds a word/ folder entry, as in the page
  assert.deepEqual(parts(zip), parts(src), `${label}: same parts as the template`);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || /\.(png|jpe?g|emf|wmf|bin)$/i.test(name)) continue;
    assert.ok(!(await zip.file(name).async('string')).includes('⟦'), `${label}: no ⟦ marker left in ${name}`);
  }
  const out = await zip.file('word/document.xml').async('string');
  assert.equal(out, xml);
  const known = rprs(tplXml);
  const added = [...rprs(out)].filter(r => !known.has(r));
  assert.deepEqual(added, [], `${label}: no <w:rPr> that the template does not have`);
  assert.equal(runs(out), runs(tplXml), `${label}: no run added or removed`);
  return { out, report };
}

for (const [i, d] of docs.entries()) {
  const { out } = await check(d, docs[i].fileName);
  const t = text(out);
  assert.ok(t.includes('พ.๑๒๓'), 'Thai digits');
  assert.ok(t.includes(v[i].client.replace(/\d/g, c => '๐๑๒๓๔๕๖๗๘๙'[c])), 'the client is on the form');
  assert.ok(t.includes(d.l.name), 'the lawyer is on the form');
  assert.ok(t.includes('การถอนคำให้การ'), 'JDA keeps its own clause');
}
const kt = text((await fillDocument(docs[0])).xml);
assert.ok(kt.includes('kt@example.com'), 'e-mail stays Latin');
assert.ok(kt.includes('๐๒-๐๐๐-๐๐๐๐'), 'the office phone from the file');

/* The same facts on the PY form. */
const py = documentsOf({ ...FILE, state: { ...FILE.state, tpl: 'PY' } });
for (const d of py.docs) await check(d, 'PY ' + d.fileName);
assert.ok(!text((await fillDocument(py.docs[0])).xml).includes('การถอนคำให้การ'), 'PY carries การถอนฟ้อง only');

/* ── too long for the line ────────────────────────────────────── */
/* A little too long: condensed on that run only, and the only new rPr is the
   old one plus w:spacing. Far too long: reported, never silently wrapped. */
const longBy = n => documentsOf({ ...FILE, state: { ...FILE.state,
  clients: [{ ...FILE.state.clients[0], name: 'นาย ข. ตัวอย่าง' + 'ก'.repeat(n), lawyers: ['KT'] }] } }).docs[0];
let condensed = null;
for (let n = 1; n < 60 && !condensed; n++) {
  const r = await fillDocument(longBy(n));
  if (r.report.client.condense) condensed = r;
}
assert.ok(condensed && condensed.report.client.fits, 'a slightly long value is condensed to fit');
assert.deepEqual(condensed.summary.cond, ['client']);
const known = rprs((await loadPoa()).xml.JDA);
const added = [...rprs(condensed.xml)].filter(r => !known.has(r));
assert.equal(added.length, 1, 'condensing touches one run');
assert.ok(known.has(added[0].replace(/<w:spacing w:val="-?\d+"\/>/, '')), '…and adds nothing but w:spacing to its rPr');
const over = await fillDocument(longBy(120));
assert.deepEqual(over.summary.over, ['client'], 'a far-too-long value is reported as over');

/* ── a first-version file still opens ─────────────────────────── */
const v1 = normalize({ format: 'juratools-attorney-appointment', v: 1, matter: '02 ตัวอย่าง',
  cse: { blackNo: 'พ.1', blackYear: '69' },
  lawyers: [{ id: 'x1', key: 'KT', name: 'นาย ก. ตัวอย่าง', cur: { tel: '-', email: 'kt@example.com' } }],
  appts: [{ client: 'นาย ข. ตัวอย่าง', clientRole: 'จำเลย', side: 'defendant', lawyerIds: ['x1'] }] });
assert.equal(v1.state.tpl, 'JDA', 'side: defendant → JDA');
assert.deepEqual(v1.state.clients[0].lawyers, ['KT']);
assert.equal(v1.lawyers[0].phone, '', '"-" is no phone');
assert.equal(v1.lawyers[0].email, 'kt@example.com');

if (process.env.POA_WRITE) {
  await mkdir(process.env.POA_WRITE, { recursive: true });
  for (const d of [...docs, ...py.docs])
    await writeFile(join(process.env.POA_WRITE, d.S.tpl + ' ' + d.fileName), (await buildDocx(d)).buffer);
  console.log(`wrote ${docs.length + py.docs.length} documents to ${process.env.POA_WRITE}`);
}

console.log(`ok — ใบแต่งทนายความ v2, ${docs.length + py.docs.length} documents (JDA + PY), page parity, no marker, no new rPr`);
