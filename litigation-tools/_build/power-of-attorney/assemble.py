#!/usr/bin/env python3
"""Assemble litigation-tools/power-of-attorney.html from the build outputs.

    python3 assemble.py <workdir> <repo>/litigation-tools/power-of-attorney.html <leak.json>

Inlines pwa-engine.js, the fragments (out/frags.json), the measured signature
geometry (out/geom.json) and the package (out/tpl.docx, base64) into
page.src.html. Then decodes every part of the package and the page, and refuses
to write anything if a string from LEAK_FILE is still inside. LEAK_FILE is kept
outside the repo: the real names, ID numbers, company names and addresses in
the firm's sample files (make_leaklist.py writes it), plus the old values the
build cut out (out/old-values.local.json, added here).
"""
import base64, io, json, os, re, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

def main(work, dest, leak_file):
    out = os.path.join(work, 'out')
    fr = json.load(open(os.path.join(out, 'frags.json'), encoding='utf8'))
    geom = json.load(open(os.path.join(out, 'geom.json'), encoding='utf8'))
    tpl = open(os.path.join(out, 'tpl.docx'), 'rb').read()
    data = {'frags': fr['frags'], 'alt': fr['alt'], 'geom': geom, 'tpl': base64.b64encode(tpl).decode()}
    page = open(os.path.join(HERE, 'page.src.html'), encoding='utf8').read()
    engine = open(os.path.join(HERE, 'pwa-engine.js'), encoding='utf8').read()
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    html = page.replace('__PWA_DATA__', blob).replace('__PWA_ENGINE__', engine)
    if '__PWA_' in html: sys.exit('a placeholder was not filled')

    # ── leak check ──
    leaks = [s for s in json.load(open(leak_file, encoding='utf8')) if s and s.strip()]
    olds = json.load(open(os.path.join(out, 'old-values.local.json'), encoding='utf8'))
    fixed = json.dumps(fr, ensure_ascii=False)
    # From the old values, what identifies a person or a place: titled names, and
    # the road / sub-district / building words of an address. (The old values also
    # hold ordinary legal wording — "ศาลอาญา", "การผิดสัญญา" — which is not data.)
    NAME = r'(?:เด็กชาย|เด็กหญิง|แพทย์หญิง|นายแพทย์|นางสาว|นาง|นาย)[^\s()“”,]{2,}(?: [^\s()“”,]{2,})?'
    PLACE = r'(?:ถนน|ซอย|ตำบล|แขวง|อำเภอ|เขต|อาคาร|คลินิก|หมู่บ้าน)[^\s()“”,]{3,}'
    for o in olds:
        leaks += re.findall(NAME, o) + [w for w in re.findall(PLACE, o) if w not in fixed]
    leaks = sorted({l for l in leaks if len(l) >= 4})
    texts = [html]
    z = zipfile.ZipFile(io.BytesIO(tpl))
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
