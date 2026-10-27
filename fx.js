// Sound and celebration effects. Sound is per person (each viewer can mute
// their own speakers); everything visual is driven by the shared state.

import { winnerSoundUrl } from './roster.js'

const MUTE_KEY = 'name-wheel-muted'
const FANFARE = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6

let audio
let muted = readMuted()
let blocked = false
let onBlockedChange

function context() {
  if (audio == null) {
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)()
    } catch (error) {
      return undefined
    }
    audio.addEventListener('statechange', () => setBlocked(audio.state !== 'running'))
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {})
  return audio
}

function setBlocked(value) {
  if (blocked === value) return
  blocked = value
  onBlockedChange?.(blocked)
}

// True after a sound was dropped because this frame has no user activation
// yet (a spin started by someone else, before this viewer touched the panel).
export function isAudioBlocked() {
  return blocked
}

export function onAudioBlocked(callback) {
  onBlockedChange = callback
}

// Browsers keep audio locked until the viewer interacts with this frame.
export function unlockAudioOnGesture() {
  const unlock = () => context()
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch (error) {}
}

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch (error) {
    return false
  }
}

// The context, or undefined (and flagged) while the browser holds it suspended.
function audible() {
  const ctx = context()
  if (ctx == null) return undefined
  if (ctx.state !== 'running') {
    setBlocked(true)
    return undefined
  }
  return ctx
}

function tone(frequency, duration, type = 'sine', gain = 0.25, delay = 0) {
  if (muted) return
  const ctx = audible()
  if (ctx == null) return
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(gain, start + 0.005)
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playTick() {
  tone(1400, 0.04, 'triangle', 0.18)
}

export function playSpinStart() {
  if (muted) return
  const ctx = audible()
  if (ctx == null) return
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  oscillator.type = 'sawtooth'
  oscillator.frequency.setValueAtTime(180, ctx.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(720, ctx.currentTime + 0.35)
  envelope.gain.setValueAtTime(0, ctx.currentTime)
  envelope.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05)
  envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
  oscillator.connect(envelope)
  envelope.connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.45)
}

function playFanfare() {
  FANFARE.forEach((frequency, i) => tone(frequency, 0.35, 'sine', 0.22, i * 0.11))
  tone(1046.5, 0.8, 'triangle', 0.12, FANFARE.length * 0.11)
}

// The winner's own clip when one exists, plus a fanfare either way.
export function playWinner(name) {
  if (muted) return
  playFanfare()
  const clip = new Audio(winnerSoundUrl(name))
  clip.volume = 0.8
  setTimeout(
    () =>
      clip.play().catch(error => {
        if (error.name === 'NotAllowedError') setBlocked(true)
      }),
    450
  )
}

// Confetti burst over the whole frame.
export function confetti(canvas, durationMs = 3500) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const colors = ['#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#a142f4', '#f538a0']
  const pieces = Array.from({ length: Math.round(Math.min(220, width / 2)) }, () => ({
    x: width / 2 + (Math.random() - 0.5) * width * 0.2,
    y: height * 0.45,
    vx: (Math.random() - 0.5) * width * 0.025,
    vy: -Math.random() * height * 0.03 - height * 0.01,
    size: 4 + Math.random() * 6,
    spin: Math.random() * Math.PI,
    spinSpeed: (Math.random() - 0.5) * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)]
  }))
  const start = performance.now()
  const frame = now => {
    const elapsed = now - start
    ctx.clearRect(0, 0, width, height)
    if (elapsed > durationMs) return
    const fade = Math.min(1, (durationMs - elapsed) / 600)
    for (const piece of pieces) {
      piece.vy += height * 0.0009
      piece.vx *= 0.99
      piece.x += piece.vx
      piece.y += piece.vy
      piece.spin += piece.spinSpeed
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(piece.x, piece.y)
      ctx.rotate(piece.spin)
      ctx.fillStyle = piece.color
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
      ctx.restore()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
