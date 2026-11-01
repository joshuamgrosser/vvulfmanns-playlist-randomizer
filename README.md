# Vvulfmann's Playlist Randomizer

A small Foundry VTT v14 module that adds a **Randomize** option to playlist sounds.

A randomized sound is an ordinary one-shot that the module plays for you now and then while its
playlist is playing: a church bell, a raven, distant thunder or creaking timbers that drop in at
random instead of looping nonstop. Nothing in Foundry is replaced. While a randomized sound plays,
its button shows Stop like any other sound, and between plays it sits idle.

## How to use it

1. Open a sound's edit window from a playlist set to **Simultaneous**.
2. Set **Playback** to **Randomize**. (In Simultaneous playlists, core's Repeat checkbox becomes a
   Playback row with three choices: Once, Repeat or Randomize.)
3. Pick a **Frequency**:

   | Frequency | Wait between plays |
   | --- | --- |
   | Often | 10 to 30 seconds |
   | Sometimes (default) | 30 seconds to 2 minutes |
   | Seldom | 2 to 6 minutes |

4. Play the playlist.

In the Playlists sidebar, a randomized sound shows a **dice** where the repeat icon normally sits.
Click it to include the sound (lit) or leave it out (dim).

## Behaviour

| You do this | What happens |
| --- | --- |
| Play the playlist, or activate its scene | Loops and plain one-shots start as normal. Each randomized sound with a lit dice waits a random gap, then plays, so they don't all go off at once. The playlist keeps showing Stop while randomizing runs. |
| A randomized sound's turn comes up | Foundry plays it once, as if you'd pressed its Play button. |
| Press Play on a randomized sound | It plays once, like core. It doesn't start randomizing the rest of the playlist. |
| Press Stop on a randomized sound mid-play | That play stops. Its next turn stays scheduled. |
| Click the dice | Off: no more turns, but a play already underway finishes. On: it rejoins after a gap. |
| Stop the playlist | Everything stops and randomizing ends. Dice settings are kept for next time. |
| Reload mid-session | Randomizing carries on, each sound waiting a fresh random gap. |

- Each gap counts from when the sound finishes, so a sound never overlaps itself.
- Randomizing only works in **Simultaneous** playlists. The options are hidden in Sequential,
  Shuffle and Soundboard Only playlists.
- Only the active GM's browser keeps time, so plays never double up. With no GM connected,
  randomizing pauses. Players hear everything through Foundry's normal sound sync.
- If the module is turned off, randomized sounds simply behave as ordinary one-shots.

## Installation

In Foundry's **Add-on Modules** tab, choose **Install Module** and paste this manifest URL:

```
https://github.com/joshuamgrosser/vvulfmanns-playlist-randomizer/releases/latest/download/module.json
```

Requires Foundry VTT v14.

## How it works

The module extends core classes the way v14 expects, with no patching and no libWrapper:

- `CONFIG.Playlist.documentClass` gets `playAll`, `stopAll` and `prepareDerivedData` overrides
  that arm and disarm the playlist (a `flags.vvulfmanns-playlist-randomizer.armed` flag).
- `CONFIG.ui.playlists` gets one extra action, `randomizeToggle`, and swaps the repeat button for
  the dice on randomized sounds.
- A `renderPlaylistSoundConfig` hook swaps the Repeat checkbox for a Playback row (Once, Repeat,
  Randomize radio buttons) and adds the Frequency row, using core's form helpers. The radios drive
  core's own `repeat` field and the module's `randomize` flag, which the sheet submits as usual.
- An active-GM scheduler plays each turn with `Playlist#playSound`.

Sound settings live in the sound's flags: `randomize`, `frequency` and `enabled` (the dice).

## Development

```
npm test
```

The tests run in Node against a small mock of the v14 playlist API.

Releases are built by GitHub Actions when a `v*` tag is pushed. If the repository secret
`FOUNDRY_RELEASE_TOKEN` is set, the release is also pushed to the Foundry package listing.

## Licence

MIT
