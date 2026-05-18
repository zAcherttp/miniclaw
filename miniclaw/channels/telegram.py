import asyncio
from typing import Optional
from loguru import logger
from .base import Channel


class TelegramChannel(Channel):
    def __init__(self, bus, token: str):
        super().__init__(bus)
        self.token = token

    async def start(self) -> None:
        if not self.token:
            logger.warning("Telegram token missing, channel skipping.")
            return
        self.running = True
        logger.info("Telegram channel started.")
        # TODO: Implement python-telegram-bot or aiohttp poller

    async def stop(self) -> None:
        self.running = False
        logger.info("Telegram channel stopped.")

    async def send_message(
        self, chat_id: str, content: str, reply_to: str | None = None
    ) -> None:
        logger.info(f"Telegram -> {chat_id}: {content}")
