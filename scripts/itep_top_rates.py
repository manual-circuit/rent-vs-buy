#!/usr/bin/env python3
"""Print the ITEP state tax rate workbook's top personal income tax rate for one year as JSON.

ITEP publishes "State Tax Rate Historical Data" as an .xlsx
(https://itep.org/historical-state-tax-rate-data/). This reads its PIT_history sheet with the
standard library only (an .xlsx is a zip of XML), so a file downloaded from the web never reaches
a spreadsheet library with known parser advisories. Output:

    {"year": 2026, "rows": [["Alabama", 0.05], ["District of Columbia", 0.1075], ...]}

consumed by scripts/cross-check-sources.ts. Usage:

    python3 scripts/itep_top_rates.py FILE.xlsx [--year 2026] [--sheet PIT_history]
"""

import argparse
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG = "{http://schemas.openxmlformats.org/package/2006/relationships}"
MAX_UNCOMPRESSED = 200 * 1024 * 1024


def column(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(MAIN + "t")) for si in root.iter(MAIN + "si")]


def sheet_path(archive, name):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rid = next(
        (s.get(REL + "id") for s in workbook.iter(MAIN + "sheet") if s.get("name") == name), None
    )
    if rid is None:
        raise SystemExit(f"sheet {name!r} not found")
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels.iter(PKG + "Relationship") if r.get("Id") == rid)
    return target.lstrip("/") if target.startswith("/") else "xl/" + target


def read_rows(archive, path, strings):
    for _, row in ET.iterparse(archive.open(path), events=("end",)):
        if row.tag != MAIN + "row":
            continue
        cells = {}
        for c in row.iter(MAIN + "c"):
            v = c.find(MAIN + "v")
            kind = c.get("t")
            if kind == "inlineStr":
                cells[column(c.get("r"))] = "".join(t.text or "" for t in c.iter(MAIN + "t"))
            elif v is None or v.text is None:
                continue
            elif kind == "s":
                cells[column(c.get("r"))] = strings[int(v.text)]
            elif kind in ("str", "e", "b"):
                cells[column(c.get("r"))] = v.text
            else:
                try:
                    cells[column(c.get("r"))] = float(v.text)
                except ValueError:
                    pass
        yield cells
        row.clear()


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("file")
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--sheet", default="PIT_history")
    args = parser.parse_args()

    with zipfile.ZipFile(args.file) as archive:
        if sum(i.file_size for i in archive.infolist()) > MAX_UNCOMPRESSED:
            raise SystemExit("workbook is unexpectedly large; refusing to read it")
        strings = shared_strings(archive)
        header_col, out = None, []
        for cells in read_rows(archive, sheet_path(archive, args.sheet), strings):
            if header_col is None:
                header_col = next((k for k, v in cells.items() if v == args.year), None)
                continue
            name, value = cells.get(0), cells.get(header_col)
            if isinstance(name, str) and name.strip() and isinstance(value, float):
                out.append([name.strip(), value])
    if header_col is None:
        raise SystemExit(f"year {args.year} not found in the {args.sheet} header")
    json.dump({"year": args.year, "rows": out}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
