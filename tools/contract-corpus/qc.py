#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Quality report — one row per document, plus a printed summary (§3.5).

QC never rejects a document. It reports, and the browser tool surfaces the flags
so that a hit from a shaky page is visibly a hit from a shaky page.
"""
import csv

import annotate
import nlp

LOW_CONF = 0.90


# ── Block-level statistics, kept at segment time ─────────────────────────────

def block_stats(blocks):
    """Summarize cleaned blocks before they are folded into clauses.

    `meanConf` and `lowConfBlocks` come from Azure's own per-word confidence,
    which is the primary quality signal now that OCR is trustworthy; a .docx
    reports 1.0 because its text was never guessed at.
    """
    confs = [b["conf"] for b in blocks if b.get("conf") is not None]
    marginal = sum(1 for b in blocks if b.get("kind") in ("header", "footer", "footnote"))
    return {
        "blocks": len(blocks),
        "marginalBlocks": marginal,
        "emptyBlocks": sum(1 for b in blocks if b.get("empty")),
        "meanConf": round(sum(confs) / len(confs), 4) if confs else None,
        "lowConfBlocks": sum(1 for c in confs if c < LOW_CONF),
    }


# ── Per-document QC (§3.5) ───────────────────────────────────────────────────

def doc_qc(doc, dictionary=None):
    """-> the `qc` object of §4.2.

    `unplacedBlocks` counts clauses the segmenter genuinely could not place —
    its own error rate. Page headers and footers also sit in `zone:"unplaced"`
    (no contract zone fits a running header) but they are counted separately as
    `marginalBlocks`, because a repeating header is not a segmentation failure.
    """
    clauses = doc.get("clauses") or []
    stats = doc.get("blockStats") or {}
    text = "\n".join(c.get("t") or "" for c in clauses if not c.get("marginal"))

    thai_tokens, oov = 0, 0
    if dictionary is None:
        dictionary = set(nlp.thai_words()) | annotate.load_legal_terms()
    for clause in clauses:
        for token in clause.get("tokens") or []:
            if nlp.is_thai_token(token):
                thai_tokens += 1
                if token not in dictionary:
                    oov += 1

    return {
        "thaiRatio": round(nlp.count_thai(text) / 100.0, 4),
        "oovRate": round(oov / thai_tokens, 4) if thai_tokens else 0.0,
        "meanConf": stats.get("meanConf"),
        "lowConfBlocks": stats.get("lowConfBlocks", 0),
        "unplacedBlocks": sum(1 for c in clauses
                              if c.get("z") == "unplaced" and not c.get("marginal")),
    }


def manifest_row(doc, corpus_doc=None):
    """One `manifest.csv` row. `corpus_doc` supplies the metadata guesses."""
    clauses = doc.get("clauses") or []
    stats = doc.get("blockStats") or {}
    quality = (corpus_doc or {}).get("qc") or doc.get("qc") or doc_qc(doc)
    langs = {}
    for clause in clauses:
        langs[clause.get("l")] = langs.get(clause.get("l"), 0) + 1
    dominant = max(langs.items(), key=lambda item: item[1])[0] if langs else None
    return {
        "id": doc["id"],
        "file": doc.get("src", {}).get("file"),
        "method": doc.get("src", {}).get("method"),
        "pages": doc.get("src", {}).get("pages"),
        "blocks": stats.get("blocks"),
        "emptyBlocks": stats.get("emptyBlocks"),
        "marginalBlocks": stats.get("marginalBlocks"),
        "clauses": len(clauses),
        "tokens": sum(c.get("ntok", 0) for c in clauses),
        "lang": (corpus_doc or {}).get("lang") or dominant,
        "dominantClauseLang": dominant,
        "thaiRatio": quality.get("thaiRatio"),
        "oovRate": quality.get("oovRate"),
        "meanConf": quality.get("meanConf"),
        "lowConfBlocks": quality.get("lowConfBlocks"),
        "unplacedBlocks": quality.get("unplacedBlocks"),
        "dupClauses": sum(1 for c in clauses if (c.get("u") or 1) > 1),
    }


FIELDS = ["id", "file", "method", "pages", "blocks", "emptyBlocks", "marginalBlocks",
          "clauses", "tokens", "lang", "dominantClauseLang", "thaiRatio", "oovRate",
          "meanConf", "lowConfBlocks", "unplacedBlocks", "dupClauses"]


def write_manifest(rows, path):
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k) for k in FIELDS})
    return path


# ── Printed summary ──────────────────────────────────────────────────────────

def summary(rows, out=print):
    """Sorted by oovRate descending — read the top few (§3.5)."""
    if not rows:
        out("QC: no documents.")
        return
    docs = len(rows)
    clauses = sum(r["clauses"] or 0 for r in rows)
    tokens = sum(r["tokens"] or 0 for r in rows)
    unplaced = sum(r["unplacedBlocks"] or 0 for r in rows)
    low_conf = sum(r["lowConfBlocks"] or 0 for r in rows)
    empty = sum(r["emptyBlocks"] or 0 for r in rows)
    out("QC — %d documents, %d clauses, %d tokens" % (docs, clauses, tokens))
    out("     %d unplaced clauses, %d low-confidence blocks, %d blocks empty after cleaning"
        % (unplaced, low_conf, empty))
    out("     documents by OOV rate (highest first — read the top few):")
    for row in sorted(rows, key=lambda r: -(r["oovRate"] or 0))[:8]:
        out("       %-28s oov %-7s thai %-6s conf %-7s unplaced %-4s %s"
            % (str(row["id"])[:28], row["oovRate"], row["thaiRatio"],
               row["meanConf"] if row["meanConf"] is not None else "-",
               row["unplacedBlocks"], row["lang"]))
