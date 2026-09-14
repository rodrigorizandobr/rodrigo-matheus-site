"""Núcleo puro do blog: forma do post, agendamento e cadência de geração.

Tudo que decide QUANDO publicar e QUANDO gerar vive aqui, sem Firestore e sem rede,
porque é a parte que erra silencioso em produção (fuso, virada de dia, DST).
"""
from datetime import datetime, timezone

import pytest

from blog import model


def utc(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


class TestSlug:
    def test_acentos_e_pontuacao_viram_slug_limpo(self):
        assert model.slugify("Três Lições de Liderança em IA!") == "tres-licoes-de-lideranca-em-ia"

    def test_nunca_devolve_vazio_nem_barra(self):
        assert model.slugify("///") == "post"
        assert "/" not in model.slugify("a/b")

    def test_slug_e_estavel_para_o_mesmo_titulo(self):
        assert model.slugify("Cloud Run") == model.slugify("  cloud   run  ")


class TestAgendamento:
    cfg = {"timezone": "America/Sao_Paulo", "delay_days": 2, "publish_hour": 8}

    def test_publica_x_dias_depois_as_8h_no_fuso_de_sao_paulo(self):
        # 14/09 21:00 UTC = 14/09 18:00 em SP → +2 dias → 16/09 08:00 SP = 11:00 UTC
        quando = model.scheduled_for(utc(2026, 9, 14, 21), self.cfg)
        assert quando == utc(2026, 9, 16, 11)

    def test_gerado_de_madrugada_UTC_ainda_conta_o_dia_local_anterior(self):
        # 15/09 02:00 UTC = 14/09 23:00 em SP → o dia local é 14, então +2 = 16/09
        assert model.scheduled_for(utc(2026, 9, 15, 2), self.cfg) == utc(2026, 9, 16, 11)

    def test_delay_zero_publica_no_mesmo_dia_se_ainda_nao_passou_das_8h(self):
        cfg = {**self.cfg, "delay_days": 0}
        # 15/09 09:00 UTC = 06:00 SP, antes das 8h → publica hoje 8h SP
        assert model.scheduled_for(utc(2026, 9, 15, 9), cfg) == utc(2026, 9, 15, 11)

    def test_delay_zero_depois_das_8h_joga_para_o_dia_seguinte(self):
        cfg = {**self.cfg, "delay_days": 0}
        # 15/09 14:00 UTC = 11:00 SP, já passou → amanhã 8h
        assert model.scheduled_for(utc(2026, 9, 15, 14), cfg) == utc(2026, 9, 16, 11)

    def test_hora_de_publicar_configuravel(self):
        cfg = {**self.cfg, "publish_hour": 19}
        assert model.scheduled_for(utc(2026, 9, 14, 21), cfg) == utc(2026, 9, 16, 22)


class TestVencidos:
    def test_so_agendados_com_data_vencida_entram(self):
        posts = [
            {"id": "a", "status": "scheduled", "scheduledFor": utc(2026, 9, 15, 10)},
            {"id": "b", "status": "scheduled", "scheduledFor": utc(2026, 9, 15, 12)},
            {"id": "c", "status": "draft", "scheduledFor": utc(2026, 9, 15, 10)},
            {"id": "d", "status": "published", "scheduledFor": utc(2026, 9, 15, 10)},
            {"id": "e", "status": "scheduled", "scheduledFor": None},
        ]
        assert [p["id"] for p in model.due_for_publishing(posts, utc(2026, 9, 15, 11))] == ["a"]


class TestCadenciaDeGeracao:
    cfg = {"timezone": "America/Sao_Paulo", "generate_hour": 6, "generate_weekdays": [0, 3]}  # seg e qui

    def test_nao_gera_fora_do_dia_da_semana_escolhido(self):
        # 2026-09-15 é terça
        assert model.should_generate(utc(2026, 9, 15, 12), self.cfg, last_generated_at=None) is False

    def test_gera_no_dia_certo_depois_da_hora_configurada(self):
        # 2026-09-14 é segunda; 12:00 UTC = 09:00 SP, depois das 6h
        assert model.should_generate(utc(2026, 9, 14, 12), self.cfg, last_generated_at=None) is True

    def test_nao_gera_antes_da_hora(self):
        # 08:00 UTC = 05:00 SP, antes das 6h
        assert model.should_generate(utc(2026, 9, 14, 8), self.cfg, last_generated_at=None) is False

    def test_uma_vez_por_dia_mesmo_com_o_agendador_batendo_de_hora_em_hora(self):
        ja_gerou_hoje = utc(2026, 9, 14, 9)  # 06:00 SP do mesmo dia local
        assert model.should_generate(utc(2026, 9, 14, 12), self.cfg, ja_gerou_hoje) is False

    def test_geracao_do_dia_anterior_nao_bloqueia_hoje(self):
        assert model.should_generate(utc(2026, 9, 17, 12), self.cfg, utc(2026, 9, 14, 9)) is True

    def test_lista_de_dias_vazia_desliga_a_geracao_automatica(self):
        cfg = {**self.cfg, "generate_weekdays": []}
        assert model.should_generate(utc(2026, 9, 14, 12), cfg, None) is False


class TestNormalizacao:
    def test_tags_viram_minusculas_sem_repetir_e_no_maximo_seis(self):
        assert model.clean_tags([" IA ", "ia", "Cloud", "", "a", "b", "c", "d", "e"]) == [
            "ia", "cloud", "a", "b", "c", "d"
        ]

    def test_acento_nao_cria_tag_duplicada_mas_a_grafia_original_e_mantida(self):
        # a URL /blog/tag/<tag> compara igualdade exata: "Liderança" e "lideranca"
        # viradas em duas tags separam os posts do mesmo assunto
        assert model.clean_tags(["Liderança", "lideranca", "LIDERANÇA"]) == ["liderança"]

    def test_secao_sem_paragrafo_e_descartada(self):
        secoes = model.clean_sections([
            {"heading": "Um", "paragraphs": ["texto"]},
            {"heading": "Vazia", "paragraphs": []},
            {"heading": "", "paragraphs": ["sem título ainda vale"]},
        ])
        assert [s["heading"] for s in secoes] == ["Um", ""]

    def test_tempo_de_leitura_conta_os_dois_idiomas_separadamente(self):
        corpo = {"sections": [{"heading": "h", "paragraphs": ["palavra " * 400]}]}
        assert model.reading_minutes(corpo) == 2

    def test_post_precisa_dos_dois_idiomas_para_publicar(self):
        base = {"slug": "x", "i18n": {"pt": {"title": "t", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]}}}
        with pytest.raises(ValueError, match="en"):
            model.assert_publishable(base)


class TestRodizioDeTermos:
    def test_escolhe_o_termo_ha_mais_tempo_sem_uso(self):
        # history do mais recente para o mais antigo
        assert model.pick_rotating(["a", "b", "c"], ["a", "b"]) == "c"

    def test_termo_nunca_usado_vem_antes_de_qualquer_usado(self):
        assert model.pick_rotating(["a", "novo"], ["a"]) == "novo"

    def test_todos_ja_usados_volta_para_o_mais_antigo(self):
        assert model.pick_rotating(["a", "b"], ["b", "a"]) == "a"

    def test_ignora_acento_e_caixa_ao_comparar(self):
        assert model.pick_rotating(["Inovação", "outro"], ["inovacao"]) == "outro"

    def test_lista_vazia_devolve_None(self):
        assert model.pick_rotating([], ["a"]) is None
