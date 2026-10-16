"""Escolha do trecho do vídeo a partir dos quadros que o Gemini marcou — puro, sem rede."""
from blog import clips


class TestAgruparTrechos:
    def test_quadros_vizinhos_viram_um_trecho_que_vai_ate_a_proxima_amostra(self):
        # quadro a cada 5 s: o assunto marcado em 100 aparece até perto de 105
        assert clips.group_segments([100, 105, 110]) == [(100, 115)]

    def test_um_buraco_de_um_quadro_nao_quebra_o_trecho(self):
        # o Gemini às vezes pula um quadro no meio da mesma cena
        assert clips.group_segments([100, 105, 115]) == [(100, 120)]

    def test_buraco_maior_separa_trechos(self):
        assert clips.group_segments([100, 105, 140, 145]) == [(100, 110), (140, 150)]

    def test_aceita_fora_de_ordem_e_repetido(self):
        assert clips.group_segments([110, 100, 105, 105]) == [(100, 115)]

    def test_vazio(self):
        assert clips.group_segments([]) == []


class TestEscolherTrecho:
    def test_o_mais_longo_vence(self):
        assert clips.choose_segment([(10, 25), (100, 140), (300, 320)]) == (100, 140)

    def test_trecho_longo_demais_e_cortado_no_maximo_a_partir_do_inicio(self):
        assert clips.choose_segment([(100, 200)]) == (100, 100 + clips.MAX_CLIP)

    def test_curto_demais_nao_serve(self):
        # um quadro solto vira 5 s de vídeo — não é recorte, é piscada
        assert clips.choose_segment([(100, 105)]) is None

    def test_sem_trecho_nenhum(self):
        assert clips.choose_segment([]) is None


class TestLerResposta:
    def test_le_a_lista_de_tempos(self):
        assert clips.parse_times('{"tempos": [5, 10, 15]}') == [5, 10, 15]

    def test_descarta_lixo_e_negativo(self):
        assert clips.parse_times('{"tempos": [5, "x", -10, 12.0, null]}') == [5, 12]

    def test_resposta_quebrada_vira_lista_vazia(self):
        assert clips.parse_times("isso não é json") == []
        assert clips.parse_times('{"outra": [1]}') == []

    def test_descarta_tempo_alem_do_fim_do_video(self):
        # medido: o Gemini já apontou 37:05 num vídeo de 23:21
        assert clips.parse_times('{"tempos": [100, 5000]}', duration=1401) == [100]


class TestTempoNoFormatoDoYtdlp:
    def test_minutos_e_segundos(self):
        assert clips.hms(1340) == "22:20"

    def test_mais_de_uma_hora(self):
        assert clips.hms(3725) == "1:02:05"


class TestEscolhaPorNota:
    """Medido no Roadster: o mais longo era a pista escura + burnout e terminava na filmagem aérea;
    o loop e o salto sobre o caminhão (o que o post discute) eram um trecho mais curto."""

    def test_le_tempos_com_nota(self):
        texto = '{"tempos": [{"t": 100, "nota": 3}, {"t": 105, "nota": 1}]}'
        assert clips.parse_scores(texto) == {100: 3, 105: 1}

    def test_tempo_sem_nota_vale_um_e_nota_fora_da_escala_e_contida(self):
        assert clips.parse_scores('{"tempos": [100, {"t": 105, "nota": 9}, {"t": 110, "nota": 0}]}') == \
            {100: 1, 105: 3, 110: 1}

    def test_parse_times_continua_lendo_o_formato_com_nota(self):
        assert clips.parse_times('{"tempos": [{"t": 100, "nota": 3}, 105]}') == [100, 105]

    def test_descarta_tempo_alem_da_duracao(self):
        assert clips.parse_scores('{"tempos": [{"t": 900, "nota": 3}]}', duration=800) == {}

    def test_trecho_mais_curto_com_nota_alta_vence_o_mais_longo_de_nota_baixa(self):
        notas = {t: 1 for t in range(100, 160, 5)}          # 60 s de carro só passando
        notas.update({t: 3 for t in range(300, 325, 5)})    # 25 s do salto
        trechos = clips.group_segments(list(notas))
        assert clips.choose_segment(trechos, scores=notas) == (300, 325)

    def test_trecho_longo_fica_com_a_janela_de_maior_nota(self):
        # dentro de um trecho de 100 s, os 45 s escolhidos são os que concentram a nota
        notas = {t: 1 for t in range(100, 200, 5)}
        notas.update({t: 3 for t in range(150, 180, 5)})
        inicio, fim = clips.choose_segment(clips.group_segments(list(notas)), scores=notas)
        assert fim - inicio == clips.MAX_CLIP and inicio <= 150 and fim >= 180

    def test_sem_nota_continua_o_mais_longo(self):
        assert clips.choose_segment([(10, 25), (100, 140)], scores=None) == (100, 140)


class TestJanelasEmOrdem:
    """A conferência recusou o melhor trecho? Tenta o segundo antes de trocar de vídeo."""

    def test_devolve_as_janelas_da_melhor_para_a_pior_sem_sobreposicao(self):
        notas = {t: 3 for t in range(300, 325, 5)}
        notas.update({t: 1 for t in range(100, 130, 5)})
        janelas = clips.rank_segments(clips.group_segments(list(notas)), scores=notas)
        assert janelas[0] == (300, 325)
        assert janelas[1][0] >= 100 and janelas[1][1] <= 135
        assert len(janelas) == 2

    def test_choose_segment_e_a_primeira_da_lista(self):
        notas = {t: 2 for t in range(100, 160, 5)}
        trechos = clips.group_segments(list(notas))
        assert clips.choose_segment(trechos, scores=notas) == clips.rank_segments(trechos, scores=notas)[0]

    def test_nada_aproveitavel_devolve_vazio(self):
        assert clips.rank_segments([(10, 15)]) == []
