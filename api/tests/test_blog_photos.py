"""Foto real para a capa: a da própria matéria primeiro, depois a busca de imagens.

Terceira opção da escada de mídia (vídeo recortado → foto real → imagem de IA). O módulo só ACHA,
confere com visão e grava na biblioteca; nada de rede nestes testes."""
import io

from PIL import Image

from blog import photos


def jpeg(w=1280, h=720) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 30, 30)).save(buf, format="JPEG")
    return buf.getvalue()


class TestImagemDaPagina:
    def test_le_og_image_com_a_propriedade_antes_do_conteudo(self):
        html = '<head><meta property="og:image" content="https://cdn.x.com/a.jpg"></head>'
        assert photos.extract_image_url(html, "https://x.com/materia") == "https://cdn.x.com/a.jpg"

    def test_le_og_image_com_o_conteudo_antes_da_propriedade(self):
        html = '<meta content="https://cdn.x.com/b.jpg" property="og:image"/>'
        assert photos.extract_image_url(html, "https://x.com/m") == "https://cdn.x.com/b.jpg"

    def test_cai_para_twitter_image(self):
        html = '<meta name="twitter:image" content="https://cdn.x.com/c.jpg">'
        assert photos.extract_image_url(html, "https://x.com/m") == "https://cdn.x.com/c.jpg"

    def test_caminho_relativo_vira_absoluto(self):
        html = '<meta property="og:image" content="/img/d.jpg">'
        assert photos.extract_image_url(html, "https://x.com/m/1") == "https://x.com/img/d.jpg"

    def test_sem_imagem_devolve_vazio(self):
        assert photos.extract_image_url("<html></html>", "https://x.com") == ""

    def test_entidade_html_na_url_e_desfeita(self):
        html = '<meta property="og:image" content="https://x.com/a.jpg?w=1&amp;h=2">'
        assert photos.extract_image_url(html, "https://x.com") == "https://x.com/a.jpg?w=1&h=2"


class TestServeComoCapa:
    def test_paisagem_grande_serve(self):
        assert photos.usable(jpeg(1280, 720))

    def test_pequena_demais_nao_serve(self):
        assert not photos.usable(jpeg(400, 225))

    def test_retrato_nao_serve(self):
        # vertical fica horrível esticada na largura do cabeçalho do post
        assert not photos.usable(jpeg(900, 1400))

    def test_quase_quadrada_nao_serve(self):
        assert not photos.usable(jpeg(1000, 900))

    def test_lixo_que_nao_e_imagem_nao_serve(self):
        assert not photos.usable(b"<html>403</html>")


class TestBuscaDeImagens:
    def _serper(self, monkeypatch, itens):
        class Res:
            ok = True
            def json(self): return {"images": itens}
        chamadas = []
        monkeypatch.setattr(photos, "SERPER_KEY", "k")
        monkeypatch.setattr(photos.requests, "post", lambda url, **kw: chamadas.append((url, kw)) or Res())
        return chamadas

    def test_mapeia_url_pagina_e_veiculo(self, monkeypatch):
        self._serper(monkeypatch, [{"imageUrl": "https://i.g1.com/a.jpg", "link": "https://g1.com/m",
                                    "source": "g1", "imageWidth": 1600, "imageHeight": 900}])
        assert photos.search_images("robô") == [
            {"url": "https://i.g1.com/a.jpg", "page": "https://g1.com/m", "source": "g1"}]

    def test_busca_no_endpoint_de_imagens_no_brasil(self, monkeypatch):
        chamadas = self._serper(monkeypatch, [])
        photos.search_images("robô")
        url, kw = chamadas[0]
        assert url.endswith("/images") and kw["json"]["q"] == "robô" and kw["json"]["gl"] == "br"

    def test_descarta_banco_de_imagem_com_marca_dagua(self, monkeypatch):
        self._serper(monkeypatch, [
            {"imageUrl": "https://image.shutterstock.com/a.jpg", "link": "https://shutterstock.com/x", "source": "Shutterstock"},
            {"imageUrl": "https://media.gettyimages.com/b.jpg", "link": "https://gettyimages.com/y", "source": "Getty"},
            {"imageUrl": "https://i.g1.com/ok.jpg", "link": "https://g1.com/m", "source": "g1"},
        ])
        assert [c["url"] for c in photos.search_images("robô")] == ["https://i.g1.com/ok.jpg"]

    def test_descarta_miniatura_de_video_e_rede_social(self, monkeypatch):
        # medido no robô policial: miniatura do YouTube vem com letreiro por cima e o Instagram nega o download
        self._serper(monkeypatch, [
            {"imageUrl": "https://i.ytimg.com/vi/x/maxresdefault.jpg", "link": "https://youtube.com/watch?v=x", "source": "YouTube"},
            {"imageUrl": "https://lookaside.instagram.com/seo/a", "link": "https://instagram.com/p/y", "source": "Instagram"},
            {"imageUrl": "https://scontent.fbcdn.net/z.jpg", "link": "https://facebook.com/z", "source": "Facebook"},
            {"imageUrl": "https://i.g1.com/ok.jpg", "link": "https://g1.com/m", "source": "g1"},
        ])
        assert [c["url"] for c in photos.search_images("robô")] == ["https://i.g1.com/ok.jpg"]

    def test_descarta_pela_medida_quando_o_buscador_informa(self, monkeypatch):
        self._serper(monkeypatch, [
            {"imageUrl": "https://x.com/mini.jpg", "link": "https://x.com/1", "source": "x", "imageWidth": 300, "imageHeight": 200},
            {"imageUrl": "https://x.com/alta.jpg", "link": "https://x.com/2", "source": "x", "imageWidth": 1500, "imageHeight": 1000},
        ])
        assert [c["url"] for c in photos.search_images("robô")] == ["https://x.com/alta.jpg"]

    def test_sem_chave_ou_com_erro_devolve_vazio(self, monkeypatch):
        monkeypatch.setattr(photos, "SERPER_KEY", "")
        assert photos.search_images("robô") == []
        monkeypatch.setattr(photos, "SERPER_KEY", "k")
        monkeypatch.setattr(photos.requests, "post", lambda *a, **k: (_ for _ in ()).throw(OSError("fora")))
        assert photos.search_images("robô") == []


