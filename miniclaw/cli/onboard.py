"""Onboarding flow for Miniclaw."""

from rich.console import Console
from rich.prompt import Confirm

from miniclaw.config.schema import AppConfig
from miniclaw.config.loader import save_config
from miniclaw.config.paths import get_config_path, get_env_path


def run_onboarding() -> AppConfig:
    """Run the initial onboarding flow to configure Miniclaw."""
    console = Console()
    console.print(
        "[bold cyan]Initializing Miniclaw with default configuration...[/bold cyan]"
    )

    config = AppConfig()
    save_config(config)

    cfg_path = get_config_path()
    env_path = get_env_path()

    if not env_path.exists():
        with open(env_path, "w", encoding="utf-8") as f:
            f.write('OLLAMA_API_KEY="" # (cloud only; optional)\n')

    console.print(f"[green]Configuration saved to {cfg_path}[/green]")
    console.print(f"[green]Environment variables created at {env_path}[/green]")
    console.print("You're all set! Try running [bold]miniclaw start[/bold] to begin.")

    return config
