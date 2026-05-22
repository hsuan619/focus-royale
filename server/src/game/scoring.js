function calcScore({ survivalSecs, nEliminated, nTotal, alpha }) {
  const t = survivalSecs / 60
  const B = 10
  const base = Math.floor(t * B)
  const multiplier = 1 + (nEliminated / nTotal) * alpha
  return Math.floor(base * multiplier)
}

module.exports = { calcScore }
