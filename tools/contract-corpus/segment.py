#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clause and zone segmentation, language tagging (DESIGN.md §3.3).

Two clause-number strategies, deliberately not unified:

  * DOCX  — the number is Word auto-numbering and is absent from the text, so
            ingest_docx.py reconstructs it with NumberingWalker and hands it to
            us on the block as `num`. Measured on the supplied contracts: 12,
            166 and 88 auto-numbered paragraphs, and 0 that a text regex found.
  * Azure — the number was rendered onto the page, so it comes back as ordinary
            text and CLAUSE below is the right tool. It also serves as the DOCX
            fallback for a literal `2.` someone typed by hand.

Nothing is dropped. A block the rules cannot place becomes a clause with
`z: "unplaced"` (DESIGN.md §1.4); blocks that cleaned away to nothing are
counted and reported by QC instead of vanishing unremarked.
"""
import re

import nlp

try:
    # `parse_label` is pure text handling, but it lives in docx_numbering, which
    # imports python-docx. So the segment stage needs python-docx installed even
    # for an Azure-only corpus — say so plainly rather than raising ImportError.
    from docx_numbering import THAI_DIGITS, parse_label
except ImportError as exc:                          # pragma: no cover - env dependent
    raise ImportError(
        "segment.py reads clause labels through docx_numbering, which imports "
        "python-docx.\n" + nlp.INSTALL_HINT) from exc

# ── Clause numbers ───────────────────────────────────────────────────────────

CLAUSE = re.compile(r"^\s*(?:ข้อ\s*)?([๐-๙0-9]+(?:[.ฯ][๐-๙0-9]+)*)\s*[.)]?\s+(?=\S)")


def arabic(text):
    """Thai numerals → Arabic, for metadata only. `t` keeps ๐–๙ as written."""
    return "".join(str(THAI_DIGITS.index(ch)) if ch in THAI_DIGITS else ch for ch in text)


def number_from_block(block):
    """-> (n, nd, p, text) — the block's clause number and its remaining text.

    `docx_numbering.parse_label` does the reading on both paths, so `n` and `p`
    mean the same thing whichever ingester produced the block. It parses the
    rendered label rather than counting levels, because drafters type the parent
    number straight into lvlText (`5.%1.` at level 0 reads as 5.1, path [5,1]).

    The walker's label wins; the text regex is the fallback, and only then is a
    literal prefix stripped out of the text.
    """
    text = block.get("text") or ""
    num = block.get("num")
    if num and num.get("nd"):
        label = num["nd"]
        number, parsed = parse_label(label)
        return number, label, list(num.get("p") or parsed), text
    match = CLAUSE.match(text)
    if match and block.get("kind") in ("para", "heading"):
        label = match.group(1)
        number, path = parse_label(label)
        return number, label, path, text[match.end():]
    return None, None, [], text


# ── Zones (§3.3) ─────────────────────────────────────────────────────────────

ZONE_CUES = (
    ("preamble", ("โดยที่", "ทำขึ้น ณ", "ทำที่", "สัญญาฉบับนี้ทำขึ้น")),
    ("parties", ("ระหว่าง", "ซึ่งต่อไปนี้เรียกว่า", "ฝ่ายหนึ่ง")),
    ("definitions", ("ในสัญญานี้", "หมายความว่า", "คำนิยาม")),
    ("signature", ("ลงชื่อ", "ลงลายมือชื่อ", "พยาน")),
    ("annex", ("เอกสารแนบท้าย", "ภาคผนวก", "สิ่งที่ส่งมาด้วย")),
)
ZONE_ORDER = {"preamble": 0, "parties": 1, "definitions": 2,
              "body": 3, "signature": 4, "annex": 5}
# "toc" joins these: a generated table of contents is furniture that reproduces
# every clause heading, so it must neither open a zone nor reach the frequency
# tables. Kept and marked, never dropped (§1.4).
MARGINAL_KINDS = ("header", "footer", "footnote", "toc")

# A cue may open a zone only where the paragraph IS that thing, never where it
# merely mentions one. Measured on eight real contracts: a party description
# reading "บุคคลที่มีรายชื่อปรากฏในเอกสารแนบท้าย 1 (ในฐานะ …)" opened an annex zone
# that then swallowed 181 clauses, because a zone runs until the next one opens.
# Every cue word — ลงชื่อ, คำนิยาม, โดยที่, ระหว่าง — occurs mid-sentence in ordinary
# clause prose, so the same discipline applies to all of them:
#   the cue must open the paragraph, and the paragraph must be heading-like.
HEADING_LIKE_CHARS = 60
OPENERS = " \t\"'“‘([<•-—–\u00a0"

# A numbered clause inside the definitions zone is a definition entry, not the
# start of the operative body — unless it stops reading like one.
DEFINITION_MARKS = ("หมายความว่า", "หมายถึง", "ให้หมายความรวมถึง", "means", "shall mean")

# Safety valve: an open clause stops swallowing continuation paragraphs at this
# length, so one runaway document cannot become one unreadable clause.
MAX_CLAUSE_CHARS = 4000


def is_heading_like(block, text):
    """A heading-styled paragraph, or a line short enough to be a section head.

    Heading style is the primary signal — on the real files 88% of clauses carry
    a heading — and the length test is the fallback for documents with no
    heading styles at all, which also exist (§7).
    """
    return block.get("kind") == "heading" or len(text.strip()) <= HEADING_LIKE_CHARS


# An annex heading NAMES an annex — "เอกสารแนบท้าย 1", "เอกสารแนบท้ายหมายเลข 1",
# "ภาคผนวก ก". An operative clause merely talks about them:
#   "เอกสารแนบท้ายสัญญานี้ ให้ถือเป็นส่วนหนึ่งของสัญญานี้ด้วย"  (SPA clause 12.9)
# That sentence is 54 characters, so it passes the heading-like test and opened
# an annex zone that then swallowed the rest of the agreement — measured on two
# Luzerne contracts as 273 annex vs 28 body, and 199 vs 88. So for the annex cue
# specifically, require an annex IDENTIFIER right after the cue: digits, Thai
# digits, or a single Thai letter standing alone. "สัญญานี้" begins with a Thai
# consonant but is followed by a vowel mark, so it is not an ordinal and is
# correctly rejected.
ANNEX_LABEL = re.compile(
    r"^\s*(?:หมายเลข|ที่|ลำดับที่|เลขที่|no\.?|#)?\s*"
    r"(?:[0-9\u0e50-\u0e59]+|[\u0e01-\u0e2e](?![\u0e01-\u0e4e]))",
    re.I,
)


def opens_annex(head, cue):
    """True only when the annex cue is followed by something naming an annex."""
    return bool(ANNEX_LABEL.match(head[len(cue):]))


def cue_zone(text, heading_like):
    """First cue in stage order that OPENS a heading-like paragraph, or None."""
    if not heading_like:
        return None
    head = text.lstrip(OPENERS)
    for zone, cues in ZONE_CUES:
        for cue in cues:
            if not head.startswith(cue):
                continue
            if zone == "annex" and not opens_annex(head, cue):
                continue          # talks about annexes; does not start one
            return zone
    return None


def looks_like_definition(text):
    return any(mark in text for mark in DEFINITION_MARKS)


def holds_zone(current, text):
    """True when a numbered paragraph is still part of the section it is in.

    Parties and recitals are numbered too — the real files run parties `1.`–`3.`
    and recitals `ก.`–`ง.` before the operative clauses restart at `1.` (§7) — so
    "body once numbered clauses begin" cannot be taken literally or the front of
    every contract becomes body. A paragraph carrying a cue for the zone we are
    in, or an earlier one, holds where it is. This never *opens* a zone, so it
    cannot resurrect the mid-sentence-mention bug.
    """
    order = ZONE_ORDER.get(current, ZONE_ORDER["definitions"])
    if current == "definitions" and looks_like_definition(text):
        return True
    for zone, cues in ZONE_CUES:
        if ZONE_ORDER[zone] > order:
            continue
        if any(cue in text for cue in cues):
            return True
    return False


def next_zone(current, block, numbered, text):
    """-> the zone this block belongs to. Zones only move forward, except
    between signature and annex, which real contracts interleave.

    `text` is the paragraph with its clause number already taken off, so a cue
    is tested against the words the drafter actually opened with.
    """
    if block.get("kind") in MARGINAL_KINDS:
        return "unplaced"
    candidate = cue_zone(text, is_heading_like(block, text))
    if candidate is None and numbered and not holds_zone(current, text):
        candidate = "body"                          # default once numbers begin
    if candidate is None:
        return current
    if current is None:
        return candidate
    forward = ZONE_ORDER[candidate] >= ZONE_ORDER[current]
    tail = current in ("signature", "annex") and candidate in ("signature", "annex")
    return candidate if (forward or tail) else current


# ── Language (§3.3) ──────────────────────────────────────────────────────────

def language_of(text):
    ratio = nlp.count_thai(text)
    if ratio >= 60:
        return "th"
    if ratio <= 10:
        return "en"
    return "mixed"


# ── Clause assembly ──────────────────────────────────────────────────────────

def _flagged(block):
    """A QC flag on the source block — Azure's own low-confidence marker."""
    return bool(block.get("flag"))


