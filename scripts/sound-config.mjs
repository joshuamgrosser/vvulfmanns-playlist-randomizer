import {FREQUENCY_OPTIONS, flagPath, frequencyOf, isRandomized, isSimultaneous} from "./config.mjs";

/**
 * Add the Randomize and Frequency rows under Repeat in core's PlaylistSoundConfig (a DocumentSheetV2).
 * The inputs are named after this module's flags, so the sheet's normal submit saves them with the sound.
 * @param {PlaylistSoundConfig} app
 * @param {HTMLElement} element
 */
export function onRenderPlaylistSoundConfig(app, element) {
  const sound = app.document;
  if ( !isSimultaneous(sound?.parent) ) return;
  if ( element.querySelector(`[name="${flagPath("randomize")}"]`) ) return;
  const repeat = element.querySelector('[name="repeat"]');
  const repeatGroup = repeat?.closest(".form-group");
  if ( !repeatGroup ) return;

  const {createCheckboxInput, createFormGroup, createSelectInput} = foundry.applications.fields;
  const randomize = createCheckboxInput({name: flagPath("randomize"), value: isRandomized(sound)});
  const frequency = createSelectInput({
    name: flagPath("frequency"),
    value: frequencyOf(sound),
    options: FREQUENCY_OPTIONS,
    localize: true
  });
  const randomizeGroup = createFormGroup({
    label: "VPR.Randomize.Label", input: randomize, localize: true, rootId: app.id
  });
  const frequencyGroup = createFormGroup({
    label: "VPR.Frequency.Label", input: frequency, localize: true, rootId: app.id, hidden: !randomize.checked
  });
  repeatGroup.after(randomizeGroup, frequencyGroup);

  // Repeat and Randomize are mutually exclusive.
  randomize.addEventListener("change", () => {
    if ( randomize.checked ) repeat.checked = false;
    frequencyGroup.hidden = !randomize.checked;
  });
  repeat.addEventListener("change", () => {
    if ( !repeat.checked ) return;
    randomize.checked = false;
    frequencyGroup.hidden = true;
  });
}
