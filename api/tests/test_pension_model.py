"""Núcleo puro do simulador: só valida faixa/conjunto/lista e tipo, nunca calcula nada."""
import pytest

from pension import model


class TestSanitize:
    def test_campo_numerico_dentro_da_faixa_passa(self):
        assert model.sanitize({"aporteBasicoPct": 8}) == {"aporteBasicoPct": 8}

    def test_campo_desconhecido_e_ignorado_sem_erro(self):
        assert model.sanitize({"campoQueNaoExiste": 1}) == {}

    def test_campo_numerico_fora_da_faixa_levanta_ValueError(self):
        with pytest.raises(ValueError, match="years"):
            model.sanitize({"years": 999})

    def test_mesDissidio_so_aceita_1_a_12(self):
        assert model.sanitize({"mesDissidio": 1}) == {"mesDissidio": 1}
        with pytest.raises(ValueError, match="mesDissidio"):
            model.sanitize({"mesDissidio": 13})

    def test_string_no_lugar_de_numero_levanta_ValueError(self):
        with pytest.raises(ValueError, match="salarioBruto"):
            model.sanitize({"salarioBruto": "dez mil"})

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


class TestFaixasEmpresa:
    def test_lista_valida_passa(self):
        faixas = [{"idadeMin": 0, "idadeMax": 40, "percentual": 100}]
        assert model.sanitize({"faixasEmpresa": faixas}) == {"faixasEmpresa": faixas}

    def test_lista_vazia_e_valida__sem_faixa_a_empresa_nao_aporta(self):
        assert model.sanitize({"faixasEmpresa": []}) == {"faixasEmpresa": []}

    def test_nao_lista_levanta_ValueError(self):
        with pytest.raises(ValueError, match="faixasEmpresa"):
            model.sanitize({"faixasEmpresa": "não é lista"})

    def test_faixa_que_nao_e_objeto_levanta_ValueError(self):
        with pytest.raises(ValueError, match="faixasEmpresa"):
            model.sanitize({"faixasEmpresa": [123]})

    def test_campo_faltando_na_faixa_levanta_ValueError(self):
        with pytest.raises(ValueError, match="idadeMax"):
            model.sanitize({"faixasEmpresa": [{"idadeMin": 0, "percentual": 100}]})

    def test_idadeMax_menor_que_idadeMin_levanta_ValueError(self):
        with pytest.raises(ValueError, match="idadeMax"):
            model.sanitize({"faixasEmpresa": [{"idadeMin": 50, "idadeMax": 40, "percentual": 100}]})

    def test_mais_de_20_faixas_levanta_ValueError(self):
        faixas = [{"idadeMin": i, "idadeMax": i, "percentual": 100} for i in range(21)]
        with pytest.raises(ValueError, match="faixasEmpresa"):
            model.sanitize({"faixasEmpresa": faixas})


class TestMerged:
    def test_sem_nada_salvo_devolve_os_padroes_do_simulador(self):
        assert model.merged(None) == model.DEFAULT_PARAMS

    def test_salvo_sobrepoe_so_os_campos_que_tem(self):
        resultado = model.merged({"aporteBasicoPct": 9, "vehicle": "VGBL"})
        assert resultado["aporteBasicoPct"] == 9
        assert resultado["vehicle"] == "VGBL"
        assert resultado["years"] == model.DEFAULT_PARAMS["years"]

    def test_lixo_salvo_nao_derruba_a_leitura__so_ignora_o_campo_ruim(self):
        resultado = model.merged({"vehicle": "CDB", "aporteBasicoPct": 9})
        assert resultado["vehicle"] == model.DEFAULT_PARAMS["vehicle"]
        assert resultado["aporteBasicoPct"] == 9

    def test_mutar_as_faixas_do_resultado_nao_vaza_para_o_padrao_global(self):
        resultado = model.merged(None)
        resultado["faixasEmpresa"].append({"idadeMin": 99, "idadeMax": 100, "percentual": 500})
        assert len(model.DEFAULT_PARAMS["faixasEmpresa"]) == 3
