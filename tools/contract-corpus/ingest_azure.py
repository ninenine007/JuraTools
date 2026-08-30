#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Saved Azure Document Intelligence JSON → blocks (DESIGN.md §3.1).

READS A FILE. NEVER CALLS AZURE. The user runs `prebuilt-layout` themselves and
saves the response; this module opens that file and nothing else. There is no
HTTP client, no key, no endpoint anywhere in this pipeline (DESIGN.md §1.1).

Azure already labels `paragraphs[].role` — title, sectionHeading, pageHeader,
pageFooter, footnote — and those labels are reliable, so they are mapped
straight through and never re-derived heuristically.

    python3 ingest_azure.py contract.json | head
"""
import bisect
import json
import os
import sys

# ── Azure roles → our block kinds (§3.1) ─────────────────────────────────────

ROLE_KIND = {
    "title": "heading",
    "sectionHeading": "heading",
    "pageHeader": "header",
    "pageFooter": "footer",
    "footnote": "footnote",
    "pageNumber": "footer",
}

LOW_CONF = 0.90        # a block below this is flagged for QC (§3.5)


def analyze_result(data):
    """Accept the full operation response or a bare analyzeResult."""
    if isinstance(data, dict) and "analyzeResult" in data:
        return data["analyzeResult"] or {}
    return data or {}


# ── Spans ────────────────────────────────────────────────────────────────────

def _spans(obj):
    spans = obj.get("spans") or []
    if not spans and obj.get("span"):
        spans = [obj["span"]]
    return [s for s in spans if isinstance(s, dict) and "offset" in s]


def _offset(obj):
    """Lowest span offset — the sort key that keeps document order (§3.1)."""
    spans = _spans(obj)
    return min(s["offset"] for s in spans) if spans else None


def _page_of(obj, page_index):
    """Page from boundingRegions, else by mapping the span offset onto pages."""
    regions = obj.get("boundingRegions") or []
    for region in regions:
        if region.get("pageNumber"):
            return int(region["pageNumber"])
    offset = _offset(obj)
    if offset is not None:
        for start, end, number in page_index:
            if start <= offset < end:
                return number
    return None


def _page_index(result):
    """[(start, end, pageNumber)] so a span offset can name its page."""
    index = []
    for page in result.get("pages") or []:
        number = page.get("pageNumber")
        for span in _spans(page):
            index.append((span["offset"], span["offset"] + span.get("length", 0), number))
    index.sort()
    return index


# ── Confidence ───────────────────────────────────────────────────────────────

def _word_confidences(result):
    """[(offset, end, confidence)] for every recognized word, sorted."""
    words = []
    for page in result.get("pages") or []:
        for word in page.get("words") or []:
            span = (word.get("span") or (_spans(word) or [None])[0])
            if not span or word.get("confidence") is None:
                continue
            start = span["offset"]
            words.append((start, start + span.get("length", 0), float(word["confidence"])))
    words.sort()
    return words


def _confidence(obj, words, starts=None):
    """Mean confidence of the words inside this block's spans.

    Azure reports confidence per word, not per paragraph, so the block's figure
    is the mean of its own words — carried through rather than invented.
    """
    spans = _spans(obj)
    if not spans or not words:
        return None
    if starts is None:
        starts = [w[0] for w in words]
    hits = []
    for span in spans:
        start, end = span["offset"], span["offset"] + span.get("length", 0)
        at = max(0, bisect.bisect_left(starts, start) - 1)
        for w_start, w_end, conf in words[at:]:
            if w_start >= end:
                break
            if w_end > start:
                hits.append(conf)
    if not hits:
        return None
    return round(sum(hits) / len(hits), 4)


# ── Tables ───────────────────────────────────────────────────────────────────

def _table_ranges(result):
    """[(start, end)] covering every table, so cell paragraphs are not emitted
    twice — Azure lists a cell's paragraphs in `paragraphs[]` as well."""
    ranges = []
    for table in result.get("tables") or []:
        for span in _spans(table):
            ranges.append((span["offset"], span["offset"] + span.get("length", 0)))
    ranges.sort()
    return ranges


def _inside(offset, ranges):
    if offset is None:
        return False
    return any(start <= offset < end for start, end in ranges)


def _table_rows(table):
    """One row per `cells[].rowIndex`, in reading order, cells joined by ' | '."""
    rows = {}
    for cell in table.get("cells") or []:
        row = rows.setdefault(int(cell.get("rowIndex", 0)), [])
        row.append((int(cell.get("columnIndex", 0)), cell))
    out = []
    for row_index in sorted(rows):
        cells = [cell for _column, cell in sorted(rows[row_index], key=lambda item: item[0])]
        text = " | ".join((cell.get("content") or "").replace("\n", " ").strip()
                          for cell in cells)
        out.append((row_index, text, cells))
    return out


# ── Ingest ───────────────────────────────────────────────────────────────────

def blocks_from_result(result):
    """Paragraphs and table rows interleaved by span offset — contracts carry
    substance in tables and losing their position loses the sense of them."""
    pages = _page_index(result)
    words = _word_confidences(result)
    starts = [w[0] for w in words]
    tables = _table_ranges(result)
    items = []                                      # (offset, sequence, block)

    for seq, para in enumerate(result.get("paragraphs") or []):
        offset = _offset(para)
        if _inside(offset, tables):                 # already covered by a row block
            continue
        role = para.get("role")
        block = {
            "kind": ROLE_KIND.get(role, "para"),
            "text": para.get("content") or "",
            "page": _page_of(para, pages),
            "conf": _confidence(para, words, starts),
        }
        if role:
            block["role"] = role
        items.append((offset if offset is not None else 0, seq, block))

    base = len(result.get("paragraphs") or [])
    for table_no, table in enumerate(result.get("tables") or []):
        table_offset = _offset(table)
        for row_index, text, cells in _table_rows(table):
            offset = min([o for o in (_offset(c) for c in cells) if o is not None] or
                         [table_offset if table_offset is not None else 0])
            block = {
                "kind": "row",
                "text": text,
                "page": _page_of(cells[0] if cells else table, pages),
                "conf": _confidence({"spans": [s for c in cells for s in _spans(c)]},
                                    words, starts),
            }
            items.append((offset, base + table_no * 1000 + row_index, block))

    items.sort(key=lambda item: (item[0], item[1]))
    blocks = []
    for i, (_offset_key, _seq, block) in enumerate(items):
        block["i"] = i
        if block["conf"] is not None and block["conf"] < LOW_CONF:
            block["flag"] = "lowConf"
        blocks.append(block)
    return blocks


def ingest(path, doc_id=None, source_file=None):
    """-> {"id", "src": {...}, "blocks": [...]}"""
    with open(path, "rb") as handle:
        data = json.loads(handle.read().decode("utf-8"))
    result = analyze_result(data)
    blocks = blocks_from_result(result)
    pages = len(result.get("pages") or []) or max(
        [b["page"] for b in blocks if b.get("page")] or [1])
    model = result.get("modelId") or "prebuilt-layout"
    return {
        "id": doc_id or os.path.splitext(os.path.basename(path))[0],
        "src": {"file": source_file or path,
                "method": "azure-di:%s" % model,
                "pages": pages},
        "blocks": blocks,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    print(json.dumps(ingest(sys.argv[1]), ensure_ascii=False, indent=1))