class TestAcharFoto:
    def _mundo(self, monkeypatch, *, paginas=None, busca=None, baixa=None, aprova=lambda raw, s: True):
        monkeypatch.setattr(photos, "page_image", lambda url: (paginas or {}).get(url, ""))
        monkeypatch.setattr(photos, "search_images", lambda q: (busca or {}).get(q, []))
        monkeypatch.setattr(photos, "_download", lambda url: (baixa or {}).get(url))
        vistos = {"aprovou": [], "gravou": []}
        monkeypatch.setattr(photos.gemini, "photo_fits", lambda raw, subject: vistos["aprovou"].append(subject) or aprova(raw, subject))
        def grava(raw, provider, alt="", credit="", source_url="", prompt=""):
            vistos["gravou"].append({"provider": provider, "credit": credit, "source_url": source_url, "alt": alt})
            return {"hash": "a" * 64, "provider": provider, "credit": credit, "sourceUrl": source_url, "alt": alt,
                    "width": 1280, "height": 720}
        monkeypatch.setattr(photos.media, "store_image", grava)
        return vistos

    def test_a_foto_da_propria_materia_vem_primeiro(self, monkeypatch):
        vistos = self._mundo(monkeypatch,
                             paginas={"https://g1.globo.com/m": "https://s.glbimg.com/a.jpg"},
                             busca={"robot": [{"url": "https://outro.com/b.jpg", "page": "https://outro.com/p", "source": "outro"}]},
                             baixa={"https://s.glbimg.com/a.jpg": jpeg(), "https://outro.com/b.jpg": jpeg()})
        capa = photos.find("Arcanjo, robô policial", ["robot"], ["https://g1.globo.com/m"], alt="Robô")
        assert capa["sourceUrl"] == "https://g1.globo.com/m"
        assert capa["credit"] == "Foto: g1.globo.com"
        assert capa["provider"] == "web"
        assert len(vistos["gravou"]) == 1

    def test_foto_reprovada_pela_visao_passa_para_a_proxima(self, monkeypatch):
        chamadas = []
        def aprova(raw, subject):
            chamadas.append(1)
            return len(chamadas) == 2
        vistos = self._mundo(monkeypatch,
                             paginas={"https://g1.globo.com/m": "https://s.glbimg.com/a.jpg"},
                             busca={"robot": [{"url": "https://outro.com/b.jpg", "page": "https://outro.com/p", "source": "Outro Veículo"}]},
                             baixa={"https://s.glbimg.com/a.jpg": jpeg(), "https://outro.com/b.jpg": jpeg()},
                             aprova=aprova)
        capa = photos.find("assunto", ["robot"], ["https://g1.globo.com/m"])
        assert capa["credit"] == "Foto: Outro Veículo" and capa["sourceUrl"] == "https://outro.com/p"

    def test_a_visao_recebe_o_assunto_do_post(self, monkeypatch):
        vistos = self._mundo(monkeypatch, busca={"q": [{"url": "https://x.com/a.jpg", "page": "https://x.com", "source": "x"}]},
                             baixa={"https://x.com/a.jpg": jpeg()})
        photos.find("Arcanjo chuta portas", ["q"], [])
        assert vistos["aprovou"] == ["Arcanjo chuta portas"]

    def test_imagem_que_nao_serve_de_capa_nem_chega_na_visao(self, monkeypatch):
        vistos = self._mundo(monkeypatch, busca={"q": [{"url": "https://x.com/a.jpg", "page": "https://x.com", "source": "x"}]},
                             baixa={"https://x.com/a.jpg": jpeg(300, 200)})
        assert photos.find("a", ["q"], []) is None
        assert vistos["aprovou"] == []

    def test_download_que_falha_e_pulado(self, monkeypatch):
        self._mundo(monkeypatch, busca={"q": [{"url": "https://x.com/403.jpg", "page": "https://x.com", "source": "x"},
                                              {"url": "https://x.com/ok.jpg", "page": "https://x.com/2", "source": "x"}]},
                    baixa={"https://x.com/ok.jpg": jpeg()})
        assert photos.find("a", ["q"], [])["sourceUrl"] == "https://x.com/2"

    def test_nada_aprovado_devolve_none(self, monkeypatch):
        self._mundo(monkeypatch, busca={"q": [{"url": "https://x.com/a.jpg", "page": "https://x.com", "source": "x"}]},
                    baixa={"https://x.com/a.jpg": jpeg()}, aprova=lambda r, s: False)
        assert photos.find("a", ["q"], []) is None

    def test_nao_gasta_visao_sem_limite(self, monkeypatch):
        itens = [{"url": f"https://x.com/{i}.jpg", "page": f"https://x.com/{i}", "source": "x"} for i in range(20)]
        vistos = self._mundo(monkeypatch, busca={"q": itens}, baixa={i["url"]: jpeg() for i in itens},
                             aprova=lambda r, s: False)
        photos.find("a", ["q"], [])
        assert len(vistos["aprovou"]) == photos.MAX_TRIES

    def test_mesma_imagem_em_duas_fontes_e_vista_uma_vez(self, monkeypatch):
        vistos = self._mundo(monkeypatch,
                             paginas={"https://a.com/m": "https://cdn.com/x.jpg"},
                             busca={"q": [{"url": "https://cdn.com/x.jpg", "page": "https://b.com", "source": "b"}]},
                             baixa={"https://cdn.com/x.jpg": jpeg()}, aprova=lambda r, s: False)
        photos.find("a", ["q"], ["https://a.com/m"])
        assert len(vistos["aprovou"]) == 1

    def test_erro_inesperado_nunca_escapa(self, monkeypatch):
        self._mundo(monkeypatch)
        monkeypatch.setattr(photos, "search_images", lambda q: (_ for _ in ()).throw(RuntimeError("boom")))
        assert photos.find("a", ["q"], []) is None


