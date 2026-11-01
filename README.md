# Vvulfmann's Playlist Randomizer

A small Foundry VTT module that adds a **Randomize** option to looped playlist sounds.

A normal loop repeats the moment it ends. A randomized loop plays through once, waits a random
time, then plays again, for as long as it is playing. It's built for ambience: a church bell, a
raven, distant thunder or creaking timbers that drop in now and then instead of repeating nonstop.

## How to use it

1. Open a sound's edit window from a playlist.
2. Tick **Repeat**, then tick **Randomize**.
3. Pick a **Frequency**:

   | Frequency | Wait between plays |
   | --- | --- |
   | Often | 10 to 30 seconds |
   | Sometimes (default) | 30 seconds to 2 minutes |
   | Seldom | 2 to 6 minutes |

In the Playlists sidebar, a randomized sound shows a **dice** where the loop icon normally is.
Click the dice to switch randomizing on or off, the same way the loop icon works. When the dice is
off, the sound loops normally.

Nothing else in Foundry's interface changes.

## Behaviour

- **Play a whole playlist** (or activate its scene): plain loops start as usual, and randomized
  sounds start with a wait, so they don't all fire at once.
- **Play a single randomized sound**: it plays right away, then waits.
- **Stop** the sound or its playlist: any pending wait is cancelled.
- **Reload** mid-session: waits carry on where they left off.
- Players hear everything through Foundry's normal sound sync.

Randomizing works in playlists set to **Simultaneous** or **Soundboard Only**. In Sequential and
Shuffle playlists a sound's end moves on to the next track, so the option is not used there.

## Installation

In Foundry's **Add-on Modules** tab, choose **Install Module** and paste this manifest URL:

```
https://github.com/joshuamgrosser/vvulfmanns-playlist-randomizer/releases/latest/download/module.json
```

Requires Foundry VTT v14. Works with or without libWrapper.

## Development

```
npm test
```

Releases are built by GitHub Actions when a `v*` tag is pushed. If the repository secret
`FOUNDRY_RELEASE_TOKEN` is set, the release is also pushed to the Foundry package listing.

## Licence

MIT
