#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstruct Word auto-numbering into literal clause numbers.

WHY THIS EXISTS
---------------
In real Thai contracts drafted in Word, clause numbers are almost never typed
into the text. They are auto-numbering: the paragraph carries `w:numPr`
(a numId + an indent level) and the visible number is computed by Word from
`numbering.xml`. `python-docx`'s `Paragraph.text` therefore returns the clause
body with NO number in it at all.

Measured on three execution-version Thai contracts supplied by the user:

    paragraphs with w:numPr, number absent from .text : 12 / 166 / 88
    paragraphs whose literal text matched a clause regex :  0 /   0 /  0

A text regex finds nothing. This module is the DOCX path's clause numbering.

THE ASYMMETRY THAT MATTERS
--------------------------
This applies to `.docx` only. For a scanned PDF, the number was *rendered* onto
the page, so Azure Document Intelligence returns it as ordinary literal text and
the regex in DESIGN.md §3.3 is the correct tool there. The two ingest paths need
different clause-number strategies. Do not unify them.

Observed in the supplied contracts, so all of it is exercised:
  - three nesting levels: `1.` → `1.1.` → `1.2.1.`
  - Thai-letter recitals (`ก.` `ข.` `ค.` `ง.`) via numFmt `thaiLetters`
  - numbering that restarts mid-document (parties 1-3, recitals ก-ง, then
    operative clauses back to 1.) through separate numIds and startOverride
"""

import re

from docx.document import Document as _Doc  # noqa: F401  (typing only)

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def q(tag):
    return NS + tag


THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙"
THAI_LETTER_ORDER = "กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"


def format_number(n, numfmt):
    """Render ordinal `n` in the level's numFmt."""
    if numfmt == "decimalZero":
        return "%02d" % n
    if numfmt == "decimal":
        return str(n)
    if numfmt == "thaiNumbers":
        return "".join(THAI_DIGITS[int(d)] for d in str(n))
    if numfmt == "thaiLetters":
        return THAI_LETTER_ORDER[(n - 1) % len(THAI_LETTER_ORDER)]
    if numfmt == "lowerLetter":
        return chr(96 + n) if 1 <= n <= 26 else str(n)
    if numfmt == "upperLetter":
        return chr(64 + n) if 1 <= n <= 26 else str(n)
    if numfmt == "lowerRoman":
        return _roman(n).lower()
    if numfmt == "upperRoman":
        return _roman(n)
    if numfmt in ("bullet", "none"):
        return ""
    return str(n)


def _roman(n):
    vals = ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"),
            (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"),
            (5, "V"), (4, "IV"), (1, "I"))
    out = []
    for v, s in vals:
        while n >= v:
            out.append(s)
            n -= v
    return "".join(out)


def load_numbering(doc):
    """-> (abstracts, nums). Returns ({}, {}) when the doc has no numbering part."""
    try:
        part = doc.part.numbering_part.element
    except (AttributeError, KeyError, NotImplementedError):
        return {}, {}

    abstracts = {}
    for a in part.findall(q("abstractNum")):
        levels = {}
        for lvl in a.findall(q("lvl")):
            def val(tag):
                el = lvl.find(q(tag))
                return el.get(q("val")) if el is not None else None
            levels[int(lvl.get(q("ilvl")))] = {
                "start": int(val("start") or 1),
                "fmt": val("numFmt") or "decimal",
                "text": val("lvlText") or "%1",
            }
        abstracts[a.get(q("abstractNumId"))] = levels

    nums = {}
    for num in part.findall(q("num")):
        ref = num.find(q("abstractNumId"))
        if ref is None:
            continue
        overrides = {}
        for ov in num.findall(q("lvlOverride")):
            start = ov.find(q("startOverride"))
            if start is not None:
                overrides[int(ov.get(q("ilvl")))] = int(start.get(q("val")))
        nums[num.get(q("numId"))] = (ref.get(q("val")), overrides)

    return abstracts, nums


def paragraph_numbering(p):
    """-> (numId, ilvl) for a CT_P element, or None if it is not auto-numbered."""
    npr = p.find("%s/%s" % (q("pPr"), q("numPr")))
    if npr is None:
        return None
    nid = npr.find(q("numId"))
    if nid is None:
        return None
    ilvl = npr.find(q("ilvl"))
    return nid.get(q("val")), (int(ilvl.get(q("val"))) if ilvl is not None else 0)


# ── Label parsing ────────────────────────────────────────────────────
# Real drafters rarely use a clean multilevel list. Measured in one supplied
# contract: 37 separate abstract numbering definitions, many with the parent
# number typed as a literal into lvlText —
#     'ข้อ %1.'   '5.%1.'   '3.%2.'   '(4.%1)'   'ลำดับที่ %1:'
# For lvlText '5.%1.' at ilvl0 the counter depth is 1 but the reader sees
# "5.1.", whose logical path is [5, 1]. So the ordinal path is derived by
# PARSING THE RENDERED LABEL, which is what a reader actually sees, and the
# counters are only the fallback.

