import json
from typing import Optional, List, Dict, Any, AsyncGenerator, Tuple, Union
from contextlib import asynccontextmanager
from io import BytesIO
import asyncio

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

from models import transcribe_audio
from researcher import LiteLLMClient
from database import db

load_dotenv()


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


@app.get("/research")
async def get_research():
    """Get the 50 latest research items"""
    return {"research": db.list_research()}


@app.get("/research/{research_id}")
async def get_research_by_id(research_id: int):
    """Get full research details by ID"""
    research = db.get_full_research(research_id)
    if research is None:
        raise HTTPException(status_code=404, detail="Research not found")
    return {"research": research}


@app.post("/research")
async def chat_stream_with_history(request: ChatHistoryRequest):
    """Stream chat response using provided message history"""
    if not litellm_client:
        raise HTTPException(status_code=500, detail="LiteLLM client not initialized")

    chat_history = request.messages

    # Use a queue and a background task to decouple long-running work from the client connection
    queue: asyncio.Queue = asyncio.Queue()
    client_connected = True

    async def run_chat() -> None:
        nonlocal client_connected
        try:
            assert isinstance(litellm_client, LiteLLMClient), "Client not initialized"
            model = request.model or "gemini/gemini-2.5-flash"
            async for event_type, event_data in litellm_client.chat_stream(
                chat_history=chat_history, model=model
            ):
                if not client_connected:
                    # Stop pushing to the queue if the client is gone, but keep processing
                    continue
                # Forward pre-formatted SSE strings
                await queue.put(str(event_data))
        except Exception as e:
            if client_connected:
                error_msg = f"Error in chat stream: {str(e)}"
                await queue.put(
                    f"data: {json.dumps({'content': error_msg, 'type': 'error'})}\n\n"
                )
        finally:
            if client_connected:
                await queue.put(None)

    async def generate_response() -> AsyncGenerator[str, None]:
        nonlocal client_connected
        chat_task = asyncio.create_task(run_chat())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        except asyncio.CancelledError:
            # Client disconnected; continue background processing without streaming
            client_connected = False
            # Do not cancel chat_task; allow it to finish so DB updates persist
            return

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
