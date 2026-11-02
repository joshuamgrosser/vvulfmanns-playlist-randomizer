# VVulfmann's Playlist Randomizer

A small Foundry VTT v14 module that adds **Randomize** beside **Repeat** on playlist sounds.

Randomize is Repeat with a random silent gap between plays: a church bell, a raven, distant thunder
or creaking timbers that drop in now and then instead of looping nonstop. It works in every playlist
mode and through Foundry's own controls. Press Play and it starts, press Stop and it ends, and its
button shows Stop the whole time, just like a repeating sound.

## How to use it

In the Playlists sidebar, every sound has a **dice** icon right beside its **repeat** icon. At most
one is lit:

| Icons | The sound |
| --- | --- |
| Repeat lit | Loops, as in core |
| Dice lit | Randomized: plays, waits a random gap, plays again |
| Both dim | Plays once |

Click a dim icon to switch to it, or the lit one to make the sound a one-shot. The same choice is in
the sound's edit window as a **Playback** row (Once, Repeat, Randomize), with a **Frequency** for
Randomize:

| Frequency | Gap between plays |
| --- | --- |
| Often | 5 to 15 seconds |
| Sometimes (default) | 15 to 30 seconds |
| Seldom | 1 to 2 minutes |

These are the default ranges. You can change them in **Settings** (see below).

A sound keeps its Frequency when you switch Randomize off, so switching it back on restores it.

## Settings

In **Game Settings → Configure Settings → VVulfmann's Playlist Randomizer** (Gamemaster only, for the
whole world):

| Setting | Default | What it does |
| --- | --- | --- |
| Default Frequency | Sometimes | The Frequency a sound gets when it's first switched to Randomize. |
| Often: Shortest / Longest Gap | 5 s / 15 s | The range a gap is drawn from at Often. |
| Sometimes: Shortest / Longest Gap | 15 s / 30 s | The same for Sometimes. |
| Seldom: Shortest / Longest Gap | 60 s / 120 s | The same for Seldom. |

- Each gap is a slider from 1 second to 5 minutes (300 s).
- If a shortest gap is set above its longest, the two swap.
- Changes take effect at once, with no reload: gaps already waiting at that Frequency are redrawn from
  the new range.
- A sound saves the Default Frequency as its own when it's switched to Randomize, so changing the
  default later doesn't move sounds you've already set up. Sounds randomized before v0.2.0 without
  a Frequency of their own follow the default.

## Behaviour

| You do this | What happens |
| --- | --- |
| Press Play on a randomized sound | It plays now, then again after each random gap, until you press Stop. |
| Press Stop | Sound and randomizing both stop, mid-play or mid-gap. |
| Play All in a Simultaneous playlist, or activate its scene | Loops and one-shots start at once. Randomized sounds start with a random gap, so they don't all go off together. |
| A Sequential or Shuffle playlist reaches a randomized track | It plays at once and holds there with gaps, as it would on a repeating track. Next, Previous or Stop moves on. |
| Soundboard Only playlist | Start and stop each sound by hand. |
| Switch a randomized sound to Repeat during a gap | It starts looping at once. |
| Switch it to Once during a gap | The gap ends like a finished track: the sound stops, or a Sequential or Shuffle playlist moves to its next track. |
| Change Frequency during a gap | The gap is redrawn from the new range. |
| Reload mid-session | Running sounds carry on, each drawing a fresh gap. |

- Each gap counts from when the sound finishes, so a sound never overlaps itself.
- While a sound waits, its sidebar row is dimmed, its timer is dimmed and reads 0:00, and Pause is disabled. Its
  volume slider stays in Currently Playing so you can adjust it between plays.
- Only the active GM's browser keeps time, so plays never double up. With no GM connected, waiting
  sounds stay silent. Players hear everything through Foundry's normal sound sync.
- If the module is turned off, randomized sounds behave as ordinary one-shots.

## Installation

In Foundry's **Add-on Modules** tab, choose **Install Module** and paste this manifest URL:

```
https://github.com/vvulfmann/vvulfmanns-playlist-randomizer/releases/latest/download/module.json
```

Requires Foundry VTT v14.

## How it works

The module extends core classes the way v14 expects, with no patching and no libWrapper. A
randomized sound stays `playing` for as long as it's on, like a Repeat sound, so core's Play/Stop,
Currently Playing, playlist state and Sequential track-holding all work unchanged. Between plays a
`resting` flag keeps it silent.

- `CONFIG.PlaylistSound.documentClass` overrides `sync()` to stay silent while resting.
- `CONFIG.Playlist.documentClass` overrides `_onSoundEnd()` so a randomized sound rests instead of
  stopping or advancing, and `playAll()` so Simultaneous playlists start randomized sounds resting.
- `CONFIG.ui.playlists` adds the dice button (a copy of core's repeat button) and its
  `soundRandomize` action, and marks resting rows.
- A `renderPlaylistSoundConfig` hook swaps the Repeat checkbox for the Playback row and Frequency.
- `preCreate`/`preUpdate` hooks keep Repeat and Randomize exclusive and clear `resting` when a sound
  is started, stopped or switched to Repeat.
- An active-GM scheduler times each gap, then clears `resting` so core plays the sound everywhere.

Sound settings live in the sound's flags: `randomize`, `frequency` and `resting`. The world settings
(`defaultFrequency`, and `oftenMin`, `oftenMax` and so on for each Frequency) are registered with
`game.settings.register` in the init hook as v14 data fields, so Configure Settings draws them itself.

## Development

```
npm test
```

The tests run in Node against a small mock of the v14 playlist API, covering all four playlist modes.

Releases are built by GitHub Actions when a `v*` tag is pushed. If the repository secret
`FOUNDRY_RELEASE_TOKEN` is set, the release is also pushed to the Foundry package listing.

## Licence

MIT
