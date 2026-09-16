"""Uso único: tira a assinatura de IA das capas já publicadas e grava as dimensões.

Duas coisas, na mesma passada:

1. **Crédito.** Capa gerada é ilustração editorial do site, não citação de terceiro.
   O crédito existe para dar a quem é devido — banco de imagens tem, a ilustração da
   casa não. Só limpa o que veio da IA; crédito de banco de imagens fica intacto.
2. **Dimensões.** `og:image:width/height` faz o LinkedIn e o WhatsApp desenharem o
   cartão grande sem precisar baixar a imagem antes. Posts antigos não têm esse dado;
   vem da biblioteca ou, se a capa for anterior a ela, do próprio JPEG no Storage.

    python migrate_covers.py --dry     # mostra o que faria
    python migrate_covers.py           # aplica
"""
import io
import sys

from google.cloud import firestore
from PIL import Image

from blog import media

DRY = "--dry" in sys.argv


def dimensoes_do_arquivo(digest: str) -> tuple[int, int] | None:
    blob = media._bucket().blob(f"{media.PREFIX}/{digest}.jpg")
    if not blob.exists():
        return None
    return Image.open(io.BytesIO(blob.download_as_bytes())).size


def main() -> None:
    db = firestore.Client(project="rodrigo-matheus")
    biblioteca = {d.id: d.to_dict() for d in db.collection("blog_media").stream()}

    for doc in db.collection("blog_media").stream():
        item = doc.to_dict()
        if item.get("provider") == "gemini" and item.get("credit"):
            print(f"biblioteca {doc.id[:10]}: crédito {item['credit']!r} → ''")
            if not DRY:
                doc.reference.update({"credit": ""})

    for doc in db.collection("blog_posts").stream():
        post = doc.to_dict()
        imagem = post.get("image") or {}
        if not imagem:
            continue

        patch = {}
        if imagem.get("provider") == "gemini" and imagem.get("credit"):
            patch["image.credit"] = ""

        if not imagem.get("width"):
            digest = imagem.get("hash", "")
            da_biblioteca = biblioteca.get(digest) or {}
            tamanho = ((da_biblioteca.get("width"), da_biblioteca.get("height"))
                       if da_biblioteca.get("width") else dimensoes_do_arquivo(digest))
            if tamanho and tamanho[0]:
                patch["image.width"], patch["image.height"] = int(tamanho[0]), int(tamanho[1])

        if not patch:
            continue
        print(f"post {post.get('slug', doc.id)[:44]}: {patch}")
        if not DRY:
            doc.reference.update(patch)

    print("\nsimulação — nada foi gravado" if DRY else "\npronto")


if __name__ == "__main__":
    main()
