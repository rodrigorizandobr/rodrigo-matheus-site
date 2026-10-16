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

    def test_busca_ancorada_em_tecnologia_para_nao_pegar_sentido_ambiguo(self, fake):
        # medido: "arquitetura" sozinho trouxe vídeo de construção civil, não de software
        videos.search_youtube("arquitetura quando o time cresce")
        corpo = fake.calls[0]["json"]
        assert "engenharia de software" in corpo["q"]


class TestAncoraERecencia:
    def test_sem_ancora_nao_acrescenta_dominio(self, fake):
        # notícia da Tesla não é "engenharia de software": a âncora atrapalharia a busca
        videos.search_youtube("Tesla Roadster event", anchor=False)
        assert "engenharia de software" not in fake.calls[0]["json"]["q"]

    def test_recente_pede_so_a_ultima_semana(self, fake):
        videos.search_youtube("Tesla Roadster event", recent=True)
        assert fake.calls[0]["json"]["tbs"] == "qdr:w"

    def test_padrao_continua_com_ancora_e_sem_recorte_de_data(self, fake):
        videos.search_youtube("liderança")
        corpo = fake.calls[0]["json"]
        assert "engenharia de software" in corpo["q"] and "tbs" not in corpo


class TestCanalOficialPrimeiro:
    """Medido: buscando o Roadster, a ABC News veio antes do canal da Tesla — e com faixa de
    reportagem e "LIVE views" por cima o vídeo inteiro. A fonte original é mais limpa."""

    def test_prefere_o_canal_que_bate_com_o_protagonista(self, fake):
        fake.payload = _resposta([
            {"title": "Elon unveils Roadster", "link": "https://www.youtube.com/watch?v=aaaaaaaaaaa", "channel": "ABC News"},
            {"title": "Roadster Event", "link": "https://www.youtube.com/watch?v=bbbbbbbbbbb", "channel": "Tesla"},
        ])
        r = videos.search_youtube("Tesla rocket car", prefer="Tesla Roadster")
        assert r.channel == "Tesla"

    def test_sem_canal_que_bata_fica_o_primeiro(self, fake):
        fake.payload = _resposta([
            {"title": "A", "link": "https://www.youtube.com/watch?v=aaaaaaaaaaa", "channel": "ABC News"},
            {"title": "B", "link": "https://www.youtube.com/watch?v=bbbbbbbbbbb", "channel": "CNN"},
        ])
        assert videos.search_youtube("Tesla", prefer="Tesla").channel == "ABC News"

    def test_ignora_acento_caixa_e_palavra_curta(self, fake):
        # "de", "IA" não podem casar canal por acaso
        fake.payload = _resposta([
            {"title": "A", "link": "https://www.youtube.com/watch?v=aaaaaaaaaaa", "channel": "Canal de Notícias"},
            {"title": "B", "link": "https://www.youtube.com/watch?v=bbbbbbbbbbb", "channel": "OPENAI"},
        ])
        assert videos.search_youtube("x", prefer="robô de IA da OpenAI").channel == "OPENAI"
