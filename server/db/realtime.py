"""Realtime Broadcast sync for Characters and Voices.

Subscribes to Supabase Realtime Broadcast channels that are fed by
database triggers (characters_broadcast, voices_broadcast).  Keeps
an in-memory dict of each entity so the rest of the server can read
current data without hitting the database.
"""

from __future__ import annotations
import logging
from typing import Any, Callable, Dict, List, Optional

from server.db.client import get_client, fetch_all_characters, fetch_all_voices
from server.db.models import Character, Voice

logger = logging.getLogger(__name__)

# Type alias for optional change callbacks
ChangeCallback = Optional[Callable[[str, str], None]]
# (event: "INSERT"|"UPDATE"|"DELETE", entity_id: str) -> None


class RealtimeSync:
    """In-memory store kept in sync via Supabase Realtime Broadcast.

    Usage:
        db = RealtimeSync()
        await db.start()          # fetch + subscribe
        ...
        await db.stop()           # unsubscribe
    """

    def __init__(self):
        # In-memory stores keyed by primary key
        self.characters: Dict[str, Character] = {}
        self.voices: Dict[str, Voice] = {}

        # Supabase client + Realtime channel references (set during start)
        self._client = None
        self._channel_characters = None
        self._channel_voices = None

        # Optional callbacks for when data changes
        self.on_characters_changed: ChangeCallback = None
        self.on_voices_changed: ChangeCallback = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Fetch initial data from the database, then subscribe to
        broadcast channels so future changes arrive in real time."""

        # 1. Load current state
        all_characters = await fetch_all_characters()
        self.characters = {c.id: c for c in all_characters}

        all_voices = await fetch_all_voices()
        self.voices = {v.voice_id: v for v in all_voices}

        logger.info(
            f"Initial load: {len(self.characters)} characters, "
            f"{len(self.voices)} voices"
        )

        # 2. Subscribe to broadcast channels
        self._client = await get_client()

        await self._subscribe_characters(self._client)
        await self._subscribe_voices(self._client)

    async def stop(self) -> None:
        """Unsubscribe from all broadcast channels."""
        if not self._client:
            return

        if self._channel_characters:
            await self._client.realtime.remove_channel(self._channel_characters)
            self._channel_characters = None
            logger.info("Unsubscribed from characters broadcast")

        if self._channel_voices:
            await self._client.realtime.remove_channel(self._channel_voices)
            self._channel_voices = None
            logger.info("Unsubscribed from voices broadcast")

    # ------------------------------------------------------------------
    # Channel subscriptions
    # ------------------------------------------------------------------

    async def _subscribe_characters(self, client) -> None:
        """Subscribe to the 'characters' broadcast topic."""
        channel = client.realtime.channel("characters")

        channel.on_broadcast(event="INSERT", callback=self._on_character_upsert)
        channel.on_broadcast(event="UPDATE", callback=self._on_character_upsert)
        channel.on_broadcast(event="DELETE", callback=self._on_character_delete)

        await channel.subscribe()
        self._channel_characters = channel
        logger.info("Subscribed to characters broadcast channel")

    async def _subscribe_voices(self, client) -> None:
        """Subscribe to the 'voices' broadcast topic."""
        channel = client.realtime.channel("voices")

        channel.on_broadcast(event="INSERT", callback=self._on_voice_upsert)
        channel.on_broadcast(event="UPDATE", callback=self._on_voice_upsert)
        channel.on_broadcast(event="DELETE", callback=self._on_voice_delete)

        await channel.subscribe()
        self._channel_voices = channel
        logger.info("Subscribed to voices broadcast channel")

    # ------------------------------------------------------------------
    # Broadcast event handlers
    # ------------------------------------------------------------------

    def _on_character_upsert(self, payload: Dict[str, Any]) -> None:
        """Handle INSERT or UPDATE for a character row."""
        try:
            record = self._extract_record(payload)
            if not record:
                logger.warning(f"Character upsert: no record in payload")
                return

            character = Character.from_db_row(record)
            self.characters[character.id] = character
            logger.info(f"Character upserted: {character.name} ({character.id})")

            if self.on_characters_changed:
                event = self._extract_event(payload)
                self.on_characters_changed(event, character.id)

        except Exception as e:
            logger.error(f"Error handling character upsert: {e}")

    def _on_character_delete(self, payload: Dict[str, Any]) -> None:
        """Handle DELETE for a character row."""
        try:
            old_record = self._extract_old_record(payload)
            if not old_record:
                logger.warning(f"Character delete: no old_record in payload")
                return

            char_id = old_record.get("id", "")
            removed = self.characters.pop(char_id, None)
            if removed:
                logger.info(f"Character deleted: {removed.name} ({char_id})")
            else:
                logger.warning(f"Character delete for unknown id: {char_id}")

            if self.on_characters_changed:
                self.on_characters_changed("DELETE", char_id)

        except Exception as e:
            logger.error(f"Error handling character delete: {e}")

    def _on_voice_upsert(self, payload: Dict[str, Any]) -> None:
        """Handle INSERT or UPDATE for a voice row."""
        try:
            record = self._extract_record(payload)
            if not record:
                logger.warning(f"Voice upsert: no record in payload")
                return

            voice = Voice.from_db_row(record)
            self.voices[voice.voice_id] = voice
            logger.info(f"Voice upserted: {voice.voice_name} ({voice.voice_id})")

            if self.on_voices_changed:
                event = self._extract_event(payload)
                self.on_voices_changed(event, voice.voice_id)

        except Exception as e:
            logger.error(f"Error handling voice upsert: {e}")

    def _on_voice_delete(self, payload: Dict[str, Any]) -> None:
        """Handle DELETE for a voice row."""
        try:
            old_record = self._extract_old_record(payload)
            if not old_record:
                logger.warning(f"Voice delete: no old_record in payload")
                return

            vid = old_record.get("voice_id", "")
            removed = self.voices.pop(vid, None)
            if removed:
                logger.info(f"Voice deleted: {removed.voice_name} ({vid})")
            else:
                logger.warning(f"Voice delete for unknown id: {vid}")

            if self.on_voices_changed:
                self.on_voices_changed("DELETE", vid)

        except Exception as e:
            logger.error(f"Error handling voice delete: {e}")

    # ------------------------------------------------------------------
    # Payload parsing helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_record(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract the new/current record from a broadcast payload.

        realtime.broadcast_changes() nests data under payload.payload.record
        but the exact structure can vary, so we check multiple paths.
        """
        inner = payload.get("payload", payload)

        # broadcast_changes nests: { payload: { record: {...} } }
        if isinstance(inner, dict):
            if "record" in inner:
                return inner["record"]
            # Fallback: the inner dict itself might be the row
            if "id" in inner or "voice_id" in inner:
                return inner

        return None

    @staticmethod
    def _extract_old_record(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract the old record from a DELETE broadcast payload."""
        inner = payload.get("payload", payload)

        if isinstance(inner, dict):
            if "old_record" in inner:
                return inner["old_record"]
            # broadcast_changes may use "old" key
            if "old" in inner:
                return inner["old"]
            # Fallback: the inner dict might contain the PK directly
            if "id" in inner or "voice_id" in inner:
                return inner

        return None

    @staticmethod
    def _extract_event(payload: Dict[str, Any]) -> str:
        """Extract the event type (INSERT/UPDATE/DELETE) from a payload."""
        # The event name is typically the broadcast event we subscribed to,
        # but also appears inside the payload from broadcast_changes
        inner = payload.get("payload", payload)
        return inner.get("type", inner.get("event", "UNKNOWN"))

    # ------------------------------------------------------------------
    # Public accessors
    # ------------------------------------------------------------------

    def get_active_characters(self) -> List[Character]:
        """Return all characters with is_active=True, ordered by name."""
        active = [c for c in self.characters.values() if c.is_active]
        active.sort(key=lambda c: c.name.lower())
        return active

    def get_all_characters(self) -> List[Character]:
        """Return all characters."""
        return list(self.characters.values())

    def get_character(self, character_id: str) -> Optional[Character]:
        """Look up a single character by id."""
        return self.characters.get(character_id)

    def get_voice(self, voice_id: str) -> Optional[Voice]:
        """Look up a single voice by voice_id."""
        return self.voices.get(voice_id)

    def get_all_voices(self) -> List[Voice]:
        """Return all voices."""
        return list(self.voices.values())
