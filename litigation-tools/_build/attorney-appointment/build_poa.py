#!/usr/bin/env python3
"""Build the two ใบแต่งทนายความ templates for litigation-tools/attorney-appointment.html.

Input : the firm's two precedents, converted .doc -> .docx by Microsoft Word itself
        (jda_word.docx = the JDA file, defendant side; py_word.docx = the PY file,
         plaintiff side).  They hold real client and lawyer data: keep them, and
         everything derived from them except out/tpl*.docx, outside the repo.
Output: out/tplJDA.docx, out/tplPY.docx  (markers ⟦…⟧ inside the ORIGINAL runs)
        out/spec.json                     (geometry of every blank, for the fill engine)

The rule this script enforces: a field value is written into the run that
already held the old value, so it keeps that run's exact <w:rPr> — font, size,
underline, spacing, cs flag and w:lang.  Nothing is re-styled.  The only
structural edits are (a) removing the leftover runs of a value Word had split
across several runs, (b) two empty runs cloned from the red-number blanks so
that blank can take a value, and (c) for tplJDA, page 2 taken from the PY file
because JDA's own page 2 has no room for the office's building name.
"""
import copy, hashlib, json, os, re, sys, zipfile
from lxml import etree

HERE = os.path.dirname(os.path.abspath(__file__))
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML_NS = 'http://www.w3.org/XML/1998/namespace'
def q(t): return '{%s}%s' % (WNS, t)
def sha12(s): return hashlib.sha256(s.encode()).hexdigest()[:12]

WIDTHS = json.load(open(os.path.join(HERE, 'widths.json'), encoding='utf8'))
MARKS = set('ัิีึืฺุู็่้๊๋์ํ๎')
TEXT_W = 11909 - 1440 - 1008          # page width minus left/right margin (twips), same in both files

# ── measuring ─────────────────────────────────────────────────────────────
def rprops(r):
    rp = r.find(q('rPr'))
    sz, sp, font, bold = 24, 0, None, False
    if rp is not None:
        e = rp.find(q('sz'));      sz = int(e.get(q('val'))) if e is not None else sz
        e = rp.find(q('spacing')); sp = int(e.get(q('val'))) if e is not None else 0
        e = rp.find(q('rFonts'))
        if e is not None: font = e.get(q('cs')) or e.get(q('ascii'))
        bold = rp.find(q('b')) is not None
    return sz, sp, font, bold

CLUSTER_EXT = MARKS | {'\u0e33'}      # SARA AM joins the cluster before it (Unicode SpacingMark)
def spacing_units(s):
    """How many times Word adds w:spacing across s: once per grapheme cluster,
    except clusters that end in a zero-width mark (กิ, ที่, ก์ get none).
    Measured in Word for Mac against TH SarabunPSK — see sptest in the build notes."""
    n = 0
    for i, c in enumerate(s):
        if i + 1 < len(s) and s[i + 1] in CLUSTER_EXT: continue   # not the end of its cluster
        if c not in MARKS: n += 1
    return n

def tw(s, sz, sp):
    """Width in twips of s at half-point size sz with character spacing sp (twentieths of a point)."""
    adv = sum(WIDTHS.get(c, 500) for c in s)
    return adv * sz / 100.0 + sp * spacing_units(s)

def rtext(r):
    out = []
    for c in r:
        n = etree.QName(c).localname
        if n == 't': out.append(c.text or '')
        elif n == 'tab': out.append('\t')
        elif n == 'br': out.append('\n')
    return ''.join(out)

def druns(p): return [c for c in p if c.tag == q('r')]

def tabs_of(p):
    ts = []
    tabs = p.find(q('pPr') + '/' + q('tabs'))
    if tabs is not None:
        for t in tabs:
            if t.get(q('val')) != 'clear':
                ts.append((int(t.get(q('pos'))), t.get(q('val'))))
    return sorted(ts)

