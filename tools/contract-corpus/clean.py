#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Thai normalization, ZWSP harvest, line-join (DESIGN.md §3.2).

The order of the six steps is part of the spec; each assumes the previous one
ran. Both the pre-clean and the post-clean string stay in the stage file, so a
segmentation bug can be diagnosed against what the ingester actually saw.
"""
import re

import nlp

ZWSP = "​"
THAI = re.compile(r"[฀-๿]")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
SPACES = re.compile(r"[ \t  -   　]+")

# The Azure/PDF clause-number pattern (§3.3). Used here only as a line-join
# guard: a line that opens a new numbered clause must never be glued to the one
# above it.
CLAUSE = re.compile(r"^\s*(?:ข้อ\s*)?([๐-๙0-9]+(?:[.ฯ][๐-๙0-9]+)*)\s*[.)]?\s+(?=\S)")


# ── Steps ────────────────────────────────────────────────────────────────────

def strip_controls(text):
    """1. \\xa0 → space; control characters out, except the newline."""
    text = text.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    return CONTROL.sub("", text)


def harvest_zwsp(text):
    """2. -> (text without ZWSP, offsets into the stripped text, candidates).

    Where a Thai lawyer's Word file carries zero-width spaces they sit at
    intended word boundaries and are free human-labelled segmentation points.
    Measured reality: the supplied contracts contain none, so this is
    opportunistic — a bonus when present, never a pillar (§3.2).
    """
    if ZWSP not in text:
        return text, [], []
    out, offsets = [], []
    for ch in text:
        if ch == ZWSP:
            offsets.append(len("".join(out)))
        else:
            out.append(ch)
    stripped = "".join(out)
    pieces, previous = [], 0
    for offset in offsets + [len(stripped)]:
        piece = stripped[previous:offset].strip()
        if piece and THAI.search(piece) and " " not in piece and len(piece) > 1:
            pieces.append(piece)
        previous = offset
    return stripped, offsets, pieces


def normalize(text):
    """3. pythainlp.util.normalize(), line by line (see nlp.normalize)."""
    return nlp.normalize(text)


def line_join(text):
    """4. Join a line to the next when Thai runs across the break.

    Nothing is inserted: in Thai the join is seamless. A blank line, or a next
    line that opens a numbered clause, blocks the join.
    """
    lines = text.split("\n")
    out = []
    for line in lines:
        if (out and out[-1] and line
                and THAI.search(out[-1][-1])
                and THAI.search(line[0])
                and not CLAUSE.match(line)):
            out[-1] = out[-1] + line
        else:
            out.append(line)
    return "\n".join(out)


def collapse_spaces(text):
    """5. Runs of spaces → one. Spaces are never stripped: in Thai the space is
    a phrase and clause boundary and carries real information."""
    text = SPACES.sub(" ", text)
    return "\n".join(line.strip() for line in text.split("\n")).strip()


def clean_text(text):
    """The six steps in order. -> (cleaned, zwsp offsets, dictionary candidates)."""
    text = strip_controls(text)
    text, offsets, candidates = harvest_zwsp(text)
    text = normalize(text)
    text = line_join(text)
    text = collapse_spaces(text)
    # 6. Thai numerals ๐–๙ are left exactly as written; they are normalized only
    #    into metadata (clause numbers, dates) by segment.py.
    return text, offsets, candidates


# ── Stage ────────────────────────────────────────────────────────────────────

def clean_blocks(blocks):
    """-> (blocks with `raw` and cleaned `text`, ZWSP dictionary candidates).

    A block whose text cleans away to nothing keeps its place in the list with
    an empty `text` and `empty: True`; segment.py reports the count rather than
    quietly losing the block.
    """
    out, candidates = [], []
    for block in blocks:
        cleaned, offsets, pieces = clean_text(block.get("text") or "")
        new = dict(block)
        new["raw"] = block.get("text") or ""
        new["text"] = cleaned
        if offsets:
            new["zwsp"] = offsets
        if not cleaned:
            new["empty"] = True
        candidates.extend(pieces)
        out.append(new)
    return out, candidates
