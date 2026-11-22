#!/usr/bin/env python3
"""Capture state income tax withholding formulas from the USDA National Finance
Center (NFC) tax map as Markdown reference files, and record what changed.

NFC publishes one withholding formula per state as an HTML bulletin. Bulletin
URLs end in a Unix timestamp of when NFC created the page, so they cannot be
predicted; every run starts from the tax map index.

Output (default data/state-tax/):
  {ST}.md        one file per state: header block, then the bulletin as Markdown
  manifest.json  current URL, reference number, dates and hash per state
  CHANGELOG.md   newest run first: new, changed and delisted states, with diffs

A run that finds nothing new writes nothing. Standard library only.
Exit status: 0 on success, 1 if any page failed (failed states keep their
previous file).
"""

import argparse
import datetime as dt
import difflib
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

INDEX_URL = "https://help.nfc.usda.gov/systems/taxes/"
USER_AGENT = "nfc-tax-refs/1.0 (semiannual reference refresh; python-urllib)"
MIN_STATES = 30  # fewer means the index layout changed; stop rather than delist
CHANGELOG_TITLE = "# NFC state tax reference changes\n\n"

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "source", "track", "wbr"}
SKIP = {"script", "style", "noscript", "nav", "svg", "button", "form"}
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BLOCK = HEADINGS | {"address", "article", "aside", "blockquote", "dd", "div",
                    "dl", "dt", "figure", "hr", "li", "main", "ol", "p", "pre",
                    "section", "table", "tbody", "td", "tfoot", "th", "thead",
                    "tr", "ul", "header", "footer"}
BR = " "  # survives whitespace collapsing; becomes a newline


# ---------------------------------------------------------------- HTML tree

class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs=None, parent=None):
        self.tag = tag
        self.attrs = {k: (v or "") for k, v in (attrs or [])}
        self.children = []
        self.parent = parent


class _TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        node = self.cur
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:  # stray end tags are ignored
            self.cur = node.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(html):
    builder = _TreeBuilder()
    builder.feed(html)
    builder.close()
    return builder.root


def descendants(node):
    for child in node.children:
        if isinstance(child, Node):
            yield child
            yield from descendants(child)


def find(node, tag):
    return next((n for n in descendants(node) if n.tag == tag), None)


def text_of(node):
    """Plain text, with spaces at block and <br> boundaries."""
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        elif child.tag == "br":
            parts.append(" ")
        elif child.tag not in SKIP:
            inner = text_of(child)
            parts.append(f" {inner} " if child.tag in BLOCK else inner)
    return "".join(parts)


def squash(text):
    text = re.sub(r"[ \t\r\n\f\v\xa0]+", " ", text)
    return "\n".join(line.strip() for line in text.split(BR)).strip()


# ---------------------------------------------------------- HTML -> Markdown

def render_inline(node, base):
    if isinstance(node, str):
        return node
    tag = node.tag
    if tag in SKIP:
        return ""
    if tag == "br":
        return BR
    if tag == "img":
        return node.attrs.get("alt", "")
    inner = "".join(render_inline(c, base) for c in node.children)
    if tag == "a" and node.attrs.get("href") and inner.strip():
        return f"[{inner.strip()}]({urljoin(base, node.attrs['href'])})"
    wrap = {"strong": "**", "b": "**", "em": "*", "i": "*", "code": "`"}.get(tag)
    if wrap and inner.strip():
        lead = inner[: len(inner) - len(inner.lstrip())]
        trail = inner[len(inner.rstrip()):]
        return f"{lead}{wrap}{inner.strip()}{wrap}{trail}"
    return inner


def render_blocks(node, base):
    """Render a node's children as a list of Markdown blocks."""
    blocks, inline, ol_next = [], [], 1

    def flush():
        text = squash("".join(inline))
        inline.clear()
        if text:
            blocks.append(text)

    for child in node.children:
        if isinstance(child, str):
            inline.append(child)
            continue
        tag = child.tag
        if tag in SKIP:
            continue
        if tag not in BLOCK:
            inline.append(render_inline(child, base))
            continue
        flush()
        if tag in HEADINGS:
            text = squash(render_inline(child, base)).replace("\n", " ")
            if text:
                blocks.append("#" * int(tag[1]) + " " + text)
            if int(tag[1]) <= 3:  # h4+ are table captions inside a step list
                ol_next = 1  # step numbering restarts at each section heading
        elif tag in ("ol", "ul"):
            start = int(child.attrs.get("start") or ol_next)
            text, count = render_list(child, base, ordered=tag == "ol", start=start)
            if text:
                blocks.append(text)
            if tag == "ol":
                ol_next = start + count  # NFC splits one step list across <ol>s
        elif tag == "table":
            text = render_table(child, base)
            if text:
                blocks.append(text)
        elif tag == "hr":
            blocks.append("---")
        else:
            blocks.extend(render_blocks(child, base))
    flush()
    return blocks