STYLE_FIRSTLINE = {'Text': 1440}      # the only paragraph style with an indent on these forms
def origin_of(p):
    ppr = p.find(q('pPr'))
    left, first = 0, 0
    st = ppr.find(q('pStyle')) if ppr is not None else None
    if st is not None: first = STYLE_FIRSTLINE.get(st.get(q('val')), 0)
    ind = ppr.find(q('ind')) if ppr is not None else None
    if ind is not None:
        left = int(ind.get(q('left'), 0))
        if ind.get(q('firstLine')) is not None: first = int(ind.get(q('firstLine')))
        if ind.get(q('hanging')) is not None: first = -int(ind.get(q('hanging')))
    return left, left + first

def layout(p):
    """x (twips, from the paragraph's text-area left) of every direct run, first line only.
    Returns list of dicts {run, text, x0, x1} and tab info per tab run."""
    left, x = origin_of(p)
    stops = tabs_of(p)
    runs = druns(p)
    # split into segments at tabs so right/centre tabs can look ahead
    pieces = []            # (run_index, kind, text, sz, sp)
    for i, r in enumerate(runs):
        sz, sp, font, bold = rprops(r)
        for c in r:
            n = etree.QName(c).localname
            if n == 't': pieces.append((i, 't', c.text or '', sz, sp))
            elif n == 'tab': pieces.append((i, 'tab', '\t', sz, sp))
    out = [{'run': i, 'x0': None, 'x1': None} for i in range(len(runs))]
    tabinfo = {}
    k = 0
    while k < len(pieces):
        i, kind, s, sz, sp = pieces[k]
        if kind == 'tab':
            nxt = [t for t in stops if t[0] > x + 1]
            pos, typ = nxt[0] if nxt else ((int(x // 720) + 1) * 720, 'left')
            # segment after this tab
            seg = []
            j = k + 1
            while j < len(pieces) and pieces[j][1] != 'tab':
                seg.append(pieces[j]); j += 1
            segtxt_w = sum(tw(t, z, a) for (_, _, t, z, a) in seg)
            if j >= len(pieces):   # last segment: trailing spaces do not count for alignment
                trail = 0.0
                for (_, _, t, z, a) in reversed(seg):
                    stripped = t.rstrip(' ')
                    trail += tw(t[len(stripped):], z, a)
                    if stripped: break
                segtxt_w -= trail
            if typ == 'right': start = pos - segtxt_w
            elif typ == 'center': start = pos - segtxt_w / 2.0
            else: start = pos
            tabinfo[i] = {'pos': pos, 'type': typ, 'from': x}
            o = out[i]
            o['x0'] = x if o['x0'] is None else o['x0']
            x = max(start, x)
            o['x1'] = x
            k += 1
            continue
        w = tw(s, sz, sp)
        o = out[i]
        if o['x0'] is None: o['x0'] = x
        x += w
        o['x1'] = x
        k += 1
    for i, o in enumerate(out):
        if o['x0'] is None: o['x0'] = o['x1'] = x if i == len(out) - 1 else None
    return out, tabinfo, stops

# ── the field map ────────────────────────────────────────────────────────
# Each field: which paragraph, and what each of its runs becomes.
#   'L'  : pure padding spaces            -> ⟦L<n>:id⟧
#   'LV' : "<spaces><value>" in one run   -> ⟦L<n>:id⟧⟦V:id⟧
#   'V'  : the value                      -> ⟦V:id⟧
#   'x'  : leftover piece of the value    -> run removed
#   'T'  : trailing padding before a tab  -> ⟦T<n>:id⟧
#   'L(' : "<spaces>(" (signature lines)  -> ⟦L<n>:id⟧(
# 'expect_sha' is sha256[:12] of the old value — the build fails if the run map
# no longer lands on it.  (A hash, so the real value is not in the repo.)

def P(idx): return ('idx', idx)

JDA_P1 = [
    dict(id='blackNo',  para=5,  runs={1:'L', 2:'V'}, expect_sha='bc7736e9172d', policy='center'),
    dict(id='blackYear',para=5,  runs={5:'LV'}, expect_sha='eb6cefa1f27a', policy='left'),
    dict(id='redNo',    para=6,  insert_before=1, policy='centerBlank'),
    dict(id='redYear',  para=6,  insert_before=3, policy='left', leftPad=2),
    dict(id='court',    para=7,  runs={1:'L', 2:'V'}, expect_sha='c5622a89e5d4', policy='center'),
    dict(id='day',      para=8,  runs={1:'L', 2:'V'}, expect_sha='41de18c5a4d4', policy='center'),
    dict(id='month',    para=8,  runs={5:'L', 6:'V'}, expect_sha='28c860327643', policy='center'),
    dict(id='year',     para=8,  runs={9:'LV', 10:'x'}, expect_sha='d323164ac8c3', policy='left'),
    dict(id='caseType', para=9,  runs={1:'LV'}, expect_sha='b91683152689', policy='center'),
    dict(id='partyA',   para=10, runs={2:'V', 3:'x', 4:'x'}, expect_sha='1667ab0beb24', policy='none', before='roleA'),
    dict(id='roleA',    para=10, runs={6:'V'}, expect_sha='df45445f07a0', policy='rtab'),
    dict(id='partyB',   para=15, runs={1:'V'}, expect_sha='5e325a6ea078', policy='none', before='roleB'),
    dict(id='roleB',    para=15, runs={3:'V', 4:'x'}, expect_sha='6242bc0e8919', policy='rtab'),
    dict(id='appointer',para=17, runs={1:'L', 2:'V', 3:'x', 4:'x'}, expect_sha='c6aea85c441a', policy='center', before='appointerRole'),
    dict(id='appointerRole', para=17, runs={6:'V', 7:'x', 8:'x'}, expect_sha='966f7ca1f46a', policy='rtab'),
    dict(id='lawyerA',  para=18, runs={1:'L', 2:'V', 3:'x'}, expect_sha='c6aea85c441a', policy='center'),
    dict(id='lawyerB',  para=20, runs={1:'L', 2:'V'}, expect_sha='c6aea85c441a', policy='center'),
    dict(id='appointerSig', para=25, runs={1:'L(', 2:'V', 3:'x', 4:'x', 5:'S'}, expect_sha='c6aea85c441a', policy='center', prefix='(', suffix=')'),
    dict(id='certifier',para=26, runs={0:'P', 1:'V', 2:'S'}, expect_sha='c6aea85c441a', policy='none', prefix='(', suffix=')', box=168.5),
]
PY_P1 = [
    dict(id='blackNo',  para=5,  runs={1:'L', 2:'LV'}, expect_sha='d33e1efe38de', policy='center'),
    dict(id='blackYear',para=5,  runs={5:'L', 6:'V'}, expect_sha='405e80c381af', policy='left'),
    dict(id='redNo',    para=6,  insert_before=1, policy='centerBlank'),
    dict(id='redYear',  para=6,  insert_before=3, policy='left', leftPad=1),
    dict(id='court',    para=7,  runs={1:'L', 2:'L', 3:'L', 4:'L', 5:'L', 6:'V'}, expect_sha='b91683152689', policy='center'),
    dict(id='day',      para=8,  runs={1:'L', 2:'L', 3:'V'}, expect_sha='154c49195a81', policy='center'),
    dict(id='month',    para=8,  runs={6:'L', 7:'L', 8:'LV', 9:'x'}, expect_sha='80c6a57633f0', policy='center'),
    dict(id='year',     para=8,  runs={12:'L', 13:'V', 14:'x'}, expect_sha='405e80c381af', policy='left'),
    dict(id='caseType', para=9,  runs={1:'L', 2:'L', 3:'L', 4:'V'}, expect_sha='b91683152689', policy='center'),
    dict(id='partyA',   para=11, runs={2:'V'}, expect_sha='47dc526aa8cb', policy='none', before='roleA'),
    dict(id='roleA',    para=11, runs={4:'V'}, expect_sha='df45445f07a0', policy='rtab'),
    dict(id='partyB',   para=15, runs={0:'V'}, expect_sha='c7081ba93383', policy='none', before='roleB'),
    dict(id='roleB',    para=15, runs={2:'V', 3:'x'}, expect_sha='6242bc0e8919', policy='rtab'),
    dict(id='appointer',para=17, runs={1:'L', 2:'L', 3:'L', 4:'L', 5:'L', 6:'V', 7:'x'}, expect_sha='9517e734e880', policy='center', before='appointerRole'),
    dict(id='appointerRole', para=17, runs={9:'V'}, expect_sha='f7046692ecce', policy='rtab'),
    dict(id='lawyerA',  para=18, runs={1:'L', 2:'L', 3:'L', 4:'V'}, expect_sha='d25963c3f671', policy='center'),
    dict(id='lawyerB',  para=21, runs={1:'L', 2:'L', 3:'L', 4:'V', 5:'x', 6:'x'}, expect_sha='d25963c3f671', policy='center'),
    dict(id='appointerSig', para=26, runs={1:'P', 2:'V', 3:'x', 4:'S'}, expect_sha='9517e734e880', policy='none', prefix='(', suffix=')'),
    dict(id='certifier',para=27, runs={0:'P', 1:'V', 2:'S'}, expect_sha='d25963c3f671', policy='none', prefix='(', suffix=')', box=168.5),
]
PY_P2 = [
    dict(id='lawyerC',  para=35, runs={2:'L', 3:'L', 4:'V', 5:'x'}, expect_sha='d25963c3f671', policy='center'),
    dict(id='idNo',     para=36, digits=1, expect_sha='5cd98b0862ca'),
    dict(id='licenseNo',para=38, runs={1:'L', 2:'V', 3:'x', 4:'x', 5:'x', 6:'x'}, expect_sha='25953603581a', policy='center'),
    dict(id='phone',    para=42, runs={1:'L', 2:'V'}, expect_sha='fa2f64e6caf2', policy='center'),
    dict(id='email1',   para=43, runs={1:'L', 2:'L', 3:'V', 4:'x', 5:'T'}, expect_sha='84555d0facd8', policy='center', latin=True),
    dict(id='officePhone', para=46, runs={17:'L', 18:'L', 19:'V'}, expect_sha='667058e1321c', policy='left'),
    dict(id='email2',   para=47, runs={5:'L', 6:'LV', 7:'x'}, expect_sha='84555d0facd8', policy='center', latin=True),
    dict(id='client',   para=48, runs={2:'L', 3:'L', 4:'L', 5:'V', 6:'x'}, expect_sha='47dc526aa8cb', policy='center', before='clientRole'),
    dict(id='clientRole', para=48, runs={8:'V'}, expect_sha='df45445f07a0', policy='rtab'),
    dict(id='lawyerD',  para=55, runs={0:'L', 1:'L', 2:'L(', 3:'V', 4:'x', 5:'S'}, expect_sha='d25963c3f671', policy='center', prefix='(', suffix=')'),
]
THAI = str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙')

def mk(tag, fid): return '⟦%s:%s⟧' % (tag, fid)

def set_text(r, s):
    ts = r.findall(q('t'))
    assert len(ts) == 1, ('run must hold exactly one w:t', rtext(r))
    ts[0].text = s
    ts[0].set('{%s}space' % XML_NS, 'preserve')

def only_text(r):
    kinds = set(etree.QName(c).localname for c in r)
    return kinds <= {'rPr', 't'}

def space_w(r):
    sz, sp, _, _ = rprops(r)
    return tw(' ', sz, sp)

def build_fields(tree, fields, page):
    """Inject markers for `fields` into `tree` (in place). Returns spec list."""
    body = tree.getroot().find(q('body'))
    allp = list(body.iter(q('p')))
    specs = []
    # geometry must be read BEFORE any edit to the same paragraph -> layout all first
    geo = {}
    for f in fields:
        p = allp[f['para']]
        if id(p) not in geo: geo[id(p)] = (p, layout(p), druns(p))
    for f in fields:
        p, (lay, tabinfo, stops), runs = geo[id(allp[f['para']])]
        s = dict(id=f['id'], page=page, policy=f.get('policy', 'none'))
        for k in ('prefix', 'suffix', 'before'):
            if k in f: s[k] = f[k]
        left, first = origin_of(p)
        s['origin'] = first
        jc = p.find(q('pPr') + '/' + q('jc'))
        s['jc'] = jc.get(q('val')) if jc is not None else 'left'
        s['left'] = left
        if 'digits' in f:
            r = runs[1]; txt = rtext(r)
            digs = [c for c in txt if c.strip()]
            assert sha12(''.join(digs).translate(str.maketrans('๐๑๒๓๔๕๖๗๘๙', '0123456789'))) == f['expect_sha'], 'ID run moved'
            n = 0; out = ''
            for c in txt:
                if c.strip(): out += mk('D%d' % n, f['id']); n += 1
                else: out += c
            set_text(r, out)
            s.update(kind='digits', n=n, pattern=txt)
            specs.append(s); continue
        if 'insert_before' in f:
            i = f['insert_before']
            ref = runs[i]
            assert rtext(ref) == '\t', ('red-number blank must be a tab run', rtext(ref))
            new = copy.deepcopy(ref)
            for c in list(new):
                if c.tag != q('rPr'): new.remove(c)
            t = etree.SubElement(new, q('t'))
            t.text = mk('L0', f['id']) + mk('V', f['id'])
            t.set('{%s}space' % XML_NS, 'preserve')
            ref.addprevious(new)
            sz, sp, _, _ = rprops(ref)
            x0 = lay[i]['x0']
            stop = tabinfo[i]['pos']
            tc = next((a for a in p.iterancestors() if a.tag == q('tc')), None)
            if tc is not None: stop = min(stop, int(tc.find(q('tcPr') + '/' + q('tcW')).get(q('w'))) - 2 * 108)
            s['u'] = ref.find(q('rPr') + '/' + q('u')) is not None
            s.update(kind='text', x0=x0, lead=[dict(n=0, w=space_w(ref))], trail=[], sz=sz, sp=sp,
                     origLead=0, origStart=x0, origW=0, x1=stop, stopType='left',
                     leftPad=f.get('leftPad', 0), origEnd=x0)
            s['origCenter'] = (x0 + stop) / 2.0
            specs.append(s); continue
        rmap = f['runs']
        idxs = sorted(rmap)
        lead, trail, val_runs = [], [], []
        value = ''
        vfirst = None
        for i in idxs:
            r = runs[i]; kind = rmap[i]; txt = rtext(r)
            assert only_text(r), ('unexpected content in run', f['id'], i, txt)
            if kind == 'L':
                assert txt.strip() == '', (f['id'], i, repr(txt))
                lead.append(dict(n=len(txt), w=space_w(r), run=i))
            elif kind == 'L(':
                assert txt.strip() == '(' and txt.endswith('('), (f['id'], i, repr(txt))
                lead.append(dict(n=len(txt) - 1, w=space_w(r), run=i))
            elif kind == 'LV':
                m = re.match(r'^( *)(.*)$', txt, re.S)
                lead.append(dict(n=len(m.group(1)), w=space_w(r), run=i))
                value += m.group(2); val_runs.append(i); vfirst = i if vfirst is None else vfirst
            elif kind in ('V', 'x'):
                value += txt; val_runs.append(i)
                if kind == 'V': vfirst = i
            elif kind == 'T':
                assert txt.strip() == '', (f['id'], i, repr(txt))
                trail.append(dict(n=len(txt), w=space_w(r), run=i))
            elif kind == 'P': assert txt == '(', (f['id'], i, repr(txt))
            elif kind == 'S': assert txt == ')', (f['id'], i, repr(txt))
        assert sha12(value) == f['expect_sha'], (f['id'], 'the run map no longer points at the old value — re-check run indices')
        vr = runs[vfirst]
        sz, sp, font, bold = rprops(vr)
        s['u'] = vr.find(q('rPr') + '/' + q('u')) is not None
        assert font == 'TH SarabunPSK' and not bold and sz == 34, (f['id'], font, bold, sz)
        # geometry (twips from the paragraph's text-area left edge)
        first_slot = lead[0]['run'] if lead else vfirst
        x0 = lay[first_slot]['x0']
        pre = tw(f.get('prefix', ''), sz, sp)
        suf = tw(f.get('suffix', ''), sz, sp)
        origLead = sum(l['n'] for l in lead)
        if f.get('prefix') and not any(rmap[i] == 'L(' for i in idxs):
            x0 -= pre                      # "(" sits in its own run just before the value
        origStart = x0 + sum(l['n'] * l['w'] for l in lead)
        origW = pre + tw(value, sz, sp) + suf
        last_val = max(val_runs)
        if f.get('suffix'): assert rmap.get(last_val + 1) == 'S', (f['id'], 'suffix run must follow the value')
        vend = origStart + origW
        s.update(kind='text', x0=x0, sz=sz, sp=sp, lead=[dict(n=l['n'], w=l['w']) for l in lead],
                 trail=[dict(n=t['n'], w=t['w']) for t in trail], origLead=origLead,
                 origStart=origStart, origW=origW, origCenter=origStart + origW / 2.0,
                 origEnd=vend + sum(t['n'] * t['w'] for t in trail), orig=value,
                 prefixW=pre, suffixW=suf)
        # what stops the value: the next tab after the value (and its trailing pad)
        after = (trail[-1]['run'] if trail else last_val) + 1
        if f.get('suffix'): after += 1
        nxt = runs[after] if after < len(runs) else None
        if nxt is not None and rtext(nxt) == '\t':
            ti = tabinfo[after]
            s['x1'] = ti['pos']; s['stopType'] = ti['type']
        else:
            s['x1'] = TEXT_W; s['stopType'] = 'margin'
        tc = next((a for a in p.iterancestors() if a.tag == q('tc')), None)
        if tc is not None:
            # a tab stop past the cell's text edge stops at the edge (Normal Table: 108 twips each side)
            tcw = int(tc.find(q('tcPr') + '/' + q('tcW')).get(q('w')))
            s['x1'] = min(s['x1'], tcw - 2 * 108); s['stopType'] = s['stopType'] + '|cell'
        if f.get('box'):
            s['x1'] = f['box'] * 20 - 2 * 144; s['stopType'] = 'textbox'   # 0.1in default inset each side
        if s['policy'] == 'rtab':
            s['x1'] = TEXT_W
        if nxt is not None and rtext(nxt) != '\t' and f.get('policy') == 'left':
            # PY year: "๖๗" + " " + tab — the limit is still that tab
            for j in range(after, len(runs)):
                if rtext(runs[j]) == '\t': s['x1'] = tabinfo[j]['pos']; s['stopType'] = tabinfo[j]['type']; break
        if f.get('latin'): s['latin'] = True
        # rewrite runs
        li = 0; ti_ = 0
        for i in idxs:
            r = runs[i]; kind = rmap[i]
            if kind == 'L': set_text(r, mk('L%d' % li, f['id'])); li += 1
            elif kind == 'L(': set_text(r, mk('L%d' % li, f['id']) + mk('P', f['id'])); li += 1
            elif kind == 'P': set_text(r, mk('P', f['id']))
            elif kind == 'S': set_text(r, mk('S', f['id']))
            elif kind == 'LV': set_text(r, mk('L%d' % li, f['id']) + mk('V', f['id'])); li += 1
            elif kind == 'V': set_text(r, mk('V', f['id']))
            elif kind == 'T': set_text(r, mk('T%d' % ti_, f['id'])); ti_ += 1
            elif kind == 'x': r.getparent().remove(r)
        specs.append(s)
    return specs

def fix_month_label(tree):
    """PY's own file reads 'ดือน' — the printed label is 'เดือน'. Text-only fix inside the same run."""
    body = tree.getroot().find(q('body'))
    p = list(body.iter(q('p')))[8]
    r = druns(p)[5]
    assert rtext(r) == 'ดือน ', rtext(r)
    set_text(r, 'เดือน ')

def page_break_index(body):
    kids = list(body)
    for i, k in enumerate(kids):
        if k.tag == q('p'):
            for br in k.iter(q('br')):
                if br.get(q('type')) == 'page': return i
    raise SystemExit('no page break')

def serialise(tree, orig_bytes):
    decl = orig_bytes[:orig_bytes.index(b'?>') + 2]
    out = etree.tostring(tree, encoding='UTF-8', xml_declaration=False)
    return decl + b'\r\n' + out

def repack(src_docx, dst, doc_xml):
    zin = zipfile.ZipFile(src_docx)
    zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        data = zin.read(it.filename)
        if it.filename == 'word/document.xml': data = doc_xml
        zout.writestr(it, data)
    zout.close()

def check_ids(root):
    """No duplicate bookmark ids / paraIds / VML ids after the transplant."""
    seen = {}
    for e in root.iter():
        for a in ('{%s}id' % WNS,):
            if etree.QName(e).localname in ('bookmarkStart',):
                v = e.get(a); assert v not in seen.setdefault('bm', set()), ('dup bookmark', v); seen['bm'].add(v)
        for a, v in e.attrib.items():
            if a.endswith('}paraId') or a.endswith('}textId') and False:
                assert v not in seen.setdefault('pid', set()), ('dup paraId', v); seen['pid'].add(v)
        if etree.QName(e).namespace == 'urn:schemas-microsoft-com:vml' and e.get('id') and etree.QName(e).localname != 'shapetype':
            v = e.get('id'); assert v not in seen.setdefault('vml', set()), ('dup vml id', v); seen['vml'].add(v)

def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    jda_docx = os.path.join(src_dir, 'jda_word.docx')
    py_docx = os.path.join(src_dir, 'py_word.docx')
    jb = zipfile.ZipFile(jda_docx).read('word/document.xml')
    pb = zipfile.ZipFile(py_docx).read('word/document.xml')

    # PY template: all of the PY file
    py = etree.fromstring(pb).getroottree()
    fix_month_label(py)
    spec_py = build_fields(py, PY_P1, 1) + build_fields(py, PY_P2, 2)

    # JDA template: JDA page 1 + PY page 2 (already marked)
    jda = etree.fromstring(jb).getroottree()
    spec_jda = build_fields(jda, JDA_P1, 1)
    jbody = jda.getroot().find(q('body')); pbody = py.getroot().find(q('body'))
    ji = page_break_index(jbody); pi = page_break_index(pbody)
    jkids = list(jbody); pkids = list(pbody)
    assert jkids[-1].tag == q('sectPr') and pkids[-1].tag == q('sectPr')
    for k in jkids[ji:-1]: jbody.remove(k)
    sect = jkids[-1]
    for k in pkids[pi:-1]: sect.addprevious(copy.deepcopy(k))
    spec_jda += [s for s in spec_py if s['page'] == 2]
    check_ids(jda.getroot()); check_ids(py.getroot())

    for name, tree, orig, src in (('tplJDA', jda, jb, jda_docx), ('tplPY', py, pb, py_docx)):
        xml = serialise(tree, orig)
        repack(src, os.path.join(out_dir, name + '.docx'), xml)
        open(os.path.join(out_dir, name + '.document.xml'), 'wb').write(xml)
    json.dump({'JDA': spec_jda, 'PY': spec_py, 'textW': TEXT_W}, open(os.path.join(out_dir, 'spec.json'), 'w', encoding='utf8'),
              ensure_ascii=False, indent=1)
    print('ok', len(spec_jda), len(spec_py))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else HERE, sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out'))
