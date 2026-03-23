import type {
  AudioPlayerController,
  AudioPlayerOptions,
  AudioStreamStartMeta,
  PlaybackError,
  PlaybackState,
} from "@/lib/chat-contracts"

const SCHEDULING_LOOKAHEAD_SECONDS = 0.05

type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

interface ActiveStreamContext {
  meta: AudioStreamStartMeta
  pendingSources: Set<AudioBufferSourceNode>
  scheduledUntil: number
  stopRequested: boolean
}

class BrowserAudioPlayerController implements AudioPlayerController {
  private state: PlaybackState = "idle"
  private activeStream: ActiveStreamContext | null = null
  private audioContext: AudioContext | null = null
  private options: AudioPlayerOptions

  constructor(options: AudioPlayerOptions = {}) {
    this.options = options
  }

  startStream(meta: AudioStreamStartMeta): void {
    if (!Number.isFinite(meta.sampleRate) || meta.sampleRate <= 0) {
      this.emitError({
        code: "AUDIO_INIT_FAILED",
        message: "Received an invalid sample rate for audio playback.",
        messageId: meta.messageId,
      })
      return
    }

    const context = this.ensureAudioContext(meta.messageId)
    if (!context) {
      return
    }

    if (this.activeStream) {
      this.clearActiveStream()
    }

    this.activeStream = {
      meta,
      pendingSources: new Set<AudioBufferSourceNode>(),
      scheduledUntil: context.currentTime,
      stopRequested: false,
    }

    this.transitionTo("starting")
    this.tryResumeContext(meta.messageId)
  }

