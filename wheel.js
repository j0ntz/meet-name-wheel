// Name picker wheel: drawing, seeded spin math, and the Meet add-on session glue
// shared by the side panel and the main stage.

const COLORS = ['#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#a142f4', '#f538a0', '#12b5cb', '#fa7b17']
const SPIN_MS = 5000

// Deterministic PRNG so every participant who receives the same seed lands on
// the same name without any backend.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

export function parseNames(text) {
  return text
    .split(/[\n,]/)
    .map(name => name.trim())
    .filter(name => name !== '')
}

// The winner and the final rotation both come from the seed. The pointer sits at
// the top (-90deg), so the wheel rotates until the winner's segment is under it.
export function planSpin(seed, count) {
  const rand = mulberry32(seed)
  const winner = Math.floor(rand() * count)
  const slice = (Math.PI * 2) / count
  const jitter = (0.15 + rand() * 0.7) * slice
  const turns = 6 + Math.floor(rand() * 3)
  const landing = -Math.PI / 2 - (winner * slice + jitter)
  const rotation = turns * Math.PI * 2 + normalize(landing)
  return { winner, rotation }
}

function normalize(angle) {
  const full = Math.PI * 2
  return ((angle % full) + full) % full
}

export function drawWheel(canvas, names, rotation) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const size = Math.min(canvas.clientWidth, canvas.clientHeight)
  if (canvas.width !== size * dpr) {
    canvas.width = size * dpr
    canvas.height = size * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const r = size / 2
  ctx.clearRect(0, 0, size, size)

  if (names.length === 0) {
    ctx.fillStyle = '#e8eaed'
    ctx.beginPath()
    ctx.arc(r, r, r - 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5f6368'
    ctx.font = `${Math.round(size / 18)}px "Google Sans", Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Add some names', r, r)
    return
  }

  const slice = (Math.PI * 2) / names.length
  const fontPx = Math.max(10, Math.min(size / 16, (size * 2.4) / names.length))
  for (let i = 0; i < names.length; i++) {
    const start = rotation + i * slice
    ctx.beginPath()
    ctx.moveTo(r, r)
    ctx.arc(r, r, r - 12, start, start + slice)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]
    // Avoid two neighbors sharing a color when the count wraps the palette.
    if (i === names.length - 1 && i % COLORS.length === 0 && i > 0) ctx.fillStyle = COLORS[3]
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.save()
    ctx.translate(r, r)
    ctx.rotate(start + slice / 2)
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${fontPx}px "Google Sans", Roboto, sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(truncate(names[i], 18), r - 28, 0, r - 60)
    ctx.restore()
  }

  // Hub
  ctx.beginPath()
  ctx.arc(r, r, size / 14, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.strokeStyle = '#dadce0'
  ctx.lineWidth = 3
  ctx.stroke()

  // Pointer at the top
  ctx.beginPath()
  ctx.moveTo(r - size / 28, 2)
  ctx.lineTo(r + size / 28, 2)
  ctx.lineTo(r, size / 11)
  ctx.closePath()
  ctx.fillStyle = '#202124'
  ctx.fill()
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

// Animates one spin and resolves with the winning name.
export function animateSpin(canvas, names, seed) {
  const { winner, rotation } = planSpin(seed, names.length)
  const startTime = performance.now()
  return new Promise(resolve => {
    const frame = now => {
      const t = Math.min(1, (now - startTime) / SPIN_MS)
      const eased = 1 - Math.pow(1 - t, 4)
      drawWheel(canvas, names, rotation * eased)
      if (t < 1) requestAnimationFrame(frame)
      else resolve(names[winner])
    }
    requestAnimationFrame(frame)
  })
}

// Meet passes meet_sdk in the iframe URL; without it the page is running
// standalone (local preview), and the SDK would throw.
export function inMeet() {
  return new URLSearchParams(window.location.search).has('meet_sdk')
}

export async function createSession(cloudProjectNumber) {
  return await window.meet.addon.createAddonSession({ cloudProjectNumber })
}

export function encodeSpin(names, seed) {
  return JSON.stringify({ names, seed })
}

export function decodeSpin(text) {
  if (text == null || text === '') return undefined
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed.names) || typeof parsed.seed !== 'number') return undefined
    return { names: parsed.names.map(String), seed: parsed.seed }
  } catch (error) {
    return undefined
  }
}
