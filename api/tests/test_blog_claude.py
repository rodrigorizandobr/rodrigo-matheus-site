"""Claude no lugar do Gemini para texto e visão: a mesma `_call`, outro provedor por baixo."""
import base64
import json

import pytest

from blog import claude, gemini
from tests.test_blog_gemini import POST_OK, FakePost


def _tool(payload: dict) -> dict:
    return {"stop_reason": "tool_use", "content": [
        {"type": "text", "text": "ok"},
        {"type": "tool_use", "id": "t1", "name": "responder", "input": payload}]}


@pytest.fixture
def chave(monkeypatch):
    monkeypatch.setattr(claude, "API_KEY", "chave-claude")
    monkeypatch.setattr(claude, "WORKSPACE_ID", "")
    monkeypatch.setattr(gemini, "LLM_CHOICE", "")


@pytest.fixture
def fake(monkeypatch, chave):
    f = FakePost(_tool(POST_OK))
    monkeypatch.setattr(claude.requests, "post", f)
    return f


class TestPedidoAoClaude:
    def test_fala_com_a_api_de_mensagens_e_manda_a_chave(self, fake):
        claude.complete("oi", "sistema", {"type": "OBJECT", "properties": {}}, "claude-x")
        chamada = fake.calls[0]
        assert chamada["url"] == "https://api.anthropic.com/v1/messages"
        assert chamada["headers"]["x-api-key"] == "chave-claude"
        assert chamada["headers"]["anthropic-version"]
        assert "anthropic-workspace-id" not in chamada["headers"]

    def test_chave_de_usuario_leva_o_workspace(self, fake, monkeypatch):
        monkeypatch.setattr(claude, "WORKSPACE_ID", "wrkspc_123")
        claude.complete("oi", "sistema", {"type": "OBJECT"}, "claude-x")
        assert fake.calls[0]["headers"]["anthropic-workspace-id"] == "wrkspc_123"

    def test_saida_estruturada_vem_de_ferramenta_obrigatoria(self, fake):
        claude.complete("oi", "sistema", gemini.POST_SCHEMA, "claude-x")
        corpo = fake.calls[0]["json"]
        assert corpo["tool_choice"] == {"type": "tool", "name": "responder"}
        assert corpo["tools"][0]["name"] == "responder"
        assert corpo["model"] == "claude-x"
        assert "temperature" not in corpo  # medido: "`temperature` is deprecated for this model" (400)
        assert corpo["system"] == "sistema"

    def test_o_schema_do_gemini_vira_json_schema_em_minusculas(self, fake):
        claude.complete("oi", "s", gemini.POST_SCHEMA, "claude-x")
        esquema = fake.calls[0]["json"]["tools"][0]["input_schema"]
        assert esquema["type"] == "object"
        assert esquema["properties"]["tags"] == {"type": "array", "items": {"type": "string"}}
        assert esquema["properties"]["pt"]["properties"]["sections"]["items"]["type"] == "object"
        assert "pt" in esquema["required"]

    def test_json_livre_vira_objeto_sem_propriedades(self, fake):
        claude.complete("oi", "s", gemini.FREE_JSON, "claude-x")
        assert fake.calls[0]["json"]["tools"][0]["input_schema"] == {"type": "object"}

    def test_imagens_vao_antes_do_texto_em_base64(self, fake):
        claude.complete("qual?", "s", {"type": "OBJECT"}, "claude-x", images=[b"\xff\xd8abc"])
        partes = fake.calls[0]["json"]["messages"][0]["content"]
        assert partes[0]["type"] == "image"
        assert partes[0]["source"] == {"type": "base64", "media_type": "image/jpeg",
                                       "data": base64.b64encode(b"\xff\xd8abc").decode()}
        assert partes[-1] == {"type": "text", "text": "qual?"}

    @pytest.mark.parametrize("cabecalho,tipo", [
        (b"\xff\xd8\xff\xe0", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\n", "image/png"),
        (b"RIFF\x8c\xc4\x08\x00WEBP", "image/webp"),
        (b"GIF89a", "image/gif"),
    ])
    def test_a_imagem_vai_com_o_tipo_que_ela_tem(self, fake, cabecalho, tipo):
        """A API devolve 400 se o tipo declarado não bate com os bytes (medido: og:image em webp e png)."""
        claude.complete("qual?", "s", {"type": "OBJECT"}, "claude-x", images=[cabecalho + b"resto"])
        assert fake.calls[0]["json"]["messages"][0]["content"][0]["source"]["media_type"] == tipo

    def test_sem_sistema_o_campo_nem_vai(self, fake):
        claude.complete("oi", "", {"type": "OBJECT"}, "claude-x")
        assert "system" not in fake.calls[0]["json"]

    def test_devolve_o_que_a_ferramenta_preencheu(self, fake):
        assert claude.complete("oi", "s", {"type": "OBJECT"}, "claude-x") == POST_OK


class TestFalhas:
    def test_sem_chave(self, monkeypatch):
        monkeypatch.setattr(claude, "API_KEY", "")
        with pytest.raises(claude.ClaudeError, match="ANTHROPIC_API_KEY"):
            claude.complete("oi", "s", {"type": "OBJECT"}, "claude-x")

    def test_erro_http_diz_o_status_e_o_motivo(self, monkeypatch, chave):
        monkeypatch.setattr(claude.requests, "post", FakePost(
            {"error": {"message": "credit balance is too low"}}, status=400))
        with pytest.raises(claude.ClaudeError, match="400.*credit balance"):
            claude.complete("oi", "s", {"type": "OBJECT"}, "claude-x")

    def test_resposta_cortada_nao_vira_post_pela_metade(self, monkeypatch, chave):
        monkeypatch.setattr(claude.requests, "post", FakePost(
            {"stop_reason": "max_tokens", "content": [{"type": "text", "text": "..."}]}))
        with pytest.raises(claude.ClaudeError, match="sem"):
            claude.complete("oi", "s", {"type": "OBJECT"}, "claude-x")


class Sequencia:
    """Devolve uma resposta diferente a cada chamada (a última se repete)."""

    def __init__(self, *payloads):
        self.payloads, self.calls = list(payloads), []

    def __call__(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        payload = self.payloads[min(len(self.calls), len(self.payloads)) - 1]
        return type("R", (), {"status_code": 200, "ok": True, "json": lambda _s: payload,
                              "text": json.dumps(payload)})()


class TestEstruturaQuebrada:
    """Medido ao vivo (1 em ~8 posts): o Claude devolve `pt` como TEXTO, e às vezes com o `en` dentro."""

    def test_objeto_mandado_como_texto_json_volta_a_ser_objeto(self, monkeypatch, chave):
        torto = {**POST_OK, "pt": json.dumps(POST_OK["pt"])}
        monkeypatch.setattr(claude.requests, "post", Sequencia(_tool(torto)))
        assert claude.complete("oi", "s", gemini.POST_SCHEMA, "claude-x") == POST_OK

    def test_en_que_veio_dentro_do_texto_do_pt_e_recuperado(self, monkeypatch, chave):
        dentro = json.dumps(POST_OK["pt"]) + ',"en":' + json.dumps(POST_OK["en"])
        torto = {k: v for k, v in POST_OK.items() if k != "en"} | {"pt": dentro}
        monkeypatch.setattr(claude.requests, "post", Sequencia(_tool(torto)))
        assert claude.complete("oi", "s", gemini.POST_SCHEMA, "claude-x") == POST_OK

    def test_estrutura_irrecuperavel_tenta_de_novo_e_devolve_a_boa(self, monkeypatch, chave):
        ruim = {**POST_OK, "pt": '{"title": "cortado'}
        seq = Sequencia(_tool(ruim), _tool(POST_OK))
        monkeypatch.setattr(claude.requests, "post", seq)
        assert claude.complete("oi", "s", gemini.POST_SCHEMA, "claude-x") == POST_OK
        assert len(seq.calls) == 2

    def test_campo_obrigatorio_ausente_tambem_tenta_de_novo(self, monkeypatch, chave):
        sem_en = {k: v for k, v in POST_OK.items() if k != "en"}
        seq = Sequencia(_tool(sem_en), _tool(POST_OK))
        monkeypatch.setattr(claude.requests, "post", seq)
        assert claude.complete("oi", "s", gemini.POST_SCHEMA, "claude-x") == POST_OK
        assert len(seq.calls) == 2

    def test_desiste_depois_de_algumas_tentativas(self, monkeypatch, chave):
        ruim = {**POST_OK, "pt": '{"title": "cortado'}
        seq = Sequencia(_tool(ruim))
        monkeypatch.setattr(claude.requests, "post", seq)
        with pytest.raises(claude.ClaudeError, match="estrutura"):
            claude.complete("oi", "s", gemini.POST_SCHEMA, "claude-x")
        assert len(seq.calls) == claude.MAX_ATTEMPTS

    def test_lista_omitida_nao_e_defeito(self, monkeypatch, chave):
        """O conferidor omite `semFonte` quando não acha nada; quem chama já trata ausente como vazio."""
        seq = Sequencia(_tool({}))
        monkeypatch.setattr(claude.requests, "post", seq)
        assert claude.complete("oi", "s", gemini.CLAIMS_SCHEMA, "claude-x") == {}
        assert len(seq.calls) == 1

    ITEM = {"trecho": "frase", "porque": "sem apoio"}

    def test_lista_embrulhada_num_objeto_de_mesmo_nome_e_desembrulhada(self, monkeypatch, chave):
        """Medido: o Sonnet devolveu {"semFonte": {"semFonte": [...]}} e o conferidor quebrava."""
        monkeypatch.setattr(claude.requests, "post", Sequencia(_tool({"semFonte": {"semFonte": [self.ITEM]}})))
        assert claude.complete("oi", "s", gemini.CLAIMS_SCHEMA, "claude-x") == {"semFonte": [self.ITEM]}

    def test_lista_mandada_como_texto_com_o_involucro_dentro_e_desembrulhada(self, monkeypatch, chave):
        """Medido em 3 de 5 posts reais: o Sonnet mandou `semFonte` como TEXTO JSON que traz `{"semFonte": [...]}`."""
        texto = json.dumps({"semFonte": [self.ITEM]})
        seq = Sequencia(_tool({"semFonte": texto}))
        monkeypatch.setattr(claude.requests, "post", seq)
        assert claude.complete("oi", "s", gemini.CLAIMS_SCHEMA, "claude-x") == {"semFonte": [self.ITEM]}
        assert len(seq.calls) == 1

    def test_lista_que_veio_como_objeto_estranho_tenta_de_novo(self, monkeypatch, chave):
        seq = Sequencia(_tool({"semFonte": {"outra": 1}}), _tool({"semFonte": [self.ITEM]}))
        monkeypatch.setattr(claude.requests, "post", seq)
        assert claude.complete("oi", "s", gemini.CLAIMS_SCHEMA, "claude-x") == {"semFonte": [self.ITEM]}
        assert len(seq.calls) == 2

    def test_json_livre_nao_e_validado(self, monkeypatch, chave):
        seq = Sequencia(_tool({"inicio": 3}))
        monkeypatch.setattr(claude.requests, "post", seq)
        assert claude.complete("oi", "s", gemini.FREE_JSON, "claude-x") == {"inicio": 3}
        assert len(seq.calls) == 1


class TestEscolhaDoProvedor:
    def test_com_chave_do_claude_o_texto_vai_para_o_claude(self, fake):
        post = gemini.generate_post("liderança em IA")
        assert post["i18n"]["pt"]["title"] == "Escala"
        assert [c["url"] for c in fake.calls] == [claude.URL]
        assert fake.calls[0]["json"]["model"] == claude.TEXT_MODEL

    def test_conferencia_e_visao_usam_o_modelo_de_conferencia(self, fake):
        fake.payload = _tool({"serve": True, "motivo": "ok"})
        assert gemini.photo_fits(b"x", "assunto") is True
        assert fake.calls[0]["json"]["model"] == claude.CHECK_MODEL

    def test_sem_chave_do_claude_continua_no_gemini(self, monkeypatch):
        monkeypatch.setattr(claude, "API_KEY", "")
        monkeypatch.setattr(gemini, "LLM_CHOICE", "")
        monkeypatch.setattr(gemini, "API_KEY", "g")
        f = FakePost({"candidates": [{"content": {"parts": [{"text": json.dumps(POST_OK)}]}}]})
        monkeypatch.setattr(gemini.requests, "post", f)
        gemini.generate_post("tema")
        assert "generativelanguage" in f.calls[0]["url"]

    def test_blog_llm_gemini_vence_a_chave_do_claude(self, fake, monkeypatch):
        monkeypatch.setattr(gemini, "LLM_CHOICE", "gemini")
        monkeypatch.setattr(gemini, "API_KEY", "g")
        g = FakePost({"candidates": [{"content": {"parts": [{"text": json.dumps(POST_OK)}]}}]})
        monkeypatch.setattr(gemini.requests, "post", g)
        gemini.generate_post("tema")
        assert "generativelanguage" in g.calls[0]["url"]

    def test_falha_do_claude_chega_como_erro_que_as_rotas_ja_tratam(self, monkeypatch, chave):
        monkeypatch.setattr(claude.requests, "post", FakePost({"error": {"message": "x"}}, status=529))
        with pytest.raises(gemini.GeminiError, match="529"):
            gemini.generate_post("tema")

    def test_json_livre_no_gemini_nao_manda_schema(self, monkeypatch):
        monkeypatch.setattr(claude, "API_KEY", "")
        monkeypatch.setattr(gemini, "LLM_CHOICE", "")
        monkeypatch.setattr(gemini, "API_KEY", "g")
        f = FakePost({"candidates": [{"content": {"parts": [{"text": '{"a": 1}'}]}}]})
        monkeypatch.setattr(gemini.requests, "post", f)
        assert gemini._call("p", "", schema=gemini.FREE_JSON) == {"a": 1}
        cfg = f.calls[0]["json"]["generationConfig"]
        assert "responseSchema" not in cfg and "systemInstruction" not in f.calls[0]["json"]


class TestVisaoDaRotina:
    def test_a_rotina_pergunta_pelo_mesmo_caminho_e_recebe_json_em_texto(self, fake):
        from clip_worker import Ferramentas
        fake.payload = _tool({"inicio": 3, "fim": 20})
        texto = Ferramentas._gemini([b"img"], "pergunta")
        assert json.loads(texto) == {"inicio": 3, "fim": 20}
        assert fake.calls[0]["json"]["model"] == claude.CHECK_MODEL
