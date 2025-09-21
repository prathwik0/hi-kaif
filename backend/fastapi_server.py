import json
from typing import Optional, List, Dict, Any, AsyncGenerator, Tuple, Union
from contextlib import asynccontextmanager
from io import BytesIO

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
