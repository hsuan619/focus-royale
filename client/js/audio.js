// Place audio files at client/audio/rain.mp3 and client/audio/fire.mp3
// (Download free ambient sounds from freesound.org)

let currentSound = null
let howlLib = null

async function getHowl() {
  if (howlLib) return howlLib
  try {
    const m = await import('https://esm.sh/howler')
    howlLib = m.Howl
  } catch {}
  return howlLib
}

const soundCache = {}

async function loadSound(type) {
  if (soundCache[type]) return soundCache[type]
  const Howl = await getHowl()
  if (!Howl) return null
  const src = type === 'rain' ? '/audio/rain.mp3' : '/audio/fire.mp3'
  soundCache[type] = new Howl({ src: [src], loop: true, volume: 0 })
  return soundCache[type]
}

export async function playAmbient(type) {
  if (currentSound) currentSound.fade(0.35, 0, 800)
  const sound = await loadSound(type)
  if (!sound) return
  currentSound = sound
  sound.play()
  sound.fade(0, 0.35, 800)
}

export function stopAmbient() {
  if (currentSound) {
    currentSound.fade(0.35, 0, 600)
    currentSound = null
  }
}
