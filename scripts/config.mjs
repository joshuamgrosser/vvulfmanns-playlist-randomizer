/**
 * Shared constants and flag helpers.
 * Flags are read straight from `doc.flags` so the helpers never throw, whatever state the document is in.
 */

export const MODULE_ID = "vvulfmanns-playlist-randomizer";

/** Gap between plays, in seconds: [shortest, longest]. These are the settings' defaults; see frequencyRange. */
export const FREQUENCIES = Object.freeze({
  often: [5, 15],
  sometimes: [15, 30],
  seldom: [60, 120]
});

export const DEFAULT_FREQUENCY = "sometimes";

/** The longest gap the range settings allow, in seconds (5 minutes). */
export const MAX_GAP = 300;

/** The world setting that holds the frequency a sound gets when it's first switched to Randomize. */
export const DEFAULT_FREQUENCY_SETTING = "defaultFrequency";

/** The setting key for one end of a frequency's range, e.g. rangeSettingKey("often", "min") -> "oftenMin". */
export const rangeSettingKey = (frequency, end) => `${frequency}${end === "min" ? "Min" : "Max"}`;

/** One of this module's settings, or the fallback if it isn't registered (yet) or holds something unusable. */
function setting(key, fallback, valid) {
  if ( !game.settings?.settings?.has(`${MODULE_ID}.${key}`) ) return fallback;
  const value = game.settings.get(MODULE_ID, key);
  return valid(value) ? value : fallback;
}

/** The frequency a sound is given when it's first switched to Randomize: the Default Frequency setting. */
export function defaultFrequency() {
  return setting(DEFAULT_FREQUENCY_SETTING, DEFAULT_FREQUENCY, v => Object.hasOwn(FREQUENCIES, v));
}

/**
 * A frequency's gap range in seconds, from the settings: [shortest, longest].
 * Settings save one at a time, so if the shortest was set above the longest, the two are swapped.
 * @param {string} frequency
 * @returns {[number, number]}
 */
export function frequencyRange(frequency) {
  const [min, max] = FREQUENCIES[frequency];
  const valid = v => Number.isFinite(v) && (v >= 1) && (v <= MAX_GAP);
  const a = setting(rangeSettingKey(frequency, "min"), min, valid);
  const b = setting(rangeSettingKey(frequency, "max"), max, valid);
  return [Math.min(a, b), Math.max(a, b)];
}

/** Options for the Frequency select, in the shape foundry.applications.fields.createSelectInput expects. */
export const FREQUENCY_OPTIONS = Object.keys(FREQUENCIES).map(value => ({value, label: `VPR.Frequency.${value}`}));

/** The dotted path of one of this module's flags, for use in update data and form field names. */
export const flagPath = key => `flags.${MODULE_ID}.${key}`;

/** This module's flags on a document, or an empty object. */
export const flagsOf = doc => doc?.flags?.[MODULE_ID] ?? {};

/** Is Randomize chosen for this sound? */
export function isRandomized(sound) {
  return flagsOf(sound).randomize === true;
}

/** Is this sound waiting out a gap between plays? Only meaningful while it is playing. */
export function isResting(sound) {
  return flagsOf(sound).resting === true;
}

/** Is the sound switched on but silent, waiting for its next play? */
export function isWaiting(sound) {
  return !!sound?.playing && isResting(sound);
}

/** Has the sound a frequency of its own? */
export function hasFrequency(sound) {
  return Object.hasOwn(FREQUENCIES, flagsOf(sound).frequency);
}

/** The sound's frequency key, falling back to the Default Frequency setting. Kept when Randomize is switched off. */
export function frequencyOf(sound) {
  return hasFrequency(sound) ? flagsOf(sound).frequency : defaultFrequency();
}

/**
 * A random gap for the sound's frequency, in milliseconds.
 * @param {PlaylistSound} sound
 * @param {() => number} [random]   A source of numbers in [0, 1).
 */
export function randomDelayMs(sound, random=Math.random) {
  const [min, max] = frequencyRange(frequencyOf(sound));
  return Math.round((min + (random() * (max - min))) * 1000);
}
