"""Custom-topic template generation. A background job designs a full template (chips, prompt, card
shape, execution spec) for an arbitrary topic, then broadcasts it so the room can come alive. The
generated template runs the exact same room pipeline as the built-ins."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from .database import SessionLocal
from .llm import get_provider
from .models import Room, Template
from .realtime import broadcaster, make_event
from .schemas import TemplateOut


def _fallback_spec(topic: str) -> dict:
    return {
        "system_prompt": (
            f"You are SettleIt's agent for: {topic}. Read the group's chat and propose distinct, "
            "specific, real options for this decision, each with a warm one-line rationale grounded "
            "in what the group said."
        ),
        "seed_chips": [
            {"id": "when", "label": "When?", "options": ["Soon", "This month", "Flexible"]},
            {"id": "budget", "label": "Budget?", "options": ["Low", "Medium", "Treat ourselves"]},
            {"id": "vibe", "label": "Vibe?", "options": ["Chill", "Adventurous", "Special"]},
        ],
        "metadata_fields": [],
        "mission_strategy": f"Break the chosen option for '{topic}' into the few concrete steps that make it happen.",
    }


async def run_template_generation(template_id: uuid.UUID, topic: str, language: str = "en") -> None:
    async with SessionLocal() as session:
        template = await session.get(Template, template_id)
        if template is None:
            return

        try:
            spec = await get_provider().generate_template(topic=topic, language=language)
            if not spec.get("system_prompt") or not spec.get("seed_chips"):
                raise ValueError("incomplete template")
        except Exception:
            spec = _fallback_spec(topic)

        template.system_prompt = spec["system_prompt"]
        template.seed_chips = spec["seed_chips"]
        template.card_shape = {
            "fields": [
                {"key": "title", "type": "string"},
                {"key": "rationale", "type": "string"},
            ],
            "metadata": spec.get("metadata_fields", []),
        }
        template.execution_spec = {
            "mission_strategy": spec.get("mission_strategy", ""),
            "missions": [],
        }

        room = await session.scalar(select(Room).where(Room.template_id == template_id))
        if room is not None and spec.get("welcome_blurb"):
            room.welcome_blurb = spec["welcome_blurb"]

        await session.commit()

        if room is not None:
            payload = TemplateOut.model_validate(template).model_dump(mode="json")
            payload["welcome_blurb"] = room.welcome_blurb
            await broadcaster.broadcast(str(room.id), make_event("template_ready", payload))
