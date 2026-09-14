"""O currículo do Rodrigo como material de apoio para a IA.

Quando a pesquisa na web está desligada, é DAQUI que o post tira lastro: em vez de
o modelo escrever de memória sobre um tema genérico, ele escreve a partir de uma
carreira concreta — empresas, times, números, decisões. É o que diferencia um post
assinado de um texto que qualquer um poderia ter gerado.

A fonte é o mesmo `api/i18n/pt.json` que alimenta o site: o currículo do post nunca
diverge do currículo que o visitante lê.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

I18N_FILE = Path(__file__).resolve().parent.parent / "i18n" / "pt.json"
MAX_CHARS = 7000
MAX_JOBS = 8
#: descrição de vaga tem ~500 caracteres; cortar mantém as 8 experiências E a formação
MAX_JOB_CHARS = 320


@lru_cache(maxsize=1)
def career_context() -> str:
    """Resumo da carreira em texto corrido, pronto para entrar no prompt."""
    try:
        data = json.loads(I18N_FILE.read_text(encoding="utf-8"))
    except Exception:
        return ""

    partes: list[str] = []

    lead = (data.get("about") or {}).get("lead") or ""
    if lead:
        partes.append(f"RESUMO\n{lead}")

    pills = (data.get("about") or {}).get("pills") or []
    if pills:
        nomes = [p if isinstance(p, str) else str(p.get("label") or p.get("name") or "") for p in pills]
        partes.append("COMPETÊNCIAS\n" + ", ".join(n for n in nomes if n))

    cursos = (data.get("education") or {}).get("items") or []
    if cursos:
        linhas = [" — ".join(x for x in (c.get("degree") or c.get("course") or c.get("title"),
                                         c.get("institution") or c.get("school"),
                                         c.get("period")) if x) for c in cursos]
        partes.append("FORMAÇÃO\n" + "\n".join(f"- {l}" for l in linhas if l.strip(" —")))

    jobs = (data.get("experience") or {}).get("items") or []
    if jobs:
        linhas = []
        for job in jobs[:MAX_JOBS]:
            cabeca = " — ".join(x for x in (job.get("role"), job.get("company"), job.get("period")) if x)
            descricao = (job.get("description") or "").strip()[:MAX_JOB_CHARS]
            linhas.append(f"- {cabeca}\n  {descricao}" if descricao else f"- {cabeca}")
        partes.append("EXPERIÊNCIA (da mais recente para a mais antiga)\n" + "\n".join(linhas))

    return "\n\n".join(partes)[:MAX_CHARS]
