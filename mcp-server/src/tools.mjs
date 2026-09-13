import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildDocx, dutyOf, fileNameOf, normalizeTransfer, unresolved } from './transfer.mjs';

const PLACEHOLDER_NOTE =
  'Write "(*)" for any value that is deliberately not settled yet — it is carried ' +
  'into the document highlighted yellow, which is how the firm marks a blank to be ' +
  'filled in before signing. Never invent a name, address, date or figure: leave it ' +
  'out or write "(*)".';

const party = () => ({
  nameThai: z.string().optional().describe('Party name in Thai, e.g. "นายสมชาย ใจดี"'),
  nameEnglish: z.string().optional().describe('Party name in English, e.g. "Mr. Somchai Jaidee"'),
  addressThai: z.string().optional().describe('Full address in Thai, one line'),
  addressEnglish: z.string().optional().describe('Full address in English, one line'),
  date: z.string().optional().describe('Date of signing as YYYY-MM-DD. Rendered Buddhist-era in Thai and Gregorian in English'),
  placeThai: z.string().optional().describe('Place of signing in Thai. Defaults to กรุงเทพมหานคร'),
  placeEnglish: z.string().optional().describe('Place of signing in English. Defaults to Bangkok Metropolis'),
  witnessThai: z.string().optional().describe('Witness name in Thai. Its line is removed from the document when left empty'),
  witnessEnglish: z.string().optional().describe('Witness name in English. Its line is removed from the document when left empty')
});

const INPUT = {
  company: z.object({
    nameThai: z.string().optional().describe('Company name in Thai, e.g. "บริษัท ตัวอย่าง จำกัด"'),
    nameEnglish: z.string().optional().describe('Company name in English, e.g. "EXAMPLE CO., LTD."')
  }).describe('The company whose shares are being transferred'),

  transferor: z.object(party()).describe('ผู้โอน — the shareholder transferring the shares out'),
  transferee: z.object(party()).describe('ผู้รับโอน — the person or entity receiving the shares'),

  shares: z.object({
    count: z.union([z.string(), z.number()]).optional().describe('Number of shares transferred'),
    numbersFrom: z.union([z.string(), z.number()]).optional().describe('First share number in the transferred range'),
    numbersTo: z.union([z.string(), z.number()]).optional().describe('Last share number in the transferred range'),
    numbersText: z.string().optional().describe('Free-text share numbers, used instead of from/to when the range is not contiguous'),
    parValue: z.union([z.string(), z.number()]).optional().describe('Par value per share in baht'),
    paidUpPercent: z.union([z.string(), z.number()]).optional().describe('Percentage paid up per share. Defaults to 100'),
    price: z.union([z.string(), z.number()]).optional().describe('Total transfer price in baht. Defaults to par value × share count when omitted'),
    stampDutyLine: z.boolean().optional().describe('Print "(ปิดอากรแสตมป์ N บาท)" under each copy, computed from the Stamp Duty Schedule. Off by default')
  }).describe('The shares being transferred'),

  fileName: z.string().optional().describe('Override the generated file name. Omit to let the firm naming convention apply')
};

const mapParty = (p = {}) => ({
  nameTh: p.nameThai, nameEn: p.nameEnglish,
  addrTh: p.addressThai, addrEn: p.addressEnglish,
  date: p.date,
  locTh: p.placeThai, locEn: p.placeEnglish,
  witTh: p.witnessThai, witEn: p.witnessEnglish
});

const toInternal = a => ({
  co: { th: a.company?.nameThai, en: a.company?.nameEnglish },
  tfr: mapParty(a.transferor),
  tfe: mapParty(a.transferee),
  sh: {
    count: a.shares?.count,
    from: a.shares?.numbersFrom,
    to: a.shares?.numbersTo,
    nosOverride: a.shares?.numbersText,
    par: a.shares?.parValue,
    paidUp: a.shares?.paidUpPercent,
    price: a.shares?.price,
    priceAuto: a.shares?.price == null || a.shares.price === '',
    stampOn: a.shares?.stampDutyLine
  },
  fileName: a.fileName,
  fileAuto: a.fileName == null || a.fileName === ''
});

/* `deliver(baseName, buffer)` is the one thing that differs between running on
   your own machine and running for the office: locally the document is saved to
   a folder, over HTTP it is handed back as a link. */
export function createMcpServer({ deliver, user = null }) {
  const server = new McpServer({ name: 'juratools-share-docs', version: '0.1.0' });

  server.registerTool('create_share_transfer_instrument', {
    title: 'Create a Share Transfer Instrument (ตราสารการโอนหุ้น)',
    description:
      'Generate the firm\'s Thai/English share transfer instrument as a .docx, one Original ' +
      'and one Duplicate, from the transferor, transferee, company and share details. ' +
      'Returns the document, the stamp duty worked out under the Stamp Duty Schedule, and ' +
      'any field left blank. ' + PLACEHOLDER_NOTE + ' ' +
      'The result is a draft for a lawyer to check — say so when reporting it.',
    inputSchema: INPUT
  }, async args => {
    const t = normalizeTransfer(toInternal(args));
    const buf = await buildDocx(t);
    const delivery = await deliver(fileNameOf(t), buf);

    const duty = dutyOf(t);
    const open = unresolved(t);

    if (user) {
      console.error(`[${new Date().toISOString()}] ${user} created a transfer instrument: ` +
        `${args.company?.nameThai || args.company?.nameEnglish || 'company not named'} — ` +
        `${args.shares?.count ?? '?'} shares`);
    }

    const report = [
      `${delivery} (${(buf.length / 1024).toFixed(0)} KB).`,
      duty.ok
        ? `Stamp duty: ${duty.duty} baht on the Original + ${duty.dup} baht counterpart on the Duplicate = ${duty.total} baht, on a basis of ${duty.basis.toLocaleString('en-US')} baht.` +
          (duty.floor ? ' No transfer price was given, so the paid-up value set the basis.' : '')
        : `Stamp duty could not be worked out — missing: ${duty.missing.join(', ') || 'a basis to compute on'}.`,
      open.placeholder.length ? `Left as "(*)" to settle before signing: ${open.placeholder.join(', ')}.` : '',
      open.blank.length ? `Blank in the document: ${open.blank.join(', ')}.` : '',
      'Draft only — have a lawyer check it against the source instructions before it is signed.'
    ].filter(Boolean).join('\n');

    return { content: [{ type: 'text', text: report }] };
  });

  return server;
}
