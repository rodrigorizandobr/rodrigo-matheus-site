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

    def __init__(self, tempos="[1340, 1345, 1350, 1355, 1360, 1365]", confere=True, inicio_fino=1342,
                 explode_em=None):
        self.tempos, self.confere, self.inicio_fino, self.explode_em = tempos, confere, inicio_fino, explode_em
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

    def refine_start(self, url, start, post_text):
        return self.inicio_fino

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

    def test_inicio_fino_nunca_sai_do_trecho(self, env):
        # se o refinamento voltar algo absurdo, fica o início grosso
        post = _post_pendente()
        ferramentas = Ferramentas(inicio_fino=5)
        clip_worker.process(post, ferramentas)
        assert ferramentas.cortes == [(1340, 1370)]


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


class TestLimiteDeDuracao:
    def test_refino_que_puxa_o_inicio_para_tras_nao_passa_do_maximo(self, env):
        # medido: início grosso 1300 virou 1296 e o corte ficou com 49 s (máximo é 45)
        post = _post_pendente()
        ferramentas = Ferramentas(tempos="[" + ", ".join(str(t) for t in range(1300, 1400, 5)) + "]", inicio_fino=1296)
        clip_worker.process(post, ferramentas)
        (inicio, fim), = ferramentas.cortes
        assert inicio == 1296 and fim - inicio <= clips_max()


def clips_max():
    from blog import clips
    return clips.MAX_CLIP
