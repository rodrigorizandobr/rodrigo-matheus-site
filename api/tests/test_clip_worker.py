"""Rotina de recorte do Mac: a coreografia, com ferramentas de mentira (sem YouTube, ffmpeg nem Gemini)."""
import shutil
import subprocess
from datetime import datetime, timezone

import pytest

import clip_worker
from blog import media, service, store
from tests.fakes import FakeBucket, FakeDb, FakeFilter

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"x" * 500
MONTADO = b"\x00\x00\x00\x18ftypmp42" + b"montado" * 80


def utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


A = "https://www.youtube.com/watch?v=AAAAAAAAAAA"
B = "https://www.youtube.com/watch?v=BBBBBBBBBBB"
C = "https://www.youtube.com/watch?v=CCCCCCCCCCC"


class Ferramentas:
    """Faz de conta: o vídeo tem 1400 s e o assunto aparece de 1340 a 1365.

    `explode_em` + `explode_vezes`: a etapa falha (como rede) nas primeiras N vezes (None = sempre).
    `ruins`: vídeos sem nenhum quadro com o assunto. `confere`: bool, ou lista (uma resposta por corte).
    `achados`: o que a busca nova devolve quando a reserva acaba.
    """

    estrategias = 4

    def __init__(self, tempos="[1340, 1345, 1350, 1355, 1360, 1365]", confere=True, janela=(1342, 1370),
                 explode_em=None, explode_vezes=None, ruins=(), achados=(), falas=()):
        self.tempos, self.confere, self.janela = tempos, confere, janela
        self.falas, self.falas_vistas = list(falas), []
        self.explode_em, self.explode_vezes, self.explosoes = explode_em, explode_vezes, 0
        self.ruins, self.achados = ruins, list(achados)
        self.regioes, self.cortes, self.usadas, self.pausas, self.buscas, self.urls = [], [], [], 0, [], []
        self.montagens, self.conferidos = [], []

    def _talvez_explodir(self, etapa):
        if self.explode_em == etapa and (self.explode_vezes is None or self.explosoes < self.explode_vezes):
            self.explosoes += 1
            raise RuntimeError(f"falhou em {etapa}")

    def use_strategy(self, i):
        self.usadas.append(i)

    def pause(self, i):
        self.pausas += 1

    def search_more(self, post, tried):
        self.buscas.append(sorted(tried))
        return self.achados.pop(0) if self.achados else []

    def duration(self, url):
        self.urls.append(url)
        self._talvez_explodir("duration")
        return 1400

    def frames(self, url, step):
        self._talvez_explodir("frames")
        return [(t, b"jpg") for t in range(0, 1400, step)]

    def transcript(self, url):
        self._talvez_explodir("legenda")
        return self.falas

    def ask_times(self, frames, post_text, duration, falas=()):
        self.falas_vistas.append(("tempos", list(falas)))
        if self.urls and self.urls[-1] in self.ruins:
            return '{"tempos": []}'
        return '{"tempos": %s}' % self.tempos

    def refine_window(self, url, start, end, post_text, falas=()):
        self.regioes.append((start, end))
        self.falas_vistas.append(("janela", list(falas)))
        return self.janela

    def cut(self, url, start, end):
        self._talvez_explodir("cut")
        self.cortes.append((start, end))
        return MP4, 1280, 720

    def concat(self, mp4s):
        self._talvez_explodir("concat")
        self.montagens.append(len(mp4s))
        return MONTADO, 1280, 720

    def verify(self, mp4, post_text):
        self.conferidos.append(mp4)
        ok = self.confere.pop(0) if isinstance(self.confere, list) else self.confere
        return ok, "o carro andando grudado na parede de um loop e pulando sobre um caminhão"


@pytest.fixture
def env(monkeypatch):
    db, bucket = FakeDb(), FakeBucket()
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    monkeypatch.setattr(media, "_bucket", lambda: bucket)
    revisoes = []

    def revisa(post, instrucao):
        revisoes.append(instrucao)
        novo = {**post["i18n"]["pt"], "sections": [{"heading": "", "paragraphs": ["Texto. No vídeo, o carro sobe a parede."]}]}
        return {"i18n": {"pt": novo, "en": post["i18n"]["en"]}, "tags": post.get("tags", [])}

    monkeypatch.setattr(service.gemini, "revise_post", revisa)
    emails = []
    monkeypatch.setattr(clip_worker.notify, "send", lambda assunto, corpo: emails.append((assunto, corpo)) or True)
    return {"bucket": bucket, "revisoes": revisoes, "emails": emails}


