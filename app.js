// One controller for both Meet surfaces. Everything on screen is rendered from
// the shared store, so every participant sees the same selection, spin, and
// winner. Sound is always on.

import { CLOUD_PROJECT_NUMBER } from './config.js'
import { confetti, playSpinStart, playTick, playWinner, unlockAudioOnGesture } from './fx.js'
import { ROSTER, inRosterOrder } from './roster.js'
import { createClientId, createStore } from './sync.js'
import { SPIN_MS, animateSpin, createSession, drawWheel, inMeet, newSeed, planSpin } from './wheel.js'

const FRESH_SPIN_MS = 30000
const CELEBRATE_MS = 5000

const surface = document.body.dataset.surface
const peopleList = document.getElementById('people')
const spinTarget = document.getElementById('spin')
const statusText = document.getElementById('status')
const winnerText = document.getElementById('winner')
const canvas = document.getElementById('wheel')
const confettiCanvas = document.getElementById('confetti')
const celebration = document.getElementById('celebration')

const mainStageUrl = new URL('mainstage.html', window.location.href.split('?')[0]).href
let sidePanelClient
let activityStarted = false
let animation
let shownSpinId
let celebrationTimer
let syncStatus = 'connecting'
let meetStatus = ''

const store = createStore({
  clientId: createClientId(),
  onState: render,
  onStatus: status => {
    syncStatus = status
    showStatus()
  }
})

const buttons = new Map()
for (const person of ROSTER) {
  const button = document.createElement('button')
  button.className = 'person'
  button.type = 'button'
  button.setAttribute('aria-pressed', 'false')
  const image = document.createElement('img')
  image.src = person.avatar
  image.alt = ''
  const label = document.createElement('span')
  label.textContent = person.name
  button.append(image, label)
  button.addEventListener('click', () => togglePerson(person.name))
  peopleList.append(button)
  buttons.set(person.name, button)
}

// The whole wheel is the spin control.
spinTarget.addEventListener('click', spin)
spinTarget.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  spin()
})
window.addEventListener('resize', () => drawIdle())
unlockAudioOnGesture()
render(store.state, { live: false })

function togglePerson(name) {
  if (animation != null) return
  const selected = new Set(store.state.selected)
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
  store.update({ selected: inRosterOrder([...selected]) })
}

function spin() {
  const state = store.state
  const names = state.selected
  if (animation != null || names.length === 0) return
  const seed = newSeed()
  store.update({ spin: { id: crypto.randomUUID(), seed, at: Date.now(), rev: state.rev + 1, names } })
  startActivity()
}

// The first spin from the side panel starts the Meet activity, which opens the
// main stage for the spinner and invites everyone else to join it.
async function startActivity() {
  if (sidePanelClient == null || activityStarted) return
  activityStarted = true
  try {
    await sidePanelClient.startActivity({ mainStageUrl })
    meetStatus = ''
  } catch (error) {
    activityStarted = false
    meetStatus = `Could not start the shared activity: ${error.message}`
  }
  showStatus()
}

function render(state, { live }) {
  const spinState = state.spin
  if (spinState != null && spinState.id !== shownSpinId) {
    shownSpinId = spinState.id
    const fresh = live && Math.abs(Date.now() - spinState.at) < FRESH_SPIN_MS
    if (fresh) playSpin(spinState)
    else cancelAnimation()
  }
  renderPeople()
  if (animation == null) drawIdle()
}

function renderPeople() {
  const state = store.state
  // While a spin plays, show who is on the wheel, even if a selection change
  // arrives before it stops.
  const selected = new Set(animation != null ? animation.names : state.selected)
  for (const [name, button] of buttons) {
    const on = selected.has(name)
    button.classList.toggle('selected', on)
    button.setAttribute('aria-pressed', String(on))
    button.disabled = animation != null
  }
  const canSpin = animation == null && state.selected.length > 0
  spinTarget.classList.toggle('disabled', !canSpin)
  spinTarget.setAttribute('aria-disabled', String(!canSpin))
}

