#!/usr/bin/env python3
"""Assemble document-automation/power-of-attorney.html from the build outputs.

    python3 assemble.py <workdir> <repo>/document-automation/power-of-attorney.html <leak.json>

Inlines pwa-engine.js and, for each form, its fragments, measured signature
geometry and package (base64) into page.src.html: the 2024 form from out/
(build_pwa.py, measure.py) and the current forms from out/th and out/thEn
(build_new.py, measure_new.py). Then decodes every part of every package and the
page, and refuses to write anything if a string from LEAK_FILE is still inside.
LEAK_FILE is kept outside the repo: the real names, ID numbers, company names and
addresses in the firm's sample files (make_leaklist.py writes it), plus the old
values the builds cut out (out/old-values.local.json, out/new-old-values.local.json).
The firm's own office address — what the current forms print after "ทำที่" — is
not personal data and may stay.
"""
import base64, io, json, os, re, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
# the firm's office, as the current forms print it after "ทำที่" / "Written at" (pwa-engine.js W2.place / placeEn)
FIRM_PLACE = ('89 อาคารเอไอเอ แคปปิตอล เซ็นเตอร์ ชั้น 15 ห้องเลขที่ 1507 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร',
              'No. 89 AIA Capital Center Building, 15th Floor, Room No. 1507, Ratchadaphisek Rd., Din Daeng, Din Daeng, Bangkok')

def main(work, dest, leak_file):
    out = os.path.join(work, 'out')
    fr = json.load(open(os.path.join(out, 'frags.json'), encoding='utf8'))
    geom = json.load(open(os.path.join(out, 'geom.json'), encoding='utf8'))
    tpl = open(os.path.join(out, 'tpl.docx'), 'rb').read()
    data = {'frags': fr['frags'], 'alt': fr['alt'], 'geom': geom, 'tpl': base64.b64encode(tpl).decode(), 'forms': {}}
    tpls = [tpl]
    for form in ('th', 'thEn'):
        d = os.path.join(out, form)
        f2 = json.load(open(os.path.join(d, 'frags.json'), encoding='utf8'))
        t2 = open(os.path.join(d, 'tpl.docx'), 'rb').read()
        data['forms'][form] = {'frags': f2['frags'], 'alt': f2['alt'], 'geom': json.load(open(os.path.join(d, 'geom.json'))),
                               'tpl': base64.b64encode(t2).decode()}
        tpls.append(t2)
    page = open(os.path.join(HERE, 'page.src.html'), encoding='utf8').read()
    engine = open(os.path.join(HERE, 'pwa-engine.js'), encoding='utf8').read()
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    html = page.replace('__PWA_DATA__', blob).replace('__PWA_ENGINE__', engine)
    if '__PWA_' in html: sys.exit('a placeholder was not filled')

    # ── leak check ──
    leaks = [s for s in json.load(open(leak_file, encoding='utf8')) if s and s.strip()]
    olds = json.load(open(os.path.join(out, 'old-values.local.json'), encoding='utf8'))
    news = json.load(open(os.path.join(out, 'new-old-values.local.json'), encoding='utf8'))
    olds += news
    fixed = json.dumps(fr, ensure_ascii=False) + json.dumps(data['forms'], ensure_ascii=False)
    # From the old values, what identifies a person or a place: titled names, and
    # the road / sub-district / building words of an address. (The old values also
    # hold ordinary legal wording — "ศาลอาญา", "การผิดสัญญา" — which is not data.)
    NAME = r'(?:เด็กชาย|เด็กหญิง|แพทย์หญิง|นายแพทย์|นางสาว|นาง|นาย)[^\s()“”,]{2,}(?: [^\s()“”,]{2,})?'
    PLACE = r'(?:ถนน|ซอย|ตำบล|แขวง|อำเภอ|เขต|อาคาร|คลินิก|หมู่บ้าน)[^\s()“”,]{3,}'
    for o in olds:
        leaks += re.findall(NAME, o) + [w for w in re.findall(PLACE, o) if w not in fixed]
    # The current forms' cut values that are a person's or a client's data, whole
    # (a name, a company, a cause): anything the engine does not print on its own.
    leaks += [v for v in news if len(v) >= 8 and v not in fixed and not re.fullmatch(r'[\d\s.]+', v)]
    firm = re.sub(r'\s+', ' ', ' '.join(FIRM_PLACE))
    leaks = sorted({l for l in leaks if len(l) >= 4 and re.sub(r'\s+', ' ', l).strip() not in firm})
    texts = [html]
    for t in tpls:
        z = zipfile.ZipFile(io.BytesIO(t))
        for n in z.namelist():
            if n.endswith('.xml') or n.endswith('.rels'):
                texts.append(z.read(n).decode('utf8', 'replace'))
    digits_only = lambda s: re.sub(r'\D', '', s)
    found = sorted({s for s in leaks for tx in texts if s in tx})
    ids = {digits_only(s) for s in leaks if len(digits_only(s)) >= 10}
    flat = [re.sub(r'\D', '', tx) for tx in texts]
    found += sorted({i for i in ids for f in flat if i in f})
    if found:
        sys.exit('LEAK — refusing to write the page: %r' % found[:40])
    open(dest, 'w', encoding='utf8').write(html)
    print('wrote', dest, round(len(html.encode('utf8')) / 1024), 'KB; leak check clean over', len(leaks), 'strings and', len(ids), 'ID numbers')

if __name__ == '__main__':
    main(*sys.argv[1:4])
