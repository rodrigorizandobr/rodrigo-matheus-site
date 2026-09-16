"""A régua de avisos da autorização do LinkedIn.

O token dura ~60 dias e não se renova. Se ninguém avisar, o compartilhamento para
em silêncio e só se descobre semanas depois, olhando o perfil.
"""
import pytest

from blog import model, notify


class TestReguaDeAvisos:
    def test_autorizacao_nova_nao_avisa_ninguem(self):
        assert model.expiry_step(58, sent=[]) is None

    def test_avisa_ao_cruzar_a_primeira_marca(self):
        assert model.expiry_step(30, sent=[]) == 30

    def test_nao_repete_a_mesma_marca_na_batida_seguinte(self):
        assert model.expiry_step(29, sent=[30]) is None

    def test_cada_marca_mais_apertada_avisa_de_novo(self):
        assert model.expiry_step(15, sent=[30]) == 15
        assert model.expiry_step(7, sent=[30, 15]) == 7
        assert model.expiry_step(3, sent=[30, 15, 7]) == 3
        assert model.expiry_step(1, sent=[30, 15, 7, 3]) == 1

    def test_vencida_avisa_uma_ultima_vez(self):
        assert model.expiry_step(0, sent=[30, 15, 7, 3, 1]) == 0
        assert model.expiry_step(-4, sent=[30, 15, 7, 3, 1, 0]) is None

    def test_quem_chega_atrasado_manda_um_aviso_so_o_mais_apertado(self):
        """Cloud Run dormiu uma semana: não pode acordar disparando cinco e-mails."""
        assert model.expiry_step(6, sent=[]) == 7

    def test_marcas_ja_cruzadas_ficam_gastas_junto_com_a_disparada(self):
        assert model.expiry_marks(6) == [30, 15, 7]
        assert model.expiry_marks(45) == []


class TestTextoDoAviso:
    def test_o_assunto_diz_o_prazo_para_ler_sem_abrir(self):
        assunto, _ = notify.expiry_message(7, 7)
        assert "7 dias" in assunto and "LinkedIn" in assunto

    def test_vencida_nao_finge_que_ainda_da_tempo(self):
        assunto, corpo = notify.expiry_message(0, 0)
        assert "venceu" in assunto.lower()
        assert "parado" in corpo.lower()

    def test_o_corpo_leva_o_link_do_painel(self):
        _, corpo = notify.expiry_message(15, 15)
        assert "/admin" in corpo


class TestEnvio:
    """Envio pelo SES. Nenhuma falha daqui pode derrubar a batida do agendador."""

    def test_sem_remetente_verificado_configurado_nao_tenta_enviar(self, monkeypatch):
        monkeypatch.setattr(notify, "ALERT_FROM", "")
        assert notify.configured() is False
        assert notify.send("a", "b") is False

    def test_sem_destinatario_tambem_nao_envia(self, monkeypatch):
        monkeypatch.setattr(notify, "ALERT_FROM", "robo@example.com")
        monkeypatch.setattr(notify, "ALERT_TO", [])
        assert notify.configured() is False

    def test_manda_pelo_ses_com_assunto_e_corpo_em_utf8(self, monkeypatch):
        chamadas = []

        class FakeSes:
            def send_email(self, **kw):
                chamadas.append(kw)
                return {"MessageId": "abc"}

        monkeypatch.setattr(notify, "ALERT_FROM", "robo@example.com")
        monkeypatch.setattr(notify, "ALERT_TO", ["rodrigo@example.com"])
        monkeypatch.setattr(notify, "_ses", lambda: FakeSes())

        assert notify.send("assunto com acentuação", "corpo") is True
        kw = chamadas[0]
        assert kw["FromEmailAddress"] == "robo@example.com"
        assert kw["Destination"]["ToAddresses"] == ["rodrigo@example.com"]
        simples = kw["Content"]["Simple"]
        assert simples["Subject"] == {"Data": "assunto com acentuação", "Charset": "UTF-8"}
        assert simples["Body"]["Text"]["Data"] == "corpo"

    def test_remetente_ainda_nao_verificado_nao_explode(self, monkeypatch):
        """No sandbox do SES isto acontece de verdade — e não pode parar o agendador."""
        class FakeSes:
            def send_email(self, **kw):
                raise RuntimeError("MessageRejected: Email address is not verified")

        monkeypatch.setattr(notify, "ALERT_FROM", "robo@example.com")
        monkeypatch.setattr(notify, "ALERT_TO", ["rodrigo@example.com"])
        monkeypatch.setattr(notify, "_ses", lambda: FakeSes())
        assert notify.send("a", "b") is False

    def test_o_motivo_da_falha_chega_a_quem_pediu_o_teste(self, monkeypatch):
        """No painel, "não saiu" sem motivo obriga a abrir log do Cloud Run."""
        class FakeSes:
            def send_email(self, **kw):
                raise RuntimeError("MessageRejected: Email address is not verified")

        monkeypatch.setattr(notify, "ALERT_FROM", "robo@example.com")
        monkeypatch.setattr(notify, "ALERT_TO", ["rodrigo@example.com"])
        monkeypatch.setattr(notify, "_ses", lambda: FakeSes())
        ok, motivo = notify.send_with_reason("a", "b")
        assert ok is False and "not verified" in motivo

    def test_sem_configuracao_o_motivo_diz_o_que_falta(self, monkeypatch):
        monkeypatch.setattr(notify, "ALERT_FROM", "")
        ok, motivo = notify.send_with_reason("a", "b")
        assert ok is False and "remetente" in motivo.lower()

    def test_falha_de_credencial_tambem_devolve_false(self, monkeypatch):
        def explode():
            raise RuntimeError("sem credencial da AWS")

        monkeypatch.setattr(notify, "ALERT_FROM", "robo@example.com")
        monkeypatch.setattr(notify, "ALERT_TO", ["rodrigo@example.com"])
        monkeypatch.setattr(notify, "_ses", explode)
        assert notify.send("a", "b") is False


