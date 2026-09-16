"""Fila e agenda do compartilhamento no LinkedIn — tudo puro, sem rede."""
from datetime import datetime, timezone

from blog import model


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


def post(**over):
    base = {"id": "x", "status": "published", "publishedAt": utc(2026, 1, 1),
            "linkedinEnabled": True, "linkedinPostedAt": None}
    return {**base, **over}


class TestFila:
    def test_do_mais_ANTIGO_para_o_mais_novo(self):
        posts = [post(id="novo", publishedAt=utc(2026, 5, 1)),
                 post(id="velho", publishedAt=utc(2026, 1, 1)),
                 post(id="meio", publishedAt=utc(2026, 3, 1))]
        assert [p["id"] for p in model.linkedin_queue(posts)] == ["velho", "meio", "novo"]

    def test_so_post_publicado_entra(self):
        posts = [post(id="rascunho", status="draft"), post(id="no-ar")]
        assert [p["id"] for p in model.linkedin_queue(posts)] == ["no-ar"]

    def test_post_desabilitado_fica_de_fora(self):
        posts = [post(id="off", linkedinEnabled=False), post(id="on")]
        assert [p["id"] for p in model.linkedin_queue(posts)] == ["on"]

    def test_post_ja_compartilhado_nao_volta(self):
        posts = [post(id="ja", linkedinPostedAt=utc(2026, 2, 1)), post(id="falta")]
        assert [p["id"] for p in model.linkedin_queue(posts)] == ["falta"]

    def test_campo_ausente_conta_como_HABILITADO(self):
        # o padrão é compartilhar; post antigo não tem o campo gravado
        sem_campo = {"id": "antigo", "status": "published", "publishedAt": utc(2026, 1, 1)}
        assert [p["id"] for p in model.linkedin_queue([sem_campo])] == ["antigo"]

    def test_publicado_sem_data_vai_para_o_fim_em_vez_de_quebrar(self):
        posts = [post(id="sem-data", publishedAt=None), post(id="com-data")]
        assert [p["id"] for p in model.linkedin_queue(posts)] == ["com-data", "sem-data"]

    def test_fila_vazia_quando_tudo_ja_foi(self):
        assert model.linkedin_queue([post(linkedinPostedAt=utc(2026, 2, 1))]) == []


class TestAgenda:
    cfg = {"timezone": "America/Sao_Paulo", "linkedin_enabled": True,
           "linkedin_weekdays": [1, 3], "linkedin_hour": 9}  # terça e quinta

    def test_publica_no_dia_e_depois_da_hora(self):
        # 2026-09-15 é terça; 13:00 UTC = 10:00 em SP
        assert model.should_share(utc(2026, 9, 15, 13), self.cfg, None) is True

    def test_antes_da_hora_nao(self):
        assert model.should_share(utc(2026, 9, 15, 11), self.cfg, None) is False  # 08:00 SP

    def test_fora_do_dia_escolhido_nao(self):
        assert model.should_share(utc(2026, 9, 16, 13), self.cfg, None) is False  # quarta

    def test_uma_vez_por_dia_local(self):
        ja = utc(2026, 9, 15, 12)  # 09:00 SP do mesmo dia
        assert model.should_share(utc(2026, 9, 15, 15), self.cfg, ja) is False

    def test_compartilhado_ontem_nao_bloqueia_hoje(self):
        assert model.should_share(utc(2026, 9, 17, 13), self.cfg, utc(2026, 9, 15, 12)) is True

    def test_recurso_desligado_nao_publica(self):
        cfg = {**self.cfg, "linkedin_enabled": False}
        assert model.should_share(utc(2026, 9, 15, 13), cfg, None) is False

    def test_sem_dia_marcado_nao_publica(self):
        cfg = {**self.cfg, "linkedin_weekdays": []}
        assert model.should_share(utc(2026, 9, 15, 13), cfg, None) is False
