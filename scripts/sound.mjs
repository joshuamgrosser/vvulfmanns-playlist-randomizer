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
    // Keep a loaded Sound object, so Currently Playing lists the sound, its volume slider and its length
    // between plays, even in a browser that joined during a gap and hasn't played it yet.
    this.sound ||= this._createSound();
    if ( !this.sound ) return;
    // Only a client whose copy of the sound lags the one that reported its end is still sounding here, so
    // stop at once: a pending fade-out could otherwise silence the next play if the gap ended mid-fade.
    if ( this.sound.playing ) this.sound.stop();
    else if ( !this.sound.loaded && !this.sound.failed ) this.sound.load();
  }
};
