#!/usr/bin/env python3
"""pixdiff.py <a.pdf> <b.pdf> <outprefix>
Rasterise both PDFs (pdftoppm, 100 dpi), report per page how many pixels differ
and the bounding box of the difference, and write a side-by-side image of every
page that differs (red = only in a, blue = only in b)."""
import os, subprocess, sys, glob
from PIL import Image, ImageChops

a, b, pre = sys.argv[1:4]
for src, tag in ((a, 'A'), (b, 'B')):
    subprocess.run(['pdftoppm', '-r', '100', '-png', src, pre + tag], check=True)
pa = sorted(glob.glob(pre + 'A-*.png')); pb = sorted(glob.glob(pre + 'B-*.png'))
print('pages', len(pa), len(pb))
for i in range(max(len(pa), len(pb))):
    if i >= len(pa) or i >= len(pb):
        print('page %d: only in %s' % (i + 1, 'A' if i < len(pa) else 'B')); continue
    A = Image.open(pa[i]).convert('L'); B = Image.open(pb[i]).convert('L')
    if A.size != B.size: print('page %d: size differs' % (i + 1)); continue
    d = ImageChops.difference(A, B).point(lambda v: 255 if v > 40 else 0)
    box = d.getbbox()
    n = sum(1 for v in d.getdata() if v)
    print('page %d: %s' % (i + 1, 'identical' if not box else '%d px differ in %s' % (n, box)))
    if box:
        rgb = Image.merge('RGB', (A, B, B))   # red where A is dark and B light, cyan the other way
        over = Image.new('RGB', (A.width * 2 + 10, A.height), 'gray')
        over.paste(A.convert('RGB'), (0, 0)); over.paste(rgb, (A.width + 10, 0))
        over.save('%sdiff-%d.png' % (pre, i + 1))
