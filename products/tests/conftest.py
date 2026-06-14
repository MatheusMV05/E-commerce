import os
os.environ["JWT_SECRET"] = "test-secret-32-characters-minimum-ok!!"
os.environ["IS_REPLICA"] = "false"
os.environ["REPLICA_URL"] = "http://localhost:9999"

import asyncio
import pytest


@pytest.fixture(autouse=True)
def clean_data(tmp_path, monkeypatch):
    data_file = tmp_path / "products.json"
    data_file.write_text("[]")
    import main
    monkeypatch.setattr(main, "DATA_FILE", data_file)
    monkeypatch.setattr(main, "_lock", asyncio.Lock())
    yield
