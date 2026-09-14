"""Firestore e GCS de mentira — o suficiente para os testes do blog, nada mais."""
from __future__ import annotations

from typing import Any


class FakeDoc:
    def __init__(self, col: "FakeCollection", doc_id: str):
        self._col, self.id = col, doc_id

    def get(self):
        data = self._col.data.get(self.id)
        return FakeSnapshot(self.id, data)

    def set(self, data: dict[str, Any], merge: bool = False):
        if merge and self.id in self._col.data:
            self._col.data[self.id] = {**self._col.data[self.id], **data}
        else:
            self._col.data[self.id] = dict(data)

    def update(self, data: dict[str, Any]):
        if self.id not in self._col.data:
            raise KeyError(self.id)
        self._col.data[self.id].update(data)

    def delete(self):
        self._col.data.pop(self.id, None)


class FakeSnapshot:
    def __init__(self, doc_id: str, data: dict[str, Any] | None):
        self.id, self._data = doc_id, data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data else None


class FakeQuery:
    def __init__(self, col: "FakeCollection", filters=None, order=None, limit=None):
        self._col, self._filters, self._order, self._limit = col, filters or [], order, limit

    def where(self, filter=None, **kw):  # noqa: A002 — assina igual ao SDK
        return FakeQuery(self._col, [*self._filters, filter], self._order, self._limit)

    def order_by(self, field, direction=None):
        return FakeQuery(self._col, self._filters, (field, direction), self._limit)

    def limit(self, n):
        return FakeQuery(self._col, self._filters, self._order, n)

    def stream(self):
        rows = [FakeSnapshot(k, v) for k, v in self._col.data.items()]
        for f in self._filters:
            rows = [r for r in rows if _matches(r.to_dict(), f)]
        if self._order:
            field, direction = self._order
            rows.sort(key=lambda r: (r.to_dict().get(field) is None, r.to_dict().get(field)),
                      reverse=direction == "DESCENDING")
        return iter(rows[: self._limit] if self._limit else rows)


def _matches(data: dict[str, Any], f) -> bool:
    value = data.get(f.field)
    if f.op == "==":
        return value == f.value
    if f.op == "<=":
        return value is not None and value <= f.value
    raise AssertionError(f"operador {f.op} não suportado no fake")


class FakeFilter:
    def __init__(self, field_path: str, op_string: str, value: Any):
        self.field, self.op, self.value = field_path, op_string, value


class FakeCollection:
    def __init__(self):
        self.data: dict[str, dict[str, Any]] = {}

    def document(self, doc_id: str) -> FakeDoc:
        return FakeDoc(self, doc_id)

    def where(self, filter=None, **kw):  # noqa: A002
        return FakeQuery(self).where(filter)

    def order_by(self, field, direction=None):
        return FakeQuery(self).order_by(field, direction)

    def limit(self, n):
        return FakeQuery(self).limit(n)

    def stream(self):
        return FakeQuery(self).stream()


class FakeDb:
    def __init__(self):
        self.cols: dict[str, FakeCollection] = {}

    def collection(self, name: str) -> FakeCollection:
        return self.cols.setdefault(name, FakeCollection())


class FakeBlob:
    def __init__(self, bucket: "FakeBucket", name: str):
        self._bucket, self.name = bucket, name
        self.content_type = None
        self.cache_control = None

    @property
    def _entry(self):
        return self._bucket.objects.get(self.name)

    def exists(self):
        return self.name in self._bucket.objects

    def upload_from_string(self, data, content_type=None):
        self._bucket.objects[self.name] = {"data": data, "content_type": content_type,
                                           "cache_control": self.cache_control}

    def download_as_bytes(self):
        if not self.exists():
            raise FileNotFoundError(self.name)
        return self._bucket.objects[self.name]["data"]

    def patch(self):
        if self.exists():
            self._bucket.objects[self.name]["cache_control"] = self.cache_control


class FakeBucket:
    def __init__(self):
        self.objects: dict[str, dict[str, Any]] = {}

    def blob(self, name: str) -> FakeBlob:
        return FakeBlob(self, name)
