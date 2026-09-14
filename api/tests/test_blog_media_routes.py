"""Rotas da biblioteca de mídia — todas atrás do login, imagem servida sem login."""
import io

import pytest
from PIL import Image

import server
from blog import auth, images, media, routes, store
from tests.fakes import FakeBucket, FakeDb, FakeFilter

AUTH = {"Authorization": "Bearer t"}


def png(cor=(200, 200, 205)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (900, 500), cor).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def env(monkeypatch):
    bucket, db = FakeBucket(), FakeDb()
    monkeypatch.setattr(media, "_bucket", lambda: bucket)
    monkeypatch.setattr(media, "_db", lambda: db)
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    return bucket, db


@pytest.fixture
def admin(monkeypatch):
    monkeypatch.setattr(routes, "verify_admin", lambda h: "rodrigorizando@gmail.com")


@pytest.fixture
def anon(monkeypatch):
    def recusa(h):
        raise auth.AuthError("sem token")
    monkeypatch.setattr(routes, "verify_admin", recusa)


class TestPortaria:
    @pytest.mark.parametrize("metodo,url", [
        ("get", "/api/blog/admin/media"),
        ("post", "/api/blog/admin/media/generate"),
        ("get", "/api/blog/admin/media/stock?q=x"),
        ("delete", "/api/blog/admin/media/" + "a" * 64),
    ])
    def test_sem_token_401(self, client, env, anon, metodo, url):
        assert getattr(client, metodo)(url).status_code == 401

    def test_a_imagem_em_si_e_publica(self, client, env, admin):
        item = media.store_image(png(), provider="upload")
        assert client.get(f"/api/blog/image/{item['hash']}.jpg").status_code == 200


class TestUpload:
    def test_envia_arquivo_e_entra_na_biblioteca(self, client, env, admin):
        res = client.post("/api/blog/admin/media/upload", headers=AUTH,
                          data={"file": (io.BytesIO(png()), "foto.png"), "alt": "minha foto"},
                          content_type="multipart/form-data")
        assert res.status_code == 201
        item = res.get_json()["item"]
        assert item["provider"] == "upload" and item["alt"] == "minha foto"
        assert len(media.list_media()) == 1

    def test_sem_arquivo_e_400(self, client, env, admin):
        assert client.post("/api/blog/admin/media/upload", headers=AUTH, data={},
                           content_type="multipart/form-data").status_code == 400

    def test_arquivo_que_nao_e_imagem_e_400(self, client, env, admin):
        res = client.post("/api/blog/admin/media/upload", headers=AUTH,
                          data={"file": (io.BytesIO(b"texto qualquer"), "x.txt")},
                          content_type="multipart/form-data")
        assert res.status_code == 400

    def test_arquivo_grande_demais_e_recusado(self, client, env, admin):
        grande = b"\x89PNG\r\n\x1a\n" + b"0" * (routes.MAX_UPLOAD_BYTES + 1)
        res = client.post("/api/blog/admin/media/upload", headers=AUTH,
                          data={"file": (io.BytesIO(grande), "g.png")},
                          content_type="multipart/form-data")
        assert res.status_code == 413


class TestCriarComIA:
    def test_gera_e_cataloga(self, client, env, admin, monkeypatch):
        monkeypatch.setattr(images, "generate_image",
                            lambda prompt, alt="": media.store_image(png(), provider="gemini", alt=alt, prompt=prompt))
        res = client.post("/api/blog/admin/media/generate", headers=AUTH,
                          json={"prompt": "lab branco", "alt": "capa"})
        assert res.status_code == 201 and res.get_json()["item"]["provider"] == "gemini"

    def test_prompt_vazio_e_400(self, client, env, admin):
        assert client.post("/api/blog/admin/media/generate", headers=AUTH, json={"prompt": " "}).status_code == 400

    def test_falha_da_ia_vira_502(self, client, env, admin, monkeypatch):
        monkeypatch.setattr(images, "generate_image", lambda *a, **k: None)
        assert client.post("/api/blog/admin/media/generate", headers=AUTH, json={"prompt": "x"}).status_code == 502


class TestBancoDeImagens:
    def test_busca_devolve_candidatas(self, client, env, admin, monkeypatch):
        monkeypatch.setattr(images, "search_stock", lambda q, per_page=24: [
            {"id": "1", "thumb": "t.jpg", "url": "b.jpg", "credit": "A / Pixabay", "sourceUrl": "p", "width": 1, "height": 1}])
        dados = client.get("/api/blog/admin/media/stock?q=lab", headers=AUTH).get_json()
        assert dados["results"][0]["credit"] == "A / Pixabay"

    def test_busca_sem_termo_e_400(self, client, env, admin):
        assert client.get("/api/blog/admin/media/stock?q=", headers=AUTH).status_code == 400

    def test_importar_a_escolhida_cataloga_como_nossa(self, client, env, admin, monkeypatch):
        monkeypatch.setattr(images, "import_stock",
                            lambda url, credit="", source_url="", alt="": media.store_image(
                                png(), provider="pixabay", credit=credit, source_url=source_url, alt=alt))
        res = client.post("/api/blog/admin/media/stock", headers=AUTH,
                          json={"url": "https://x/big.jpg", "credit": "A / Pixabay", "sourceUrl": "https://p"})
        assert res.status_code == 201
        assert media.list_media()[0]["sourceUrl"] == "https://p"


class TestEdicaoEExclusao:
    def test_editar_legenda(self, client, env, admin):
        item = media.store_image(png(), provider="upload", alt="antes")
        res = client.patch(f"/api/blog/admin/media/{item['hash']}", headers=AUTH, json={"alt": "depois"})
        assert res.get_json()["item"]["alt"] == "depois"

    def test_apagar(self, client, env, admin):
        item = media.store_image(png(), provider="upload")
        assert client.delete(f"/api/blog/admin/media/{item['hash']}", headers=AUTH).status_code == 200
        assert media.list_media() == []

    def test_apagar_imagem_em_uso_devolve_409_dizendo_onde(self, client, env, admin):
        item = media.store_image(png(), provider="upload")
        store.create_post({"slugBase": "p", "i18n": {}, "image": {"hash": item["hash"]}})
        res = client.delete(f"/api/blog/admin/media/{item['hash']}", headers=AUTH)
        assert res.status_code == 409 and "uso" in res.get_json()["error"]


class TestCapaDoPostPelaBiblioteca:
    def test_escolher_da_biblioteca_pelo_hash(self, client, env, admin):
        item = media.store_image(png(), provider="upload", alt="da biblioteca")
        post = store.create_post({"slugBase": "p", "i18n": {}})
        res = client.post(f"/api/blog/admin/posts/{post['id']}/cover", headers=AUTH,
                          json={"hash": item["hash"]})
        assert res.get_json()["post"]["image"]["hash"] == item["hash"]
        assert res.get_json()["post"]["image"]["alt"] == "da biblioteca"

    def test_hash_inexistente_e_404(self, client, env, admin):
        post = store.create_post({"slugBase": "p", "i18n": {}})
        assert client.post(f"/api/blog/admin/posts/{post['id']}/cover", headers=AUTH,
                           json={"hash": "b" * 64}).status_code == 404

    def test_tirar_a_capa(self, client, env, admin):
        item = media.store_image(png(), provider="upload")
        post = store.create_post({"slugBase": "p", "i18n": {}, "image": {"hash": item["hash"]}})
        res = client.post(f"/api/blog/admin/posts/{post['id']}/cover", headers=AUTH, json={"hash": None})
        assert res.get_json()["post"]["image"] is None
