"""Orquestração: sorteia tema → escreve → capa → grava com o destino certo."""
from datetime import datetime, timezone

import pytest

from blog import service, store
from tests.fakes import FakeDb, FakeFilter


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


DRAFT = {
    "slugBase": "tema-x", "tags": ["ia"], "imagePrompt": "cena", "imageAlt": "alt",
    "i18n": {l: {"title": "T", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]}
             for l in ("pt", "en")},
    "model": "gemini-3.5-flash-lite",
}


@pytest.fixture
def env(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    chamadas = {"gerou": [], "capa": []}
    monkeypatch.setattr(service.gemini, "generate_post", lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: (chamadas["gerou"].append(topic), dict(DRAFT))[1])
    monkeypatch.setattr(service.images, "build_cover", lambda p, a, keywords=None: (chamadas["capa"].append(p), {"hash": "h" * 64, "provider": "gemini", "credit": "c", "sourceUrl": "", "alt": a})[1])
    monkeypatch.setattr(service.videos, "search_candidates", lambda q, **k: [])
    monkeypatch.setattr(service.photos, "find", lambda *a, **k: None)
    monkeypatch.setattr(service.gemini, "unsupported_claims", lambda corpo, material: [])
    return chamadas


class TestGerar:
    def test_grava_rascunho_agendado_com_a_data_da_config(self, env):
        store.save_config({"delay_days": 2, "publish_hour": 8, "auto_publish": False})
        post = service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert post["status"] == "scheduled"
        assert post["scheduledFor"] == utc(2026, 9, 16, 11)  # 8h de SP

    def test_com_auto_publicar_ligado_entra_no_ar_na_hora(self, env):
        store.save_config({"auto_publish": True})
        post = service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert post["status"] == "published"
        assert post["publishedAt"] == utc(2026, 9, 14, 21)

    def test_registra_o_modelo_e_o_tema_para_rastreio(self, env):
        post = service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert post["generation"]["model"] == "gemini-3.5-flash-lite"
        assert post["topic"] == "meu tema"

    def test_a_capa_usa_o_prompt_que_a_ia_escreveu(self, env):
        service.generate("meu tema", now=utc(2026, 9, 14, 21))
        assert env["capa"] == ["cena"]

    def test_capa_falhando_o_post_sai_mesmo_assim(self, env, monkeypatch):
        monkeypatch.setattr(service.images, "build_cover", lambda *a, **k: None)
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        assert post["image"] is None and post["status"] == "scheduled"

    def test_sem_tema_explicito_usa_o_termo_vigiado_da_vez(self, env):
        store.save_config({"news_terms": ["segurança da informação"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21))
        assert env["gerou"] == ["segurança da informação"]
        assert post["topic"] == "segurança da informação"

    def test_sem_termo_vigiado_nao_gera_e_explica(self, env):
        store.save_config({"news_terms": []})
        with pytest.raises(service.NoTopicError, match="termo vigiado"):
            service.generate(None, now=utc(2026, 9, 14, 21))


class TestTickDoAgendador:
    def test_publica_os_vencidos(self, env):
        store.save_config({"delay_days": 0, "publish_hour": 8, "generate_weekdays": []})
        post = service.generate("t", now=utc(2026, 9, 14, 21))  # agenda 15/09 11:00 UTC
        resultado = service.tick(now=utc(2026, 9, 15, 12))
        assert resultado["published"] == 1
        assert store.get_post(post["id"])["status"] == "published"

    def test_gera_no_dia_e_hora_configurados(self, env):
        store.save_config({"generate_weekdays": [0], "generate_hour": 6, "news_terms": ["t1"]})
        resultado = service.tick(now=utc(2026, 9, 14, 12))  # segunda, 9h SP
        assert resultado["generated"] == 1

    def test_nao_gera_duas_vezes_no_mesmo_dia(self, env):
        store.save_config({"generate_weekdays": [0], "generate_hour": 6, "news_terms": ["t1", "t2"]})
        service.tick(now=utc(2026, 9, 14, 12))
        assert service.tick(now=utc(2026, 9, 14, 15))["generated"] == 0

    def test_erro_ao_gerar_nao_impede_a_publicacao_dos_vencidos(self, env, monkeypatch):
        store.save_config({"delay_days": 0, "publish_hour": 8, "generate_weekdays": [0], "generate_hour": 6, "news_terms": ["t"]})
        service.generate("t", now=utc(2026, 9, 12, 21))
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: (_ for _ in ()).throw(service.gemini.GeminiError("cota")))
        resultado = service.tick(now=utc(2026, 9, 14, 12))
        assert resultado["published"] == 1
        assert "cota" in resultado["error"]


class TestAtrasoAoAgir:
    """Pedido do PO: nunca publicar, gerar ou compartilhar exatamente na hora configurada.

    O agendador (Cloud Scheduler) bate de hora em hora, então o atraso de 1 a 15 min
    é uma espera DE VERDADE (`time.sleep`) dentro da própria chamada do tick — não dá
    para alcançar isso só comparando horários, com um agendador que só bate uma vez
    por hora (ver CLAUDE.md).
    """

    def _espera(self, monkeypatch):
        chamadas = []
        monkeypatch.setattr(service.time, "sleep", lambda s: chamadas.append(s))
        return chamadas

    def test_espera_antes_de_publicar_o_que_venceu(self, env, monkeypatch):
        chamadas = self._espera(monkeypatch)
        store.save_config({"delay_days": 0, "publish_hour": 8, "generate_weekdays": []})
        service.generate("t", now=utc(2026, 9, 14, 21))  # agenda 15/09 11:00 UTC
        service.tick(now=utc(2026, 9, 15, 12))
        assert len(chamadas) == 1
        assert 60 <= chamadas[0] <= 15 * 60

    def test_espera_antes_de_gerar(self, env, monkeypatch):
        chamadas = self._espera(monkeypatch)
        store.save_config({"generate_weekdays": [0], "generate_hour": 6, "news_terms": ["t1"]})
        service.tick(now=utc(2026, 9, 14, 12))
        assert len(chamadas) == 1
        assert 60 <= chamadas[0] <= 15 * 60

    def test_nao_espera_quando_nao_ha_nada_para_fazer(self, env, monkeypatch):
        chamadas = self._espera(monkeypatch)
        store.save_config({"generate_weekdays": [], "linkedin_enabled": False})
        service.tick(now=utc(2026, 9, 14, 12))
        assert chamadas == []

    def test_uma_so_espera_mesmo_quando_publicar_e_gerar_caem_no_mesmo_tick(self, env, monkeypatch):
        store.save_config({"delay_days": 0, "publish_hour": 6, "generate_weekdays": [0], "generate_hour": 6, "news_terms": ["t"]})
        service.generate("t", now=utc(2026, 9, 12, 9))  # agenda 12/09 09:00 UTC (6h SP, delay 0)
        chamadas = self._espera(monkeypatch)
        resultado = service.tick(now=utc(2026, 9, 14, 9))  # segunda, 6h SP: publica E gera
        assert resultado["published"] == 1
        assert resultado["generated"] == 1
        assert len(chamadas) == 1


class TestRevisaoPorPrompt:
    def test_mantem_id_e_status_e_troca_so_o_conteudo(self, env, monkeypatch):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        novo = {**DRAFT, "i18n": {l: {"title": "Revisado", "excerpt": "e2", "sections": [{"heading": "h", "paragraphs": ["p2"]}]} for l in ("pt", "en")}}
        monkeypatch.setattr(service.gemini, "revise_post", lambda p, i: novo)
        revisado = service.revise(post["id"], "encurte")
        assert revisado["id"] == post["id"]
        assert revisado["status"] == "scheduled"
        assert revisado["i18n"]["pt"]["title"] == "Revisado"
        assert revisado["slug"] == post["slug"], "mudar o slug quebraria o link já publicado"

    def test_post_inexistente_devolve_None(self, env):
        assert service.revise("nao-existe", "x") is None


class TestPesquisaNaWeb:
    def test_desligada_na_config_nao_pesquisa(self, env, monkeypatch):
        chamou = []
        monkeypatch.setattr(service.research, "search_web", lambda q: chamou.append(q) or service.research.Research())
        store.save_config({"research_enabled": False})
        service.generate("tema", now=utc(2026, 9, 14, 21))
        assert chamou == []

    def test_ligada_pesquisa_e_registra_as_fontes(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web",
                            lambda q: service.research.Research(context="contexto", sources=["https://a"], pages_read=1))
        store.save_config({"research_enabled": True})
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert post["sources"] == ["https://a"]
        assert post["generation"]["researched"] is True

    def test_a_escolha_por_post_vence_a_configuracao(self, env, monkeypatch):
        chamou = []
        monkeypatch.setattr(service.research, "search_web", lambda q: chamou.append(q) or service.research.Research())
        store.save_config({"research_enabled": True})
        service.generate("tema", now=utc(2026, 9, 14, 21), use_research=False)
        assert chamou == []
        service.generate("outro", now=utc(2026, 9, 14, 21), use_research=True)
        assert len(chamou) == 1

    def test_pesquisa_vazia_ainda_gera_o_post(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research())
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert post["status"] == "scheduled" and post["generation"]["researched"] is False


class TestGeracaoPorNoticia:
    def test_modo_noticia_usa_o_termo_em_rodizio_e_consulta_de_notícia(self, env, monkeypatch):
        consultas = []
        monkeypatch.setattr(service.research, "search_web", lambda q: consultas.append(q) or service.research.Research(context="c"))
        store.save_config({"news_terms": ["segurança da informação"], "research_enabled": True})
        post = service.generate(None, now=utc(2026, 9, 14, 21))
        assert post["topic"] == "segurança da informação"
        assert post["generation"]["source"] == "news"
        assert consultas[0][0] == "segurança da informação"

    def test_termos_giram_em_vez_de_repetir(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research(context="c"))
        store.save_config({"news_terms": ["um", "dois"]})
        a = service.generate(None, now=utc(2026, 9, 14, 21))
        b = service.generate(None, now=utc(2026, 9, 15, 21))
        assert {a["topic"], b["topic"]} == {"um", "dois"}

    def test_sem_termo_vigiado_a_geracao_automatica_falha_com_recado(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research())
        store.save_config({"news_terms": []})
        with pytest.raises(service.NoTopicError, match="painel"):
            service.generate(None, now=utc(2026, 9, 14, 21))


class TestReferenciasNoPost:
    def test_grava_referencia_com_data_de_acesso(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research(
            context="c", sources=["https://exame.com/x"],
            references=[{"url": "https://exame.com/x", "title": "Título", "site": "exame.com"}]))
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        [ref] = post["references"]
        assert ref["site"] == "exame.com"
        assert ref["accessedAt"].startswith("2026-09-14")

    def test_sem_pesquisa_o_post_fica_sem_referencia(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research())
        assert service.generate("tema", now=utc(2026, 9, 14, 21))["references"] == []


class TestNaoRepetirAssunto:
    def test_manda_os_titulos_ja_publicados_para_a_ia(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: recebidos.update(titles=avoid_titles) or dict(DRAFT))
        service.generate("primeiro", now=utc(2026, 9, 14, 21))
        service.generate("segundo", now=utc(2026, 9, 15, 21))
        assert "T" in (recebidos["titles"] or []), "o título do post anterior precisa chegar no prompt"

    def test_primeiro_post_do_blog_manda_lista_vazia(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: recebidos.update(titles=avoid_titles) or dict(DRAFT))
        service.generate("único", now=utc(2026, 9, 14, 21))
        assert recebidos["titles"] == []


class TestCurriculoComoBase:
    def test_sem_pesquisa_usa_o_curriculo_como_material(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: recebidos.update(ctx=context) or dict(DRAFT))
        store.save_config({"research_enabled": False})
        post = service.generate("liderança", now=utc(2026, 9, 14, 21))
        assert "EXPERIÊNCIA" in recebidos["ctx"], "o post sem pesquisa se ancora na carreira real"
        assert "curriculo" in post["generation"]["source"]

    def test_pesquisa_vazia_tambem_cai_no_curriculo(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research())
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: recebidos.update(ctx=context) or dict(DRAFT))
        service.generate("tema", now=utc(2026, 9, 14, 21))
        assert "EXPERIÊNCIA" in recebidos["ctx"]

    def test_com_pesquisa_o_curriculo_nao_substitui_a_noticia(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.research, "search_web",
                            lambda q: service.research.Research(context="notícia de hoje", sources=["https://a"]))
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: recebidos.update(ctx=context) or dict(DRAFT))
        service.generate("tema", now=utc(2026, 9, 14, 21))
        assert recebidos["ctx"] == "notícia de hoje"


