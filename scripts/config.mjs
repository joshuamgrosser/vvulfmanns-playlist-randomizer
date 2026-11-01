/**
 * Shared constants and flag helpers.
 * Flags are read straight from `doc.flags` so the helpers never throw, whatever state the document is in.
 */

export const MODULE_ID = "vvulfmanns-playlist-randomizer";

/** Wait between plays, in seconds: [minimum, maximum]. */
export const FREQUENCIES = Object.freeze({
  often: [10, 30],
  sometimes: [30, 120],
  seldom: [120, 360]
});

export const DEFAULT_FREQUENCY = "sometimes";

/** Options for the Frequency select, in the shape foundry.applications.fields.createSelectInput expects. */
export const FREQUENCY_OPTIONS = Object.keys(FREQUENCIES).map(value => ({value, label: `VPR.Frequency.${value}`}));

/** The dotted path of one of this module's flags, for use in update data and form field names. */
export const flagPath = key => `flags.${MODULE_ID}.${key}`;

/** This module's flags on a document, or an empty object. */
export const flagsOf = doc => doc?.flags?.[MODULE_ID] ?? {};

/** Randomizing only works in Simultaneous playlists. */
export function isSimultaneous(playlist) {
  return playlist?.mode === CONST.PLAYLIST_MODES.SIMULTANEOUS;
}

/** Is the Randomize box ticked for this sound? */
export function isRandomized(sound) {
  return flagsOf(sound).randomize === true;
}

/** Is this a randomized sound in a playlist where randomizing works? */
export function isRandomizable(sound) {
  return isRandomized(sound) && isSimultaneous(sound?.parent);
}

/** Is this sound's dice lit? Missing means lit. */
export function isEnabled(sound) {
  return flagsOf(sound).enabled !== false;
}

/** Should the randomizer take turns with this sound? */
export function isEligible(sound) {
  return isRandomizable(sound) && isEnabled(sound);
}

/** The sound's frequency key, falling back to the default. */
export function frequencyOf(sound) {
  const frequency = flagsOf(sound).frequency;
  return Object.hasOwn(FREQUENCIES, frequency) ? frequency : DEFAULT_FREQUENCY;
}

/** Has Play All armed the randomizer for this playlist? Only counts in Simultaneous mode. */
export function isArmed(playlist) {
  return isSimultaneous(playlist) && (flagsOf(playlist).armed === true);
}

/**
 * A random wait for the sound's frequency, in milliseconds.
 * @param {PlaylistSound} sound
 * @param {() => number} [random]   A source of numbers in [0, 1).
 */
export function randomDelayMs(sound, random=Math.random) {
  const [min, max] = FREQUENCIES[frequencyOf(sound)];
  return Math.round((min + (random() * (max - min))) * 1000);
}