def _post_pendente(clip=None, video_url="https://www.youtube.com/watch?v=qt5p-_tE8d0&xstg=lixo", reserva=()):
    corpo = {"title": "Tesla bota foguete em carro", "excerpt": "e",
             "sections": [{"heading": "", "paragraphs": ["A sucção cola o carro no chão."]}]}
    return store.create_post({
        "slugBase": "tesla", "tags": ["tesla"], "i18n": {"pt": corpo, "en": corpo},
        "video": {"url": video_url, "title": "Roadster Event", "channel": "Tesla"},
        "clip": clip if clip is not None else {"status": "pending"},
        "videoCandidates": [{"url": u, "title": f"Reserva {u[-3:]}", "channel": "Outro"} for u in reserva],
    }, now=utc(2026, 10, 16, 10))


class TestFila:
    def test_pega_so_os_pendentes(self, env):
        a = _post_pendente()
        _post_pendente(clip={"status": "ready", "hash": "x" * 64})
        _post_pendente(clip={"status": "failed", "reason": "r"})
        assert [p["id"] for p in clip_worker.pending_posts()] == [a["id"]]

    def test_pergunta_so_pelos_pendentes_sem_ler_a_colecao_inteira(self, env, monkeypatch):
        # a rodada roda de 15 em 15 min: em silêncio ela não pode custar uma leitura por post do blog
        a = _post_pendente()
        _post_pendente(clip={"status": "ready", "hash": "x" * 64})

        def lista_tudo():
            raise AssertionError("leu a coleção inteira")

        monkeypatch.setattr(store, "list_posts", lista_tudo)
        assert [p["id"] for p in clip_worker.pending_posts()] == [a["id"]]


