#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conformance check for a corpus file against DESIGN.md §4.

Both the pipeline (track A) and the browser workbench (track B) must agree with
this script. If they disagree with each other, this is the arbiter.

    python3 validate_corpus.py fixtures/sample.corpus.json
    python3 validate_corpus.py ../../data/corpus.jtcorpus.gz
"""
import gzip, json, sys

ZONES = {"preamble", "parties", "definitions", "body", "signature", "annex", "unplaced"}
LANGS = {"th", "en", "mixed"}
CLAUSE_KEYS = {"d", "n", "nd", "p", "z", "k", "l", "h", "t", "b", "g", "u", "q", "r", "m", "a"}


def load(path):
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":                  # gzip magic, as the browser sniffs it
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def decode_b(b):
    """Space-separated deltas -> absolute token start offsets."""
    if b == "":
        return []
    starts, pos = [], 0
    for part in b.split(" "):
        pos += int(part)
        starts.append(pos)
    return starts


def validate(c):
    err = []

    def bad(msg):
        err.append(msg)

    if c.get("format") != "juratools-contract-corpus":
        bad("format must be 'juratools-contract-corpus'")
    if c.get("version") != 1:
        bad("version must be 1")
    for key in ("builtAt", "builder", "stats", "types", "kinds", "zones",
                "stop", "freq", "docs", "clauses"):
        if key not in c:
            bad("missing top-level key: %s" % key)
    if err:
        return err

    docs, clauses = c["docs"], c["clauses"]

    # docs[].c ranges must tile clauses[] contiguously and in order
    cursor = 0
    for i, d in enumerate(docs):
        for key in ("id", "title", "type", "lang", "src", "qc", "c"):
            if key not in d:
                bad("docs[%d] missing %s" % (i, key))
        rng = d.get("c")
        if not (isinstance(rng, list) and len(rng) == 2):
            bad("docs[%d].c must be [start, end)" % i)
            continue
        if rng[0] != cursor:
            bad("docs[%d].c starts at %d, expected %d — ranges must be contiguous"
                % (i, rng[0], cursor))
        if rng[1] < rng[0]:
            bad("docs[%d].c is inverted" % i)
        if d.get("type") not in c["types"]:
            bad("docs[%d].type %r not declared in types" % (i, d.get("type")))
        if d.get("lang") not in LANGS:
            bad("docs[%d].lang %r invalid" % (i, d.get("lang")))
        cursor = rng[1]
    if cursor != len(clauses):
        bad("docs[].c ranges cover %d clauses but clauses[] has %d" % (cursor, len(clauses)))

    ntok = 0
    for i, cl in enumerate(clauses):
        unknown = set(cl) - CLAUSE_KEYS
        if unknown:
            bad("clauses[%d] has undeclared keys: %s" % (i, sorted(unknown)))
        for key in ("d", "z", "l", "t", "b", "u"):
            if key not in cl:
                bad("clauses[%d] missing %s" % (i, key))
                continue
        if not (0 <= cl.get("d", -1) < len(docs)):
            bad("clauses[%d].d out of range" % i)
        if cl.get("z") not in ZONES:
            bad("clauses[%d].z %r invalid" % (i, cl.get("z")))
        if cl.get("l") not in LANGS:
            bad("clauses[%d].l %r invalid" % (i, cl.get("l")))
        if cl.get("k") is not None and cl.get("k") not in c["kinds"]:
            bad("clauses[%d].k %r not declared in kinds" % (i, cl.get("k")))
        if not isinstance(cl.get("u"), int) or cl["u"] < 1:
            bad("clauses[%d].u must be an integer >= 1" % i)

        # the load-bearing invariant: `b` must decode to real offsets in `t`
        t = cl.get("t", "")
        try:
            starts = decode_b(cl.get("b", ""))
        except ValueError:
            bad("clauses[%d].b is not space-separated integers" % i)
            continue
        ntok += len(starts)
        if starts:
            if starts[0] != 0:
                bad("clauses[%d].b: first token must start at 0, got %d" % (i, starts[0]))
            if any(starts[j] >= starts[j + 1] for j in range(len(starts) - 1)):
                bad("clauses[%d].b: token starts must strictly increase" % i)
            if starts[-1] >= len(t):
                bad("clauses[%d].b: last token starts at %d, past text length %d"
                    % (i, starts[-1], len(t)))
        elif t:
            bad("clauses[%d] has text but no tokens" % i)

    st = c["stats"]
    if st.get("docs") != len(docs):
        bad("stats.docs %r != len(docs) %d" % (st.get("docs"), len(docs)))
    if st.get("clauses") != len(clauses):
        bad("stats.clauses %r != len(clauses) %d" % (st.get("clauses"), len(clauses)))
    if st.get("tokens") != ntok:
        bad("stats.tokens %r != decoded token count %d" % (st.get("tokens"), ntok))

    return err


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    corpus = load(path)
    errors = validate(corpus)
    if errors:
        print("FAIL %s" % path)
        for e in errors:
            print("  - %s" % e)
        return 1
    s = corpus["stats"]
    print("OK %s — %d docs, %d clauses, %d tokens"
          % (path, s["docs"], s["clauses"], s["tokens"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
