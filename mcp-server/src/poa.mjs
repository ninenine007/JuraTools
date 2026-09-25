/* (๙) ใบแต่งทนายความ · Attorney Appointment, v2
   The browser tool ../litigation-tools/attorney-appointment.html is the source
   of truth. This module runs its engine (src/poa-engine.cjs, copied verbatim by
   `npm run sync-templates`) on its embedded templates (templates/
   attorney-appointment.json), and mirrors the page's own glue — adoptState,
   valuesFor, docs, fileName — line for line from
   ../litigation-tools/_build/attorney-appointment/page.src.html. A document
   produced here and one exported there are the same document, or this module
   is wrong; test/poa.mjs runs the page's own functions against this one.

   Filling only swaps ⟦…⟧ marker text inside the firm's original runs, so
   nothing here builds a run or touches a <w:rPr>. The one exception is the
   engine's own last resort: w:spacing on a value that would otherwise run off
   its line, capped by opts.maxCondense and reported per field. */
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const POAEngine = require('./poa-engine.cjs');
export const { toThai } = POAEngine;

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'attorney-appointment.json');

/* The office's own line on page 2. The page keeps it in the user's browser;
   a server sets it once for the office. A file's firm.officePhone wins. */
const OFFICE_PHONE = process.env.JURATOOLS_OFFICE_PHONE || '';
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THD = '๐๑๒๓๔๕๖๗๘๙';

/* ── Embedded data and engine ─────────────────────────────────── */
let loaded = null;
export async function loadPoa() {
  if (!loaded) {
    const D = JSON.parse(await readFile(DATA, 'utf8'));
    const xml = {};
    for (const k of ['JDA', 'PY'])
      xml[k] = await (await JSZip.loadAsync(D.tpl[k], { base64: true })).file('word/document.xml').async('string');
    loaded = { D, xml, engine: POAEngine.makeEngine(D.widths) };
  }
  return loaded;
}

/* ── State (page: blankClient / blankState / blankLawyer / adoptState) ── */
export const blankClient = () => ({ name: '', role: '', appointer: '', appointerRole: null, appointerSig: null, lawyers: [] });
export function blankState() {
  return {
    tpl: 'PY',
    cse: { matter: '', blackNo: '', blackYear: '', redNo: '', redYear: '', court: '', caseType: 'แพ่ง',
           dateIso: '', day: null, month: null, year: null,
           partyA: '', roleA: 'โจทก์', partyB: '', roleB: 'จำเลย' },
    clients: [blankClient()],
    firm: { officePhone: null },
    opts: { thaiDigits: true, maxCondense: 15 }
  };
}
export const blankLawyer = () => ({ key: '', name: '', idNo: '', licenseNo: '', phone: '', email: '' });

export function adoptState(st = {}) {
  const b = blankState();
  const out = Object.assign(b, st);
  out.cse = Object.assign(blankState().cse, st.cse || {});
  out.firm = Object.assign(blankState().firm, st.firm || {});
  out.opts = Object.assign(blankState().opts, st.opts || {});
  out.clients = (st.clients && st.clients.length ? st.clients : [blankClient()]).map(c => Object.assign(blankClient(), c));
  if (out.tpl !== 'JDA' && out.tpl !== 'PY') out.tpl = 'PY';
  return out;
}

/* The page merges a file's lawyers into the browser's directory: match by key
   or name, fill blanks, never overwrite. Here the directory starts empty. */
function mergeLawyers(law, list) {
  (list || []).forEach(n => {
    n = Object.assign(blankLawyer(), n);
    const hit = law.filter(l => (n.key && l.key === n.key) || (n.name && norm(l.name) === norm(n.name)))[0];
    if (!hit) { law.push(n); return; }
    Object.keys(blankLawyer()).forEach(k => { if (!norm(hit[k]) && norm(n[k])) hit[k] = n[k]; });
  });
  return law;
}

