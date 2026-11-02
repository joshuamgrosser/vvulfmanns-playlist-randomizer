import {FREQUENCIES, MODULE_ID, rangeSettingKey} from "./config.mjs";

/** Settings-page elements we've already linked. Core reuses one element across renders, so link it once. */
const linked = new WeakSet();

/**
 * renderSettingsConfig hook: keep each frequency's two gap sliders in order while the GM edits them.
 * Raising a shortest gap above its longest pushes the longest up with it; lowering a longest gap below
 * its shortest pulls the shortest down with it. So the form never saves a shortest gap above its longest.
 *
 * A range-picker's change event bubbles from the picker itself (core stops its inner inputs' events), so one
 * delegated listener on the window covers every slider and number box, and Reset Defaults too.
 *
 * @param {SettingsConfig} app
 * @param {HTMLElement} element
 */
export function onRenderSettingsConfig(app, element) {
  if ( !element || linked.has(element) ) return;
  linked.add(element);
  element.addEventListener("change", event => keepRangeInOrder(element, event.target));
}

/**
 * If a changed gap setting has passed its partner, move the partner to match.
 * @param {HTMLElement} element   The settings window.
 * @param {HTMLElement} input     The input that changed.
 */
export function keepRangeInOrder(element, input) {
  const name = input?.name ?? input?.getAttribute?.("name");
  for ( const frequency of Object.keys(FREQUENCIES) ) {
    const min = `${MODULE_ID}.${rangeSettingKey(frequency, "min")}`;
    const max = `${MODULE_ID}.${rangeSettingKey(frequency, "max")}`;
    if ( (name !== min) && (name !== max) ) continue;
    const other = element.querySelector(`[name="${name === min ? max : min}"]`);
    if ( !other ) return;
    const value = Number(input.value);
    const otherValue = Number(other.value);
    if ( (name === min) ? (value > otherValue) : (value < otherValue) ) other.value = value;
    return;
  }
}