class TestAPartirDeUmaNoticia:
    def test_link_colado_vira_a_unica_fonte_e_o_titulo_vira_o_assunto(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "from_url", lambda u: service.research.Research(
            context="corpo da matéria", sources=[u], pages_read=1,
            references=[{"url": u, "title": "Ataque derruba sistema", "site": "veiculo.com", "published": ""}]))
        buscou = []
        monkeypatch.setattr(service.research, "search_web", lambda q: buscou.append(q) or service.research.Research())
        post = service.generate("https://veiculo.com/materia", now=utc(2026, 9, 14, 21))
        assert post["topic"] == "Ataque derruba sistema"
        assert post["generation"]["source"] == "link"
        assert buscou == [], "com o link em mãos não há por que buscar"

    def test_link_que_nao_abre_cai_no_curriculo_em_vez_de_falhar(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "from_url", lambda u: service.research.Research())
        recebidos = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False: recebidos.update(ctx=context) or dict(DRAFT))
        post = service.generate("https://bloqueia.com/x", now=utc(2026, 9, 14, 21))
        assert "EXPERIÊNCIA" in recebidos["ctx"]
        assert post["status"] == "scheduled"

    def test_texto_comum_continua_indo_para_a_busca_de_noticias(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "from_url", lambda u: (_ for _ in ()).throw(AssertionError("não deveria")))
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research(context="c"))
        post = service.generate("apagão em datacenter", now=utc(2026, 9, 14, 21))
        assert post["topic"] == "apagão em datacenter"


