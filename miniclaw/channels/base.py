from abc import ABC, abstractmethod
from miniclaw.bus import MessageBus


class Channel(ABC):
    def __init__(self, bus: MessageBus):
        self.bus = bus
        self.running = False

    @abstractmethod
    async def start(self) -> None:
        pass

    @abstractmethod
    async def stop(self) -> None:
        pass

    @abstractmethod
    async def send_message(
        self, chat_id: str, content: str, reply_to: str | None = None
    ) -> None:
        pass
