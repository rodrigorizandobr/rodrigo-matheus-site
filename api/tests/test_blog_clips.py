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

    def test_trecho_longo_vai_inteiro_o_assunto_decide_o_tamanho(self):
        # pedido do PO, 2026-10-17: "corte o tamanho necessário, sem limite de tempo"
        assert clips.choose_segment([(100, 200)]) == (100, 200)
        assert clips.choose_segment([(100, 400)]) == (100, 400)

    def test_so_o_teto_da_plataforma_corta(self):
        # o vídeo nativo do LinkedIn aceita até 10 minutos
        assert clips.MAX_CLIP == 600
        assert clips.choose_segment([(100, 1000)]) == (100, 100 + clips.MAX_CLIP)

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

    def test_trecho_longo_com_notas_vai_inteiro(self):
        notas = {t: 1 for t in range(100, 200, 5)}
        notas.update({t: 3 for t in range(150, 180, 5)})
        assert clips.choose_segment(clips.group_segments(list(notas)), scores=notas) == (100, 200)

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


def _legenda(*frases):
    """json3 do YouTube: cada evento traz palavras com `tOffsetMs`. `frases`: (início_s, texto)."""
    eventos = []
    for inicio, texto in frases:
        palavras = texto.split()
        eventos.append({"tStartMs": int(inicio * 1000), "dDurationMs": 4000,
                        "segs": [{"utf8": (" " if i else "") + p, "tOffsetMs": i * 400}
                                 for i, p in enumerate(palavras)]})
    return {"events": [{"tStartMs": 0, "dDurationMs": 100}, *eventos]}


class TestFalasDoVideo:
    def test_legenda_vira_frases_com_inicio_e_fim(self):
        falas = clips.parse_captions(_legenda((100, "Google also says it can write a lot."),
                                              (104, "That means more room. Now the charts.")))
        assert [f[2] for f in falas] == ["Google also says it can write a lot.", "That means more room.",
                                         "Now the charts."]
        assert falas[0][0] == 100 and falas[1][0] > falas[0][0]
        assert falas[0][1] <= falas[1][0] + 1

    def test_frase_pode_atravessar_eventos(self):
        falas = clips.parse_captions(_legenda((10, "o modelo aguenta"), (12, "um milhão de tokens.")))
        assert [f[2] for f in falas] == ["o modelo aguenta um milhão de tokens."]

    def test_pausa_longa_tambem_fecha_a_frase_quando_nao_ha_pontuacao(self):
        falas = clips.parse_captions(_legenda((10, "primeira ideia sem ponto"), (30, "segunda ideia")))
        assert [f[2] for f in falas] == ["primeira ideia sem ponto", "segunda ideia"]

    def test_legenda_vazia_ou_estranha_nao_quebra(self):
        assert clips.parse_captions({}) == []
        assert clips.parse_captions({"events": [{"tStartMs": 5}]}) == []
        assert clips.parse_captions("lixo") == []

    def test_texto_das_falas_leva_o_tempo_de_cada_frase_e_so_a_regiao_pedida(self):
        falas = [(100, 104, "um."), (104, 108, "dois."), (300, 304, "três.")]
        assert clips.transcript_text(falas, 90, 200) == "[100s] um.\n[104s] dois."
        assert clips.transcript_text(falas) == "[100s] um.\n[104s] dois.\n[300s] três."
        assert clips.transcript_text([]) == ""


class TestCorteEmFronteiraDeFrase:
    # o post do Argon: o corte 105–120 abria no meio de "Google also says…" e fechava no meio da frase seguinte
    FALAS = [(100.0, 112.0, "Google also says it can write 1 million tokens."),
             (112.0, 118.0, "It just means more room."),
             (118.0, 128.0, "Now, in most benchmarks, Argon wins.")]

    def test_comeco_no_meio_da_frase_recua_para_o_comeco_dela(self):
        assert clips.snap_to_sentences(105, 118, self.FALAS)[0] == 100

    def test_fim_no_meio_da_frase_avanca_para_o_fim_dela(self):
        assert clips.snap_to_sentences(105, 120, self.FALAS)[1] == 128

    def test_ponta_que_ja_esta_numa_fronteira_fica_onde_esta(self):
        assert clips.snap_to_sentences(112, 118, self.FALAS) == (112, 118)

    def test_nao_corre_mais_que_o_alcance_atras_de_uma_frase_gigante(self):
        longa = [(0.0, 90.0, "Uma frase que nunca acaba.")]
        assert clips.snap_to_sentences(40, 60, longa, reach=15) == (40, 60)

    def test_sem_legenda_o_corte_fica_como_veio(self):
        assert clips.snap_to_sentences(105, 120, []) == (105, 120)

    def test_passar_do_teto_da_plataforma_devolve_o_corte_original(self, monkeypatch):
        monkeypatch.setattr(clips, "MAX_CLIP", 20)
        assert clips.snap_to_sentences(105, 120, self.FALAS) == (105, 120)


class TestPontaQueSoRaspaAFrase:
    # medido no Argon: a frase anterior ia de 97,3 a 104,4 e o corte começava em 104 — recuava 7 s por meio segundo
    FALAS = [(97.3, 104.4, "Frase anterior sobre preço."), (104.4, 118.6, "O trecho que importa."),
             (118.6, 124.5, "Já são os benchmarks.")]

    def test_comeco_que_so_pega_a_cauda_da_frase_anterior_avanca_para_a_proxima(self):
        assert clips.snap_to_sentences(104, 118, self.FALAS)[0] == 105

    def test_fim_que_so_pega_o_comeco_da_frase_seguinte_recua_para_antes_dela(self):
        assert clips.snap_to_sentences(104, 119, self.FALAS)[1] == 118

    def test_meio_da_frase_continua_incluindo_a_frase_inteira(self):
        assert clips.snap_to_sentences(100, 121, self.FALAS) == (97, 125)

    def test_ajuste_que_deixa_o_corte_curto_demais_devolve_o_original(self):
        falas = [(0.0, 20.0, "Uma."), (20.0, 30.0, "Duas.")]
        assert clips.snap_to_sentences(19, 21, falas) == (19, 21)
