// A short two-tone "click" synthesized with Web Audio, so there is no audio
// asset to ship and it plays on iOS because it starts inside the tap handler.
export function playUnlockSound() {
  if (typeof window === "undefined") return
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctx) return

  const ctx = new Ctx()
  const t0 = ctx.currentTime

  const click = (at: number, freq: number, dur: number, gain: number) => {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = "square"
    osc.frequency.value = freq
    amp.gain.setValueAtTime(0.0001, at)
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.004)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(amp).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  click(t0, 1800, 0.035, 0.25)
  click(t0 + 0.09, 900, 0.07, 0.35)

  setTimeout(() => void ctx.close(), 600)
}
