#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Emit the corpus file — the frozen §4 contract (DESIGN.md §4).

Everything terse in here is terse on purpose: `clauses[]` dominates the file
size, so it carries one full string (`t`) and offsets for everything else.

The only §4 latitude taken is inside `builder`, which is a free-form dict: it
records which clauses fed `freq`, so the browser never has to guess.
"""
import datetime
import gzip
import json
import re

import annotate
import nlp
import qc as qc_module

PIPELINE_VERSION = "0.1.0"
FREQ_LIMIT = 5000                                   # tokens per language in `freq`
FREQ_SCOPE = ("excludes header/footer/footnote blocks and signature-zone "
              "clauses, which repeat and would dominate every count")

EN_STOPWORDS = [
    "the", "of", "and", "to", "in", "a", "or", "for", "is", "are", "be", "by",
    "as", "at", "it", "this", "that", "any", "with", "shall", "not", "on",
    "such", "from", "which", "under", "may", "will", "has", "have", "all",
    " ", ".", ",",
]

LATIN = re.compile(r"[A-Za-z]")
WORDLIKE = re.compile(r"[0-9๐-๙A-Za-z฀-๿]")


# ── Document metadata (§4.2) ─────────────────────────────────────────────────

THAI_MONTHS = {
    "มกราคม": 1, "ม.ค.": 1, "กุมภาพันธ์": 2, "ก.พ.": 2, "มีนาคม": 3, "มี.ค.": 3,
    "เมษายน": 4, "เม.ย.": 4, "พฤษภาคม": 5, "พ.ค.": 5, "มิถุนายน": 6, "มิ.ย.": 6,
    "กรกฎาคม": 7, "ก.ค.": 7, "สิงหาคม": 8, "ส.ค.": 8, "กันยายน": 9, "ก.ย.": 9,
    "ตุลาคม": 10, "ต.ค.": 10, "พฤศจิกายน": 11, "พ.ย.": 11, "ธันวาคม": 12, "ธ.ค.": 12,
}
EN_MONTHS = {name.lower(): i + 1 for i, name in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"])}

ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
THAI_DATE = re.compile(r"([๐-๙0-9]{1,2})\s*(?:เดือน\s*)?([ก-ฮ][ก-ฮ\.]{1,11})\s*"
                       r"(?:พ\.?ศ\.?\s*)?([๐-๙0-9]{4})")
EN_DATE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})\b")
EN_DATE_MDY = re.compile(r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b")


def _to_iso(year, month, day):
    """ISO in state; Buddhist Era is a display matter only (HOUSE-STYLE §12)."""
    if year > 2400:                                 # พ.ศ. → ค.ศ.
        year -= 543
    try:
        return datetime.date(year, month, day).isoformat()
    except ValueError:
        return None


def find_date(text):
    """First date in the opening text, or None. Thai BE and English both."""
    from segment import arabic
    match = ISO_DATE.search(text)
    if match:
        return _to_iso(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    match = THAI_DATE.search(text)
    if match:
        month = THAI_MONTHS.get(match.group(2).strip())
        if month:
            return _to_iso(int(arabic(match.group(3))), month, int(arabic(match.group(1))))
    match = EN_DATE.search(text)
    if match and match.group(2).lower() in EN_MONTHS:
        return _to_iso(int(match.group(3)), EN_MONTHS[match.group(2).lower()],
                       int(match.group(1)))
    match = EN_DATE_MDY.search(text)
    if match and match.group(1).lower() in EN_MONTHS:
        return _to_iso(int(match.group(3)), EN_MONTHS[match.group(1).lower()],
                       int(match.group(2)))
    return None


PARTY_TH = re.compile(r"([^\s][^\n]{0,80}?)\s*ซึ่งต่อไปนี้(?:ใน(?:สัญญา|ข้อตกลง)นี้)?"
                      r"(?:จะ)?เรียกว่า\s*[\"“']?\s*([^\"”'\n)]{1,40}?)\s*[\"”']?\s*[)\n,]")
PARTY_EN = re.compile(r"([A-Z][^\n]{2,60}?)\s*\(\s*(?:the\s+)?[\"“']([^\"”']{2,40})[\"”']\s*\)")


def find_parties(text):
    """The document-level parties guess. Nothing more is extracted: the corpus
    is linguistic, not a deal database (DESIGN.md §5)."""
    parties, seen = [], set()
    for pattern in (PARTY_TH, PARTY_EN):
        for match in pattern.finditer(text):
            name = match.group(1).strip(" ,;:—-– ")
            role = match.group(2).strip()
            if not role or role in seen:
                continue
            seen.add(role)
            parties.append({"role": role, "name": name[-80:]})
    return parties[:6]


def guess_type(title, opening, types):
    """Highest-scoring contract type; `other` when nothing matches."""
    title_l = (title or "").lower()
    opening_l = (opening or "").lower()
    best, best_score = "other", 0
    for slug, spec in sorted(types.items()):
        score = 3 * sum(1 for cue in spec.get("title", []) if cue.lower() in title_l)
        score += min(sum(1 for cue in spec.get("cues", []) if cue.lower() in opening_l), 3)
        if score > best_score:
            best, best_score = slug, score
    return best


def document_meta(doc, types):
    """Title, type, language, date and parties for one document (§4.2)."""
    clauses = doc["clauses"]
    body = [c for c in clauses if not c.get("marginal")]
    title = None
    for clause in body:
        if clause.get("srcKind") == "heading":
            title = (clause.get("h") or clause.get("t") or "").strip()
            break
    if not title:
        for clause in body:
            text = (clause.get("h") or clause.get("t") or "").strip()
            if text:
                title = text[:120]
                break
    title = title or doc["id"]

    opening = "\n".join((c.get("h") or "") + "\n" + (c.get("t") or "")
                        for c in body[:40])[:4000]
    full = "\n".join(c.get("t") or "" for c in body)
    return {
        "title": title,
        "type": guess_type(title, opening, types),
        "lang": _language(full or title),
        "date": find_date(opening),
        "parties": find_parties(opening),
    }


def _language(text):
    ratio = nlp.count_thai(text)
    if ratio >= 60:
        return "th"
    if ratio <= 10:
        return "en"
    return "mixed"


# ── Frequency table (§4.1) ───────────────────────────────────────────────────

def frequency(documents):
    """Corpus-wide token counts, per language, precomputed because it is the
    expensive pass. Header, footer, footnote and signature clauses are left out:
    they repeat on every page and would otherwise dominate every count (§3.1)."""
    counts = {"th": {}, "en": {}}
    for doc in documents:
        for clause in doc["clauses"]:
            if clause.get("marginal") or clause.get("z") == "signature":
                continue
            for token in clause.get("tokens") or []:
                if not WORDLIKE.search(token):
                    continue
                bucket = "th" if nlp.is_thai_token(token) else (
                    "en" if LATIN.search(token) else None)
                if bucket:
                    counts[bucket][token] = counts[bucket].get(token, 0) + 1
    out = {}
    for bucket, table in counts.items():
        ranked = sorted(table.items(), key=lambda item: (-item[1], item[0]))
        out[bucket] = [[token, count] for token, count in ranked[:FREQ_LIMIT]]
    return out


# ── Assembly ─────────────────────────────────────────────────────────────────

def clause_record(clause, doc_index, count):
    """The §4.3 shape and nothing else — stage fields stay in the stage files."""
    record = {
        "d": doc_index,
        "n": clause.get("n"),
        "nd": clause.get("nd"),
        "p": clause.get("p") or [],
        "z": clause.get("z"),
        "k": clause.get("k"),
        "l": clause.get("l"),
        "h": clause.get("h") or None,
        "t": clause.get("t") or "",
        "b": clause.get("b") or "",
        "u": count,
    }
    if clause.get("g") is not None:
        record["g"] = clause["g"]
    if clause.get("q"):
        record["q"] = 1
    return record


def build(documents, types=None, kinds=None, built_at=None):
    """-> the corpus dict. `documents` are annotated stage records in order."""
    types = types if types is not None else annotate.load_contract_types()
    kinds = kinds if kinds is not None else annotate.load_clause_kinds()

    dup_counts = {}
    for doc in documents:
        for clause in doc["clauses"]:
            key = clause.get("dup") or ""
            dup_counts[key] = dup_counts.get(key, 0) + 1

    docs, clauses, by_lang, tokens = [], [], {"th": 0, "en": 0, "mixed": 0}, 0
    for index, doc in enumerate(documents):
        meta = doc.get("meta") or document_meta(doc, types)
        start = len(clauses)
        for clause in doc["clauses"]:
            record = clause_record(clause, index, dup_counts.get(clause.get("dup") or "", 1))
            by_lang[record["l"]] = by_lang.get(record["l"], 0) + 1
            tokens += clause.get("ntok", 0)
            clauses.append(record)
        docs.append({
            "id": doc["id"],
            "title": meta["title"],
            "type": meta["type"],
            "lang": meta["lang"],
            "date": meta.get("date"),
            "parties": meta.get("parties") or [],
            "src": doc["src"],
            "qc": doc.get("qc") or qc_module.doc_qc(doc),
            "c": [start, len(clauses)],
        })

    stamp = built_at or datetime.datetime.now(datetime.timezone.utc)
    return {
        "format": "juratools-contract-corpus",
        "version": 1,
        "builtAt": stamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "builder": {
            "pipeline": PIPELINE_VERSION,
            "pythainlp": nlp.pythainlp_version(),
            "tokenizer": "newmm+legal",
            "freqScope": FREQ_SCOPE,
        },
        "stats": {
            "docs": len(docs),
            "clauses": len(clauses),
            "tokens": tokens,
            "byLang": by_lang,
        },
        "types": {slug: {"label": spec["label"], "labelTh": spec["labelTh"]}
                  for slug, spec in sorted(types.items())},
        "kinds": {slug: {"label": spec["label"], "labelTh": spec["labelTh"]}
                  for slug, spec in sorted(kinds.items())},
        "zones": ["preamble", "parties", "definitions", "body", "signature",
                  "annex", "unplaced"],
        "stop": {"th": sorted(nlp.thai_stopwords()) + [" "], "en": EN_STOPWORDS},
        "freq": frequency(documents),
        "docs": docs,
        "clauses": clauses,
    }


def write(corpus, path):
    """Gzipped for `.gz`, plain JSON otherwise — the browser sniffs 1f 8b (§4)."""
    payload = json.dumps(corpus, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if path.endswith(".gz"):
        with gzip.open(path, "wb", compresslevel=9) as handle:
            handle.write(payload)
    else:
        with open(path, "wb") as handle:
            handle.write(payload)
    return len(payload)
