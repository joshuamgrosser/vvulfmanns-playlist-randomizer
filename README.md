# VVulfmann's Playlist Randomizer

Loop playlist sounds at random intervals! This module adds an additional Randomize option to the default Foundry playlist sound options. There are three levels of randomization to choose from: Often, Sometimes, and Seldom, all of which are configurable in the module settings.

## Installation

In Foundry's **Add-on Modules** tab, choose **Install Module** and paste this manifest URL:

```
https://github.com/vvulfmann/vvulfmanns-playlist-randomizer/releases/latest/download/module.json
```

Requires Foundry VTT v14.

## Usage

Click the **dice** icon next to a sound in the Playlists sidebar, or set **Playback** to **Randomize**
in the sound's edit window. A randomized sound plays, waits a random gap, then plays again until you
stop it.

Choose how often it plays with **Frequency**:

| Frequency | Default gap |
| --- | --- |
| Often | 15 to 30 seconds |
| Sometimes | 30 to 60 seconds |
| Seldom | 1 to 2 minutes |

- **Play All** or activating a scene starts each randomized sound after a random gap, so they don't
  all go off at once.
- A sound never overlaps itself.
- A GM must be connected for randomized sounds to play.
- If the module is turned off, randomized sounds play once.

## Settings

In **Configure Settings → VVulfmann's Playlist Randomizer**, the GM can change the gap range for each
Frequency and the Frequency new sounds start with.

## License

MIT
