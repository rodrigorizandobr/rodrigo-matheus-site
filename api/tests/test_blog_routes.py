"""Rotas HTTP do blog. O foco: nada de escrita sem token, nada de rascunho em público."""
import json
from datetime import datetime, timezone

import pytest

import server
from blog import auth, routes, service, store
from tests.fakes import FakeDb, FakeFilter


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


DRAFT = {
    "slugBase": "tema-x", "tags": ["ia"], "imagePrompt": "cena", "imageAlt": "alt", "model": "m",
    "i18n": {l: {"title": f"T-{l}", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]}
             for l in ("pt", "en")},
}


@pytest.fixture
def blog(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    monkeypatch.setattr(service.gemini, "generate_post", lambda topic, context="", avoid_titles=None: dict(DRAFT))
    monkeypatch.setattr(service.images, "build_cover", lambda *a, **k: None)
    monkeypatch.setattr(routes, "TICK_KEY", "chave-do-agendador")
    return db


@pytest.fixture
def admin(monkeypatch):
    monkeypatch.setattr(routes, "verify_admin", lambda header: "rodrigorizando@gmail.com")


@pytest.fixture
def anon(monkeypatch):
    def recusa(header):
        raise auth.AuthError("token ausente ou malformado")
    monkeypatch.setattr(routes, "verify_admin", recusa)


AUTH = {"Authorization": "Bearer token-de-teste"}


class TestPortaria:
    ROTAS = [
        ("get", "/api/blog/admin/posts", None),
        ("post", "/api/blog/admin/generate", {}),
        ("patch", "/api/blog/admin/config", {"publish_hour": 9}),
        ("delete", "/api/blog/admin/posts/abc", None),
    ]

    @pytest.mark.parametrize("metodo,url,corpo", ROTAS)
    def test_sem_token_devolve_401_e_nao_executa(self, client, blog, anon, metodo, url, corpo):
        res = getattr(client, metodo)(url, json=corpo)
        assert res.status_code == 401
        assert store.list_posts() == []

    def test_com_token_valido_passa(self, client, blog, admin):
        assert client.get("/api/blog/admin/posts", headers=AUTH).status_code == 200


class TestPublico:
    def test_lista_so_publicados(self, client, blog, admin):
        rascunho = service.generate("t1", now=utc(2026, 9, 14, 21))
        publicado = service.generate("t2", now=utc(2026, 9, 14, 21))
        store.publish_post(publicado["id"], now=utc(2026, 9, 14, 22))

        dados = client.get("/api/blog/posts").get_json()
        assert [p["slug"] for p in dados["posts"]] == [publicado["slug"]]
        assert rascunho["slug"] not in json.dumps(dados)

    def test_post_por_slug_traz_os_dois_idiomas(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        store.publish_post(post["id"], now=utc(2026, 9, 14, 22))
        dados = client.get(f"/api/blog/posts/{post['slug']}").get_json()
        assert dados["post"]["i18n"]["pt"]["title"] == "T-pt"
        assert dados["post"]["i18n"]["en"]["title"] == "T-en"

    def test_slug_inexistente_404(self, client, blog):
        assert client.get("/api/blog/posts/nao-existe").status_code == 404

    def test_rascunho_por_slug_tambem_404(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        store.unpublish_post(post["id"])
        assert client.get(f"/api/blog/posts/{post['slug']}").status_code == 404

    def test_datas_saem_em_ISO_e_nao_como_objeto(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        store.publish_post(post["id"], now=utc(2026, 9, 14, 22))
        bruto = client.get("/api/blog/posts").get_data(as_text=True)
        assert "2026-09-14T22:00:00" in bruto


class TestPainel:
    def test_gerar_com_tema_proprio(self, client, blog, admin):
        res = client.post("/api/blog/admin/generate", json={"topic": "meu tema"}, headers=AUTH)
        assert res.status_code == 201
        assert res.get_json()["post"]["topic"] == "meu tema"

    def test_sem_assunto_nenhum_devolve_409_com_explicacao(self, client, blog, admin):
        store.save_config({"news_terms": []})
        res = client.post("/api/blog/admin/generate", json={}, headers=AUTH)
        assert res.status_code == 409
        assert "termo vigiado" in res.get_json()["error"]

    def test_falha_do_gemini_vira_502_e_nao_500(self, client, blog, admin, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda *a, **k: (_ for _ in ()).throw(service.gemini.GeminiError("cota")))
        res = client.post("/api/blog/admin/generate", json={"topic": "x"}, headers=AUTH)
        assert res.status_code == 502

    def test_editar_texto_na_mao(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        novo = {"i18n": {**post["i18n"]}}
        novo["i18n"]["pt"] = {**novo["i18n"]["pt"], "title": "Título na mão"}
        res = client.patch(f"/api/blog/admin/posts/{post['id']}", json=novo, headers=AUTH)
        assert res.get_json()["post"]["i18n"]["pt"]["title"] == "Título na mão"

    def test_revisar_por_prompt(self, client, blog, admin, monkeypatch):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        revisado = {**DRAFT, "i18n": {l: {"title": "Curto", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]} for l in ("pt", "en")}}
        monkeypatch.setattr(service.gemini, "revise_post", lambda p, i: revisado)
        res = client.post(f"/api/blog/admin/posts/{post['id']}/revise",
                          json={"instruction": "encurte"}, headers=AUTH)
        assert res.get_json()["post"]["i18n"]["pt"]["title"] == "Curto"

    def test_revisar_sem_instrucao_e_400(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        assert client.post(f"/api/blog/admin/posts/{post['id']}/revise", json={}, headers=AUTH).status_code == 400

    def test_publicar_e_despublicar(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        assert client.post(f"/api/blog/admin/posts/{post['id']}/publish", headers=AUTH).status_code == 200
        assert len(client.get("/api/blog/posts").get_json()["posts"]) == 1
        client.post(f"/api/blog/admin/posts/{post['id']}/unpublish", headers=AUTH)
        assert client.get("/api/blog/posts").get_json()["posts"] == []

    def test_agendar_com_data_propria(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        res = client.post(f"/api/blog/admin/posts/{post['id']}/schedule",
                          json={"when": "2026-09-20T11:00:00Z"}, headers=AUTH)
        assert res.get_json()["post"]["status"] == "scheduled"

    def test_agendar_com_data_invalida_e_400(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        assert client.post(f"/api/blog/admin/posts/{post['id']}/schedule",
                           json={"when": "ontem"}, headers=AUTH).status_code == 400

    def test_apagar(self, client, blog, admin):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        assert client.delete(f"/api/blog/admin/posts/{post['id']}", headers=AUTH).status_code == 200
        assert store.get_post(post["id"]) is None

    def test_config_le_e_grava(self, client, blog, admin):
        assert client.get("/api/blog/admin/config", headers=AUTH).get_json()["config"]["publish_hour"] == 8
        res = client.patch("/api/blog/admin/config", json={"publish_hour": 19}, headers=AUTH)
        assert res.get_json()["config"]["publish_hour"] == 19

    def test_config_invalida_e_400_com_o_motivo(self, client, blog, admin):
        res = client.patch("/api/blog/admin/config", json={"publish_hour": 99}, headers=AUTH)
        assert res.status_code == 400 and "publish_hour" in res.get_json()["error"]


class TestAgendador:
    def test_chave_errada_nao_roda(self, client, blog):
        assert client.post("/api/blog/tick?key=errada").status_code == 403

    def test_chave_certa_publica_os_vencidos(self, client, blog, admin):
        store.save_config({"delay_days": 0, "publish_hour": 8, "generate_weekdays": []})
        service.generate("t", now=utc(2026, 9, 14, 21))
        res = client.post("/api/blog/tick?key=chave-do-agendador&now=2026-09-15T12:00:00Z")
        assert res.get_json()["published"] == 1

    def test_chave_vazia_no_servidor_nao_libera(self, client, blog, monkeypatch):
        monkeypatch.setattr(routes, "TICK_KEY", "")
        assert client.post("/api/blog/tick?key=").status_code == 403
