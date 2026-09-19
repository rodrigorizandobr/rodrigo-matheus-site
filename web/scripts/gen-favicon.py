"""Gera o favicon do site: a marca `//` vermelha sobre a tinta do cabeçalho.

O ícone anterior era o emoji de alienígena, herdado de uma versão antiga e sem
relação com nada no site. A marca `//` abre TODO título de seção (`SectionHead`),
então é o sinal que a pessoa já associa ao site — e sobrevive a 16 px, que é o
tamanho em que um favicon realmente é visto.

Fundo escuro de propósito: a barra de abas costuma ser clara, e desenho claro
some nela. As barras são desenhadas em polígono (não em texto) para o traço não
depender de fonte instalada.

    python3 scripts/gen-favicon.py
"""
from PIL import Image, ImageDraw

TINTA = (20, 20, 26)        # --heading
VERMELHO = (216, 31, 31)    # --red
SUPER = 8                   # desenha grande e reduz: bordas suaves sem depender de AA


def barra(d: ImageDraw.ImageDraw, lado: int, centro_x: float, largura: float, inclinacao: float) -> None:
    """Uma barra da `//`: paralelogramo inclinado, sangrando em cima e embaixo."""
    topo, base = lado * 0.16, lado * 0.84
    desloca = lado * inclinacao
    d.polygon([
        (centro_x + desloca, topo),
        (centro_x + desloca + largura, topo),
        (centro_x - desloca + largura, base),
        (centro_x - desloca, base),
    ], fill=VERMELHO)


def icone(lado: int) -> Image.Image:
    g = lado * SUPER
    img = Image.new("RGB", (g, g), TINTA)
    d = ImageDraw.Draw(img)
    largura = g * 0.155
    # duas barras, espaçadas, centradas no conjunto
    barra(d, g, g * 0.30, largura, 0.085)
    barra(d, g, g * 0.545, largura, 0.085)
    return img.resize((lado, lado), Image.LANCZOS)


ARQUIVOS = {
    "public/favicon-16x16.png": 16,
    "public/favicon-32x32.png": 32,
    "public/apple-touch-icon.png": 180,
    "public/android-chrome-192x192.png": 192,
    "public/android-chrome-512x512.png": 512,
}

for caminho, lado in ARQUIVOS.items():
    icone(lado).save(caminho, "PNG", optimize=True)
    print(f"{caminho}  {lado}x{lado}")

# .ico com os tamanhos que o Windows e as abas antigas pedem
icone(256).save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("public/favicon.ico  16/32/48/64")
