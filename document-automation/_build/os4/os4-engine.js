/* os4-engine.js — แบบ อ.ส.4 แบบขอเสียอากรแสตมป์เป็นตัวเงิน, filled for a share transfer instrument.

   Scope: SHARE TRANSFER INSTRUMENTS ONLY — schedule item 2 and its duplicates (item 23). The form
   itself serves every instrument paid in cash; another instrument (a lease, item 1; hire of work,
   item 4; a loan, item 5 …) would need its own rows, rate, payer and deadline in plan() — the PDF
   half (create) is the form's and serves any of them unchanged.

   Shared verbatim by document-automation/os4-share-transfer.html (inlined by assemble.py) and the
   firm's private MCP server (copied by its scripts/sync_juratools.py). UMD: window.OS4Engine in
   the page, module.exports under Node. No DOM, no I/O — input in, field values / PDF bytes out.

   Two halves:
   - plan(input)            the form's contents: who pays, the stamp duty, every field's value,
                            and what the lawyer must be told. Pure JS, no font, no PDF.
   - create(assets).pdf()   the Revenue Department's own blank form with those values in it.

   The PDF is the RD's file untouched, followed by an incremental update (ISO 32000-1 §7.5.6):
   new versions of the widgets filled — /V and an appearance stream (/AP) each — one embedded font,
   and a cross-reference stream whose /Prev is the RD's own. The RD's bytes, fields, scripts and
   layout are exactly as published and remain a prefix of every file this writes; its number
   formats (AFNumber_Format) and TIN mask (AFSpecial_KeystrokeEx) keep working in Acrobat, and the
   appearance each field is given is what those scripts would show. The form computes nothing
   itself — its scripts only format — so every figure is worked out here.

   Law implemented
   - ประมวลรัษฎากร บัญชีอัตราอากรแสตมป์ ลักษณะแห่งตราสาร 2 (โอนหุ้น): 1 baht per 1,000 baht or part of
     1,000 of the paid-up value of the shares or the price in the instrument, whichever is greater;
     ผู้ต้องเสียอากร = ผู้โอน.
   - ลักษณะแห่งตราสาร 23 (คู่ฉบับ): 1 baht where the original's duty is 5 baht or less, else 5; where
     there is another party to the instrument, that party is liable (RD table of instruments for
     cash payment, 10 Aug 2018). One form paid by one party for both rows = the RD guide's
     example 2 (the contract puts all duty on one side) — the firm's practice and the default.
   - มาตรา 113 (เงินเพิ่มอากร, paid late of one's own accord): within 15 days none; over 15 up to
     90 days 2× or 4 baht; over 90 days 5× or 10 baht, whichever is greater. มาตรา 114: 6×/25,
     6×/25 on the shortfall, 1×/25 — the officer's cases, offered for completeness.
   - มาตรา 103 / RD guide to อ.ส.4 (15 Aug 2018): cash payment on form อ.ส.4 at any area office;
     an instrument outside items 1, 4 and 28(ค) is filed "before or at the time it is made".
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OS4Engine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;

  // ── Input errors ──────────────────────────────────────────────────────────
  /* A mistake the caller must put right. The MCP turns it into "Input problem — …"; the page
     shows it next to the form. Always names the field and says what to send. */
  class InputError extends Error {
    constructor(field, message) { super(field ? field + ': ' + message : message); this.field = field; this.input = true; }
  }

  // ── Text helpers ──────────────────────────────────────────────────────────
  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
  function arabicDigits(s) { return String(s).replace(/[๐-๙]/g, c => String(THAI_DIGITS.indexOf(c))); }
  function clean(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/[​ \t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  }
  const has = v => clean(v) !== '';
  /* A company, partnership or other body signs through a director — its own name is not the signer's. */
  const isJuristic = name => /^(บริษัท|บจก\.|บมจ\.|ห้างหุ้นส่วน|หจก\.|มูลนิธิ|สมาคม|สหกรณ์|ธนาคาร)|\b(limited|ltd\.?|inc\.?|corp\.?|corporation|company|co\.,?|llc|l\.l\.c\.|gmbh|pte\.?|plc|b\.v\.|n\.v\.|s\.a\.|ag)\b/i.test(clean(name));

  // ── Exact money: fractions of BigInt ─────────────────────────────────────
  /* Stamp duty rounds UP per started 1,000 baht, so a float that lands a hair above an exact
     multiple would add a baht. Amounts are kept as exact fractions n/d throughout. */
  const B0 = BigInt(0), B1 = BigInt(1), B10 = BigInt(10), B100 = BigInt(100), B1000 = BigInt(1000);
  function frac(n, d) { if (d < B0) { n = -n; d = -d; } const g = gcd(n < B0 ? -n : n, d) || B1; return { n: n / g, d: d / g }; }
  function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
  function fMul(a, b) { return frac(a.n * b.n, a.d * b.d); }
  function fDiv(a, b) { return frac(a.n * b.d, a.d * b.n); }
  function fCmp(a, b) { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; }
  function fCeil(a) { const q = a.n / a.d; return (a.n % a.d === B0 || a.n < B0) ? q : q + B1; }
  function fInt(n) { return { n: BigInt(n), d: B1 }; }
  /* "9,431,062.35", "๑๒,๐๐๐", "300000 บาท", 1000 → exact fraction; '' → null. */
  function parseAmount(v, field) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') {
      if (!isFinite(v) || v < 0) throw new InputError(field, 'send a positive number of baht, e.g. 300000');
      v = String(v);
    }
    let s = arabicDigits(String(v)).replace(/บาท|หุ้น|shares?|baht|thb|[,\s฿]/gi, '');
    if (s === '' || s === '-') return null;
    const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) throw new InputError(field, `"${v}" is not an amount — send digits, e.g. 300000 or 9431062.35`);
    const dec = m[2] || '';
    return frac(BigInt(m[1] + dec), B10 ** BigInt(dec.length));
  }
  function parseCount(v, field) {
    const a = parseAmount(v, field);
    if (a === null) return null;
    if (a.d !== B1) throw new InputError(field, `"${v}" is not a whole number`);
    return a.n;
  }
  /* A fraction as baht + satang strings for the form's paired columns (satang rounded half up). */
  function bahtSatang(a) {
    const satang = (a.n * B100 * B10 / a.d + BigInt(5)) / B10;       // half up at the third decimal
    const exact = (a.n * B100) % a.d === B0;
    return { baht: String(satang / B100), satang: String(satang % B100).padStart(2, '0'), exact };
  }
  function fStr(a) {           // for reports: "9431062.35"
    const { baht, satang } = bahtSatang(a);
    return satang === '00' ? baht : baht + '.' + satang;
  }
  const grouped = s => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ── Dates ─────────────────────────────────────────────────────────────────
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  /* 'YYYY-MM-DD' (Christian era). Tolerated and reported: a Buddhist-era year written in full,
     D/M/YYYY. Refused: a two-digit year. `partial` allows 'YYYY-MM' and 'YYYY'. */
  function parseDate(v, field, notes, partial) {
    if (v === undefined || v === null || clean(v) === '') return null;
    const s = arabicDigits(clean(v));
    let y, m = null, d = null, m1;
    if ((m1 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m1[1]; m = +m1[2]; d = +m1[3]; }
    else if ((m1 = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s))) { d = +m1[1]; m = +m1[2]; y = +m1[3]; }
    else if (partial && (m1 = /^(\d{4})-(\d{1,2})$/.exec(s))) { y = +m1[1]; m = +m1[2]; }
    else if (partial && (m1 = /^(\d{4})$/.exec(s))) { y = +m1[1]; }
    else if (/^\d{1,2}[/.]\d{1,2}[/.]\d{2}$/.test(s)) throw new InputError(field, `"${v}" has a two-digit year — send YYYY-MM-DD, e.g. 2026-01-15`);
    else throw new InputError(field, `"${v}" is not a date — send YYYY-MM-DD (Christian era), e.g. 2026-01-15`);
    if (y >= 2400) { if (notes) notes.push(`${field}: ${y} read as the Buddhist-era year ${y} = ${y - 543} CE`); y -= 543; }
    if (y < 1900 || y > 2200) throw new InputError(field, `year ${y} is out of range — send YYYY-MM-DD in the Christian era`);
    if (m !== null && (m < 1 || m > 12)) throw new InputError(field, `month ${m} does not exist`);
    if (d !== null) {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (d < 1 || d > last) throw new InputError(field, `${String(y)}-${String(m).padStart(2, '0')} has no day ${d}`);
    }
    return { y, m, d };
  }
  const thaiDate = t => t ? (t.d ? t.d + ' ' : '') + (t.m ? TH_MONTHS[t.m - 1] + ' ' : '') + (t.y + 543) : '';
  const isoDate = t => t ? [t.y, String(t.m || 1).padStart(2, '0'), String(t.d || 1).padStart(2, '0')].join('-') : '';
  function daysBetween(a, b) { return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000); }

  // ── เลขประจำตัวผู้เสียภาษีอากร ───────────────────────────────────────────
  /* 13 digits — a Thai national ID for a person, the registration number for a Thai juristic
     person; the last digit is a mod-11 check digit over the first twelve. */
  function tinDigits(v) { return arabicDigits(String(v || '')).replace(/[^0-9]/g, ''); }
  function tinValid(d) {
    if (!/^\d{13}$/.test(d)) return false;
    let s = 0;
    for (let i = 0; i < 12; i++) s += (+d[i]) * (13 - i);
    return (11 - s % 11) % 10 === +d[12];
  }
  const tinFormat = d => d.length === 13 ? `${d[0]} ${d.slice(1, 5)} ${d.slice(5, 10)} ${d.slice(10, 12)} ${d[12]}` : d;

  // ── Thai address → the form's thirteen boxes ─────────────────────────────
  const ADDRESS_PARTS = ['building', 'room', 'floor', 'village', 'no', 'moo', 'soi', 'yaek', 'road',
    'subdistrict', 'district', 'province', 'postcode'];
  const ADDRESS_LABELS = {
    building: 'อาคาร', room: 'ห้องเลขที่', floor: 'ชั้นที่', village: 'หมู่บ้าน', no: 'เลขที่', moo: 'หมู่ที่',
    soi: 'ตรอก/ซอย', yaek: 'แยก', road: 'ถนน', subdistrict: 'ตำบล/แขวง', district: 'อำเภอ/เขต',
    province: 'จังหวัด', postcode: 'รหัสไปรษณีย์'
  };
  /* Longest keyword first, so หมู่บ้าน is not read as หมู่ + บ้าน and ห้องเลขที่ not as เลขที่. */
  const ADDRESS_KEYS = [
    ['village', 'หมู่บ้าน'], ['village', 'มบ.'], ['no', 'บ้านเลขที่'], ['room', 'ห้องเลขที่'], ['room', 'ห้องที่'],
    ['no', 'เลขที่'], ['moo', 'หมู่ที่'], ['moo', 'หมู่'], ['moo', 'ม.'], ['room', 'ห้อง'], ['floor', 'ชั้นที่'],
    ['floor', 'ชั้น'], ['building', 'อาคาร'], ['building', 'ตึก'], ['soi', 'ซอย'], ['soi', 'ตรอก'], ['soi', 'ซ.'],
    ['yaek', 'แยก'], ['road', 'ถนน'], ['road', 'ถ.'], ['subdistrict', 'แขวง'], ['subdistrict', 'ตำบล'],
    ['subdistrict', 'ต.'], ['district', 'อำเภอ'], ['district', 'เขต'], ['district', 'อ.'],
    ['province', 'จังหวัด'], ['province', 'จ.']
  ];
  const BANGKOK = /(?:^|[\s,])(กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\.?)(?=$|[\s,]|\d)/;
  /* One line as the firm writes it — "10/5 ซอยสมมุติ 3 แขวงทดสอบ เขตทดลอง กรุงเทพมหานคร
     10500" — into the boxes. A keyword counts only at the start of a word (after a space, comma,
     digit or bracket), so a place name that happens to contain one is not cut. What cannot be
     placed is returned in `rest`, never dropped. */
  function splitAddress(line) {
    const parts = {};
    ADDRESS_PARTS.forEach(k => { parts[k] = ''; });
    let s = clean(line);
    const rest = [];
    if (!s) return { parts, rest, complete: false };
    let m = /(?:^|[\s,])(\d{5})\s*$/.exec(s);
    if (m) { parts.postcode = m[1]; s = s.slice(0, m.index).trim(); }
    m = BANGKOK.exec(s);
    if (m) { parts.province = 'กรุงเทพมหานคร'; s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim(); }
    const hits = [];
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && !/[\s,()\d]/.test(s[i - 1])) continue;
      const k = ADDRESS_KEYS.find(([, w]) => s.startsWith(w, i));
      if (k) { hits.push({ key: k[0], at: i, end: i + k[1].length }); i += k[1].length - 1; }
    }
    const lead = clean(s.slice(0, hits.length ? hits[0].at : s.length)).replace(/,$/, '').trim();
    if (lead) {
      const n = /^(\d[\d/\-]*)\s*(.*)$/.exec(lead);
      if (n && !parts.no) { parts.no = n[1]; if (n[2]) rest.push(n[2]); }
      else rest.push(lead);
    }
    hits.forEach((h, i) => {
      const val = clean(s.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : s.length)).replace(/^[.:]\s*/, '').replace(/[,\s]+$/, '');
      if (!val) return;
      if (parts[h.key]) rest.push(val); else parts[h.key] = val;
    });
    const complete = !rest.length && !!(parts.no && (parts.subdistrict || parts.district) && parts.province);
    return { parts, rest, complete };
  }

  // ── Stamp duty ────────────────────────────────────────────────────────────
  /* The ids, multipliers and minimums are the Stamp Duty Calculator's own (tax-tools). */
  const SURCHARGE_MODES = {
    normal: { label: 'Paid on time — no surcharge', mult: 0, min: 0, law: 'No เงินเพิ่มอากร.' },
    s113_15: { label: 'ม.113 — paid late of one\'s own accord, within 15 days', mult: 0, min: 0, law: 'Within 15 days: the duty only.' },
    s113_90: { label: 'ม.113 — over 15 days, up to 90 days late', mult: 2, min: 4, law: '2× the duty or 4 baht, whichever is greater.' },
    s113_over90: { label: 'ม.113 — over 90 days late', mult: 5, min: 10, law: '5× the duty or 10 baht, whichever is greater.' },
    s114_no_stamp: { label: 'ม.114 — found by an officer, no stamp at all', mult: 6, min: 25, law: '6× the duty or 25 baht, whichever is greater.' },
    s114_other: { label: 'ม.114 — found by an officer, other cases', mult: 1, min: 25, law: '1× the duty or 25 baht, whichever is greater.' }
  };
  function surchargeFor(duty, mode) {
    const m = SURCHARGE_MODES[mode] || SURCHARGE_MODES.normal;
    if (!duty || !m.mult) return 0;
    return Math.max(m.mult * duty, m.min);
  }
  /* The mode the dates point to, when the lawyer has not chosen one: the duty on a share transfer
     instrument falls due when it is made (RD guide: "ก่อนกระทำ หรือในทันทีที่ทำตราสาร"). */
  function suggestedMode(instrumentDate, filingDate) {
    if (!instrumentDate || !filingDate || !instrumentDate.d || !filingDate.d) return null;
    const late = daysBetween(instrumentDate, filingDate);
    if (late <= 0) return { mode: 'normal', days: late };
    if (late <= 15) return { mode: 's113_15', days: late };
    if (late <= 90) return { mode: 's113_90', days: late };
    return { mode: 's113_over90', days: late };
  }

  function computeDuty(sh, valueOverride, counterparts, overrides, notes, draft) {
    const count = parseCount(sh.count, 'shares.count');
    const par = parseAmount(sh.parValue, 'shares.parValue');
    const pct = parseAmount(has(sh.paidUpPercent) ? sh.paidUpPercent : 100, 'shares.paidUpPercent');
    if (pct && fCmp(pct, fInt(100)) > 0) throw new InputError('shares.paidUpPercent', 'a percentage of par, 100 or less');
    let price = parseAmount(sh.price, 'shares.price');
    const perShare = parseAmount(sh.pricePerShare, 'shares.pricePerShare');
    if (price === null && perShare !== null) {
      if (count === null) throw new InputError('shares.count', 'needed to turn pricePerShare into the price');
      price = fMul(perShare, fInt(count));
    }
    let paidUp = null;
    if (count !== null && par !== null) paidUp = fDiv(fMul(fMul(fInt(count), par), pct), fInt(100));
    let basis = null, basisFrom = '';
    const override = parseAmount(valueOverride, 'value');
    if (override !== null) { basis = override; basisFrom = 'given'; }
    else if (price !== null && paidUp !== null) { basis = fCmp(price, paidUp) >= 0 ? price : paidUp; basisFrom = fCmp(price, paidUp) >= 0 ? 'price' : 'paidUp'; }
    else if (price !== null) { basis = price; basisFrom = 'price'; }
    else if (paidUp !== null) { basis = paidUp; basisFrom = 'paidUp'; }
    if (basis === null && draft) return { count: count === null ? null : String(count), parValue: par && fStr(par), paidUpPercent: pct && fStr(pct), price, paidUp, basis: null, basisFrom: '', counterparts, perCopy: null, auto: { original: null, counterpart: null }, original: null, counterpart: null };
    if (basis === null) throw new InputError('shares', 'send the price (price or pricePerShare) and/or count + parValue (+ paidUpPercent), or value');
    const dutyOriginal = Number(fCeil(fDiv(basis, fInt(1000))));     // 1 baht per 1,000 or part of 1,000
    const perCopy = dutyOriginal <= 5 ? 1 : 5;
    const auto = { original: dutyOriginal, counterpart: perCopy * counterparts };
    const ov = overrides || {};
    const original = has(ov.original) ? Number(parseCount(ov.original, 'duty.original')) : auto.original;
    const counterpart = has(ov.counterpart) ? Number(parseCount(ov.counterpart, 'duty.counterpart')) : auto.counterpart;
    if (original !== auto.original) notes.push(`duty on the original set by hand to ${original} baht (worked out: ${auto.original})`);
    if (counterpart !== auto.counterpart) notes.push(`duty on the duplicate set by hand to ${counterpart} baht (worked out: ${auto.counterpart})`);
    return {
      count: count === null ? null : String(count), parValue: par && fStr(par), paidUpPercent: pct && fStr(pct),
      price, paidUp, basis, basisFrom, counterparts, perCopy,
      auto, original, counterpart
    };
  }

  // ── The form's fields ─────────────────────────────────────────────────────
  const PARTY_FIELDS = {
    payer: { name: 'Text1.5', tin: 'Num1', branch: 'Text1.6', building: 'Text1.7', room: 'Text1.8', floor: 'Text1.9',
      village: 'Text1.10', no: 'Text1.11', moo: 'Text1.12', soi: 'Text1.13', yaek: 'Text1.14', road: 'Text1.15',
      subdistrict: 'Text1.16', district: 'Text1.17', province: 'Text1.18', postcode: 'Text1.19' },
    party: { name: 'Text1.20', tin: 'Num2', branch: 'Text1.21', building: 'Text1.22', room: 'Text1.23', floor: 'Text1.24',
      village: 'Text1.25', no: 'Text1.26', moo: 'Text1.27', soi: 'Text1.28', yaek: 'Text1.29', road: 'Text1.30',
      subdistrict: 'Text1.31', district: 'Text1.32', province: 'Text1.33', postcode: 'Text1.34' }
  };
  const FIELD = {
    office: 'Text1.1', fileDay: 'Text1.2', fileMonth: 'Text1.3', fileYear: 'Text1.4',
    otherText: 'Text1.35', contractNo: 'Text1.36', contractDate: 'Text1.37', contractStart: 'Text1.38',
    contractEnd: 'Text1.39', receivedDate: 'Text1.40', origNo: 'Text1.41', origDate: 'Text1.42',
    origValue: 'Text1.43', origPaidDate: 'Text1.44', receiptNo: 'Text1.45', os5No: 'Text1.46',
    notSubmittedReason: 'Text6.1', signerName: 'Text6.2', signerPosition: 'Text6.3'
  };
  const ROW_PREFIX = ['Text2', 'Text3', 'Text4'];
  const TOTAL = 'Text5';
  /* Entries the firm's own forms centre on their dotted line (it typed leading spaces); the
     option does the same, measured. Names stay where the form puts them. */
  const CENTRED = new Set([FIELD.fileMonth, FIELD.contractNo, FIELD.contractDate,
    FIELD.contractStart, FIELD.contractEnd, FIELD.receivedDate, FIELD.signerName, FIELD.signerPosition,
    ...['payer', 'party'].flatMap(p => ADDRESS_PARTS.filter(k => k !== 'postcode').map(k => PARTY_FIELDS[p][k]))]);

  const DEFAULT_OPTIONS = {
    dashes: true,           // "-" in an address box that does not apply (every sample does)
    centre: true,           // centre short entries on their line (most samples do)
    noTin: 'zeros',         // a party without a Thai TIN: 'zeros' (0 0000 00000 00 0, as the firm did) or 'blank'
    officerColumns: true,   // fill สำหรับเจ้าหน้าที่ — duty, surcharge, total (the firm's practice); rate stays blank
    itemDots: true,         // ข้อ written "2." and "23." (RD guide)
    totalCount: true,       // รวม จำนวนตราสาร (RD guide)
    counterpartValue: 'zero' // the duplicate's มูลค่า: 'zero' (0 | 00, the firm) or 'blank' (RD guide)
  };

  function normParty(p, who, notes, warnings, opts) {
    p = p || {};
    const name = clean(p.name || p.nameTh || p.nameThai);
    let tin = tinDigits(p.tin || p.taxId || p.idNo);
    let foreign = !!p.foreign || /^(none|-|ไม่มี)$/i.test(clean(p.tin));
    if (tin && /^0+$/.test(tin)) { tin = ''; foreign = true; }       // 0 0000 00000 00 0 — the firm's "none"
    if (tin && tin.length !== 13) throw new InputError(`${who}.tin`, `"${p.tin}" has ${tin.length} digits — a Thai tax ID has 13 (or send "none" for a party without one)`);
    if (tin && !tinValid(tin)) warnings.push(`${who}: tax ID ${tinFormat(tin)} fails its check digit — check it against the ID card / affidavit`);
    let tinOut = tin ? tinFormat(tin) : '';
    if (!tin && foreign && opts.noTin === 'zeros') { tinOut = '0 0000 00000 00 0'; notes.push(`${who}: no Thai tax ID — printed as 0 0000 00000 00 0`); }
    const branch = tinDigits(p.branch);
    if (branch && branch.length > 5) throw new InputError(`${who}.branch`, 'สาขาที่ has five digits, e.g. 00000 for a head office');
    let addr = {};
    ADDRESS_PARTS.forEach(k => { addr[k] = ''; });
    let split = null;
    const a = p.address !== undefined ? p.address : (p.addressThai || p.addrTh);
    if (typeof a === 'string') {
      split = splitAddress(a);
      addr = split.parts;
      if (split.rest.length) warnings.push(`${who}: part of the address could not be placed in a box — "${split.rest.join('", "')}" — send the address as parts`);
      notes.push(`${who}: address split — ` + ADDRESS_PARTS.filter(k => addr[k]).map(k => `${ADDRESS_LABELS[k]} ${addr[k]}`).join(' · '));
    } else if (a && typeof a === 'object') {
      ADDRESS_PARTS.forEach(k => { addr[k] = clean(a[k]); });
      Object.keys(a).forEach(k => { if (!ADDRESS_PARTS.includes(k)) throw new InputError(`${who}.address.${k}`, 'unknown part — use ' + ADDRESS_PARTS.join(', ')); });
    }
    if (addr.postcode && !/^\d{5}$/.test(tinDigits(addr.postcode))) warnings.push(`${who}: postcode "${addr.postcode}" is not five digits`);
    addr.postcode = tinDigits(addr.postcode).slice(0, 5);
    return { name, tin: tinOut, tinDigits: tin, branch, addr, foreign, split };
  }

  /* The input as the MCP and the page send it → everything the form will say. */
  function plan(input) {
    input = input || {};
    const notes = [], warnings = [], blanks = [];
    const opts = Object.assign({}, DEFAULT_OPTIONS, input.options || {});
    const draft = !!input.draft;          // the page's live preview: blanks stay blank instead of stopping the plan
    const tfr = normParty(input.transferor, 'transferor', notes, warnings, opts);
    const tfe = normParty(input.transferee, 'transferee', notes, warnings, opts);
    if (!tfr.name && !draft) throw new InputError('transferor.name', 'the transferor (ผู้โอน) — name with title, e.g. "นายสมชาย ใจดี"');
    if (!tfe.name && !draft) throw new InputError('transferee.name', 'the transferee (ผู้รับโอน) — name with title');
    const payer = clean(input.payer || 'transferor');
    if (!['transferor', 'transferee', 'split'].includes(payer)) throw new InputError('payer', '"transferor" (default), "transferee" or "split"');
    const ins = input.instrument || {};
    const insDate = parseDate(ins.date, 'instrument.date', notes, false);
    const filing = parseDate(input.filingDate, 'filingDate', notes, true);
    const counterparts = has(input.counterparts) ? Number(parseCount(input.counterparts, 'counterparts')) : 1;
    if (counterparts > 99) throw new InputError('counterparts', 'the number of duplicates (คู่ฉบับ), usually 1');
    const duty = computeDuty(input.shares || {}, input.value, counterparts, input.duty, notes, draft);
    if (duty.basisFrom === 'paidUp' && duty.price) notes.push(`the price (${grouped(fStr(duty.price))}) is below the paid-up value of the shares (${grouped(fStr(duty.paidUp))}): the duty and มูลค่าของตราสาร use the paid-up value (item 2 — whichever is greater)`);
    if (duty.basisFrom === 'paidUp' && !duty.price) notes.push(`no price given: the duty and มูลค่าของตราสาร use the paid-up value of the shares (${grouped(fStr(duty.paidUp))}) — send the price if the instrument states one`);
    // เงินเพิ่มอากร
    const sur = input.surcharge || {};
    const suggestion = suggestedMode(insDate, filing);
    let mode = clean(sur.mode) || (suggestion ? suggestion.mode : 'normal');
    if (!SURCHARGE_MODES[mode]) throw new InputError('surcharge.mode', 'one of ' + Object.keys(SURCHARGE_MODES).join(', '));
    if (suggestion && suggestion.days > 0 && suggestion.days <= 15 && !clean(sur.mode)) notes.push(`filed ${suggestion.days} day${suggestion.days > 1 ? 's' : ''} after the instrument was made — within 15 days, no เงินเพิ่มอากร (ม.113)`);
    if (suggestion && suggestion.days > 15 && !clean(sur.mode)) warnings.push(`filed ${suggestion.days} days after the instrument was made — เงินเพิ่มอากร under ม.113 added (${SURCHARGE_MODES[mode].law}); check the dates`);
    if (suggestion && suggestion.days < 0) warnings.push(`the filing date is before the instrument date — check both (paying before the instrument is made is allowed)`);
    const known = duty.original !== null;
    const surOriginal = has(sur.original) ? Number(parseCount(sur.original, 'surcharge.original')) : known ? surchargeFor(duty.original, mode) : null;
    const surCounterpart = has(sur.counterpart) ? Number(parseCount(sur.counterpart, 'surcharge.counterpart')) : known ? surchargeFor(duty.counterpart, mode) : null;

    const desc = clean(ins.description) || 'ตราสารการโอนหุ้น';
    const rowOriginal = { item: '2', desc, copies: 1, value: duty.basis, duty: duty.original, surcharge: surOriginal };
    const rowCounterpart = { item: '23', desc: 'คู่ฉบับ', copies: counterparts, value: opts.counterpartValue === 'blank' || !known ? null : fInt(0), duty: duty.counterpart, surcharge: surCounterpart };
    const layouts = payer === 'split'
      ? [{ role: 'original', payer: tfr, party: tfe, payerRole: 'transferor', rows: [rowOriginal] },
         { role: 'counterpart', payer: tfe, party: tfr, payerRole: 'transferee', rows: [rowCounterpart] }]
      : [{ role: 'both', payer: payer === 'transferee' ? tfe : tfr, party: payer === 'transferee' ? tfr : tfe, payerRole: payer, rows: counterparts ? [rowOriginal, rowCounterpart] : [rowOriginal] }];
    if (payer === 'transferee') notes.push('the transferee pays both rows — item 2 makes the transferor liable; one party paying all the duty is the RD guide\'s example 2, fine where the parties agreed it');
    if (payer === 'split') notes.push('two forms: the transferor pays the original (item 2), the transferee the duplicate (item 23) — the RD table\'s rule when the instrument does not put all the duty on one side');

    const signer = input.signer || {};
    const endorse = input.endorsement || {};
    const submitted = endorse.submitted !== false;
    if (!submitted && !has(endorse.reason)) throw new InputError('endorsement.reason', 'why the instrument is not handed in for endorsement (ไม่ได้ยื่นตราสารเพื่อให้ทำการสลักหลังเพราะ …)');

    const forms = layouts.map(L => {
      const f = {};
      const put = (name, value) => { const v = clean(value); if (v) f[name] = v; };
      put(FIELD.office, input.office);
      if (filing) { if (filing.d) put(FIELD.fileDay, String(filing.d)); if (filing.m) put(FIELD.fileMonth, TH_MONTHS[filing.m - 1]); put(FIELD.fileYear, String(filing.y + 543)); }
      [['payer', L.payer], ['party', L.party]].forEach(([slot, P]) => {
        const F = PARTY_FIELDS[slot];
        put(F.name, P.name); put(F.tin, P.tin); put(F.branch, P.branch);
        ADDRESS_PARTS.forEach(k => {
          let v = P.addr[k];
          if (!v && opts.dashes && k !== 'postcode' && ADDRESS_PARTS.some(q => P.addr[q])) v = '-';
          put(F[k], v);
        });
      });
      put(FIELD.otherText, desc);
      put(FIELD.contractNo, ins.number);
      put(FIELD.contractDate, thaiDate(insDate));
      put(FIELD.contractStart, ins.startDate && thaiDate(parseDate(ins.startDate, 'instrument.startDate', notes)));
      put(FIELD.receivedDate, ins.receivedDate && thaiDate(parseDate(ins.receivedDate, 'instrument.receivedDate', notes)));
      const rows = L.rows;
      rows.forEach((r, i) => {
        const P = ROW_PREFIX[i];
        put(P + '.1', String(i + 1));
        put(P + '.2', r.item + (opts.itemDots ? '.' : ''));
        put(P + '.3', r.desc);
        put(P + '.4', String(r.copies));
        if (r.value) { const bs = bahtSatang(r.value); put(P + '.5', bs.baht); put(P + '.6', bs.satang); }
        if (opts.officerColumns && r.duty !== null) {
          put(P + '.8', String(r.duty)); put(P + '.9', '00');
          put(P + '.10', String(r.surcharge)); put(P + '.11', '00');
          put(P + '.12', String(r.duty + r.surcharge)); put(P + '.13', '00');
        }
      });
      if (opts.totalCount) put(TOTAL + '.4', String(rows.reduce((s, r) => s + r.copies, 0)));
      const values = rows.filter(r => r.value);
      if (values.length) {
        const sum = values.reduce((s, r) => frac(s.n * r.value.d + r.value.n * s.d, s.d * r.value.d), fInt(0));
        const bs = bahtSatang(sum); put(TOTAL + '.5', bs.baht); put(TOTAL + '.6', bs.satang);
      }
      const dutySum = rows.reduce((s, r) => s + (r.duty || 0), 0), surSum = rows.reduce((s, r) => s + (r.surcharge || 0), 0);
      if (opts.officerColumns && known) {
        put(TOTAL + '.8', String(dutySum)); put(TOTAL + '.9', '00');
        put(TOTAL + '.10', String(surSum)); put(TOTAL + '.11', '00');
        put(TOTAL + '.12', String(dutySum + surSum)); put(TOTAL + '.13', '00');
      }
      if (!submitted) put(FIELD.notSubmittedReason, endorse.reason);
      const signerName = signer.name !== undefined && signer.name !== null ? signer.name : (isJuristic(L.payer.name) ? '' : L.payer.name);
      put(FIELD.signerName, signerName);
      put(FIELD.signerPosition, signer.position);
      const radios = { 'Radio Button1': '2', 'Radio Button2': submitted ? '0' : '1' };
      const missing = [];
      if (!has(input.office)) missing.push('สำนักงานสรรพากรพื้นที่สาขา');
      if (!filing) missing.push('วันที่ยื่นแบบ'); else if (!filing.d) missing.push('วันที่ยื่นแบบ (day)');
      if (!L.payer.tin) missing.push('เลขประจำตัวผู้เสียภาษีอากร (ผู้เสียอากร)');
      if (!L.party.tin) missing.push('เลขประจำตัวผู้เสียภาษีอากร (คู่สัญญา)');
      if (!ADDRESS_PARTS.some(k => L.payer.addr[k])) missing.push('ที่อยู่ผู้เสียอากร');
      if (!ADDRESS_PARTS.some(k => L.party.addr[k])) missing.push('ที่อยู่คู่สัญญา');
      if (!insDate) missing.push('ลงวันที่ (instrument date)');
      if (!has(signerName)) missing.push(isJuristic(L.payer.name) ? 'ชื่อกรรมการผู้ลงนาม ( … ) ผู้เสียอากร' : 'ชื่อผู้ลงนาม ( … ) ผู้เสียอากร');
      if (!L.payer.name) missing.push('ชื่อผู้เสียอากร');
      if (!L.party.name) missing.push('ชื่อคู่สัญญา');
      if (!known) missing.push('มูลค่าของตราสาร / อากร');
      return {
        role: L.role, payerRole: L.payerRole, payer: L.payer.name, counterparty: L.party.name, signer: signerName,
        fields: f, radios, centred: opts.centre ? [...CENTRED].filter(n => f[n]) : [], blank: missing,
        total: { duty: dutySum, surcharge: surSum, payable: dutySum + surSum }
      };
    });
    forms.forEach(F => { F.blank.forEach(b => { if (!blanks.includes(b)) blanks.push(b); }); });
    const base = clean(input.fileName) || [insDate ? isoDate(insDate).replace(/-/g, '.') : '', 'OS4 ตราสารการโอนหุ้น', tfr.name, '-', tfe.name].filter(Boolean).join(' ');
    forms.forEach((F, i) => { F.fileName = (forms.length > 1 ? `${base} (${F.role === 'original' ? 'ต้นฉบับ' : 'คู่ฉบับ'})` : base).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf'; });
    const report = {
      basisBaht: duty.basis && fStr(duty.basis), basisFrom: duty.basisFrom,
      priceBaht: duty.price && fStr(duty.price), paidUpValueBaht: duty.paidUp && fStr(duty.paidUp),
      dutyOnOriginalBaht: duty.original, dutyOnDuplicateBaht: duty.counterpart, duplicates: counterparts,
      surchargeMode: mode, surchargeBaht: known ? surOriginal + (counterparts ? surCounterpart : 0) : null,
      totalBaht: known ? duty.original + surOriginal + (counterparts ? duty.counterpart + surCounterpart : 0) : null,
      worked: duty.auto
    };
    return { forms, stampDuty: report, notes, warnings, blank: blanks, options: opts };
  }

  // ── Layout: HarfBuzz-shaped glyphs placed in each field ──────────────────
  /* Sizes that match the firm's forms. Acrobat drew them in Microsoft Sans Serif: 9 pt where the
     RD's /DA fixes 9, 9.86 pt where it says 0 (auto). Noto's Thai letters are 6% taller at the same
     size (น: 0.562 em against 0.530 em; the same advance), so both are set 6% smaller. */
  const SIZE_MATCH = 0.94;
  const AUTO_SIZE = 9.863 * SIZE_MATCH;
  const MIN_SIZE = 5;
  const PAD = 2;                  // Acrobat's inset: 1 pt border + 1 pt
  const BASELINE = 4.1;           // above the field's bottom edge at the form's 15.16 pt field height
  const BASE_HEIGHT = 15.16;

  function create(assets) {
    const { pdf, fieldmap, fontinfo, font, hb } = assets;
    if (!pdf || !fieldmap || !fontinfo || !font || !hb) throw new Error('OS4Engine.create needs pdf, fieldmap, fontinfo, font and hb');
    const hbFont = hb.createFont(hb.createFace(hb.createBlob(font), 0));
    const upm = fontinfo.upm;
    const shapeCache = new Map();
    function shape(text) {
      if (shapeCache.has(text)) return shapeCache.get(text);
      const buf = hb.createBuffer();
      buf.addText(text);
      buf.guessSegmentProperties();
      hb.shape(hbFont, buf);
      const out = buf.json().map(g => ({ g: g.g, cl: g.cl, ax: g.ax, dx: g.dx, dy: g.dy }));
      buf.destroy();
      if (shapeCache.size > 2000) shapeCache.clear();
      shapeCache.set(text, out);
      return out;
    }
    const advance = glyphs => glyphs.reduce((s, g) => s + g.ax, 0);
    const spaceWidth = shape(' ')[0].ax;
    const pathCache = new Map();
    function glyphPath(gid) {
      if (!pathCache.has(gid)) pathCache.set(gid, hbFont.glyphToPath(gid));
      return pathCache.get(gid);
    }

    /* One field: the value (padded when centred), its size, and every glyph's position in the
       field's own coordinates (points, origin bottom-left) — the same numbers the appearance
       stream is written from and the page's preview is drawn from. */
    function layoutField(name, text, centre) {
      const def = fieldmap.fields[name];
      if (!def) throw new Error('no field ' + name);
      const [x1, y1, x2, y2] = def.rect;
      const w = x2 - x1, h = y2 - y1;
      const base = def.size ? def.size * SIZE_MATCH : AUTO_SIZE;
      let display = text;
      if (def.number && /^\d+$/.test(text)) {
        display = grouped(text) + (def.number.dec ? '.' + '0'.repeat(def.number.dec) : '');
      }
      const baseline = BASELINE + (h - BASE_HEIGHT) / 2;
      if (def.comb && def.maxLen) {
        const cw = w / def.maxLen;
        const glyphs = [];
        Array.from(display).slice(0, def.maxLen).forEach((ch, i) => {
          if (ch === ' ') return;
          const run = shape(ch);
          const s = base / upm;
          let x = i * cw + (cw - advance(run) * s) / 2;
          run.forEach(g => { glyphs.push({ g: g.g, x: x + g.dx * s, y: baseline + g.dy * s, cl: 0, ch }); x += g.ax * s; });
        });
        return { name, value: text, display, size: base, glyphs, condensed: 0, over: 0, box: [w, h] };
      }
      const avail = w - 2 * PAD;
      let run = shape(display);
      let size = base;
      let width = advance(run) * size / upm;
      let condensed = 0, pad = PAD;
      if (width > avail && width <= w - 2) pad = (w - width) / 2;      // use the 1 pt margin before shrinking anything
      else if (width > avail) {
        size = Math.max(MIN_SIZE, Math.floor(base * avail / width * 10) / 10);
        condensed = +(base - size).toFixed(1);
        width = advance(run) * size / upm;
      }
      let value = text;
      if (centre && def.q === 0 && width < avail) {
        const pads = Math.max(0, Math.floor((avail - width) / 2 / (spaceWidth * size / upm)));
        if (pads) { value = ' '.repeat(pads) + text; display = ' '.repeat(pads) + display; run = shape(display); width = advance(run) * size / upm; }
      }
      let x = def.q === 1 ? (w - width) / 2 : def.q === 2 ? w - pad - width : pad;
      const s = size / upm;
      const glyphs = [], missing = [];
      run.forEach(g => {
        if (!g.g) missing.push(Array.from(display.slice(g.cl))[0]);
        else if (!(g.ax && isSpaceGlyph(g.g))) glyphs.push({ g: g.g, x: x + g.dx * s, y: baseline + g.dy * s, cl: g.cl });
        x += g.ax * s;
      });
      const over = width > w - 2 ? +(width - (w - 2)).toFixed(1) : 0;
      return { name, value, display, size, glyphs, condensed, over, missing, box: [w, h], text: display };
    }
    const spaceGid = shape(' ')[0].g;
    const isSpaceGlyph = gid => gid === spaceGid;

    function layoutForm(form) {
      const centred = new Set(form.centred || []);
      const fields = {};
      const condensed = [], overflow = [], missing = [];
      Object.keys(form.fields).forEach(n => {
        const L = layoutField(n, form.fields[n], centred.has(n));
        fields[n] = L;
        if (L.condensed) condensed.push({ field: n, points: L.condensed });
        if (L.over) overflow.push({ field: n, overByPoints: L.over });
        if (L.missing && L.missing.length) missing.push({ field: n, characters: [...new Set(L.missing)].join('') });
      });
      return { fields, condensed, overflow, missing };
    }

    // ── PDF: the incremental update ────────────────────────────────────────
    const num = v => { const r = Math.round(v * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toString(); };
    const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
    function pdfString(s) {
      if (/^[\x20-\x7e]*$/.test(s)) return '(' + s.replace(/([\\()])/g, '\\$1') + ')';
      let out = '<FEFF';
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp > 0xffff) { const v = cp - 0x10000; out += hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff)); }
        else out += hex4(cp);
      }
      return out + '>';
    }
    function appearance(L, color, fontRef) {
      const [w, h] = L.box;
      const ops = ['/Tx BMC', 'q', `1 1 ${num(w - 2)} ${num(h - 2)} re W n`];
      if (L.glyphs.length) {
        ops.push('BT', `/F1 ${num(L.size)} Tf`, color);
        let px = 0, py = 0;
        L.glyphs.forEach(g => {
          ops.push(`${num(g.x - px)} ${num(g.y - py)} Td <${hex4(g.g)}> Tj`);
          px = g.x; py = g.y;
        });
        ops.push('ET');
      }
      ops.push('Q', 'EMC');
      const body = ops.join('\n');
      return { dict: `<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Length ${body.length} >>`, body };
    }
    /* What each glyph stands for, for text copied out of the form: the font's own map, and for a
       glyph HarfBuzz substituted (ญ without its tail, a lowered tone mark) the characters of its
       cluster that no other glyph there accounts for. */
    function toUnicodeMap(layouts) {
      const map = new Map();
      layouts.forEach(L => {
        const text = L.text || '';
        const byCl = new Map();
        L.glyphs.forEach(g => { if (!byCl.has(g.cl)) byCl.set(g.cl, []); byCl.get(g.cl).push(g); });
        const cls = [...byCl.keys()].sort((a, b) => a - b);
        cls.forEach((cl, i) => {
          const glyphs = byCl.get(cl);
          const next = i + 1 < cls.length ? cls[i + 1] : text.length;
          let chars = Array.from(L.glyphs[0] && L.glyphs[0].ch !== undefined ? glyphs.map(g => g.ch).join('') : text.slice(cl, next));
          const unmapped = [];
          glyphs.forEach(g => {
            const u = fontinfo.toUnicode[String(g.g)];
            if (u) { const k = chars.indexOf(u); if (k >= 0) chars.splice(k, 1); if (!map.has(g.g)) map.set(g.g, u); }
            else unmapped.push(g);
          });
          unmapped.forEach((g, k) => { if (!map.has(g.g) && k === 0 && chars.length) map.set(g.g, chars.join('')); });
        });
      });
      return map;
    }
    function cmapStream(map) {
      const entries = [...map.entries()].sort((a, b) => a[0] - b[0]);
      const lines = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
        '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange'];
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        lines.push(`${chunk.length} beginbfchar`);
        chunk.forEach(([gid, s]) => {
          let u = '';
          for (const ch of s) { const cp = ch.codePointAt(0); u += cp > 0xffff ? hex4(0xd800 + ((cp - 0x10000) >> 10)) + hex4(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex4(cp); }
          lines.push(`<${hex4(gid)}> <${u}>`);
        });
        lines.push('endbfchar');
      }
      lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
      return lines.join('\n');
    }
    function hash128(bytes) {             // cyrb128 — a deterministic /ID for the update
      let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
      for (let i = 0; i < bytes.length; i++) {
        const k = bytes[i];
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
      }
      h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
      h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
      return [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
    }

    /* flatten: the "print-ready" file. Every value is drawn on the page itself — one more content
       stream after the RD's own eight, which are wrapped in q/Q and not touched — and the page and
       catalog are written again without the form's fields. Any viewer then shows exactly this; Apple's
       PDFKit (Preview, Safari) otherwise redraws form fields itself from their values, in its own
       font and without the RD's number formatting, as it does with the firm's Acrobat-filled forms. */
    function writePdf(form, layout, opts) {
      layout = layout || layoutForm(form);
      const flatten = !!(opts && opts.flatten);
      const meta = fieldmap.pdf;
      const chunks = [];
      let offset = pdf.length;
      const xref = [];
      const latin1 = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; };
      function emit(objNum, head, streamBytes) {
        xref.push([objNum, offset]);
        const parts = [latin1(`${objNum} 0 obj\n${head}\n`)];
        if (streamBytes) parts.push(latin1('stream\n'), streamBytes, latin1('\nendstream\n'));
        parts.push(latin1('endobj\n'));
        parts.forEach(p => { chunks.push(p); offset += p.length; });
      }
      if (!meta.endsWithEOL) { const nl = latin1('\n'); chunks.push(nl); offset += 1; }
      let next = meta.size;
      const layouts = Object.values(layout.fields);
      // the font: Type0 / CIDFontType2, Identity-H, glyph ids as CIDs
      const F = { type0: next++, cid: next++, desc: next++, file: next++, cmap: next++ };
      const ps = fontinfo.postScriptName;
      emit(F.type0, `<< /Type /Font /Subtype /Type0 /BaseFont /${ps} /Encoding /Identity-H /DescendantFonts [${F.cid} 0 R] /ToUnicode ${F.cmap} 0 R >>`);
      emit(F.cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${ps} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${F.desc} 0 R /CIDToGIDMap /Identity /DW 0 /W [0 [${fontinfo.widths.join(' ')}]] >>`);
      const bb = fontinfo.bbox;
      emit(F.desc, `<< /Type /FontDescriptor /FontName /${ps} /Flags 4 /FontBBox [${bb.join(' ')}] /ItalicAngle 0 /Ascent ${fontinfo.ascent} /Descent ${fontinfo.descent} /CapHeight ${fontinfo.capHeight} /StemV 80 /FontFile2 ${F.file} 0 R >>`);
      emit(F.file, `<< /Length ${font.length} /Length1 ${font.length} >>`, font);
      const cmap = latin1(cmapStream(toUnicodeMap(layouts)));
      emit(F.cmap, `<< /Length ${cmap.length} >>`, cmap);
      if (flatten) {
        const FL = fieldmap.flatten;
        const draw = [];
        Object.keys(layout.fields).forEach(n => {
          const def = fieldmap.fields[n], L = layout.fields[n];
          if (!L.glyphs.length) return;
          const [x1, y1] = def.rect, [w, h] = L.box;
          draw.push(`q 1 0 0 1 ${num(x1)} ${num(y1)} cm 1 1 ${num(w - 2)} ${num(h - 2)} re W n`, 'BT', `/OS4F ${num(L.size)} Tf`, def.color);
          let px = 0, py = 0;
          L.glyphs.forEach(g => { draw.push(`${num(g.x - px)} ${num(g.y - py)} Td <${hex4(g.g)}> Tj`); px = g.x; py = g.y; });
          draw.push('ET', 'Q');
        });
        const ticks = [];
        Object.keys(form.radios || {}).forEach(g => {
          const kid = fieldmap.radios[g].kids.find(k => k.state === String(form.radios[g]));
          if (!kid) throw new Error(`${g} has no state ${form.radios[g]}`);
          const nm = `/OS4R${ticks.length}`;
          ticks.push(`${nm} ${kid.on} 0 R`);
          draw.push(`q 1 0 0 1 ${num(kid.rect[0])} ${num(kid.rect[1])} cm ${nm} Do Q`);
        });
        const open = latin1('q\n'), body = latin1('Q\n' + draw.join('\n') + '\n');
        const openNum = next++, bodyNum = next++;
        emit(openNum, `<< /Length ${open.length} >>`, open);
        emit(bodyNum, `<< /Length ${body.length} >>`, body);
        emit(FL.page, `${FL.pageDict}\n/Contents [${[openNum, ...FL.contents, bodyNum].map(c => c + ' 0 R').join(' ')}]\n` +
          `/Resources << ${FL.resources}\n/Font << ${FL.fonts}\n/OS4F ${F.type0} 0 R >>\n/XObject << ${FL.xobjects}\n${ticks.join('\n')} >> >>\n>>`);
        emit(meta.root, `${FL.catalogDict}\n>>`);
      }
      // each filled field: its appearance, then the widget again with /V and /AP
      if (!flatten) Object.keys(layout.fields).forEach(n => {
        const def = fieldmap.fields[n];
        const L = layout.fields[n];
        const ap = appearance(L, def.color, F.type0);
        const apNum = next++;
        emit(apNum, ap.dict, latin1(ap.body));
        emit(def.obj, `${def.dict}\n/V ${pdfString(L.value)}\n/AP << /N ${apNum} 0 R >>\n>>`);
      });
      if (!flatten) Object.keys(form.radios || {}).forEach(g => {
        const R = fieldmap.radios[g];
        const on = String(form.radios[g]);
        if (!R.kids.some(k => k.state === on)) throw new Error(`${g} has no state ${on}`);
        emit(R.obj, `${R.dict}\n/V /${on}\n>>`);
        R.kids.forEach(k => emit(k.obj, `${k.dict}\n/AS /${k.state === on ? on : 'Off'}\n>>`));
      });
      // the cross-reference stream for this update, pointing back at the RD's
      const xrefNum = next++;
      const xrefAt = offset;
      xref.push([xrefNum, xrefAt]);
      xref.sort((a, b) => a[0] - b[0]);
      const index = [];
      xref.forEach(([n], i) => { if (i && n === xref[i - 1][0] + 1) index[index.length - 1][1]++; else index.push([n, 1]); });
      const rows = new Uint8Array(xref.length * 7);
      xref.forEach(([, off], i) => {
        rows[i * 7] = 1;
        rows[i * 7 + 1] = (off >>> 24) & 255; rows[i * 7 + 2] = (off >>> 16) & 255; rows[i * 7 + 3] = (off >>> 8) & 255; rows[i * 7 + 4] = off & 255;
      });
      const digest = hash128(latin1(unescape(encodeURIComponent(JSON.stringify([form.fields, form.radios, flatten])))));
      const head = `<< /Type /XRef /Size ${next} /Index [${index.map(r => r.join(' ')).join(' ')}] /W [1 4 2] /Prev ${meta.prevXref} /Root ${meta.root} 0 R` +
        (meta.info ? ` /Info ${meta.info} 0 R` : '') + ` /ID [<${meta.id[0]}> <${digest}>] /Length ${rows.length} >>`;
      emit(xrefNum, head, rows);
      const tail = latin1(`startxref\n${xrefAt}\n%%EOF\n`);
      chunks.push(tail); offset += tail.length;
      const out = new Uint8Array(offset);
      out.set(pdf, 0);
      let at = pdf.length;
      chunks.forEach(c => { out.set(c, at); at += c.length; });
      return out;
    }

    return { layoutField, layoutForm, pdf: writePdf, glyphPath, shape, fieldmap, fontinfo };
  }

  return {
    VERSION, InputError, plan, create, splitAddress, tinValid, tinFormat, tinDigits, thaiDate, parseDate,
    parseAmount, SURCHARGE_MODES, suggestedMode, ADDRESS_PARTS, ADDRESS_LABELS, PARTY_FIELDS, FIELD,
    DEFAULT_OPTIONS, TH_MONTHS, isJuristic
  };
}));
