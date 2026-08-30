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
        return label.strip(), path


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
