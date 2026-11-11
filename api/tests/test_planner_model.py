"""Núcleo puro do simulador: só valida faixa e tipo, nunca calcula nada."""
import pytest

from planner import model


class TestSanitize:
    def test_campo_conhecido_dentro_da_faixa_passa(self):
        assert model.sanitize({"pctPagoChaves": 60}) == {"pctPagoChaves": 60}

    def test_campo_desconhecido_e_ignorado_sem_erro(self):
        assert model.sanitize({"campoQueNaoExiste": 1}) == {}

    def test_campo_fora_da_faixa_levanta_ValueError(self):
        with pytest.raises(ValueError, match="pctPagoChaves"):
            model.sanitize({"pctPagoChaves": 150})

    def test_annualMonth_so_aceita_1_a_12(self):
        assert model.sanitize({"annualMonth": 1}) == {"annualMonth": 1}
        assert model.sanitize({"annualMonth": 12}) == {"annualMonth": 12}
        with pytest.raises(ValueError, match="annualMonth"):
            model.sanitize({"annualMonth": 13})
        with pytest.raises(ValueError, match="annualMonth"):
            model.sanitize({"annualMonth": 0})

    def test_campo_negativo_fora_da_faixa_levanta_ValueError(self):
        with pytest.raises(ValueError, match="years"):
            model.sanitize({"years": -1})

    def test_string_no_lugar_de_numero_levanta_ValueError(self):
        with pytest.raises(ValueError, match="monthlyAmount"):
            model.sanitize({"monthlyAmount": "dez mil"})

    def test_booleano_nao_passa_como_numero(self):
        # bool é subclasse de int em Python — sem a guarda explícita, True viraria 1 sem erro
        with pytest.raises(ValueError, match="dissidio"):
            model.sanitize({"dissidio": True})

    def test_patch_vazio_nao_quebra(self):
        assert model.sanitize({}) == {}
        assert model.sanitize(None) == {}


class TestMerged:
    def test_sem_nada_salvo_devolve_os_padroes_do_simulador(self):
        assert model.merged(None) == model.DEFAULT_PARAMS

    def test_salvo_sobrepoe_so_os_campos_que_tem(self):
        resultado = model.merged({"monthlyAmount": 20_000})
        assert resultado["monthlyAmount"] == 20_000
        assert resultado["years"] == model.DEFAULT_PARAMS["years"]

    def test_lixo_salvo_nao_derruba_a_leitura__so_ignora_o_campo_ruim(self):
        resultado = model.merged({"pctPagoChaves": 999, "monthlyAmount": 20_000})
        assert resultado["pctPagoChaves"] == model.DEFAULT_PARAMS["pctPagoChaves"]
        assert resultado["monthlyAmount"] == 20_000
