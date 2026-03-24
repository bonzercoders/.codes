from __future__ import annotations
import os
import torch
import asyncio
import logging
import numpy as np
from dataclasses import dataclass
from typing import Callable, Optional, Dict, List, AsyncGenerator, Protocol
from server.tts.boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from server.tts.boson_multimodal.data_types import ChatMLSample, Message, AudioContent, TextContent

from server.db.models import Voice

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from server.db.realtime import RealtimeSync

logger = logging.getLogger(__name__)


@dataclass
class TTSSentence:
    text: str
    index: int
    message_id: str
    character_id: str
    character_name: str
    voice_id: str


@dataclass
class AudioResponseDone:
    message_id: str
    character_id: str
    character_name: str


@dataclass
class AudioChunk:
    audio_bytes: bytes
    sentence_index: int
    chunk_index: int
    message_id: str
    character_id: str
    character_name: str


class TTSQueues(Protocol):
    sentence_queue: asyncio.Queue
    tts_queue: asyncio.Queue


def revert_delay_pattern(data: torch.Tensor, start_idx: int = 0) -> torch.Tensor:
    """Undo Higgs delay pattern so decoded frames line up."""
    if data.ndim != 2:
        raise ValueError("Expected 2D tensor from audio tokenizer")
    if data.shape[1] - data.shape[0] < start_idx:
        raise ValueError("Invalid start_idx for delay pattern reversion")

    out = []
    num_codebooks = data.shape[0]
    for i in range(num_codebooks):
        out.append(data[i:(i + 1), i + start_idx:(data.shape[1] - num_codebooks + 1 + i)])
    return torch.cat(out, dim=0)


