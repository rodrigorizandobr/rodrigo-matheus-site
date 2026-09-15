"""Pesquisa na web: Serper + leitura das páginas. Opcional por desenho — sem chave, segue sem ela."""
import pytest

from blog import research


class Resp:
    def __init__(self, payload=None, text="", status=200, content_type="application/json"):
        self._payload, self.text, self.status_code = payload, text, status
        self.ok = status < 400
        self.headers = {"content-type": content_type}

    def json(self):
        return self._payload


def serper(links):
    return {"news": [{"link": l, "title": f"T {i}", "source": f"Veículo {i}", "date": "há 2 dias",
                      "snippet": f"Trecho razoavelmente longo número {i} com conteúdo suficiente para passar do corte mínimo."}
                     for i, l in enumerate(links)]}


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(research, "SERPER_KEY", "chave")


class TestBusca:
    def test_sem_chave_devolve_vazio_sem_chamar_a_rede(self, monkeypatch):
        monkeypatch.setattr(research, "SERPER_KEY", "")
        chamou = []
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: chamou.append(1))
        out = research.search_web(["algo"])
        assert out.context == "" and out.sources == [] and chamou == []

    def test_usa_o_endpoint_de_NOTICIAS_e_restringe_ao_Brasil(self, monkeypatch):
        capturado = {}
        def fake_post(url, **kw):
            capturado.update({"url": url, **kw})
            return Resp(serper(["https://a.com"]))
        monkeypatch.setattr(research.requests, "post", fake_post)
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(status=403))
        research.search_web(["ia"])
        assert capturado["url"].endswith("/news"), "busca web traz página institucional e conteúdo antigo"
        assert capturado["json"]["gl"] == "br" and capturado["json"]["hl"] == "pt-br"

    def test_tolera_resposta_no_formato_da_busca_comum(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(
            {"organic": [{"link": "https://a.com", "title": "T", "snippet": "s" * 60}]}))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(status=403))
        assert research.search_web(["x"]).sources == ["https://a.com"]

    def test_manda_a_chave_e_a_consulta(self, monkeypatch):
        capturado = {}
        def fake_post(url, **kw):
            capturado.update({"url": url, **kw})
            return Resp(serper(["https://a.com"]))
        monkeypatch.setattr(research.requests, "post", fake_post)
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<html><body>conteúdo</body></html>", content_type="text/html"))
        research.search_web(["arquitetura de software"])
        assert "serper" in capturado["url"]
        assert capturado["headers"]["X-API-KEY"] == "chave"
        assert capturado["json"]["q"] == "arquitetura de software"

    def test_varias_consultas_sem_repetir_link(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com", "https://b.com"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<html><body>x</body></html>", content_type="text/html"))
        out = research.search_web(["um", "dois"])
        assert out.sources == ["https://a.com", "https://b.com"]

    def test_busca_falhando_nao_derruba_a_geracao(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("timeout")))
        assert research.search_web(["x"]).context == ""


