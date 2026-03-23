import type {
  AudioCaptureController,
  AudioCaptureStartOptions,
  CaptureError,
  CaptureErrorCode,
  CaptureState,
} from "@/lib/chat-contracts"

const PROCESSOR_BUFFER_SIZE = 4096

class BrowserAudioCaptureController implements AudioCaptureController {
  private state: CaptureState = "idle"
  private activeOptions: AudioCaptureStartOptions | null = null
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private sinkNode: GainNode | null = null
  private resampleCarry: Float32Array<ArrayBufferLike> = new Float32Array(0)
  private resamplePosition = 0
  private sessionToken = 0

  async start(options: AudioCaptureStartOptions): Promise<void> {
    if (this.state === "capturing" || this.state === "requesting_permission") {
      return
    }

    this.activeOptions = options
    this.transitionTo("requesting_permission")

    const token = ++this.sessionToken

    if (!navigator.mediaDevices?.getUserMedia) {
      await this.handleStartupFailure("MIC_NOT_AVAILABLE", "Microphone access is not available in this browser.", token)
      return
    }

    const AudioContextCtor = getAudioContextConstructor()
    if (!AudioContextCtor) {
      await this.handleStartupFailure("MIC_NOT_AVAILABLE", "Web Audio is not supported in this browser.", token)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      if (!this.isSessionActive(token)) {
        stopMediaStream(stream)
        return
      }

      const context = new AudioContextCtor()
      await context.resume()

      if (!this.isSessionActive(token)) {
        await context.close()
        stopMediaStream(stream)
        return
      }

      const sourceNode = context.createMediaStreamSource(stream)
      const processorNode = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
      const sinkNode = context.createGain()
      sinkNode.gain.value = 0

      processorNode.onaudioprocess = (event) => {
        this.handleAudioProcess(event)
      }

      sourceNode.connect(processorNode)
      processorNode.connect(sinkNode)
      sinkNode.connect(context.destination)

      this.mediaStream = stream
      this.audioContext = context
      this.sourceNode = sourceNode
      this.processorNode = processorNode
      this.sinkNode = sinkNode
      this.resampleCarry = new Float32Array(0)
      this.resamplePosition = 0

      this.transitionTo("capturing")
    } catch (error) {
      const captureError = mapStartupError(error)
      await this.handleStartupFailure(captureError.code, captureError.message, token)
    }
  }

  async stop(): Promise<void> {
    const token = ++this.sessionToken

    if (this.state === "idle") {
      this.activeOptions = null
      return
    }

    this.transitionTo("stopping")
    await this.cleanupResources()

    if (!this.isSessionActive(token)) {
      return
    }

    this.resampleCarry = new Float32Array(0)
    this.resamplePosition = 0
    this.transitionTo("idle")
    this.activeOptions = null
  }

  getState(): CaptureState {
    return this.state
  }

  async destroy(): Promise<void> {
    await this.stop()
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (this.state !== "capturing" || !this.activeOptions) {
      return
    }

    try {
      const inputBuffer = event.inputBuffer
      if (inputBuffer.numberOfChannels === 0) {
        return
      }

      const channelData = inputBuffer.getChannelData(0)
      const chunk = this.encodeToPcm16(channelData, inputBuffer.sampleRate, this.activeOptions.targetSampleRate)
      if (chunk.byteLength > 0) {
        this.activeOptions.onChunk(chunk)
      }
    } catch {
      this.handleRuntimeFailure("ENCODE_FAILURE", "Failed to encode microphone audio frame.")
    }
  }

  private encodeToPcm16(input: Float32Array<ArrayBufferLike>, sourceRate: number, targetRate: number): Uint8Array {
    if (input.length === 0) {
      return new Uint8Array(0)
    }

    const resampled =
      sourceRate === targetRate ? input : this.resampleLinear(input, sourceRate, targetRate)

    if (resampled.length === 0) {
      return new Uint8Array(0)
    }

    const buffer = new ArrayBuffer(resampled.length * 2)
    const view = new DataView(buffer)

    for (let index = 0; index < resampled.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, resampled[index]))
      const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
      view.setInt16(index * 2, int16, true)
    }

    return new Uint8Array(buffer)
  }

  private resampleLinear(input: Float32Array<ArrayBufferLike>, sourceRate: number, targetRate: number): Float32Array<ArrayBufferLike> {
    if (sourceRate <= 0 || targetRate <= 0) {
      return new Float32Array(0)
    }

    const combined = concatFloat32(this.resampleCarry, input)
    if (combined.length < 2) {
      this.resampleCarry = combined
      return new Float32Array(0)
    }

    const step = sourceRate / targetRate
    let position = this.resamplePosition
    const lastSampleIndex = combined.length - 1
    const output: number[] = []

    while (position < lastSampleIndex) {
      const leftIndex = Math.floor(position)
      const rightIndex = leftIndex + 1
      const fraction = position - leftIndex

      const left = combined[leftIndex]
      const right = combined[rightIndex]
      output.push(left + (right - left) * fraction)
      position += step
    }

    const keepFrom = Math.max(0, Math.floor(position) - 1)
    this.resampleCarry = combined.slice(keepFrom)
    this.resamplePosition = position - keepFrom

    return Float32Array.from(output)
  }

  private async handleStartupFailure(code: CaptureErrorCode, message: string, token: number): Promise<void> {
    await this.cleanupResources()
    if (!this.isSessionActive(token)) {
      return
    }

    this.transitionTo("error")
    this.emitError({ code, message })
    this.transitionTo("idle")
    this.activeOptions = null
  }

  private handleRuntimeFailure(code: CaptureErrorCode, message: string): void {
    this.transitionTo("error")
    this.emitError({ code, message })
    void this.stop()
  }

  private transitionTo(nextState: CaptureState): void {
    this.state = nextState
    this.activeOptions?.onStateChange?.(nextState)
  }

  private emitError(error: CaptureError): void {
    this.activeOptions?.onError?.(error)
  }

  private async cleanupResources(): Promise<void> {
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null
      this.processorNode.disconnect()
      this.processorNode = null
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.sinkNode) {
      this.sinkNode.disconnect()
      this.sinkNode = null
    }

    if (this.mediaStream) {
      stopMediaStream(this.mediaStream)
      this.mediaStream = null
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close()
      } catch {
        // Ignore close failures during cleanup.
      }
      this.audioContext = null
    }
  }

  private isSessionActive(token: number): boolean {
    return token === this.sessionToken
  }
}

function getAudioContextConstructor(): typeof AudioContext | null {
  const maybeWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext
  }

  return window.AudioContext ?? maybeWindow.webkitAudioContext ?? null
}

function mapStartupError(error: unknown): CaptureError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return {
        code: "MIC_PERMISSION_DENIED",
        message: "Microphone permission was denied.",
      }
    }

    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError" ||
      error.name === "OverconstrainedError"
    ) {
      return {
        code: "MIC_NOT_AVAILABLE",
        message: "No compatible microphone device is available.",
      }
    }
  }

  return {
    code: "CAPTURE_START_FAILED",
    message: "Unable to start microphone capture.",
  }
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

function concatFloat32(first: Float32Array<ArrayBufferLike>, second: Float32Array<ArrayBufferLike>): Float32Array<ArrayBufferLike> {
  if (first.length === 0) {
    return second.slice()
  }

  if (second.length === 0) {
    return first.slice()
  }

  const merged = new Float32Array(first.length + second.length)
  merged.set(first, 0)
  merged.set(second, first.length)
  return merged
}

export function createAudioCaptureController(): AudioCaptureController {
  return new BrowserAudioCaptureController()
}

