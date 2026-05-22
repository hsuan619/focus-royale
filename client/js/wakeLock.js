let wakeLockRef = null

export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockRef = await navigator.wakeLock.request('screen')
      wakeLockRef.addEventListener('release', () => { wakeLockRef = null })
      return
    } catch {}
  }
  // Fallback: noSleep.js (silent video loop)
  try {
    const { default: NoSleep } = await import('https://esm.sh/nosleep.js')
    const noSleep = new NoSleep()
    document.addEventListener('click', () => noSleep.enable(), { once: true })
  } catch {}
}

export async function releaseWakeLock() {
  if (wakeLockRef) {
    await wakeLockRef.release()
    wakeLockRef = null
  }
}
