"""Capa do post: IA primeiro, banco de imagens como reserva, sempre regravada no nosso Storage."""
import base64
import io

import pytest
from PIL import Image

from blog import images, media
from tests.fakes import FakeBucket, FakeDb, FakeFilter


def _png(w=1200, h=700, cor=(240, 240, 242)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), cor).save(buf, format="PNG")
    return buf.getvalue()


def _resposta_com_imagem():
    """Resposta do Gemini com um PNG embutido, como a API devolve."""
    return type("R", (), {
        "ok": True, "status_code": 200,
        "json": lambda self=None: {"candidates": [{"content": {"parts": [
            {"inlineData": {"data": base64.b64encode(_png()).decode()}}]}}]},
    })()


class FakeResp:
    def __init__(self, payload=None, content=b"", status=200):
        self._payload, self.content, self.status_code = payload, content, status
        self.ok = status < 400
        self.text = str(payload)

    def json(self):
        return self._payload


@pytest.fixture
def bucket(monkeypatch):
    from blog import store
    b, db = FakeBucket(), FakeDb()
    monkeypatch.setattr(media, "_bucket", lambda: b)
    monkeypatch.setattr(media, "_db", lambda: db)
    monkeypatch.setattr(store, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    return b


@pytest.fixture
def gemini_ok(monkeypatch):
    payload = {"candidates": [{"content": {"parts": [
        {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(_png()).decode()}}
    ]}}]}
    monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp(payload))
    monkeypatch.setattr(images, "API_KEY", "k")


class TestGeracaoComIA:
    def test_gera_converte_para_jpeg_e_grava_pelo_hash(self, bucket, gemini_ok):
        capa = images.build_cover("sterile white lab", "alt")
        assert capa["provider"] == "gemini"
        assert len(capa["hash"]) == 64
        nome = f"{media.PREFIX}/{capa['hash']}.jpg"
        assert bucket.objects[nome]["content_type"] == "image/jpeg"
        assert bucket.objects[nome]["data"][:2] == b"\xff\xd8", "precisa ser JPEG de verdade"

    def test_imagem_grande_e_reduzida_ao_lado_maximo(self, bucket, monkeypatch):
        payload = {"candidates": [{"content": {"parts": [
            {"inlineData": {"data": base64.b64encode(_png(4000, 2000)).decode()}}
        ]}}]}
        monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp(payload))
        monkeypatch.setattr(images, "API_KEY", "k")
        capa = images.build_cover("x", "alt")
        img = Image.open(io.BytesIO(bucket.objects[f"{media.PREFIX}/{capa['hash']}.jpg"]["data"]))
        assert max(img.size) == media.MAX_SIDE

    def test_o_mesmo_conteudo_nao_e_gravado_duas_vezes(self, bucket, gemini_ok):
        a = images.build_cover("x", "alt")
        b = images.build_cover("x", "alt")
        assert a["hash"] == b["hash"]
        assert len(bucket.objects) == 1

    def test_o_prompt_de_arte_do_site_vai_junto(self, bucket, monkeypatch):
        capturado = {}
        def fake_post(url, **kw):
            capturado.update(kw)
            return FakeResp({"candidates": [{"content": {"parts": [
                {"inlineData": {"data": base64.b64encode(_png()).decode()}}]}}]})
        monkeypatch.setattr(images.requests, "post", fake_post)
        monkeypatch.setattr(images, "API_KEY", "k")
        images.build_cover("um robô", "alt")
        texto = str(capturado["json"])
        assert "um robô" in texto and "white" in texto.lower()


