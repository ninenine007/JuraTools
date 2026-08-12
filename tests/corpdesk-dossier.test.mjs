import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../corporate-tools/corpdesk.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, 'CorpDesk inline script is present');

const context = vm.createContext({
  Blob,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  console,
  confirm: () => true,
  clearTimeout,
  setTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: { clipboard: {} },
  document: {
    addEventListener: () => {},
    createElement: () => ({ click: () => {} }),
    getElementById: () => ({ classList: { add: () => {}, remove: () => {} } })
  }
});
vm.runInContext(script, context, { filename: 'corpdesk.html' });

const fixture = {
  settings: { pctPrecision: 2 },
  activeId: 'co1',
  companies: [{
    id: 'co1',
    name: 'บริษัท ตัวอย่าง จำกัด',
    parValue: 100,
    padWidth: 4,
    shareholders: [
      { id: 'adam', name: 'นายอาดัม', certificates: [
        { id: 'cert1', shares: 100, certNo: null, rangeStart: null, rangeEnd: null, paidUp: 100 }
      ] },
      { id: 'bean', name: 'นายบีน', certificates: [
        { id: 'cert2', shares: 50, certNo: null, rangeStart: null, rangeEnd: null, paidUp: 100 }
      ] }
    ],
    extraShareholders: [],
    transactions: [{
      id: 'transfer1', type: 'transfer', date: '2024-02-03',
      fromShId: 'adam', toShId: 'bean', certId: 'cert1', shares: 40,
      takeFrom: 'back', issueOrder: 'transferor', mode: 'new',
      paidUp: 75, pricePerShare: 12.5, withDuplicate: true, overrides: {}
    }]
  }]
};

vm.runInContext(`state = ${JSON.stringify(fixture)}`, context);
const dossier = JSON.parse(vm.runInContext('JSON.stringify(buildCorporateDossier())', context));

assert.equal(dossier.format, 'juratools-corporate-dossier');
assert.equal(dossier.v, 1);
assert.equal(dossier.from, 'CorpDesk');
assert.deepEqual(dossier.co, {
  nameTh: 'บริษัท ตัวอย่าง จำกัด',
  th: 'บริษัท ตัวอย่าง จำกัด',
  par: '100', paidUp: '100', regShares: '150', ord: '150', pref: '-', cap: '15000'
});
assert.deepEqual(dossier.people, [
  { nameTh: 'นายอาดัม' },
  { nameTh: 'นายบีน' }
]);

assert.equal(dossier.certs.length, 4, 'the full active and cancelled certificate history is handed off');
assert.deepEqual(dossier.certs[0], {
  no: '1', type: 'ordinary', holderTh: 'นายอาดัม', count: '100', from: '1', to: '100',
  issue: '(*)', cancel: '2024-02-03', replacedBy: '4, 3', par: '100', paid: '100'
});
assert.deepEqual(dossier.certs[2], {
  no: '3', type: 'ordinary', holderTh: 'นายอาดัม', count: '60', from: '1', to: '60',
  issue: '2024-02-03', par: '100', paid: '100'
});
assert.deepEqual(dossier.certs[3], {
  no: '4', type: 'ordinary', holderTh: 'นายบีน', count: '40', from: '61', to: '100',
  issue: '2024-02-03', par: '100', paid: '75'
});

assert.deepEqual(dossier.transfers, [{
  date: '2024-02-03', tfrTh: 'นายอาดัม', tfeTh: 'นายบีน', count: '40',
  from: '61', to: '100', par: '100', paidUp: '75', price: '500'
}]);

const adamEntries = dossier.register.holders[0].entries;
assert.equal(adamEntries.at(-1).balance, '60', 'a reissue row preserves the derived balance');
assert.equal(adamEntries.at(-1).shares, '60');
assert.deepEqual(dossier.register.holders.map(holder => holder.entries.at(-1).balance), ['60', '90']);

const consolidatedFixture = structuredClone(fixture);
consolidatedFixture.companies[0].transactions[0].mode = 'consolidate';
consolidatedFixture.companies[0].transactions[0].consolidateCertId = 'cert2';
vm.runInContext(`state = ${JSON.stringify(consolidatedFixture)}`, context);
const consolidated = JSON.parse(vm.runInContext('JSON.stringify(buildCorporateDossier())', context));
assert.deepEqual(
  { count: consolidated.transfers[0].count, from: consolidated.transfers[0].from, to: consolidated.transfers[0].to },
  { count: '40', from: '61', to: '100' },
  'the transfer instrument receives the moved block, not the consolidated certificate range'
);
assert.deepEqual(
  { count: consolidated.certs[3].count, from: consolidated.certs[3].from, to: consolidated.certs[3].to },
  { count: '90', from: '61', to: '150' },
  'the certificate tool receives the full consolidated certificate'
);
assert.deepEqual(
  consolidated.register.holders.map(holder => holder.entries.at(-1).balance),
  ['60', '90'],
  'the register handoff keeps both holders’ derived balances after consolidation'
);
assert.equal(consolidated.register.holders[1].entries.at(-1).shares, '90');