class TestPosterDoYoutube:
    """Recorte pronto e post sem capa: o quadro de abertura do próprio vídeo serve de pôster."""

    def test_pega_a_maior_versao_do_video(self, monkeypatch):
        pedidos = []
        monkeypatch.setattr(photos, "_download", lambda url: pedidos.append(url) or jpeg(1280, 720))
        assert photos.youtube_poster("https://www.youtube.com/watch?v=qt5p-_tE8d0&t=3s") is not None
        assert pedidos == ["https://i.ytimg.com/vi/qt5p-_tE8d0/maxresdefault.jpg"]

    def test_aceita_link_curto(self, monkeypatch):
        pedidos = []
        monkeypatch.setattr(photos, "_download", lambda url: pedidos.append(url) or jpeg())
        photos.youtube_poster("https://youtu.be/qt5p-_tE8d0")
        assert "qt5p-_tE8d0" in pedidos[0]

    def test_quadro_pequeno_ou_ausente_nao_serve(self, monkeypatch):
        monkeypatch.setattr(photos, "_download", lambda url: jpeg(480, 360))
        assert photos.youtube_poster("https://youtu.be/qt5p-_tE8d0") is None
        monkeypatch.setattr(photos, "_download", lambda url: None)
        assert photos.youtube_poster("https://youtu.be/qt5p-_tE8d0") is None

    def test_link_que_nao_e_do_youtube_devolve_none(self, monkeypatch):
        monkeypatch.setattr(photos, "_download", lambda url: jpeg())
        assert photos.youtube_poster("https://vimeo.com/123") is None
