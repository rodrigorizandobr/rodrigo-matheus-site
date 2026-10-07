"""Busca de vídeo no YouTube via Serper — nunca baixa nada, só descobre o link."""
import pytest

from blog import videos


def _resposta(itens):
    return {"videos": itens}


class FakePost:
    def __init__(self, payload, status=200):
        self.payload, self.status, self.calls = payload, status, []

    def __call__(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return type("R", (), {
            "status_code": self.status, "ok": self.status < 400,
            "json": lambda _self: self.payload,
        })()


@pytest.fixture
def fake(monkeypatch):
    f = FakePost(_resposta([]))
    monkeypatch.setattr(videos.requests, "post", f)
    monkeypatch.setattr(videos, "SERPER_KEY", "chave-de-teste")
    return f


class TestBuscaDeVideo:
    def test_sem_chave_nao_tenta_e_devolve_vazio(self, fake, monkeypatch):
        monkeypatch.setattr(videos, "SERPER_KEY", "")
        r = videos.search_youtube("liderança em engenharia")
        assert not r
        assert fake.calls == []

    def test_manda_a_chave_e_o_endpoint_de_video(self, fake):
        fake.payload = _resposta([{"title": "T", "link": "https://www.youtube.com/watch?v=abc", "imageUrl": "https://i/img.jpg", "channel": "Canal X"}])
        videos.search_youtube("liderança")
        chamada = fake.calls[0]
        assert "videos" in chamada["url"]
        assert chamada["headers"]["X-API-KEY"] == "chave-de-teste"

    def test_devolve_o_primeiro_resultado_do_youtube(self, fake):
        fake.payload = _resposta([{"title": "Como liderar", "link": "https://www.youtube.com/watch?v=abc", "imageUrl": "https://i/img.jpg", "channel": "Canal X"}])
        r = videos.search_youtube("liderança")
        assert r.url == "https://www.youtube.com/watch?v=abc"
        assert r.title == "Como liderar"
        assert r.channel == "Canal X"
        assert r.thumbnail == "https://i/img.jpg"

    def test_pula_resultado_que_nao_e_do_youtube(self, fake):
        fake.payload = _resposta([
            {"title": "Outro site", "link": "https://exemplo.com/video"},
            {"title": "Do YouTube", "link": "https://youtu.be/xyz"},
        ])
        r = videos.search_youtube("liderança")
        assert r.url == "https://youtu.be/xyz"

    def test_sem_resultado_nenhum_devolve_vazio(self, fake):
        fake.payload = _resposta([{"title": "Só site", "link": "https://exemplo.com/video"}])
        r = videos.search_youtube("liderança")
        assert not r

    def test_erro_http_devolve_vazio_em_vez_de_estourar(self, fake):
        fake.status = 500
        r = videos.search_youtube("liderança")
        assert not r

    def test_excecao_de_rede_devolve_vazio_em_vez_de_estourar(self, monkeypatch):
        def explode(*a, **k): raise ConnectionError("rede fora")
        monkeypatch.setattr(videos.requests, "post", explode)
        monkeypatch.setattr(videos, "SERPER_KEY", "chave")
        assert not videos.search_youtube("liderança")

    def test_busca_inclui_o_tema_e_filtra_para_youtube(self, fake):
        videos.search_youtube("liderança")
        corpo = fake.calls[0]["json"]
        assert "liderança" in corpo["q"]
        assert "youtube.com" in corpo["q"]
