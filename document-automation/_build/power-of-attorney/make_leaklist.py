#!/usr/bin/env python3
"""make_leaklist.py <out.json> <sample.docx>…
Collects the personal data in the firm's sample powers of attorney, for
assemble.py to check the page against: every name in brackets under a
signature line, every cell of the attorneys' tables below the header, every
bold stretch of the grantor paragraph, every 10+ digit number, and the words
after "ทำที่". The list is written outside the repo and never committed."""
import json, re, sys, zipfile
from lxml import etree

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
HEADERS = {'ที่', 'รายนามผู้รับมอบอำนาจ', 'เลขที่บัตรประจำตัวประชาชน', 'รายชื่อ', 'ชื่อ', 'ชื่อผู้รับมอบอำนาจ', 'เลขประจำตัวประชาชน'}
out = set()
def text(el): return ''.join(t.text or '' for t in el.iter(W + 't'))
for path in sys.argv[2:]:
    root = etree.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    body = root.find(W + 'body')
    whole = text(body)
    out.update(m for m in re.findall(r'\(([^()“”]{4,60})\)', whole) if ' ' in m.strip())   # names in brackets (not "(มหาชน)")
    out.update(m.strip() for m in re.findall(r'(?:\d[ \-]?){10,}', whole))       # IDs, registration numbers
    for tbl in body.iter(W + 'tbl'):
        for tr in tbl.findall(W + 'tr')[1:]:
            for tc in tr.findall(W + 'tc'):
                t = text(tc).strip()
                if t and t not in HEADERS and not re.fullmatch(r'\d+\.?', t) and not t.startswith('ลงชื่อ'):
                    out.add(t)
    for p in body.iter(W + 'p'):
        t = text(p)
        if t.startswith('ทำที่'): out.add(t[5:].strip())
        if 'โดยหนังสือ' in t:
            for r in p.iter(W + 'r'):
                b = r.find(W + 'rPr/' + W + 'b')
                if b is not None and text(r).strip() and '“' not in text(r): out.add(text(r).strip())
GENERIC = {'บริษัท', 'จำกัด', 'มหาชน', 'ประเทศไทย', 'คดีแพ่ง', 'รวม'}          # words, not data
keep = sorted(s.strip() for s in out if len(s.strip()) >= 4 and s.strip() not in GENERIC
              and not s.strip().startswith(('“', 'ผู้มอบอำนาจ', 'ผู้รับมอบอำนาจ')))
json.dump(keep, open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(keep), 'strings →', sys.argv[1])
