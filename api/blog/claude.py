"""Claude (API da Anthropic) como motor de texto e visão do blog.

Mesma assinatura de uso que o Gemini tinha em `gemini._call`: prompt, sistema, schema,
imagens → um dict. O JSON estruturado vem de uma FERRAMENTA obrigatória (`tool_choice`),
que é como a API garante que a saída respeita o schema. Imagem de capa continua no Gemini:
o Claude não gera imagem.
"""
from __future__ import annotations

import base64
import os
from typing import Any

import requests

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
#: chave de usuário (sk-ant-usr-…) não pertence a um workspace; a API exige dizer qual
WORKSPACE_ID = os.environ.get("ANTHROPIC_WORKSPACE_ID", "")
URL = "https://api.anthropic.com/v1/messages"
VERSION = "2023-06-01"
TEXT_MODEL = os.environ.get("BLOG_CLAUDE_TEXT_MODEL", "claude-sonnet-5")
#: conferir fato e olhar imagem: mesmo modelo forte por padrão
CHECK_MODEL = os.environ.get("BLOG_CLAUDE_CHECK_MODEL", "claude-sonnet-5")
TIMEOUT = 120
MAX_TOKENS = 16384
TOOL = "responder"
#: "devolva um objeto JSON qualquer" — o prompt descreve as chaves (decisões por imagem na rotina do Mac)
FREE_JSON: dict[str, Any] = {"freeform": True}


class ClaudeError(RuntimeError):
    """Chave ausente, falha de chamada, saída cortada ou sem a ferramenta preenchida."""


def to_json_schema(schema: Any) -> Any:
    """O schema do Gemini usa tipos em MAIÚSCULAS (`OBJECT`); JSON Schema usa minúsculas."""
    if isinstance(schema, dict):
        return {k: (v.lower() if k == "type" and isinstance(v, str) else to_json_schema(v))
                for k, v in schema.items()}
    if isinstance(schema, list):
        return [to_json_schema(v) for v in schema]
    return schema


def complete(prompt: str, system: str, schema: dict[str, Any], model: str,
             images: list[bytes] | None = None, timeout: int | None = None) -> dict[str, Any]:
    if not API_KEY:
        raise ClaudeError("ANTHROPIC_API_KEY não configurada no serviço")

    headers = {"x-api-key": API_KEY, "anthropic-version": VERSION, "content-type": "application/json"}
    if WORKSPACE_ID:
        headers["anthropic-workspace-id"] = WORKSPACE_ID

    body: dict[str, Any] = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": [
            *({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                           "data": base64.b64encode(raw).decode()}} for raw in images or []),
            {"type": "text", "text": prompt},
        ]}],
        "tools": [{"name": TOOL, "description": "Devolve a resposta no formato pedido.",
                   "input_schema": {"type": "object"} if schema is FREE_JSON else to_json_schema(schema)}],
        "tool_choice": {"type": "tool", "name": TOOL},
    }
    if system:
        body["system"] = system

    res = requests.post(URL, headers=headers, json=body, timeout=timeout or TIMEOUT)
    if not res.ok:
        raise ClaudeError(f"Claude respondeu {res.status_code}: {res.text[:300]}")

    data = res.json()
    for bloco in data.get("content") or []:
        if bloco.get("type") == "tool_use" and bloco.get("name") == TOOL and isinstance(bloco.get("input"), dict):
            if data.get("stop_reason") == "max_tokens":
                break
            return bloco["input"]
    raise ClaudeError(f"Claude devolveu resposta sem a ferramenta preenchida (stop_reason={data.get('stop_reason')})")
