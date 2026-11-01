import {flagPath, isRandomized} from "./config.mjs";

/**
 * Keep Repeat and Randomize mutually exclusive whichever way a sound is changed:
 * the sound window, a macro, another module, or an update made through the parent playlist.
 * If a change turns both on, Randomize wins.
 */

/**
 * Adjust one sound's change data in place.
 * @param {object} change                 The change for one sound (expanded, as preUpdate hooks receive it).
 * @param {PlaylistSound} [sound]         The sound as it is before the change.
 */
export function applyExclusive(change, sound) {
  if ( !change || (typeof change !== "object") ) return;
  const randomize = foundry.utils.getProperty(change, flagPath("randomize"));
  if ( randomize === true ) {
    if ( ("repeat" in change) || sound?.repeat ) change.repeat = false;
  }
  else if ( (change.repeat === true) && (randomize === undefined) && isRandomized(sound) ) {
    foundry.utils.setProperty(change, flagPath("randomize"), false);
  }
}

/** preCreatePlaylistSound: the new document already holds its data. */
export function onPreCreatePlaylistSound(sound) {
  if ( isRandomized(sound) && sound.repeat ) sound.updateSource({repeat: false});
}

/** preUpdatePlaylistSound: a direct update to one sound. */
export function onPreUpdatePlaylistSound(sound, changed) {
  applyExclusive(changed, sound);
}

/** preUpdatePlaylist: sound changes sent through the playlist only fire the playlist's hooks. */
export function onPreUpdatePlaylist(playlist, changed) {
  if ( !Array.isArray(changed?.sounds) ) return;
  for ( const change of changed.sounds ) applyExclusive(change, playlist.sounds.get(change?._id));
}
