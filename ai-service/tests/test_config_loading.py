"""The supported root launcher must use the AI service's own private .env."""

import importlib.util
import shutil
import sys

from app.core import config


def isolated_settings(tmp_path, monkeypatch):
    service = tmp_path / "ai-service"
    source = service / "app" / "core" / "config.py"
    source.parent.mkdir(parents=True)
    shutil.copyfile(config.__file__, source)
    (service / ".env").write_text(
        "AI_SERVICE_API_KEY=test-service-directory-key\nAI_SERVICE_ENV=test\n",
        encoding="utf-8",
    )
    (tmp_path / ".env").write_text(
        "AI_SERVICE_API_KEY=wrong-working-directory-key\n", encoding="utf-8"
    )
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    monkeypatch.chdir(tmp_path)
    spec = importlib.util.spec_from_file_location("isolated_ai_config", source)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    return module.Settings, service


def test_service_env_is_loaded_from_repository_root(tmp_path, monkeypatch):
    settings_type, service = isolated_settings(tmp_path, monkeypatch)
    assert settings_type.model_config["env_file"] == service / ".env"
    assert settings_type().api_key.get_secret_value() == "test-service-directory-key"
    monkeypatch.chdir(service)
    assert settings_type().api_key.get_secret_value() == "test-service-directory-key"


def test_process_environment_still_overrides_service_env(tmp_path, monkeypatch):
    settings_type, _ = isolated_settings(tmp_path, monkeypatch)
    monkeypatch.setenv("AI_SERVICE_API_KEY", "test-process-environment-key")
    assert settings_type().api_key.get_secret_value() == "test-process-environment-key"


def test_explicitly_disabled_env_file_does_not_load_a_credential(tmp_path, monkeypatch):
    settings_type, _ = isolated_settings(tmp_path, monkeypatch)
    assert settings_type(_env_file=None).api_key is None


def test_root_loaded_credential_protects_matching(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.matching.embeddings import EmbeddingProvider, EMBEDDING_DIMENSION

    class FixtureEmbeddings(EmbeddingProvider):
        def encode(self, texts):
            return tuple((1.0,) + (0.0,) * (EMBEDDING_DIMENSION - 1) for _ in texts)

    settings_type, _ = isolated_settings(tmp_path, monkeypatch)
    app = create_app(settings_type(AI_LOST_FOUND_MATCHER="baseline"), FixtureEmbeddings())
    payload = {"query": {"id": "lost", "type": "LOST"}, "candidates": [], "top_k": 1}
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 200
        for credential in (None, "wrong-internal-test-key", "test-service-directory-key"):
            headers = {} if credential is None else {"X-CampusConnect-AI-Key": credential}
            response = client.post("/api/v1/lost-found/match", json=payload, headers=headers)
            assert response.status_code == (200 if credential == "test-service-directory-key" else 401)
            if response.status_code == 200:
                assert response.json()["matches"] == []
