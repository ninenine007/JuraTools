/* Share Transfer Instrument · ตราสารการโอนหุ้น
   Ported from ../corporate-tools/share-transfer-instrument.html */
import {
  PLACEHOLDER, isPlaceholder, thaiDateParts, groupDigits, numOf, intOf, baht,
  buildRuns, fillToken, dropParagraphs, loadTemplate, packDocx
} from './common.mjs';

const TEMPLATE = 'share-transfer-instrument';

function blankParty() {
  return {
    nameTh: '', nameEn: '', nameSwap: false, addrTh: '', addrEn: '', addrSwap: false,
    date: '', locTh: 'กรุงเทพมหานคร', locEn: 'Bangkok Metropolis', locSwap: false,
    sig1: '', sig2: '', sigAuto: true, witTh: '', witEn: ''
  };
}

export function blankTransfer() {
  return {
    co: { th: '', en: '', swap: false },
    tfr: blankParty(),
    tfe: blankParty(),
    sh: {
      count: '', from: '', to: '', nosOverride: '', par: '', paidUp: '100',
      price: '', priceAuto: true,
      padMode: 'none', padTotal: '', pad: '',
      stampOn: false, stamp1: '', stamp1Auto: true, stamp2: '', stamp2Auto: true
    },
    fileName: '', fileAuto: true
  };
}

function autoPrice(t) {
  const par = numOf(t.sh.par), n = numOf(t.sh.count);
  return (par === null || n === null) ? '' : groupDigits(String(par * n));
}

function padWidth(t) {
  if (t.sh.padMode === 'fixed') return intOf(t.sh.pad) || 0;
  if (t.sh.padMode === 'auto') { const n = intOf(t.sh.padTotal); return n ? String(n).length : 0; }
  return 0;
}

function padNo(t, v) {
  const s = String(v == null ? '' : v).trim();
  const w = padWidth(t), n = intOf(s);
  return (!s || n === null || !w) ? s : String(n).padStart(w, '0');
}

function shareNos(t) {
  if (t.sh.nosOverride.trim()) return t.sh.nosOverride.trim();
  const f = padNo(t, t.sh.from), to = padNo(t, t.sh.to);
  return (f && to) ? `${f}-${to}` : (f || to || '');
}

/* Line 1 sits beside the Thai label, line 2 beside the English label. The swap
   exists because a foreign entity's official name is its English one. */
const lines = (th, en, swap) => swap ? [en, th] : [th, en];
const partyLine1 = p => lines(p.nameTh, p.nameEn, p.nameSwap)[0];
const sigLines = p => p.sigAuto ? [p.nameTh, p.nameEn] : [p.sig1, p.sig2];

/* A Thai personal name is kept whole, title and all; an English company name is
   trimmed to its distinctive words. Only company wrappers are dropped. */
