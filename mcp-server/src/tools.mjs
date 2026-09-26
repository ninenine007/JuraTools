import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildDocx, dutyOf, fileNameOf, normalizeTransfer, unresolved } from './transfer.mjs';
import { registerDateTools } from './date-tools.mjs';
import { buildPlainDocx, fileNameOfPlain, PLAIN_INPUT_SHAPE } from './plain-doc.mjs';
import { attorneyAppointmentJob } from './poa.mjs';
import { powerOfAttorneyJob } from './power-of-attorney.mjs';

/* หนังสือมอบอำนาจให้ฟ้องคดี — the schema a model fills. The engine's fromInput()
   maps these keys onto the page's state, so the page and the server agree. The
   rules in the descriptions are the guide's (document-automation/power-of-attorney.guide.md). */
const PWA_INPUT = {
  matter: z.string().optional().describe('Short matter name, used only in the file name, e.g. "บริษัท ก - [คดีนาย ข]"'),
  place: z.string().optional().describe('ทำที่ — where the grantor signs, as an address line (usually the grantor\'s own office or home). Printed right after the fixed words "ทำที่". Leave out if not known'),
  date: z.string().optional().describe('Date of signing, YYYY-MM-DD; printed as "16 ธันวาคม 2567". Leave out to keep the line blank for handwriting — never guess a date'),
  grantor: z.object({
    type: z.enum(['company', 'individual']).describe('ผู้มอบอำนาจ: a juristic person ("company") or one or more natural persons ("individual")'),
    company: z.object({
      name: z.string().describe('Full registered name, e.g. "บริษัท ตัวอย่าง จำกัด" — printed in bold'),
      incorporation: z.string().optional().describe('Leave out for the template\'s "นิติบุคคลจัดตั้งขึ้นถูกต้องตามกฎหมายแห่งราชอาณาจักรไทย"; a foreign company says where it is incorporated'),
      registrationNumber: z.string().optional().describe('ทะเบียนนิติบุคคลเลขที่ (13 digits)'),
      headOfficeAddress: z.string().optional().describe('สำนักงานแห่งใหญ่ — the address from "เลขที่" on (the words "สำนักงานแห่งใหญ่ตั้งอยู่ ณ เลขที่" are added)'),
      directors: z.array(z.object({
        name: z.string().describe('Director who signs, with title, e.g. "นายสมมุติ ใจดี"'),
        idNumber: z.string().optional().describe('Only if the user wants directors\' ID numbers printed')
      })).optional().describe('The authorised directors who sign for the company, as the company affidavit requires'),
      authorityWording: z.string().optional().describe('Leave out for "กรรมการผู้มีอำนาจลงลายมือชื่อและประทับตราสำคัญกระทำการแทนได้"; use the affidavit\'s own wording when two must sign together'),
      descriptionOverride: z.string().optional().describe('Replaces everything after the bold company name up to (“ผู้มอบอำนาจ”). Use only when the composed text will not do')
    }).optional(),
    persons: z.array(z.object({
      name: z.string().describe('With title, e.g. "นายสมชาย ใจดี" — printed in bold'),
      idType: z.enum(['id', 'passport']).optional().describe('"id" (default) prints บัตรประจำตัวประชาชนเลขที่; "passport" prints หนังสือเดินทางเลขที่'),
      idNumber: z.string().optional(),
      address: z.string().optional().describe('ภูมิลำเนา — from "เลขที่" on'),
      descriptionOverride: z.string().optional().describe('Replaces the text after this person\'s bold name')
    })).optional().describe('For type "individual": everyone who grants the power, in order'),
    capacity: z.string().optional().describe('Individuals only — words after (“ผู้มอบอำนาจ”), e.g. "ในฐานะส่วนตัว และในฐานะผู้แทนโดยชอบธรรมของเด็กชาย… บัตรประจำตัวประชาชนเลขที่ … ภูมิลำเนาอยู่ ณ …"')
  }).describe('ผู้มอบอำนาจ'),
  attorneys: z.array(z.object({
    name: z.string().describe('ผู้รับมอบอำนาจ, with title'),
    idNumber: z.string().optional().describe('13-digit Thai national ID; printed "1 2345 67890 12 3" and checked against its check digit')
  })).min(1).describe('The attorneys-in-fact, in the order of the table. They act "ร่วมกัน และ/หรือ แยกกัน" — the wording is fixed'),
  matterFacts: z.object({
    counterparty: z.string().describe('คู่กรณี — who will be sued, exactly as named in the contract or complaint; several joined with " และ/หรือ ". The template reads "…ที่เกี่ยวข้องกับ[counterparty] (“คู่กรณี”)"'),
    courts: z.array(z.string()).describe('Courts where the case will be filed, each starting with "ศาล", e.g. ["ศาลแพ่ง", "ศาลอาญา"]. Used in the narrative and, without the first "ศาล", in clause 1 ("…ต่อศาล[แพ่ง ศาลอาญา] หรือศาลสถิตยุติธรรมอื่นใดที่มีเขตอำนาจ")'),
    otherBodies: z.array(z.string()).optional().describe('Regulators or agencies also to be approached, e.g. ["แพทยสภา"]. Printed in the narrative only; give them their own power in extraClauses'),
    cause: z.string().describe('What gives rise to the claim, reading on from "อันเนื่องมาจาก": the legal relationship with its document and date, then the breach, e.g. "นิติสัมพันธ์ตามสัญญาซื้อขายสินค้า ระหว่างผู้มอบอำนาจและคู่กรณี ลงวันที่ 1 มีนาคม 2569 หากแต่คู่กรณีผิดสัญญาไม่ชำระราคาสินค้าดังกล่าว". No full stop'),
    definedTerm: z.string().describe('Short defined term for the cause, without quotes, e.g. "การผิดสัญญา" or "การทำละเมิด". Printed as (“…”) after the narrative, and in clauses 1 and 6'),
    narrativeOverride: z.string().optional().describe('Replaces the whole stretch between (“คู่กรณี”) and (“definedTerm”), which is otherwise composed as "ต่อ[courts otherBodies] หรือศาลสถิตยุติธรรมที่มีเขตอำนาจ องค์กร หน่วยงานของรัฐ และ/หรือ พนักงานเจ้าหน้าที่ตลอดจนบุคคลที่เกี่ยวข้องอื่นใด อันเนื่องมาจาก[cause]". Must start with "ต่อ"'),
    clause1CourtsOverride: z.string().optional().describe('Replaces the courts in clause 1, after the printed "ต่อศาล", e.g. "แพ่ง ศาลอาญา"')
  }).describe('The matter. Draft it from the user\'s facts in the firm\'s style; never invent a name, number, date or amount — write "(*)" where it is missing (printed highlighted)'),
  extraClauses: z.array(z.object({
    afterClause: z.number().int().min(0).max(8).describe('Insert after fixed clause n (0 = before clause 1). Numbering follows automatically'),
    text: z.string().describe('The clause, starting "ให้มีอำนาจ…"')
  })).optional().describe('Powers the eight fixed clauses do not give — e.g. filing complaints with a regulator in otherBodies. The fixed clauses are: 1 sue the counterparty; 2 conduct proceedings and dispose of rights; 3 appoint lawyers (CPC s.62); 4 sign documents and certify translations; 5 negotiate and settle; 6 give statements about the cause; 7 anything necessary; 8 appoint sub-attorneys'),
  witnesses: z.array(z.string()).optional().describe('Witness names; "" leaves a line to write in. Default two blank witnesses'),
  signaturesOnNextPage: z.boolean().optional().describe('Default true: print "-ส่วนที่เหลือของหน้านี้เจตนาเว้นว่างไว้ ผู้มอบอำนาจ และผู้รับมอบอำนาจลงนามในหน้าถัดไป-" and start the signature table on a new page, so no signature block is split across pages'),
  stampDuty: z.object({
    principals: z.number().int().min(1).optional().describe('How many separate principals the duty is counted for (Revenue Code s.108). Default: 1 for a company, the number of persons for individuals'),
    amountOverride: z.string().optional().describe('The baht figure printed in "-ติดอากรแสตมป์ … บาท-" if it must differ from the computed one')
  }).optional(),
  fileName: z.string().optional().describe('Override the file name (without .docx)')
};

