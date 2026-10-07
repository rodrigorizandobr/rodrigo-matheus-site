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
        monkeypatch.setattr(service.videos, "search_youtube",
                            lambda q: service.videos.VideoResult(title="Vídeo", url="https://youtu.be/x", channel="Canal"))
        store.save_config({"reflection_topics": ["liderança"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert post["video"]["url"] == "https://youtu.be/x"
        assert post["video"]["title"] == "Vídeo"

    def test_sem_video_o_post_sai_mesmo_assim(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        monkeypatch.setattr(service.videos, "search_youtube", lambda q: service.videos.VideoResult())
        store.save_config({"reflection_topics": ["liderança"]})
        post = service.generate(None, now=utc(2026, 9, 14, 21), reflection=True)
        assert post.get("video") is None

    def test_busca_o_video_pelo_tema(self, env, monkeypatch):
        self._generate_reflection(monkeypatch)
        vistos = []
        monkeypatch.setattr(service.videos, "search_youtube", lambda q: vistos.append(q) or service.videos.VideoResult())
        service.generate("contratar sênior", now=utc(2026, 9, 14, 21), reflection=True)
        assert vistos == ["contratar sênior"]

    def test_noticia_comentada_nao_busca_video(self, env, monkeypatch):
        monkeypatch.setattr(service.videos, "search_youtube", lambda q: (_ for _ in ()).throw(AssertionError("não deveria buscar vídeo")))
        service.generate("meu tema", now=utc(2026, 9, 14, 21))


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
