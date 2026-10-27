// Name picker wheel: drawing, seeded spin math, and the Meet add-on session glue
// shared by the side panel and the main stage.

import { avatarImage } from './roster.js'

const COLORS = ['#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#a142f4', '#f538a0', '#12b5cb', '#fa7b17']
export const SPIN_MS = 6000

// Deterministic PRNG so every participant who receives the same seed lands on
// the same name.
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

// Index of the segment under the top pointer at a given rotation.
export function segmentAtPointer(rotation, count) {
  const slice = (Math.PI * 2) / count
  return Math.floor(normalize(-Math.PI / 2 - rotation) / slice) % count
}

// Largest avatar circle that fits inside one slice, between the hub and the rim.
export function avatarSlot(radius, hubRadius, count) {
  if (count === 1) return { distance: 0, size: radius * 0.55 }
  const half = Math.sin(Math.PI / count)
  const size = Math.min((radius - hubRadius) / 2, (radius * half) / (1 + half)) * 0.88
  return { distance: radius - size - radius * 0.06, size }
}

export function drawWheel(canvas, names, rotation, options = {}) {
  const { highlight, onImage } = options
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const size = Math.min(canvas.clientWidth, canvas.clientHeight)
  if (canvas.width !== size * dpr) {
    canvas.width = size * dpr
    canvas.height = size * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const center = size / 2
  const r = center - 12
  const hub = size / 14
  ctx.clearRect(0, 0, size, size)

  if (names.length === 0) {
    ctx.fillStyle = '#e8eaed'
    ctx.beginPath()
    ctx.arc(center, center, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5f6368'
    ctx.font = `${Math.round(size / 18)}px "Google Sans", Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Pick some people', center, center)
    return
  }

  const count = names.length
  const slice = (Math.PI * 2) / count
  const slot = avatarSlot(r, hub, count)
  for (let i = 0; i < count; i++) {
    const start = rotation + i * slice
    ctx.beginPath()
    ctx.moveTo(center, center)
    ctx.arc(center, center, r, start, start + slice)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]
    // Avoid two neighbors sharing a color when the count wraps the palette.
    if (i === count - 1 && i % COLORS.length === 0 && i > 0) ctx.fillStyle = COLORS[3]
    if (highlight != null && highlight !== i) ctx.globalAlpha = 0.45
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.save()
    ctx.translate(center, center)
    ctx.rotate(count === 1 ? -Math.PI / 2 : start + slice / 2)
    drawAvatar(ctx, names[i], slot.distance, 0, slot.size, onImage, highlight === i)
    if (count > 1) {
      const textEnd = slot.distance - slot.size - 4
      const room = textEnd - hub - 4
      const fontPx = Math.max(9, Math.min(size / 22, (r * slice) / 3, room / 3))
      ctx.fillStyle = '#fff'
      ctx.font = `600 ${fontPx}px "Google Sans", Roboto, sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      if (room > fontPx * 1.5) ctx.fillText(names[i], textEnd, 0, room)
    }
    ctx.restore()
  }

  if (count === 1) {
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${Math.round(size / 14)}px "Google Sans", Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(names[0], center, center + slot.size + size / 12)
  } else {
    ctx.beginPath()
    ctx.arc(center, center, hub, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#dadce0'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // Pointer at the top
  ctx.beginPath()
  ctx.moveTo(center - size / 28, 2)
  ctx.lineTo(center + size / 28, 2)
  ctx.lineTo(center, size / 11)
  ctx.closePath()
  ctx.fillStyle = '#202124'
  ctx.fill()
}

// Circular avatar (or initial while the image loads). The head points at the
// rim, so whoever sits under the pointer is upright.
function drawAvatar(ctx, name, x, y, radius, onImage, glow) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill()
  const image = avatarImage(name, onImage)
  if (image != null) {
    ctx.clip()
    ctx.translate(x, y)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(image, -radius, -radius, radius * 2, radius * 2)
  } else {
    ctx.fillStyle = '#5f6368'
    ctx.font = `600 ${Math.round(radius)}px "Google Sans", Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.slice(0, 1), x, y)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.strokeStyle = glow ? '#fbbc04' : '#fff'
  ctx.lineWidth = glow ? 5 : 3
  ctx.stroke()
}

// Animates one spin from `offsetMs` into it. Returns { done, cancel }; done
// resolves with the winning index (or undefined when cancelled).
export function animateSpin(canvas, names, seed, { offsetMs = 0, onTick, onImage } = {}) {
  const { winner, rotation } = planSpin(seed, names.length)
  const startTime = performance.now() - offsetMs
  let cancelled = false
  let lastSegment
  let finished = false
  const done = new Promise(resolve => {
    // Browsers pause animation frames in hidden tabs; the timer still ends the
    // spin on time there, so the winner shows up with everyone else's.
    const fallback = setTimeout(() => frame(performance.now()), SPIN_MS - offsetMs + 100)
    const frame = now => {
      if (finished) return
      if (cancelled) {
        finished = true
        clearTimeout(fallback)
        return resolve(undefined)
      }
      const t = Math.min(1, (now - startTime) / SPIN_MS)
      const eased = 1 - Math.pow(1 - t, 4)
      const angle = rotation * eased
      drawWheel(canvas, names, angle, { onImage })
      const segment = segmentAtPointer(angle, names.length)
      if (lastSegment != null && segment !== lastSegment) onTick?.()
      lastSegment = segment
      if (t < 1) return requestAnimationFrame(frame)
      finished = true
      clearTimeout(fallback)
      resolve(winner)
    }
    requestAnimationFrame(frame)
  })
  return { done, cancel: () => (cancelled = true), winner, rotation }
}

// Meet passes meet_sdk in the iframe URL; without it the page is running
// standalone (local preview), and the SDK would throw.
export function inMeet() {
  return new URLSearchParams(window.location.search).has('meet_sdk')
}

export async function createSession(cloudProjectNumber) {
  return await window.meet.addon.createAddonSession({ cloudProjectNumber })
}
