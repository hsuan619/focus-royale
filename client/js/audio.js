let audioCtx = null
let currentNodes = null

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function createNoise(ctx, type) {
  const bufferSize = ctx.sampleRate * 4
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  if (type === 'rain') {
    // Brown noise (low rumble, rain-like)
    let last = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      data[i] = (last + 0.02 * white) / 1.02
      last = data[i]
      data[i] *= 3.5
    }
  } else {
    // Pink-ish noise for fire (more mid-range crackle)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + white * 0.5362) * 0.11
    }
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

function stopNodes() {
  if (!currentNodes) return
  try {
    currentNodes.gain.gain.setTargetAtTime(0, currentNodes.ctx.currentTime, 0.2)
    setTimeout(() => { try { currentNodes.source.stop() } catch {} }, 600)
  } catch {}
  currentNodes = null
}

export function playAmbient(type) {
  stopNodes()
  const ctx = getCtx()
  const source = createNoise(ctx, type)

  const filter = ctx.createBiquadFilter()
  if (type === 'rain') {
    filter.type = 'lowpass'
    filter.frequency.value = 1200
  } else {
    filter.type = 'bandpass'
    filter.frequency.value = 600
    filter.Q.value = 0.5
  }

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.setTargetAtTime(0.4, ctx.currentTime, 0.5)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start()

  currentNodes = { source, gain, ctx }
}

export function stopAmbient() {
  stopNodes()
}
