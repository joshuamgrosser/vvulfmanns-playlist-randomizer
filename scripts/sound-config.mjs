import {FREQUENCY_OPTIONS, flagPath, frequencyOf, isRandomized, isSimultaneous} from "./config.mjs";

/** The choices on the Playback row, in order. */
export const PLAYBACK_MODES = ["once", "repeat", "randomize"];

/**
 * Replace core's Repeat checkbox with one Playback row of radio buttons (Once, Repeat, Randomize),
 * plus a Frequency row shown while Randomize is chosen. Only in Simultaneous playlists.
 *
 * The radios only drive two hidden checkboxes, which are what the sheet submits:
 * - core's own `repeat` checkbox (left in the form, its row hidden), and
 * - our `flags.<module>.randomize` checkbox.
 * The radios point at a form that doesn't exist, so DocumentSheetV2 never submits them.
 *
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

  // Hidden inputs the sheet submits
  const randomize = createCheckboxInput({name: flagPath("randomize"), value: isRandomized(sound)});
  randomize.hidden = true;
  repeatGroup.hidden = true;

  // Frequency row
  const frequency = createSelectInput({
    name: flagPath("frequency"),
    value: frequencyOf(sound),
    options: FREQUENCY_OPTIONS,
    localize: true
  });
  const frequencyGroup = createFormGroup({
    label: "VPR.Frequency.Label", input: frequency, localize: true, rootId: app.id
  });

  // Playback row
  const current = randomize.checked ? "randomize" : (repeat.checked ? "repeat" : "once");
  const choose = mode => {
    repeat.checked = (mode === "repeat");
    randomize.checked = (mode === "randomize");
    frequencyGroup.hidden = (mode !== "randomize");
  };
  const groupName = `${app.id}-vpr-playback`;
  const radios = PLAYBACK_MODES.map(mode => {
    const input = document.createElement("input");
    input.setAttribute("type", "radio");
    input.setAttribute("name", groupName);
    input.setAttribute("value", mode);
    input.setAttribute("form", `${groupName}-unsubmitted`);
    input.checked = (mode === current);
    input.addEventListener("change", () => {
      if ( input.checked ) choose(mode);
    });
    const label = document.createElement("label");
    label.classList.add("checkbox");
    label.append(input, ` ${game.i18n.localize(`VPR.Playback.${mode}`)}`);
    return label;
  });
  const playbackGroup = createFormGroup({
    label: "VPR.Playback.Label", input: [...radios, randomize], localize: true
  });

  repeatGroup.after(playbackGroup, frequencyGroup);
  choose(current);
}