class TestLeituraDePagina:
    def test_extrai_texto_e_descarta_script_e_estilo(self, monkeypatch):
        html = "<html><head><style>p{color:red}</style></head><body><nav>menu</nav><p>Primeiro parágrafo.</p><script>alert(1)</script><p>Segundo.</p></body></html>"
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text=html, content_type="text/html"))
        ctx = research.search_web(["x"]).context
        assert "Primeiro parágrafo." in ctx and "Segundo." in ctx
        assert "alert(1)" not in ctx and "color:red" not in ctx

    def test_entidades_html_viram_texto(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<body><p>caf&eacute; &amp; leite</p></body>", content_type="text/html"))
        assert "café & leite" in research.search_web(["x"]).context

    def test_pagina_que_bloqueia_nao_impede_as_outras(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://bloqueia.com", "https://ok.com"])))
        def fake_get(url, **kw):
            if "bloqueia" in url:
                return Resp(status=403)
            return Resp(text="<body>texto da pagina boa</body>", content_type="text/html")
        monkeypatch.setattr(research.requests, "get", fake_get)
        out = research.search_web(["x"])
        assert "texto da pagina boa" in out.context
        assert out.pages_read == 1

    def test_nao_HTML_e_ignorado(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com/x.pdf"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="%PDF-1.4", content_type="application/pdf"))
        assert research.search_web(["x"]).pages_read == 0

    def test_os_trechos_da_busca_entram_mesmo_sem_ler_pagina_nenhuma(self, monkeypatch):
        # Cloud Run sai de IP de datacenter e a maioria dos sites recusa; sem os
        # snippets a pesquisa voltaria vazia quase sempre
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(status=403))
        out = research.search_web(["x"])
        assert "Trecho razoavelmente longo" in out.context
        assert out.pages_read == 0 and out.snippets == 1

    def test_contexto_tem_teto_de_tamanho(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<body>" + ("palavra " * 50000) + "</body>", content_type="text/html"))
        assert len(research.search_web(["x"]).context) <= research.MAX_CONTEXT_CHARS


class TestConsultasDeNoticia:
    def test_consulta_e_o_proprio_termo_mais_o_ano(self):
        consultas = research.news_queries("inteligência artificial", year=2026)
        assert consultas[0] == "inteligência artificial"
        assert any("2026" in c for c in consultas)

    def test_termo_vazio_nao_gera_consulta(self):
        assert research.news_queries("   ") == []


class TestReferencias:
    def test_guarda_titulo_e_site_de_cada_fonte(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(
            {"news": [{"link": "https://exame.com/ia/texto", "title": "O futuro da IA", "source": "Exame",
                       "date": "há 3 dias",
                       "snippet": "Trecho longo o suficiente para entrar no contexto da pesquisa."}]}))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<body>lido</body>", content_type="text/html"))
        [ref] = research.search_web(["x"]).references
        assert ref["url"] == "https://exame.com/ia/texto"
        assert ref["title"] == "O futuro da IA"
        assert ref["site"] == "Exame"

    def test_www_e_subdominio_de_numero_saem_do_nome_do_site(self):
        assert research.site_of("https://www1.folha.uol.com.br/x") == "folha.uol.com.br"
        assert research.site_of("https://www.cnnbrasil.com.br/y") == "cnnbrasil.com.br"

    def test_url_estranha_nao_quebra(self):
        assert research.site_of("nao é url") == ""

    def test_fonte_sem_titulo_ainda_vira_referencia(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(
            {"news": [{"link": "https://a.com/x", "snippet": "s" * 60}]}))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<body>lido</body>", content_type="text/html"))
        [ref] = research.search_web(["x"]).references
        assert ref["title"] == "" and ref["site"] == "a.com"


class TestSoCitaOQueLeu:
    def test_referencia_so_das_paginas_realmente_lidas(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(
            serper(["https://lida.com", "https://bloqueada.com"])))
        monkeypatch.setattr(research.requests, "get", lambda url, **kw: (
            Resp(text="<body>conteúdo lido</body>", content_type="text/html") if "lida" in url else Resp(status=403)))
        out = research.search_web(["x"])
        assert [r["url"] for r in out.references] == ["https://lida.com"]
        # as duas continuam em `sources`: foram consultadas, ainda que só uma tenha sido lida
        assert len(out.sources) == 2

    def test_nenhuma_pagina_lida_nao_gera_referencia_falsa(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp(serper(["https://a.com"])))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(status=403))
        out = research.search_web(["x"])
        assert out.references == [] and out.context != ""


class TestFiltroDeRuido:
    """Busca de notícia por termo técnico atrai anúncio de vaga, curso e concurso.
    Isso não é notícia, e ainda entra citado como fonte no fim do post."""

    @pytest.mark.parametrize("titulo", [
        "Concurso Dataprev: Desenvolvimento de software, segurança e dados",
        "Zup abre vagas remotas em Desenvolvimento e Arquitetura",
        "Arquiteto de soluções de TI — salário e carreira",
        "Fatec abre inscrições para vestibular com 515 vagas",
        "IPM Sistemas abre curso gratuito de programação",
        "Empresa contrata 200 desenvolvedores até dezembro",
        "Processo seletivo para estágio em tecnologia",
        "Edital de bolsas para formação em IA",
    ])
    def test_reconhece_anuncio_de_vaga_curso_e_concurso(self, titulo):
        assert research.is_noise(titulo) is True

    @pytest.mark.parametrize("titulo", [
        "IA redefine engenharia de confiabilidade e de plataforma",
        "Brasil registra aumento de 25% nos ataques de ransomware",
        "ANPD investiga ataque que vazou dados de 500 mil clientes",
        "O percurso da computação quântica até aqui",
        "Discurso de Nadella sobre agentes de IA divide o setor",
        "Empresas cortam recursos de nuvem após alta do dólar",
        "Trump ataca regulação da inteligência artificial",
    ])
    def test_nao_derruba_noticia_legitima(self, titulo):
        assert research.is_noise(titulo) is False, "palavra dentro de outra não pode contar"

    def test_filtra_antes_de_virar_fonte(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp({"news": [
            {"link": "https://a.com", "title": "Empresa abre vagas para devs", "snippet": "s" * 60},
            {"link": "https://b.com", "title": "Nuvem soberana avança no governo", "snippet": "s" * 60},
        ]}))
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<body>lido</body>", content_type="text/html"))
        out = research.search_web(["x"])
        assert out.sources == ["https://b.com"]

    def test_se_tudo_for_ruido_a_pesquisa_volta_vazia_em_vez_de_citar_vaga(self, monkeypatch):
        monkeypatch.setattr(research.requests, "post", lambda *a, **k: Resp({"news": [
            {"link": "https://a.com", "title": "Concurso abre 300 vagas em TI", "snippet": "s" * 60},
        ]}))
        assert research.search_web(["x"]).context == ""


class TestPartirDeUmaNoticia:
    def test_reconhece_url(self):
        assert research.is_url("https://exame.com/ia/x") is True
        assert research.is_url("  http://a.com  ") is True
        assert research.is_url("inteligência artificial") is False
        assert research.is_url("exame.com sem esquema") is False

    def test_le_a_pagina_da_noticia_e_devolve_titulo_e_texto(self, monkeypatch):
        html = "<html><head><title>Ataque derruba sistema</title></head><body><p>O texto da matéria.</p></body></html>"
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text=html, content_type="text/html"))
        out = research.from_url("https://veiculo.com/materia")
        assert out.context.startswith("Ataque derruba sistema")
        assert "O texto da matéria." in out.context
        assert out.references[0]["url"] == "https://veiculo.com/materia"
        assert out.references[0]["title"] == "Ataque derruba sistema"
        assert out.pages_read == 1

    def test_pagina_que_recusa_devolve_vazio_sem_estourar(self, monkeypatch):
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(status=403))
        out = research.from_url("https://bloqueia.com/x")
        assert out.context == "" and out.references == []

    def test_sem_titulo_usa_o_dominio_como_veiculo(self, monkeypatch):
        monkeypatch.setattr(research.requests, "get", lambda *a, **k: Resp(text="<body>só texto</body>", content_type="text/html"))
        out = research.from_url("https://www1.folha.uol.com.br/x")
        assert out.references[0]["site"] == "folha.uol.com.br"
