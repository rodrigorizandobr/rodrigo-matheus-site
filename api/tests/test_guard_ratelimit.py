"""O limite de requisições: um balde de fichas por chave, que enche com o tempo."""
from guard.ratelimit import Limiter


class Relogio:
    def __init__(self):
        self.agora = 1000.0

    def __call__(self):
        return self.agora

    def passa(self, segundos):
        self.agora += segundos


class TestLimite:
    def test_deixa_passar_ate_o_limite_e_depois_recusa(self):
        limite = Limiter(3, 60, clock=Relogio())
        assert [limite.allow("a") for _ in range(4)] == [True, True, True, False]

    def test_cada_chave_tem_o_proprio_balde(self):
        limite = Limiter(1, 60, clock=Relogio())
        assert limite.allow("a") is True
        assert limite.allow("a") is False
        assert limite.allow("b") is True

    def test_o_balde_enche_com_o_tempo(self):
        relogio = Relogio()
        limite = Limiter(2, 60, clock=relogio)
        assert [limite.allow("a") for _ in range(3)] == [True, True, False]
        relogio.passa(30)  # metade da janela devolve uma das duas fichas
        assert limite.allow("a") is True
        assert limite.allow("a") is False

    def test_o_balde_nunca_passa_do_limite_por_ficar_parado(self):
        relogio = Relogio()
        limite = Limiter(2, 60, clock=relogio)
        relogio.passa(3600)
        assert [limite.allow("a") for _ in range(3)] == [True, True, False]

    def test_diz_em_quantos_segundos_da_para_tentar_de_novo(self):
        relogio = Relogio()
        limite = Limiter(2, 60, clock=relogio)
        limite.allow("a"), limite.allow("a")
        assert limite.allow("a") is False
        assert limite.retry_after("a") == 30
        relogio.passa(12)
        assert limite.retry_after("a") == 18

    def test_quem_nunca_bateu_nao_precisa_esperar(self):
        assert Limiter(2, 60, clock=Relogio()).retry_after("ninguem") == 0


class TestMemoria:
    def test_chaves_paradas_sao_esquecidas_quando_o_mapa_enche(self):
        """Um atacante trocando de chave a cada chamada não pode encher a memória do servidor."""
        relogio = Relogio()
        limite = Limiter(5, 60, clock=relogio, max_keys=100)
        for i in range(100):
            limite.allow(f"velha-{i}")
        relogio.passa(120)  # todas voltaram a estar cheias: não há o que lembrar
        limite.allow("nova")
        assert len(limite) <= 100
        assert limite.allow("nova") is True

    def test_mapa_cheio_de_chaves_ativas_ainda_nao_cresce_sem_fim(self):
        limite = Limiter(5, 60, clock=Relogio(), max_keys=50)
        for i in range(500):
            limite.allow(f"k-{i}")
        assert len(limite) <= 50
