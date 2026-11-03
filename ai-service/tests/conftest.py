"""Keep unit tests independent of private development/provider configuration."""

import pytest

from app.core.config import Settings


@pytest.fixture(autouse=True)
def isolate_private_env_file(monkeypatch):
    # Tests pass their own settings. Never enable a provider through a developer's .env.
    # Configuration-loading tests construct a separate module and temporary .env files.
    monkeypatch.setitem(Settings.model_config, "env_file", None)
