"""Persistência do blog. O que importa aqui é o que o site público NUNCA pode ver."""
from datetime import datetime, timezone

import pytest

from blog import store
from tests.fakes import FakeDb, FakeFilter


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: fake)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    return fake


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


class TestConfig:
    def test_sem_documento_devolve_os_padroes(self, db):
        cfg = store.get_config()
        assert cfg["publish_hour"] == 8 and cfg["auto_publish"] is False

    def test_salvar_faz_merge_e_ignora_chave_desconhecida(self, db):
        store.save_config({"publish_hour": 19, "hackerman": True})
        cfg = store.get_config()
        assert cfg["publish_hour"] == 19
        assert cfg["delay_days"] == 2  # veio do padrão
        assert "hackerman" not in cfg

    def test_valores_fora_da_faixa_sao_recusados(self, db):
        with pytest.raises(ValueError, match="publish_hour"):
            store.save_config({"publish_hour": 25})
        with pytest.raises(ValueError, match="generate_weekdays"):
            store.save_config({"generate_weekdays": [0, 9]})


class TestPosts:
    def _novo(self, **over):
        base = {"slugBase": "titulo-do-post", "tags": ["ia"], "imagePrompt": "p", "imageAlt": "a",
                "i18n": {"pt": {"title": "T", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]},
                         "en": {"title": "T", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]}}}
        return {**base, **over}

    def test_criar_gera_id_slug_unico_e_nasce_como_rascunho(self, db):
        a = store.create_post(self._novo(), now=utc(2026, 9, 15))
        b = store.create_post(self._novo(), now=utc(2026, 9, 15))
        assert a["status"] == "draft"
        assert a["slug"] != b["slug"], "dois posts com o mesmo título não podem colidir de slug"
        assert a["slug"].startswith("titulo-do-post-")

    def test_listagem_publica_so_traz_publicados_e_sem_campo_interno(self, db):
        rascunho = store.create_post(self._novo(), now=utc(2026, 9, 15))
        publicado = store.create_post(self._novo(), now=utc(2026, 9, 15))
        store.publish_post(publicado["id"], now=utc(2026, 9, 16))

        publicos = store.list_public_posts()
        assert [p["slug"] for p in publicos] == [publicado["slug"]]
        assert rascunho["slug"] not in [p["slug"] for p in publicos]
        assert "generation" not in publicos[0], "metadado de geração é interno"

    def test_post_publico_por_slug_recusa_rascunho(self, db):
        rascunho = store.create_post(self._novo(), now=utc(2026, 9, 15))
        assert store.get_public_post(rascunho["slug"]) is None

    def test_agendar_grava_status_e_data(self, db):
        post = store.create_post(self._novo(), now=utc(2026, 9, 15))
        store.schedule_post(post["id"], utc(2026, 9, 17, 11))
        gravado = store.get_post(post["id"])
        assert gravado["status"] == "scheduled"
        assert gravado["scheduledFor"] == utc(2026, 9, 17, 11)

    def test_publicar_exige_os_dois_idiomas(self, db):
        meio = self._novo()
        meio["i18n"]["en"]["title"] = ""
        post = store.create_post(meio, now=utc(2026, 9, 15))
        with pytest.raises(ValueError, match="en"):
            store.publish_post(post["id"], now=utc(2026, 9, 16))

    def test_despublicar_volta_para_rascunho_e_some_do_site(self, db):
        post = store.create_post(self._novo(), now=utc(2026, 9, 15))
        store.publish_post(post["id"], now=utc(2026, 9, 16))
        store.unpublish_post(post["id"])
        assert store.list_public_posts() == []

    def test_apagar_some_de_vez(self, db):
        post = store.create_post(self._novo(), now=utc(2026, 9, 15))
        store.delete_post(post["id"])
        assert store.get_post(post["id"]) is None

    def test_vencidos_sao_publicados_e_a_data_de_publicacao_e_a_de_agora(self, db):
        post = store.create_post(self._novo(), now=utc(2026, 9, 15))
        store.schedule_post(post["id"], utc(2026, 9, 16, 11))
        publicados = store.publish_due(now=utc(2026, 9, 16, 12))
        assert len(publicados) == 1
        assert store.get_post(post["id"])["publishedAt"] == utc(2026, 9, 16, 12)

    def test_vencido_no_futuro_fica_quieto(self, db):
        post = store.create_post(self._novo(), now=utc(2026, 9, 15))
        store.schedule_post(post["id"], utc(2026, 9, 18, 11))
        assert store.publish_due(now=utc(2026, 9, 16, 12)) == []

    def test_ultima_geracao_ignora_post_criado_na_mao(self, db):
        store.create_post(self._novo(), now=utc(2026, 9, 14))  # manual, sem `generation`
        store.create_post(self._novo(generation={"model": "m", "generatedAt": utc(2026, 9, 10)}), now=utc(2026, 9, 10))
        assert store.last_generated_at() == utc(2026, 9, 10)

    def test_sem_nenhuma_geracao_devolve_None(self, db):
        assert store.last_generated_at() is None


class TestCapaSemFichaTecnica:
    """O JSON público não conta como a capa foi feita."""

    def test_provider_e_prompt_da_capa_somem_da_resposta_publica(self, db):
        post = store.create_post({
            "slug": "com-capa", "tags": ["ia"],
            "image": {"hash": "a" * 64, "provider": "gemini", "credit": "",
                      "sourceUrl": "", "alt": "capa", "prompt": "um cabo vermelho",
                      "width": 1920, "height": 1080},
            "i18n": {l: {"title": "T", "excerpt": "E",
                      "sections": [{"heading": "h", "paragraphs": ["p"]}]} for l in ("pt", "en")},
        })
        store.publish_post(post["id"])
        publico = store.get_public_post(post["slug"])
        assert set(publico["image"]) == {"hash", "credit", "sourceUrl", "alt", "width", "height"}

    def test_credito_do_banco_de_imagens_continua_publico(self, db):
        """Crédito de terceiro é obrigação, não enfeite — esse não pode sumir."""
        post = store.create_post({
            "slug": "de-banco", "tags": ["ia"],
            "image": {"hash": "b" * 64, "provider": "pixabay", "credit": "Foto de Fulano",
                      "sourceUrl": "https://pixabay.com/x", "alt": "capa"},
            "i18n": {l: {"title": "T", "excerpt": "E",
                      "sections": [{"heading": "h", "paragraphs": ["p"]}]} for l in ("pt", "en")},
        })
        store.publish_post(post["id"])
        publico = store.get_public_post(post["slug"])
        assert publico["image"]["credit"] == "Foto de Fulano"
        assert publico["image"]["sourceUrl"] == "https://pixabay.com/x"
