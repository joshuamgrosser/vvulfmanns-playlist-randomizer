/**
 * Vvulfmann's Playlist Randomizer
 * Adds Randomize beside Repeat on playlist sounds: Repeat with a random silent gap (Often, Sometimes or
 * Seldom) between plays, in every playlist mode.
 */
import {RandomizerDirectory} from "./directory.mjs";
import {onPreCreatePlaylistSound, onPreUpdatePlaylist, onPreUpdatePlaylistSound} from "./guards.mjs";
import {RandomizerPlaylist} from "./playlist.mjs";
import {Scheduler} from "./scheduler.mjs";
import {RandomizerSound} from "./sound.mjs";
import {onRenderPlaylistSoundConfig} from "./sound-config.mjs";

export const scheduler = new Scheduler();

Hooks.once("init", () => {
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
