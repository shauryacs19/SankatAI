// Runs on the audio rendering thread. Copies the first input channel (128
// samples per render quantum) into ~2048-sample Float32 batches and posts them
// to the main thread, which downsamples to 16 kHz. Writes no output, so the
// node emits silence and the microphone is never played back.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(2048)
    this.len = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) {
      let i = 0
      while (i < channel.length) {
        const take = Math.min(channel.length - i, this.buf.length - this.len)
        this.buf.set(channel.subarray(i, i + take), this.len)
        this.len += take
        i += take
        if (this.len === this.buf.length) {
          this.port.postMessage(this.buf.slice(0))
          this.len = 0
        }
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
