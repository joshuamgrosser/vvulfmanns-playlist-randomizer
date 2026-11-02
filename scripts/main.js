/**
 * VVulfmann's Playlist Randomizer
 * Adds Randomize beside Repeat on playlist sounds: Repeat with a random silent gap (Often, Sometimes or
 * Seldom) between plays, in every playlist mode.
 */
import {RandomizerDirectory} from "./directory.mjs";
import {onPreCreatePlaylistSound, onPreUpdatePlaylist, onPreUpdatePlaylistSound} from "./guards.mjs";
import {frequencyOf, hasFrequency} from "./config.mjs";
import {RandomizerPlaylist} from "./playlist.mjs";
import {Scheduler} from "./scheduler.mjs";
import {registerSettings} from "./settings.mjs";
import {RandomizerSound} from "./sound.mjs";
import {onRenderPlaylistSoundConfig} from "./sound-config.mjs";

export const scheduler = new Scheduler();

Hooks.once("init", () => {
  registerSettings({
    // A changed range redraws the gaps already waiting at that frequency.
    onRangeChange: frequency => scheduler.redraw(sound => frequencyOf(sound) === frequency),
    // A changed default only reaches sounds with no frequency of their own (randomized before v0.2.0).
    onDefaultChange: () => scheduler.redraw(sound => !hasFrequency(sound))
  });
  // init runs before world documents and sidebar apps are created (Game#setupGame), so these take effect everywhere.
  CONFIG.Playlist.documentClass = RandomizerPlaylist(CONFIG.Playlist.documentClass);
  CONFIG.PlaylistSound.documentClass = RandomizerSound(CONFIG.PlaylistSound.documentClass);
  CONFIG.ui.playlists = RandomizerDirectory(CONFIG.ui.playlists);

  Hooks.on("preCreatePlaylistSound", onPreCreatePlaylistSound);
  Hooks.on("preUpdatePlaylistSound", onPreUpdatePlaylistSound);
  Hooks.on("preUpdatePlaylist", onPreUpdatePlaylist);
  Hooks.on("renderPlaylistSoundConfig", onRenderPlaylistSoundConfig);
  scheduler.registerHooks();
});
