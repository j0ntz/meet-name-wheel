// Shared add-on state. Every participant holds a copy and the copy with the
// highest (rev, ts, by) wins, so all copies converge on the same state no
// matter which order updates arrive in or how many transports deliver them.

import { DEFAULT_SELECTED, ROSTER_NAMES, inRosterOrder } from './roster.js'

const RELAY = 'https://ntfy.sh'
const RETRY_MS = 3000

export function initialState() {
  return { selected: DEFAULT_SELECTED, spin: null, rev: 0, ts: 0, by: '' }
}

export function isNewer(a, b) {
  if (a.rev !== b.rev) return a.rev > b.rev
  if (a.ts !== b.ts) return a.ts > b.ts
  return a.by > b.by
}

// Untrusted input from the relay: keep only well-formed roster data.
export function sanitize(raw) {
  if (raw == null || typeof raw !== 'object') return undefined
  const { rev, ts, by } = raw
  if (!Number.isSafeInteger(rev) || !Number.isFinite(ts) || typeof by !== 'string') return undefined
  if (!Array.isArray(raw.selected)) return undefined
  const state = {
    selected: inRosterOrder(raw.selected.filter(name => ROSTER_NAMES.includes(name))),
    spin: null,
    rev,
    ts,
    by: by.slice(0, 40)
  }
  const spin = raw.spin
  if (spin != null && typeof spin === 'object') {
    const names = Array.isArray(spin.names) ? inRosterOrder(spin.names) : []
    if (
      typeof spin.id === 'string' &&
      Number.isSafeInteger(spin.seed) &&
      Number.isFinite(spin.at) &&
      Number.isSafeInteger(spin.rev) &&
      names.length > 0 &&
      names.length === spin.names.length
    ) {
      state.spin = { id: spin.id.slice(0, 40), seed: spin.seed >>> 0, at: spin.at, rev: spin.rev, names }
    }
  }
  return state
}

export async function topicFor(meetingKey) {
  const bytes = new TextEncoder().encode(`meet-name-wheel:${meetingKey}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return 'mnw-' + Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')
}

export function createClientId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')
}

// onState(state, { live }) fires whenever the winning state changes. `live`
// is false while replaying history, so old spins are shown without animating.
export function createStore({ clientId, onState, onStatus }) {
  let state = initialState()
  let topic
  let source
  let publishing = false
  let dirty = false
  const extraTransports = []

  function receive(raw, live) {
    const next = sanitize(raw)
    if (next == null || !isNewer(next, state)) return
    state = next
    onState(state, { live })
  }

  function update(patch) {
    state = { ...state, ...patch, rev: state.rev + 1, ts: Date.now(), by: clientId }
    onState(state, { live: true, local: true })
    for (const transport of extraTransports) transport.send(state)
    dirty = true
    flush()
    return state
  }

  // Sends only the newest state; quick successive changes coalesce into one
  // request, which keeps us inside the relay's rate limit.
  async function flush() {
    if (publishing || !dirty || topic == null) return
    publishing = true
    dirty = false
    const body = JSON.stringify(state)
    let failed = false
    try {
      const response = await fetch(`${RELAY}/${topic}`, { method: 'POST', body })
      if (!response.ok) throw new Error(`relay answered ${response.status}`)
      onStatus?.('synced')
    } catch (error) {
      failed = true
      dirty = true
      onStatus?.(`sync retrying (${error.message})`)
      setTimeout(flush, RETRY_MS)
    } finally {
      publishing = false
      if (dirty && !failed) flush()
    }
  }

  async function connect(meetingKey) {
    topic = await topicFor(meetingKey)
    let lastId
    try {
      const response = await fetch(`${RELAY}/${topic}/json?poll=1&since=all`)
      const text = await response.text()
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
        const event = JSON.parse(line)
        if (event.event !== 'message') continue
        lastId = event.id
        receive(parseMessage(event.message), false)
      }
    } catch (error) {
      onStatus?.(`history unavailable (${error.message})`)
    }
    const since = lastId != null ? `?since=${lastId}` : ''
    source = new EventSource(`${RELAY}/${topic}/sse${since}`)
    source.addEventListener('message', message => {
      try {
        const event = JSON.parse(message.data)
        if (event.event === 'message') receive(parseMessage(event.message), true)
      } catch (error) {}
    })
    source.addEventListener('open', () => onStatus?.('synced'))
    source.addEventListener('error', () => onStatus?.('reconnecting'))
    flush()
    return topic
  }

  // A second delivery path (Meet Co-Doing). Same merge rule, so duplicates are harmless.
  function addTransport(transport) {
    extraTransports.push(transport)
  }

  return {
    connect,
    update,
    addTransport,
    receive,
    get state() {
      return state
    }
  }
}

function parseMessage(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    return undefined
  }
}