class TestReservaPixabay:
    def test_ia_falhando_cai_no_banco_de_imagens(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "k")
        monkeypatch.setattr(images, "PIXABAY_KEY", "px")
        monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp({"error": "cota"}, status=429))

        def fake_get(url, **kw):
            if "pixabay" in url:
                return FakeResp({"hits": [{"id": 7, "largeImageURL": "https://img/x.jpg",
                                           "imageWidth": 1200, "imageHeight": 700,
                                           "user": "Fulano", "pageURL": "https://pixabay.com/x"}]})
            return FakeResp(content=_png())
        monkeypatch.setattr(images.requests, "get", fake_get)

        capa = images.build_cover("x", "alt", keywords=["laboratory"])
        assert capa["provider"] == "pixabay"
        assert capa["credit"] == "Fulano / Pixabay"
        assert capa["sourceUrl"] == "https://pixabay.com/x"

    def test_reserva_ignora_imagem_em_pe(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "")
        monkeypatch.setattr(images, "PIXABAY_KEY", "px")
        monkeypatch.setattr(images.requests, "get", lambda url, **kw: FakeResp(
            {"hits": [{"id": 1, "largeImageURL": "u", "imageWidth": 600, "imageHeight": 900,
                       "user": "A", "pageURL": "p"}]}))
        assert images.build_cover("x", "alt", keywords=["a"]) is None

    def test_busca_do_seletor_devolve_miniatura_e_credito(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "PIXABAY_KEY", "px")
        monkeypatch.setattr(images.requests, "get", lambda url, **kw: FakeResp(
            {"hits": [{"id": 9, "largeImageURL": "big.jpg", "webformatURL": "small.jpg",
                       "imageWidth": 1200, "imageHeight": 700, "user": "Beltrano", "pageURL": "https://p"}]}))
        [c] = images.search_stock("laboratório")
        assert c["thumb"] == "small.jpg" and c["credit"] == "Beltrano / Pixabay"

    def test_busca_sem_chave_devolve_lista_vazia(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "PIXABAY_KEY", "")
        assert images.search_stock("x") == []

    def test_sem_ia_e_sem_banco_o_post_sai_sem_capa_em_vez_de_falhar(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "")
        monkeypatch.setattr(images, "PIXABAY_KEY", "")
        assert images.build_cover("x", "alt") is None


class TestLeitura:
    def test_le_de_volta_o_que_gravou(self, bucket, gemini_ok):
        capa = images.build_cover("x", "alt")
        assert images.read_image(capa["hash"])[:2] == b"\xff\xd8"

    def test_hash_inexistente_devolve_None(self, bucket):
        assert images.read_image("a" * 64) is None

    def test_hash_malformado_nao_vira_caminho_no_bucket(self, bucket):
        assert images.read_image("../../etc/passwd") is None

    def test_toda_capa_gerada_entra_na_biblioteca(self, bucket, gemini_ok):
        capa = images.build_cover("x", "alt")
        assert media.get_media(capa["hash"])["provider"] == "gemini"


class TestSemAssinaturaDeIA:
    def test_capa_de_ia_nao_leva_credito_dizendo_que_e_de_ia(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "API_KEY", "k")
        monkeypatch.setattr(images.requests, "post", lambda *a, **k: _resposta_com_imagem())
        item = images.generate_image("uma cena", alt="capa")
        assert item["credit"] == ""

    def test_pede_16x9_no_tamanho_configurado(self, bucket, monkeypatch):
        capturado = {}

        def fake_post(url, **kw):
            capturado["url"] = url
            capturado["body"] = kw.get("json")
            return _resposta_com_imagem()

        monkeypatch.setattr(images, "API_KEY", "k")
        monkeypatch.setattr(images.requests, "post", fake_post)
        images.generate_image("uma cena")
        cfg = capturado["body"]["generationConfig"]["imageConfig"]
        assert cfg["aspectRatio"] == "16:9"
        # 1K já dá 1376 px de largura, acima dos 1200 do cartão do LinkedIn, e custa
        # ~28% menos em tokens que 2K. Subir isto é decisão de custo, não de gosto.
        assert cfg["imageSize"] == "1K"
        assert images.IMAGE_MODEL in capturado["url"]

    def test_sem_reserva_configurada_uma_falha_nao_vira_segunda_cobranca(self, bucket, monkeypatch):
        """A reserva é vazia de propósito: gerar duas vezes por erro raro custa mais."""
        tentativas = []

        def fake_post(url, **kw):
            tentativas.append(url)
            return type("R", (), {"ok": False, "status_code": 500, "text": "erro"})()

        monkeypatch.setattr(images, "API_KEY", "k")
        monkeypatch.setattr(images, "IMAGE_MODEL_FALLBACK", "")
        monkeypatch.setattr(images.requests, "post", fake_post)
        assert images.generate_image("uma cena") is None
        assert len(tentativas) == 1

    def test_se_houver_reserva_configurada_ela_e_tentada(self, bucket, monkeypatch):
        tentativas = []

        def fake_post(url, **kw):
            tentativas.append(url.split("/models/")[1].split(":")[0])
            if len(tentativas) == 1:
                return type("R", (), {"ok": False, "status_code": 500, "text": "erro"})()
            return _resposta_com_imagem()

        monkeypatch.setattr(images, "API_KEY", "k")
        monkeypatch.setattr(images, "IMAGE_MODEL_FALLBACK", "gemini-3-pro-image")
        monkeypatch.setattr(images.requests, "post", fake_post)
        item = images.generate_image("uma cena")
        assert item is not None
        assert tentativas == [images.IMAGE_MODEL, "gemini-3-pro-image"]


