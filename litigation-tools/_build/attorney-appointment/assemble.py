#!/usr/bin/env python3
"""Assemble litigation-tools/attorney-appointment.html from the build outputs.

Inlines: poa-engine.js, spec + layout (geometry only — the old values are
stripped), TH SarabunPSK advance widths, the two marker templates (.docx,
base64) and the three Word-rendered blank page backgrounds.

Then decodes every embedded part and refuses to write the page if any string
from LEAK_FILE (real names, IDs, phones, e-mails, client names read from the
source files; kept outside the repo) is still inside.
"""
import base64, io, json, os, re, sys, zipfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

def png16(path):
    im = Image.open(path).convert('L').convert('P', palette=Image.Palette.ADAPTIVE, colors=16)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return base64.b64encode(b.getvalue()).decode()

def clean_docx(path):
    """Blank the one personal metadata field Word wrote on conversion (lastModifiedBy)."""
    zin = zipfile.ZipFile(path); buf = io.BytesIO(); zout = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        data = zin.read(it.filename)
        if it.filename == 'docProps/core.xml':
            data = re.sub(rb'<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', b'<cp:lastModifiedBy></cp:lastModifiedBy>', data)
        zout.writestr(it, data)
    zout.close(); return buf.getvalue()

def main(dest, leak_file):
    spec = json.load(open(os.path.join(OUT, 'spec.json'), encoding='utf8'))
    for t in ('JDA', 'PY'):
        for f in spec[t]:
            f.pop('orig', None); f.pop('pattern', None)
    layout = json.load(open(os.path.join(OUT, 'layout.json'), encoding='utf8'))
    widths = json.load(open(os.path.join(HERE, 'widths.json'), encoding='utf8'))
    tpl_bytes = {t: clean_docx(os.path.join(OUT, 'tpl%s.docx' % t)) for t in ('JDA', 'PY')}
    data = {
        'spec': {'JDA': spec['JDA'], 'PY': spec['PY']},
        'layout': layout,
        'widths': widths,
        'tpl': {t: base64.b64encode(b).decode() for t, b in tpl_bytes.items()},
        'bg': {'JDA1': png16(os.path.join(HERE, 'bg_JDA_144-1.png')),
               'PY1': png16(os.path.join(HERE, 'bg_PY_144-1.png')),
               'P2': png16(os.path.join(HERE, 'bg_PY_144-2.png'))},
    }
    page = open(os.path.join(HERE, 'page.src.html'), encoding='utf8').read()
    engine = open(os.path.join(HERE, 'poa-engine.js'), encoding='utf8').read()
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    html = page.replace('__POA_DATA__', blob).replace('__POA_ENGINE__', engine)

    # ── leak check ──
    leaks = [s for s in json.load(open(leak_file, encoding='utf8')) if s]
    texts = [html, json.dumps(data['spec'], ensure_ascii=False)]
    for t, b in tpl_bytes.items():
        z = zipfile.ZipFile(io.BytesIO(b))
        for n in z.namelist():
            if n.endswith('.xml') or n.endswith('.rels'):
                texts.append(z.read(n).decode('utf8', 'replace'))
    found = sorted({s for s in leaks for tx in texts if s in tx})
    if found:
        sys.exit('LEAK — refusing to write the page: %r' % found)
    open(dest, 'w', encoding='utf8').write(html)
    print('wrote', dest, round(len(html.encode('utf8')) / 1024), 'KB; leak check clean over', len(leaks), 'strings')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
