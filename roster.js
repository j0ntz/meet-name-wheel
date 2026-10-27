// Participants offered on the wheel. Avatars and winner sounds come from the
// hudl Plinko game (Slack profile images, per-name clips on the Edge content space).

const SOUND_BASE = 'https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl'

export const ROSTER = [
  { name: 'Paul', avatar: 'https://ca.slack-edge.com/T08U86VNU-U08U8DPR9-03d672ef101c-512' },
  { name: 'Jon', avatar: 'https://ca.slack-edge.com/T08U86VNU-U02E91B4U66-1b9a90423a90-512' },
  { name: 'Matt', avatar: 'https://ca.slack-edge.com/T08U86VNU-U8U5ANCF8-3bfdde800605-512' },
  { name: 'Jared', avatar: 'https://ca.slack-edge.com/T08U86VNU-U075CGCJP8V-3dce62562a1a-512' },
  { name: 'Cache', avatar: 'https://ca.slack-edge.com/T08U86VNU-UJTV9CALF-1f9a6157e910-512' },
  { name: 'Fari', avatar: 'https://ca.slack-edge.com/T08U86VNU-U04T9PY41P1-d15c814fd4e2-512' },
  { name: 'Daniel', avatar: 'https://ca.slack-edge.com/T08U86VNU-U04UZ5RR5RU-6b08814bab5f-512' },
  { name: 'RJ', avatar: 'https://ca.slack-edge.com/T08U86VNU-U0990R1S6-b47fdae676a6-192' }
]

export const ROSTER_NAMES = ROSTER.map(person => person.name)
export const DEFAULT_SELECTED = ROSTER_NAMES.filter(name => name !== 'Paul')

export function winnerSoundUrl(name) {
  return `${SOUND_BASE}/${name.toLowerCase()}.wav`
}

// Keeps a list of names in roster order and drops anything not on the roster.
export function inRosterOrder(names) {
  const wanted = new Set(names)
  return ROSTER_NAMES.filter(name => wanted.has(name))
}

const images = new Map()

// Avatars load once; onLoad lets the caller redraw when each one arrives.
export function avatarImage(name, onLoad) {
  let image = images.get(name)
  if (image == null) {
    const person = ROSTER.find(entry => entry.name === name)
    image = new Image()
    image.decoding = 'async'
    image.addEventListener('load', () => onLoad?.())
    if (person != null) image.src = person.avatar
    images.set(name, image)
  }
  return image.complete && image.naturalWidth > 0 ? image : undefined
}
