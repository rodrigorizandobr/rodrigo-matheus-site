"""Bucket compartilhado com o cache do GitHub — um cliente só por processo."""
from __future__ import annotations

import os

from google.cloud import storage

BUCKET_NAME = os.environ.get("GCS_BUCKET", "rodrigo-matheus-cache")
_bucket = None


def get_bucket():
    global _bucket
    if _bucket is None:
        _bucket = storage.Client().bucket(BUCKET_NAME)
    return _bucket
