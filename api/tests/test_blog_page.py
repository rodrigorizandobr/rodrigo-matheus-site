"""Página do post servida pelo backend: prévia de link correta mesmo para post publicado sozinho."""
import pytest

import server
from blog import page, store
from tests.fakes import FakeDb, FakeFilter

SHELL = """<!doctype html><html><head>
<title>Rodrigo Matheus</title>
<meta name="description" content="generico" />
<meta property="og:title" content="Rodrigo Matheus" />
<meta property="og:description" content="generico" />
<meta property="og:image" content="https://rodrigomatheus.com.br/og-image.png" />
<meta property="og:type" content="website" />
</head><body><div id="root"></div></body></html>"""


@pytest.fixture
def blog(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    monkeypatch.setattr(page, "_shell", lambda: SHELL)
    return db


def _post(**over):
    base = {
        "slugBase": "meu-post", "tags": ["ia"],
        "i18n": {l: {"title": f"Título {l}", "excerpt": f"Resumo {l}",
                     "sections": [{"heading": "h", "paragraphs": ["p"]}]} for l in ("pt", "en")},
        "image": {"hash": "a" * 64, "provider": "gemini", "credit": "c", "sourceUrl": "", "alt": "capa"},
    }
    return {**base, **over}


class TestPaginaDoPost:
    def test_titulo_e_og_recebem_o_post(self, client, blog):
        post = store.create_post(_post())
        store.publish_post(post["id"])
        html = client.get(f"/blog/{post['slug']}").get_data(as_text=True)
        assert "<title>Título pt — Rodrigo Matheus</title>" in html
        assert 'og:title" content="Título pt"' in html
        assert 'og:description" content="Resumo pt"' in html
        assert 'og:type" content="article"' in html

    def test_a_capa_do_post_vira_a_imagem_da_previa(self, client, blog):
        post = store.create_post(_post())
        store.publish_post(post["id"])
        html = client.get(f"/blog/{post['slug']}").get_data(as_text=True)
        assert f'og:image" content="https://rodrigomatheus.com.br/api/blog/image/{"a" * 64}.jpg"' in html

    def test_post_sem_capa_mantem_a_imagem_padrao_do_site(self, client, blog):
        post = store.create_post(_post(image=None))
        store.publish_post(post["id"])
        html = client.get(f"/blog/{post['slug']}").get_data(as_text=True)
        assert "og-image.png" in html

    def test_canonical_e_data_de_publicacao(self, client, blog):
        post = store.create_post(_post())
        store.publish_post(post["id"])
        html = client.get(f"/blog/{post['slug']}").get_data(as_text=True)
        assert f'rel="canonical" href="https://rodrigomatheus.com.br/blog/{post["slug"]}"' in html
        assert "article:published_time" in html

    def test_o_app_react_continua_na_pagina(self, client, blog):
        post = store.create_post(_post())
        store.publish_post(post["id"])
        assert '<div id="root">' in client.get(f"/blog/{post['slug']}").get_data(as_text=True)

    def test_slug_inexistente_devolve_o_shell_com_404(self, client, blog):
        res = client.get("/blog/nao-existe")
        assert res.status_code == 404
        assert '<div id="root">' in res.get_data(as_text=True), "o app ainda renderiza a tela de 404"

    def test_rascunho_nao_vaza_titulo_na_previa(self, client, blog):
        post = store.create_post(_post())
        res = client.get(f"/blog/{post['slug']}")
        assert res.status_code == 404
        assert "Título pt" not in res.get_data(as_text=True)

    def test_html_e_cacheado_pela_CDN_mas_revalidado(self, client, blog):
        post = store.create_post(_post())
        store.publish_post(post["id"])
        cc = client.get(f"/blog/{post['slug']}").headers["Cache-Control"]
        assert "s-maxage" in cc

    def test_aspas_no_titulo_nao_quebram_a_metatag(self, client, blog):
        mau = _post()
        mau["i18n"]["pt"]["title"] = 'Ele disse "oi" & saiu'
        post = store.create_post(mau)
        store.publish_post(post["id"])
        html = client.get(f"/blog/{post['slug']}").get_data(as_text=True)
        assert 'og:title" content="Ele disse &quot;oi&quot; &amp; saiu"' in html

    def test_shell_indisponivel_nao_derruba_a_rota(self, client, blog, monkeypatch):
        monkeypatch.setattr(page, "_shell", lambda: None)
        post = store.create_post(_post())
        store.publish_post(post["id"])
        assert client.get(f"/blog/{post['slug']}").status_code == 302