class TestRecorte:
    def test_caminho_feliz_grava_o_clipe_e_marca_pronto(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas()
        clip_worker.process(post, ferramentas)
        gravado = store.get_post(post["id"])
        clip = gravado["clip"]
        assert clip["status"] == "ready"
        assert clip["start"] == 1342 and clip["end"] == 1370
        assert clip["width"] == 1280 and clip["height"] == 720
        assert env["bucket"].objects[f"{media.VIDEO_PREFIX}/{clip['hash']}.mp4"]["data"] == MP4
        assert ferramentas.cortes == [(1342, 1370)]

    def test_credita_o_canal_e_guarda_o_link_limpo(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        clip = store.get_post(post["id"])["clip"]
        assert clip["channel"] == "Tesla" and clip["title"] == "Roadster Event"
        assert clip["sourceUrl"] == "https://www.youtube.com/watch?v=qt5p-_tE8d0"

    def test_texto_ganha_uma_frase_apresentando_o_trecho(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        assert len(env["revisoes"]) == 1 and "loop" in env["revisoes"][0]
        texto = store.get_post(post["id"])["i18n"]["pt"]["sections"][0]["paragraphs"][0]
        assert "No vídeo" in texto

    def test_post_continua_rascunho(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        assert store.get_post(post["id"])["status"] == "draft"

    def test_nenhum_quadro_com_o_assunto_marca_falha_com_motivo(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas(tempos="[]"))
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "failed" and "nenhum trecho" in clip["reason"]

    def test_trecho_curto_demais_tambem_falha(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas(tempos="[1340]"))
        assert store.get_post(post["id"])["clip"]["status"] == "failed"

    def test_conferencia_final_recusando_nao_grava_clipe(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas(confere=False))
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "failed" and "conferência" in clip["reason"]
        assert not env["bucket"].objects

    @pytest.mark.parametrize("etapa", ["duration", "frames", "cut"])
    def test_erro_de_rede_continua_pendente_para_a_proxima_rodada(self, env, etapa):
        # medido: o corte falhou uma vez (ffmpeg 8, soluço do servidor de vídeo) e na hora
        # seguinte o MESMO comando funcionou — erro de rede não é motivo para desistir
        post = _post_pendente()
        clip_worker.process(post, Ferramentas(explode_em=etapa))
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "pending" and clip["attempts"] == 1 and etapa in clip["lastError"]

    def test_sem_reserva_desiste_depois_das_rodadas_com_o_motivo(self, env):
        post = _post_pendente()
        for _ in range(clip_worker.MAX_ATTEMPTS):
            clip_worker.process(store.get_post(post["id"]), Ferramentas(explode_em="cut"))
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "failed" and "cut" in clip["reason"]

    def test_falha_que_nao_e_de_rede_desiste_na_hora(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas(tempos="[]"))
        assert store.get_post(post["id"])["clip"]["status"] == "failed"

class TestRodada:
    def test_respeita_o_limite_por_rodada(self, env):
        for _ in range(3):
            _post_pendente()
        assert clip_worker.run_once(Ferramentas(), limit=2) == 2

    def test_recusa_rodar_fora_do_projeto_certo(self, monkeypatch):
        # já aconteceu: sem projeto fixo, o cliente caiu no projeto padrão do gcloud (br51-app)
        monkeypatch.setattr(clip_worker, "_project", lambda: "br51-app")
        with pytest.raises(SystemExit, match="rodrigo-matheus"):
            clip_worker.check_project()


class TestFraseDoVideo:
    def test_pede_frase_com_palavras_proprias_sem_colar_a_descricao(self, env):
        # medido: "O vídeo do evento mostra Elon Musk apresenta o esportivo…" — colou a descrição
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        instrucao = env["revisoes"][0]
        assert "com suas palavras" in instrucao and "não repita" in instrucao


class TestConferenciaFinal:
    def test_barra_corte_sem_o_assunto_mas_nao_exige_cada_detalhe_do_texto(self):
        # medido: recusou o loop da sucção porque o texto falava de salto — rígido demais
        pergunta = clip_worker.VERIFY_PROMPT
        assert "mesmo que não mostre todos os detalhes" in pergunta
        assert "pessoas falando" in pergunta


class TestLimiteNaoGastaTentativa:
    def test_429_espera_a_proxima_rodada_sem_contar_tentativa(self, env):
        # medido: teto de gasto do Gemini estourado (429) — com a rotina de 15 em 15 min, contar
        # tentativa faria o post desistir em 45 min sem nunca ter tido chance
        class Limitado(Ferramentas):
            def ask_times(self, *a):
                raise RuntimeError("429 Client Error: Too Many Requests")
        post = _post_pendente()
        for _ in range(clip_worker.MAX_ATTEMPTS + 1):
            clip_worker.process(store.get_post(post["id"]), Limitado())
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "pending" and not clip.get("attempts")
        assert "429" in clip["lastError"]


class TestJanelaFina:
    """A 5 s o corte começou e terminou fora da ação (carro parado no palco, filmagem aérea); a 1
    quadro/s um modelo mais forte acerta a janela — o tempo continua vindo do quadro."""

    def test_pede_a_janela_numa_regiao_com_folga_em_volta_do_trecho_grosso(self, env):
        # a folga depois do fim é maior: o quadro escuro entre a manobra e o salto quebrava o trecho
        post = _post_pendente()
        ferramentas = Ferramentas()
        clip_worker.process(post, ferramentas)
        assert ferramentas.regioes == [(1340 - clip_worker.MARGIN_BEFORE, min(1400, 1370 + clip_worker.MARGIN_AFTER))]

    @pytest.mark.parametrize("janela", [None, (5, 40), (1342, 1346), (1360, 1340), ("a", "b")])
    def test_janela_invalida_fica_com_o_trecho_grosso(self, env, janela):
        post = _post_pendente()
        ferramentas = Ferramentas(janela=janela)
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1340, 1370)]

    def test_janela_pode_sair_do_trecho_grosso_dentro_da_regiao(self, env):
        # foi assim no Roadster: o salto vinha depois do fim do trecho grosso
        post = _post_pendente()
        ferramentas = Ferramentas(janela=(1350, 1390))
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1350, 1390)]

    def test_janela_longa_vai_inteira_sem_limite_de_tempo(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(janela=(1335, 1399))
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1335, 1399)]

    def test_so_o_teto_da_plataforma_corta_a_janela(self, env, monkeypatch):
        from blog import clips
        monkeypatch.setattr(clips, "MAX_CLIP", 20)
        post = _post_pendente()
        ferramentas = Ferramentas(janela=(1335, 1399))
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1335, 1355)]

    def test_pergunta_do_trecho_nao_impoe_limite_de_segundos(self):
        pergunta = clip_worker.refine_prompt("texto do post", [])
        assert "sem limite de tempo" in pergunta and "MAX_CLIP" not in pergunta


