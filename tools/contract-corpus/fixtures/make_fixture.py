#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate sample.corpus.json — the shared ground truth for both build tracks.

Thai is tokenized with the real PyThaiNLP newmm engine so the `b` offsets match
what the pipeline will actually produce. The clause shapes here are the ones
measured in real Thai contracts: Thai-letter recitals, parenthesised labels,
three-level nesting, bilingual streams, and a QC-flagged unplaced block.

    python3 make_fixture.py && python3 ../validate_corpus.py sample.corpus.json
"""
import json, os, re, sys

try:
    from pythainlp.tokenize import word_tokenize
except ImportError:
    sys.exit("needs pythainlp:  pip install pythainlp")

EN = re.compile(r"\s+|\w+|[^\w\s]")


def tokens_for(text, lang):
    if lang == "en":
        toks = [m.group(0) for m in EN.finditer(text)]
    else:
        toks = word_tokenize(text, engine="newmm", keep_whitespace=True)
    assert "".join(toks) == text, "tokenizer did not round-trip: %r" % text
    return toks


def encode(text, lang):
    """-> (delta-encoded boundary string, token count), per DESIGN.md §4.3."""
    toks = tokens_for(text, lang)
    starts, pos = [], 0
    for t in toks:
        starts.append(pos)
        pos += len(t)
    deltas, prev = [], 0
    for s in starts:
        deltas.append(s - prev)
        prev = s
    return " ".join(str(d) for d in deltas), len(toks)


CL, NTOK = [], 0


def clause(d, n, nd, p, z, k, l, h, text, g, u, q=False, r=False, m=False):
    global NTOK
    b, count = encode(text, l)
    NTOK += count
    rec = {"d": d, "n": n, "nd": nd, "p": p, "z": z, "k": k, "l": l,
           "h": h, "t": text, "b": b, "g": g, "u": u}
    if q:
        rec["q"] = 1
    if r:
        rec["r"] = 1
    if m:
        rec["m"] = 1
    CL.append(rec)


# ── doc 0 — Thai service agreement ────────────────────────────────────
clause(0, None, None, [], "preamble", None, "th", None,
       "สัญญาฉบับนี้ทำขึ้น ณ กรุงเทพมหานคร เมื่อวันที่ ๑๑ มีนาคม ๒๕๖๗", 1, 3)

# Thai-letter recital. The case that proves `p` must be ordinals: "ก" sorts
# correctly as 1 and incorrectly as text. Its number exists only in numbering.xml.
clause(0, "ก", "ก.", [1], "preamble", None, "th", None,
       "โดยที่ผู้ว่าจ้างประสงค์จะว่าจ้างให้ผู้รับจ้างดำเนินงานตามที่กำหนดในสัญญาฉบับนี้", 1, 2)

clause(0, "5.2", "๕.๒", [5, 2], "body", "termination", "th", "การบอกเลิกสัญญา",
       "ในกรณีที่ผู้รับจ้างผิดนัดไม่ส่งมอบงานภายในกำหนด "
       "ผู้ว่าจ้างมีสิทธิบอกเลิกสัญญาได้ทันที โดยไม่ต้องบอกกล่าวล่วงหน้า", 3, 12)

clause(0, "5.3", "๕.๓", [5, 3], "body", "penalty", "th", "ค่าปรับ",
       "หากผู้รับจ้างส่งมอบงานล่าช้า ผู้รับจ้างยอมให้ผู้ว่าจ้างปรับเป็นรายวัน"
       "ในอัตราร้อยละ ๐.๑ ของมูลค่างานที่ยังไม่แล้วเสร็จ", 3, 7)

clause(0, "9.1", "๙.๑", [9, 1], "body", "force_majeure", "th", "เหตุสุดวิสัย",
       "คู่สัญญาฝ่ายใดไม่อาจปฏิบัติตามสัญญาได้เพราะเหตุสุดวิสัย ให้ฝ่ายนั้นพ้นจากความรับผิด", 8, 21)

# Parenthesised label nested under 9.1 — display `nd` "(1)", group on `n`, sort on `p`.
clause(0, "9.1.1", "(1)", [9, 1, 1], "body", "force_majeure", "th", None,
       "เหตุสุดวิสัย หมายความรวมถึง อุทกภัย ไฟไหม้ และการนัดหยุดงาน", 8, 4)

# A table row. Structurally identical across matters, so it recurs heavily and
# would top any recurrence ranking — which is exactly why `r` marks it.
clause(0, None, None, [], "annex", None, "th", None,
       "รายชื่อผู้ถือหุ้น | จำนวนหุ้น | สัดส่วนการถือหุ้น", 12, 7, r=True)

clause(0, None, None, [], "signature", None, "th", None,
       "ลงชื่อ ..................... ผู้ว่าจ้าง", 14, 1)

# ── doc 1 — bilingual NDA, the two languages as independent streams ───
clause(1, "3.1", "3.1", [3, 1], "body", "confidentiality", "th", "การรักษาความลับ",
       "ผู้รับข้อมูลตกลงเก็บรักษาข้อมูลอันเป็นความลับไว้เป็นความลับ "
       "และจะไม่เปิดเผยต่อบุคคลภายนอก", 2, 5)

clause(1, "3.1", "3.1", [3, 1], "body", "confidentiality", "en", "Confidentiality",
       "The Receiving Party shall keep the Confidential Information confidential "
       "and shall not disclose it to any third party.", 2, 5)

clause(1, "8.1", "8.1", [8, 1], "body", "governing_law", "en", "Governing Law",
       "This Agreement shall be governed by and construed in accordance with "
       "the laws of Thailand.", 6, 18)

# Page furniture. A bare page number recurs across every matter, so before the
# `m` flag existed these topped the clause library's recurrence ranking on a real
# 13-contract corpus. Kept and searchable, but out of the prose views.
clause(1, None, None, [], "unplaced", None, "th", None,
       "\u0e2b\u0e19\u0e49\u0e32 2 \u0e02\u0e2d\u0e07 9", 2, 20, m=True)

# Segmenter could not place this one. Kept and flagged — never dropped (§1.4).
clause(1, None, None, [], "unplaced", None, "mixed", None,
       "Annex A / เอกสารแนบท้าย ก", 9, 1, q=True)

DOCS = [
    {"id": "2567-svc-014", "title": "สัญญาจ้างทำของ", "type": "service", "lang": "th",
     "date": "2024-03-11",
     "parties": [{"role": "ผู้ว่าจ้าง", "name": "บริษัท ก จำกัด"},
                 {"role": "ผู้รับจ้าง", "name": "บริษัท ข จำกัด"}],
     "src": {"file": "raw/2567-svc-014.pdf", "method": "azure-di:prebuilt-layout", "pages": 14},
     "qc": {"thaiRatio": 0.94, "oovRate": 0.061, "meanConf": 0.987,
            "lowConfBlocks": 0, "unplacedBlocks": 0}},
    {"id": "2566-nda-002", "title": "Non-Disclosure Agreement / สัญญาไม่เปิดเผยข้อมูล",
     "type": "nda", "lang": "mixed", "date": "2023-11-02",
     "parties": [{"role": "Disclosing Party", "name": "บริษัท ค จำกัด"}],
     "src": {"file": "raw/2566-nda-002.docx", "method": "docx", "pages": 9},
     "qc": {"thaiRatio": 0.52, "oovRate": 0.044, "meanConf": 1.0,
            "lowConfBlocks": 0, "unplacedBlocks": 1}},
]

# docs[].c must tile clauses[] contiguously and in order — derive it, never hardcode
for di, doc in enumerate(DOCS):
    idxs = [i for i, c in enumerate(CL) if c["d"] == di]
    assert idxs == list(range(idxs[0], idxs[-1] + 1)), "doc %d clauses not contiguous" % di
    doc["c"] = [idxs[0], idxs[-1] + 1]

CORPUS = {
    "format": "juratools-contract-corpus",
    "version": 1,
    "builtAt": "2026-08-30T09:14:02Z",
    "builder": {"pipeline": "0.1.0-fixture", "pythainlp": "5.3.7", "tokenizer": "newmm"},
    "stats": {"docs": len(DOCS), "clauses": len(CL), "tokens": NTOK,
              "byLang": {lang: sum(1 for c in CL if c["l"] == lang)
                         for lang in ("th", "en", "mixed")}},
    "types": {"service": {"label": "Service agreement", "labelTh": "สัญญาจ้างทำของ"},
              "nda": {"label": "Non-disclosure agreement", "labelTh": "สัญญาไม่เปิดเผยข้อมูล"}},
    "kinds": {"termination":     {"label": "Termination", "labelTh": "การบอกเลิกสัญญา"},
              "penalty":         {"label": "Penalty / liquidated damages", "labelTh": "ค่าปรับ เบี้ยปรับ"},
              "force_majeure":   {"label": "Force majeure", "labelTh": "เหตุสุดวิสัย"},
              "confidentiality": {"label": "Confidentiality", "labelTh": "การรักษาความลับ"},
              "governing_law":   {"label": "Governing law", "labelTh": "กฎหมายที่ใช้บังคับ"}},
    "zones": ["preamble", "parties", "definitions", "body", "signature", "annex", "unplaced"],
    "stop": {"th": ["และ", "หรือ", "ของ", "ที่", "ใน", "เป็น", "ให้", "ได้", "จะ", "ไม่",
                    "ต่อ", "ตาม", "นั้น", "นี้", " "],
             "en": ["the", "of", "and", "to", "in", "it", "by", "be", "this", "any",
                    "with", "shall", "not", " ", "."]},
    "freq": {"th": [["สัญญา", 5], ["ผู้รับจ้าง", 4], ["ผู้ว่าจ้าง", 4],
                    ["ความลับ", 2], ["งาน", 4], ["เหตุสุดวิสัย", 3]],
             "en": [["shall", 3], ["Party", 2], ["Confidential", 1]]},
    "docs": DOCS,
    "clauses": CL,
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample.corpus.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(CORPUS, f, ensure_ascii=False, indent=1)
print("wrote %s — %d docs, %d clauses, %d tokens" % (out, len(DOCS), len(CL), NTOK))