function fromV1Lawyer(l) {
  const cur = l.cur || {};
  return Object.assign(blankLawyer(), { key: l.key || '', name: l.name || '', idNo: l.idNo || '', licenseNo: l.licenseNo || '',
    phone: cur.tel && cur.tel !== '-' ? cur.tel : '', email: cur.email && cur.email !== '-' ? cur.email : '' });
}
function fromV1(o) {
  const cse = o.cse || o.case || {};
  const st = blankState();
  Object.keys(st.cse).forEach(k => { if (cse[k] != null && k !== 'day' && k !== 'month' && k !== 'year') st.cse[k] = cse[k]; });
  if (cse.dateAuto === false) { st.cse.day = cse.day || ''; st.cse.month = cse.month || ''; st.cse.year = cse.year || ''; }
  st.cse.matter = o.matter || '';
  const byId = {};
  (o.lawyers || []).forEach(l => { byId[l.id] = l.key; });
  const ap = o.appts || o.appointments || [];
  st.clients = (ap.length ? ap : [{}]).map(a => {
    const keys = (a.lawyers || []).concat((a.lawyerIds || []).map(id => byId[id])).filter(Boolean);
    return Object.assign(blankClient(), { name: a.client || '', role: a.clientRole || '', appointer: a.appointer || '',
      appointerRole: a.appointerAuto === false ? (a.appointerRole || '') : null,
      appointerSig: a.sigAuto === false ? (a.appointerSig || '') : null, lawyers: keys });
  });
  st.tpl = ap.some(a => a.side === 'defendant') ? 'JDA' : 'PY';
  return { state: st, lawyers: (o.lawyers || []).map(fromV1Lawyer) };
}

/* Accepts what the page opens: a v2 .poa.json ({tool, version: 2, state,
   lawyers}), the bare {state, lawyers}, or a v1 file. Nothing is invented — a
   missing value stays empty. */
export function normalize(input = {}) {
  const inc = input.state ? { state: input.state, lawyers: input.lawyers || [] }
    : (input.format === 'juratools-attorney-appointment' || input.cse || input.appts) ? fromV1(input)
    : { state: {}, lawyers: input.lawyers || [] };
  return { state: adoptState(inc.state), lawyers: mergeLawyers([], inc.lawyers) };
}

/* ── Derivations (page: norm … courtOf) ───────────────────────── */
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const toArab = s => String(s || '').replace(/[๐-๙]/g, c => String(THD.indexOf(c)));
const yy = s => { const d = toArab(s).replace(/\D/g, ''); return d.length >= 3 ? d.slice(-2) : d; };

function autoAppointerRole(c) {
  const role = norm(c.role);
  if (!role) return '';
  if (norm(c.appointer) && norm(c.appointer) === norm(c.name)) return role;   // the client signs for itself
  return 'ผู้รับมอบอำนาจ' + role;
}
function autoAppointerSig(c) {
  const a = norm(c.appointer);
  const m = a.match(/\sโดย\s*(.+)$/);          // "บริษัท … จำกัด โดยนาย… ผู้รับมอบอำนาจ" → "นาย… ผู้รับมอบอำนาจ"
  return m ? m[1] : a;
}
export const appointerRoleOf = c => c.appointerRole != null ? c.appointerRole : autoAppointerRole(c);
export const appointerSigOf = c => c.appointerSig != null ? c.appointerSig : autoAppointerSig(c);

function autoDate(S) {
  const iso = S.cse.dateIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { day: '', month: '', year: '' };
  const p = iso.split('-');
  return { day: String(+p[2]), month: MONTHS[+p[1] - 1], year: String(+p[0] + 543).slice(-2) };
}
const dateOf = (S, k) => S.cse[k] != null ? S.cse[k] : autoDate(S)[k];
const officePhone = S => S.firm.officePhone != null ? S.firm.officePhone : OFFICE_PHONE;
const courtOf = S => norm(S.cse.court).replace(/^ศาล\s*/, '');

