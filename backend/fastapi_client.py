import asyncio
import json
from typing import Optional, List, Dict, Any, AsyncGenerator
from dataclasses import dataclass
import httpx


@dataclass
class ChatMessage:
    role: str
    content: str


class FastAPIClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        """Initialize the FastAPI client for MCP chat service"""
        self.base_url = base_url.rstrip("/")
        self.http_client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        """Async context manager entry"""
        self.http_client = httpx.AsyncClient(timeout=30.0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.http_client:
            await self.http_client.aclose()

    async def health_check(self) -> Dict[str, Any]:
        """Check if the server is healthy"""
        if not self.http_client:
            raise RuntimeError("Client not initialized. Use as async context manager.")

        response = await self.http_client.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()

    async def chat_stream_with_history(
        self,
        user_id: str,
        messages: List[ChatMessage],
        model: str = "gemini/gemini-2.5-flash",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream chat response using provided message history"""
        if not self.http_client:
            raise RuntimeError("Client not initialized. Use as async context manager.")

        request_data = {
            "user_id": user_id,
            "messages": [
                {"role": msg.role, "content": msg.content} for msg in messages
            ],
            "model": model,
        }

        async with self.http_client.stream(
            "POST",
            f"{self.base_url}/research",
            json=request_data,
            headers={"Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()

            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])  # Remove "data: " prefix

                        # Handle different event types
                        if "v" in data:
                            # Text chunk
                            yield {"type": "text", "content": data["v"]}
                        elif "tc" in data:
                            # Tool call
                            yield {"type": "tool_call", "payload": data["tc"]}
                        elif "tr" in data:
                            # Tool result
                            yield {"type": "tool_result", "payload": data["tr"]}
                        elif data.get("type") == "error":
                            # Error message
                            yield {"type": "error", "content": data.get("content", "")}
                        elif data.get("type") == "full_response":
                            # Full response
                            yield {
                                "type": "full_response",
                                "payload": data.get("full_response", []),
                            }
                        else:
                            # Legacy format support
                            yield data
                    except json.JSONDecodeError:
                        continue


class ChatSession:
    """Higher-level chat session management"""

    def __init__(
        self,
        client: FastAPIClient,
        user_id: str,
        model: str = "gemini/gemini-2.5-flash",
    ):
        self.client = client
        self.user_id = user_id
        self.model = model
        self.messages: List[ChatMessage] = []

    async def send_message(self, message: str) -> AsyncGenerator[str, None]:
        """Send a message and stream the response"""
        # Add user message to local history
        self.messages.append(ChatMessage(role="user", content=message))

        assistant_content = ""
        tool_calls_made = []
        tool_results = []

        async for chunk_data in self.client.chat_stream_with_history(
            self.user_id, self.messages, self.model
        ):
            if chunk_data.get("type") == "text":
                content = chunk_data.get("content", "")
                assistant_content += content
                yield content
            elif chunk_data.get("type") == "tool_call":
                tool_call = chunk_data.get("payload", {})
                tool_calls_made.append(tool_call)
                yield f"\n🔧 Calling tool: {tool_call.get('function', {}).get('name', 'unknown')}\n"
            elif chunk_data.get("type") == "tool_result":
                tool_result = chunk_data.get("payload", {})
                tool_results.append(tool_result)
                if tool_result.get("error"):
                    yield f"❌ Tool error: {tool_result.get('content', 'Unknown error')}\n"
                else:
                    yield f"✅ Tool completed\n"
            elif chunk_data.get("type") == "error":
                yield f"\n❌ {chunk_data.get('content', 'Unknown error')}"
            elif chunk_data.get("type") == "full_response":
                # Server has completed processing
                pass

        # Add assistant response to local history
        if assistant_content.strip():
            self.messages.append(
                ChatMessage(role="assistant", content=assistant_content)
            )

    async def get_history(self) -> List[ChatMessage]:
        """Get conversation history"""
        return self.messages.copy()

    async def clear_history(self):
        """Clear conversation history (local only since server doesn't store history)"""
        self.messages.clear()


async def demo_client():
    """Demo function showing how to use the FastAPI client"""
    base_url = "http://localhost:8000"

    async with FastAPIClient(base_url) as client:
        print("🤖 MCP FastAPI Client Demo")
        print("Commands:")
        print("- Type a message to chat")
        print("- Type 'switch_user <user_id>' to switch users")
        print("- Type 'clear_history' to clear current user's history")
        print("- Type 'quit' to exit")

        # Check server health
        try:
            health = await client.health_check()
            print(f"✅ Server status: {health}")
        except Exception as e:
            print(f"❌ Server not available: {e}")
            return

        current_user_id = "demo_user"
        session = ChatSession(client, current_user_id)

        print(f"✅ Using user: {current_user_id}")

        while True:
            user_input = input(f"\n[{current_user_id}] You: ").strip()

            if user_input.lower() == "quit":
                break
            elif user_input.startswith("switch_user "):
                new_user_id = user_input.split(" ", 1)[1].strip()
                if new_user_id:
                    current_user_id = new_user_id
                    session = ChatSession(client, current_user_id)
                    print(f"Switched to user: {current_user_id}")
                continue
            elif user_input.lower() == "clear_history":
                await session.clear_history()
                print("Conversation history cleared.")
                continue
            elif not user_input:
                continue

            print("Assistant: ", end="", flush=True)

            try:
                async for chunk in session.send_message(user_input):
                    print(chunk, end="", flush=True)
                print()  # New line after response

            except Exception as e:
                print(f"\n❌ Error: {e}")

        # Cleanup
        print(f"👋 Goodbye!")


if __name__ == "__main__":
    asyncio.run(demo_client())
