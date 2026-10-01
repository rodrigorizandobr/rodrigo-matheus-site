"""Camada de geração: o que sai do Gemini precisa chegar normalizado e nunca pela metade."""
import json

import pytest

from blog import gemini, linkedin


def _resposta(payload: dict) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}


POST_OK = {
    "slugBase": "Escala de Times de Engenharia",
    "tags": ["Liderança", "lideranca", "IA", "", "a", "b", "c", "d"],
    "imagePrompt": "sterile white lab",
    "imageAlt": "laboratório branco",
    "pt": {"title": "Escala", "excerpt": "resumo", "sections": [
        {"heading": "Um", "paragraphs": ["texto do parágrafo"]},
        {"heading": "Vazia", "paragraphs": []},
    ]},
    "en": {"title": "Scale", "excerpt": "summary", "sections": [
        {"heading": "One", "paragraphs": ["paragraph text"]},
    ]},
}


class FakePost:
    """Captura o que foi enviado e devolve um payload fixo."""

    def __init__(self, payload, status=200):
        self.payload, self.status, self.calls = payload, status, []

    def __call__(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return type("R", (), {
            "status_code": self.status,
            "ok": self.status < 400,
            "json": lambda _self: self.payload,
            "text": json.dumps(self.payload),
        })()


@pytest.fixture
def fake(monkeypatch):
    f = FakePost(_resposta(POST_OK))
    monkeypatch.setattr(gemini.requests, "post", f)
    monkeypatch.setattr(gemini, "API_KEY", "chave-de-teste")
    return f


class TestGeracaoDePost:
    def test_usa_flash_lite_e_manda_a_chave_no_header(self, fake):
        gemini.generate_post("liderança em IA")
        chamada = fake.calls[0]
        assert "flash-lite" in chamada["url"]
        assert chamada["headers"]["x-goog-api-key"] == "chave-de-teste"

    def test_pede_json_estruturado_com_os_dois_idiomas(self, fake):
        gemini.generate_post("liderança em IA")
        corpo = fake.calls[0]["json"]
        schema = corpo["generationConfig"]["responseSchema"]
        assert corpo["generationConfig"]["responseMimeType"] == "application/json"
        assert {"pt", "en"} <= set(schema["properties"])

    def test_o_tema_pedido_chega_no_prompt(self, fake):
        gemini.generate_post("liderança em IA")
        texto = json.dumps(fake.calls[0]["json"], ensure_ascii=False)
        assert "liderança em IA" in texto

    def test_normaliza_tags_e_descarta_secao_vazia(self, fake):
        post = gemini.generate_post("x")
        assert post["tags"] == ["liderança", "ia", "a", "b", "c", "d"]
        assert [s["heading"] for s in post["i18n"]["pt"]["sections"]] == ["Um"]

    def test_devolve_i18n_pronto_com_slug_e_prompt_de_imagem(self, fake):
        post = gemini.generate_post("x")
        assert post["slugBase"] == "escala-de-times-de-engenharia"
        assert post["imagePrompt"] == "sterile white lab"
        assert post["i18n"]["en"]["title"] == "Scale"

    def test_resposta_sem_candidato_falha_alto_em_vez_de_gravar_post_vazio(self, monkeypatch):
        monkeypatch.setattr(gemini.requests, "post", FakePost({"candidates": []}))
        monkeypatch.setattr(gemini, "API_KEY", "k")
        with pytest.raises(gemini.GeminiError, match="sem conteúdo"):
            gemini.generate_post("x")

    def test_erro_http_vira_GeminiError_com_o_status(self, monkeypatch):
        monkeypatch.setattr(gemini.requests, "post", FakePost({"error": {"message": "cota"}}, status=429))
        monkeypatch.setattr(gemini, "API_KEY", "k")
        with pytest.raises(gemini.GeminiError, match="429"):
            gemini.generate_post("x")

    def test_sem_chave_configurada_falha_antes_de_chamar_a_rede(self, monkeypatch):
        monkeypatch.setattr(gemini, "API_KEY", "")
        with pytest.raises(gemini.GeminiError, match="GEMINI_API_KEY"):
            gemini.generate_post("x")


class TestEdicaoPorPrompt:
    def test_manda_o_post_atual_e_a_instrucao_do_usuario(self, fake):
        atual = {"i18n": {"pt": {"title": "Velho", "excerpt": "e", "sections": []}, "en": {"title": "Old", "excerpt": "e", "sections": []}}, "tags": []}
        gemini.revise_post(atual, "deixe mais curto e tire o jargão")
        texto = json.dumps(fake.calls[0]["json"], ensure_ascii=False)
        assert "deixe mais curto" in texto and "Velho" in texto

    def test_devolve_post_normalizado_igual_a_geracao(self, fake):
        post = gemini.revise_post({"i18n": {}, "tags": []}, "encurte")
        assert post["i18n"]["pt"]["title"] == "Escala"
        assert post["tags"] == ["liderança", "ia", "a", "b", "c", "d"]


def _sistema(fake) -> str:
    return fake.calls[0]["json"]["systemInstruction"]["parts"][0]["text"]


def _pedido(fake) -> str:
    return fake.calls[0]["json"]["contents"][0]["parts"][0]["text"]


class TestPostDeNovidade:
    """O blog conta a novidade da semana; ensaio de opinião genérico é o defeito a evitar."""

    def test_manda_escolher_UMA_historia_do_material(self, fake):
        # o material traz várias matérias sobre o mesmo nome; sem escolher, o modelo faz sopa
        gemini.generate_post("OpenAI", context="várias notícias")
        assert "escolha UMA" in _pedido(fake)

    def test_o_tema_e_assunto_vigiado_e_nao_o_titulo(self, fake):
        gemini.generate_post("OpenAI", context="várias notícias")
        assert "não é o título" in _pedido(fake)

    def test_o_titulo_nomeia_o_acontecimento_e_proibe_o_formato_de_tese(self, fake):
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "TÍTULO" in regras
        assert "A ilusão de" in regras, "os moldes que vinham saindo precisam estar proibidos pelo nome"

    def test_pede_humor_sem_inventar_fato(self, fake):
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "HUMOR" in regras and "não inventa" in regras

    def test_nao_exige_mais_tese_defensavel_em_todo_paragrafo(self, fake):
        # foi esta exigência que produziu os ensaios corporativos
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "possa ser discordada" not in regras
        assert "PROFUNDO" not in regras

    def test_a_capa_mostra_o_objeto_da_noticia(self, fake):
        gemini.generate_post("OpenAI")
        assert "OBJETO" in _sistema(fake)

    def test_nao_oferece_titulo_nem_piada_pronta_para_o_modelo_copiar(self, fake):
        # medido: o modelo devolveu o exemplo do prompt quase palavra por palavra
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "olhou para ele e desistiu" not in regras
        assert "subir para produção numa sexta-feira" not in regras

    def test_proibe_titulo_de_secao_que_so_repete_o_papel_dela(self, fake):
        # "O que muda para quem escreve código" saiu igual em posts diferentes
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "O que muda para" in regras and "Até onde vai" in regras

    def test_proibe_comparacao_e_cliche_batidos(self, fake):
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "COMPARAÇÕES BATIDAS" in regras
        assert "mudou o jogo" in regras

    def test_papel_da_secao_nao_usa_as_palavras_que_o_modelo_ecoa_no_titulo(self, fake):
        # a descrição "o que isso muda" voltava como título da seção 3, mesmo proibida
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "o que isso muda" not in regras

    def test_proibe_fecho_de_carimbo(self, fake):
        # todo post terminava em "até onde vamos confiar…" / "o tempo dirá"
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert "O tempo dirá" in regras and "Resta saber" in regras

    def test_nao_planta_a_expressao_de_opiniao_que_virava_titulo_de_secao(self, fake):
        # "Na minha leitura…" abriu o título da seção 3 em 3 de 3 posts
        gemini.generate_post("OpenAI")
        assert "Na minha leitura" not in _sistema(fake)


class TestCabeInteiroNoLinkedIn:
    """O post inteiro tem que caber num post do LinkedIn, sem 'Continua no site'."""

    URL = "https://rodrigomatheus.com.br/blog/um-slug-razoavelmente-comprido-de-exemplo-abc12345"

    def _pior_caso(self) -> dict:
        # palavra de 6 letras + espaço = 7 caracteres: mais larga que a média do português
        paragrafo = " ".join(["abcdef"] * gemini.MAX_PARAGRAPH_WORDS)
        secoes = [
            {"heading": "h" * gemini.MAX_HEADING_CHARS, "paragraphs": [paragrafo] * gemini.PARAGRAPHS}
            for _ in range(gemini.SECTIONS)
        ]
        pt = {"title": "t" * gemini.MAX_TITLE_CHARS, "excerpt": "e" * gemini.MAX_EXCERPT_CHARS, "sections": secoes}
        return {"tags": ["inteligencia artificial", "engenharia de software", "arquitetura", "produtividade"],
                "i18n": {"pt": pt, "en": pt}}

    def test_o_maior_post_que_as_regras_permitem_cabe_sem_corte(self):
        texto = linkedin.share_text(self._pior_caso(), self.URL)
        assert len(texto) <= linkedin.POST_BUDGET
        assert "Continua no site" not in texto

    def test_o_orcamento_deixa_folga_sob_o_limite_do_linkedin(self):
        assert linkedin.POST_BUDGET < linkedin.MAX_TEXT

    def test_o_prompt_manda_os_numeros_das_constantes(self, fake):
        gemini.generate_post("OpenAI")
        regras = _sistema(fake)
        assert f"{gemini.SECTIONS} seções" in regras
        assert f"{gemini.PARAGRAPHS} parágrafos" in regras
        assert f"{gemini.MIN_PARAGRAPH_WORDS} a {gemini.MAX_PARAGRAPH_WORDS} palavras" in regras
        assert f"{gemini.MAX_TITLE_CHARS} caracteres" in regras
        assert f"{gemini.MAX_EXCERPT_CHARS} caracteres" in regras
        assert "4 seções" not in regras
