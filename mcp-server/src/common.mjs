/* Ported verbatim from the browser tools in ../corporate-tools. Behaviour must
   stay identical to what the tools export by hand — a document produced here
   and one produced there are the same document, or this server is wrong. */
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

export const escX = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ');

/* A value written "(*)" — or "(*something)" — is a deliberate blank the firm
   highlights yellow in the signed document. */
export const PLACEHOLDER = '(*)';
export const isPlaceholder = v => /^\(\*.*\)$/.test(String(v == null ? '' : v).trim());

/* Word tags Thai as complex script; Latin and digits are not. Splitting the
   value this way is what makes w:cs apply to the right characters. */
export function splitScript(text) {
  const out = [];
  const re = /[฀-๿]+/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push([text.slice(last, m.index), false]);
    out.push([m[0], true]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push([text.slice(last), false]);
  return out.length ? out : [['', false]];
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function thaiDateParts(iso) {
  if (!iso) return { en: '', th: '' };
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return { en: '', th: '' };
  return { en: `${d} ${MONTHS_EN[m - 1]} ${y}`, th: `${d} ${MONTHS_TH[m - 1]} ${y + 543}` };
}

export function groupDigits(v) {
  let s = String(v).replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  let [a, b] = s.split('.');
  a = a.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return b === undefined ? a : a + '.' + b;
}

export const numOf = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : null; };
export const intOf = v => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return isFinite(n) ? n : null; };

/* Thai drafting convention: a whole-baht amount is written "100.-" */
export function baht(v) {
  if (isPlaceholder(v)) return String(v).trim();
  const n = numOf(v);
  if (n === null) return '';
  return Number.isInteger(n)
    ? n.toLocaleString('en-US') + '.-'
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Schema order inside w:rPr puts highlight (28) then cs (39) last of the
   properties we touch, so both can simply be appended. */
export function buildRuns(rprInner, value, { trim = false } = {}) {
  const ph = isPlaceholder(value);
  const text = String(value == null ? '' : value);
  return splitScript(trim ? text.trim() : text).map(([chunk, thai]) =>
    `<w:r><w:rPr>${rprInner}` +
      (ph ? '<w:highlight w:val="yellow"/>' : '') +
      (thai ? '<w:cs/>' : '') +
    `</w:rPr><w:t xml:space="preserve">${escX(chunk)}</w:t></w:r>`
  ).join('');
}

/* Replace the whole run carrying the token, so one value can become several
   runs with different script flags. */
export function fillToken(xml, token, value, { trim = false, rpr = r => r } = {}) {
  const mark = '{{' + token + '}}';
  let out = xml, i;
  while ((i = out.indexOf(mark)) !== -1) {
    const s = Math.max(out.lastIndexOf('<w:r>', i), out.lastIndexOf('<w:r ', i));
    const e = out.indexOf('</w:r>', i);
    if (s === -1 || e === -1) break;
    const run = out.slice(s, e + 6);
    const m = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    out = out.slice(0, s) + buildRuns(rpr(m ? m[1] : ''), value, { trim }) + out.slice(e + 6);
  }
  return out;
}

export function dropParagraphs(xml, token) {
  const mark = '{{' + token + '}}';
  let i;
  while ((i = xml.indexOf(mark)) !== -1) {
    const s = Math.max(xml.lastIndexOf('<w:p ', i), xml.lastIndexOf('<w:p>', i));
    const e = xml.indexOf('</w:p>', i);
    if (s === -1 || e === -1) break;
    xml = xml.slice(0, s) + xml.slice(e + 6);
  }
  return xml;
}

const cache = new Map();

export async function loadTemplate(name) {
  if (!cache.has(name)) {
    const b64 = await readFile(join(TEMPLATES, `${name}.b64`), 'utf8');
    const zip = await JSZip.loadAsync(b64, { base64: true });
    cache.set(name, { b64, xml: await zip.file('word/document.xml').async('string') });
  }
  return cache.get(name);
}

export async function packDocx(name, documentXml) {
  const { b64 } = await loadTemplate(name);
  const zip = await JSZip.loadAsync(b64, { base64: true });
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