// At rest the wheel shows the last spin's result until anyone changes the
// selection, then the current selection.
function drawIdle() {
  const state = store.state
  const spinState = state.spin
  if (spinState != null && spinState.rev === state.rev) {
    const { winner, rotation } = planSpin(spinState.seed, spinState.names.length)
    drawWheel(canvas, spinState.names, rotation, { highlight: winner, onImage: drawIdle })
  } else {
    drawWheel(canvas, state.selected, 0, { onImage: drawIdle })
  }
}

function playSpin(spinState) {
  cancelAnimation()
  hideCelebration()
  winnerText.textContent = ''
  const names = spinState.names
  // A late arrival joins the spin where everyone else is, not from the start.
  const offsetMs = Math.max(0, Math.min(Date.now() - spinState.at, SPIN_MS))
  const run = animateSpin(canvas, names, spinState.seed, { offsetMs, onTick: playTick })
  animation = { ...run, names }
  renderPeople()
  playSpinStart()
  run.done.then(winner => {
    if (animation?.done !== run.done) return
    animation = undefined
    if (winner == null) return
    const name = names[winner]
    winnerText.textContent = `🎉 ${name}`
    renderPeople()
    drawIdle()
    celebrate(name)
  })
}

function cancelAnimation() {
  if (animation == null) return
  animation.cancel()
  animation = undefined
}

function celebrate(name) {
  const person = ROSTER.find(entry => entry.name === name)
  celebration.querySelector('img').src = person?.avatar ?? ''
  celebration.querySelector('.name').textContent = name
  celebration.hidden = false
  celebration.classList.remove('show')
  void celebration.offsetWidth
  celebration.classList.add('show')
  confetti(confettiCanvas)
  playWinner(name)
  clearTimeout(celebrationTimer)
  celebrationTimer = setTimeout(hideCelebration, CELEBRATE_MS)
}

function hideCelebration() {
  clearTimeout(celebrationTimer)
  celebration.classList.remove('show')
  celebration.hidden = true
}

// The status line stays empty while things work and only reports problems.
function showStatus() {
  const sync = syncStatus === 'synced' || syncStatus === 'connecting' ? '' : `Sync: ${syncStatus}.`
  statusText.textContent = [sync, meetStatus].filter(text => text !== '').join(' ')
}

async function connect() {
  if (!inMeet()) {
    // Standalone preview: ?room=<name> shares state between local tabs.
    const room = new URLSearchParams(window.location.search).get('room') ?? 'preview'
    await store.connect(`preview:${room}`)
    showStatus()
    return
  }
  try {
    const session = await createSession(CLOUD_PROJECT_NUMBER)
    const client = surface === 'mainstage' ? await session.createMainStageClient() : await session.createSidePanelClient()
    if (surface !== 'mainstage') {
      sidePanelClient = client
      const starting = await client.getActivityStartingState().catch(() => undefined)
      activityStarted = starting?.mainStageUrl != null && starting.mainStageUrl !== ''
    }
    const info = await client.getMeetingInfo()
    const meetingKey = info.meetingId || info.meetingCode
    if (meetingKey == null || meetingKey === '') throw new Error('Meet returned no meeting id')
    meetStatus = ''
    await store.connect(`meet:${meetingKey}`)
    attachCoDoing(session)
  } catch (error) {
    meetStatus = `Meet connection failed: ${error.message}`
  }
  showStatus()
}

// Meet's Co-Doing API is early access; when this project has it, state also
// flows through Meet itself. When it does not, the relay alone carries it.
async function attachCoDoing(session) {
  try {
    const coDoing = await Promise.race([
      session.createCoDoingClient({
        activityTitle: 'Name Wheel',
        onCoDoingStateChanged: update => {
          try {
            store.receive(JSON.parse(new TextDecoder().decode(update.bytes)), true)
          } catch (error) {}
        }
      }),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    store.addTransport({
      send: state => coDoing.broadcastStateUpdate({ bytes: new TextEncoder().encode(JSON.stringify(state)) })
    })
  } catch (error) {}
}

connect()
