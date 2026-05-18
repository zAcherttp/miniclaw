"""CLI commands for Miniclaw."""

import asyncio
import typer
from rich.console import Console
from rich.prompt import Confirm
from dotenv import load_dotenv
from loguru import logger

from langsmith import traceable

from miniclaw.config.paths import get_config_path, get_env_path
from miniclaw.config.loader import load_config
from miniclaw.cli.onboard import run_onboarding

EXIT_COMMANDS = {"exit", "quit", "/exit", "/quit", ":q"}

app = typer.Typer(help="Miniclaw - Personal AI Assistant", no_args_is_help=True)
console = Console()


async def async_start(config):
    from miniclaw.bus import MessageBus
    from miniclaw.agent import AgentLoop

    bus = MessageBus()
    agent_loop = AgentLoop(config, bus)
    await agent_loop.start()

    logger.info("Miniclaw is running.")

    try:
        # Keep the event loop running
        await asyncio.Event().wait()
    finally:
        logger.warning("Miniclaw shutting down...")
        await agent_loop.stop()


@app.command()
def init():
    """Initialize Miniclaw configuration."""
    cfg_path = get_config_path()
    if cfg_path.exists():
        if not Confirm.ask(
            f"[yellow]Configuration already exists at {cfg_path}. Overwrite?[/yellow]",
            default=False,
        ):
            return
    run_onboarding()


@app.command()
def start():
    """Start the Miniclaw assistant."""
    cfg_path = get_config_path()
    if not cfg_path.exists():
        console.print("[yellow]Config not found. Initializing defaults...[/yellow]")
        config = run_onboarding()
    else:
        config = load_config(cfg_path)

    env_path = get_env_path()
    if env_path.exists():
        load_dotenv(env_path)

    console.print(
        f"[green]Starting Miniclaw with model {config.agent.model}...[/green]"
    )

    try:
        asyncio.run(async_start(config))
    except KeyboardInterrupt:
        # Failsafe if it bubbling up past async_start
        pass


@app.command()
def config():
    """Show the current configuration."""
    config_obj = load_config()
    console.print_json(config_obj.model_dump_json())


if __name__ == "__main__":
    app()
