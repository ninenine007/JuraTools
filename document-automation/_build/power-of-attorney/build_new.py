#!/usr/bin/env python3
"""Build the two current forms of หนังสือมอบอำนาจให้ฟ้องคดี (September 2026) for
document-automation/power-of-attorney.html, from the firm's two marked precedents:

    th.docx    the Thai form             → form "th"   (the default)
    thEn.docx  the Thai–English form     → form "thEn"

The user marked in cyan what changes with each case ("อาจจะตรงหรือไม่ตรงบ้าง");
everything else is the firm's wording and stays as it is. The highlight is the
user's note, so it is removed. As in build_pwa.py (the 2024 form, now "legacy"):
each variable stretch becomes a marker typed into one of its own runs, that run's
<w:rPr> kept byte for byte; paragraphs and table rows are copied whole.

Every stretch is checked against what it held — sha256[:12] of fixed text, only the
length of a person's or a client's data (new-hashes.json) — so a build from a
different file stops instead of cutting in the wrong place. The old values are
never written anywhere but out/new-old-values.local.json (local, for the leak check).

    python3 build_new.py <workdir>            → out/th/{frags.json,tpl.docx}, out/thEn/…
    python3 build_new.py <workdir> --learn    prints the hashes instead of checking them
"""
import copy, hashlib, io, json, os, re, sys, zipfile
from lxml import etree

WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
W14 = '{http://schemas.microsoft.com/office/word/2010/wordml}'
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'

WORK = sys.argv[1] if len(sys.argv) > 1 else '.'
LEARN = '--learn' in sys.argv
OUT = os.path.join(WORK, 'out')
LEAKS = []

def h(s): return hashlib.sha256(s.encode('utf8')).hexdigest()[:12]

def rtext(r):
    o = ''
    for c in r:
        t = c.tag.replace(W, '')
        if t == 't': o += c.text or ''
        elif t == 'tab': o += '\t'
        elif t == 'br': o += '\n'
    return o

def ptext(p): return ''.join(rtext(r) for r in p.findall(W + 'r'))

def load(name):
    z = zipfile.ZipFile(os.path.join(WORK, name))
    raw = z.read('word/document.xml').decode('utf8')
    root = etree.fromstring(raw.encode('utf8'))
    for tag in ('proofErr', 'bookmarkStart', 'bookmarkEnd', 'lastRenderedPageBreak'):
        for el in list(root.iter(W + tag)): el.getparent().remove(el)
    for el in root.iter():
        for a in (W14 + 'paraId', W14 + 'textId'):
            if a in el.attrib: del el.attrib[a]
    n = 0
    for hl in list(root.iter(W + 'highlight')):
        if hl.get(W + 'val') != 'cyan': sys.exit('%s: unexpected highlight colour %r' % (name, hl.get(W + 'val')))
        hl.getparent().remove(hl); n += 1
    return z, raw, root, n

def body_children(root): return list(root.find(W + 'body'))
def paras(root): return [e for e in body_children(root) if e.tag == W + 'p']
def tables(root): return [e for e in body_children(root) if e.tag == W + 'tbl']
def shape(root):
    return ''.join('p' if e.tag == W + 'p' else 't' if e.tag == W + 'tbl' else 's' for e in body_children(root))

def ser(el):
    s = etree.tostring(el, encoding='unicode')
    return re.sub(r'^(<[^>]+?)((?:\s+xmlns(?::\w+)?="[^"]*")+)', r'\1', s, count=1)

# The hash of every cut, in build order (new-hashes.json, committed: hashes, never values).
HERE = os.path.dirname(os.path.abspath(__file__))
HASHES = os.path.join(HERE, 'new-hashes.json')
EXPECT = [] if LEARN else json.load(open(HASHES))
SEEN = []
PERSONAL = {'grantor', 'grantorEn', 'name', 'nameEn', 'id', 'counterparty', 'counterpartyEn', 'cause', 'causeEn', 'company', 'companyEn'}