class TestDirecaoDeArte:
    def test_mantem_a_paleta_e_as_proibicoes(self):
        d = images.ART_DIRECTION.lower()
        assert "white" in d and "red" in d
        assert "no text" in d and "no logos" in d

    def test_nao_proibe_pessoas_nem_rostos(self):
        # decisão do PO: pessoas liberadas, para histórias de time, demissão e liderança
        d = images.ART_DIRECTION.lower()
        assert "no people" not in d and "no faces" not in d

    def test_o_unico_vermelho_e_um_fio(self):
        # pedido do PO, 2026-11-16: a assinatura das capas é um fio vermelho, não um objeto vermelho qualquer
        d = images.ART_DIRECTION.lower()
        assert "red thread" in d
        assert "nothing else in the frame is red" in d

    def test_nao_dita_o_cenario_so_a_paleta(self):
        # "laboratório com detalhes biomecânicos" colado em todo prompt puxava toda capa ao mesmo lugar
        d = images.ART_DIRECTION.lower()
        assert "biomechanical" not in d and "laboratory" not in d



class TestRunway:
    """Pedido do PO, 2026-11-16: gerar as capas pelo Runway, onde ele tem crédito e a imagem sai mais barata."""

    @pytest.fixture
    def runway(self, monkeypatch):
        """SDK simulado: registra o que foi pedido e devolve uma tarefa concluída com um link."""
        visto = {"criadas": [], "esperas": [], "baixadas": []}

        class Tarefa:
            def wait_for_task_output(self, timeout=600):
                visto["esperas"].append(timeout)
                return type("Pronta", (), {"output": ["https://runway.example/saida.png"]})()

        class Recurso:
            def create(self, **kw):
                visto["criadas"].append(kw)
                return Tarefa()

        monkeypatch.setattr(images, "_runway_client", lambda: type("Cliente", (), {"text_to_image": Recurso()})())
        monkeypatch.setattr(images.requests, "get", lambda url, **k: (visto["baixadas"].append(url), FakeResp(content=_png()))[1])
        monkeypatch.setattr(images.requests, "post", lambda *a, **k: FakeResp({"candidates": [{"content": {"parts": [
            {"inlineData": {"data": base64.b64encode(_png(cor=(10, 10, 10))).decode()}}]}}]}))
        monkeypatch.setattr(images, "RUNWAY_KEY", "rw-chave")
        monkeypatch.setattr(images, "API_KEY", "g-chave")
        return visto

    def test_com_a_chave_do_runway_a_capa_sai_por_ele(self, bucket, runway):
        capa = images.build_cover("a toy car tied to a red thread", "alt")
        assert capa["provider"] == "runway"
        assert len(runway["criadas"]) == 1

    def test_o_pedido_usa_o_modelo_das_capas_aprovadas_em_16_por_9(self, bucket, runway):
        images.build_cover("a toy car tied to a red thread", "alt")
        pedido = runway["criadas"][0]
        assert pedido["model"] == "nano_banana_2.1"
        assert pedido["ratio"] == "1376:768", "o mesmo tamanho da capa de hoje; no Runway é a faixa de 1K"
        assert set(pedido) == {"model", "ratio", "prompt_text"}, "nada de campo que este modelo não tem"

    def test_a_direcao_de_arte_vai_junto_com_a_cena(self, bucket, runway):
        images.build_cover("a toy car tied to a red thread", "alt")
        prompt = runway["criadas"][0]["prompt_text"]
        assert "red thread" in prompt.lower() and "no text" in prompt.lower()
        assert prompt.endswith("SCENE: a toy car tied to a red thread")

    def test_espera_a_tarefa_pelo_sdk_com_prazo_curto(self, bucket, runway):
        # o padrão do SDK é esperar dez minutos; a geração do post inteiro tem que caber numa requisição
        images.build_cover("cena", "alt")
        assert runway["esperas"] == [images.RUNWAY_WAIT_SECONDS] and images.RUNWAY_WAIT_SECONDS <= 240

    def test_o_link_do_resultado_expira_por_isso_a_imagem_e_baixada_e_guardada(self, bucket, runway):
        capa = images.build_cover("cena", "alt")
        assert runway["baixadas"] == ["https://runway.example/saida.png"]
        assert len(capa["hash"]) == 64, "gravada na nossa biblioteca, pelo hash"

    def test_tarefa_que_falha_cai_para_o_gemini_sem_pedir_de_novo_ao_runway(self, bucket, runway, monkeypatch):
        class Falha(Exception):
            pass

        class Tarefa:
            def wait_for_task_output(self, timeout=600):
                raise Falha("moderada")

        class Recurso:
            def create(self, **kw):
                runway["criadas"].append(kw)
                return Tarefa()

        monkeypatch.setattr(images, "_runway_client", lambda: type("C", (), {"text_to_image": Recurso()})())
        capa = images.build_cover("cena", "alt")
        assert capa["provider"] == "gemini", "post sem capa é pior do que uma capa pelo caminho antigo"
        assert len(runway["criadas"]) == 1, "tarefa falha no Runway é cobrada: nunca reenviar sozinho"

    def test_tarefa_sem_saida_tambem_conta_como_falha(self, bucket, runway, monkeypatch):
        class Tarefa:
            def wait_for_task_output(self, timeout=600):
                return type("Vazia", (), {"output": []})()

        monkeypatch.setattr(images, "_runway_client",
                            lambda: type("C", (), {"text_to_image": type("R", (), {"create": lambda self, **kw: Tarefa()})()})())
        monkeypatch.setattr(images, "API_KEY", "")
        assert images.generate_image("cena") is None

    def test_sem_chave_do_runway_nada_muda(self, bucket, gemini_ok, monkeypatch):
        monkeypatch.setattr(images, "RUNWAY_KEY", "")
        monkeypatch.setattr(images, "_runway_client", lambda: (_ for _ in ()).throw(AssertionError("não deveria criar cliente")))
        assert images.provider() == "gemini"
        assert images.build_cover("cena", "alt")["provider"] == "gemini"

    def test_da_para_forcar_o_gemini_mesmo_com_a_chave_do_runway(self, bucket, runway, monkeypatch):
        monkeypatch.setattr(images, "PROVIDER_CHOICE", "gemini")
        assert images.build_cover("cena", "alt")["provider"] == "gemini"
        assert runway["criadas"] == []

    def test_runway_forcado_sem_chave_nao_tenta_chamar(self, bucket, gemini_ok, monkeypatch):
        monkeypatch.setattr(images, "RUNWAY_KEY", "")
        monkeypatch.setattr(images, "PROVIDER_CHOICE", "runway")
        assert images.build_cover("cena", "alt")["provider"] == "gemini"

    def test_sem_chave_nenhuma_o_post_sai_sem_capa_de_ia(self, bucket, monkeypatch):
        monkeypatch.setattr(images, "RUNWAY_KEY", "")
        monkeypatch.setattr(images, "API_KEY", "")
        assert images.generate_image("cena") is None

    def test_o_sdk_instalado_conhece_o_modelo_e_o_formato_que_pedimos(self):
        # trava de contrato: se o SDK mudar de nome de modelo ou de formato, falha aqui e não em produção
        import inspect

        from runwayml import TaskFailedError, TaskTimeoutError  # noqa: F401  (as duas existem com estes nomes)
        from runwayml.resources import text_to_image
        fonte = inspect.getsource(text_to_image)
        assert images.RUNWAY_MODEL in fonte and images.RUNWAY_RATIO in fonte and "prompt_text" in fonte