def render_list(node, base, ordered, start):
    items = [c for c in node.children if isinstance(c, Node) and c.tag == "li"]
    style = " ".join(node.attrs.get(k, "") for k in ("class", "type", "style")).lower()
    # NFC's top-level steps use class="AlphaNumeric" and are numbered; only
    # LowerAlpha/UpperAlpha (or list-style: lower-alpha, type="a") are lettered.
    lettered = re.search(r"(lower|upper)[-_]?alpha", style) or re.search(r"(^|\s)a(\s|$)", style)
    out = []
    for i, item in enumerate(items):
        if not ordered:
            marker = "-"
        elif lettered:
            marker = f"{chr(ord('a') + (start + i - 1) % 26)}."
        else:
            marker = f"{start + i}."
        lines = "\n\n".join(render_blocks(item, base)).split("\n")
        pad = " " * (len(marker) + 1)
        body = [f"{marker} {lines[0]}"] + [pad + l if l else "" for l in lines[1:]]
        out.append("\n".join(body))
    loose = any("\n\n" in item for item in out)  # items holding tables or sublists
    return ("\n\n" if loose else "\n").join(out), len(items)


def table_rows(node):
    rows = []
    for child in node.children:
        if isinstance(child, Node):
            if child.tag == "tr":
                rows.append(child)
            elif child.tag != "table":
                rows.extend(table_rows(child))
    return rows


def render_table(node, base):
    rows, header_is_th = [], False
    for index, tr in enumerate(table_rows(node)):
        cells = []
        for cell in tr.children:
            if isinstance(cell, Node) and cell.tag in ("td", "th"):
                text = " ".join(render_blocks(cell, base))
                text = text.replace("\n", "<br>").replace("|", "\\|")
                cells.append(text)
                span = int(cell.attrs.get("colspan") or 1)
                cells.extend([""] * (span - 1))
                if index == 0 and cell.tag == "th":
                    header_is_th = True
        if any(cells):
            rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    header = rows.pop(0) if header_is_th else [""] * width

    def line(cells):
        return "| " + " | ".join(cells) + " |"

    return "\n".join([line(header), "|" + "---|" * width] + [line(r) for r in rows])


# ------------------------------------------------------------- NFC specifics

def parse_index(html, base=INDEX_URL):
    """Return [{state, label, url}] from the tax map's per-state blocks."""
    entries, seen = [], set()
    for div in descendants(parse(html)):
        match = re.fullmatch(r"([a-z]{2})\d*_taxes", div.attrs.get("id", "")) \
            if div.tag == "div" else None
        if not match:
            continue
        for a in descendants(div):
            if a.tag != "a" or not a.attrs.get("href"):
                continue
            url = urljoin(base, a.attrs["href"])
            if url not in seen:
                seen.add(url)
                entries.append({"state": match.group(1).upper(),
                                "label": squash(text_of(a)), "url": url})
    return entries


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def select(entries, include_local):
    """One state-level bulletin per state; local bulletins only on request."""
    by_state = {}
    for entry in entries:
        by_state.setdefault(entry["state"], []).append(entry)
    chosen, warnings = [], []
    for state, links in sorted(by_state.items()):
        state_level = [e for e in links if re.search(r"\bState\b", e["label"])]
        if not state_level and len(links) == 1:  # e.g. "District of Columbia"
            state_level = links
        if not state_level:
            warnings.append(f"{state}: no state-level bulletin among "
                            + ", ".join(e["label"] for e in links))
        elif len(state_level) > 1:
            warnings.append(f"{state}: several state-level bulletins; using "
                            f"'{state_level[0]['label']}'")
        primary = state_level[0] if state_level else None
        if primary:
            chosen.append({**primary, "key": state})
        if include_local:
            chosen += [{**e, "key": f"{state}-{slug(e['label'])}"}
                       for e in links if e is not primary]
    return chosen, warnings


def bulletin_to_markdown(html, url, key, label):
    root = parse(html)
    metas = [n.attrs.get("content", "") for n in descendants(root) if n.tag == "meta"]
    formula = next((m for m in metas if re.match(r"(?i)alltax\b", m.strip())), "")
    body = find(root, "main") or find(root, "body") or root
    text = squash(text_of(body))

    def grab(pattern):
        found = re.search(pattern, text)
        return found.group(1).strip() if found else ""

    h1 = find(body, "h1")
    title_tag = find(root, "title")
    info = {
        "key": key,
        "label": label,
        "title": squash(text_of(h1 or title_tag)) if (h1 or title_tag) else label,
        "source": url,
        "reference": grab(r"Reference Number:\s*(NFC-[\w-]+)"),
        "published": grab(r"Published:\s*([A-Z][a-z]+\.? \d{1,2}, \d{4})"),
        "effective": grab(r"Effective:\s*(Pay Period \d+,? \d{4})"),
        "formula_id": re.sub(r"\s+", " ", formula.strip()).upper(),
        "previous_bulletin": next(
            (urljoin(url, a.attrs["href"]) for a in descendants(body)
             if a.tag == "a" and a.attrs.get("href")
             and "previous" in text_of(a).lower()), ""),
    }

    blocks = render_blocks(body, url)
    for i, block in enumerate(blocks):  # contact and navigation boilerplate
        if re.match(r"#+ (Resources|Inquiries)\b", block):
            blocks = blocks[:i]
            break
    if not blocks:
        raise ValueError("no content found; page layout may have changed")
    if not any(b.startswith("|") for b in blocks):
        print(f"note: {key} has no tables; check the formula by hand",
              file=sys.stderr)

    header = ["---"] + [f"{k}: {v}" for k, v in info.items() if v and k != "label"] + ["---"]
    return "\n".join(header) + "\n\n" + "\n\n".join(blocks) + "\n", info


