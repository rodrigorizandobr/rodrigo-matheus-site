"""Quais rotas pedem a prova do navegador e quanto corpo cada uma aceita. Puro, sem Flask."""
import pytest

from guard import policy


class TestQuemPedeAProva:
    @pytest.mark.parametrize("metodo,caminho", [
        ("GET", "/api/blog/admin/posts"),
        ("POST", "/api/blog/admin/posts"),
        ("DELETE", "/api/blog/admin/posts/abc"),
        ("POST", "/api/blog/admin/generate"),
        ("POST", "/api/blog/admin/media/upload"),
        ("POST", "/api/blog/admin/linkedin/connect"),
        ("POST", "/api/blog/admin/linkedin/app"),
        ("GET", "/api/planner/plan"),
        ("PUT", "/api/planner/plan"),
        ("GET", "/api/pension/plan"),
        ("PUT", "/api/pension/plan"),
    ])
    def test_painel_e_utilitarios_pedem(self, metodo, caminho):
        assert policy.needs_proof(caminho, metodo) is True

    @pytest.mark.parametrize("metodo,caminho", [
        ("GET", "/api/data"),
        ("GET", "/api/refresh"),
        ("GET", "/api/blog/posts"),
        ("GET", "/api/blog/posts/um-post"),
        ("GET", "/api/blog/image/abc.jpg"),
        ("GET", "/api/blog/video/abc.mp4"),
        ("GET", "/blog/um-post"),
        ("GET", "/sitemap.xml"),
        ("POST", "/api/blog/tick"),
    ])
    def test_leitura_publica_e_agendador_nao_pedem(self, metodo, caminho):
        """O leitor do blog não carrega o Firebase; o agendador e o refresh têm chave própria."""
        assert policy.needs_proof(caminho, metodo) is False

    def test_a_volta_do_linkedin_nao_pede(self):
        """É o LinkedIn que manda o navegador para lá: não há como pôr cabeçalho. Quem autoriza é o `state`."""
        assert policy.needs_proof("/api/blog/admin/linkedin/callback", "GET") is False

    def test_preflight_nao_pede(self):
        """O navegador não manda cabeçalho próprio no OPTIONS; recusar ali quebraria toda chamada direta do painel."""
        assert policy.needs_proof("/api/blog/admin/generate", "OPTIONS") is False

    def test_rota_nova_do_painel_ja_nasce_protegida(self):
        assert policy.needs_proof("/api/blog/admin/qualquer/coisa/nova", "POST") is True


class TestTamanhoDoCorpo:
    def test_plano_dos_utilitarios_e_pequeno(self):
        assert policy.max_body("/api/planner/plan") == 32 * 1024
        assert policy.max_body("/api/pension/plan") == 32 * 1024

    def test_upload_de_imagem_comporta_os_12_mb_da_rota(self):
        """A rota recusa acima de 12 MB com mensagem própria; o teto daqui só dá folga ao envelope multipart."""
        assert 12 * 1024 * 1024 < policy.max_body("/api/blog/admin/media/upload") <= 14 * 1024 * 1024

    @pytest.mark.parametrize("caminho", ["/api/blog/admin/posts", "/api/blog/admin/generate", "/api/data", "/api/blog/tick"])
    def test_o_resto_fica_em_1_mb(self, caminho):
        assert policy.max_body(caminho) == 1024 * 1024