class TestFalaNoRecorte:
    """Vídeo de explicação (gráfico, animação, alguém falando): o assunto está no que é DITO. O recorte
    do Argon (105–120) abria no meio de uma frase e fechava no meio de outra, e a marcação por quadro
    só achou 3 quadros porque o prompt jogava fora animação e gente falando."""

    FALAS = [(1330.0, 1342.0, "Primeira ideia inteira."), (1342.0, 1372.0, "Segunda ideia, a que importa."),
             (1372.0, 1380.0, "Já outro assunto.")]

    def test_corte_abre_e_fecha_em_fronteira_de_frase(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(falas=self.FALAS, janela=(1335, 1360))
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1330, 1372)]

    def test_a_fala_vai_nas_duas_perguntas_ao_modelo(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(falas=self.FALAS)
        clip_worker.process(post, ferramentas)
        assert ferramentas.falas_vistas == [("tempos", self.FALAS), ("janela", self.FALAS)]

    def test_janela_invalida_do_modelo_tambem_fecha_em_frase(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(falas=self.FALAS, janela=None)
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1330, 1372)]

    def test_sem_legenda_o_corte_e_o_de_antes(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas()
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1342, 1370)]

    def test_legenda_que_falha_nao_derruba_o_recorte(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(explode_em="legenda")
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1342, 1370)]
        assert store.get_post(post["id"])["clip"]["status"] == "ready"

    def test_marcacao_vale_o_quadro_quando_a_fala_trata_do_assunto(self):
        pergunta = clip_worker.times_prompt("texto do post", [(10.0, 14.0, "frase dita")])
        assert "[10s] frase dita" in pergunta and "a fala" in pergunta.lower()

    def test_sem_legenda_a_marcacao_nao_menciona_fala(self):
        pergunta = clip_worker.times_prompt("texto do post", [])
        assert "FALA" not in pergunta and "transcrição" not in pergunta

    def test_pergunta_da_janela_leva_so_a_fala_da_regiao_e_pede_frase_inteira(self):
        falas = [(10.0, 14.0, "dentro."), (900.0, 904.0, "fora.")]
        pergunta = clip_worker.refine_prompt("texto do post", falas, 0, 100)
        assert "[10s] dentro." in pergunta and "fora." not in pergunta
        assert "frase" in pergunta


class TestModeloDaVisao:
    def test_escolha_de_trecho_usa_modelo_mais_forte_que_o_do_texto(self):
        # medido: o flash-lite deu janelas de 3 s e "viu" salto onde não havia; o 3.8-flash acertou
        assert clip_worker.VISION_MODEL != clip_worker.gemini.TEXT_MODEL
        assert clip_worker.VISION_MODEL == clip_worker.gemini.CHECK_MODEL


class TestNotaNaEscolha:
    def test_trecho_com_nota_alta_vence_o_mais_longo(self, env):
        tempos = ", ".join([*(f'{{"t": {t}, "nota": 1}}' for t in range(100, 160, 5)),
                            *(f'{{"t": {t}, "nota": 3}}' for t in range(1340, 1370, 5))])
        post = _post_pendente()
        ferramentas = Ferramentas(tempos=f"[{tempos}]", janela=None)
        clip_worker.process(post, ferramentas)
        (inicio, fim), = ferramentas.cortes
        assert inicio >= 1335 and fim <= 1375



