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


class TestSemRastroDaOrigem:
    """A capa é material editorial do site. Ela não carrega ficha técnica."""

    def _com_exif(self) -> bytes:
        from PIL import Image
        import io, piexif  # noqa: F401  (piexif é opcional; se faltar, usamos bytes crus)
        img = Image.new("RGB", (40, 30), "white")
        buf = io.BytesIO()
        exif = img.getexif()
        exif[270] = "Made with Google AI"      # ImageDescription
        exif[305] = "gemini-3-pro-image"       # Software
        img.save(buf, format="JPEG", exif=exif.tobytes())
        return buf.getvalue()

    def test_exif_da_origem_nao_sobrevive_ao_arquivo_final(self):
        from PIL import Image
        import io
        try:
            entrada = self._com_exif()
        except ImportError:
            pytest.skip("piexif ausente")
        saida, _, _ = media._jpeg(entrada)
        assert b"Made with Google AI" not in saida
        assert b"gemini-3-pro-image" not in saida
        assert not Image.open(io.BytesIO(saida)).getexif()

    def test_nenhum_bloco_de_metadado_fica_no_jpeg(self):
        from PIL import Image
        import io
        img = Image.new("RGB", (40, 30), "white")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", comment=b"gerado por IA")
        saida, _, _ = media._jpeg(buf.getvalue())
        lido = Image.open(io.BytesIO(saida))
        assert b"gerado por IA" not in saida
        assert not any(k.lower() in ("exif", "xmp", "comment", "icc_profile", "photoshop")
                       for k in lido.info)


class TestQualidadeDaCapa:
    def test_capa_grande_o_bastante_para_o_cartao_do_linkedin(self):
        """O LinkedIn pede 1200 px de largura; 2K do modelo cabe em 1920 sem exagero."""
        from PIL import Image
        import io
        grande = Image.new("RGB", (2752, 1536), "white")
        buf = io.BytesIO(); grande.save(buf, format="JPEG")
        _, largura, altura = media._jpeg(buf.getvalue())
        assert largura == 1920 and altura == 1072
        assert media.MAX_SIDE >= 1920 and largura >= 1200

    def test_vermelho_sobre_branco_sem_subamostragem_de_croma(self):
        """O acento do site é vermelho puro; 4:2:0 borra exatamente essa borda."""
        from PIL import Image, JpegImagePlugin
        import io
        img = Image.new("RGB", (80, 60), "white")
        for x in range(30, 50):
            for y in range(60):
                img.putpixel((x, y), (204, 0, 0))
        buf = io.BytesIO(); img.save(buf, format="JPEG")
        saida, _, _ = media._jpeg(buf.getvalue())
        assert JpegImagePlugin.get_sampling(Image.open(io.BytesIO(saida))) == 0
