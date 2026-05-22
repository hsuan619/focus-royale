const SCREENS = ['login', 'lobby', 'countdown', 'game', 'result']

const els = {}
SCREENS.forEach(name => {
  els[name] = document.getElementById(`screen-${name}`)
})

export function showScreen(name) {
  SCREENS.forEach(n => els[n].classList.add('hidden'))
  if (els[name]) els[name].classList.remove('hidden')
}
