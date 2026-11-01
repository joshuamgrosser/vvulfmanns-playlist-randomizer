import {MODULE_ID, isEnabled, isRandomizable} from "./config.mjs";

const REPEAT_ICON = "fa-arrows-rotate";
const DICE_ICON = "fa-dice";

/**
 * Extends the configured Playlists sidebar.
 * Registered in the init hook: CONFIG.ui.playlists = RandomizerDirectory(CONFIG.ui.playlists)
 *
 * On a randomized sound, core's repeat button becomes the dice: same place, same dim "inactive" style,
 * pointed at our own action instead of soundRepeat. Every other control is left alone.
 *
 * @param {typeof PlaylistDirectory} Base
 */
export const RandomizerDirectory = Base => class RandomizerDirectory extends Base {

  /** Merged with the parent's actions by ApplicationV2#_initializeApplicationOptions. */
  static DEFAULT_OPTIONS = {
    actions: {
      randomizeToggle: onRandomizeToggle
    }
  };

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    decorateSounds(this.element);
  }
};

/**
 * Turn the repeat button of each randomized sound into the dice.
 * Covers the directory list and core's Currently Playing panel, which both render .sound rows.
 * @param {HTMLElement} element
 */
export function decorateSounds(element) {
  for ( const li of element.querySelectorAll(".sound[data-sound-id]") ) {
    const sound = game.playlists.get(li.dataset.playlistId)?.sounds.get(li.dataset.soundId);
    if ( !sound || !isRandomizable(sound) ) continue;
    const button = li.querySelector('[data-action="soundRepeat"]');
    if ( !button ) continue; // Core shows no repeat button to non-owners either.
    const enabled = isEnabled(sound);
    button.dataset.action = "randomizeToggle";
    const icon = button.classList.contains(REPEAT_ICON) ? button : button.querySelector(`.${REPEAT_ICON}`);
    icon?.classList.replace(REPEAT_ICON, DICE_ICON);
    button.classList.toggle("inactive", !enabled);
    const key = enabled ? "VPR.Randomize.On" : "VPR.Randomize.Off";
    delete button.dataset.tooltipText;
    button.dataset.tooltip = key;
    button.setAttribute("aria-label", game.i18n.localize(key));
    button.setAttribute("aria-pressed", String(enabled));
  }
}

/**
 * Switch a sound's dice on or off.
 * @this {PlaylistDirectory}
 * @param {PointerEvent} event
 * @param {HTMLElement} target
 */
export function onRandomizeToggle(event, target) {
  const {playlistId, soundId} = target.closest(".sound")?.dataset ?? {};
  const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
  if ( !sound?.isOwner ) return;
  return sound.setFlag(MODULE_ID, "enabled", !isEnabled(sound));
}
