#!/usr/bin/env python3
"""Read the Revenue Department's blank อ.ส.4 and write fieldmap.json for os4-engine.js.

    python3 build_fieldmap.py            # assets/OS4_150861.pdf → fieldmap.json

The engine never parses the PDF. It appends an incremental update to the RD's
file — new versions of the widgets it fills, their appearance streams, one font
and a cross-reference stream pointing back at the RD's own — so the RD's bytes,
fields and scripts stay exactly as published. Everything that update needs to
know about the file is read here, once:

- per text field: its object number, its dictionary as it stands (to be written
  again with /V and /AP added), its rectangle, the font size and colour from its
  /DA (0 = auto size), its alignment (/Q), /MaxLen, whether it is a comb, and the
  number format its own AFNumber_Format script applies (so the appearance shows
  what Acrobat would show);
- per radio group: the parent (which takes /V) and each kid with its on-state;
- the trailer: the previous xref offset, /Size, /Root, /Info and /ID.

pypdf reads the object streams; each dictionary is written back with pypdf's own
serialiser — the same objects, only the syntax re-spelt.
"""
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import pypdf
from pypdf.generic import DictionaryObject, IndirectObject, NameObject

HERE = Path(__file__).resolve().parent
SRC = HERE / "assets" / "OS4_150861.pdf"
OUT = HERE / "fieldmap.json"
URL = "https://www.rd.go.th/fileadmin/tax_pdf/SD/OS4_150861.pdf"
COMB = 1 << 24


def ser(obj) -> str:
    s = io.BytesIO()
    obj.write_to_stream(s)
    text = s.getvalue().decode("latin-1")
    assert all(ord(c) < 128 for c in text), "serialised dictionary is not ASCII"
    return text


def open_dict(d, drop) -> str:
    """The dictionary without the keys the engine writes, and without its closing >>."""
    d = DictionaryObject({NameObject(k): d.raw_get(k) for k in d.keys() if k not in drop})
    text = ser(d).rstrip()
    assert text.endswith(">>")
    return text[:-2].rstrip()


def full_name(o) -> str:
    parts, node = [], o
    while node is not None:
        t = node.get("/T")
        if t is not None:
            parts.append(str(t))
        p = node.get("/Parent")
        node = p.get_object() if p is not None else None
    return ".".join(reversed(parts))


def inherited(o, key):
    node = o
    while node is not None:
        if key in node:
            return node[key]
        p = node.get("/Parent")
        node = p.get_object() if p is not None else None
    return None


def js(action) -> str:
    if action is None:
        return ""
    code = action.get_object().get("/JS")
    if code is None:
        return ""
    code = code.get_object()
    return code.get_data().decode("utf-8", "replace") if hasattr(code, "get_data") else str(code)


def main() -> None:
    data = SRC.read_bytes()
    reader = pypdf.PdfReader(io.BytesIO(data))
    trailer = reader.trailer
    startxref = int(re.findall(rb"startxref\s+(\d+)", data)[-1])
    root = trailer.raw_get("/Root")
    info = trailer.raw_get("/Info") if "/Info" in trailer else None
    ids = [bytes(x.original_bytes).hex() for x in trailer["/ID"]]
    page_ref = reader.pages[0].indirect_reference

    fields, radios = {}, {}
    for ref in reader.pages[0]["/Annots"]:
        o = ref.get_object()
        if o.get("/Subtype") != "/Widget":
            continue
        name = full_name(o)
        ft = inherited(o, "/FT")
        if name.startswith("Radio"):
            par_ref = o.raw_get("/Parent")
            par = par_ref.get_object()
            g = radios.setdefault(name, {"obj": par_ref.idnum, "dict": open_dict(par, {"/V"}), "kids": []})
            states = [k[1:] for k in o["/AP"]["/N"].keys() if k != "/Off"]
            assert len(states) == 1
            on = o["/AP"]["/N"].raw_get("/" + states[0])
            box = [float(x) for x in on.get_object()["/BBox"]]
            rect = [round(float(x), 3) for x in o["/Rect"]]
            assert abs((box[2] - box[0]) - (rect[2] - rect[0])) < 0.01 and abs((box[3] - box[1]) - (rect[3] - rect[1])) < 0.01
            g["kids"].append({"obj": ref.idnum, "dict": open_dict(o, {"/AS"}), "state": states[0],
                              "rect": rect, "on": on.idnum})
            continue
        if ft != "/Tx":
            continue                    # Button1 — the RD's "clear" button, never touched
        da = str(inherited(o, "/DA"))
        m = re.match(r"/(\S+)\s+([\d.]+)\s+Tf\s+(.*)$", da.strip())
        assert m, da
        ff = int(inherited(o, "/Ff") or 0)
        aa = o.get("/AA") or {}
        fmt = js(aa.get("/F")) if aa else ""
        key = js(aa.get("/K")) if aa else ""
        number = None
        mf = re.match(r"AFNumber_Format\((\d+),", fmt)
        if mf:
            number = {"dec": int(mf.group(1))}
        mask = None
        mk = re.match(r'AFSpecial_KeystrokeEx\("([^"]+)"\)', key)
        if mk:
            mask = mk.group(1)
        assert "/AP" not in o and "/V" not in o, name
        fields[name] = {
            "obj": ref.idnum,
            "dict": open_dict(o, {"/V", "/AP", "/AS"}),
            "rect": [round(float(x), 3) for x in o["/Rect"]],
            "size": float(m.group(2)),
            "color": m.group(3).strip(),
            "q": int(inherited(o, "/Q") or 0),
            "maxLen": int(inherited(o, "/MaxLen")) if inherited(o, "/MaxLen") is not None else None,
            "comb": bool(ff & COMB),
            "number": number,
            "mask": mask,
        }
        assert o.raw_get("/P").idnum == page_ref.idnum

    # For a flattened ("print-ready") file: the page written again with one more content stream and
    # the fields gone, and the catalog without its AcroForm. Resources are inline on this page.
    page = reader.pages[0].get_object()
    assert page.raw_get("/Resources").__class__.__name__ == "DictionaryObject"
    res = page["/Resources"]
    entries = lambda d: open_dict(d, set())[2:].strip()                   # "<<" dropped: the entries only
    catalog = trailer.raw_get("/Root").get_object()
    flatten = {
        "page": page_ref.idnum,
        "pageDict": open_dict(page, {"/Contents", "/Annots", "/Resources"}),
        "contents": [c.idnum for c in page.raw_get("/Contents")],
        "resources": open_dict(res, {"/Font", "/XObject"})[2:].strip(),
        "fonts": entries(res["/Font"]),
        "xobjects": entries(res["/XObject"]),
        "catalogDict": open_dict(catalog, {"/AcroForm"}),
    }

    out = {
        "source": {"file": SRC.name, "url": URL, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)},
        "pdf": {
            "prevXref": startxref,
            "size": int(trailer["/Size"]),
            "root": root.idnum,
            "info": info.idnum if isinstance(info, IndirectObject) else None,
            "id": ids,
            "endsWithEOL": data.endswith(b"\n"),
        },
        "fields": dict(sorted(fields.items(), key=lambda kv: (-kv[1]["rect"][3], kv[1]["rect"][0]))),
        "radios": radios,
        "flatten": flatten,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(fields)} text fields, {len(radios)} radio groups → {OUT.name}")


if __name__ == "__main__":
    sys.exit(main())
