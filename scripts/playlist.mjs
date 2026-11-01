import {flagPath, flagsOf, isArmed, isRandomizable, isSimultaneous} from "./config.mjs";

/**
 * Extends the configured Playlist document class.
 * Registered in the init hook: CONFIG.Playlist.documentClass = RandomizerPlaylist(CONFIG.Playlist.documentClass)
 *
 * - playAll() arms the randomizer and leaves randomized sounds out of the immediate start.
 * - stopAll() disarms it in the same update.
 * - prepareDerivedData() keeps an armed playlist showing as playing during quiet gaps.
 *
 * @param {typeof Playlist} Base
 */
export const RandomizerPlaylist = Base => class RandomizerPlaylist extends Base {

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData(); // Core v14: this.playing = this.sounds.some(s => s.playing)
    // Owners only, so players never see an empty "playing" playlist while it waits.
    if ( isArmed(this) && isOwner(this) ) this.playing = true;
  }

  /** @inheritDoc */
  async playAll() {
    if ( !isSimultaneous(this) || !this.sounds.some(isRandomizable) ) return super.playAll();
    // The same update core makes in Simultaneous mode, except randomized sounds keep their current state
    // (the scheduler gives each its first turn after a random wait), and the playlist is armed.
    return this.update({
      playing: true,
      sounds: this.sounds.map(s => ({_id: s.id, playing: isRandomizable(s) ? s.playing : true})),
      [flagPath("armed")]: true
    });
  }

  /** @inheritDoc */
  async stopAll() {
    if ( flagsOf(this).armed !== true ) return super.stopAll();
    // The same update core makes, plus disarming.
    return this.update({
      playing: false,
      sounds: this.sounds.map(s => ({_id: s.id, playing: false})),
      [flagPath("armed")]: false
    });
  }
};

/** Document#isOwner needs game.user, which may not exist yet during the first data preparation. */
function isOwner(doc) {
  try {
    return !!game.user && doc.isOwner;
  } catch {
    return false;
  }
}
