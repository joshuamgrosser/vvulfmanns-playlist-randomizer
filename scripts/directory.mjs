import {MODULE_ID, isRandomized, isWaiting} from "./config.mjs";

const REPEAT_ICON = "fa-arrows-rotate";
const DICE_ICON = "fa-dice";

/**
 * Extends the configured Playlists sidebar.
 * Registered in the init hook: CONFIG.ui.playlists = RandomizerDirectory(CONFIG.ui.playlists)
 *
 * Next to core's repeat button on every sound row, add a dice button built from a copy of it, so it
 * looks and sits exactly like core's. At most one of the two is lit. Rows of sounds waiting out a gap
 * get a `vpr-resting` class (styled in styles/randomizer.css), and their pause button is disabled.
 *
 * @param {typeof PlaylistDirectory} Base
 */
export const RandomizerDirectory = Base => class RandomizerDirectory extends Base {

  /** Merged with the parent's actions by ApplicationV2#_initializeApplicationOptions. */
  static DEFAULT_OPTIONS = {
    actions: {
      soundRandomize: onSoundRandomize
    }
  };

  /** @inheritDoc */
  async _onRender(context, options) {
    // Decorate before awaiting core, so the rows never paint for a frame without the dice.
    decorateSounds(this.element);
    resetRestingTimers(this.element);
    await super._onRender(context, options);
  }

  /**
   * Core rewrites each Currently Playing timer every second from the audio's current time, which reads
   * "∞" for a sound that isn't sounding. Show 0:00 for a sound waiting out a gap instead.
   * @inheritDoc
   */
  updateTimestamps() {
    super.updateTimestamps();
    resetRestingTimers(this.element);
  }
};

/**
 * Set the elapsed time of every resting sound in Currently Playing to 0:00.
 * @param {HTMLElement} element
 */
export function resetRestingTimers(element) {
  for ( const li of element?.querySelectorAll(".sound") ?? [] ) {
    if ( !li.classList.contains("vpr-resting") ) continue;
    const current = li.querySelector(".current");
    if ( current ) current.textContent = "0:00";
  }
}

/**
 * Add the dice to each sound row and mark resting rows.
 * Covers the directory list and core's Currently Playing panel, which both render .sound rows.
 * @param {HTMLElement} element
 */
export function decorateSounds(element) {
  for ( const li of element.querySelectorAll(".sound[data-sound-id]") ) {
    const sound = game.playlists.get(li.dataset.playlistId)?.sounds.get(li.dataset.soundId);
    if ( !sound ) continue;
    const waiting = isWaiting(sound);
    li.classList.toggle("vpr-resting", waiting);
    if ( waiting ) li.querySelector('[data-action="soundPause"]')?.setAttribute("disabled", "");

    const repeat = li.querySelector('[data-action="soundRepeat"]');
    if ( !repeat ) continue; // Core shows no repeat button to non-owners, so they get no dice either.
    const dice = li.querySelector('[data-action="soundRandomize"]') ?? addDice(repeat);
    const randomized = isRandomized(sound);
    dice.classList.toggle("inactive", !randomized);
    const key = randomized ? "VPR.Randomize.On" : "VPR.Randomize.Off";
    delete dice.dataset.tooltipText;
    dice.dataset.tooltip = key;
    dice.setAttribute("aria-label", game.i18n.localize(key));
    dice.setAttribute("aria-pressed", String(randomized));
  }
}

/** Insert a dice button after core's repeat button, copied from it. */
function addDice(repeat) {
  const dice = repeat.cloneNode(true);
  dice.dataset.action = "soundRandomize";
  const icon = dice.classList.contains(REPEAT_ICON) ? dice : dice.querySelector(`.${REPEAT_ICON}`);
  icon?.classList.replace(REPEAT_ICON, DICE_ICON);
  repeat.after(dice);
  return dice;
}

/**
 * Click on the dice. Dim: the sound becomes randomized (the guards turn Repeat off). Lit: it becomes a one-shot.
 * The sound's Frequency is left as it was, so switching back on restores the last choice.
 * @this {PlaylistDirectory}
 * @param {PointerEvent} event
 * @param {HTMLElement} target
 */
export function onSoundRandomize(event, target) {
  const {playlistId, soundId} = target.closest(".sound")?.dataset ?? {};
  const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
  if ( !sound?.isOwner ) return;
  return sound.setFlag(MODULE_ID, "randomize", !isRandomized(sound));
}