/* ใบแต่งทนายความ — the schema a model fills. Keys are English for the caller;
   they map one-to-one onto the page's own state (see toPoaState in poa.mjs). The rules
   in the descriptions are the guide's (document-automation/attorney-appointment.guide.md). */
const POA_INPUT = {
  form: z.enum(['JDA', 'PY']).describe(
    'Which of the firm\'s two precedents to fill. "JDA" is the defendant-side file, whose authority clause reads ' +
    '"การถอนคำให้การ"; "PY" is the plaintiff-side file, reading "การถอนฟ้อง". Default to the side the clients are on ' +
    '(จำเลย → JDA; โจทก์/ผู้ร้อง → PY), but if the user names a form, use it — it is the lawyer\'s call. The authority ' +
    'wording itself is never edited.'),
  case: z.object({
    matter: z.string().optional().describe('Short matter name, used only in the file name, e.g. "01 บริษัท ก."'),
    blackNo: z.string().optional().describe('คดีหมายเลขดำที่ — prefix and number as the court issued it, e.g. "พ.1234". No "/25xx"'),
    blackYear: z.string().optional().describe('Buddhist-era year of the black number — last two digits only, e.g. "69"'),
    redNo: z.string().optional().describe('คดีหมายเลขแดงที่ — usually not issued yet when the appointment is filed: leave out'),
    redYear: z.string().optional().describe('Last two digits of the red-number year'),
    court: z.string().optional().describe('Only the words after the printed "ศาล", e.g. "แพ่งกรุงเทพใต้" or "จังหวัดเชียงใหม่"'),
    caseType: z.string().optional().describe('ความ — แพ่ง, อาญา, ผู้บริโภค, แรงงาน, ล้มละลาย … Defaults to แพ่ง'),
    date: z.string().optional().describe('Date the appointment is signed, YYYY-MM-DD (printed as Thai day/month/BE year). Leave out to keep the date line blank for handwriting — never guess it'),
    partyTop: z.string().optional().describe('Upper party in the ระหว่าง block, exactly as in the plaint, e.g. "บริษัท ก. จำกัด" or "นาย ข. กับพวกรวม 3 คน"'),
    partyTopRole: z.string().optional().describe('Its role, one word: โจทก์ (default), ผู้ร้อง …'),
    partyBottom: z.string().optional().describe('Lower party in the ระหว่าง block'),
    partyBottomRole: z.string().optional().describe('Its role: จำเลย (default), ผู้คัดค้าน …')
  }).describe('The case, printed on page 1'),
  clients: z.array(z.object({
    name: z.string().describe('The client this lawyer acts for (ขอรับเป็นทนายความของ), e.g. "นาย ข."'),
    role: z.string().describe('The client\'s role, e.g. "จำเลยที่ 1", "โจทก์", "ผู้ร้อง"'),
    appointer: z.string().optional().describe('ข้าพเจ้า — who signs the appointment. The attorney-in-fact\'s name; or the client\'s own name when the client signs; or for a company "บริษัท ก. จำกัด โดยนาย ค. ผู้รับมอบอำนาจ". Never guess who holds the power of attorney'),
    appointerCapacity: z.string().optional().describe('Words right-aligned after the signer\'s name. Leave out for automatic: "ผู้รับมอบอำนาจ" + role, or just the role when the client signs itself. Send "" when the company form above already says ผู้รับมอบอำนาจ'),
    signatureName: z.string().optional().describe('Name in brackets under the signer\'s signature. Leave out for automatic (the signer; for "… โดยนาย ค. …" the part after โดย)'),
    lawyers: z.array(z.string()).min(1).describe('Keys of the lawyers (from `lawyers`) appointed for this client — one document per lawyer')
  })).min(1).describe('One entry per client the firm acts for in this case'),
  lawyers: z.array(z.object({
    key: z.string().describe('Short key, e.g. the lawyer\'s initials; also ends the file name'),
    name: z.string().describe('Full name with title, exactly as on the bar licence'),
    idNumber: z.string().optional().describe('13-digit Thai national ID (checked against its check digit)'),
    licenseNumber: z.string().optional().describe('Bar licence "number/full BE year", e.g. "1234/2567"'),
    phone: z.string().optional().describe('The lawyer\'s own phone. The office address is fixed by the form and is not sent'),
    email: z.string().optional().describe('The lawyer\'s e-mail')
  })).min(1).describe('The lawyers referred to by clients[].lawyers. Only values from the user\'s material — never invent an ID or licence number'),
  officePhone: z.string().optional().describe('The office line printed on page 2 ("สำนักงานอยู่ที่ … โทรศัพท์"). Leave out to use the server\'s configured office number, or blank'),
  maxCondensePt: z.number().min(0).max(1).optional().describe('Largest character condensing allowed on a value that would otherwise wrap, in points. Default 0.75; 0 = never condense, only report')
};


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
    inputSchema: INPUT,
    outputSchema: {
      location: z.string().describe('Where the document went — a local file path from the stdio server, or a one-time download URL from the HTTP server'),
      fileSizeKB: z.number(),
      stampDuty: z.object({
        computed: z.boolean(),
        dutyOnOriginalBaht: z.number().optional(),
        dutyOnDuplicateBaht: z.number().optional(),
        totalBaht: z.number().optional(),
        basisBaht: z.number().optional(),
        usedPaidUpValueAsFloor: z.boolean().optional().describe('true if no transfer price was given, so the paid-up value set the basis'),
        missingInputs: z.array(z.string()).optional().describe('Present only when computed is false')
      }),
      unresolvedPlaceholders: z.array(z.string()).describe('Fields deliberately left as "(*)" to settle before signing'),
      blankFields: z.array(z.string()).describe('Fields left empty in the generated document'),
      isDraft: z.literal(true)
    }
  }, async args => {
    const t = normalizeTransfer(toInternal(args));
    const buf = await buildDocx(t);
    const delivery = await deliver(fileNameOf(t), buf);

    const duty = dutyOf(t);
    const open = unresolved(t);
    const fileSizeKB = Math.round(buf.length / 1024);

    if (user) {
      console.error(`[${new Date().toISOString()}] ${user} created a transfer instrument: ` +
        `${args.company?.nameThai || args.company?.nameEnglish || 'company not named'} — ` +
        `${args.shares?.count ?? '?'} shares`);
    }

    const report = [
      `${delivery.message} (${fileSizeKB} KB).`,
      duty.ok
        ? `Stamp duty: ${duty.duty} baht on the Original + ${duty.dup} baht counterpart on the Duplicate = ${duty.total} baht, on a basis of ${duty.basis.toLocaleString('en-US')} baht.` +
          (duty.floor ? ' No transfer price was given, so the paid-up value set the basis.' : '')
        : `Stamp duty could not be worked out — missing: ${duty.missing.join(', ') || 'a basis to compute on'}.`,
      open.placeholder.length ? `Left as "(*)" to settle before signing: ${open.placeholder.join(', ')}.` : '',
      open.blank.length ? `Blank in the document: ${open.blank.join(', ')}.` : '',
      'Draft only — have a lawyer check it against the source instructions before it is signed.'
    ].filter(Boolean).join('\n');

    const structuredContent = {
      location: delivery.location,
      fileSizeKB,
      stampDuty: duty.ok
        ? { computed: true, dutyOnOriginalBaht: duty.duty, dutyOnDuplicateBaht: duty.dup, totalBaht: duty.total, basisBaht: duty.basis, usedPaidUpValueAsFloor: duty.floor }
        : { computed: false, missingInputs: duty.missing },
      unresolvedPlaceholders: open.placeholder,
      blankFields: open.blank,
      isDraft: true
    };

    return { content: [{ type: 'text', text: report }], structuredContent };
  });

  server.registerTool('create_plain_document', {
    title: 'Create a plain Word document (.docx)',
    description:
      'Turn plain text into a real .docx using the firm\'s own document engine, instead of ' +
      'generating one from scratch. Use this whenever the user wants a Word file of ordinary ' +
      'text — a letter, a memo, a summary, meeting notes — with no legal template involved. ' +
      'Give it a title (optional) and an ordered list of blocks: heading1, heading2, paragraph ' +
      '(optionally bold/italic) or bullet. Thai and English render correctly in the same ' +
      'document; there is no length limit beyond what is reasonable for one file.',
    inputSchema: PLAIN_INPUT_SHAPE,
    outputSchema: {
      location: z.string().describe('Where the document went — a local file path from the stdio server, or a one-time download URL from the HTTP server'),
      fileSizeKB: z.number()
    }
  }, async args => {
    const buf = await buildPlainDocx(args);
    const delivery = await deliver(fileNameOfPlain(args), buf);
    const fileSizeKB = Math.round(buf.length / 1024);

    if (user) {
      console.error(`[${new Date().toISOString()}] ${user} created a plain document: ${args.title || fileNameOfPlain(args)}`);
    }

    return {
      content: [{ type: 'text', text: `${delivery.message} (${fileSizeKB} KB).` }],
      structuredContent: { location: delivery.location, fileSizeKB }
    };
  });

  server.registerTool('create_attorney_appointment', {
    title: 'Create ใบแต่งทนายความ (attorney appointment, court form ๙)',
    description:
      'Fill the firm\'s own Thai court form (๙) ใบแต่งทนายความ and return .docx files — one per client and per ' +
      'lawyer. The firm\'s JDA (defendant, "การถอนคำให้การ") or PY (plaintiff, "การถอนฟ้อง") precedent is used as it ' +
      'is: values are typed into the form\'s own runs, and the CPC s.62 authority wording and the office address ' +
      'on page 2 are never changed. Every value must fit its printed line so the form stays on two pages; the ' +
      'result reports, per document, any value that had to be condensed and any that is still too long — tell the ' +
      'user about both, and shorten (never abbreviate a party name against the plaint) and call again for the ' +
      'latter. Leave out anything not in the user\'s material rather than guessing; blanks are reported. ' +
      'The result is a draft for a lawyer to check — say so when reporting it.',
    inputSchema: POA_INPUT,
    outputSchema: {
      form: z.enum(['JDA', 'PY']),
      withdrawalWording: z.string().describe('The authority-clause wording printed on this form'),
      documents: z.array(z.object({
        fileName: z.string(),
        location: z.string().describe('A local file path from the stdio server, or a one-time download URL from the HTTP server'),
        client: z.string(),
        clientRole: z.string(),
        lawyer: z.string(),
        fileSizeKB: z.number(),
        fit: z.enum(['ok', 'condensed', 'overflow']),
        condensed: z.array(z.object({ field: z.string(), label: z.string(), points: z.number() })),
        overflow: z.array(z.object({ field: z.string(), label: z.string(), overByPoints: z.number() }))
      })),
      blankFields: z.array(z.string()).describe('Printed lines left empty in at least one document (Thai labels)'),
      unmatchedLawyerKeys: z.array(z.string()).describe('clients[].lawyers keys with no matching entry in lawyers — no document was made for them'),
      invalidIdNumbers: z.array(z.string()).describe('Lawyers whose ID number fails the Thai check digit'),
      isDraft: z.literal(true)
    }
  }, async args => {
    const job = await attorneyAppointmentJob(args);
    const documents = [];
    for (const { buffer, ...d } of job.documents) {
      const delivery = await deliver(d.fileName.replace(/\.docx$/, ''), buffer);
      documents.push({ ...d, location: delivery.location, message: delivery.message });
    }
    const { unmatchedLawyerKeys, invalidIdNumbers, withdrawalWording: wording } = job;
    const blank = new Set(job.blankFields);

    if (user) {
      console.error(`[${new Date().toISOString()}] ${user} created ${documents.length} attorney appointment(s), form ${args.form}`);
    }

    const lines = [
      documents.length
        ? `Form ${args.form} ("${wording}") — ${documents.length} document${documents.length > 1 ? 's' : ''}:`
        : 'No document was made — no client names a lawyer that is listed in `lawyers`.',
      ...documents.map(d => {
        const bits = [`• ${d.fileName}: ${d.message} (${d.fileSizeKB} KB).`];
        if (d.condensed.length) bits.push(`  Condensed to fit: ${d.condensed.map(c => `${c.label} ${c.points} pt`).join(', ')}.`);
        if (d.overflow.length) bits.push(`  TOO LONG — Word will wrap these and the form may run to 3 pages: ${d.overflow.map(o => `${o.label} (+${o.overByPoints} pt)`).join(', ')}. Shorten and generate again.`);
        return bits.join('\n');
      }),
      unmatchedLawyerKeys.length ? `No lawyer listed for key(s): ${unmatchedLawyerKeys.join(', ')}.` : '',
      invalidIdNumbers.length ? `ID number fails the check digit for: ${invalidIdNumbers.join(', ')} — check it.` : '',
      blank.size ? `Left blank on the form: ${[...blank].join(', ')}.` : '',
      'Draft only — have a lawyer check it against the case file before it is signed.'
    ].filter(Boolean).join('\n');

    return {
      content: [{ type: 'text', text: lines }],
      structuredContent: {
        form: args.form, withdrawalWording: wording,
        documents: documents.map(({ message, ...d }) => d),
        blankFields: [...blank], unmatchedLawyerKeys, invalidIdNumbers, isDraft: true
      }
    };
  });

  server.registerTool('create_power_of_attorney', {
    title: 'Create หนังสือมอบอำนาจให้ฟ้องคดี (power of attorney to sue)',
    description:
      'Fill the firm\'s own power-of-attorney-to-sue template and return one .docx. The fixed wording — the opening, the ' +
      '"ร่วมกัน และ/หรือ แยกกัน" grant, the eight powers and the ratification — is the firm\'s, untouched; this tool types ' +
      'only the grantor, the attorneys, the counterparty, the courts, the cause and its defined term, and any added clauses ' +
      'into the template\'s own Word runs. The signature table is laid out from the firm\'s rows for any number of signers, ' +
      'and the stamp duty (schedule item 7: 30 baht per attorney acting separately) is computed and printed. ' +
      'Draft the matter from the user\'s facts; leave out what is not in them rather than guessing — blanks and invalid ID ' +
      'numbers are reported. The result is a draft for a lawyer to check — say so when reporting it.',
    inputSchema: PWA_INPUT,
    outputSchema: {
      location: z.string().describe('A local file path from the stdio server, or a one-time download URL from the HTTP server'),
      fileName: z.string(),
      fileSizeKB: z.number(),
      stampDuty: z.object({
        scheduleItem: z.string().describe('ลักษณะแห่งตราสาร 7(ข) or 7(ค)'),
        attorneys: z.number(), principals: z.number(), computedBaht: z.number(),
        printed: z.string().describe('The figure printed in the document'), overridden: z.boolean()
      }),
      blankFields: z.array(z.string()).describe('Parts left empty (Thai labels)'),
      invalidIdNumbers: z.array(z.string()).describe('People whose 13-digit ID fails the Thai check digit'),
      warnings: z.array(z.string()),
      isDraft: z.literal(true)
    }
  }, async args => {
    const job = await powerOfAttorneyJob(args);
    const base = job.baseName;
    const delivery = await deliver(base, job.buffer);
    const d = job.stamp, rep = job.report;
    const fileSizeKB = job.fileSizeKB;
    if (user) {
      console.error(`[${new Date().toISOString()}] ${user} created a power of attorney to sue: ${d.attorneys} attorney(s)`);
    }
    const text = [
      `${delivery.message} (${fileSizeKB} KB).`,
      `Stamp duty: ${d.overridden ? d.amount + ' baht printed (computed ' + d.auto + ')' : d.auto + ' baht'} — schedule item ${d.item}, ` +
        `${d.attorneys} attorney${d.attorneys > 1 ? 's' : ''} × 30 baht` + (d.principals > 1 ? ` × ${d.principals} principals (s.108)` : '') + '.',
      rep.blank.length ? `Left blank: ${rep.blank.join(', ')}.` : '',
      rep.invalidIds.length ? `ID number fails the check digit for: ${rep.invalidIds.join(', ')} — check it.` : '',
      ...rep.warnings,
      'Draft only — have a lawyer check it against the instructions and the documents before it is signed.'
    ].filter(Boolean).join('\n');
    return {
      content: [{ type: 'text', text }],
      structuredContent: {
        location: delivery.location, fileName: base + '.docx', fileSizeKB,
        stampDuty: job.stampDuty,
        blankFields: rep.blank, invalidIdNumbers: rep.invalidIds, warnings: rep.warnings, isDraft: true
      }
    };
  });

  registerDateTools(server);

  return server;
}
