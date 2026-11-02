import {defaultFrequency, flagPath, hasFrequency, isRandomized, isResting} from "./config.mjs";

/**
 * Rules applied to every change to a sound, whichever way it is made: the sidebar, the sound window,
 * a macro, another module, or an update sent through the parent playlist.
 *
 * - Repeat and Randomize are mutually exclusive. If a change turns both on, Randomize wins.
 * - A sound switched to Randomize without a frequency of its own is given the Default Frequency setting,
 *   so a later change to that setting doesn't move it.
 * - Stopping a sound ends its gap.
 * - Starting a sound plays it now, unless the change itself asks for a gap (Simultaneous Play All).
 * - Switching to Repeat during a gap ends the gap, so the loop starts at once.
 * - Switching to Once during a gap leaves the gap in place; the scheduler then ends it the way core
 *   ends a track (see Scheduler#check).
 */

/**
 * Adjust one sound's change data in place.
 * @param {object} change                 The change for one sound (expanded, as preUpdate hooks receive it).
 * @param {PlaylistSound} [sound]         The sound as it is before the change.
 */
export function applyRules(change, sound) {
  if ( !change || (typeof change !== "object") ) return;
  const get = key => foundry.utils.getProperty(change, flagPath(key));
  const set = (key, value) => foundry.utils.setProperty(change, flagPath(key), value);
  const randomize = get("randomize");

  // Repeat and Randomize are exclusive
  if ( randomize === true ) {
    if ( ("repeat" in change) || sound?.repeat ) change.repeat = false;
    if ( (get("frequency") === undefined) && !hasFrequency(sound) ) set("frequency", defaultFrequency());
  }
  else if ( (change.repeat === true) && isRandomized(sound) ) set("randomize", false);

  // Gaps
  const restingSet = foundry.utils.hasProperty(change, flagPath("resting"));
  const resting = restingSet ? get("resting") : isResting(sound);
  if ( !resting ) return;
  const repeatOn = (change.repeat === true) && (randomize !== true);
  const stopped = change.playing === false;
  const started = (change.playing === true) && !sound?.playing && !restingSet;
  if ( stopped || started || repeatOn ) set("resting", false);
}

/** preCreatePlaylistSound: the new document already holds its data. */
export function onPreCreatePlaylistSound(sound) {
  const updates = {};
  if ( isRandomized(sound) && sound.repeat ) updates.repeat = false;
  if ( isRandomized(sound) && !hasFrequency(sound) ) updates[flagPath("frequency")] = defaultFrequency();
  if ( isResting(sound) && !sound.playing ) updates[flagPath("resting")] = false;
  if ( Object.keys(updates).length ) sound.updateSource(updates);
}

/** preUpdatePlaylistSound: a direct update to one sound. */
export function onPreUpdatePlaylistSound(sound, changed) {
  applyRules(changed, sound);
}

/** preUpdatePlaylist: sound changes sent through the playlist only fire the playlist's hooks. */
export function onPreUpdatePlaylist(playlist, changed) {
  if ( !Array.isArray(changed?.sounds) ) return;
  for ( const change of changed.sounds ) applyRules(change, playlist.sounds.get(change?._id));
}
