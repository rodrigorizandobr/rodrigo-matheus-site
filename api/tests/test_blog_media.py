"""Biblioteca de mídia: tudo que entra é regravado como JPEG nosso e catalogado."""
import io

import pytest
from PIL import Image

from blog import media, store
from tests.fakes import FakeBucket, FakeDb, FakeFilter


def png(w=1200, h=700, cor=(230, 230, 235)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), cor).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def env(monkeypatch):
    bucket, db = FakeBucket(), FakeDb()
    monkeypatch.setattr(media, "_bucket", lambda: bucket)
    monkeypatch.setattr(media, "_db", lambda: db)
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    return bucket, db


class TestGravacao:
    def test_converte_para_jpeg_e_cataloga(self, env):
        bucket, _ = env
        item = media.store_image(png(), provider="upload", alt="uma foto")
        assert len(item["hash"]) == 64
        assert item["provider"] == "upload" and item["alt"] == "uma foto"
        assert item["width"] == 1200 and item["height"] == 700
        assert bucket.objects[f"{media.PREFIX}/{item['hash']}.jpg"]["data"][:2] == b"\xff\xd8"

    def test_imagem_grande_e_reduzida(self, env):
        item = media.store_image(png(4000, 2000), provider="upload")
        assert max(item["width"], item["height"]) == media.MAX_SIDE

    def test_mesmo_conteudo_nao_duplica_nem_arquivo_nem_catalogo(self, env):
        bucket, _ = env
        a = media.store_image(png(), provider="upload", alt="primeira")
        b = media.store_image(png(), provider="upload", alt="segunda")
        assert a["hash"] == b["hash"]
        assert len(bucket.objects) == 1
        assert len(media.list_media()) == 1

    def test_arquivo_que_nao_e_imagem_e_recusado(self, env):
        assert media.store_image(b"isto nao e imagem", provider="upload") is None

    def test_guarda_credito_origem_e_prompt(self, env):
        item = media.store_image(png(), provider="pixabay", credit="Fulano / Pixabay",
                                 source_url="https://pixabay.com/x", prompt="lab branco")
        gravado = media.get_media(item["hash"])
        assert gravado["credit"] == "Fulano / Pixabay"
        assert gravado["sourceUrl"] == "https://pixabay.com/x"
        assert gravado["prompt"] == "lab branco"


class TestCatalogo:
    def test_lista_vem_do_mais_novo_para_o_mais_velho(self, env):
        a = media.store_image(png(cor=(1, 1, 1)), provider="upload")
        b = media.store_image(png(cor=(2, 2, 2)), provider="gemini")
        assert [m["hash"] for m in media.list_media()][:2] == [b["hash"], a["hash"]]

    def test_editar_muda_so_alt_e_credito(self, env):
        item = media.store_image(png(), provider="upload", alt="antes")
        media.update_media(item["hash"], {"alt": "depois", "credit": "novo", "provider": "hackeado"})
        gravado = media.get_media(item["hash"])
        assert gravado["alt"] == "depois" and gravado["credit"] == "novo"
        assert gravado["provider"] == "upload"

    def test_apagar_tira_do_catalogo_e_do_bucket(self, env):
        bucket, _ = env
        item = media.store_image(png(), provider="upload")
        media.delete_media(item["hash"])
        assert media.get_media(item["hash"]) is None
        assert bucket.objects == {}

    def test_nao_apaga_imagem_que_um_post_esta_usando(self, env):
        item = media.store_image(png(), provider="upload")
        post = store.create_post({"slugBase": "p", "i18n": {}, "image": {"hash": item["hash"]}})
        with pytest.raises(media.InUseError, match="post"):
            media.delete_media(item["hash"])
        store.delete_post(post["id"])
        media.delete_media(item["hash"])  # agora pode
        assert media.get_media(item["hash"]) is None

    def test_hash_malformado_nunca_vira_caminho_no_bucket(self, env):
        assert media.read_image("../../etc/passwd") is None
        assert media.get_media("../../x") is None
