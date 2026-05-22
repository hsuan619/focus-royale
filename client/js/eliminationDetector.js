class EliminationDetector {
  constructor({ onEliminated, onWarning, onWarningCancelled }) {
    this.onEliminated = onEliminated
    this.onWarning = onWarning
    this.onWarningCancelled = onWarningCancelled
    this.blurTimer = null
    this.eliminated = false
    this._onVisibility = this._onVisibility.bind(this)
    this._onBlur = this._onBlur.bind(this)
    this._onFocus = this._onFocus.bind(this)
  }

  start() {
    document.addEventListener('visibilitychange', this._onVisibility)
    window.addEventListener('blur', this._onBlur)
    window.addEventListener('focus', this._onFocus)
  }

  stop() {
    document.removeEventListener('visibilitychange', this._onVisibility)
    window.removeEventListener('blur', this._onBlur)
    window.removeEventListener('focus', this._onFocus)
    clearTimeout(this.blurTimer)
    this.blurTimer = null
  }

  _onVisibility() {
    if (document.visibilityState === 'hidden') {
      clearTimeout(this.blurTimer)
      this.blurTimer = null
      this._eliminate()
    }
  }

  _onBlur() {
    if (this.eliminated) return
    this.blurTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') this._eliminate()
    }, 30000)
    this.onWarning(30)
  }

  _onFocus() {
    if (this.blurTimer) {
      clearTimeout(this.blurTimer)
      this.blurTimer = null
      this.onWarningCancelled()
    }
  }

  _eliminate() {
    if (this.eliminated) return
    this.eliminated = true
    this.stop()
    this.onEliminated()
  }
}

export default EliminationDetector