class TestCompartilharNoLinkedIn:
    def _com_token(self, monkeypatch, urn="urn:li:share:1"):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        enviados = []
        monkeypatch.setattr(service.linkedin, "publish",
                            lambda auth, texto, imagem=None, alt="": enviados.append(
                                {"texto": texto, "imagem": imagem, "alt": alt}) or urn)
        monkeypatch.setattr(service.media, "read_image", lambda digest: b"JPEG:" + digest[:4].encode())
        return enviados

    def test_manda_o_MAIS_ANTIGO_primeiro(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        velho = service.generate("t1", now=utc(2026, 9, 10, 21)); store.publish_post(velho["id"], now=utc(2026, 9, 10, 22))
        novo = service.generate("t2", now=utc(2026, 9, 14, 21)); store.publish_post(novo["id"], now=utc(2026, 9, 14, 22))
        compartilhado = service.share_next(now=utc(2026, 9, 15, 12))
        assert compartilhado["id"] == velho["id"]
        assert enviados[0]["texto"].rstrip().endswith(f"/blog/{velho['slug']}")

    def test_leva_a_capa_do_post_anexada_com_o_alt(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["imagem"] == b"JPEG:hhhh"
        assert enviados[0]["alt"]

    def test_post_sem_capa_sai_so_com_o_texto(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        monkeypatch.setattr(service.images, "build_cover", lambda *a, **k: None)
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["imagem"] is None

    def test_capa_que_sumiu_do_bucket_nao_trava_a_fila(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        monkeypatch.setattr(service.media, "read_image", lambda digest: None)
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["imagem"] is None, "sem os bytes, vai o texto: melhor que a fila parada"

    def test_marca_e_nao_repete(self, env, monkeypatch):
        self._com_token(monkeypatch)
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        service.share_next(now=utc(2026, 9, 15, 12))
        assert store.get_post(post["id"])["linkedinUrn"] == "urn:li:share:1"
        assert service.share_next(now=utc(2026, 9, 16, 12)) is None

    def test_falha_do_linkedin_NAO_marca_o_post(self, env, monkeypatch):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        monkeypatch.setattr(service.linkedin, "publish",
                            lambda *a, **k: (_ for _ in ()).throw(service.linkedin.LinkedInError("422")))
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        with pytest.raises(service.linkedin.LinkedInError):
            service.share_next(now=utc(2026, 9, 15, 12))
        assert store.get_post(post["id"])["linkedinPostedAt"] is None, "marcar sem confirmar perderia o post"

    def test_post_desmarcado_e_pulado(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        off = service.generate("t1", now=utc(2026, 9, 10, 21)); store.publish_post(off["id"], now=utc(2026, 9, 10, 22))
        store.update_post(off["id"], {"linkedinEnabled": False})
        on = service.generate("t2", now=utc(2026, 9, 12, 21)); store.publish_post(on["id"], now=utc(2026, 9, 12, 22))
        assert service.share_next(now=utc(2026, 9, 15, 12))["id"] == on["id"]

    def test_sem_conta_conectada_avisa_em_vez_de_estourar_generico(self, env, monkeypatch):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: None)
        with pytest.raises(service.NotConnectedError, match="conecte"):
            service.share_next(now=utc(2026, 9, 15, 12))

    def test_tick_compartilha_no_dia_e_hora_marcados(self, env, monkeypatch):
        self._com_token(monkeypatch)
        # Mesma agenda da geração — não existe mais horário separado para o LinkedIn.
        store.save_config({"linkedin_enabled": True, "generate_weekdays": [1], "generate_hour": 9,
                           "news_terms": []})
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        # 2026-09-15 é terça; 13:00 UTC = 10:00 SP, bem depois do maior atraso possível
        assert service.tick(now=utc(2026, 9, 15, 13))["shared"] == 1

    def test_falha_no_linkedin_nao_impede_a_publicacao_agendada(self, env, monkeypatch):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: None)
        store.save_config({"linkedin_enabled": True, "generate_weekdays": [1], "generate_hour": 9,
                           "delay_days": 0, "publish_hour": 8, "news_terms": []})
        service.generate("t", now=utc(2026, 9, 14, 21))  # agenda 15/09, por volta de 11h UTC
        resultado = service.tick(now=utc(2026, 9, 15, 13))
        assert resultado["published"] == 1
        assert "linkedin" in resultado["error"]


class TestCompartilharUmPost:
    def _com_token(self, monkeypatch):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        enviados = []
        monkeypatch.setattr(service.linkedin, "publish",
                            lambda auth, texto, imagem=None, alt="": enviados.append(texto) or "urn:li:share:7")
        monkeypatch.setattr(service.media, "read_image", lambda digest: b"JPEG")
        return enviados

    def _publicado(self, titulo, dia):
        post = service.generate(titulo, now=utc(2026, 9, dia, 21))
        store.publish_post(post["id"], now=utc(2026, 9, dia, 22))
        return post

    def test_manda_o_post_escolhido_e_nao_o_primeiro_da_fila(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        velho = self._publicado("t1", 10)
        novo = self._publicado("t2", 14)
        feito = service.share_post(novo["id"], now=utc(2026, 9, 15, 12))
        assert feito["id"] == novo["id"] and feito["linkedinPostedAt"] is not None
        assert enviados[0].rstrip().endswith(f"/blog/{novo['slug']}")
        assert store.get_post(velho["id"]).get("linkedinPostedAt") is None

    def test_vale_mesmo_com_o_post_fora_da_fila_automatica(self, env, monkeypatch):
        self._com_token(monkeypatch)
        post = self._publicado("t", 10)
        store.update_post(post["id"], {"linkedinEnabled": False})
        assert service.share_post(post["id"])["linkedinPostedAt"] is not None

    def test_rascunho_tambem_vai_quando_o_autor_pede(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        rascunho = service.generate("t", now=utc(2026, 9, 10, 21))
        assert rascunho["status"] != "published"
        feito = service.share_post(rascunho["id"])
        assert feito["linkedinPostedAt"] is not None and len(enviados) == 1

    def test_post_ja_compartilhado_pode_ir_de_novo(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        post = self._publicado("t", 10)
        service.share_post(post["id"], now=utc(2026, 9, 11, 12))
        service.share_post(post["id"], now=utc(2026, 9, 12, 12))
        assert len(enviados) == 2
        assert store.get_post(post["id"])["linkedinPostedAt"] == utc(2026, 9, 12, 12)

    def test_post_inexistente(self, env, monkeypatch):
        self._com_token(monkeypatch)
        with pytest.raises(service.PostNotFoundError):
            service.share_post("nao-existe")

    def test_sem_conta_conectada(self, env, monkeypatch):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: None)
        post = self._publicado("t", 10)
        with pytest.raises(service.NotConnectedError):
            service.share_post(post["id"])

    def test_falha_do_linkedin_nao_marca_o_post(self, env, monkeypatch):
        self._com_token(monkeypatch)
        monkeypatch.setattr(service.linkedin, "publish",
                            lambda *a, **k: (_ for _ in ()).throw(service.linkedin.LinkedInError("422")))
        post = self._publicado("t", 10)
        with pytest.raises(service.linkedin.LinkedInError):
            service.share_post(post["id"])
        assert store.get_post(post["id"]).get("linkedinPostedAt") is None



class TestNaoRepetirCapa:
    def test_manda_as_capas_ja_usadas_para_a_ia(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False:
                            recebidos.update(covers=avoid_covers) or dict(DRAFT))
        service.generate("primeiro", now=utc(2026, 9, 14, 21))
        service.generate("segundo", now=utc(2026, 9, 15, 21))
        assert "cena" in (recebidos["covers"] or []), "o prompt da capa anterior precisa chegar no prompt"

    def test_primeiro_post_manda_lista_vazia(self, env, monkeypatch):
        recebidos = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False:
                            recebidos.update(covers=avoid_covers) or dict(DRAFT))
        service.generate("único", now=utc(2026, 9, 14, 21))
        assert recebidos["covers"] == []


class TestAPartirDeUmTema:
    def _pesquisa(self, monkeypatch, **kw):
        vistas = []
        monkeypatch.setattr(service.research, "search_topic",
                            lambda q: vistas.append(q) or service.research.Research(**kw))
        monkeypatch.setattr(service.research, "search_web", lambda q: (_ for _ in ()).throw(AssertionError("busca de notícia")))
        return vistas

    def test_pesquisa_o_tema_e_grava_a_origem(self, env, monkeypatch):
        vistas = self._pesquisa(monkeypatch, context="material", sources=["https://a"], pages_read=1)
        post = service.generate("RAG em produção", now=utc(2026, 9, 14, 21), from_topic=True)
        assert vistas[0][0] == "RAG em produção"
        assert post["topic"] == "RAG em produção"
        assert post["generation"]["source"] == "tema"
        assert post["sources"] == ["https://a"]

    def test_avisa_o_gemini_de_que_o_tema_e_do_autor(self, env, monkeypatch):
        self._pesquisa(monkeypatch, context="material")
        recebido = {}
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda topic, context="", avoid_titles=None, avoid_covers=None, author_topic=False:
                            recebido.update(autor=author_topic, ctx=context) or dict(DRAFT))
        service.generate("RAG", now=utc(2026, 9, 14, 21), from_topic=True)
        assert recebido == {"autor": True, "ctx": "material"}

    def test_pesquisa_mesmo_com_a_pesquisa_desligada_na_config(self, env, monkeypatch):
        # pedir "sobre este tema" É pedir pesquisa; o interruptor da config é do piloto automático
        vistas = self._pesquisa(monkeypatch, context="material")
        store.save_config({"research_enabled": False})
        service.generate("RAG", now=utc(2026, 9, 14, 21), from_topic=True)
        assert len(vistas) == 1

    def test_sem_material_nao_escreve_nem_cai_no_curriculo(self, env, monkeypatch):
        self._pesquisa(monkeypatch)
        monkeypatch.setattr(service.research, "SERPER_KEY", "chave")
        with pytest.raises(service.NoResearchError, match="RAG"):
            service.generate("RAG", now=utc(2026, 9, 14, 21), from_topic=True)
        assert env["gerou"] == [] and store.list_posts() == []

    def test_sem_chave_do_serper_o_recado_diz_isso(self, env, monkeypatch):
        self._pesquisa(monkeypatch)
        monkeypatch.setattr(service.research, "SERPER_KEY", "")
        with pytest.raises(service.NoResearchError, match="SERPER_API_KEY"):
            service.generate("RAG", now=utc(2026, 9, 14, 21), from_topic=True)

    def test_tema_vazio_pede_o_tema(self, env):
        with pytest.raises(service.NoTopicError, match="tema"):
            service.generate("  ", now=utc(2026, 9, 14, 21), from_topic=True)

    def test_link_colado_no_modo_tema_e_so_texto_de_busca(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "from_url", lambda u: (_ for _ in ()).throw(AssertionError("não deveria")))
        vistas = self._pesquisa(monkeypatch, context="material")
        service.generate("https://x.com/y", now=utc(2026, 9, 14, 21), from_topic=True)
        assert vistas


class TestReflexaoPessoal:
    """Formato curto, sem notícia, pedido do PO em 2026-10-07 (ver gemini.RULES_REFLECTION)."""

    def _generate_reflection(self, monkeypatch, recebe=None):
        recebe = recebe if recebe is not None else {}
        monkeypatch.setattr(service.gemini, "generate_reflection",
                            lambda theme, context, avoid_titles=None, avoid_covers=None:
                            (recebe.update(theme=theme, ctx=context) or dict(DRAFT)))
        return recebe

    def test_usa_generate_reflection_nao_generate_post(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: (_ for _ in ()).throw(AssertionError("modo errado")))
        store.save_config({"reflection_topics": ["liderar quem sabe mais do que você"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert post["generation"]["source"] == "reflection"

    def test_material_e_sempre_o_curriculo_nunca_pesquisa(self, env, monkeypatch):
        recebe = self._generate_reflection(monkeypatch)
        monkeypatch.setattr(service.research, "search_web", lambda q: (_ for _ in ()).throw(AssertionError("não deveria pesquisar")))
        monkeypatch.setattr(service.research, "search_topic", lambda q: (_ for _ in ()).throw(AssertionError("não deveria pesquisar")))
        store.save_config({"reflection_topics": ["liderar quem sabe mais do que você"]})
        service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert "EXPERIÊNCIA" in recebe["ctx"]

    def test_tema_explicito_vence_o_rodizio(self, env, monkeypatch):
        recebe = self._generate_reflection(monkeypatch)
        store.save_config({"reflection_topics": ["outro tema"]})
        service.generate("contratar sênior em mercado aquecido", now=utc(2026, 9, 14, 21), reflection=True)
        assert recebe["theme"] == "contratar sênior em mercado aquecido"

    def test_sem_tema_gira_entre_os_cadastrados(self, env, monkeypatch):
        recebe = self._generate_reflection(monkeypatch)
        store.save_config({"reflection_topics": ["tema a", "tema b"]})
        service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert recebe["theme"] in ("tema a", "tema b")

    def test_sem_tema_cadastrado_nem_explicito_nao_gera_e_explica(self, env):
        store.save_config({"reflection_topics": []})
        with pytest.raises(service.NoTopicError, match="reflex"):
            service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)

    def test_respeita_agendamento_da_config_igual_aos_outros_modos(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        store.save_config({"reflection_topics": ["t"], "delay_days": 0, "publish_hour": 8, "auto_publish": False})
        post = service.generate(None, now=utc(2026, 9, 15, 9), reflection=True)
        assert post["status"] == "scheduled"


class TestVideoNaReflexao:
    """Vídeo é SÓ LINK (busca no Serper, nunca baixa — ver blog/videos.py).

    Só o modo reflexão busca vídeo; a notícia comentada não muda."""

    def _generate_reflection(self, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_reflection",
                            lambda theme, context, avoid_titles=None, avoid_covers=None: dict(DRAFT))

    def test_achou_video_anexa_ao_post(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        monkeypatch.setattr(service.videos, "search_candidates",
                            lambda q, **k: [service.videos.VideoResult(title="Vídeo", url="https://youtu.be/x", channel="Canal")])
        store.save_config({"reflection_topics": ["liderança"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert post["video"]["url"] == "https://youtu.be/x"
        assert post["video"]["title"] == "Vídeo"

    def test_sem_video_o_post_sai_mesmo_assim(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        monkeypatch.setattr(service.videos, "search_candidates", lambda q, **k: [])
        store.save_config({"reflection_topics": ["liderança"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert post.get("video") is None

    def test_busca_o_video_pelo_tema(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        vistos = []
        monkeypatch.setattr(service.videos, "search_candidates", lambda q, **k: vistos.append(q) or [])
        service.generate("contratar sênior", now=utc(2026, 9, 14, 21), reflection=True)
        assert vistos == ["contratar sênior"]


def _rascunho_en(titulo_en):
    return {**DRAFT, "i18n": {"pt": {"title": "Título", "excerpt": "e", "sections": [{"heading": "", "paragraphs": ["p"]}]},
                              "en": {"title": titulo_en, "excerpt": "e", "sections": [{"heading": "", "paragraphs": ["p"]}]}}}


class TestRecortePendente:
    """Decisão do PO (2026-10-16): recorte de vídeo sempre que possível. O servidor só ACHA o vídeo;
    quem corta é o Mac do autor (`clip_worker.py`). Post com recorte espera a autorização dele."""

    def _video(self, monkeypatch, vistos=None):
        def busca(q, **k):
            if vistos is not None:
                vistos.append((q, k))
            return [service.videos.VideoResult(title="Roadster Event", url="https://youtu.be/v", channel="Tesla"),
                    service.videos.VideoResult(title="Roadster Reaction", url="https://youtu.be/w", channel="Outro")]
        monkeypatch.setattr(service.videos, "search_candidates", busca)

    def test_noticia_tambem_busca_video_pelo_titulo_em_ingles_recente_e_sem_ancora(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho_en("Tesla puts rocket thrusters on a car"))
        vistos = []
        self._video(monkeypatch, vistos)
        service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert vistos == [("Tesla puts rocket thrusters on a car", {"recent": True, "anchor": False, "prefer": "tesla"})]

    def test_achou_video_marca_recorte_pendente(self, env, monkeypatch):
        self._video(monkeypatch)
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["clip"] == {"status": "pending"}
        assert post["video"]["url"] == "https://youtu.be/v"

    def test_com_recorte_fica_rascunho_mesmo_com_publicar_sem_revisao(self, env, monkeypatch):
        # o PO pede autorização ao dono do vídeo antes: nada com recorte vai ao ar sozinho
        self._video(monkeypatch)
        store.save_config({"auto_publish": True})
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["status"] == "draft" and post.get("scheduledFor") is None

    def test_com_recorte_nao_agenda_tambem(self, env, monkeypatch):
        self._video(monkeypatch)
        store.save_config({"auto_publish": False})
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["status"] == "draft"

    def test_sem_video_segue_o_fluxo_de_sempre(self, env, monkeypatch):
        store.save_config({"auto_publish": True})
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["status"] == "published" and post.get("clip") is None

    def test_reflexao_busca_pelo_tema_com_ancora_e_sem_recorte_de_data(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_reflection", lambda *a, **k: dict(DRAFT))
        vistos = []
        self._video(monkeypatch, vistos)
        store.save_config({"reflection_topics": ["liderar quem sabe mais"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert vistos == [("liderar quem sabe mais", {"recent": False, "anchor": True})]
        assert post["clip"] == {"status": "pending"} and post["status"] == "draft"


class TestVideoNoCompartilhamento:
    """Post com vídeo não leva a capa: o cartão de prévia é o do YouTube, e os dois
    juntos (imagem nativa + link) nunca foram validados contra o LinkedIn de verdade."""

    def _com_token(self, monkeypatch, urn="urn:li:share:1"):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        enviados = []
        monkeypatch.setattr(service.linkedin, "publish",
                            lambda auth, texto, imagem=None, alt="": enviados.append(
                                {"texto": texto, "imagem": imagem, "alt": alt}) or urn)
        monkeypatch.setattr(service.media, "read_image", lambda digest: b"JPEG:" + digest[:4].encode())
        return enviados

    def test_post_com_video_nao_leva_imagem(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        post = service.generate("t", now=utc(2026, 9, 10, 21))
        store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        store.update_post(post["id"], {"video": {"title": "V", "url": "https://youtu.be/x", "channel": "C"}})
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["imagem"] is None
        assert "https://youtu.be/x" in enviados[0]["texto"]

    def test_post_sem_video_continua_levando_a_capa(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        post = service.generate("t", now=utc(2026, 9, 10, 21)); store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["imagem"] is not None


class TestCapaOpcional:
    """Ricardo Amorim também posta só texto — nem todo post precisa de capa de IA."""

    def _generate_reflection(self, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_reflection",
                            lambda theme, context, avoid_titles=None, avoid_covers=None: dict(DRAFT))

    def test_sem_capa_nao_chama_a_geracao_de_imagem(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        monkeypatch.setattr(service.images, "build_cover", lambda *a, **k: (_ for _ in ()).throw(AssertionError("não deveria gerar capa")))
        store.save_config({"reflection_topics": ["t"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True, with_image=False)
        assert post["image"] is None

    def test_padrao_continua_com_capa(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        store.save_config({"reflection_topics": ["t"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert post["image"] is not None


def _rascunho(texto):
    return {**DRAFT, "i18n": {l: {"title": "T", "excerpt": "e", "sections": [{"heading": "", "paragraphs": [texto]}]}
                              for l in ("pt", "en")}}


class TestVocabularioDeIA:
    """Expressão proibida no texto gerado vira UMA reescrita pedindo para trocá-la — a lista
    fica fora do prompt de geração porque palavra citada como proibida é ecoada."""

    def _revisor(self, monkeypatch, devolve):
        pedidos = []
        monkeypatch.setattr(service.gemini, "revise_post",
                            lambda post, instr: pedidos.append(instr) or _rascunho(devolve))
        return pedidos

    def test_achou_expressao_proibida_pede_reescrita_e_grava_o_texto_limpo(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho("A Tesla revelou o carro."))
        pedidos = self._revisor(monkeypatch, "A Tesla mostrou o carro.")
        store.save_config({"banned_phrases": ["revel"]})
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert len(pedidos) == 1 and "revel" in pedidos[0]
        assert post["i18n"]["pt"]["sections"][0]["paragraphs"] == ["A Tesla mostrou o carro."]
        assert post["generation"]["bannedLeft"] == []

    def test_texto_limpo_nao_gasta_reescrita(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho("Texto limpo."))
        pedidos = self._revisor(monkeypatch, "x")
        service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert pedidos == []

    def test_se_sobrar_depois_da_reescrita_grava_e_registra_o_que_sobrou(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho("Revelou tudo."))
        self._revisor(monkeypatch, "Ainda revelou.")
        store.save_config({"banned_phrases": ["revel"]})
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["generation"]["bannedLeft"] == ["revel"]

    def test_reescrita_falhando_nao_derruba_o_post(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho("Revelou tudo."))
        monkeypatch.setattr(service.gemini, "revise_post",
                            lambda *a, **k: (_ for _ in ()).throw(service.gemini.GeminiError("cota")))
        store.save_config({"banned_phrases": ["revel"]})
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["i18n"]["pt"]["sections"][0]["paragraphs"] == ["Revelou tudo."]
        assert post["generation"]["bannedLeft"] == ["revel"]

    def test_reflexao_tambem_passa_pelo_filtro(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_reflection", lambda *a, **k: _rascunho("Já vi time sofrer."))
        pedidos = self._revisor(monkeypatch, "Vi um time sofrer.")
        store.save_config({"banned_phrases": ["já vi time"], "reflection_topics": ["t"]})
        service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert len(pedidos) == 1

    def test_editar_com_ia_no_painel_tambem_passa_pelo_filtro(self, env, monkeypatch):
        post = service.generate("t", now=utc(2026, 9, 14, 21))
        respostas = iter([_rascunho("Isso é indiscutível."), _rascunho("Isso é claro.")])
        monkeypatch.setattr(service.gemini, "revise_post", lambda p, i: next(respostas))
        store.save_config({"banned_phrases": ["indiscutív"]})
        revisado = service.revise(post["id"], "encurte")
        assert revisado["i18n"]["pt"]["sections"][0]["paragraphs"] == ["Isso é claro."]


class TestMemoriaInventada:
    """Medido em post real: "Já vi muita diretoria gastar uma fortuna…" num post de notícia —
    o modelo nem recebe o currículo nesse modo; toda memória em primeira pessoa é invenção."""

    def _revisor(self, monkeypatch, devolve):
        pedidos = []
        monkeypatch.setattr(service.gemini, "revise_post",
                            lambda post, instr: pedidos.append(instr) or _rascunho(devolve))
        return pedidos

    def test_noticia_com_memoria_em_primeira_pessoa_vira_reescrita(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web",
                            lambda q: service.research.Research(context="notícia", sources=["https://a"]))
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho("Já vi muita diretoria errar."))
        pedidos = self._revisor(monkeypatch, "Muita diretoria erra.")
        store.save_config({"banned_phrases": []})
        post = service.generate("openai", now=utc(2026, 9, 14, 21))
        assert len(pedidos) == 1 and "opinião" in pedidos[0]
        assert post["i18n"]["pt"]["sections"][0]["paragraphs"] == ["Muita diretoria erra."]

    def test_reflexao_pode_contar_cena_real_da_carreira(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_reflection",
                            lambda *a, **k: _rascunho("Quando liderei a tribo de crédito, aprendi."))
        pedidos = self._revisor(monkeypatch, "x")
        store.save_config({"banned_phrases": [], "reflection_topics": ["t"]})
        service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert pedidos == []

    def test_noticia_sem_material_cai_no_curriculo_e_ai_a_cena_e_real(self, env, monkeypatch):
        monkeypatch.setattr(service.research, "search_web", lambda q: service.research.Research())
        monkeypatch.setattr(service.gemini, "generate_post",
                            lambda *a, **k: _rascunho("Quando liderei a tribo de crédito, aprendi."))
        pedidos = self._revisor(monkeypatch, "x")
        store.save_config({"banned_phrases": []})
        service.generate("tema", now=utc(2026, 9, 14, 21))
        assert pedidos == []


class TestRecorteNoLinkedIn:
    def _com_token(self, monkeypatch):
        monkeypatch.setattr(service.linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        enviados = []
        monkeypatch.setattr(service.linkedin, "publish",
                            lambda auth, texto, imagem=None, alt="", video=None, video_title="": enviados.append(
                                {"texto": texto, "imagem": imagem, "video": video, "titulo": video_title}) or "urn:li:share:1")
        monkeypatch.setattr(service.media, "read_image", lambda digest: b"JPEG")
        return enviados

    def _post_com_recorte(self, clip):
        post = service.generate("t", now=utc(2026, 9, 10, 21))
        store.publish_post(post["id"], now=utc(2026, 9, 10, 22))
        store.update_post(post["id"], {"video": {"title": "V", "url": "https://youtu.be/x", "channel": "C"},
                                       "clip": clip})
        return post

    def test_recorte_pronto_vai_como_video_nativo_sem_capa(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        monkeypatch.setattr(service.media, "read_video", lambda digest, start=None, end=None: b"MP4:" + digest[:2].encode())
        self._post_com_recorte({"status": "ready", "hash": "ab" + "0" * 62, "title": "V", "channel": "C"})
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["video"] == b"MP4:ab" and enviados[0]["imagem"] is None
        assert enviados[0]["titulo"] == "V"

    def test_recorte_sumido_do_bucket_nao_publica_nada(self, env, monkeypatch):
        # publicar sem o vídeo prometido é irreversível; o próximo tick tenta de novo
        enviados = self._com_token(monkeypatch)
        monkeypatch.setattr(service.media, "read_video", lambda digest, start=None, end=None: None)
        post = self._post_com_recorte({"status": "ready", "hash": "ab" + "0" * 62})
        with pytest.raises(service.linkedin.LinkedInError):
            service.share_next(now=utc(2026, 9, 15, 12))
        assert not enviados and not store.get_post(post["id"]).get("linkedinPostedAt")

    def test_recorte_pendente_continua_com_o_link(self, env, monkeypatch):
        enviados = self._com_token(monkeypatch)
        self._post_com_recorte({"status": "pending"})
        service.share_next(now=utc(2026, 9, 15, 12))
        assert enviados[0]["video"] is None and "https://youtu.be/x" in enviados[0]["texto"]


class TestCandidatosDeVideo:
    """Se o primeiro vídeo não servir, o Mac passa para o próximo sem nova busca."""

    def test_guarda_os_outros_achados_como_reserva(self, env, monkeypatch):
        monkeypatch.setattr(service.videos, "search_candidates", lambda q, **k: [
            service.videos.VideoResult(title=f"V{i}", url=f"https://youtu.be/{i}", channel="C") for i in range(5)])
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["video"]["url"] == "https://youtu.be/0"
        assert [c["url"] for c in post["videoCandidates"]] == [f"https://youtu.be/{i}" for i in range(1, 5)]

    def test_reserva_nao_vai_para_o_site_publico(self, env, monkeypatch):
        monkeypatch.setattr(service.videos, "search_candidates", lambda q, **k: [
            service.videos.VideoResult(title="V", url="https://youtu.be/a", channel="C"),
            service.videos.VideoResult(title="W", url="https://youtu.be/b", channel="C")])
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        store.publish_post(post["id"], now=utc(2026, 9, 14, 22))
        assert "videoCandidates" not in store.get_public_post(post["slug"])


class TestMacParado:
    """Recorte esperando e a rotina do Mac sem rodar: avisa por e-mail, uma vez por parada."""

    def _pendente(self, now):
        return store.create_post({"slugBase": "x", "tags": [], "i18n": {"pt": {"title": "Tesla", "excerpt": "e", "sections": []},
                                  "en": {"title": "Tesla", "excerpt": "e", "sections": []}},
                                  "video": {"url": "https://youtu.be/v"}, "clip": {"status": "pending"}}, now=now)

    def _emails(self, monkeypatch):
        enviados = []
        monkeypatch.setattr(service.notify, "send", lambda assunto, corpo: enviados.append((assunto, corpo)) or True)
        return enviados

    def test_avisa_quando_o_recorte_espera_e_o_mac_nao_roda(self, env, monkeypatch):
        enviados = self._emails(monkeypatch)
        self._pendente(utc(2026, 10, 16, 8))
        assert service.check_clip_worker(now=utc(2026, 10, 16, 12)) is True
        assert len(enviados) == 1 and "Mac" in enviados[0][0] and "Tesla" in enviados[0][1]

    def test_avisa_uma_vez_so_por_parada(self, env, monkeypatch):
        enviados = self._emails(monkeypatch)
        self._pendente(utc(2026, 10, 16, 8))
        service.check_clip_worker(now=utc(2026, 10, 16, 12))
        service.check_clip_worker(now=utc(2026, 10, 16, 13))
        assert len(enviados) == 1

    def test_mac_rodando_nao_avisa(self, env, monkeypatch):
        enviados = self._emails(monkeypatch)
        self._pendente(utc(2026, 10, 16, 8))
        store.touch_clip_worker(now=utc(2026, 10, 16, 11))
        assert service.check_clip_worker(now=utc(2026, 10, 16, 12)) is False and not enviados

    def test_mac_voltou_e_parou_de_novo_avisa_de_novo(self, env, monkeypatch):
        enviados = self._emails(monkeypatch)
        self._pendente(utc(2026, 10, 16, 8))
        service.check_clip_worker(now=utc(2026, 10, 16, 12))
        store.touch_clip_worker(now=utc(2026, 10, 16, 13))
        service.check_clip_worker(now=utc(2026, 10, 16, 18))
        assert len(enviados) == 2

    def test_recorte_novo_ainda_nao_e_parada(self, env, monkeypatch):
        enviados = self._emails(monkeypatch)
        self._pendente(utc(2026, 10, 16, 11))
        assert service.check_clip_worker(now=utc(2026, 10, 16, 12)) is False and not enviados

    def test_a_batida_do_agendador_confere(self, env, monkeypatch):
        enviados = self._emails(monkeypatch)
        store.save_config({"generate_weekdays": []})
        self._pendente(utc(2026, 10, 16, 8))
        service.tick(now=utc(2026, 10, 16, 12))
        assert len(enviados) == 1


class TestAfirmacoesSemFonte:
    """Afirmação sem fonte no material é reescrita antes de gravar: corte, opinião ou pergunta."""

    TRECHO = "Engenheiros veteranos torceram o nariz."

    def _conferencia(self, monkeypatch, rodadas):
        materiais = []
        def confere(corpo, material):
            materiais.append(material)
            return rodadas.pop(0) if rodadas else []
        monkeypatch.setattr(service.gemini, "unsupported_claims", confere)
        return materiais

    def _revisao(self, monkeypatch):
        pedidos = []
        def revisa(post, instrucao):
            pedidos.append(instrucao)
            return {"i18n": post["i18n"], "tags": post.get("tags", [])}
        monkeypatch.setattr(service.gemini, "revise_post", revisa)
        return pedidos

    def _com_material(self, monkeypatch):
        monkeypatch.setattr(service.research, "search_web",
                            lambda q, **k: service.research.Research(context="MATERIAL DA PESQUISA"))

    def test_confere_contra_o_material_da_pesquisa(self, env, monkeypatch):
        self._com_material(monkeypatch)
        materiais = self._conferencia(monkeypatch, [])
        service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert materiais and "MATERIAL DA PESQUISA" in materiais[0]

    def test_achou_reescreve_pedindo_corte_opiniao_ou_pergunta(self, env, monkeypatch):
        self._com_material(monkeypatch)
        self._conferencia(monkeypatch, [[{"trecho": self.TRECHO, "porque": "sem fonte"}], []])
        pedidos = self._revisao(monkeypatch)
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert len(pedidos) == 1 and self.TRECHO in pedidos[0]
        assert "nunca troque por outro fato" in pedidos[0]
        # medido: a correção acrescentou "a empresa não comentou o motivo" — fato novo também
        assert "não acrescente informação" in pedidos[0]
        assert post["generation"]["unsupportedFound"] == [self.TRECHO]
        assert post["generation"]["unsupportedLeft"] == []

    def test_o_que_sobrou_depois_da_reescrita_fica_registrado(self, env, monkeypatch):
        self._com_material(monkeypatch)
        achado = [{"trecho": self.TRECHO, "porque": "sem fonte"}]
        self._conferencia(monkeypatch, [achado, achado])
        self._revisao(monkeypatch)
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["generation"]["unsupportedLeft"] == [self.TRECHO]

    def test_nada_sem_fonte_nao_reescreve(self, env, monkeypatch):
        self._com_material(monkeypatch)
        self._conferencia(monkeypatch, [[]])
        pedidos = self._revisao(monkeypatch)
        service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert pedidos == []

    def test_conferencia_fora_do_ar_nao_derruba_o_post(self, env, monkeypatch):
        self._com_material(monkeypatch)
        monkeypatch.setattr(service.gemini, "unsupported_claims",
                            lambda c, m: (_ for _ in ()).throw(service.gemini.GeminiError("503")))
        post = service.generate("tesla", now=utc(2026, 9, 14, 21))
        assert post["id"] and post["generation"]["unsupportedLeft"] is None


FOTO = {"hash": "f" * 64, "provider": "web", "credit": "Foto: g1.globo.com", "sourceUrl": "https://g1.globo.com/m",
        "alt": "T", "width": 1280, "height": 720}


class TestEscadaDeMidia:
    """Notícia: recorte de vídeo → foto real → imagem de IA. Reflexão (sem fonte): IA primeiro.
    Pedido do PO, 2026-10-17: só criar imagem quando não houver vídeo nem foto real."""

    def _foto(self, monkeypatch, achou=FOTO):
        vistos = []
        monkeypatch.setattr(service.photos, "find", lambda *a, **k: vistos.append((a, k)) or achou)
        return vistos

    def _video(self, monkeypatch):
        monkeypatch.setattr(service.videos, "search_candidates",
                            lambda q, **k: [service.videos.VideoResult(title="V", url="https://youtu.be/v", channel="C")])

    def _pesquisa(self, monkeypatch):
        achado = service.research.Research(
            context="material", sources=["https://g1.globo.com/m", "https://outro.com/n"],
            references=[{"url": "https://g1.globo.com/m", "title": "t", "site": "g1", "published": ""}], pages_read=1)
        monkeypatch.setattr(service.research, "search_web", lambda qs: achado)

    def test_noticia_sem_video_usa_foto_real_e_nao_gera_imagem(self, env, monkeypatch):
        self._foto(monkeypatch)
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert post["image"]["provider"] == "web" and post["image"]["credit"] == "Foto: g1.globo.com"
        assert env["capa"] == [], "IA só como última opção"

    def test_foto_e_buscada_pelo_titulo_em_ingles_e_em_portugues_com_as_paginas_lidas(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_post", lambda *a, **k: _rascunho_en("Robot kicks a door"))
        self._pesquisa(monkeypatch)
        vistos = self._foto(monkeypatch)
        service.generate("tema", now=utc(2026, 9, 14, 21))
        (subject, queries, paginas), k = vistos[0][0][:3], vistos[0][1]
        assert subject.startswith("Título")
        assert queries == ["Robot kicks a door", "Título"]
        assert paginas == ["https://g1.globo.com/m", "https://outro.com/n"], "as lidas primeiro, sem repetir"

    def test_sem_foto_cai_para_a_imagem_de_ia(self, env, monkeypatch):
        self._foto(monkeypatch, achou=None)
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert env["capa"] == ["cena"] and post["image"]["provider"] == "gemini"

    def test_com_video_nao_cria_imagem_nem_busca_foto(self, env, monkeypatch):
        self._video(monkeypatch)
        vistos = self._foto(monkeypatch)
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert post["image"] is None and vistos == [] and env["capa"] == []
        assert post["clip"] == {"status": "pending"}

    def test_com_video_guarda_o_prompt_da_capa_para_o_caso_de_o_recorte_desistir(self, env, monkeypatch):
        self._video(monkeypatch)
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert post["imagePrompt"] == "cena"

    def test_foto_de_terceiro_deixa_o_post_em_rascunho_mesmo_publicando_sem_revisao(self, env, monkeypatch):
        self._foto(monkeypatch)
        store.save_config({"auto_publish": True})
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        assert post["status"] == "draft" and post.get("scheduledFor") is None

    def test_imagem_de_ia_continua_publicando_sozinha(self, env, monkeypatch):
        self._foto(monkeypatch, achou=None)
        store.save_config({"auto_publish": True})
        assert service.generate("tema", now=utc(2026, 9, 14, 21))["status"] == "published"

    def test_reflexao_comeca_pela_ia_e_nunca_busca_foto(self, env, monkeypatch):
        monkeypatch.setattr(service.gemini, "generate_reflection", lambda *a, **k: dict(DRAFT))
        vistos = self._foto(monkeypatch)
        store.save_config({"reflection_topics": ["liderança"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert vistos == [] and env["capa"] == ["cena"] and post["image"]["provider"] == "gemini"

    def test_sem_imagem_pedida_nao_busca_foto(self, env, monkeypatch):
        vistos = self._foto(monkeypatch)
        monkeypatch.setattr(service.gemini, "generate_reflection", lambda *a, **k: dict(DRAFT))
        service.generate("tema", now=utc(2026, 9, 14, 21), with_image=False)
        assert vistos == [] and env["capa"] == []


class TestCapaQuandoORecorteDesiste:
    """O recorte falhou (ou o vídeo nunca vem): o post precisa de capa — foto real, depois IA."""

    def _post_sem_capa(self, env):
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        store.update_post(post["id"], {"image": None, "references": [{"url": "https://g1.globo.com/m", "title": "t", "site": "g1"}],
                                       "sources": ["https://g1.globo.com/m", "https://x.com/n"]})
        return post["id"]

    def test_usa_a_foto_real_quando_acha(self, env, monkeypatch):
        post_id = self._post_sem_capa(env)
        monkeypatch.setattr(service.photos, "find", lambda *a, **k: FOTO)
        env["capa"].clear()
        assert service.ensure_cover(post_id)["image"]["provider"] == "web"
        assert env["capa"] == []

    def test_cai_para_a_ia_com_o_prompt_guardado(self, env, monkeypatch):
        post_id = self._post_sem_capa(env)
        env["capa"].clear()
        post = service.ensure_cover(post_id)
        assert env["capa"] == ["cena"] and post["image"]["provider"] == "gemini"

    def test_post_que_ja_tem_capa_nao_e_tocado(self, env, monkeypatch):
        post = service.generate("tema", now=utc(2026, 9, 14, 21))
        monkeypatch.setattr(service.photos, "find", lambda *a, **k: (_ for _ in ()).throw(AssertionError("não devia buscar")))
        env["capa"].clear()
        assert service.ensure_cover(post["id"])["image"]["hash"] == post["image"]["hash"]
        assert env["capa"] == []

    def test_post_inexistente_devolve_none(self, env):
        assert service.ensure_cover("nao-existe") is None
