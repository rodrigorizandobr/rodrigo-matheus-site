"""Capa do post: IA primeiro, banco de imagens como reserva, sempre regravada no nosso Storage."""
import base64
import io

import pytest
from PIL import Image

from blog import images
from tests.fakes import FakeBucket


def _png(w=1200, h=700, cor=(240, 240, 242)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), cor).save(buf, format="PNG")
    return buf.getvalue()


class FakeResp:
    def __init__(self, payload=None, content=b"", status=200):
        self._payload, self.content, self.status_code = payload, content, status
        self.ok = status < 400
        self.text = str(payload)

    def json(self):
        return self._payload


@pytest.fixture
def bucket(monkeypatch):
    b = FakeBucket()
    monkeypatch.setattr(images, "_bucket", lambda: b)
    return b


@pytest.fixture
def gemini_ok(monkeypatch):
    payload = {"candidates": [{"content": {"parts": [
        {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(_png()).decode()}}
    ]}}]}
    monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp(payload))
    monkeypatch.setattr(images, "API_KEY", "k")


class TestGeracaoComIA:
    def test_gera_converte_para_jpeg_e_grava_pelo_hash(self, bucket, gemini_ok):
        capa = images.build_cover("sterile white lab", "alt")
        assert capa["provider"] == "gemini"
        assert len(capa["hash"]) == 64
        nome = f"{images.PREFIX}/{capa['hash']}.jpg"
        assert bucket.objects[nome]["content_type"] == "image/jpeg"
        assert bucket.objects[nome]["data"][:2] == b"\xff\xd8", "precisa ser JPEG de verdade"

    def test_imagem_grande_e_reduzida_ao_lado_maximo(self, bucket, monkeypatch):
        payload = {"candidates": [{"content": {"parts": [
            {"inlineData": {"data": base64.b64encode(_png(4000, 2000)).decode()}}
        ]}}]}
        monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp(payload))
        monkeypatch.setattr(images, "API_KEY", "k")
        capa = images.build_cover("x", "alt")
        img = Image.open(io.BytesIO(bucket.objects[f"{images.PREFIX}/{capa['hash']}.jpg"]["data"]))
        assert max(img.size) == images.MAX_SIDE

    def test_o_mesmo_conteudo_nao_e_gravado_duas_vezes(self, bucket, gemini_ok):
        a = images.build_cover("x", "alt")
        b = images.build_cover("x", "alt")
        assert a["hash"] == b["hash"]
        assert len(bucket.objects) == 1

    def test_o_prompt_de_arte_do_site_vai_junto(self, bucket, monkeypatch):
        capturado = {}
        def fake_post(url, **kw):
            capturado.update(kw)
            return FakeResp({"candidates": [{"content": {"parts": [
                {"inlineData": {"data": base64.b64encode(_png()).decode()}}]}}]})
        monkeypatch.setattr(images.requests, "post", fake_post)
        monkeypatch.setattr(images, "API_KEY", "k")
        images.build_cover("um robô", "alt")
        texto = str(capturado["json"])
        assert "um robô" in texto and "sterile" in texto.lower()


class TestReservaPixabay:
    def test_ia_falhando_cai_no_banco_de_imagens(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "k")
        monkeypatch.setattr(images, "PIXABAY_KEY", "px")
        monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp({"error": "cota"}, status=429))

        def fake_get(url, **kw):
            if "pixabay" in url:
                return FakeResp({"hits": [{"id": 7, "largeImageURL": "https://img/x.jpg",
                                           "imageWidth": 1200, "imageHeight": 700,
                                           "user": "Fulano", "pageURL": "https://pixabay.com/x"}]})
            return FakeResp(content=_png())
        monkeypatch.setattr(images.requests, "get", fake_get)

        capa = images.build_cover("x", "alt", keywords=["laboratory"])
        assert capa["provider"] == "pixabay"
        assert capa["credit"] == "Fulano / Pixabay"
        assert capa["sourceUrl"] == "https://pixabay.com/x"

    def test_reserva_ignora_imagem_em_pe(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "")
        monkeypatch.setattr(images, "PIXABAY_KEY", "px")
        monkeypatch.setattr(images.requests, "get", lambda url, **kw: FakeResp(
            {"hits": [{"id": 1, "largeImageURL": "u", "imageWidth": 600, "imageHeight": 900,
                       "user": "A", "pageURL": "p"}]}))
        assert images.build_cover("x", "alt", keywords=["a"]) is None

    def test_sem_ia_e_sem_banco_o_post_sai_sem_capa_em_vez_de_falhar(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "")
        monkeypatch.setattr(images, "PIXABAY_KEY", "")
        assert images.build_cover("x", "alt") is None


class TestLeitura:
    def test_le_de_volta_o_que_gravou(self, bucket, gemini_ok):
        capa = images.build_cover("x", "alt")
        assert images.read_image(capa["hash"])[:2] == b"\xff\xd8"

    def test_hash_inexistente_devolve_None(self, bucket):
        assert images.read_image("a" * 64) is None

    def test_hash_malformado_nao_vira_caminho_no_bucket(self, bucket):
        assert images.read_image("../../etc/passwd") is None