# ------------------------------------------------------------------- runner

def fetch_url(url, attempts=3):
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=30) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(2 * 2 ** attempt)


def write_if_changed(path, text):
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def changelog_entry(day, changes, delisted, old):
    new = [c for c in changes if c["status"] == "new"]
    changed = [c for c in changes if c["status"] == "changed"]
    lines = [f"## {day}", ""]
    if changed:
        lines.append(f"Changed: {', '.join(c['key'] for c in changed)}")
    if new:
        lines.append(f"New: {', '.join(c['key'] for c in new)}")
    if delisted:
        lines.append(f"No longer listed (file kept): {', '.join(delisted)}")
    lines.append("")

    for c in changed:
        before, after = old.get(c["key"], {}), c["info"]
        lines += [f"### {c['key']} — {after['title']}", ""]
        for field in ("reference", "published", "effective", "formula_id"):
            if before.get(field, "") != after.get(field, ""):
                lines.append(f"- {field}: {before.get(field) or '—'} → "
                             f"{after.get(field) or '—'}")
        lines.append(f"- source: {after['source']}")
        diff = difflib.unified_diff(
            c["before"].splitlines(), c["after"].splitlines(),
            f"{c['key']}.md (previous)", f"{c['key']}.md", lineterm="", n=2)
        lines += ["", "<details><summary>Diff</summary>", "", "```diff",
                  *diff, "```", "", "</details>", ""]

    if new:
        lines += ["| Key | Title | Reference | Effective |", "|---|---|---|---|"]
        lines += [f"| {c['key']} | {c['info']['title']} | {c['info']['reference'] or '—'} "
                  f"| {c['info']['effective'] or '—'} |" for c in new]
        lines.append("")
    return "\n".join(lines) + "\n"


def run(out_dir, include_local=False, delay=1.0, fetch=fetch_url, today=None):
    """Returns (summary_markdown_or_None, error_list)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    old = {}
    if manifest_path.exists():
        old = json.loads(manifest_path.read_text(encoding="utf-8")).get("jurisdictions", {})

    entries, warnings = select(parse_index(fetch(INDEX_URL)), include_local)
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if len({e["state"] for e in entries}) < MIN_STATES:
        raise SystemExit(f"index yielded {len(entries)} bulletins; expected "
                         f"{MIN_STATES}+ states. Layout changed? Nothing written.")

    current, changes, errors = {}, [], []
    for i, entry in enumerate(entries):
        if i:
            time.sleep(delay)
        key, path = entry["key"], out_dir / f"{entry['key']}.md"
        try:
            markdown, info = bulletin_to_markdown(
                fetch(entry["url"]), entry["url"], key, entry["label"])
        except Exception as exc:  # one bad page must not sink the run
            errors.append(f"{key} {entry['url']}: {exc}")
            if key in old:
                current[key] = old[key]
            continue
        before = path.read_text(encoding="utf-8") if path.exists() else None
        if before != markdown:
            path.write_text(markdown, encoding="utf-8", newline="\n")
            changes.append({"key": key, "info": info, "before": before or "",
                            "after": markdown,
                            "status": "new" if before is None else "changed"})
        info["sha256"] = hashlib.sha256(markdown.encode()).hexdigest()
        info["file"] = path.name
        current[key] = info

    delisted = sorted(set(old) - set(current))
    manifest = {"source": INDEX_URL, "jurisdictions": dict(sorted(current.items()))}
    write_if_changed(manifest_path, json.dumps(manifest, indent=2) + "\n")

    if not changes and not delisted:
        return None, errors
    entry = changelog_entry(today or dt.date.today().isoformat(), changes, delisted, old)
    log = out_dir / "CHANGELOG.md"
    rest = log.read_text(encoding="utf-8") if log.exists() else CHANGELOG_TITLE
    rest = rest[len(CHANGELOG_TITLE):] if rest.startswith(CHANGELOG_TITLE) else rest
    log.write_text(CHANGELOG_TITLE + entry + ("\n" + rest if rest.strip() else ""),
                   encoding="utf-8", newline="\n")
    return entry, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=Path("data/state-tax"),
                        help="output folder (default: data/state-tax)")
    parser.add_argument("--include-local", action="store_true",
                        help="also capture city, county and transit bulletins")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="seconds between page requests (default: 1)")
    parser.add_argument("--summary", type=Path,
                        help="write this run's changelog entry here (for a PR body)")
    args = parser.parse_args()

    summary, errors = run(args.out, args.include_local, args.delay)
    for error in errors:
        print(f"error: {error}", file=sys.stderr)
    print(summary or "No changes.")
    if args.summary and summary:
        args.summary.write_text(summary[:60000], encoding="utf-8")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
