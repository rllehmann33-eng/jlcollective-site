#!/usr/bin/env python3
"""build.py — expands src/*.src.html into the site's root HTML files.

Each source file starts with a meta block:

    <!--meta
    out: index.html
    title: JL Collective · ...
    description: ...
    url: https://thejlcollective.com/
    ogalt: ...
    revised: 14 October 2026
    -->

Tokens in the body ({{HEAD}}, {{HEADER}}, {{FOOTER}}, {{SEAL}}, {{SEAL_SMALL}}) expand to the
files in src/partials/; any other {{NAME}} expands to the meta value `name`. Partials may use
tokens too. Run by hand before a commit; the outputs are committed. No bundler, no framework.
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
PARTIALS = {p.stem.upper(): p.read_text(encoding="utf-8") for p in (SRC / "partials").glob("*.html")}
TOKEN = re.compile(r"\{\{([A-Z_]+)\}\}")


def build(src: pathlib.Path) -> None:
    text = src.read_text(encoding="utf-8")
    m = re.match(r"<!--meta\n(.*?)\n-->\n", text, re.S)
    if not m:
        sys.exit(f"{src.name}: missing <!--meta ... --> block")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip().lower()] = v.strip()
    out = text[m.end():]
    for _ in range(4):  # partials nest at most a few levels
        out, n = TOKEN.subn(lambda mm: PARTIALS.get(mm.group(1), meta.get(mm.group(1).lower(), mm.group(0))), out)
        if n == 0:
            break
    left = TOKEN.findall(out)
    if left:
        sys.exit(f"{src.name}: unexpanded tokens {sorted(set(left))}")
    dest = ROOT / meta["out"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding="utf-8")
    print(f"built {dest.relative_to(ROOT)}  {len(out.encode('utf-8'))} bytes")


if __name__ == "__main__":
    targets = [SRC / a for a in sys.argv[1:]] or sorted(SRC.glob("*.src.html"))
    for t in targets:
        build(t)
