"""Currículo como material de apoio: é a base do post quando não há pesquisa na web."""
from blog import profile


class TestCurriculo:
    def test_traz_cargo_empresa_periodo_e_descricao(self):
        texto = profile.career_context()
        assert "Digio" in texto and "Gerente de Engenharia" in texto
        assert "40" in texto, "os números de carreira são o que dá especificidade ao texto"

    def test_traz_formacao_e_competencias(self):
        texto = profile.career_context()
        assert "FORMAÇÃO" in texto and "COMPETÊNCIAS" in texto

    def test_limita_o_tamanho_para_nao_estourar_o_prompt(self):
        assert len(profile.career_context()) <= profile.MAX_CHARS

    def test_experiencias_vem_das_mais_recentes_para_as_mais_antigas(self):
        texto = profile.career_context()
        assert texto.index("Digio") < texto.index("Casas Bahia Pay") < texto.index("Serasa Experian")

    def test_memoiza_para_nao_reler_o_arquivo_a_cada_post(self):
        assert profile.career_context() is profile.career_context()
