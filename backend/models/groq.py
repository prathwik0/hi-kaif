import os
from groq import AsyncGroq
from groq.types.chat import ChatCompletionMessageParam
from typing import List, Dict, Any, AsyncGenerator, BinaryIO, cast, Tuple, Union
from dotenv import load_dotenv
import tempfile
import json

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is not set")


async def stream_chat_response(
    messages: List[Dict[str, str]], model: str
) -> AsyncGenerator[Tuple[str, Union[str, List[Dict[str, str]]]], None]:
    """Stream a chat response from Groq."""
    client = AsyncGroq()

    typed_messages = cast(List[ChatCompletionMessageParam], messages)
    full_response_text = ""

    stream = await client.chat.completions.create(
        model=model, messages=typed_messages, stream=True
    )

    async for chunk in stream:
        content = chunk.choices[0].delta.content
        if content is not None:
            full_response_text += content
            yield "chunk", f"data: {json.dumps({'v': content})}\n\n"

    # Convert the full response to a message format
    full_response_messages = [{"role": "assistant", "content": full_response_text}]
    yield "full_response", full_response_messages


async def transcribe_audio(file: BinaryIO, model: str, language: str) -> str:
    """Transcribe audio using Groq's API."""
    client = AsyncGroq()

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_file:
        file.seek(0)
        temp_file.write(file.read())
        temp_file_path = temp_file.name
    try:
        with open(temp_file_path, "rb") as audio_file_to_transcribe:
            transcription = await client.audio.transcriptions.create(
                file=audio_file_to_transcribe,
                model=model,
                language=language,
                response_format="json",
            )

        return transcription.text
    finally:
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