/* One client × one lawyer → the value of every field in the spec. */
export function valuesFor(S, c, l) {
  const cs = S.cse; l = l || blankLawyer();
  return {
    blackNo: norm(cs.blackNo), blackYear: yy(cs.blackYear), redNo: norm(cs.redNo), redYear: yy(cs.redYear),
    court: courtOf(S), day: norm(dateOf(S, 'day')), month: norm(dateOf(S, 'month')), year: yy(dateOf(S, 'year')),
    caseType: norm(cs.caseType), partyA: norm(cs.partyA), roleA: norm(cs.roleA), partyB: norm(cs.partyB), roleB: norm(cs.roleB),
    appointer: norm(c.appointer), appointerRole: norm(appointerRoleOf(c)), appointerSig: norm(appointerSigOf(c)),
    lawyerA: norm(l.name), lawyerB: norm(l.name), lawyerC: norm(l.name), lawyerD: norm(l.name), certifier: norm(l.name),
    idNo: l.idNo, licenseNo: norm(l.licenseNo), phone: norm(l.phone), email1: norm(l.email), email2: norm(l.email),
    officePhone: norm(officePhone(S)), client: norm(c.name), clientRole: norm(c.role)
  };
}
export const fillOpts = S => ({ thaiDigits: S.opts.thaiDigits !== false, condense: S.opts.maxCondense > 0, maxCondense: S.opts.maxCondense });

// Thai national ID check digit (mod 11)
export function idValid(s) {
  const d = toArab(s).replace(/\D/g, '');
  if (d.length !== 13) return false;
  let t = 0; for (let i = 0; i < 12; i++) t += (+d[i]) * (13 - i);
  return (11 - t % 11) % 10 === +d[12];
}

/* ── Documents: one per client per lawyer (page: docs / fileName) ─── */
const safe = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
export function fileNameOf(S, d) {
  const m = norm(S.cse.matter);
  const who = norm(d.c.role) || norm(d.c.name) || 'ลูกความ';
  return safe((m ? m + ' - ' : '') + 'ใบแต่งทนายความ - ' + who + ' ' + (d.l.key || d.l.name)) + '.docx';
}

/* A client whose lawyer keys match no one produces nothing, as in the page;
   `unmatched` says which keys, so a caller can report them. */
export function documentsOf(input) {
  const { state: S, lawyers: LAW } = normalize(input);
  const byKey = k => LAW.filter(l => l.key === k)[0] || null;
  const docs = [], unmatched = [];
  S.clients.forEach((c, ci) => {
    (c.lawyers || []).forEach(k => {
      const l = byKey(k);
      if (l) docs.push({ S, c, ci, l, fileName: fileNameOf(S, { c, l }) });
      else unmatched.push({ client: ci, key: k });
    });
  });
  return { state: S, lawyers: LAW, docs, unmatched };
}

export const FIELD_TH = { blackNo: 'คดีดำ', blackYear: 'ปีคดีดำ', redNo: 'คดีแดง', redYear: 'ปีคดีแดง', court: 'ศาล', day: 'วันที่', month: 'เดือน',
  year: 'ปี', caseType: 'ความ', partyA: 'คู่ความบรรทัดบน', roleA: 'ฐานะบรรทัดบน', partyB: 'คู่ความบรรทัดล่าง', roleB: 'ฐานะบรรทัดล่าง',
  appointer: 'ข้าพเจ้า (ผู้แต่ง)', appointerRole: 'ฐานะผู้แต่ง', appointerSig: 'ชื่อใต้ลายมือชื่อผู้แต่ง',
  lawyerA: 'ชื่อทนาย (ขอแต่งให้)', lawyerB: 'ชื่อทนาย (ยอมรับผิดชอบ)', lawyerC: 'ชื่อทนาย (หน้า ๒)', lawyerD: 'ชื่อทนาย (ลงนามหน้า ๒)',
  certifier: 'ชื่อทนาย (ผู้รับรอง)', idNo: 'เลขประจำตัวประชาชน', licenseNo: 'เลขใบอนุญาต', phone: 'โทรศัพท์', email1: 'อีเมล',
  email2: 'อีเมล (สำนักงาน)', officePhone: 'โทรศัพท์สำนักงาน', client: 'ขอรับเป็นทนายความของ', clientRole: 'ฐานะลูกความ' };

export function summarise(rep) {
  const over = [], cond = [];
  Object.keys(rep).forEach(id => {
    const r = rep[id];
    if (!r.fits) over.push(id); else if (r.condense) cond.push(id);
  });
  return { over, cond, level: over.length ? 'over' : cond.length ? 'cond' : 'ok' };
}

