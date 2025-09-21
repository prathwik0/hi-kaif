import json
from typing import Optional, List, Dict, Any, AsyncGenerator, Tuple, Union
from contextlib import asynccontextmanager
from io import BytesIO
from types import SimpleNamespace

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    File,
    Form,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from litellm import acompletion

from models import transcribe_audio


load_dotenv()


def ensure_serializable(obj: Any) -> Any:
    """Ensure an object is JSON serializable by converting to basic Python types."""
    if hasattr(obj, "model_dump"):
        # Handle pydantic models or objects with model_dump
        return ensure_serializable(obj.model_dump())
    elif isinstance(obj, dict):
        # Recursively process dictionary values
        return {k: ensure_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        # Recursively process list items
        return [ensure_serializable(item) for item in obj]
    elif hasattr(obj, "__dict__") and not isinstance(
        obj, (str, int, float, bool, type(None))
    ):
        # Handle custom objects with __dict__
        return ensure_serializable(obj.__dict__)
    else:
        # Basic types should already be serializable
        return obj


class LiteLLMClient:
    """LiteLLM client."""

    def __init__(self):
        """Initialize LiteLLM client."""
        self.local_tools = [
            {
                "name": "dummy_tool",
                "description": "A simple dummy tool that returns a sample response for demonstration purposes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "A message to process with the dummy tool",
                        }
                    },
                    "required": ["message"],
                },
            }
        ]

    def _convert_tools_to_openai_format(self) -> List[Dict[str, Any]]:
        """Convert local tools to OpenAI function calling format"""
        openai_tools = []

        # Add local tools
        for tool in self.local_tools:
            openai_tool = {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                },
            }

            # Add parameters if they exist
            if "parameters" in tool:
                openai_tool["function"]["parameters"] = tool["parameters"]

            openai_tools.append(openai_tool)

        return openai_tools

    async def _call_local_tool(
        self, tool_name: str, arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle local tool calls"""
        if tool_name == "dummy_tool":
            message = arguments.get("message", "No message provided")
            return {
                "dummy_tool": True,
                "message": message,
                "response": f"Processed dummy message: {message}",
                "timestamp": "2025-01-01T00:00:00Z",
                "success": True,
            }
        else:
            raise ValueError(f"Unknown local tool: {tool_name}")

    async def chat_stream(
        self,
        chat_history: List[Dict[str, Any]],
        model: str = "gemini/gemini-2.5-pro",
    ) -> AsyncGenerator[Tuple[str, Union[str, List[Dict[str, Any]]]], None]:
        """Stream chat response with local tool integration"""

        # Get local tools and convert to OpenAI format
        openai_tools = self._convert_tools_to_openai_format()

        chat_messages = chat_history.copy()

        # Add system prompt if this is the first interaction or no system message exists
        has_system_message = any(msg.get("role") == "system" for msg in chat_messages)
        if not has_system_message:
            system_prompt = {
                "role": "system",
                "content": """You are a helpful assistant.""",
            }
            chat_messages.insert(0, system_prompt)
        new_messages = []

        while True:
            try:
                # Initial streaming request
                stream = await acompletion(
                    model=model,
                    messages=chat_messages,
                    tools=openai_tools,
                    tool_choice="auto",
                    stream=True,
                    temperature=0.6,
                )

                full_response_text = ""
                tool_calls_data = []
                current_tool_calls = []

                async for chunk in stream:  # type: ignore
                    # Handle text content
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response_text += content
                        yield "chunk", f"data: {json.dumps({'v': content})}\n\n"

                    # Handle tool calls
                    if chunk.choices[0].delta.tool_calls:
                        for tool_call_delta in chunk.choices[0].delta.tool_calls:
                            # Initialize tool call if it's the first chunk
                            while len(tool_calls_data) <= tool_call_delta.index:
                                tool_calls_data.append(
                                    {
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""},
                                    }
                                )

                            # Update tool call data
                            index = tool_call_delta.index
                            if tool_call_delta.id:
                                tool_calls_data[index]["id"] = tool_call_delta.id
                            if tool_call_delta.type:
                                tool_calls_data[index]["type"] = tool_call_delta.type
                            if tool_call_delta.function:
                                if tool_call_delta.function.name:
                                    tool_calls_data[index]["function"][
                                        "name"
                                    ] = tool_call_delta.function.name
                                if tool_call_delta.function.arguments:
                                    tool_calls_data[index]["function"][
                                        "arguments"
                                    ] += tool_call_delta.function.arguments

                # Create the assistant message with text content and/or tool calls
                assistant_message: Dict[str, Any] = {
                    "role": "assistant",
                    "content": full_response_text,
                }

                # Add tool calls if present
                if tool_calls_data:
                    assistant_message["tool_calls"] = tool_calls_data
                    current_tool_calls = tool_calls_data
                    # Yield tool call information as it's confirmed
                    for tc_data in tool_calls_data:
                        yield (
                            "tool_call",
                            f"data: {json.dumps({'tc': ensure_serializable(tc_data)})}\n\n",
                        )

                # Add to message history
                new_messages.append(assistant_message)
                chat_messages.append(assistant_message)

                # If no tool calls, we're done
                if not current_tool_calls:
                    yield "full_response", ensure_serializable(new_messages)
                    break

                # Execute tool calls
                # Convert tool calls to proper format and add to message

                formatted_tool_calls = []
                for tc in tool_calls_data:
                    formatted_tc = SimpleNamespace()
                    formatted_tc.id = tc["id"]
                    formatted_tc.function = SimpleNamespace()
                    formatted_tc.function.name = tc["function"]["name"]
                    formatted_tc.function.arguments = tc["function"]["arguments"]
                    formatted_tool_calls.append(formatted_tc)

                # Execute each tool call
                for tool_call in formatted_tool_calls:
                    tool_name = tool_call.function.name
                    tool_call_id = tool_call.id

                    try:
                        # Parse arguments from JSON string
                        args_json = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        error_msg = f"\n[Error parsing tool arguments]: Invalid JSON: {tool_call.function.arguments}\n"
                        yield "error", error_msg
                        args_json = {}

                    try:
                        # Check if it's a local tool
                        local_tool_names = [tool["name"] for tool in self.local_tools]
                        if tool_name in local_tool_names:
                            # Call local tool
                            result = await self._call_local_tool(tool_name, args_json)
                            tool_result_content = json.dumps(
                                ensure_serializable(result)
                            )
                        else:
                            raise ValueError(f"Unknown tool: {tool_name}")

                        # Yield tool result
                        yield (
                            "tool_result",
                            f"data: {json.dumps({'tr': {'tool_call_id': tool_call_id, 'content': tool_result_content}})}\n\n",
                        )

                        # Create a tool result message
                        # Ensure content is always a string for the message history
                        if isinstance(tool_result_content, str):
                            content_str = tool_result_content
                        elif isinstance(tool_result_content, (dict, list)):
                            content_str = json.dumps(tool_result_content)
                        else:
                            content_str = str(tool_result_content)

                        tool_message = {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": content_str,
                        }

                        # Add to message history
                        new_messages.append(tool_message)
                        chat_messages.append(tool_message)

                    except Exception as e:
                        error_msg = f"\n[Error calling tool {tool_name}]: {type(e).__name__}: {e}\n"
                        print(error_msg, flush=True)
                        yield "error", error_msg

                        # Add error message as tool response
                        error_tool_message = {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": f"Error executing tool '{tool_name}': {str(e)}",
                        }
                        new_messages.append(error_tool_message)
                        chat_messages.append(error_tool_message)
                        # Yield error as a tool result for the stream
                        yield (
                            "tool_result",
                            f"data: {json.dumps({'tr': {'tool_call_id': tool_call_id, 'content': error_tool_message['content'], 'error': True}})}\n\n",
                        )

                # Continue the loop to get the next assistant response

            except Exception as e:
                error_msg = f"\n[Error during API call]: {type(e).__name__}: {e}\n"
                print(error_msg, flush=True)
                yield "error", error_msg
                return

        # Return all new messages added during this interaction
        yield "full_response", ensure_serializable(new_messages)

    async def cleanup(self):
        """Clean up resources"""
        pass  # No cleanup needed for simplified client


# Pydantic models for API
class ChatMessage(BaseModel):
    role: str
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class ChatHistoryRequest(BaseModel):
    messages: List[Dict[str, Any]]
    model: Optional[str] = "gemini/gemini-2.5-flash"


litellm_client: Optional[LiteLLMClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    global litellm_client

    # Startup
    litellm_client = LiteLLMClient()

    print("LiteLLM FastAPI server started")

    yield

    # Shutdown
    if litellm_client:
        await litellm_client.cleanup()


# FastAPI app
app = FastAPI(title="Researcher API", version="1.0.0", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "litellm-chat"}


@app.post("/chat")
async def chat_stream_with_history(request: ChatHistoryRequest):
    """Stream chat response using provided message history"""
    if not litellm_client:
        raise HTTPException(status_code=500, detail="LiteLLM client not initialized")

    chat_history = request.messages

    async def generate_response() -> AsyncGenerator[str, None]:
        try:
            assert isinstance(litellm_client, LiteLLMClient), "Client not initialized"
            # Use default model if none provided
            model = request.model or "gemini/gemini-2.5-flash"
            async for event_type, event_data in litellm_client.chat_stream(
                chat_history=chat_history, model=model
            ):
                # event_type chunk, tool_call, tool_result is already formatted as SSE data
                if event_type == "chunk":
                    yield str(event_data)
                elif event_type == "tool_call":
                    yield str(event_data)
                elif event_type == "tool_result":
                    yield str(event_data)
                elif event_type == "error":
                    # Send error as SSE
                    yield f"data: {json.dumps({'content': event_data, 'type': 'error'})}\n\n"
                elif event_type == "full_response":
                    # Send full response and completion signal
                    yield f"data: {json.dumps({'full_response': event_data, 'type': 'full_response'})}\n\n"

        except Exception as e:
            error_msg = f"Error in chat stream: {str(e)}"
            yield f"data: {json.dumps({'content': error_msg, 'type': 'error'})}\n\n"

    return StreamingResponse(
        generate_response(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


@app.post("/transcribe")
async def transcribe_audio_endpoint(
    audio: UploadFile = File(..., description="audio file (e.g., webm, mp3)"),
    language: str = Form("en", description="lang code (e.g., 'en', 'es', 'fr')"),
    model: str = "whisper-large-v3",
):
    try:
        if audio.content_type not in ["audio/wav", "audio/mpeg", "audio/webm"]:
            raise HTTPException(
                status_code=400, detail="Unsupported audio file content type"
            )

        file_content = await audio.read()
        file_stream = BytesIO(file_content)

        text = await transcribe_audio(file_stream, model, language)
        return {"text": text}

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
