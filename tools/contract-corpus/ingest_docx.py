#!/usr/bin/env python3
# -*- coding: utf-8 -*-
""".docx → blocks (DESIGN.md §3.1).

Walks `document.element.body` in document order, so tables stay where they are:
`python-docx`'s `.paragraphs` silently drops every table, and the supplied
contracts carry 6–12 tables each, with real substance in them.

Clause numbers are NOT read out of the text here — in the real files they are
Word auto-numbering held in numbering.xml and absent from `Paragraph.text`
(DESIGN.md §3.3, §7). `docx_numbering.NumberingWalker` reconstructs them, and
every body paragraph is fed to it exactly once, in order, including paragraphs
inside table cells, because those advance Word's counters too.

    python3 ingest_docx.py contract.docx | head

emits the block list as JSON for a quick look.
"""
import json
import os
import re
import sys

import docx_numbering
from docx_numbering import q

# ── Dependency guard ─────────────────────────────────────────────────────────

INSTALL_HINT = (
    "    pip install pythainlp python-docx\n"
    "Tested with python-docx 1.2.0 (see README.md)."
)


class MissingDependency(RuntimeError):
    pass


def _docx():
    try:
        import docx
    except ImportError as exc:                      # pragma: no cover - env dependent
        raise MissingDependency(
            "Reading .docx needs python-docx, which is not installed.\n" + INSTALL_HINT
        ) from exc
    return docx


# ── Structure helpers ────────────────────────────────────────────────────────

HEADING_STYLE = re.compile(r"heading", re.IGNORECASE)


def is_heading_style(style_name):
    """Any style whose name contains 'heading' — the real files use a custom
    `CenterHeading`, so `Heading 1`..`Heading 3` alone is not enough (§3.1)."""
    return bool(style_name and HEADING_STYLE.search(style_name))


# A table of contents is generated furniture, not contract text. Three of the
# supplied contracts carry one (TOCHeading + TOC1 x16/16/20), and each entry
# reproduces a clause heading followed by its page number. Left in, a TOC does
# two kinds of damage:
#   - "เอกสารแนบท้าย 1. ตราสารโอนหุ้น 21" is heading-like and opens the annex zone
#     at the FRONT of the document, so the whole operative agreement is
#     misfiled as annex — measured: 196 annex vs 18 body clauses
#   - every clause heading is duplicated, inflating frequency counts and
#     manufacturing phantom recurring clauses in the clause library
# Word marks them reliably, so detect them structurally rather than by guessing
# at "line ending in a page number".
TOC_STYLE = re.compile(r"^\s*toc", re.I)


def is_toc_paragraph(el, style_name):
    """True for a generated table-of-contents entry or its heading."""
    if style_name and TOC_STYLE.search(style_name):
        return True
    for instr in el.iter(q("instrText")):
        text = (instr.text or "").upper()
        if " TOC " in text or text.strip().startswith("TOC") or "PAGEREF" in text:
            return True
    for fld in el.iter(q("fldSimple")):
        instr = (fld.get(q("instr")) or "").upper()
        if "TOC" in instr or "PAGEREF" in instr:
            return True
    return False


def _style_name(el, document):
    """Resolved style name, falling back to the raw styleId."""
    try:
        from docx.text.paragraph import Paragraph
        name = Paragraph(el, document).style.name
        if name:
            return name
    except Exception:                               # noqa: BLE001 - style table may be odd
        pass
    style = el.find("%s/%s" % (q("pPr"), q("pStyle")))
    return style.get(q("val")) if style is not None else None


def _text_of(el):
    """All w:t under an element, tabs and breaks turned into separators."""
    out = []
    for node in el.iter():
        if node.tag == q("t"):
            out.append(node.text or "")
        elif node.tag == q("tab"):
            out.append(" ")
        elif node.tag == q("br") and node.get(q("type")) != "page":
            out.append("\n")
    return "".join(out)


def _page_breaks(el):
    """Explicit page breaks in a paragraph; Word's own rendered breaks as a
    fallback. Word repaginates on open, so docx page numbers are approximate —
    this is stated in README.md rather than pretended away."""
    explicit = 0
    if el.find("%s/%s" % (q("pPr"), q("pageBreakBefore"))) is not None:
        explicit += 1
    for br in el.iter(q("br")):
        if br.get(q("type")) == "page":
            explicit += 1
    if explicit:
        return explicit
    return sum(1 for _ in el.iter(q("lastRenderedPageBreak")))


