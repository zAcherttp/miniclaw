import asyncio
from loguru import logger
from miniclaw.bus import MessageBus, OutboundMessage
from miniclaw.config.schema import AppConfig
# from deepagents import Agent # Backend


class AgentLoop:
    def __init__(self, config: AppConfig, bus: MessageBus):
        self.config = config
        self.bus = bus
        self.running = False
        # TODO: Initialize deepagents agent here
        # self.agent = Agent(model=config.agent.model)

    async def start(self) -> None:
        self.running = True
        logger.info(f"Agent loop started with model {self.config.agent.model}.")

        asyncio.create_task(self._process_inbound())
        asyncio.create_task(self._process_outbound())

    async def stop(self) -> None:
        self.running = False
        logger.info("Agent loop stopped.")

    async def _process_inbound(self) -> None:
        while self.running:
            try:
                msg = await self.bus.consume_inbound()
                logger.info(
                    f"Agent received from {msg.channel} ({msg.chat_id}): {msg.content}"
                )

                # TODO: Trigger deepagents execution
                # response = await self.agent.run(msg.content)
                response = f"Echo: {msg.content}"

                # Push back
                out = OutboundMessage(
                    channel=msg.channel,
                    chat_id=msg.chat_id,
                    content=response,
                    reply_to=msg.metadata.get("message_id"),
                )
                await self.bus.publish_outbound(out)
            except Exception as e:
                logger.error(f"Error processing inbound message: {e}")

    async def _process_outbound(self) -> None:
        while self.running:
            try:
                msg = await self.bus.consume_outbound()
                # Assuming single-point mock proxying for now
                # (Channel Manager will handle outbound correctly)
                logger.info(
                    f"Agent sending to {msg.channel} ({msg.chat_id}): {msg.content}"
                )
            except Exception as e:
                logger.error(f"Error processing outbound message: {e}")
