import {isWaiting} from "./config.mjs";

/**
 * Extends the configured PlaylistSound document class.
 * Registered in the init hook: CONFIG.PlaylistSound.documentClass = RandomizerSound(CONFIG.PlaylistSound.documentClass)
 *
 * A randomized sound stays `playing` for as long as it is switched on, like a Repeat sound, so core's
 * Play/Stop button, Currently Playing and playlist state all treat it as running. Between plays it is
 * `resting`: still playing as far as core is concerned, but kept silent here.
 *
 * @param {typeof PlaylistSound} Base
 */
export const RandomizerSound = Base => class RandomizerSound extends Base {

  /** @override */
  sync() {
    // Until the browser allows audio (the user's first click), core can't create sounds and would throw. Core
    // syncs every sound once audio unlocks (Playlists#initialize), so there's nothing to do yet.
    if ( game.audio?.locked ) return;
    if ( !isWaiting(this) ) return super.sync();
    // Keep a Sound object, so Currently Playing lists the sound and its volume slider between plays.
    this.sound ||= this._createSound();
    if ( this.sound?.playing ) this.sound.stop({fade: this.fadeDuration});
  }
};
