#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Contract corpus pipeline — CLI stage runner (DESIGN.md §2, §3).

    python3 build.py --stage all --in data/raw --out data/corpus.jtcorpus.gz
    python3 build.py --stage segment                # re-run one stage only

Every stage reads the previous stage's directory and writes its own, so a bug
found in segmentation is fixed by re-running stage 3 — never by re-OCRing
(DESIGN.md §1.3). `--stage all` is just the six stages in order, through the
same files, so `all` and a stage-by-stage run produce the same result.

Runs entirely on the local machine. Nothing is uploaded, and no stage makes a
network request: Azure Document Intelligence is run by the user, outside this
pipeline, and stage 1 reads its saved JSON off disk (DESIGN.md §1.1).
"""
import argparse
import json
import os
import sys

STAGES = ("ingest", "clean", "segment", "annotate", "build", "qc")
DEFAULT_IN = os.path.join("data", "raw")
DEFAULT_OUT = os.path.join("data", "corpus.jtcorpus.gz")
HERE = os.path.dirname(os.path.abspath(__file__))


# ── Stage files (one JSONL per document) ─────────────────────────────────────

def stage_dir(work, name):
    path = os.path.join(work, name)
    if not os.path.isdir(path):
        os.makedirs(path)
    return path


def write_stage(path, doc, key):
    """Line 1 is the document header; every following line is one record."""
    header = {k: v for k, v in doc.items() if k != key}
    header["rec"] = "doc"
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(header, ensure_ascii=False) + "\n")
        for record in doc.get(key) or []:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_stage(path, key):
    doc, records = {}, []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            if record.get("rec") == "doc":
                doc = {k: v for k, v in record.items() if k != "rec"}
            else:
                records.append(record)
    doc[key] = records
    return doc


def stage_files(work, name):
    directory = os.path.join(work, name)
    if not os.path.isdir(directory):
        return []
    return [os.path.join(directory, f)
            for f in sorted(os.listdir(directory)) if f.endswith(".jsonl")]


# ── Stage 1 — ingest ─────────────────────────────────────────────────────────

def _unique(doc_id, taken, say):
    if doc_id not in taken:
        taken.add(doc_id)
        return doc_id
    n = 2
    while "%s-%d" % (doc_id, n) in taken:
        n += 1
    new = "%s-%d" % (doc_id, n)
    say("  ! duplicate document id %s — using %s" % (doc_id, new))
    taken.add(new)
    return new


def stage_ingest(cfg, say):
    import ingest_azure
    import ingest_docx

    out = stage_dir(cfg["work"], "extracted")
    taken, done, failed = set(), 0, 0

    sources = []
    if os.path.isdir(cfg["in"]):
        for name in sorted(os.listdir(cfg["in"])):
            if name.lower().endswith(".docx") and not name.startswith("~$"):
                sources.append(("docx", os.path.join(cfg["in"], name)))
    if os.path.isdir(cfg["azure"]):
        for name in sorted(os.listdir(cfg["azure"])):
            if name.lower().endswith(".json"):
                sources.append(("azure", os.path.join(cfg["azure"], name)))
    if not sources:
        say("  no .docx in %s and no Azure JSON in %s" % (cfg["in"], cfg["azure"]))

    for kind, path in sources:
        stem = os.path.splitext(os.path.basename(path))[0]
        try:
            if kind == "docx":
                doc = ingest_docx.ingest(path, _unique(stem, taken, say))
            else:
                doc = ingest_azure.ingest(path, _unique(stem, taken, say),
                                          source_file=_source_pdf(cfg["in"], stem, path))
        except Exception as exc:                    # noqa: BLE001 - one bad file, not the run
            failed += 1
            say("  ! SKIPPED %s — %s: %s" % (path, type(exc).__name__, exc))
            continue
        write_stage(os.path.join(out, doc["id"] + ".jsonl"), doc, "blocks")
        done += 1
        say("  %-40s %5d blocks  %s" % (doc["id"][:40], len(doc["blocks"]),
                                        doc["src"]["method"]))
    say("ingest: %d documents, %d skipped" % (done, failed))
    return failed


def _source_pdf(raw_dir, stem, fallback):
    """The Azure JSON names the PDF it came from: same stem, in raw/."""
    for ext in (".pdf", ".PDF", ".tif", ".tiff", ".png", ".jpg"):
        candidate = os.path.join(raw_dir, stem + ext)
        if os.path.exists(candidate):
            return candidate
    return fallback


# ── Stage 2 — clean ──────────────────────────────────────────────────────────

def stage_clean(cfg, say):
    import clean

    out = stage_dir(cfg["work"], "clean")
    candidates, done = {}, 0
    for path in stage_files(cfg["work"], "extracted"):
        doc = read_stage(path, "blocks")
        doc["blocks"], harvested = clean.clean_blocks(doc["blocks"])
        for word in harvested:
            candidates[word] = candidates.get(word, 0) + 1
        write_stage(os.path.join(out, doc["id"] + ".jsonl"), doc, "blocks")
        done += 1
    if candidates:
        _write_candidates(cfg["work"], candidates, say)
    say("clean: %d documents, %d zero-width-space word candidates" % (done, len(candidates)))
    return 0


def _write_candidates(work, candidates, say):
    """ZWSP-derived dictionary candidates are written out for the user to read
    and paste into lexicon/legal-terms.txt. The pipeline never edits a lexicon
    by itself, and the real contracts carry no ZWSP at all (§3.2)."""
    path = os.path.join(work, "zwsp-candidates.txt")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("# Words found between zero-width spaces, count first.\n")
        handle.write("# Review, then paste the good ones into lexicon/legal-terms.txt.\n")
        for word, count in sorted(candidates.items(), key=lambda i: (-i[1], i[0])):
            handle.write("%d\t%s\n" % (count, word))
    say("  candidates → %s" % path)


# ── Stage 3 — segment ────────────────────────────────────────────────────────

def stage_segment(cfg, say):
    import qc
    import segment

    out = stage_dir(cfg["work"], "segmented")
    done, unplaced = 0, 0
    for path in stage_files(cfg["work"], "clean"):
        doc = read_stage(path, "blocks")
        stats = qc.block_stats(doc["blocks"])
        clauses, report = segment.segment(doc["blocks"])
        stats.update(report)
        new = {"id": doc["id"], "src": doc["src"], "blockStats": stats, "clauses": clauses}
        write_stage(os.path.join(out, doc["id"] + ".jsonl"), new, "clauses")
        unplaced += sum(1 for c in clauses if c["z"] == "unplaced" and not c.get("marginal"))
        done += 1
    say("segment: %d documents, %d unplaced clauses (kept and flagged)" % (done, unplaced))
    return 0


# ── Stage 4 — annotate ───────────────────────────────────────────────────────

def stage_annotate(cfg, say):
    import annotate
    import nlp

    nlp.require_pythainlp()
    kinds = annotate.load_clause_kinds(cfg["lexicon"])
    terms = annotate.load_legal_terms(cfg["lexicon"])
    out = stage_dir(cfg["work"], "annotated")
    done, typed = 0, 0
    for path in stage_files(cfg["work"], "segmented"):
        doc = read_stage(path, "clauses")
        annotate.annotate(doc["clauses"], kinds, terms)
        for clause in doc["clauses"]:
            clause.pop("tokens", None)              # rebuilt from `t` and `b` on load
            typed += 1 if clause.get("k") else 0
        write_stage(os.path.join(out, doc["id"] + ".jsonl"), doc, "clauses")
        done += 1
    say("annotate: %d documents, %d clauses classified by kind" % (done, typed))
    return 0


def load_annotated(cfg):
    """Annotated stage files → documents with their token strings restored.

    Tokens are rebuilt from `t` and `b` rather than stored twice, which also
    means every build re-reads the encoding the browser will read.
    """
    import annotate

    documents = []
    for path in stage_files(cfg["work"], "annotated"):
        doc = read_stage(path, "clauses")
        for clause in doc["clauses"]:
            clause["tokens"] = annotate.decode_tokens(clause.get("t") or "",
                                                      clause.get("b") or "")
        documents.append(doc)
    return documents


# ── Stage 5 — build ──────────────────────────────────────────────────────────

def stage_build(cfg, say):
    import annotate
    import build_corpus

    documents = load_annotated(cfg)
    if not documents:
        say("build: nothing to build — run --stage ingest first")
        return 1
    corpus = build_corpus.build(
        documents,
        types=annotate.load_contract_types(cfg["lexicon"]),
        kinds=annotate.load_clause_kinds(cfg["lexicon"]),
    )
    size = build_corpus.write(corpus, cfg["out"])
    on_disk = os.path.getsize(cfg["out"])
    say("build: %s — %d docs, %d clauses, %d tokens (%.1f MB JSON, %.1f MB on disk)"
        % (cfg["out"], corpus["stats"]["docs"], corpus["stats"]["clauses"],
           corpus["stats"]["tokens"], size / 1e6, on_disk / 1e6))
    return 0


# ── Stage 6 — qc ─────────────────────────────────────────────────────────────

def stage_qc(cfg, say):
    import annotate
    import build_corpus
    import nlp
    import qc

    documents = load_annotated(cfg)
    if not documents:
        say("qc: nothing to report — run --stage ingest first")
        return 1
    types = annotate.load_contract_types(cfg["lexicon"])
    dictionary = set(nlp.thai_words()) | annotate.load_legal_terms(cfg["lexicon"])
    rows = []
    for doc in documents:
        meta = build_corpus.document_meta(doc, types)
        doc["qc"] = qc.doc_qc(doc, dictionary)
        rows.append(qc.manifest_row(doc, {"lang": meta["lang"], "qc": doc["qc"]}))
    path = os.path.join(cfg["work"], "manifest.csv")
    qc.write_manifest(rows, path)
    say("qc: %s" % path)
    qc.summary(rows, say)
    return 0


# ── CLI ──────────────────────────────────────────────────────────────────────

RUNNERS = {"ingest": stage_ingest, "clean": stage_clean, "segment": stage_segment,
           "annotate": stage_annotate, "build": stage_build, "qc": stage_qc}


def config(args):
    work = args.work or (os.path.dirname(args.out) or ".")
    return {
        "in": args.input,
        "out": args.out,
        "work": work,
        "azure": args.azure or os.path.join(work, "azure"),
        "lexicon": args.lexicon or os.path.join(HERE, "lexicon"),
    }


def run(cfg, stage="all", say=print):
    """Run one stage, or all six in order. -> exit code."""
    if not os.path.isdir(cfg["work"]):
        os.makedirs(cfg["work"])
    stages = STAGES if stage == "all" else (stage,)
    failed = 0
    for name in stages:
        failed += RUNNERS[name](cfg, say) or 0
    return 1 if failed else 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="build.py",
        description="Build a contract corpus from local .docx and saved Azure "
                    "Document Intelligence JSON. Local only — never calls Azure.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="stages: " + " → ".join(STAGES))
    parser.add_argument("--stage", default="all", choices=("all",) + STAGES,
                        help="stage to run (default: all)")
    parser.add_argument("--in", dest="input", default=DEFAULT_IN,
                        help="folder of original .docx files (default: %s)" % DEFAULT_IN)
    parser.add_argument("--out", default=DEFAULT_OUT,
                        help="corpus file to write; .gz gzips it (default: %s)" % DEFAULT_OUT)
    parser.add_argument("--azure", default=None,
                        help="folder of saved Azure DI JSON (default: <work>/azure)")
    parser.add_argument("--work", default=None,
                        help="per-stage working directory (default: the --out folder)")
    parser.add_argument("--lexicon", default=None,
                        help="lexicon folder (default: the one beside this script)")
    args = parser.parse_args(argv)
    return run(config(args), args.stage)


if __name__ == "__main__":
    sys.exit(main())
