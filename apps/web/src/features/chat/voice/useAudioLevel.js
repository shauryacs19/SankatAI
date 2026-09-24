// Voice-reactive level for the listening popup. Taps the SAME microphone
// source the Transcribe pipeline already uses (no second getUserMedia) with an
// AnalyserNode, smooths the RMS, and writes `--level` (0..1) straight onto an
// element's style from requestAnimationFrame, so there are no React renders at
// 60 fps. React state changes only when `isSpeaking` flips.
import { useEffect, useState } from 'react'
import { createLevelMeter, floatRms } from '@sankatai/shared/voice'

// Plain function (testable without React). Returns a cleanup that stops the
// frame loop and disconnects the analyser.
export function startLevelMeter({
  ctx, source, onLevel, onSpeaking,
  raf = requestAnimationFrame, caf = cancelAnimationFrame, now = () => performance.now(),
}) {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  const meter = createLevelMeter()
  let speaking = false
  let frame = raf(function tick() {
    analyser.getFloatTimeDomainData(buf)
    const { level, speaking: s } = meter.update(floatRms(buf), now())
    onLevel(Math.min(1, level * 8))
    if (s !== speaking) { speaking = s; onSpeaking(s) }
    frame = raf(tick)
  })
  return () => {
    caf(frame)
    try { source.disconnect(analyser) } catch { /* source already torn down */ }
    analyser.disconnect()
  }
}

// mic: { ctx, source } while recording, else null. targetRef: element that
// receives `--level`.
export function useAudioLevel(mic, targetRef) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  useEffect(() => {
    if (!mic) return undefined
    const el = targetRef.current
    const stop = startLevelMeter({
      ctx: mic.ctx,
      source: mic.source,
      onLevel: (l) => el?.style.setProperty('--level', String(l)),
      onSpeaking: setIsSpeaking,
    })
    return () => {
      stop()
      setIsSpeaking(false)
      el?.style.setProperty('--level', '0')
    }
  }, [mic, targetRef])
  return { isSpeaking: Boolean(mic) && isSpeaking }
}
