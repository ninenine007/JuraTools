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

# ── Clause numbers ───────────────────────────────────────────────────────────

CLAUSE = re.compile(r"^\s*(?:ข้อ\s*)?([๐-๙0-9]+(?:[.ฯ][๐-๙0-9]+)*)\s*[.)]?\s+(?=\S)")

THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙"
THAI_LETTER_ORDER = "กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
DECORATION = re.compile(r"^[\s(\[<“\"']+|[\s)\]>”\"'.]+$")


def arabic(text):
    """Thai numerals → Arabic, for metadata only. `t` keeps ๐–๙ as written."""
    return "".join(str(THAI_DIGITS.index(ch)) if ch in THAI_DIGITS else ch for ch in text)


def normalized_number(label):
    """Word's label → `n`: dot-joined, Arabic digits, Thai letters kept as
    letters ("1.2.1." → "1.2.1", "(ก)" → "ก", "๕.๒" → "5.2")."""
    if not label:
        return None
    parts = [DECORATION.sub("", part) for part in re.split(r"[.ฯ]", label)]
    parts = [arabic(part) for part in parts if part]
    return ".".join(parts) or None


def ordinal_path(number):
    """`n` → `p`, the ordinal at each level. Thai letters become their position
    in the alphabet, which is what sorts correctly (§4.3)."""
    path = []
    for part in (number or "").split("."):
        if not part:
            continue
        if part.isdigit():
            path.append(int(part))
        elif part[0] in THAI_LETTER_ORDER:
            path.append(THAI_LETTER_ORDER.index(part[0]) + 1)
        elif part[0].isalpha() and part[0].lower() in "abcdefghijklmnopqrstuvwxyz":
            path.append(ord(part[0].lower()) - 96)
        else:
            return []
    return path


def number_from_block(block):
    """-> (n, nd, p, text) — the block's clause number and its remaining text.

    The walker's label wins; the regex is the fallback, and only then is a
    literal prefix stripped out of the text.
    """
    text = block.get("text") or ""
    num = block.get("num")
    if num and num.get("nd"):
        label = num["nd"]
        number = normalized_number(label)
        path = num.get("p") or ordinal_path(number)
        return number, label, list(path), text
    match = CLAUSE.match(text)
    if match and block.get("kind") in ("para", "heading"):
        label = match.group(1)
        number = normalized_number(label)
        return number, label, ordinal_path(number), text[match.end():]
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
MARGINAL_KINDS = ("header", "footer", "footnote")

# `ลงชื่อ` also occurs inside operative prose ("ให้ลงชื่อในเอกสาร"). A signature
# block is short, so only a short block is allowed to open the signature zone.
SIGNATURE_MAX_CHARS = 200

# Safety valve: an open clause stops swallowing continuation paragraphs at this
# length, so one runaway document cannot become one unreadable clause.
MAX_CLAUSE_CHARS = 4000


def cue_zone(text):
    """First cue in stage order, or None."""
    for zone, cues in ZONE_CUES:
        for cue in cues:
            if cue in text:
                if zone == "signature" and len(text) > SIGNATURE_MAX_CHARS:
                    continue
                return zone
    return None


def next_zone(current, block, numbered):
    """-> the zone this block belongs to. Zones only move forward, except
    between signature and annex, which real contracts interleave."""
    if block.get("kind") in MARGINAL_KINDS:
        return "unplaced"
    candidate = cue_zone(block.get("text") or "")
    if candidate is None and numbered:
        candidate = "body"                          # body: default once numbers begin
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
        zone = next_zone(zone, block, bool(number))
        here = zone or "unplaced"

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