const increaseFixture = structuredClone(fixture);
increaseFixture.companies[0].transactions = [{
  id: 'increase1', type: 'increase', date: '2024-03-04', spec: 'amount', amountInput: 10,
  pricePerShare: 100, paidUp: 100, rounding: 'remainder', reissueAll: true,
  allocations: [{ shId: 'adam', shares: 10, certNo: null }]
}];
vm.runInContext(`state = ${JSON.stringify(increaseFixture)}`, context);
const increased = JSON.parse(vm.runInContext('JSON.stringify(buildCorporateDossier())', context));
const increasedAdam = increased.register.holders[0].entries;
assert.equal(increasedAdam.some(entry => entry.kind === 'out'), false, 'certificate-only reissues are not share dispositions');
assert.equal(increasedAdam.find(entry => entry.shares === '10').tpl, 'subscribeInc');
assert.equal(increasedAdam.find(entry => entry.shares === '100' && entry.date === '2024-03-04').tpl, 'cancelIssueInc');
assert.equal(increasedAdam.at(-1).balance, '110');

const invalidNumberFixture = structuredClone(fixture);
invalidNumberFixture.companies[0].parValue = 'not a number';
invalidNumberFixture.companies[0].transactions = [];
vm.runInContext(`state = ${JSON.stringify(invalidNumberFixture)}`, context);
const invalidNumberDossier = JSON.parse(vm.runInContext('JSON.stringify(buildCorporateDossier())', context));
assert.equal(invalidNumberDossier.co.par, '(*)');
assert.equal(invalidNumberDossier.co.paidUp, '(*)');
assert.match(invalidNumberDossier.notes.join('\n'), /company par value/);

const certificateHtml = readFileSync(new URL('../corporate-tools/share-certificate.html', import.meta.url), 'utf8');
const registerHtml = readFileSync(new URL('../corporate-tools/share-register-book.html', import.meta.url), 'utf8');
const transferHtml = readFileSync(new URL('../corporate-tools/share-transfer-instrument.html', import.meta.url), 'utf8');
const fieldList = (source, name) => {
  const body = source.match(new RegExp(`const ${name} = \\[([^;]+)\\];`))?.[1] || '';
  return [...body.matchAll(/'([^']+)'/g)].map(match => match[1]);
};
const certFields = new Set(fieldList(certificateHtml, 'DOS_C_FIELDS'));
const holderFields = new Set(fieldList(registerHtml, 'DOS_H_FIELDS'));
const entryFields = new Set(fieldList(registerHtml, 'DOS_E_FIELDS'));
for (const cert of dossier.certs) {
  assert.deepEqual(Object.keys(cert).filter(key => !certFields.has(key)), [], 'certificate keys match its importer');
}
for (const holder of dossier.register.holders) {
  assert.deepEqual(Object.keys(holder).filter(key => key !== 'entries' && !holderFields.has(key)), [], 'holder keys match its importer');
  for (const entry of holder.entries) {
    assert.deepEqual(Object.keys(entry).filter(key => !entryFields.has(key)), [], 'register-entry keys match its importer');
  }
}
for (const key of Object.keys(dossier.transfers[0])) {
  assert.match(transferHtml, new RegExp(`rt\\.${key}\\b`), `transfer field ${key} is read by its importer`);
}
for (const source of [certificateHtml, registerHtml, transferHtml]) {
  assert.match(source, /const DOSSIER_FORMAT = 'juratools-corporate-dossier'/);
}

assert.match(html, /Backup \(JSON\)/, 'the existing backup export remains available');
assert.match(html, /Thai docs \(master-data\.json\)/, 'the existing Thai-docs export remains available');
assert.match(html, /Hand off to share tools \(\.dossier\.json\)/, 'the dossier handoff is explicit in the UI');

let capturedName = '';
context.__captureDownload = (_blob, name) => { capturedName = name; };
vm.runInContext('downloadBlob = __captureDownload; exportDossierJSON()', context);
assert.equal(capturedName, 'บริษัท ตัวอย่าง จำกัด.dossier.json');

console.log('CorpDesk dossier compatibility fixture passed');