_ROMAN_VALUES = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100, "d": 500, "m": 1000}
# Literal words drafters put inside lvlText; stripped before parsing components.
LABEL_NOISE = ("ข้อ", "ลำดับที่", "หมวด", "ส่วนที่", "Article", "Section", "Clause")
_COMPONENT = re.compile(
    r"[0-9]+"                    # 5
    r"|[\u0e50-\u0e59]+"         # ๕
    r"|[\u0e01-\u0e2e]"          # ก  (single Thai consonant used as a letter ordinal)
    r"|[A-Za-z]+"                # a, iv, IV
)


def _roman_to_int(text):
    total, prev = 0, 0
    for ch in reversed(text.lower()):
        v = _ROMAN_VALUES.get(ch)
        if v is None:
            return None
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total or None


def component_ordinal(tok):
    """One label component -> its ordinal, or None if it is not one."""
    if tok.isdigit():
        return int(tok)
    if all("\u0e50" <= c <= "\u0e59" for c in tok):
        return int("".join(str(THAI_DIGITS.index(c)) for c in tok))
    if len(tok) == 1 and tok in THAI_LETTER_ORDER:
        return THAI_LETTER_ORDER.index(tok) + 1
    if tok.isalpha() and tok.isascii():
        if len(tok) == 1:
            return ord(tok.lower()) - 96
        return _roman_to_int(tok)
    return None


def parse_label(label):
    """Rendered label -> (normalized number, ordinal path).

        "ข้อ 1."   -> ("1",     [1])
        "5.1."     -> ("5.1",   [5, 1])
        "(4.2)"    -> ("4.2",   [4, 2])
        "1.2.1."   -> ("1.2.1", [1, 2, 1])
        "(ก)"      -> ("ก",     [1])
        "๕.๒"      -> ("5.2",   [5, 2])
        "ลำดับที่ 3:" -> ("3",   [3])
    """
    if not label:
        return None, []
    cleaned = label
    for word in LABEL_NOISE:
        cleaned = cleaned.replace(word, " ")
    parts, path = [], []
    for m in _COMPONENT.finditer(cleaned):
        tok = m.group(0)
        ordinal = component_ordinal(tok)
        if ordinal is None:
            continue
        path.append(ordinal)
        # Thai letters keep their letter in `n`; everything else normalises to Arabic
        parts.append(tok if (len(tok) == 1 and tok in THAI_LETTER_ORDER) else str(ordinal))
    if not path:
        return None, []
    return ".".join(parts), path


class NumberingWalker:
    """Stateful counter. Feed it paragraphs in document order, once each.

        walker = NumberingWalker(doc)
        for p in body_paragraphs_in_order:
            label, path = walker.label_for(p)     # ("1.2.1.", [1, 2, 1]) or (None, None)

    `label` is what Word displays. `path` is the ordinal at each level, which is
    what sorts correctly — Thai letters included (ก -> 1, ข -> 2).
    """

    def __init__(self, doc):
        self.abstracts, self.nums = load_numbering(doc)
        self.counters = {}

    def label_for(self, p):
        ref = paragraph_numbering(p)
        if ref is None:
            return None, None
        numid, ilvl = ref
        if numid not in self.nums:
            return None, None
        aid, overrides = self.nums[numid]
        levels = self.abstracts.get(aid, {})
        if ilvl not in levels:
            return None, None

        key = (aid, ilvl)
        if key in self.counters:
            self.counters[key] += 1
        else:
            self.counters[key] = overrides.get(ilvl, levels[ilvl]["start"])

        # a new item at this level restarts every deeper level
        for deeper in [k for k in self.counters if k[0] == aid and k[1] > ilvl]:
            del self.counters[deeper]

        label = levels[ilvl]["text"]
        path = []
        for i in range(ilvl + 1):
            ordinal = self.counters.get((aid, i))
            if ordinal is None:
                continue
            path.append(ordinal)
            fmt = levels.get(i, levels[ilvl])["fmt"]
            label = label.replace("%%%d" % (i + 1), format_number(ordinal, fmt))
        label = label.strip()
        # Prefer the path a reader would infer from the rendered label; fall back
        # to the counter path only when the label yields nothing parseable.
        _, parsed = parse_label(label)
        return label, (parsed or path)


if __name__ == "__main__":
    import sys, glob
    from docx import Document
    if len(sys.argv) != 2:
        print("usage: docx_numbering.py '<glob of .docx>'")
        sys.exit(2)
    for path in sorted(glob.glob(sys.argv[1])):
        doc = Document(path)
        walker = NumberingWalker(doc)
        rows = []
        for p in doc.element.body.iter(q("p")):
            label, ppath = walker.label_for(p)
            if label:
                body = "".join(t.text or "" for t in p.iter(q("t"))).strip()
                rows.append((label, ppath, body))
        print("\n=== %s — %d numbered paragraphs" % (path.split("/")[-1][:52], len(rows)))
        for label, ppath, _ in rows[:6]:
            print("   %-10s path=%s" % (label, ppath))
