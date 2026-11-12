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

    def test_mesDissidio_so_aceita_1_a_12(self):
        assert model.sanitize({"mesDissidio": 1}) == {"mesDissidio": 1}
        with pytest.raises(ValueError, match="mesDissidio"):
            model.sanitize({"mesDissidio": 13})

    def test_abate3anos_e_extra100k_nao_existem_mais(self):
        # campo removido do simulador (FGTS automático substitui) — vira payload ignorado
        assert model.sanitize({"abate3anos": 110_000, "extra100k": 1_000}) == {}

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

    def test_campos_novos_de_custo_passam_dentro_da_faixa(self):
        patch = {"prazoObraMeses": 36, "vacanciaMesesAno": 1.5, "itbiPct": 3, "fgtsTetoImovel": 0, "impostoVendaPct": 6.73}
        assert model.sanitize(patch) == patch

    def test_vacancia_nao_passa_de_12_meses_por_ano(self):
        with pytest.raises(ValueError, match="vacanciaMesesAno"):
            model.sanitize({"vacanciaMesesAno": 13})


class TestQuemPaga:
    @pytest.mark.parametrize("campo", ["iptuPagador", "condominioPagador"])
    def test_aceita_inquilino_e_proprietario(self, campo):
        assert model.sanitize({campo: "inquilino"}) == {campo: "inquilino"}
        assert model.sanitize({campo: "proprietario"}) == {campo: "proprietario"}

    @pytest.mark.parametrize("campo", ["iptuPagador", "condominioPagador"])
    def test_fora_do_conjunto_levanta_ValueError(self, campo):
        with pytest.raises(ValueError, match=campo):
            model.sanitize({campo: "vizinho"})

    def test_iptu_e_condominio_sao_independentes(self):
        resultado = model.merged({"iptuPagador": "proprietario"})
        assert resultado["iptuPagador"] == "proprietario"
        assert resultado["condominioPagador"] == "inquilino"


class TestMerged:
    def test_sem_nada_salvo_devolve_os_padroes_do_simulador(self):
        assert model.merged(None) == model.DEFAULT_PARAMS

    def test_salvo_sobrepoe_so_os_campos_que_tem(self):
        resultado = model.merged({"monthlyAmount": 20_000})
        assert resultado["monthlyAmount"] == 20_000
        assert resultado["years"] == model.DEFAULT_PARAMS["years"]

    def test_plano_salvo_antes_dos_campos_novos_ganha_os_padroes_deles(self):
        resultado = model.merged({"monthlyAmount": 20_000})
        assert resultado["prazoObraMeses"] == 36
        assert resultado["vacanciaMesesAno"] == 1

    def test_lixo_salvo_nao_derruba_a_leitura__so_ignora_o_campo_ruim(self):
        resultado = model.merged({"pctPagoChaves": 999, "monthlyAmount": 20_000})
        assert resultado["pctPagoChaves"] == model.DEFAULT_PARAMS["pctPagoChaves"]
        assert resultado["monthlyAmount"] == 20_000