  pushChunk(chunk: ArrayBuffer): void {
    if (chunk.byteLength === 0) {
      return
    }

    const stream = this.activeStream
    if (!stream) {
      this.emitError({
        code: "AUDIO_STREAM_MISMATCH",
        message: "Audio chunk received without an active stream context.",
      })
      return
    }

    if (stream.stopRequested) {
      this.emitError({
        code: "AUDIO_STREAM_MISMATCH",
        message: "Audio chunk received after stop was requested for this stream.",
        messageId: stream.meta.messageId,
      })
      return
    }

    const context = this.ensureAudioContext(stream.meta.messageId)
    if (!context) {
      return
    }

    const samples = this.decodePcm16Mono(chunk, stream.meta.messageId)
    if (!samples || samples.length === 0) {
      return
    }

    try {
      const buffer = context.createBuffer(1, samples.length, stream.meta.sampleRate)
      buffer.copyToChannel(samples, 0)

      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)

      const startAt = Math.max(context.currentTime + SCHEDULING_LOOKAHEAD_SECONDS, stream.scheduledUntil)
      stream.scheduledUntil = startAt + buffer.duration

      source.onended = () => {
        this.handleSourceEnded(stream, source)
      }

      stream.pendingSources.add(source)
      source.start(startAt)

      this.transitionTo("playing")
      this.tryResumeContext(stream.meta.messageId)
    } catch (error) {
      this.emitError({
        code: "AUDIO_RUNTIME_ERROR",
        message: this.toPlaybackErrorMessage("Failed to schedule decoded audio chunk.", error),
        messageId: stream.meta.messageId,
      })
      this.transitionTo("error")
    }
  }

  stopStream(messageId: string): void {
    const stream = this.activeStream
    if (!stream) {
      return
    }

    if (stream.meta.messageId !== messageId) {
      this.emitError({
        code: "AUDIO_STREAM_MISMATCH",
        message: "Attempted to stop a stream with a mismatched message id.",
        messageId,
      })
      return
    }

    stream.stopRequested = true
    this.transitionTo("draining")

    if (stream.pendingSources.size === 0) {
      this.finalizeStream(stream)
    }
  }

  flush(): void {
    this.clearActiveStream()
    this.transitionTo("idle")
  }

  getState(): PlaybackState {
    return this.state
  }

  destroy(): void {
    this.flush()

    if (!this.audioContext) {
      return
    }

    const context = this.audioContext
    this.audioContext = null
    void context.close().catch(() => {
      // Ignore close errors during teardown.
    })
  }

  private ensureAudioContext(messageId?: string): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext
    }

    const contextCtor = window.AudioContext ?? (window as BrowserWindow).webkitAudioContext
    if (!contextCtor) {
      this.emitError({
        code: "AUDIO_INIT_FAILED",
        message: "Web Audio API is not available in this browser.",
        messageId,
      })
      this.transitionTo("error")
      return null
    }

    try {
      this.audioContext = new contextCtor()
      return this.audioContext
    } catch (error) {
      this.emitError({
        code: "AUDIO_INIT_FAILED",
        message: this.toPlaybackErrorMessage("Failed to initialize audio playback context.", error),
        messageId,
      })
      this.transitionTo("error")
      return null
    }
  }

  private tryResumeContext(messageId?: string): void {
    if (!this.audioContext || this.audioContext.state !== "suspended") {
      return
    }

    void this.audioContext.resume().catch((error) => {
      this.emitError({
        code: "AUDIO_RUNTIME_ERROR",
        message: this.toPlaybackErrorMessage("Unable to resume audio playback context.", error),
        messageId,
      })
      this.transitionTo("error")
    })
  }

  private decodePcm16Mono(chunk: ArrayBuffer, messageId?: string): Float32Array<ArrayBuffer> | null {
    if (chunk.byteLength % 2 !== 0) {
      this.emitError({
        code: "AUDIO_DECODE_FAILED",
        message: "PCM16 chunk length must be divisible by 2 bytes.",
        messageId,
      })
      return null
    }

    try {
      const sampleCount = chunk.byteLength / 2
      const view = new DataView(chunk)
      const output = new Float32Array(new ArrayBuffer(sampleCount * Float32Array.BYTES_PER_ELEMENT))

      for (let index = 0; index < sampleCount; index += 1) {
        const pcmValue = view.getInt16(index * 2, true)
        output[index] = pcmValue < 0 ? pcmValue / 32768 : pcmValue / 32767
      }

      return output
    } catch (error) {
      this.emitError({
        code: "AUDIO_DECODE_FAILED",
        message: this.toPlaybackErrorMessage("Failed to decode PCM16 audio chunk.", error),
        messageId,
      })
      return null
    }
  }

  private handleSourceEnded(stream: ActiveStreamContext, source: AudioBufferSourceNode): void {
    source.disconnect()
    stream.pendingSources.delete(source)

    if (this.activeStream !== stream) {
      return
    }

    if (!stream.stopRequested && stream.pendingSources.size === 0) {
      this.transitionTo("starting")
      return
    }

    if (stream.stopRequested && stream.pendingSources.size === 0) {
      this.finalizeStream(stream)
    }
  }

  private finalizeStream(stream: ActiveStreamContext): void {
    if (this.activeStream !== stream) {
      return
    }

    this.activeStream = null
    this.transitionTo("idle")
  }

  private clearActiveStream(): void {
    const stream = this.activeStream
    if (!stream) {
      return
    }

    for (const source of stream.pendingSources) {
      try {
        source.stop()
      } catch {
        // Sources may already be ending; ignore stop failures.
      }
      source.disconnect()
    }

    stream.pendingSources.clear()
    this.activeStream = null
  }

  private transitionTo(nextState: PlaybackState): void {
    if (this.state === nextState) {
      return
    }

    this.state = nextState
    this.options.onStateChange?.(nextState)
  }

  private emitError(error: PlaybackError): void {
    this.options.onError?.(error)
  }

  private toPlaybackErrorMessage(prefix: string, error: unknown): string {
    if (error instanceof Error && error.message) {
      return `${prefix} ${error.message}`
    }

    return prefix
  }
}

export function createAudioPlayerController(options: AudioPlayerOptions = {}): AudioPlayerController {
  return new BrowserAudioPlayerController(options)
}