def _new_clause(block, zone, heading, number, label, path, text):
    return {"n": number, "nd": label, "p": path, "z": zone, "l": None,
            "h": heading, "t": text, "g": block.get("page"),
            "q": 1 if _flagged(block) else None,
            "srcKind": block.get("kind"), "blocks": [block.get("i")]}


def segment(blocks):
    """-> (clauses, report). Clauses are in document order, one document's worth.

    Assembly (§3.3): a numbered heading opens a clause and its text becomes `h`;
    deeper numbered paragraphs are their own clause records; unnumbered
    paragraphs attach to the open clause; table rows, headers and footers are
    always clauses of their own.
    """
    clauses = []
    zone = None                                     # None until a rule fires
    seen_zone = None                                # the zone of the block before
    open_clause = None
    heading = None                                  # current heading text
    heading_block = None                            # emitted if nothing used it
    empty_blocks = 0

    def close():
        nonlocal open_clause
        if open_clause is not None:
            clauses.append(open_clause)
            open_clause = None

    def flush_heading():
        """An unnumbered heading nothing attached to still gets a clause of its
        own — the text is never lost (§1.4)."""
        nonlocal heading, heading_block
        if heading_block is not None:
            clauses.append(_new_clause(heading_block, heading_block["_zone"],
                                       heading, None, None, [], heading))
            heading_block = None

    for block in blocks:
        if not (block.get("text") or "").strip():
            empty_blocks += 1
            continue

        kind = block.get("kind")
        if kind in MARGINAL_KINDS:
            # A repeating page header never moves the running zone on.
            close()
            clause = _new_clause(block, "unplaced", None, None, None, [],
                                 block.get("text") or "")
            clause["marginal"] = True
            clauses.append(clause)
            continue

        number, label, path, text = number_from_block(block)
        zone = next_zone(zone, block, bool(number), text)
        here = zone or "unplaced"

        if here != seen_zone:
            # A heading governs its own section only. Letting it run on would
            # put "กฎหมายที่ใช้บังคับ" on the signature block and hand the
            # clause-kind classifier a heading hit worth 3 for the wrong clause.
            close()
            flush_heading()
            heading = None
            seen_zone = here

        if kind == "heading":
            close()
            flush_heading()
            heading = text.strip()
            if number:
                clause = _new_clause(block, here, heading, number, label, path, "")
                open_clause = clause
                heading_block = None
            else:
                heading_block = dict(block)
                heading_block["_zone"] = here
            continue

        if kind == "row":
            close()
            heading_block = None                    # the heading owns this row
            clauses.append(_new_clause(block, here, heading, number, label, path, text))
            continue

        # a paragraph
        if number:
            close()
            heading_block = None
            open_clause = _new_clause(block, here, heading, number, label, path, text)
            continue

        if (open_clause is not None and open_clause["z"] == here
                and len(open_clause["t"]) < MAX_CLAUSE_CHARS):
            open_clause["t"] = (open_clause["t"] + "\n" + text).strip("\n")
            open_clause["blocks"].append(block.get("i"))
            if _flagged(block):
                open_clause["q"] = 1
            continue

        close()
        heading_block = None
        open_clause = _new_clause(block, here, heading, number, label, path, text)

    close()
    flush_heading()

    # Front matter ahead of the first cue is the preamble — but only if the
    # document parsed as a contract at all. If no zone ever opened, the leading
    # run stays `unplaced` and flagged, which is the honest answer.
    if any(clause["z"] != "unplaced" for clause in clauses):
        for clause in clauses:
            if clause.get("marginal"):
                continue
            if clause["z"] != "unplaced":
                break
            clause["z"] = "preamble"

    for clause in clauses:
        clause["l"] = language_of(clause["t"] or clause["h"] or "")
        if clause["z"] == "unplaced" and not clause.get("marginal"):
            clause["q"] = 1                         # §1.4: kept, flagged, never dropped

    report = {"emptyBlocks": empty_blocks}
    return clauses, report