# ── integração: a régua dentro da batida do agendador ───────────────────────

from datetime import datetime, timedelta, timezone  # noqa: E402

from blog import linkedin, service  # noqa: E402
from tests.fakes import FakeDb  # noqa: E402


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(linkedin, "_db", lambda: fake)
    return fake


@pytest.fixture
def enviados(monkeypatch):
    caixa = []
    monkeypatch.setattr(notify, "send", lambda assunto, corpo: caixa.append((assunto, corpo)) or True)
    return caixa


def conecta(db, dias: int, agora: datetime):
    db.collection(linkedin.COLLECTION).document(linkedin.DOC_TOKEN).set({
        "accessToken": "t", "personUrn": "urn:li:person:x",
        "expiresAt": agora + timedelta(days=dias), "updatedAt": agora,
    })


class TestReguaNaBatida:
    def test_sem_conta_conectada_nao_ha_o_que_avisar(self, db, enviados):
        assert service.check_expiry(now=datetime(2026, 9, 16, tzinfo=timezone.utc)) is None
        assert enviados == []

    def test_avisa_uma_vez_por_marca_mesmo_batendo_de_hora_em_hora(self, db, enviados):
        agora = datetime(2026, 9, 16, tzinfo=timezone.utc)
        conecta(db, 15, agora)
        assert service.check_expiry(now=agora) == 15
        assert service.check_expiry(now=agora + timedelta(hours=1)) is None
        assert service.check_expiry(now=agora + timedelta(hours=2)) is None
        assert len(enviados) == 1
        assert "15 dias" in enviados[0][0]

    def test_marca_mais_apertada_volta_a_avisar(self, db, enviados):
        agora = datetime(2026, 9, 16, tzinfo=timezone.utc)
        conecta(db, 15, agora)
        service.check_expiry(now=agora)
        conecta(db, 3, agora)          # o mesmo token, agora perto do fim
        db.collection(linkedin.COLLECTION).document(linkedin.DOC_TOKEN).update(
            {"notices": [30, 15]})     # o histórico sobrevive à releitura
        assert service.check_expiry(now=agora) == 3
        assert len(enviados) == 2

    def test_reconectar_zera_a_regua(self, db, enviados, monkeypatch):
        agora = datetime(2026, 9, 16, tzinfo=timezone.utc)
        conecta(db, 3, agora)
        service.check_expiry(now=agora)
        monkeypatch.setattr(linkedin, "person_urn", lambda token: "urn:li:person:x")
        linkedin.save_auth("token-novo", 60 * 24 * 3600, now=agora)
        assert linkedin.notices() == []

    def test_a_batida_chama_a_regua_e_um_erro_de_e_mail_nao_a_derruba(self, db, monkeypatch):
        agora = datetime(2026, 9, 16, tzinfo=timezone.utc)
        monkeypatch.setattr(service.store, "publish_due", lambda now=None: [])
        monkeypatch.setattr(service.store, "get_config", lambda: dict(model.DEFAULT_CONFIG))
        monkeypatch.setattr(service.store, "last_shared_at", lambda: None)
        monkeypatch.setattr(service.store, "last_generated_at", lambda: agora)
        monkeypatch.setattr(service, "check_expiry", lambda now=None: (_ for _ in ()).throw(RuntimeError("smtp")))
        resultado = service.tick(now=agora)
        assert "linkedin" in resultado["error"] or resultado["error"] == "" or "aviso" in resultado["error"]
