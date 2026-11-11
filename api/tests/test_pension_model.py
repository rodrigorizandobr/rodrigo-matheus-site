"""Núcleo puro do simulador: só valida faixa/conjunto e tipo, nunca calcula nada."""
import pytest

from pension import model


class TestSanitize:
    def test_campo_numerico_dentro_da_faixa_passa(self):
        assert model.sanitize({"monthlyAmount": 3_000}) == {"monthlyAmount": 3_000}

    def test_campo_desconhecido_e_ignorado_sem_erro(self):
        assert model.sanitize({"campoQueNaoExiste": 1}) == {}

    def test_campo_numerico_fora_da_faixa_levanta_ValueError(self):
        with pytest.raises(ValueError, match="years"):
            model.sanitize({"years": 999})

    def test_annualMonth_so_aceita_1_a_12(self):
        assert model.sanitize({"annualMonth": 1}) == {"annualMonth": 1}
        with pytest.raises(ValueError, match="annualMonth"):
            model.sanitize({"annualMonth": 13})

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

    class TestCamposCategoricos:
        def test_vehicle_aceita_pgbl_e_vgbl(self):
            assert model.sanitize({"vehicle": "PGBL"}) == {"vehicle": "PGBL"}
            assert model.sanitize({"vehicle": "VGBL"}) == {"vehicle": "VGBL"}

        def test_vehicle_fora_do_conjunto_levanta_ValueError(self):
            with pytest.raises(ValueError, match="vehicle"):
                model.sanitize({"vehicle": "CDB"})

        def test_regime_aceita_regressiva_e_progressiva(self):
            assert model.sanitize({"regime": "regressiva"}) == {"regime": "regressiva"}
            assert model.sanitize({"regime": "progressiva"}) == {"regime": "progressiva"}

        def test_regime_fora_do_conjunto_levanta_ValueError(self):
            with pytest.raises(ValueError, match="regime"):
                model.sanitize({"regime": "nenhuma"})

        def test_numero_no_lugar_de_enum_levanta_ValueError(self):
            with pytest.raises(ValueError, match="vehicle"):
                model.sanitize({"vehicle": 1})


class TestMerged:
    def test_sem_nada_salvo_devolve_os_padroes_do_simulador(self):
        assert model.merged(None) == model.DEFAULT_PARAMS

    def test_salvo_sobrepoe_so_os_campos_que_tem(self):
        resultado = model.merged({"monthlyAmount": 5_000, "vehicle": "VGBL"})
        assert resultado["monthlyAmount"] == 5_000
        assert resultado["vehicle"] == "VGBL"
        assert resultado["years"] == model.DEFAULT_PARAMS["years"]

    def test_lixo_salvo_nao_derruba_a_leitura__so_ignora_o_campo_ruim(self):
        resultado = model.merged({"vehicle": "CDB", "monthlyAmount": 5_000})
        assert resultado["vehicle"] == model.DEFAULT_PARAMS["vehicle"]
        assert resultado["monthlyAmount"] == 5_000
