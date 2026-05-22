import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EliminationDetector from './eliminationDetector.js'

function makeDetector(overrides = {}) {
  return new EliminationDetector({
    onEliminated: vi.fn(),
    onWarning: vi.fn(),
    onWarningCancelled: vi.fn(),
    ...overrides,
  })
}

function fireVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EliminationDetector', () => {
  it('visibilitychange hidden → onEliminated called immediately', () => {
    const d = makeDetector()
    d.start()
    fireVisibility('hidden')
    expect(d.onEliminated).toHaveBeenCalledOnce()
  })

  it('blur → onEliminated called after 5 seconds', () => {
    const d = makeDetector()
    d.start()
    window.dispatchEvent(new Event('blur'))
    expect(d.onEliminated).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(d.onEliminated).toHaveBeenCalledOnce()
  })

  it('blur then immediate focus → onEliminated not called, onWarningCancelled called', () => {
    const d = makeDetector()
    d.start()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(5000)
    expect(d.onEliminated).not.toHaveBeenCalled()
    expect(d.onWarningCancelled).toHaveBeenCalledOnce()
  })

  it('blur mid-timer then visibilitychange hidden → onEliminated called only once', () => {
    const d = makeDetector()
    d.start()
    window.dispatchEvent(new Event('blur'))
    vi.advanceTimersByTime(2000)
    fireVisibility('hidden')
    vi.advanceTimersByTime(5000)
    expect(d.onEliminated).toHaveBeenCalledOnce()
  })
})