class TTS:
    def __init__(self, queues: TTSQueues, db: "RealtimeSync"):
        self.queues = queues
        self.db = db
        self._task_tts_worker: Optional[asyncio.Task] = None

        # Set during initialize()
        self.engine: Optional[HiggsAudioServeEngine] = None
        self.sample_rate: int = 24000

        # Decode schedule config
        self.first_sentence_chunk_schedule: tuple[int, ...] = (4, 8, 16, 24)
        self.standard_chunk_size: int = 24
        self._validate_chunk_schedule_config()

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.voice_dir = os.path.join(os.path.dirname(__file__), "voices")

    @staticmethod
    def _validate_chunk_size(value: int, field_name: str) -> None:
        if type(value) is not int:
            raise ValueError(f"{field_name} must be an integer, got {type(value).__name__}")
        if value < 2:
            raise ValueError(f"{field_name} must be >= 2, got {value}")

    def _validate_chunk_schedule_config(self) -> None:
        if not self.first_sentence_chunk_schedule:
            raise ValueError("first_sentence_chunk_schedule cannot be empty")

        for index, size in enumerate(self.first_sentence_chunk_schedule):
            self._validate_chunk_size(size, f"first_sentence_chunk_schedule[{index}]")

        self._validate_chunk_size(self.standard_chunk_size, "standard_chunk_size")

    def _target_chunk_size(self, sentence_index: int, emitted_chunk_count: int) -> int:
        if sentence_index == 0 and emitted_chunk_count < len(self.first_sentence_chunk_schedule):
            return self.first_sentence_chunk_schedule[emitted_chunk_count]
        return self.standard_chunk_size

    def _decode_audio_window(self, audio_tokens: List[torch.Tensor], start_idx: int) -> Optional[bytes]:
        if self.engine is None:
            raise RuntimeError("TTS engine is not initialized")

        if not audio_tokens:
            return None

        audio_tensor = torch.cat(audio_tokens, dim=-1)

        try:
            # Revert delay pattern and decode
            vq_code = revert_delay_pattern(audio_tensor, start_idx=start_idx).clip(0, 1023).to(self.device)
            waveform = self.engine.audio_tokenizer.decode(vq_code.unsqueeze(0))[0, 0]

            # Convert to numpy
            if isinstance(waveform, torch.Tensor):
                waveform_np = waveform.detach().cpu().numpy()
            else:
                waveform_np = np.asarray(waveform, dtype=np.float32)

            # Convert to PCM16 bytes
            pcm = np.clip(waveform_np, -1.0, 1.0)
            pcm16 = (pcm * 32767.0).astype(np.int16)
            return pcm16.tobytes()

        except Exception as e:
            logger.warning(f"Error decoding chunk (start_idx={start_idx}): {e}")
            return None

    async def initialize(self):
        """Initialize the Higgs Audio engine. Called once at startup."""
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"

            self.engine = HiggsAudioServeEngine(
                model_name_or_path="bosonai/higgs-audio-v2-generation-3B-base",
                audio_tokenizer_name_or_path="bosonai/higgs-audio-v2-tokenizer",
                device=device,
            )

        except Exception as e:
            logger.error(f"Failed to initialize Higgs Audio TTS: {e}")
            raise

    async def tts_worker(self):
        """Background task: pull sentences from queue, synthesize audio, queue chunks."""
        while True:
            try:
                item = await self.queues.sentence_queue.get()
            except asyncio.CancelledError:
                break

            try:
                if isinstance(item, AudioResponseDone):
                    if self.engine is not None:
                        self.engine.clear_generated_audio_ids(item)

                    await self.queues.tts_queue.put(item)
                    logger.info(f"[TTS] End of response for {item.character_name}")
                    continue

                sentence: TTSSentence = item

                logger.info(f"[TTS] Generating audio for sentence {sentence.index}")
                chunk_index = 0

                try:
                    async for pcm_bytes in self.synthesize_speech(
                        sentence.text,
                        sentence.voice_id,
                        sentence.index,
                    ):
                        await self.queues.tts_queue.put(
                            AudioChunk(
                                audio_bytes=pcm_bytes,
                                sentence_index=sentence.index,
                                chunk_index=chunk_index,
                                message_id=sentence.message_id,
                                character_id=sentence.character_id,
                                character_name=sentence.character_name,
                            )
                        )
                        chunk_index += 1

                    logger.info(f"[TTS] {sentence.character_name} #{sentence.index}: {chunk_index} chunks")

                except Exception as e:
                    logger.error(f"[TTS] Error generating audio: {e}")

            finally:
                self.queues.sentence_queue.task_done()

    def _resolve_reference_path(self, path_value: str) -> str:
        """Resolve absolute/relative reference paths for voice assets."""
        candidate = (path_value or "").strip()
        if not candidate:
            raise ValueError("Voice reference path is empty")

        if os.path.exists(candidate):
            return candidate

        in_voice_dir = os.path.join(self.voice_dir, candidate)
        if os.path.exists(in_voice_dir):
            return in_voice_dir

        raise FileNotFoundError(f"Voice reference path not found: {path_value}")

    async def load_voice_reference(self, voice: Voice):
        """Load reference audio and text for voice cloning from a Voice record."""
        if not voice.ref_audio:
            raise ValueError(f"Voice '{voice.voice_id}' is missing required ref_audio")

        audio_path = self._resolve_reference_path(voice.ref_audio)
        ref_text_value = (voice.ref_text or "").strip()
        if not ref_text_value:
            raise ValueError(f"Voice '{voice.voice_id}' is missing required ref_text")

        if os.path.exists(ref_text_value):
            with open(ref_text_value, "r", encoding="utf-8") as f:
                ref_text = f.read().strip()
        else:
            ref_text = ref_text_value

        if not ref_text:
            raise ValueError(f"Voice '{voice.voice_id}' resolved to empty reference text")

        messages = [
            Message(role="user", content=ref_text),
            Message(role="assistant", content=AudioContent(audio_url=audio_path)),
        ]

        return messages

    async def synthesize_speech(self, text: str, voice_id: str, sentence_index: int) -> AsyncGenerator[bytes, None]:
        """Stream PCM16 audio chunks from Higgs Audio engine."""
        if self.engine is None:
            raise RuntimeError("TTS engine is not initialized")

        if not voice_id:
            raise ValueError("Cannot synthesize speech without voice_id")

        selected_voice = self.db.get_voice(voice_id)
        if not selected_voice:
            raise ValueError(f"Voice '{voice_id}' not found in database")

        messages = await self.load_voice_reference(selected_voice)
        messages.append(Message(role="user", content=text))

        chat_sample = ChatMLSample(messages=messages)

        # Initialize streaming state
        audio_tokens: List[torch.Tensor] = []
        seq_len = 0
        pending_nonpad_tokens = 0
        emitted_chunk_count = 0

        with torch.inference_mode():
            async for delta in self.engine.generate_delta_stream(
                chat_ml_sample=chat_sample,
                max_new_tokens=2048,
                temperature=0.7,
                top_p=0.95,
                top_k=50,
                stop_strings=["<|end_of_text|>", "<|eot_id|>"],
                ras_win_len=7,
                ras_win_max_num_repeat=2,
                force_audio_gen=True,
            ):

                if delta.audio_tokens is None:
                    continue

                # Check for end token (1025)
                if torch.all(delta.audio_tokens == 1025):
                    break

                # Accumulate tokens
                audio_tokens.append(delta.audio_tokens[:, None])

                # Count non-padding tokens (1024 is padding)
                if torch.all(delta.audio_tokens != 1024):
                    seq_len += 1
                    pending_nonpad_tokens += 1

                if pending_nonpad_tokens <= 0:
                    continue

                target_chunk_size = self._target_chunk_size(sentence_index, emitted_chunk_count)
                if pending_nonpad_tokens < target_chunk_size:
                    continue

                start_idx = seq_len - pending_nonpad_tokens + 1
                pcm_bytes = self._decode_audio_window(audio_tokens, start_idx=start_idx)
                pending_nonpad_tokens = 0

                if pcm_bytes is None:
                    continue

                yield pcm_bytes
                emitted_chunk_count += 1

        # Flush remaining tokens
        if pending_nonpad_tokens > 0 and audio_tokens:
            start_idx = seq_len - pending_nonpad_tokens + 1
            pcm_bytes = self._decode_audio_window(audio_tokens, start_idx=start_idx)
            if pcm_bytes is not None:
                yield pcm_bytes

    def get_available_voices(self) -> List[Dict[str, str]]:
        """Get list of available voices formatted for frontend."""
        all_voices = self.db.get_all_voices()
        voices = [{"voice_id": v.voice_id, "voice_name": v.voice_name} for v in all_voices]
        voices.sort(key=lambda item: item["voice_name"].lower())
        return voices

    def shutdown(self):
        """Cleanup resources"""
        logger.info("Shutting down TTS manager")
        self.engine = None
        self._initialized = False
