# Name Wheel (Google Meet add-on)

A random name picker wheel built on the Google Meet add-ons web SDK.

- `sidepanel.html`: enter names, spin locally, or "Spin for everyone" to start a Meet activity.
- `mainstage.html`: the shared wheel. Each spin carries the names and a random seed in the activity starting state, so every participant who joins replays the same spin and lands on the same winner, without a backend.
- `deployment.json`: the HTTP deployment manifest for the Google Workspace Marketplace SDK.
- `config.js`: the Google Cloud project number that owns the deployment.

Limits of SDK 1.1: there is no participant list API (names are typed in), and later spins reach the initiator's own main stage plus anyone who joins afterwards. `supportsScreenSharing` lets the initiator share the stage with everyone else.

Preview outside Meet: serve the folder and open `sidepanel.html`, or `mainstage.html#{"names":["A","B"],"seed":1}`.
