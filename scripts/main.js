/**
 * Vvulfmann's Playlist Randomizer
 * Adds a Randomize option to playlist sounds: a randomized sound is an ordinary one-shot that the
 * module plays at random intervals while its (Simultaneous) playlist is playing.
 */
import {RandomizerDirectory} from "./directory.mjs";
import {onPreCreatePlaylistSound, onPreUpdatePlaylist, onPreUpdatePlaylistSound} from "./guards.mjs";
import {RandomizerPlaylist} from "./playlist.mjs";
import {Scheduler} from "./scheduler.mjs";
import {onRenderPlaylistSoundConfig} from "./sound-config.mjs";

export const scheduler = new Scheduler();

Hooks.once("init", () => {
  // init runs before world documents and sidebar apps are created (Game#setupGame), so these take effect everywhere.
  CONFIG.Playlist.documentClass = RandomizerPlaylist(CONFIG.Playlist.documentClass);
  CONFIG.ui.playlists = RandomizerDirectory(CONFIG.ui.playlists);

  Hooks.on("preCreatePlaylistSound", onPreCreatePlaylistSound);
  Hooks.on("preUpdatePlaylistSound", onPreUpdatePlaylistSound);
  Hooks.on("preUpdatePlaylist", onPreUpdatePlaylist);
  Hooks.on("renderPlaylistSoundConfig", onRenderPlaylistSoundConfig);
  scheduler.registerHooks();
});
