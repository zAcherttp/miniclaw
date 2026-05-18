"""Configuration loader for Miniclaw."""

import json
from pathlib import Path
from loguru import logger
from .schema import AppConfig
from .paths import get_config_path


def load_config(path: Path | None = None) -> AppConfig:
    cfg_path = path or get_config_path()
    if not cfg_path.exists():
        return AppConfig()
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return AppConfig.model_validate(data)
    except Exception as e:
        logger.warning(f"Failed to load config: {e}")
        return AppConfig()


def save_config(config: AppConfig, path: Path | None = None) -> None:
    cfg_path = path or get_config_path()
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    data = config.model_dump(mode="json", exclude_none=True)
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
