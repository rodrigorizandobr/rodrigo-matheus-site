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
        patch = {"prazoObraMeses": 36, "vacanciaMesesAno": 1.5, "itbiPct": 3, "descontoAVista": 0, "impostoVendaPct": 6.73}
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


class TestCamposNovos:
    def test_enums_novos_aceitam_so_o_conjunto_fechado(self):
        casos = {
            "aposTransicao": ("reinveste", "vive_da_renda"),
            "sobraDoCaixa": ("adianta_obra", "automatico"),
            "impostoModo": ("fixo", "reforma"),
            "cronograma": ("simples", "contrato"),
            "correcaoObraModo": ("incc", "propria"),
            "parcelamento": ("manual", "automatico"),
        }
        for campo, validos in casos.items():
            for v in validos:
                assert model.sanitize({campo: v}) == {campo: v}
            with pytest.raises(ValueError, match=campo):
                model.sanitize({campo: "outro"})

    @pytest.mark.parametrize("campo,dentro,fora", [
        ("ipca", 4.5, 31), ("metaRendaHoje", 15_000, -1), ("prazoApeMeses", 300, 481), ("mesesEntrega1o", 36, 121),
        ("mesesAteAlugar", 2, 13), ("rendimentoCaixaAno", 8, 31), ("correcaoObraAno", 6.66, 31), ("correcaoPosChavesAno", 4.5, 31), ("parcelaMensal1o", 3_000, -1), ("parcelaAnual1o", 40_000, -5), ("entradaPct", 10, 101),
        ("reforcoCadaMeses", 12, 0), ("posChavesMeses", 36, 0), ("reservaMeses", 3, 25), ("pctTemporada", 50, 101),
        ("ocupacaoPct", 42, 101), ("taxaPlataformaPct", 16, 51), ("consorcioCotas", 2, 21), ("consorcioPrazoMeses", 200, 11),
        ("consorcioLancePct", 25, 101), ("agioProntoPct", 20, 101), ("pctVendaNasChaves", 50, 101),
    ])
    def test_faixa_dos_campos_novos(self, campo, dentro, fora):
        assert model.sanitize({campo: dentro}) == {campo: dentro}
        with pytest.raises(ValueError, match=campo):
            model.sanitize({campo: fora})

    def test_padroes_novos_estao_em_merged(self):
        r = model.merged(None)
        assert r["cronograma"] == "contrato" and r["aposTransicao"] == "vive_da_renda" and r["reservaMeses"] == 3
        assert r["correcaoObraAno"] == 6.66 and r["jurosFinHolding"] == 0

    def test_plano_salvo_antes_ganha_os_padroes_dos_campos_novos(self):
        r = model.merged({"monthlyAmount": 20_000, "rate": 0.8})
        assert r["rate"] == 0.8  # o que a pessoa gravou não muda
        assert r["entradaPct"] == 10 and r["custoMontagem"] == 12_000


class TestContrato:
    def test_soma_ate_100_passa(self):
        model.check_contract({**model.DEFAULT_PARAMS, "entradaPct": 25, "mensaisPct": 25, "reforcoPct": 25, "chavesPct": 25})

    def test_soma_acima_de_100_levanta(self):
        with pytest.raises(ValueError, match="somar no máximo 100"):
            model.check_contract({**model.DEFAULT_PARAMS, "entradaPct": 50, "mensaisPct": 50, "reforcoPct": 10, "chavesPct": 0})

    def test_leitura_com_contrato_estourado_volta_ao_padrao_so_nas_quatro_fatias(self):
        r = model.merged({"entradaPct": 90, "mensaisPct": 80, "monthlyAmount": 20_000})
        for k in model.CONTRATO_ATE_AS_CHAVES:
            assert r[k] == model.DEFAULT_PARAMS[k]
        assert r["monthlyAmount"] == 20_000


class TestParidadeComOFront:
    """Os padrões vivem em dois lugares (types.ts e aqui). Se divergirem, o servidor devolve um número e a tela mostra outro."""

    def test_default_params_iguais_aos_do_typescript(self):
        import pathlib
        import re
        ts = pathlib.Path(__file__).resolve().parents[2] / "web" / "src" / "planner" / "types.ts"
        if not ts.exists():
            pytest.skip("types.ts não está no checkout")
        src = ts.read_text(encoding="utf-8")
        corpo = src[src.index("export const DEFAULT_PARAMS"):]
        corpo = corpo[:corpo.index("\n}\n")]
        achados = {}
        for chave, valor in re.findall(r"^\s{2}(\w+):\s*([^,\n]+),", corpo, flags=re.M):
            valor = valor.strip()
            if valor.startswith("'"):
                achados[chave] = valor.strip("'")
            else:
                achados[chave] = float(valor.replace("_", ""))
        assert set(achados) == set(model.DEFAULT_PARAMS), set(achados) ^ set(model.DEFAULT_PARAMS)
        for chave, valor in achados.items():
            assert model.DEFAULT_PARAMS[chave] == valor, chave
