"""Configuration schema for Miniclaw."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class AgentConfig(BaseModel):
    """Configuration for the agent."""

    model: str = Field(default="ollama:gemma4:31b-cloud")
    system_prompt: Optional[str] = None
    max_iterations: int = Field(default=15)
    temperature: float = Field(default=0.7)


class AppConfig(BaseModel):
    """Main application configuration."""

    model_config = ConfigDict(populate_by_name=True)

    agent: AgentConfig = Field(default_factory=AgentConfig)
    workspace_dir: str = Field(default="~/.miniclaw/workspace")
    log_level: str = "INFO"
    environment: Dict[str, str] = Field(default_factory=dict)
