from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Character:
    """A character the LLM can role-play as during a conversation."""

    id: str
    name: str = ""
    voice_id: str = ""
    global_roleplay: str = ""
    system_prompt: str = ""
    is_active: bool = False
    image_url: str = ""
    images: List[Any] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    @staticmethod
    def from_db_row(row: Dict[str, Any]) -> Character:
        """Build a Character from a Supabase row dict (snake_case keys)."""
        return Character(
            id=row.get("id", ""),
            name=row.get("name") or "",
            voice_id=row.get("voice_id") or "",
            global_roleplay=row.get("global_roleplay") or "",
            system_prompt=row.get("system_prompt") or "",
            is_active=bool(row.get("is_active", False)),
            image_url=row.get("image_url") or "",
            images=row.get("images") or [],
            created_at=str(row.get("created_at") or ""),
            updated_at=str(row.get("updated_at") or ""),
        )


@dataclass
class Voice:
    """A voice configuration used by the TTS engine."""

    voice_id: str
    voice_name: str = ""
    method: str = "clone"  # "clone" | "profile"
    ref_audio: str = ""
    ref_text: str = ""
    speaker_desc: str = ""
    scene_prompt: str = ""
    audio_ids: List[Any] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    @staticmethod
    def from_db_row(row: Dict[str, Any]) -> Voice:
        """Build a Voice from a Supabase row dict (snake_case keys)."""
        return Voice(
            voice_id=row.get("voice_id", ""),
            voice_name=row.get("voice_name") or "",
            method=row.get("method") or "clone",
            ref_audio=row.get("ref_audio") or "",
            ref_text=row.get("ref_text") or "",
            speaker_desc=row.get("speaker_desc") or "",
            scene_prompt=row.get("scene_prompt") or "",
            audio_ids=row.get("audio_ids") or [],
            created_at=str(row.get("created_at") or ""),
            updated_at=str(row.get("updated_at") or ""),
        )