function shortName(s) {
  if (!s || isPlaceholder(s)) return '';
  const thai = /[฀-๿]/.test(s);
  let x = String(s).replace(/[",]/g, ' ')
    .replace(/\(มหาชน\)/g, ' ').replace(/บริษัท|บมจ\.|ห้างหุ้นส่วนจำกัด|หจก\.|จำกัด/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (thai) return x;
  x = x.replace(/\./g, ' ')
    .replace(/\b(COMPANY|LIMITED|LTD|CO|PUBLIC|PCL|INC|CORP|CORPORATION|HOLDINGS|GROUP|PTE|LLC)\b/gi, ' ')
    .replace(/^\s*(MR|MRS|MISS|MS|DR)\b/i, ' ')
    .replace(/\s+/g, ' ').trim();
  return x.split(' ').slice(0, 2).join(' ')
    .replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function autoFileName(t) {
  const d = t.tfr.date || t.tfe.date;
  const stamp = d ? d.replace(/-/g, '.') : '';
  const a = shortName(partyLine1(t.tfr)), b = shortName(partyLine1(t.tfe));
  const who = (a || b) ? ` ${a}${a && b ? ' - ' : ''}${b}` : '';
  return `${stamp ? stamp + ' ' : ''}Share Transfer Instrument${who}`;
}

export function fileNameOf(t) {
  const base = (t.fileAuto || !t.fileName.trim()) ? autoFileName(t) : t.fileName.trim();
  return base.replace(/[\/\\:*?"<>|]/g, '-').trim() || 'Share Transfer Instrument';
}

export function tokensFor(t) {
  const co = lines(t.co.th, t.co.en, t.co.swap);
  const tfrN = lines(t.tfr.nameTh, t.tfr.nameEn, t.tfr.nameSwap);
  const tfrA = lines(t.tfr.addrTh, t.tfr.addrEn, t.tfr.addrSwap);
  const tfeN = lines(t.tfe.nameTh, t.tfe.nameEn, t.tfe.nameSwap);
  const tfeA = lines(t.tfe.addrTh, t.tfe.addrEn, t.tfe.addrSwap);
  const tfrL = lines(t.tfr.locTh, t.tfr.locEn, t.tfr.locSwap);
  const tfeL = lines(t.tfe.locTh, t.tfe.locEn, t.tfe.locSwap);
  const tfrD = thaiDateParts(t.tfr.date), tfeD = thaiDateParts(t.tfe.date);
  const tfrS = sigLines(t.tfr), tfeS = sigLines(t.tfe);
  const rawPrice = t.sh.priceAuto ? autoPrice(t) : t.sh.price;

  const keepPh = v => isPlaceholder(v) ? String(v).trim() : v;

  return {
    CO_NAME_1: co[0], CO_NAME_2: co[1],
    TFR_NAME_1: tfrN[0], TFR_NAME_2: tfrN[1],
    TFR_ADDR_1: tfrA[0], TFR_ADDR_2: tfrA[1],
    TFE_NAME_1: tfeN[0], TFE_NAME_2: tfeN[1],
    TFE_ADDR_1: tfeA[0], TFE_ADDR_2: tfeA[1],

    SHARE_COUNT: isPlaceholder(t.sh.count) ? t.sh.count.trim() : (t.sh.count.trim() ? groupDigits(t.sh.count) : ''),
    SHARE_NOS: shareNos(t),
    PAR_VALUE: baht(t.sh.par),
    PAID_UP: keepPh(t.sh.paidUp.trim()),
    PRICE: baht(rawPrice),

    TFR_DATE_TH: isPlaceholder(t.tfr.date) ? t.tfr.date : tfrD.th,
    TFR_DATE_EN: isPlaceholder(t.tfr.date) ? t.tfr.date : tfrD.en,
    TFR_LOC_TH: tfrL[0], TFR_LOC_EN: tfrL[1],
    TFR_SIG_1: tfrS[0], TFR_SIG_2: tfrS[1],
    TFR_WIT_1: t.tfr.witTh, TFR_WIT_2: t.tfr.witEn,

    TFE_DATE_TH: isPlaceholder(t.tfe.date) ? t.tfe.date : tfeD.th,
    TFE_DATE_EN: isPlaceholder(t.tfe.date) ? t.tfe.date : tfeD.en,
    TFE_LOC_TH: tfeL[0], TFE_LOC_EN: tfeL[1],
    TFE_SIG_1: tfeS[0], TFE_SIG_2: tfeS[1],
    TFE_WIT_1: t.tfe.witTh, TFE_WIT_2: t.tfe.witEn
  };
}

/* Second lines whose whole paragraph is dropped when empty, so an unused line
   never leaves a blank row pushing the signature block down. */
const DROP_WHEN_EMPTY = ['TFR_SIG_2', 'TFE_SIG_2', 'TFR_WIT_2', 'TFE_WIT_2'];

/* Stamp duty under Schedule item 21: 1 baht per 1,000 baht of the greater of
   paid-up value and price. The tool always writes an Original and a Duplicate,
   so item 23's counterpart duty is always in play: 1 baht where the duty on the
   original is 5 baht or less, otherwise 5. */
export function dutyOf(t) {
  const shares = numOf(t.sh.count);
  const par = numOf(t.sh.par);
  const paidUp = numOf(t.sh.paidUp);
  const priceRaw = t.sh.priceAuto ? autoPrice(t) : t.sh.price;
  const priceTbd = isPlaceholder(priceRaw);
  const price = priceTbd ? null : numOf(priceRaw);

  const paidValue = (shares === null || par === null || paidUp === null)
    ? null : par * (paidUp / 100) * shares;

  const missing = [];
  if (shares === null) missing.push('จำนวนหุ้น');
  if (par === null) missing.push('มูลค่าหุ้นละ');
  if (paidUp === null) missing.push('ชำระแล้ว %');

  const basis = paidValue === null ? (price === null ? null : price)
    : price === null ? paidValue : Math.max(paidValue, price);
  if (basis === null || basis <= 0)
    return { ok: false, missing, priceTbd, paidValue, price, basis: null };

  const duty = Math.ceil(basis / 1000);
  const dup = duty <= 5 ? 1 : 5;
  return {
    ok: true, missing, priceTbd, paidValue, price, basis, duty, dup,
    total: duty + dup, floor: priceTbd || price === null
  };
}

function stampLines(t) {
  const d = dutyOf(t);
  const auto = n => d.ok ? groupDigits(String(n)) : PLACEHOLDER;
  return {
    orig: t.sh.stamp1Auto ? auto(d.duty) : (String(t.sh.stamp1).trim() || PLACEHOLDER),
    dup: t.sh.stamp2Auto ? auto(d.dup) : (String(t.sh.stamp2).trim() || PLACEHOLDER)
  };
}

const STAMP_PPR =
  '<w:pPr><w:overflowPunct w:val="0"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/>' +
  '<w:adjustRightInd w:val="0"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' +
  '<w:jc w:val="center"/>';
const STAMP_FONT =
  '<w:rFonts w:ascii="Browallia New" w:eastAsia="Times New Roman" w:hAnsi="Browallia New" w:cs="Browallia New"/>';
const STAMP_RPR = STAMP_FONT + '<w:i/><w:iCs/>' +
  '<w:color w:val="BFBFBF" w:themeColor="background1" w:themeShade="BF"/><w:sz w:val="28"/>';
const STAMP_GAP = `<w:p>${STAMP_PPR}<w:rPr>${STAMP_FONT}<w:sz w:val="28"/></w:rPr></w:pPr></w:p>`;

const stampBlock = value => STAMP_GAP +
  `<w:p>${STAMP_PPR}<w:rPr>${STAMP_RPR}<w:szCs w:val="24"/><w:cs/></w:rPr></w:pPr>` +
  buildRuns(STAMP_RPR, '(ปิดอากรแสตมป์ ') +
  buildRuns(STAMP_RPR, value) +
  buildRuns(STAMP_RPR, ' บาท)') + '</w:p>';

/* One block after each signature table: the Duplicate's is the last table there
   is, the Original's is the table the page break to the Duplicate follows. The
   later one goes in first, so the earlier one's position is still its own. */
function addStampLines(xml, orig, dup) {
  const insert = (s, end, block) => end < 8 ? s : s.slice(0, end) + block + s.slice(end);
  let out = insert(xml, xml.lastIndexOf('</w:tbl>') + 8, stampBlock(dup));
  const brk = out.search(/<w:br w:type="page"\s*\/>/);
  return brk === -1 ? out
    : insert(out, out.lastIndexOf('</w:tbl>', brk) + 8, stampBlock(orig));
}

function fillXml(xml, t) {
  const vals = tokensFor(t);
  for (const k of DROP_WHEN_EMPTY) {
    if (!String(vals[k] || '').trim()) { xml = dropParagraphs(xml, k); delete vals[k]; }
  }
  if (t.sh.stampOn) {
    const s = stampLines(t);
    xml = addStampLines(xml, s.orig, s.dup);
  }
  for (const [k, v] of Object.entries(vals)) xml = fillToken(xml, k, v);
  return xml;
}

export async function buildDocx(t) {
  const { xml } = await loadTemplate(TEMPLATE);
  return packDocx(TEMPLATE, fillXml(xml, t));
}

/* Callers hand over whatever they know; every field the engine reads has to
   exist and be the type it expects, so partial input is merged onto a blank
   transfer rather than used directly. */
function coerce(blank, given) {
  if (given === undefined || given === null) return blank;
  if (blank !== null && typeof blank === 'object')
    return Object.fromEntries(Object.keys(blank).map(k => [k, coerce(blank[k], given[k])]));
  if (typeof blank === 'boolean') return Boolean(given);
  return String(given);
}

export const normalizeTransfer = input => coerce(blankTransfer(), input ?? {});

/* Which tokens went out blank or as a deliberate "(*)" — what the drafter still
   has to settle before the instrument is signed. */
export function unresolved(t) {
  const vals = tokensFor(t);
  const blank = [], placeholder = [];
  for (const [k, v] of Object.entries(vals)) {
    const s = String(v == null ? '' : v).trim();
    if (!s) blank.push(k);
    else if (isPlaceholder(s)) placeholder.push(k);
  }
  return { blank, placeholder };
}
