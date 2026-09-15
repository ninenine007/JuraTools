/* A second, much smaller use of the same engine as transfer.mjs: pack a real
   Word template with JSZip, write runs with buildRuns so Thai gets w:cs and
   is never garbled. The difference is there is no fixed template to fill —
   the body is assembled block by block from whatever the caller sends. */
import { z } from 'zod';
import { buildRuns, packDocx } from './common.mjs';

/* The one input contract, shared by the MCP tool (which wants a raw shape)
   and the REST Action (which wants a parseable z.object) — so the two
   transports can never quietly drift apart on what counts as valid input. */
export const BLOCK = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading1'), text: z.string() }).describe('A top-level heading'),
  z.object({ type: z.literal('heading2'), text: z.string() }).describe('A sub-heading'),
  z.object({
    type: z.literal('paragraph'), text: z.string(),
    bold: z.boolean().optional(), italic: z.boolean().optional()
  }).describe('A normal paragraph, optionally bold or italic throughout'),
  z.object({ type: z.literal('bullet'), text: z.string() }).describe('One bullet-list item')
]);

export const PLAIN_INPUT_SHAPE = {
  title: z.string().optional().describe('Document title, centered and bold at the top. Omit for none'),
  blocks: z.array(BLOCK).min(1).describe('The body content, in order'),
  fileName: z.string().optional().describe('Override the file name (without extension). Defaults to the title')
};

export const PlainDocumentInput = z.object(PLAIN_INPUT_SHAPE);

const STYLE_OF = { heading1: 'Heading1', heading2: 'Heading2', bullet: 'ListParagraph' };

function paragraphXml(block) {
  const style = STYLE_OF[block.type];
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const rpr = (block.bold ? '<w:b/>' : '') + (block.italic ? '<w:i/>' : '');
  const text = block.type === 'bullet' ? `•  ${block.text}` : block.text;
  return `<w:p>${pPr}${buildRuns(rpr, text)}</w:p>`;
}

export function buildPlainDocx({ title, blocks }) {
  const body = [
    title ? `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${buildRuns('', title)}</w:p>` : '',
    ...blocks.map(paragraphXml)
  ].filter(Boolean).join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  return packDocx('plain', xml);
}

const SAFE = s => String(s).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

export function fileNameOfPlain({ title, fileName }) {
  if (fileName) return SAFE(fileName);
  if (title) return SAFE(title).slice(0, 80);
  return 'Document';
}