def mark(p, a, b, marker, expect=None, anchor=None):
    """Runs a..b of p held one variable value: keep one run (anchor, default a)
    with its rPr, make its content the marker, drop the rest."""
    runs = p.findall(W + 'r')
    if b < 0: b = len(runs) + b
    old = ''.join(rtext(r) for r in runs[a:b + 1])
    # A cut that held a person's or a client's data is checked by its length only:
    # a short hash of a 13-digit ID or a name could be searched back.
    SEEN.append([marker, ('len:%d' % len(old)) if marker in PERSONAL else h(old)])
    if LEARN: print('  %-14s runs %2d..%2d  %s' % (marker, a, b, SEEN[-1][1]))
    else:
        i = len(SEEN) - 1
        if i >= len(EXPECT) or EXPECT[i] != SEEN[-1]:
            sys.exit('mark %s: runs %d..%d hold %s, expected %s — wrong source file?' % (marker, a, b, h(old), EXPECT[i] if i < len(EXPECT) else None))
    keep = runs[anchor if anchor is not None else a]
    for c in list(keep):
        if c.tag != W + 'rPr': keep.remove(c)
    t = etree.SubElement(keep, W + 't'); t.set(XMLSPACE, 'preserve'); t.text = '⟦%s⟧' % marker
    for r in runs[a:b + 1]:
        if r is not keep: p.remove(r)
    LEAKS.append(old)
    return old

def fixed(p, k, marker, expect_text):
    """A fixed word (a signature label) becomes a marker in the run that held it."""
    r = p.findall(W + 'r')[k]
    if rtext(r) != expect_text: sys.exit('label run %d is %r, expected %r' % (k, rtext(r), expect_text))
    for c in list(r):
        if c.tag != W + 'rPr': r.remove(c)
    t = etree.SubElement(r, W + 't'); t.set(XMLSPACE, 'preserve'); t.text = '⟦%s⟧' % marker

def center_name(p, kind):
    """A name under a signature line is centred on that line: jc=center with a
    left indent measured in Word (⟦IND:kind⟧, see measure_new.py). The drafters
    set each row's indents by hand."""
    ppr = p.find(W + 'pPr')
    ind = ppr.find(W + 'ind')
    if ind is None:
        ind = etree.Element(W + 'ind'); sp = ppr.find(W + 'spacing')
        (sp.addnext(ind) if sp is not None else ppr.insert(0, ind))
    for a in list(ind.attrib): del ind.attrib[a]
    ind.set(W + 'left', '⟦IND:%s⟧' % kind)
    jc = ppr.find(W + 'jc')
    if jc is None: jc = etree.SubElement(ppr, W + 'jc')
    jc.set(W + 'val', 'center')

def name_para(p, kind, marker, expect):
    """'(ชื่อ)' — the brackets and the name, in one run or several → one marker;
    the engine types "(name)" back."""
    t = ptext(p)
    if not (t.startswith('(') and t.endswith(')')): sys.exit('name paragraph is not "(…)": %r' % t)
    mark(p, 0, -1, marker, expect)
    center_name(p, kind)
    return ser(p)

def cell_paras(tbl, r, c): return tbl.findall(W + 'tr')[r].findall(W + 'tc')[c].findall(W + 'p')
def tc_pr(tbl, r, c): return ser(tbl.findall(W + 'tr')[r].findall(W + 'tc')[c].find(W + 'tcPr'))
def tr_open(tbl, r):
    s = ser(tbl.findall(W + 'tr')[r]); return s[:s.index('>') + 1]

def insert_number_run(p, after):
    """The Thai–English form's clause 3 has no number ("→→ให้มีอำนาจ…"); every other
    clause reads "→N.→". A run like the tab before it is added for the number, so
    clauses can be renumbered when one is added."""
    runs = p.findall(W + 'r')
    r = copy.deepcopy(runs[after])
    for c in list(r):
        if c.tag != W + 'rPr': r.remove(c)
    t = etree.SubElement(r, W + 't'); t.set(XMLSPACE, 'preserve'); t.text = '⟦no⟧'
    runs[after].addnext(r)

