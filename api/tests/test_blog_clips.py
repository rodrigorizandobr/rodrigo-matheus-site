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
