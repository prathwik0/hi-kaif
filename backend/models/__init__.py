from typing import Dict, Set, BinaryIO
from .groq import (
    transcribe_audio as transcribe_groq_audio,
)


async def transcribe_audio(
    file: BinaryIO, model_name: str = "whisper-large-v3", language: str = "en"
) -> str:
    """
    Args:
        file: audio file in BinaryIO
        model_name: (str) (Optional)
        language: (str) (Optional)

    Returns:
        str: transcribed text
    """
    PROVIDER_TRANSCRIBE_AUDIO = {
        "groq": transcribe_groq_audio,
    }

    SUPPORTED_MODELS: Dict[str, Set[str]] = {
        "groq": {"whisper-large-v3", "whisper-large-v3-turbo"},
    }

    model_name = model_name.lower()
    provider = None
    for p, models in SUPPORTED_MODELS.items():
        if model_name in models:
            provider = p
            break

    if provider is None:
        raise ValueError(f"Unknown model: {model_name}")

    transcribe_func = PROVIDER_TRANSCRIBE_AUDIO[provider]
    return await transcribe_func(file, model_name, language)