def package(z, raw, root, F):
    head = raw[:raw.index('<w:body>') + len('<w:body>')]
    F['head'] = head
    F['tail'] = ser(body_children(root)[-1]) + '</w:body></w:document>'
    out = io.BytesIO(); zo = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        data = z.read(it.filename)
        if it.filename == 'word/document.xml':
            data = (F['head'] + '⟦BODY⟧' + F['tail']).encode('utf8')
        elif it.filename == 'docProps/core.xml':
            for tag in (rb'dc:creator', rb'cp:lastModifiedBy'):
                data = re.sub(rb'<' + tag + rb'>[^<]*</' + tag + rb'>', b'<' + tag + b'></' + tag + b'>', data)
        zo.writestr(it, data)
    zo.close()
    return out.getvalue()

def check(F, markers):
    blob = json.dumps(F, ensure_ascii=False)
    for m in markers:
        if '⟦%s⟧' % m not in blob: sys.exit('marker %s lost' % m)
    if 'w:highlight' in blob: sys.exit('a highlight survived')

def write(form, F, alt, pkg):
    d = os.path.join(OUT, form); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'tpl.docx'), 'wb').write(pkg)
    json.dump({'frags': F, 'alt': alt}, open(os.path.join(d, 'frags.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)

# ─────────────────────────────────────────────────────────────────────────────
zt, raw_t, T, nt = load('th.docx')
zb, raw_b, B, nb = load('thEn.docx')
if shape(T) != 'ppppt' + 'p' * 10 + 'tpps': sys.exit('th.docx is not the expected shape: ' + shape(T))
if shape(B) != 'p' * 8 + 't' + 'p' * 22 + 'tpps': sys.exit('thEn.docx is not the expected shape: ' + shape(B))
PT, TT = paras(T), tables(T)
PB, TB = paras(B), tables(B)

# The full-width signer (a lone director; an odd attorney or witness out) exists
# only in the Thai–English precedent (its row 1). Both forms take it from there:
# the Thai form its Thai lines, the Thai–English form all four.
def g1_proto(bi):
    g = [copy.deepcopy(p) for p in cell_paras(TB[1], 1, 0)]
    fixed(g[0], 2, 'label', 'ผู้มอบอำนาจ')
    fixed(g[1], 2, 'labelEn', 'Principal')
    S = {'G1.sig': ser(g[0]), 'G1.name': name_para(g[2], 'G1', 'name', None)}
    if bi: S.update({'G1.sigEn': ser(g[1]), 'G1.nameEn': name_para(g[3], 'G1', 'nameEn', None)})
    return S

# ══ Form "th" ═════════════════════════════════════════════════════════════════
F, alt = {}, {}
F['title'] = ser(PT[0])
F['placeDefault'] = ser(PT[1])                       # the firm's office, as the drafter set it (condensed to fit)
mark(PT[1], 3, 13, 'place', None, anchor=13)
F['place'] = ser(PT[1])
mark(PT[2], 0, 2, 'date', None)
F['date'] = ser(PT[2])
mark(PT[3], 2, 14, 'grantor', None)      # run 15 (space) stays
F['grantor'] = ser(PT[3])

att = TT[0]; rows = att.findall(W + 'tr')
row = copy.deepcopy(rows[2])                          # the plain row (row 1 carries a white fill and a condensed name)
for tr in rows[1:]: att.remove(tr)
F['attTable'] = ser(att).replace('</w:tbl>', '⟦ROWS⟧</w:tbl>')
c0, c1, c2 = row.findall(W + 'tc')
mark(c0.find(W + 'p'), 0, -1, 'no', None)
mark(c1.find(W + 'p'), 0, -1, 'name', None)
mark(c2.find(W + 'p'), 0, -1, 'id', None)
F['attRow'] = ser(row)

mark(PT[4], 18, 33, 'cause', None)                    # run 34 (space) stays
mark(PT[4], 6, 11, 'counterparty', None)              # "ฟ้องร้องดำเนินคดีทั้งทางแพ่งและอาญากับ" + the counterparty
F['intro'] = ser(PT[4])
F['scope'] = ser(PT[5])

x = copy.deepcopy(PT[11])                             # an added clause takes clause 6's paragraph
mark(x, 4, -1, 'TEXT', None); mark(x, 1, 2, 'no', None)
F['extraClause'] = ser(x)
clauses = []
for k, p in enumerate(PT[6:12]):
    mark(p, 1, 2 if k >= 4 else 1, 'no', None)        # "5" "." and "6" "." are two runs
    clauses.append(ser(p))
F['clauses'] = clauses
F['closing'] = ser(PT[12])
F['sigLead.samePage'] = ser(PT[13])
F['sigLead.nextPage'] = ser(PT[13]) + ser(PB[27]) + ser(PB[29])   # the Thai–English form's Thai note + page break

sig = TT[1]
tbl = copy.deepcopy(sig)
for tr in tbl.findall(W + 'tr'): tbl.remove(tr)
F['sigTable'] = ser(tbl).replace('</w:tbl>', '⟦ROWS⟧</w:tbl>')
F['tr'] = tr_open(sig, 2)
F['tcHalf'] = tc_pr(sig, 2, 0)
F['tcFull'] = tc_pr(sig, 0, 0)
S = {}
g = cell_paras(sig, 0, 0)
mark(g[0], 0, -1, 'company', None)
S['CO.company'] = ser(g[0]); S['CO.trail'] = ser(g[1])
g = cell_paras(sig, 2, 0)                             # attorneys
S['H.blank'] = ser(g[0]); S['H.sig'] = ser(g[1]); S['H.name'] = name_para(g[2], 'H', 'name', None)
g = cell_paras(sig, 3, 0)                             # witnesses — and grantors in pairs (the precedent's row 1 is the same lines)
fixed(g[1], 2, 'label', 'พยาน')
S['W.blank'] = ser(g[0]); S['W.sig'] = ser(g[1]); S['W.name'] = name_para(g[2], 'W', 'name', None)
r1 = cell_paras(sig, 1, 0)
norsid = lambda s: re.sub(r' w:rsid\w*="[0-9A-F]+"', '', s).replace('<w:t xml:space="preserve">', '<w:t>')
if norsid(ser(r1[0])).replace('ผู้มอบอำนาจ', '⟦label⟧') != norsid(S['W.sig']): sys.exit('the directors\' line differs from the witnesses\'')
S.update(g1_proto(False))
F['sig'] = S
mark(PT[15], 2, 3, 'stamp', None)
F['stamp'] = ser(PT[14]) + ser(PT[15])                # the empty line after the table, then the duty
pkg = package(zt, raw_t, T, F)
check(F, ('place', 'date', 'grantor', 'no', 'name', 'id', 'counterparty', 'cause', 'TEXT', 'company', 'label', 'stamp', 'ROWS'))
write('th', F, alt, pkg)

# ══ Form "thEn" ═══════════════════════════════════════════════════════════════
F, alt = {}, {}
F['title'] = ser(PB[0]); F['titleEn'] = ser(PB[1])
F['placeDefault'] = ser(PB[2]); F['placeEnDefault'] = ser(PB[3])
mark(PB[2], 3, 13, 'place', None, anchor=13)
mark(PB[3], 1, 10, 'placeEn', None)
F['place'] = ser(PB[2]); F['placeEn'] = ser(PB[3])
mark(PB[4], 0, 2, 'date', None); mark(PB[5], 0, 1, 'dateEn', None)
F['date'] = ser(PB[4]); F['dateEn'] = ser(PB[5])
mark(PB[6], 2, 10, 'grantor', None); mark(PB[7], 1, 16, 'grantorEn', None)
F['grantor'] = ser(PB[6]); F['grantorEn'] = ser(PB[7])

att = TB[0]; rows = att.findall(W + 'tr')
row = copy.deepcopy(rows[2])
for tr in rows[1:]: att.remove(tr)
F['attTable'] = ser(att).replace('</w:tbl>', '⟦ROWS⟧</w:tbl>')
c0, c1, c2 = row.findall(W + 'tc')
mark(c0.find(W + 'p'), 0, -1, 'no', None)
n0, n1 = c1.findall(W + 'p')
mark(n0, 0, -1, 'name', None); mark(n1, 0, -1, 'nameEn', None)
mark(c2.find(W + 'p'), 0, -1, 'id', None)
F['attRow'] = ser(row)

mark(PB[8], 19, 20, 'cause', None)
mark(PB[8], 6, 12, 'counterparty', None)
mark(PB[9], 16, 16, 'causeEn', None)
mark(PB[9], 8, 12, 'counterpartyEn', None)
F['intro'] = ser(PB[8]); F['introEn'] = ser(PB[9])
F['scope'] = ser(PB[10]); F['scopeEn'] = ser(PB[11])

x = copy.deepcopy(PB[22])
mark(x, 4, -1, 'TEXT', None); mark(x, 1, 2, 'no', None)
F['extraClause'] = ser(x)
clauses, clausesEn = [], []
for k in range(6):
    p, e = PB[12 + 2 * k], PB[13 + 2 * k]
    if k == 2:
        if ptext(p)[:2] != '\t\t': sys.exit('clause 3 was expected to have no number')
        insert_number_run(p, 0)
    else:
        mark(p, 1, 2 if k >= 4 else 1, 'no', None)
    clauses.append(ser(p)); clausesEn.append(ser(e))
F['clauses'] = clauses; F['clausesEn'] = clausesEn
xe = copy.deepcopy(PB[23]); mark(xe, 2, -1, 'TEXT', None)
F['extraClauseEn'] = ser(xe)
F['closing'] = ser(PB[24]); F['closingEn'] = ser(PB[25])
F['sigLead.samePage'] = ser(PB[26])
F['sigLead.nextPage'] = ''.join(ser(p) for p in PB[26:30])

sig = TB[1]
tbl = copy.deepcopy(sig)
for tr in tbl.findall(W + 'tr'): tbl.remove(tr)
F['sigTable'] = ser(tbl).replace('</w:tbl>', '⟦ROWS⟧</w:tbl>')
F['tr'] = tr_open(sig, 2)
F['tcHalf'] = tc_pr(sig, 2, 0)
F['tcFull'] = tc_pr(sig, 0, 0)
S = {}
g = cell_paras(sig, 0, 0)
mark(g[0], 0, -1, 'company', None); mark(g[1], 0, -1, 'companyEn', None)
S['CO.company'] = ser(g[0]); S['CO.companyEn'] = ser(g[1]); S['CO.trail'] = ser(g[2])
g = cell_paras(sig, 2, 0)                             # attorneys (the left cell: its "Signed" is 12 pt, as the rest)
S['H.blank'] = ser(g[0]); S['H.sig'] = ser(g[1]); S['H.sigEn'] = ser(g[2])
S['H.name'] = name_para(g[3], 'H', 'name', None); S['H.nameEn'] = name_para(g[4], 'H', 'nameEn', None)
g = cell_paras(sig, 3, 0)                             # witnesses, and grantors in pairs
fixed(g[1], 2, 'label', 'พยาน')
fixed(g[2], 1, 'labelEn', '\tWitness')
S['W.blank'] = ser(g[0]); S['W.sig'] = ser(g[1]); S['W.sigEn'] = ser(g[2])
S['W.name'] = name_para(g[3], 'W', 'name', None); S['W.nameEn'] = name_para(g[4], 'W', 'nameEn', None)
S.update(g1_proto(True))
F['sig'] = S
mark(PB[31], 2, 3, 'stamp', None)
F['stamp'] = ser(PB[30]) + ser(PB[31])
pkg = package(zb, raw_b, B, F)
check(F, ('place', 'placeEn', 'date', 'dateEn', 'grantor', 'grantorEn', 'no', 'name', 'nameEn', 'id', 'counterparty',
          'counterpartyEn', 'cause', 'causeEn', 'TEXT', 'company', 'companyEn', 'label', 'labelEn', 'stamp', 'ROWS'))
write('thEn', F, alt, pkg)

json.dump(sorted(set(LEAKS)), open(os.path.join(OUT, 'new-old-values.local.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
if LEARN: json.dump(SEEN, open(HASHES, 'w'), indent=0); print('pinned', len(SEEN), 'hashes in new-hashes.json')
elif len(SEEN) != len(EXPECT): sys.exit('expected %d cuts, made %d' % (len(EXPECT), len(SEEN)))
print('highlights removed: th %d, thEn %d' % (nt, nb))
print('wrote out/th and out/thEn;', len(set(LEAKS)), 'old values listed in out/new-old-values.local.json (local only)')
