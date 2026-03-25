from __future__ import annotations
import os
import re
import sys
import json
import time
import uuid
import inspect
import queue
import nltk
import torch
import uvicorn
import asyncio
import aiohttp
import logging
import threading
import numpy as np
import multiprocessing
import stream2sentence
from datetime import datetime
from pydantic import BaseModel
from queue import Queue, Empty
from openai import AsyncOpenAI
from collections import defaultdict
from collections.abc import Awaitable
from threading import Thread, Event, Lock
from dataclasses import dataclass, field
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Callable, Optional, Dict, List, Union, Any, AsyncIterator, AsyncGenerator, Awaitable, Set, Tuple
from server.stt import AudioToTextRecorder
from server.stream2sentence import generate_sentences_async
from server.tts.tts_generation import TTS, TTSSentence, AudioResponseDone, AudioChunk
from server.db import Character, Voice, RealtimeSync

logging.basicConfig(filename="filelogger.log", format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

########################################
##--             Models             --##
########################################

@dataclass
class CharacterResponse:
    conversation_id: str
    message_id: str
    character_id: str
    character_name: str
    voice_id: str
    text: str = ""

@dataclass
class ModelSettings:
    model: str
    temperature: float
    top_p: float
    min_p: float
    top_k: int
    frequency_penalty: float
    presence_penalty: float
    repetition_penalty: float

@dataclass
class ActiveTextStream:
    message_id: str
    character_id: str
    character_name: str
    character_image_url: str
    text: str = ""

@dataclass
class Generation:
    last_message: str
    last_responder_id: Optional[str]  # character.id or None for user
    is_user_turn: bool
    responded_pairs: Set[Tuple[str, str]] = field(default_factory=set)
    # (responder_id, triggerer_id) who has already responded to whom.

    @staticmethod
    def from_user(message: str) -> Generation:
        return Generation(last_message=message,
                          last_responder_id=None,
                          is_user_turn=True)

    def after_character(self, message: str, character_id: str) -> Generation:
        """New Generation snapshot after a character responds."""
        new_pairs = set(self.responded_pairs)
        if self.last_responder_id is not None:
            new_pairs.add((character_id, self.last_responder_id))

        return Generation(last_message=message,
                          last_responder_id=character_id,
                          is_user_turn=False,
                          responded_pairs=new_pairs)

    def can_respond_to_last(self, character_id: str) -> bool:
        """Has this character already responded to whoever spoke last this turn?"""
        if self.last_responder_id is None:
            return True  # anyone can respond to the user
        return (character_id, self.last_responder_id) not in self.responded_pairs

########################################
##--              Queues            --##
########################################

class PipeQueues:
    
    def __init__(self):

        self.stt_queue = asyncio.Queue()
        self.sentence_queue = asyncio.Queue()
        self.tts_queue = asyncio.Queue()

########################################
##--              STT               --##
########################################

Callback = Callable[..., Optional[Awaitable[None]]]

class STT:
    """Realtime transcription of user's audio prompt"""

    def __init__(self,on_transcription_update: Optional[Callback] = None,on_transcription_stabilized: Optional[Callback] = None,
                 on_transcription_final: Optional[Callback] = None,on_recording_start: Optional[Callback] = None,
                 on_recording_stop: Optional[Callback] = None,on_transcription_start: Optional[Callback] = None,
                 on_vad_detect_start: Optional[Callback] = None,on_vad_detect_stop: Optional[Callback] = None):

        self.callbacks: Dict[str, Optional[Callback]] = {'on_transcription_update': on_transcription_update,
                                                         'on_transcription_stabilized': on_transcription_stabilized,
                                                         'on_transcription_final': on_transcription_final,
                                                         'on_recording_start': on_recording_start,
                                                         'on_recording_stop': on_recording_stop,
                                                         'on_transcription_start': on_transcription_start,
                                                         'on_vad_detect_start': on_vad_detect_start,
                                                         'on_vad_detect_stop': on_vad_detect_stop}

        self.is_listening = False
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[Thread] = None

        self.recorder = AudioToTextRecorder(model="small.en",
                                            language="en",
                                            enable_realtime_transcription=True,
                                            realtime_processing_pause=0.0,
                                            realtime_model_type="small.en",
                                            on_realtime_transcription_update=self._on_transcription_update,
                                            on_realtime_transcription_stabilized=self._on_transcription_stabilized,
                                            on_recording_start=self._on_recording_start,
                                            on_recording_stop=self._on_recording_stop,
                                            on_transcription_start=self._on_transcription_start,
                                            on_vad_detect_start=self._on_vad_detect_start,
                                            on_vad_detect_stop=self._on_vad_detect_stop,
                                            silero_sensitivity=0.3,
                                            webrtc_sensitivity=2,
                                            post_speech_silence_duration=0.6,
                                            min_length_of_recording=1.1,
                                            faster_whisper_vad_filter=True,
                                            spinner=False,
                                            level=logging.WARNING,
                                            use_microphone=False)

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        """Set the asyncio event loop for callback execution"""

        self.loop = loop

    def transcriber(self):

        while self.is_listening:
            try:
                user_message = self.recorder.text()

                if user_message and user_message.strip():
                    callback = self.callbacks.get('on_transcription_final')
                    if callback:
                        self.run_callback(callback, user_message)

            except Exception as e:
                logger.error(f"Error in recording loop: {e}")

    def run_callback(self, callback: Optional[Callback], *args) -> None:
        """Run a user callback from a RealtimeSTT background thread."""

        if callback is None or self.loop is None:
            return

        if inspect.iscoroutinefunction(callback):
            asyncio.run_coroutine_threadsafe(callback(*args), self.loop)
        else:
            self.loop.call_soon_threadsafe(callback, *args)

    def feed_audio(self, audio_bytes: bytes):
        """Feed raw PCM audio bytes (16kHz, 16-bit, mono)"""

        if not self.is_listening or not self.recorder:
            return

        try:
            self.recorder.feed_audio(audio_bytes, original_sample_rate=16000)

        except Exception as e:
            logger.error(f"Failed to feed audio to recorder: {e}")

    def start_listening(self):
        if self.is_listening:
            return

        self.is_listening = True
        if self._thread is None or not self._thread.is_alive():
            self._thread = Thread(target=self.transcriber, daemon=True)
            self._thread.start()

        logger.info("Started listening for audio")

    def stop_listening(self):
        self.is_listening = False
        if self.recorder:
            try:
                self.recorder.abort()
            except Exception as e:
                logger.warning(f"Failed to abort recorder cleanly: {e}")

            try:
                self.recorder.clear_audio_queue()
            except Exception as e:
                logger.warning(f"Failed to clear recorder audio queue: {e}")

        logger.info("Stopped listening for audio")

    def _on_transcription_update(self, text: str) -> None:
        self.run_callback(self.callbacks.get('on_transcription_update'), text)

    def _on_transcription_stabilized(self, text: str) -> None:
        self.run_callback(self.callbacks.get('on_transcription_stabilized'), text)

    def _on_transcription_final(self, user_message: str) -> None:
        self.run_callback(self.callbacks.get('on_transcription_final'), user_message)

    def _on_recording_start(self) -> None:
        self.run_callback(self.callbacks.get('on_recording_start'))

    def _on_recording_stop(self) -> None:
        self.run_callback(self.callbacks.get('on_recording_stop'))

    def _on_transcription_start(self, *_args) -> None:
        self.run_callback(self.callbacks.get('on_transcription_start'))

    def _on_vad_detect_start(self) -> None:
        self.run_callback(self.callbacks.get('on_vad_detect_start'))

    def _on_vad_detect_stop(self) -> None:
        self.run_callback(self.callbacks.get('on_vad_detect_stop'))

########################################
##--              LLM               --##
########################################

class LLM:

    def __init__(self, queues: PipeQueues, api_key: str, db: RealtimeSync,
                 on_text_stream_start: Optional[Callable[["Character", str], Awaitable[None]]] = None,
                 on_text_stream_stop: Optional[Callable[["Character", str, str], Awaitable[None]]] = None,
                 on_text_chunk: Optional[Callable[[str, "Character", str], Awaitable[None]]] = None):

        self.conversation_history: List[Dict] = []
        self.conversation_id: Optional[str] = None
        self.queues = queues
        self.db = db
        self.client = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
        self.model_settings: Optional[ModelSettings] = None
        self.on_text_stream_start = on_text_stream_start
        self.on_text_stream_stop = on_text_stream_stop
        self.on_text_chunk = on_text_chunk
        self.user_name: str = "Jay"

    @property
    def active_characters(self) -> List[Character]:
        """Live list of active characters, always in sync via RealtimeSync."""
        return self.db.get_active_characters()

    async def initialize(self):
        """Called after RealtimeSync.start() has loaded data."""
        logger.info(f"Initialized with {len(self.active_characters)} active characters")

    async def start_new_conversation(self):
        """Start a new chat session"""
        self.conversation_history = []
        self.conversation_id = str(uuid.uuid4())

    async def clear_conversation_history(self):
        """Clear Conversation History"""
        self.conversation_history = []
        self.conversation_id = None

    async def get_model_settings(self) -> ModelSettings:
        """Return current model settings."""

        if self.model_settings:
            return self.model_settings
        
        return ModelSettings(model="google/gemini-2.5-flash",
                             temperature=0.8,
                             top_p=0.95,
                             min_p=0.05,
                             top_k=40,
                             frequency_penalty=0.0,
                             presence_penalty=0.0,
                             repetition_penalty=1.0,
                             )

    async def set_model_settings(self, model_settings: ModelSettings):
        """Set model settings for LLM requests"""

        self.model_settings = model_settings

    def global_roleplay_message(self, character: Character, user_name: str) -> Dict[str, str]:
        """Message broadcast to all characters"""

        return {
            'role': 'system',
            'content': f'You are {character.name}, a roleplay actor engaging in a conversation with {user_name}. Your replies should be written in a conversational format, taking on the personality and characteristics of {character.name}.'
        }

    def character_instruction_message(self, character: Character) -> Dict[str, str]:
        """Character Instructions"""

        return {
            'role': 'system',
            'content': f'Based on the conversation history above provide the next reply as {character.name}. Your response should include only {character.name}\'s reply. Do not respond for/as anyone else.'
        }

    async def get_user_message(self) -> None:
        """Background task: pull user messages from stt_queue and process."""

        while True:
            try:
                payload = await self.queues.stt_queue.get()
                user_message = ""

                if isinstance(payload, str):
                    user_message = payload
                elif isinstance(payload, tuple):
                    if len(payload) == 2 and isinstance(payload[1], str):
                        user_message = payload[1]
                    elif len(payload) == 1 and isinstance(payload[0], str):
                        user_message = payload[0]

                if user_message.strip():
                    await self.user_turn(user_message)
            except asyncio.CancelledError:
                break

            except Exception as e:
                logger.error(f"Error processing user message: {e}")

    async def user_turn(self, user_message: str) -> None:
        """Entry point for a new user message. Runs the generation loop until no next character is resolved."""

        generation = Generation.from_user(user_message)

        if self.conversation_id is None:
            self.conversation_id = str(uuid.uuid4())

        self.conversation_history.append({"role": "user","name": "Jay","content": user_message})

        while True:
            character = self.determine_next_character(generation)
            if character is None:
                break

            response = await self.initiate_character_response(character=character,
                                                              on_text_stream_start=self.on_text_stream_start,
                                                              on_text_stream_stop=self.on_text_stream_stop)

            if not response:
                break

            generation = generation.after_character(response, character.id)

    def determine_next_character(self, generation: Generation) -> Optional[Character]:
        """Decides who speaks next. Parse last message for a character mention."""

        mentioned = self.parse_last_message(text=generation.last_message,
                                            active_characters=self.active_characters,
                                            exclude_id=generation.last_responder_id)

        if mentioned:
            if generation.can_respond_to_last(mentioned.id):
                return mentioned
            return None  # blocked by loop deterrent

        # user spoke but didn't mention anyone  default character
        if generation.is_user_turn and self.active_characters:
            return self.active_characters[0]

        return None
    
    def parse_last_message(self,text: str,active_characters: List[Character],exclude_id: Optional[str] = None) -> Optional[Character]:
        """
        Find the first active character mentioned in text.
        Matches full name, first name, or last name using word boundaries.
        """
        text_lower = text.lower()

        for character in active_characters:
            if exclude_id and character.id == exclude_id:
                continue

            name_parts = character.name.lower().split()

            # check full name first, then individual parts
            patterns = [re.escape(character.name.lower())]
            patterns.extend(re.escape(part) for part in name_parts)

            for pattern in patterns:
                if re.search(rf"\b{pattern}\b", text_lower):
                    return character

        return None

    def build_character_messages(self, character: Character) -> List[Dict[str, str]]:
        """Build the full message list for an OpenRouter request. Pure computation."""

        messages = []

        if character.global_roleplay:
            messages.append({"role": "system", "content": character.global_roleplay})

        if character.system_prompt:
            messages.append({"role": "system", "content": character.system_prompt})

        messages.extend(self.conversation_history)

        messages.append(self.character_instruction_message(character))

        return messages

    async def initiate_character_response(self,
                                          character: Character,
                                          on_text_stream_start: Optional[Callable[[Character, str], Awaitable[None]]] = None,
                                          on_text_stream_stop: Optional[Callable[[Character, str, str], Awaitable[None]]] = None) -> Optional[str]:

        model_settings = await self.get_model_settings()
        message_id = str(uuid.uuid4())
        messages = self.build_character_messages(character)

        if self.on_text_stream_start:
            await self.on_text_stream_start(character, message_id)

        response = await self.stream_character_response(messages=messages,
                                                        character=character,
                                                        message_id=message_id,
                                                        model_settings=model_settings,
                                                        on_text_chunk=self.on_text_chunk)

        if self.on_text_stream_stop:
            await self.on_text_stream_stop(character, message_id, response)

        if response:
            self.conversation_history.append({"role": "assistant","name": character.name,"content": response})
            return response

        return None

    async def stream_character_response(self,
                                        messages: List[Dict[str, str]],
                                        character: Character,
                                        message_id: str,
                                        model_settings: ModelSettings,
                                        on_text_chunk: Optional[Callable[[str, Character, str], Awaitable[None]]] = None) -> str:
        """Stream LLM tokens, split into sentences, push TTSSentence items to sentence_queue."""

        sentence_index = 0
        response = ""

        try:
            stream = await self.client.chat.completions.create(
                model=model_settings.model,
                messages=messages,
                temperature=model_settings.temperature,
                top_p=model_settings.top_p,
                frequency_penalty=model_settings.frequency_penalty,
                presence_penalty=model_settings.presence_penalty,
                stream=True,
                extra_body={
                    "top_k": model_settings.top_k,
                    "min_p": model_settings.min_p,
                    "repetition_penalty": model_settings.repetition_penalty,
                }
            )

            async def chunk_generator() -> AsyncGenerator[str, None]:
                nonlocal response
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta:
                        content = chunk.choices[0].delta.content
                        if content:
                            response += content
                            if on_text_chunk:
                                await on_text_chunk(content, character, message_id)
                            yield content

            async for sentence in generate_sentences_async(
                chunk_generator(),
                minimum_first_fragment_length=14,
                minimum_sentence_length=25,
                tokenizer="nltk",
                quick_yield_single_sentence_fragment=True,
                sentence_fragment_delimiters = ".?!;:,…)]}。-",
                full_sentence_delimiters = ".?!…。",
            ):
                sentence_text = sentence.strip()
                if sentence_text:
                    await self.queues.sentence_queue.put(TTSSentence(
                        text=sentence_text,
                        index=sentence_index,
                        message_id=message_id,
                        character_id=character.id,
                        character_name=character.name,
                        voice_id=character.voice_id,
                    ))
                    logger.info(f"[LLM] {character.name} sentence {sentence_index}: {sentence_text[:50]}...")
                    sentence_index += 1

        except Exception as e:
            logger.error(f"[LLM] Error streaming for {character.name}: {e}")

        finally:
            await self.queues.sentence_queue.put(AudioResponseDone(
                message_id=message_id,
                character_id=character.id,
                character_name=character.name,
            ))
            logger.info(f"[LLM] {character.name} complete: {sentence_index} sentences, sentinel enqueued")

        return response

########################################
##--          Chat Session          --##
########################################

class ChatSession:
    """Manages WebSocket and Session."""

    def __init__(self):
        self.queues = PipeQueues()
        self.websocket: Optional[WebSocket] = None
        self.stt: Optional[STT] = None
        self.llm: Optional[LLM] = None
        self.tts: Optional[TTS] = None

        self._task_user_message: Optional[asyncio.Task] = None
        self._task_tts_worker: Optional[asyncio.Task] = None
        self._task_stream_audio: Optional[asyncio.Task] = None

        self.user_name = "Jay"
        self.current_message_id: Optional[str] = None
        self.stt_state: str = "inactive"

    async def initialize(self, db: RealtimeSync):
        """Initialize all pipeline components at startup."""
        self.db = db
        api_key = os.getenv("OPENROUTER_API_KEY", "")

        self.stt = STT(on_transcription_update=self.on_transcription_update,on_transcription_stabilized=self.on_transcription_stabilized,
                       on_transcription_final=self.on_transcription_final,on_recording_start=self.on_recording_start,
                       on_recording_stop=self.on_recording_stop,on_transcription_start=self.on_transcription_start,
                       on_vad_detect_start=self.on_vad_detect_start,on_vad_detect_stop=self.on_vad_detect_stop)

        self.stt.set_event_loop(asyncio.get_event_loop())

        self.llm = LLM(queues=self.queues,api_key=api_key,db=db,on_text_stream_start=self.on_text_stream_start,
                       on_text_stream_stop=self.on_text_stream_stop,on_text_chunk=self.on_text_chunk)
        
        await self.llm.initialize()

        self.tts = TTS(queues=self.queues, db=db)
        await self.tts.initialize()

        logger.info(f"Initialized with {len(self.llm.active_characters)} active characters")

    async def connect(self, websocket: WebSocket):
        """Accept WebSocket connection, start pipeline and audio streamer."""
        await websocket.accept()
        self.websocket = websocket

        if self.llm:
            self.llm.conversation_id = None

        await self._conversation_tasks()
        await self.emit_stt_state()

        logger.info("WebSocket connected")

    async def disconnect(self):
        """Stop everything cleanly on WebSocket close."""

        if self.stt and self.stt.is_listening:
            self.stt.stop_listening()

        self.stt_state = "inactive"
        self.websocket = None
        self.current_message_id = None

    async def shutdown(self):
        await self.disconnect()

    async def _conversation_tasks(self) -> None:
        if self.llm and (self._task_user_message is None or self._task_user_message.done()):
            self._task_user_message = asyncio.create_task(self.llm.get_user_message())

        if self.tts and (self._task_tts_worker is None or self._task_tts_worker.done()):
            self._task_tts_worker = asyncio.create_task(self.tts.tts_worker())

        if self._task_stream_audio is None or self._task_stream_audio.done():
            self._task_stream_audio = asyncio.create_task(self.stream_audio())

    async def emit_stt_state(self) -> None:
        await self.send_text_to_client({"type": "stt_state", "data": {"state": self.stt_state}})

    async def set_stt_state(self, next_state: str) -> None:
        if self.stt_state == next_state:
            return
        
        self.stt_state = next_state
        await self.emit_stt_state()

    async def stream_audio(self) -> None:
        """Long-running consumer: pull audio chunks from tts_queue and stream to client."""
        try:
            while True:
                item = await self.queues.tts_queue.get()
                try:
                    if isinstance(item, AudioResponseDone):
                        if self.current_message_id == item.message_id:
                            await self.on_audio_stream_stop(item.character_id, item.character_name, item.message_id)
                            self.current_message_id = None
                        continue

                    chunk: AudioChunk = item

                    if self.current_message_id != chunk.message_id:
                        await self.on_audio_stream_start(chunk)
                        self.current_message_id = chunk.message_id

                    if self.websocket:
                        await self.websocket.send_bytes(chunk.audio_bytes)
                finally:
                    self.queues.tts_queue.task_done()

        except asyncio.CancelledError:
            logger.debug("[Transport] Audio streamer cancelled")

    async def on_transcription_update(self, text: str):
        await self.send_text_to_client({"type": "stt_update", "text": text})

    async def on_transcription_stabilized(self, text: str):
        await self.send_text_to_client({"type": "stt_stabilized", "text": text})

    async def on_transcription_final(self, user_message: str):
        await self.queues.stt_queue.put(user_message)
        await self.send_text_to_client({"type": "stt_final", "text": user_message})
        await self.set_stt_state("listening")

    async def on_recording_start(self):
        await self.set_stt_state("recording")

    async def on_recording_stop(self):
        if self.stt and self.stt.is_listening:
            await self.set_stt_state("listening")

    async def on_transcription_start(self):
        await self.set_stt_state("transcribing")

    async def on_vad_detect_start(self):
        if self.stt and self.stt.is_listening and self.stt_state == "inactive":
            await self.set_stt_state("listening")

    async def on_vad_detect_stop(self):
        if self.stt and self.stt.is_listening and self.stt_state != "inactive":
            await self.set_stt_state("listening")

    async def on_text_stream_start(self, character: Character, message_id: str):
        await self.send_text_to_client({
            "type": "text_stream_start",
            "data": {
                "character_id": character.id,
                "character_name": character.name,
                "character_image_url": character.image_url,
                "message_id": message_id,
            },
        })

    async def on_text_chunk(self, text: str, character: Character, message_id: str):
        await self.send_text_to_client({
            "type": "text_chunk",
            "data": {
                "text": text,
                "character_id": character.id,
                "character_name": character.name,
                "character_image_url": character.image_url,
                "message_id": message_id,
            },
        })

    async def on_text_stream_stop(self, character: Character, message_id: str, text: str):
        await self.send_text_to_client({
            "type": "text_stream_stop",
            "data": {
                "character_id": character.id,
                "character_name": character.name,
                "character_image_url": character.image_url,
                "message_id": message_id,
                "text": text,
            },
        })

    async def on_audio_stream_start(self, chunk: AudioChunk):
        sample_rate = self.tts.sample_rate if self.tts else 24000
        await self.send_text_to_client({
            "type": "audio_stream_start",
            "data": {
                "character_id": chunk.character_id,
                "character_name": chunk.character_name,
                "message_id": chunk.message_id,
                "sample_rate": sample_rate,
            },
        })

    async def on_audio_stream_stop(self, character_id: str, character_name: str, message_id: str):
        logger.info(f"[TTS] Emitting audio_stream_stop for {character_id}/{message_id}")
        await self.send_text_to_client({
            "type": "audio_stream_stop",
            "data": {
                "character_id": character_id,
                "character_name": character_name,
                "message_id": message_id,
            },
        })

    @staticmethod
    def _build_model_settings(data: Dict[str, Any]) -> ModelSettings:
        return ModelSettings(model=str(data.get("model", "openai/gpt-oss-120b")),
                             temperature=float(data.get("temperature", 0.93)),
                             top_p=float(data.get("top_p", 0.95)),
                             min_p=float(data.get("min_p", 0.0)),
                             top_k=int(data.get("top_k", 40)),
                             frequency_penalty=float(data.get("frequency_penalty", 0.0)),
                             presence_penalty=float(data.get("presence_penalty", 0.0)),
                             repetition_penalty=float(data.get("repetition_penalty", 1.0)))

    async def handle_text_message(self, raw: str):
        """Parse incoming JSON text message and route to handler."""
        try:
            data = json.loads(raw)

        except json.JSONDecodeError:
            logger.warning(f"Received non-JSON text message: {raw[:100]}")
            return

        message_type = data.get("type", "")

        if message_type == "ping":
            await self.send_text_to_client({"type": "pong"})

        elif message_type == "user_message":
            model_settings_payload = data.get("model_settings")

            if isinstance(model_settings_payload, dict):
                try:
                    model_settings = self._build_model_settings(model_settings_payload)

                except (TypeError, ValueError):
                    logger.warning("Invalid inline model settings payload")

                else:
                    if self.llm:
                        await self.llm.set_model_settings(model_settings)

            text = data.get("text", "").strip()

            if text:
                await self.handle_user_message(text)

        elif message_type == "start_listening":

            if self.stt:
                self.stt.start_listening()
                await self.set_stt_state("listening")

        elif message_type == "stop_listening":

            if self.stt:
                self.stt.stop_listening()
                await self.set_stt_state("inactive")

        elif message_type == "model_settings":
            try:
                model_settings = self._build_model_settings(data)
                
            except (TypeError, ValueError):
                logger.warning("Invalid model settings payload")
                return

            if self.llm:
                await self.llm.set_model_settings(model_settings)
            logger.info(f"Model settings updated: {model_settings.model}")

        elif message_type == "clear_history":

            if self.llm:
                await self.llm.clear_conversation_history()

        else:
            logger.warning(f"Unknown message type: {message_type}")

    async def handle_audio_message(self, audio_bytes: bytes):

        if self.stt:
            self.stt.feed_audio(audio_bytes)

    async def handle_user_message(self, user_message: str):
        """User Message Text."""

        await self.queues.stt_queue.put(user_message)

    async def send_text_to_client(self, data: dict):
        """Send JSON message to client."""

        if self.websocket:
            await self.websocket.send_text(json.dumps(data))

########################################
##--           FastAPI App          --##
########################################

session = ChatSession()
db = RealtimeSync()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up services...")

    await db.start()
    await session.initialize(db)

    print("All services initialised!")

    yield

    print("Shutting down services...")

    await session.shutdown()
    await db.stop()

    print("All services shut down!")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

########################################
##--       WebSocket Endpoint       --##
########################################

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await session.connect(websocket)

    try:
        while True:
            message = await websocket.receive()

            if "text" in message:
                await session.handle_text_message(message["text"])

            elif "bytes" in message:
                await session.handle_audio_message(message["bytes"])

    except WebSocketDisconnect:
        await session.disconnect()

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await session.disconnect()

########################################
##--           Run Server           --##
########################################

app.mount("/", StaticFiles(directory="client", html=True), name="client")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5173)
