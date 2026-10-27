# Name Wheel (Google Meet add-on)

A random name picker wheel built on the Google Meet add-ons web SDK.

- `sidepanel.html` and `mainstage.html`: the same wheel in Meet's side panel and main stage. Tap people to put them on or off the wheel, tap the wheel to spin. The first spin from the side panel opens the main stage for everyone.
- `sync.js`: shared state (selection and the last spin) over an ntfy.sh topic keyed by a hash of the meeting id, with Co-Doing as a second channel. Each spin carries a random seed, and every participant lands on the same winner.
- `roster.js`: the fixed list of people with their Slack avatars.
- `deployment.json`: the HTTP deployment manifest for the Google Workspace Marketplace SDK.
- `config.js`: the Google Cloud project number that owns the deployment.

## Winner sounds

Each winner plays `<lowercase name>.mp3` from the Edge content Space (`edgecontent`, region `nyc3`, folder `UI4/hudl/`), after the built-in fanfare. Only mp3 is used. A missing file plays the fanfare alone.

| Person | File |
|---|---|
| Paul | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/paul.mp3` |
| Jon | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/jon.mp3` |
| Matt | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/matt.mp3` |
| Jared | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/jared.mp3` |
| Cache | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/cache.mp3` |
| Fari | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/fari.mp3` |
| Daniel | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/daniel.mp3` |
| RJ | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/rj.mp3` |
| Shimmy | `https://nyc3.digitaloceanspaces.com/edgecontent/UI4/hudl/shimmy.mp3` |

Upload with public-read (without it the file returns 403 to everyone). A new upload replaces the old clip; browsers may cache it for a while.

Preview outside Meet: serve the folder and open `sidepanel.html?room=<name>`; tabs on the same room share state.
