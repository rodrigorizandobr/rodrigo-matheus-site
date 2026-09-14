"""Orquestração: sorteia tema → escreve → capa → grava com o destino certo."""
from datetime import datetime, timezone

import pytest

from blog import service, store
from tests.fakes import FakeDb, FakeFilter


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


DRAFT = {
    "slugBase": "tema-x", "tags": ["ia"], "imagePrompt": "cena", "imageAlt": "alt",
    "i18n": {l: {"title": "T", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]}
             for l in ("pt", "en")},
    "model": "gemini-3.5-flash-lite",
}


@pytest.fixture
def env(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    chamadas = {"gerou": [], "capa": []}
    monkeypatch.setattr(service.gemini, "generate_post", lambda topic, context="": (chamadas["gerou"].append(topic), dict(DRAFT))[1])
    monkeypatch.setattr(service.images, "build_cover", lambda p, a, keywords=None: (chamadas["capa"].append(p), {"hash": "h" * 64, "provider": "gemini", "credit": "c", "sourceUrl": "", "alt": a})[1])
    return chamadas


class TestGerar:
    def test_grava_rascunho_agendado_com_a_data_da_config(self, env):
        store.save_config({"delay_days": 2, "publish_hour": 8, "auto_publish": False})
        post = service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert post["status"] == "scheduled"
        assert post["scheduledFor"] == utc(2026, 9, 16, 11)  # 8h de SP

    def test_com_auto_publicar_ligado_entra_no_ar_na_hora(self, env):
        store.save_config({"auto_publish": True})
        post = service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert post["status"] == "published"
        assert post["publishedAt"] == utc(2026, 9, 14, 21)

    def test_registra_o_modelo_e_o_tema_para_rastreio(self, env):
        post = service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert post["generation"]["model"] == "gemini-3.5-flash-lite"
        assert post["topic"] == "meu tema"

    def test_a_capa_usa_o_prompt_que_a_ia_escreveu(self, env):
        service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert env["capa"] == ["cena"]

    def test_capa_falhando_o_post_sai_mesmo_assim(self, env, monkeypatch):
        monkeypatch.setattr(service.images, "build_cover", lambda *a, **k: None)
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        assert post["image"] is None and post["status"] == "scheduled"

    def test_sem_tema_explicito_sorteia_da_pauta(self, env):
        store.save_config({"topics": ["tema da pauta"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21))
        assert env["gerou"] == ["tema da pauta"]
        assert post["topic"] == "tema da pauta"

    def test_pauta_esgotada_nao_gera_e_explica(self, env):
        store.save_config({"topics": ["único"]})
        service.generate(None, now=utc(2026, 9, 14, 21))
        with pytest.raises(service.NoTopicError, match="pauta"):
            service.generate(None, now=utc(2026, 9, 15, 21))


class TestTickDoAgendador:
    def test_publica_os_vencidos(self, env):
        store.save_config({"delay_days": 0, "publish_hour": 8, "generate_weekdays": []})
        post = service.generate("t", now=utc(2026, 9, 14, 21))  # agenda 15/09 11:00 UTC
        resultado = service.tick(now=utc(2026, 9, 15, 12))
        assert resultado["published"] == 1
        assert store.get_post(post["id"])["status"] == "published"

    def test_gera_no_dia_e_hora_configurados(self, env):
        store.save_config({"generate_weekdays": [0], "generate_hour": 6, "topics": ["t1"]})
        resultado = service.tick(now=utc(2026, 9, 14, 12))  # segunda, 9h SP
        assert resultado["generated"] == 1

    def test_nao_gera_duas_vezes_no_mesmo_dia(self, env):
        store.save_config({"generate_weekdays": [0], "generate_hour": 6, "topics": ["t1", "t2"]})
        service.tick(now=utc(2026, 9, 14, 12))
        assert service.tick(now=utc(2026, 9, 14, 15))["generated"] == 0

    def test_erro_ao_gerar_nao_impede_a_publicacao_dos_vencidos(self, env, monkeypatch):
        store.save_config({"delay_days": 0, "publish_hour": 8, "generate_weekdays": [0], "generate_hour": 6})
        service.generate("t", now=utc(2026, 9, 12, 21))
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: (_ for _ in ()).throw(service.gemini.GeminiError("cota")))
        resultado = service.tick(now=utc(2026, 9, 14, 12))
        assert resultado["published"] == 1
        assert "cota" in resultado["error"]


class TestRevisaoPorPrompt:
    def test_mantem_id_e_status_e_troca_so_o_conteudo(self, env, monkeypatch):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        novo = {**DRAFT, "i18n": {l: {"title": "Revisado", "excerpt": "e2", "sections": [{"heading": "h", "paragraphs": ["p2"]}]} for l in ("pt", "en")}}
        monkeypatch.setattr(service.gemini, "revise_post", lambda p, i: novo)
        revisado = service.revise(post["id"], "encurte")
        assert revisado["id"] == post["id"]
        assert revisado["status"] == "scheduled"
        assert revisado["i18n"]["pt"]["title"] == "Revisado"
        assert revisado["slug"] == post["slug"], "mudar o slug quebraria o link já publicado"

    def test_post_inexistente_devolve_None(self, env):
        assert service.revise("nao-existe", "x") is None
