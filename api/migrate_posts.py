#!/usr/bin/env python3
"""Leva os posts do antigo web/public/blog/posts.json para o Firestore, uma vez só.

O corpo antigo era HTML (`<h3>`/`<p>`); o novo são seções. A conversão é boba de
propósito: `<h3>` vira `heading`, `<p>` vira parágrafo, o resto da marcação some.
Qualquer coisa mais esperta aqui seria manutenção para um script de uso único.

    GOOGLE_CLOUD_PROJECT=rodrigo-matheus python migrate_posts.py [--dry]
"""
import json
import re
import sys
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

from blog import store

POSTS_JSON = Path(__file__).resolve().parents[1] / "web/public/blog/posts.json"


def html_to_sections(html: str) -> list[dict]:
    """`<h3>` abre seção; `<p>` vira parágrafo. Tags inline são removidas."""
    sections: list[dict] = []
    current = {"heading": "", "paragraphs": []}
    for tag, inner in re.findall(r"<(h[1-6]|p)[^>]*>(.*?)</\1>", html or "", re.S | re.I):
        text = unescape(re.sub(r"<[^>]+>", "", inner)).strip()
        if not text:
            continue
        if tag.lower().startswith("h"):
            if current["paragraphs"]:
                sections.append(current)
            current = {"heading": text, "paragraphs": []}
        else:
            current["paragraphs"].append(text)
    if current["paragraphs"]:
        sections.append(current)
    return sections


def main() -> int:
    dry = "--dry" in sys.argv
    if not POSTS_JSON.exists():
        print(f"nada a migrar: {POSTS_JSON} não existe")
        return 0

    old = json.loads(POSTS_JSON.read_text())
    existentes = {p.get("slug", "").rsplit("-", 1)[0] for p in (store.list_posts() if not dry else [])}

    for item in old:
        base = item["slug"]
        if base in existentes:
            print(f"· {base}: já está no Firestore, pulando")
            continue

        i18n = {}
        for lang in ("pt", "en"):
            copy = item["i18n"].get(lang) or item["i18n"].get("en") or {}
            i18n[lang] = {
                "title": copy.get("title", ""),
                "excerpt": copy.get("summary", ""),
                "sections": html_to_sections(copy.get("body", "")),
            }

        when = datetime.fromisoformat(item["date"]).replace(tzinfo=timezone.utc)
        secoes = {l: len(i18n[l]["sections"]) for l in i18n}
        print(f"· {base}: {secoes} seções" + (" (dry-run)" if dry else ""))
        if dry:
            continue

        post = store.create_post(
            {"slugBase": base, "tags": item.get("tags", []), "i18n": i18n, "topic": "migrado da v2"},
            now=when,
        )
        store.publish_post(post["id"], now=when)

    print("pronto.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