class TestOutroJeitoDeBaixar:
    """Falhou o download? Na mesma rodada tenta outro modo de acesso, com uma pausa entre eles."""

    def test_falha_uma_vez_e_o_proximo_modo_resolve_na_mesma_rodada(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(explode_em="cut", explode_vezes=1)
        clip_worker.process(post, ferramentas)
        assert store.get_post(post["id"])["clip"]["status"] == "ready"
        assert ferramentas.usadas == [0, 1] and ferramentas.pausas == 1

    def test_todos_os_modos_falhando_fica_para_a_proxima_rodada(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(explode_em="cut")
        clip_worker.process(post, ferramentas)
        clip = store.get_post(post["id"])["clip"]
        assert ferramentas.usadas == [0, 1, 2, 3]
        assert clip["status"] == "pending" and clip["attempts"] == 1 and clip["lastTriedAt"]

    def test_esgotadas_as_rodadas_passa_para_o_proximo_video(self, env):
        post = _post_pendente(reserva=[B])
        for _ in range(clip_worker.MAX_ATTEMPTS):
            clip_worker.process(store.get_post(post["id"]), Ferramentas(explode_em="cut"))
        gravado = store.get_post(post["id"])
        assert gravado["video"]["url"] == B
        assert gravado["clip"]["tried"][0]["kind"] == "rede"


class TestOutroTrecho:
    def test_conferencia_recusou_o_melhor_trecho_tenta_o_segundo(self, env):
        tempos = "[" + ", ".join(str(t) for t in [*range(100, 130, 5), *range(1340, 1370, 5)]) + "]"
        post = _post_pendente()
        ferramentas = Ferramentas(tempos=tempos, confere=[False, True], janela=None)
        clip_worker.process(post, ferramentas)
        assert len(ferramentas.cortes) == 2
        assert store.get_post(post["id"])["clip"]["status"] == "ready"


class TestOutroVideo:
    def test_video_sem_o_assunto_passa_para_a_reserva_na_mesma_rodada(self, env):
        post = _post_pendente(video_url=A, reserva=[B])
        clip_worker.process(post, Ferramentas(ruins={A}))
        gravado = store.get_post(post["id"])
        assert gravado["clip"]["status"] == "ready" and gravado["video"]["url"] == B
        assert gravado["clip"]["sourceUrl"] == B
        assert gravado["clip"]["tried"][0]["url"] == A and "nenhum trecho" in gravado["clip"]["tried"][0]["reason"]

    def test_reserva_esgotada_busca_de_novo_sem_repetir_video(self, env):
        post = _post_pendente(video_url=A, reserva=[B])
        ferramentas = Ferramentas(ruins={A, B}, achados=[[{"url": B, "title": "repetido"}, {"url": C, "title": "Novo", "channel": "Z"}]])
        clip_worker.process(post, ferramentas)
        gravado = store.get_post(post["id"])
        assert gravado["video"]["url"] == C and gravado["clip"]["status"] == "ready"
        assert ferramentas.buscas == [sorted([A, B])]

    def test_nada_deu_certo_marca_falha_e_manda_email(self, env):
        post = _post_pendente(video_url=A, reserva=[B])
        clip_worker.process(post, Ferramentas(ruins={A, B}))
        gravado = store.get_post(post["id"])
        assert gravado["clip"]["status"] == "failed" and "2 vídeos" in gravado["clip"]["reason"]
        (assunto, corpo), = env["emails"]
        assert "Recorte não deu" in assunto
        assert A in corpo and B in corpo and f"/admin/editar/{post['id']}" in corpo

    def test_todos_sem_o_assunto_o_post_fica_sem_video(self, env):
        # link de um vídeo que não mostra o assunto seria pior que nenhum
        post = _post_pendente(video_url=A)
        clip_worker.process(post, Ferramentas(ruins={A}))
        assert store.get_post(post["id"]).get("video") is None

    def test_para_no_limite_de_videos(self, env):
        urls = [f"https://www.youtube.com/watch?v={str(i) * 11}" for i in range(1, 10)]
        post = _post_pendente(video_url=A)
        ferramentas = Ferramentas(ruins={A, *urls}, achados=[[{"url": u}] for u in urls])
        for _ in range(5):
            clip_worker.process(store.get_post(post["id"]), ferramentas)
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "failed" and len(clip["tried"]) == clip_worker.MAX_VIDEOS


def _tempos(*grupos):
    return "[" + ", ".join(f'{{"t": {t}, "nota": {n}}}' for i, f, n in grupos for t in range(i, f, 5)) + "]"


class TestVideoComVariasPartes:
    """Pedido do PO, 2026-10-17: vários trechos do mesmo vídeo, num só arquivo, dentro do teto do LinkedIn."""

    DOIS = _tempos((100, 125, 3), (1340, 1370, 3))

    def test_dois_momentos_viram_um_video_montado_em_ordem_de_video(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(tempos=self.DOIS, janela=None)
        clip_worker.process(post, ferramentas)
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "ready"
        assert ferramentas.cortes == [(100, 125), (1340, 1370)] and ferramentas.montagens == [2]
        assert clip["parts"] == [[100, 125], [1340, 1370]]
        assert clip["start"] == 100 and clip["end"] == 1370
        assert env["bucket"].objects[f"{media.VIDEO_PREFIX}/{clip['hash']}.mp4"]["data"] == MONTADO

    def test_a_conferencia_olha_o_video_montado_uma_vez(self, env):
        ferramentas = Ferramentas(tempos=self.DOIS, janela=None)
        clip_worker.process(_post_pendente(), ferramentas)
        assert ferramentas.conferidos == [MONTADO]

    def test_um_momento_so_nao_monta_nada_e_nao_grava_partes(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas()
        clip_worker.process(post, ferramentas)
        assert ferramentas.montagens == []
        assert "parts" not in store.get_post(post["id"])["clip"]

    def test_montagem_recusada_cai_para_o_melhor_momento_sozinho(self, env):
        post = _post_pendente()
        ferramentas = Ferramentas(tempos=self.DOIS, janela=None, confere=[False, True])
        clip_worker.process(post, ferramentas)
        clip = store.get_post(post["id"])["clip"]
        assert clip["status"] == "ready" and "parts" not in clip
        assert (clip["start"], clip["end"]) == (1340, 1370)
        assert ferramentas.cortes == [(100, 125), (1340, 1370)]  # o corte já feito não se refaz

    def test_a_soma_das_partes_respeita_o_teto_da_plataforma(self, env, monkeypatch):
        from blog import clips
        monkeypatch.setattr(clips, "MAX_CLIP", 40)
        ferramentas = Ferramentas(tempos=self.DOIS, janela=None)
        clip_worker.process(_post_pendente(), ferramentas)
        assert ferramentas.cortes == [(1340, 1370)] and ferramentas.montagens == []

    def test_cada_parte_ganha_a_janela_fina_e_o_fim_na_frase(self, env):
        falas = [(1368.0, 1374.0, "Frase que passa do fim.")]
        ferramentas = Ferramentas(tempos=self.DOIS, janela=None, falas=falas)
        clip_worker.process(_post_pendente(), ferramentas)
        assert ferramentas.cortes == [(100, 125), (1340, 1374)]
        assert len(ferramentas.regioes) == 2

    def test_erro_ao_montar_e_de_rede_e_fica_para_a_proxima_rodada(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas(tempos=self.DOIS, janela=None, explode_em="concat"))
        assert store.get_post(post["id"])["clip"]["status"] == "pending"

    def test_o_email_lista_cada_parte_com_o_link_no_segundo_exato(self, env):
        clip_worker.process(_post_pendente(), Ferramentas(tempos=self.DOIS, janela=None))
        (_, corpo), = env["emails"]
        assert "01:40–02:05" in corpo and "t=100s" in corpo
        assert "22:20–22:50" in corpo and "t=1340s" in corpo


class TestEmailDeRecortePronto:
    def test_avisa_com_o_canal_e_o_link_do_original_para_pedir_autorizacao(self, env):
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        (assunto, corpo), = env["emails"]
        assert "Recorte pronto" in assunto
        assert "Tesla" in corpo and "youtube.com/watch?v=qt5p-_tE8d0" in corpo
        assert f"/admin/editar/{post['id']}" in corpo


class TestSinalDeVida:
    def test_toda_rodada_marca_que_o_mac_esta_rodando(self, env):
        clip_worker.run_once(Ferramentas(), limit=1)
        assert store.clip_worker_heartbeat().get("lastRunAt")


FOTO = {"hash": "f" * 64, "provider": "web", "credit": "Foto: g1.globo.com", "sourceUrl": "https://g1.globo.com/m",
        "alt": "t", "width": 1280, "height": 720}


class TestCapaDoPost:
    """Escada de mídia: o recorte é a primeira opção. Se desiste, o post ganha foto real e, sem ela, imagem
    de IA; se dá certo e o post não tem capa, o quadro de abertura do vídeo vira o pôster."""

    def test_desistiu_e_acha_foto_real(self, env, monkeypatch):
        monkeypatch.setattr(service.photos, "find", lambda *a, **k: FOTO)
        post = _post_pendente(video_url=A)
        clip_worker.process(post, Ferramentas(ruins={A}))
        gravado = store.get_post(post["id"])
        assert gravado["clip"]["status"] == "failed" and gravado["image"]["credit"] == "Foto: g1.globo.com"
        assert "Foto: g1.globo.com" in env["emails"][0][1]

    def test_desistiu_sem_foto_cai_para_a_ia(self, env, monkeypatch):
        monkeypatch.setattr(service.photos, "find", lambda *a, **k: None)
        monkeypatch.setattr(service.images, "build_cover", lambda p, a, keywords=None: {
            "hash": "g" * 64, "provider": "gemini", "credit": "", "sourceUrl": "", "alt": a, "width": 1, "height": 1})
        post = _post_pendente(video_url=A)
        clip_worker.process(post, Ferramentas(ruins={A}))
        assert store.get_post(post["id"])["image"]["provider"] == "gemini"
        assert "imagem criada" in env["emails"][0][1]

    def test_erro_ao_buscar_capa_nao_derruba_a_desistencia(self, env, monkeypatch):
        monkeypatch.setattr(service, "ensure_cover", lambda pid: (_ for _ in ()).throw(RuntimeError("boom")))
        post = _post_pendente(video_url=A)
        clip_worker.process(post, Ferramentas(ruins={A}))
        assert store.get_post(post["id"])["clip"]["status"] == "failed"
        assert env["emails"] and "Recorte não deu" in env["emails"][0][0]

    def test_recorte_pronto_sem_capa_usa_o_quadro_do_video(self, env, monkeypatch):
        pedidos = []
        monkeypatch.setattr(clip_worker.photos, "youtube_poster", lambda url: pedidos.append(url) or b"POSTER")
        guardou = []
        monkeypatch.setattr(clip_worker.media, "store_image", lambda raw, provider, **k: guardou.append((raw, provider)) or {
            "hash": "p" * 64, "provider": provider, "credit": "", "sourceUrl": "", "alt": k.get("alt", ""),
            "width": 1280, "height": 720})
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        gravado = store.get_post(post["id"])
        assert guardou == [(b"POSTER", "youtube")] and "qt5p-_tE8d0" in pedidos[0]
        assert gravado["image"]["hash"] == "p" * 64 and gravado["image"]["credit"] == ""

    def test_recorte_pronto_com_capa_nao_troca_a_capa(self, env, monkeypatch):
        def nao(url):
            raise AssertionError("não devia buscar pôster")
        monkeypatch.setattr(clip_worker.photos, "youtube_poster", nao)
        post = _post_pendente()
        store.update_post(post["id"], {"image": FOTO})
        clip_worker.process(store.get_post(post["id"]), Ferramentas())
        assert store.get_post(post["id"])["image"]["hash"] == "f" * 64

    def test_poster_que_falha_nao_derruba_o_recorte(self, env, monkeypatch):
        def fora(url):
            raise OSError("fora")
        monkeypatch.setattr(clip_worker.photos, "youtube_poster", fora)
        post = _post_pendente()
        clip_worker.process(post, Ferramentas())
        assert store.get_post(post["id"])["clip"]["status"] == "ready"


class TestOuvinte:
    def test_post_novo_acorda_a_rotina(self):
        vigia = clip_worker.PendingWatcher()
        assert vigia.has_news({"a"}) is True
        assert vigia.has_news({"a", "b"}) is True

    def test_regravar_o_mesmo_pendente_nao_acorda(self):
        # a própria rodada regrava o post a cada tentativa; acordar de novo queimaria as tentativas em laço
        vigia = clip_worker.PendingWatcher()
        vigia.has_news({"a"})
        assert vigia.has_news({"a"}) is False

    def test_pendente_que_sai_da_fila_nao_acorda(self):
        vigia = clip_worker.PendingWatcher()
        vigia.has_news({"a", "b"})
        assert vigia.has_news({"a"}) is False
        assert vigia.has_news({"a", "b"}) is True, "voltou à fila: é novidade de novo"


class FakeEvent:
    def __init__(self):
        self.waits, self.cleared = [], 0

    def clear(self):
        self.cleared += 1

    def wait(self, timeout=None):
        self.waits.append(timeout)


class TestServico:
    def _serve(self, monkeypatch, pendentes, rodadas=2):
        feitas = []
        monkeypatch.setattr(clip_worker, "run_once", lambda tools, limit=3: feitas.append(1) or 0)
        monkeypatch.setattr(clip_worker, "pending_posts", lambda: pendentes)
        evento = FakeEvent()
        clip_worker.serve(object(), evento, stop=lambda: len(feitas) >= rodadas)
        return evento, feitas

    def test_roda_assim_que_acordada_e_depois_espera_o_proximo_aviso(self, monkeypatch):
        evento, feitas = self._serve(monkeypatch, pendentes=[])
        assert len(feitas) == 2 and evento.cleared == 2
        assert evento.waits == [clip_worker.HEARTBEAT_SECONDS]

    def test_com_pendente_que_falhou_tenta_de_novo_em_15_min(self, monkeypatch):
        evento, _ = self._serve(monkeypatch, pendentes=[{"id": "x"}])
        assert evento.waits == [clip_worker.RETRY_SECONDS] and clip_worker.RETRY_SECONDS == 900

    def test_sem_aviso_ainda_bate_o_sinal_de_vida(self, monkeypatch):
        # o servidor avisa por e-mail se o Mac calar por 2 h; meia hora sobra de folga
        assert clip_worker.HEARTBEAT_SECONDS <= 30 * 60


class TestLegendaDoYoutube:
    """Medido ao vivo: `--sub-langs pt.*` pedia a TRADUÇÃO automática, o YouTube devolvia 429 e o yt-dlp
    saía com erro mesmo com a legenda original já no disco — que a rotina jogava fora."""

    LEGENDA = {"events": [{"tStartMs": 1000, "segs": [{"utf8": "Hello there.", "tOffsetMs": 0}]}]}

    def _fake_run(self, monkeypatch, escreve, sai_com_erro):
        import json
        import subprocess
        chamadas = []

        def run(cmd, **kw):
            chamadas.append(cmd)
            pasta = cmd[cmd.index("-o") + 1].rsplit("/", 1)[0]
            for nome in (escreve if len(chamadas) == 1 else []):
                with open(f"{pasta}/{nome}", "w") as f:
                    json.dump(self.LEGENDA, f)
            if sai_com_erro:
                raise subprocess.CalledProcessError(1, cmd)
            return subprocess.CompletedProcess(cmd, 0, b"", b"")

        monkeypatch.setattr(clip_worker.subprocess, "run", run)
        return chamadas

    def test_erro_do_yt_dlp_nao_joga_fora_a_legenda_que_ja_baixou(self, monkeypatch, tmp_path):
        self._fake_run(monkeypatch, ["v.en-orig.json3"], sai_com_erro=True)
        falas = clip_worker.Ferramentas(str(tmp_path)).transcript("https://www.youtube.com/watch?v=AAAAAAAAAAA")
        assert [f[2] for f in falas] == ["Hello there."]

    def test_pede_so_a_legenda_original_nunca_a_traducao_automatica(self, monkeypatch, tmp_path):
        chamadas = self._fake_run(monkeypatch, ["v.en-orig.json3"], sai_com_erro=False)
        clip_worker.Ferramentas(str(tmp_path)).transcript("https://www.youtube.com/watch?v=AAAAAAAAAAA")
        primeira = chamadas[0]
        assert primeira[primeira.index("--sub-langs") + 1] == ".*-orig" and "--write-auto-subs" in primeira

    def test_sem_original_tenta_a_legenda_feita_a_mao(self, monkeypatch, tmp_path):
        chamadas = self._fake_run(monkeypatch, [], sai_com_erro=False)
        assert clip_worker.Ferramentas(str(tmp_path)).transcript("https://www.youtube.com/watch?v=AAAAAAAAAAA") == []
        assert len(chamadas) == 2
        assert "--write-auto-subs" not in chamadas[1] and "--write-subs" in chamadas[1]

    def test_nada_baixado_devolve_vazio_sem_levantar(self, monkeypatch, tmp_path):
        self._fake_run(monkeypatch, [], sai_com_erro=True)
        assert clip_worker.Ferramentas(str(tmp_path)).transcript("https://www.youtube.com/watch?v=AAAAAAAAAAA") == []


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="sem ffmpeg")
class TestMontagemDeVerdade:
    def _clipe(self, tmp_path, nome, segundos, cor):
        arquivo = tmp_path / nome
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c={cor}:s=640x360:d={segundos}:r=25",
                        "-f", "lavfi", "-i", f"sine=frequency=440:duration={segundos}", "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(arquivo)], check=True)
        return arquivo.read_bytes()

    def test_junta_os_cortes_num_mp4_so_com_a_soma_das_duracoes(self, tmp_path):
        ferramentas = clip_worker.Ferramentas.__new__(clip_worker.Ferramentas)
        ferramentas.dir = tmp_path
        mp4, largura, altura = clip_worker.Ferramentas.concat(
            ferramentas, [self._clipe(tmp_path, "a.mp4", 3, "red"), self._clipe(tmp_path, "b.mp4", 2, "blue")])
        saida = tmp_path / "saida.mp4"
        saida.write_bytes(mp4)
        duracao = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                        "csv=p=0", str(saida)], check=True, capture_output=True, text=True).stdout)
        assert (largura, altura) == (640, 360) and mp4[4:8] == b"ftyp" and 4.7 <= duracao <= 5.4