def _walk(el):
    """Yield ('p'|'tbl', element) for the block-level children in document
    order, descending through wrappers (w:sdt) but never into a table."""
    for child in el:
        if child.tag == q("p"):
            yield "p", child
        elif child.tag == q("tbl"):
            yield "tbl", child
        elif child.tag in (q("sdt"), q("sdtContent"), q("smartTag"), q("customXml")):
            for item in _walk(child):
                yield item


# ── Ingest ───────────────────────────────────────────────────────────────────

def _paragraph_block(el, document, walker, page):
    """One body paragraph → a block, with its reconstructed clause number."""
    label, path = walker.label_for(el)
    style = _style_name(el, document)
    text = _text_of(el)
    if is_toc_paragraph(el, style):
        kind = "toc"
    else:
        kind = "heading" if is_heading_style(style) else "para"
    block = {"kind": kind, "text": text, "page": page, "conf": 1.0, "style": style}
    if label:
        block["num"] = {"nd": label, "p": path}
    return block


def _cell_text(tc, document, walker, page):
    """Cell content as one string. Numbered paragraphs inside a cell keep their
    label inline — in a table the number is content, not clause structure — and
    are still fed to the walker so its counters stay in step with Word."""
    parts = []
    for tag, el in _walk(tc):
        if tag == "p":
            label, _path = walker.label_for(el)
            text = _text_of(el).strip()
            if label and text:
                parts.append("%s %s" % (label, text))
            elif label:
                parts.append(label)
            elif text:
                parts.append(text)
        else:                                       # a nested table, flattened
            for row in _row_texts(el, document, walker, page):
                parts.append(row)
    return " ".join(parts).strip()


def _row_texts(tbl, document, walker, page):
    """One string per table row, cells joined by ' | ' (§3.1)."""
    rows = []
    for tr in tbl.findall(q("tr")):
        cells = [_cell_text(tc, document, walker, page) for tc in tr.findall(q("tc"))]
        rows.append(" | ".join(cells).strip())
    return rows


def _part_blocks(part, kind, page):
    """Header or footer part → blocks. These live outside the body, so they are
    not fed to the numbering walker."""
    element = getattr(part, "_element", None)
    if element is None:
        element = getattr(part, "element", None)
    if element is None:
        return []
    blocks = []
    for tag, el in _walk(element):
        if tag == "p":
            text = _text_of(el)
            if text.strip():
                blocks.append({"kind": kind, "text": text, "page": page, "conf": 1.0})
        else:
            for row in _row_texts(el, None, _NullWalker(), page):
                if row.strip():
                    blocks.append({"kind": kind, "text": row, "page": page, "conf": 1.0})
    return blocks


class _NullWalker(object):
    """Headers and footers carry no clause numbering."""

    def label_for(self, p):
        return None, None


def ingest(path, doc_id=None):
    """-> {"id", "src": {...}, "blocks": [...]} — blocks in document order.

    Headers come first and footers last: they repeat on every page, so there is
    no one place in the body where they belong, and keeping them at the edges
    leaves the body's own order untouched.
    """
    docx = _docx()
    document = docx.Document(path)
    walker = docx_numbering.NumberingWalker(document)

    body_blocks, page = [], 1
    for tag, el in _walk(document.element.body):
        if tag == "p":
            page += _page_breaks(el)
            body_blocks.append(_paragraph_block(el, document, walker, page))
        else:
            for row in _row_texts(el, document, walker, page):
                body_blocks.append({"kind": "row", "text": row, "page": page, "conf": 1.0})
    pages = page

    head_blocks, foot_blocks = [], []
    for section in document.sections:
        for part, kind, at, into in ((section.header, "header", 1, head_blocks),
                                     (section.footer, "footer", pages, foot_blocks)):
            if part is None:
                continue
            try:
                into.extend(_part_blocks(part, kind, at))
            except (AttributeError, KeyError, NotImplementedError):
                continue

    blocks = head_blocks + body_blocks + foot_blocks
    for i, block in enumerate(blocks):
        block["i"] = i

    return {
        "id": doc_id or os.path.splitext(os.path.basename(path))[0],
        "src": {"file": path, "method": "docx", "pages": pages},
        "blocks": blocks,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    print(json.dumps(ingest(sys.argv[1]), ensure_ascii=False, indent=1))
