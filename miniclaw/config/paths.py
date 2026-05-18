"""Path utilities for Miniclaw."""
from pathlib import Path

def get_app_dir() -> Path:
    path = Path.home() / ".miniclaw"
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_config_path() -> Path:
    return get_app_dir() / "config.json"

def get_env_path() -> Path:
    return get_app_dir() / ".env"

def get_workspace_dir(workspace_path: str = None) -> Path:
    path = Path(workspace_path).expanduser() if workspace_path else get_app_dir() / "workspace"
    path.mkdir(parents=True, exist_ok=True)
    return path
