import { CLOUD_PROJECT_NUMBER } from './config.js'
import { animateSpin, createSession, drawWheel, encodeSpin, inMeet, newSeed, parseNames } from './wheel.js'

const DEFAULT_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank']
const MAX_NAMES = 100
const MAX_NAME_LENGTH = 40
const STORAGE_KEY = 'name-wheel-names'

const namesInput = document.getElementById('names')
const removeWinner = document.getElementById('removeWinner')
const canvas = document.getElementById('wheel')
const winnerText = document.getElementById('winner')
const spinButton = document.getElementById('spin')
const spinAllButton = document.getElementById('spinAll')
const statusText = document.getElementById('status')

const mainStageUrl = new URL('mainstage.html', window.location.href.split('?')[0]).href
let sidePanelClient
let activityStarted = false
let spinning = false

namesInput.value = loadNames().join('\n')
const currentNames = () =>
  parseNames(namesInput.value)
    .slice(0, MAX_NAMES)
    .map(name => name.slice(0, MAX_NAME_LENGTH))
const redraw = () => drawWheel(canvas, currentNames(), 0)
namesInput.addEventListener('input', () => {
  saveNames(namesInput.value)
  redraw()
})
window.addEventListener('resize', redraw)
redraw()

spinButton.addEventListener('click', () => spin(false))
spinAllButton.addEventListener('click', () => spin(true))

async function spin(everyone) {
  const names = currentNames()
  if (spinning || names.length === 0) return
  spinning = true
  setButtons()
  const seed = newSeed()
  winnerText.textContent = ''
  try {
    if (everyone) await shareSpin(names, seed)
    const winner = await animateSpin(canvas, names, seed)
    winnerText.textContent = `🎉 ${winner}`
    if (removeWinner.checked) {
      const remaining = names.filter((name, index) => index !== names.indexOf(winner))
      namesInput.value = remaining.join('\n')
      saveNames(namesInput.value)
    }
  } catch (error) {
    statusText.textContent = `Spin failed: ${error.message}`
  } finally {
    spinning = false
    setButtons()
  }
}

// The first shared spin starts the activity, which opens the main stage for the
// initiator and invites everyone else; joiners replay the spin from its seed.
// Later spins reach the initiator's main stage directly and update the starting
// state, so anyone joining afterwards sees the latest spin.
async function shareSpin(names, seed) {
  const additionalData = encodeSpin(names, seed)
  if (!activityStarted) {
    await sidePanelClient.startActivity({ mainStageUrl, additionalData })
    activityStarted = true
    statusText.textContent = 'Wheel is on the main stage. Participants can join from the activity invite.'
    return
  }
  await sidePanelClient.setActivityStartingState({ mainStageUrl, additionalData })
  await sidePanelClient.notifyMainStage(additionalData)
}

function setButtons() {
  spinButton.disabled = spinning
  spinAllButton.disabled = spinning || sidePanelClient == null
}

function loadNames() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved != null && saved.trim() !== '') return parseNames(saved)
  } catch (error) {}
  return DEFAULT_NAMES
}

function saveNames(text) {
  try {
    window.localStorage.setItem(STORAGE_KEY, text)
  } catch (error) {}
}

async function connect() {
  if (!inMeet()) {
    statusText.textContent = 'Preview mode: open this inside Google Meet to spin for everyone.'
    setButtons()
    return
  }
  try {
    const session = await createSession(CLOUD_PROJECT_NUMBER)
    sidePanelClient = await session.createSidePanelClient()
    const state = await sidePanelClient.getActivityStartingState().catch(() => undefined)
    activityStarted = state?.mainStageUrl != null && state.mainStageUrl !== ''
    statusText.textContent = 'Connected to Meet.'
  } catch (error) {
    statusText.textContent = `Meet connection failed: ${error.message}`
  }
  setButtons()
}

connect()
