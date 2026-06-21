"""Provider factory. Builds a Gemini-primary, Groq-fallback chain from whatever keys are set,
falling back to the offline stub when none are configured."""

from __future__ import annotations

from ..config import get_settings
from .base import (
    Card,
    FallbackProvider,
    GenerationError,
    LLMProvider,
    TranscriptLine,
)
from .stub import StubProvider

__all__ = ["Card", "GenerationError", "LLMProvider", "TranscriptLine", "get_provider"]


def get_provider() -> LLMProvider:
    settings = get_settings()
    primary = (settings.llm_provider or "stub").lower()

    if primary == "stub":
        return StubProvider()

    available: dict[str, LLMProvider] = {}
    if settings.gemini_api_key:
        from .gemini import GeminiProvider

        available["gemini"] = GeminiProvider(settings.gemini_api_key, settings.gemini_model)
    if settings.groq_api_key:
        from .groq import GroqProvider

        available["groq"] = GroqProvider(settings.groq_api_key, settings.groq_model)

    if not available:
        return StubProvider()

    # Primary first, then the rest as fallbacks.
    ordered: list[LLMProvider] = []
    if primary in available:
        ordered.append(available[primary])
    for name, provider in available.items():
        if provider not in ordered:
            ordered.append(provider)

    return ordered[0] if len(ordered) == 1 else FallbackProvider(ordered)
