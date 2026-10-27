import { CLOUD_PROJECT_NUMBER } from './config.js'
import { animateSpin, createSession, decodeSpin, drawWheel, inMeet } from './wheel.js'

const canvas = document.getElementById('wheel')
const winnerText = document.getElementById('winner')
const statusText = document.getElementById('status')

let names = []
let queue = Promise.resolve()

drawWheel(canvas, names, 0)
window.addEventListener('resize', () => drawWheel(canvas, names, 0))

// Spins run one after another so a quick re-spin never interrupts an animation.
function playSpin(spin) {
  if (spin == null || spin.names.length === 0) return
  queue = queue.then(async () => {
    names = spin.names
    winnerText.textContent = ''
    const winner = await animateSpin(canvas, spin.names, spin.seed)
    winnerText.textContent = `🎉 ${winner}`
  })
}

async function connect() {
  if (!inMeet()) {
    // Standalone preview: mainstage.html?preview=1#{"names":[...],"seed":123}
    statusText.textContent = 'Preview mode'
    playSpin(decodeSpin(decodeURIComponent(window.location.hash.slice(1))))
    return
  }
  try {
    const session = await createSession(CLOUD_PROJECT_NUMBER)
    const mainStageClient = await session.createMainStageClient()
    mainStageClient.on('frameToFrameMessage', message => playSpin(decodeSpin(message.payload)))
    const state = await mainStageClient.getActivityStartingState()
    playSpin(decodeSpin(state?.additionalData))
  } catch (error) {
    statusText.textContent = `Meet connection failed: ${error.message}`
  }
}

connect()
