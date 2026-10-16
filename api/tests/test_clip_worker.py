"""Rotina de recorte do Mac: a coreografia, com ferramentas de mentira (sem YouTube, ffmpeg nem Gemini)."""
from datetime import datetime, timezone

import pytest

import clip_worker
from blog import media, service, store
from tests.fakes import FakeBucket, FakeDb, FakeFilter

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"x" * 500


def utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


class Ferramentas:
    """Faz de conta: o vídeo tem 1400 s e o assunto aparece de 1340 a 1365."""

    def __init__(self, tempos="[1340, 1345, 1350, 1355, 1360, 1365]", confere=True, janela=(1342, 1370),
                 explode_em=None):
        self.tempos, self.confere, self.janela, self.explode_em = tempos, confere, janela, explode_em
        self.regioes = []
        self.cortes = []

    def _talvez_explodir(self, etapa):
        if self.explode_em == etapa:
            raise RuntimeError(f"falhou em {etapa}")

    def duration(self, url):
        self._talvez_explodir("duration")
        return 1400

    def frames(self, url, step):
        self._talvez_explodir("frames")
        return [(t, b"jpg") for t in range(0, 1400, step)]

    def ask_times(self, frames, post_text, duration):
        return '{"tempos": %s}' % self.tempos

    def refine_window(self, url, start, end, post_text):
        self.regioes.append((start, end))
        return self.janela

    def cut(self, url, start, end):
        self._talvez_explodir("cut")
        self.cortes.append((start, end))
        return MP4, 1280, 720

    def verify(self, mp4, post_text):
        return self.confere, "o carro andando grudado na parede de um loop e pulando sobre um caminhão"


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
    return {"bucket": bucket, "revisoes": revisoes}


def _post_pendente(clip=None, video_url="https://www.youtube.com/watch?v=qt5p-_tE8d0&xstg=lixo"):
    corpo = {"title": "Tesla bota foguete em carro", "excerpt": "e",
             "sections": [{"heading": "", "paragraphs": ["A sucção cola o carro no chão."]}]}
    return store.create_post({
        "slugBase": "tesla", "tags": ["tesla"], "i18n": {"pt": corpo, "en": corpo},
        "video": {"url": video_url, "title": "Roadster Event", "channel": "Tesla"},
        "clip": clip if clip is not None else {"status": "pending"},
    }, now=utc(2026, 10, 16, 10))


class TestFila:
    def test_pega_so_os_pendentes(self, env):
        a = _post_pendente()
        _post_pendente(clip={"status": "ready", "hash": "x" * 64})
        _post_pendente(clip={"status": "failed", "reason": "r"})
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

    def test_desiste_depois_de_tres_tentativas_com_o_motivo(self, env):
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
        assert ferramentas.regioes == [(1340 - clip_worker.MARGIN_BEFORE, 1370 + clip_worker.MARGIN_AFTER)]

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

    def test_janela_longa_e_cortada_no_maximo(self, env):
        from blog import clips
        post = _post_pendente()
        ferramentas = Ferramentas(janela=(1335, 1399))
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1335, 1335 + clips.MAX_CLIP)]


class TestModeloDaVisao:
    def test_escolha_de_trecho_usa_modelo_mais_forte_que_o_do_texto(self):
        # medido: o flash-lite deu janelas de 3 s e "viu" salto onde não havia; o 3.8-flash acertou
        assert clip_worker.VISION_MODEL != clip_worker.gemini.TEXT_MODEL
        assert clip_worker.VISION_MODEL in clip_worker.GEMINI_URL


class TestNotaNaEscolha:
    def test_trecho_com_nota_alta_vence_o_mais_longo(self, env):
        tempos = ", ".join([*(f'{{"t": {t}, "nota": 1}}' for t in range(100, 160, 5)),
                            *(f'{{"t": {t}, "nota": 3}}' for t in range(1340, 1370, 5))])
        post = _post_pendente()
        ferramentas = Ferramentas(tempos=f"[{tempos}]", janela=None)
        clip_worker.process(post, ferramentas)
        (inicio, fim), = ferramentas.cortes
        assert inicio >= 1335 and fim <= 1375