/* The engine's run(): filled document.xml plus the per-field fit report. */
export async function fillDocument(d) {
  const { D, xml, engine } = await loadPoa();
  const r = engine.fill(xml[d.S.tpl], D.spec[d.S.tpl], valuesFor(d.S, d.c, d.l), fillOpts(d.S));
  return { ...r, summary: summarise(r.report), blank: Object.keys(r.report).filter(id => r.report[id].empty) };
}

export async function buildDocx(d) {
  const { D } = await loadPoa();
  const r = await fillDocument(d);
  const zip = await JSZip.loadAsync(D.tpl[d.S.tpl], { base64: true });
  zip.file('word/document.xml', r.xml);
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), ...r };
}

/* ── The MCP tool's work, shared by every server that runs this module ─────
   The tool's input (English keys, schema in tools.mjs) → the page's state. */
export const toPoaState = a => ({
  state: {
    tpl: a.form,
    cse: {
      matter: a.case?.matter ?? '', blackNo: a.case?.blackNo ?? '', blackYear: a.case?.blackYear ?? '',
      redNo: a.case?.redNo ?? '', redYear: a.case?.redYear ?? '', court: a.case?.court ?? '',
      caseType: a.case?.caseType ?? 'แพ่ง', dateIso: a.case?.date ?? '', day: null, month: null, year: null,
      partyA: a.case?.partyTop ?? '', roleA: a.case?.partyTopRole ?? 'โจทก์',
      partyB: a.case?.partyBottom ?? '', roleB: a.case?.partyBottomRole ?? 'จำเลย'
    },
    clients: (a.clients || []).map(c => ({
      name: c.name, role: c.role, appointer: c.appointer ?? '',
      appointerRole: c.appointerCapacity ?? null, appointerSig: c.signatureName ?? null, lawyers: c.lawyers || []
    })),
    firm: { officePhone: a.officePhone ?? null },
    opts: { thaiDigits: true, maxCondense: Math.round((a.maxCondensePt ?? 0.75) * 20) }
  },
  lawyers: (a.lawyers || []).map(l => ({ key: l.key, name: l.name, idNo: l.idNumber ?? '', licenseNo: l.licenseNumber ?? '', phone: l.phone ?? '', email: l.email ?? '' }))
});

/* Blanks worth telling the lawyer about; the red number is normally empty. */
const QUIET_BLANKS = new Set(['redNo', 'redYear']);
const pt = tw => Math.round(tw / 2) / 10;

/* One call → every document built, with what the lawyer must be told. Used by
   create_attorney_appointment here and, through Node, by the firm's Python MCP
   server (juraXjk-legal-doc-mcp), so both report the same thing. */
export async function attorneyAppointmentJob(args) {
  const { docs, unmatched, lawyers } = documentsOf(toPoaState(args));
  const documents = [];
  const blank = new Set();
  for (const d of docs) {
    const r = await buildDocx(d);
    r.blank.filter(id => !QUIET_BLANKS.has(id)).forEach(id => blank.add(FIELD_TH[id] || id));
    const condensed = r.summary.cond.map(id => ({ field: id, label: FIELD_TH[id] || id, points: pt(r.report[id].condense) }));
    const overflow = r.summary.over.map(id => ({ field: id, label: FIELD_TH[id] || id, overByPoints: pt(r.report[id].need || 0) }));
    documents.push({
      fileName: d.fileName, buffer: r.buffer, client: d.c.name, clientRole: d.c.role, lawyer: d.l.name,
      fileSizeKB: Math.round(r.buffer.length / 1024),
      fit: overflow.length ? 'overflow' : condensed.length ? 'condensed' : 'ok', condensed, overflow
    });
  }
  return {
    form: args.form,
    withdrawalWording: args.form === 'JDA' ? 'การถอนคำให้การ' : 'การถอนฟ้อง',
    documents,
    blankFields: [...blank],
    unmatchedLawyerKeys: [...new Set(unmatched.map(u => u.key))],
    invalidIdNumbers: lawyers.filter(l => l.idNo && !idValid(l.idNo)).map(l => l.name || l.key)
  };
}
