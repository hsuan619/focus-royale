import { describe, it, expect } from 'vitest'
import { calcScore } from './scoring.js'

describe('calcScore', () => {
  it('10 min, 0 eliminated → 100', () => {
    expect(calcScore({ survivalSecs: 600, nEliminated: 0, nTotal: 10, alpha: 0.5 })).toBe(100)
  })

  it('10 min, all 10 eliminated → 150', () => {
    expect(calcScore({ survivalSecs: 600, nEliminated: 10, nTotal: 10, alpha: 0.5 })).toBe(150)
  })

  it('30s, 5/10 eliminated, alpha=1.0 → 7', () => {
    expect(calcScore({ survivalSecs: 30, nEliminated: 5, nTotal: 10, alpha: 1.0 })).toBe(7)
  })
})
