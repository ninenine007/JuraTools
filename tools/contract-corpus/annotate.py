#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tokenization, clause-kind classification, dedup keys (DESIGN.md §3.4).

Tokens are stored as boundary offsets into the clause text, never as a second
copy of it (§4.3). The token stream must therefore *tile* the text exactly, which
is why the Thai tokenizer keeps whitespace and the English one matches spaces as
tokens of their own: `b` records starts, and the browser takes each token to run
to the next start.
"""
import json
import os
import re

import nlp

LEXICON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lexicon")

# A body cue is worth 1, capped; a head cue is worth 3 in the heading and 2 in
# the text. Below THRESHOLD, or on a tie, the answer is null — the pipeline's
# clause kind is a default, never a verdict (HOUSE-STYLE.md §5).
HEAD_IN_HEADING = 3
HEAD_IN_TEXT = 2
BODY_CAP = 3
THRESHOLD = 2

DIGITS = re.compile(r"[0-9๐-๙]+")
WHITESPACE = re.compile(r"\s+")
# Template clauses differ only in what was filled in. Two share pledge
# agreements drafted for different parties share 80% of their substantive
# paragraphs once digits and bracketed blanks are normalised away (DESIGN.md
# §7), so these three substitutions are what make `u` a real signal.
BRACKETED = re.compile(r"[\[\uff3b][^\]\uff3d]{0,120}[\]\uff3d]")
BLANKS = re.compile(r"[._\u2024\u2026\u00b7\-\u2013\u2014\uff0e]{3,}")


# ── Lexicons ─────────────────────────────────────────────────────────────────

def load_json(path):
    with open(path, "rb") as handle:
        data = json.loads(handle.read().decode("utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def load_clause_kinds(lexicon_dir=LEXICON_DIR):
    return load_json(os.path.join(lexicon_dir, "clause-kinds.json"))


def load_contract_types(lexicon_dir=LEXICON_DIR):
    return load_json(os.path.join(lexicon_dir, "contract-types.json"))


def load_legal_terms(lexicon_dir=LEXICON_DIR):
    """One term per line; # comments and blank lines ignored."""
    path = os.path.join(lexicon_dir, "legal-terms.txt")
    terms = set()
    if not os.path.exists(path):
        return terms
    with open(path, "rb") as handle:
        for line in handle.read().decode("utf-8").split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                terms.add(line)
    return terms


# ── Tokenization ─────────────────────────────────────────────────────────────

def token_starts(text, tokens):
    """Token list → strictly increasing start offsets that tile `text`.

    newmm returns tokens that re-join to the input exactly, so the fast path is
    a running sum. The search fallback exists so a surprising tokenizer can
    never produce a `b` string that lies about the text.
    """
    starts, pos = [], 0
    for token in tokens:
        if not token:
            continue
        if text.startswith(token, pos):
            starts.append(pos)
            pos += len(token)
            continue
        found = text.find(token, pos)
        if found < 0:
            continue
        starts.append(found)
        pos = found + len(token)
    if starts and starts[0] != 0:
        starts[0] = 0
    return [s for i, s in enumerate(starts) if i == 0 or s > starts[i - 1]]


def encode_b(starts):
    """Absolute starts → the space-separated deltas of §4.3."""
    out, previous = [], 0
    for start in starts:
        out.append(str(start - previous))
        previous = start
    return " ".join(out)


def decode_tokens(text, b):
    """`t` + `b` → the token strings, the same decode the browser does (§4.3).

    Stage files store offsets only, so tokens are rebuilt here rather than
    written twice — which means every build re-reads the encoding it emits.
    """
    if not b:
        return []
    starts, pos = [], 0
    for part in b.split(" "):
        pos += int(part)
        starts.append(pos)
    return [text[start:end] for start, end in zip(starts, starts[1:] + [len(text)])]


def tokenize(text, lang, tokenizer):
    """Thai (or mixed) goes to newmm; English to the plain word regex (§3.4)."""
    if not text:
        return []
    if lang == "en":
        return nlp.tokenize_en(text)
    return tokenizer.word_tokenize(text)


# ── Clause kind ──────────────────────────────────────────────────────────────

def _hits(cues, haystack):
    return sum(1 for cue in cues if cue and cue in haystack)


def classify(heading, text, kinds):
    """-> (slug, score) or (None, 0). English cues match case-insensitively."""
    heading_l = (heading or "").lower()
    text_l = (text or "").lower()
    scores = {}
    for slug, spec in kinds.items():
        head = spec.get("head") or []
        body = spec.get("body") or []
        score = 0
        if _hits(head, heading_l):
            score += HEAD_IN_HEADING
        elif _hits(head, text_l):
            score += HEAD_IN_TEXT
        score += min(_hits(body, heading_l + "\n" + text_l), BODY_CAP)
        if score:
            scores[slug] = score
    if not scores:
        return None, 0
    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    best, score = ranked[0]
    if score < THRESHOLD:
        return None, 0
    if len(ranked) > 1 and ranked[1][1] == score:       # a tie is not an answer
        return None, 0
    return best, score


# ── Dedup key (§3.4) ─────────────────────────────────────────────────────────

def dedup_key(clause):
    """Cleaned text with digits, bracketed blanks and whitespace collapsed.

    A clause with no body text of its own — a section heading with its
    substance in numbered sub-clauses — is keyed on its heading, so identical
    headings count together and empty strings do not all pile into one bucket.
    """
    text = clause.get("t") or clause.get("h") or ""
    text = BRACKETED.sub("[]", text)                # [ชื่อคู่สัญญา] → []
    text = BLANKS.sub("…", text)                    # ................ → …
    text = DIGITS.sub("0", text)                    # ๑๐๐,๐๐๐ → 0,0
    return WHITESPACE.sub(" ", text).strip()


# ── Stage ────────────────────────────────────────────────────────────────────

def annotate(clauses, kinds=None, legal_terms=None):
    """Add `b`, `k` and the dedup key to each clause of one document."""
    kinds = kinds if kinds is not None else load_clause_kinds()
    terms = legal_terms if legal_terms is not None else load_legal_terms()
    tokenizer = nlp.tokenizer(frozenset(terms))

    for clause in clauses:
        text = clause.get("t") or ""
        tokens = tokenize(text, clause.get("l"), tokenizer)
        starts = token_starts(text, tokens)
        clause["b"] = encode_b(starts)
        clause["ntok"] = len(starts)
        clause["tokens"] = tokens
        slug, score = classify(clause.get("h"), text, kinds)
        clause["k"] = slug
        clause["kScore"] = score
        clause["dup"] = dedup_key(clause)
    return clauses
