import {DEFAULT_FREQUENCY, DEFAULT_FREQUENCY_SETTING, FREQUENCIES, MAX_GAP, MODULE_ID, rangeSettingKey} from "./config.mjs";

/**
 * World settings, shown on Foundry's Configure Settings page (GM only):
 * - Default Frequency: the frequency a sound is given when it's first switched to Randomize.
 * - Shortest and longest gap, in seconds, for each frequency.
 *
 * On the settings page each pair of sliders is kept in order as the GM edits it (see settings-config.mjs).
 * Settings are still saved one at a time, so a macro could store a shortest gap above its longest; readers
 * treat the smaller of the two as the shortest (see config.mjs frequencyRange).
 */

/**
 * Register the settings. Call from the init hook.
 * @param {object} [options]
 * @param {(frequency: string) => void} [options.onRangeChange]   Called on every client when a range changes.
 * @param {() => void} [options.onDefaultChange]                   Called on every client when the default changes.
 */
export function registerSettings({onRangeChange, onDefaultChange}={}) {
  const {NumberField, StringField} = foundry.data.fields;

  game.settings.register(MODULE_ID, DEFAULT_FREQUENCY_SETTING, {
    name: "VPR.Settings.DefaultFrequency.Name",
    hint: "VPR.Settings.DefaultFrequency.Hint",
    scope: "world",
    config: true,
    type: new StringField({
      required: true,
      blank: false,
      initial: DEFAULT_FREQUENCY,
      choices: Object.fromEntries(Object.keys(FREQUENCIES).map(f => [f, `VPR.Frequency.${f}`]))
    }),
    onChange: () => onDefaultChange?.()
  });

  for ( const [frequency, range] of Object.entries(FREQUENCIES) ) {
    for ( const [i, end] of ["min", "max"].entries() ) {
      game.settings.register(MODULE_ID, rangeSettingKey(frequency, end), {
        name: `VPR.Settings.Range.${frequency}.${end}`,
        hint: `VPR.Settings.Range.Hint.${end}`,
        scope: "world",
        config: true,
        // With a min, a max and a step, v14 draws a range slider with a number box beside it.
        type: new NumberField({
          required: true, nullable: false, integer: true, min: 1, max: MAX_GAP, step: 1, initial: range[i]
        }),
        onChange: () => onRangeChange?.(frequency)
      });
    }
  }
}
