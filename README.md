# VVulfmann's Playlist Randomizer

Loop playlist sounds at random intervals! This module adds an additional Randomize option to the default Foundry playlist sound options. There are three levels of randomization to choose from: Often, Sometimes, and Seldom, all of which are configurable in the module settings.

## Installation

In Foundry's **Add-on Modules** tab, choose **Install Module** and paste this manifest URL:

```
https://github.com/vvulfmann/vvulfmanns-playlist-randomizer/releases/latest/download/module.json
```

Requires Foundry VTT v14.

## Usage

To randomize a sound, click the **dice** icon next to it in the Playlists sidebar. You can also open
the sound and set **Playback** to **Randomize**.

A randomized sound plays, waits a bit, then plays again. It keeps going until you stop it.

**Frequency** sets how long it waits between plays:

| Frequency | Wait |
| --- | --- |
| Often | 15 to 30 seconds |
| Sometimes | 30 to 60 seconds |
| Seldom | 1 to 2 minutes |

A few things to know:

- When you start a playlist or a scene, each randomized sound waits before its first play, so they
  don't all start at once.
- A sound never plays over itself.
- A GM has to be logged in for randomized sounds to play.
- If you turn the module off, randomized sounds just play once.

## Settings

Go to **Configure Settings → VVulfmann's Playlist Randomizer** to change the wait times for each
Frequency, or the Frequency new sounds start with.

## License

MIT
