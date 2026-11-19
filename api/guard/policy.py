"""Quais rotas pedem a prova do navegador e quanto corpo cada uma aceita. Puro, sem Flask.

Pede a prova tudo o que exige login: o painel do blog e os dois utilitários. Por PREFIXO, de
propósito: rota nova do painel já nasce protegida, sem ninguém lembrar de cadastrá-la aqui.

Não pede:
- a leitura pública (posts, imagens, vídeo, `/api/data`): o leitor do blog nem carrega o Firebase,
  e a tag `<video>` não tem como mandar cabeçalho;
- o agendador (`/api/blog/tick`) e o `/api/refresh`: não são navegador, e cada um tem chave própria.
"""
from __future__ import annotations

PROTECTED_PREFIXES = ("/api/blog/admin/", "/api/planner/", "/api/pension/")

#: o LinkedIn redireciona o navegador para cá depois da autorização: não há como pôr cabeçalho.
#: Quem autoriza é o `state` de uso único, que só existe porque um admin logado pediu a conexão.
WITHOUT_PROOF = frozenset({"/api/blog/admin/linkedin/callback"})

KB = 1024
MB = 1024 * KB

#: os planos são algumas dezenas de números; o maior de verdade fica abaixo de 4 KB
PLAN_BODY = 32 * KB
#: a rota de upload recusa acima de 12 MB com mensagem própria; a folga é do envelope multipart
UPLOAD_BODY = 13 * MB
#: post bilíngue inteiro, com folga
DEFAULT_BODY = 1 * MB


def needs_proof(path: str, method: str) -> bool:
    # o navegador não manda cabeçalho próprio no preflight: recusar ali quebraria toda chamada direta do painel
    if method.upper() == "OPTIONS" or path in WITHOUT_PROOF:
        return False
    return path.startswith(PROTECTED_PREFIXES)


def max_body(path: str) -> int:
    """Teto do corpo da requisição, em bytes."""
    if path.startswith(("/api/planner/", "/api/pension/")):
        return PLAN_BODY
    if path == "/api/blog/admin/media/upload":
        return UPLOAD_BODY
    return DEFAULT_BODY
