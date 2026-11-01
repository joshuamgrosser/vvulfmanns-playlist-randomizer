import {flagPath, isRandomized} from "./config.mjs";

/**
 * Extends the configured Playlist document class.
 * Registered in the init hook: CONFIG.Playlist.documentClass = RandomizerPlaylist(CONFIG.Playlist.documentClass)
 *
 * - _onSoundEnd(): a randomized sound that ends naturally rests instead of stopping or advancing,
 *   so every playlist mode holds on it the way it holds on a Repeat sound.
 * - playAll(): in Simultaneous mode, randomized sounds start resting, so they don't all play at once.
 *
 * @param {typeof Playlist} Base
 */
export const RandomizerPlaylist = Base => class RandomizerPlaylist extends Base {

  /** @inheritDoc */
  async _onSoundEnd(sound) {
    if ( !sound.playing || !isRandomized(sound) ) return super._onSoundEnd(sound);
    // Every owner's client reports the end, so this may arrive more than once. Setting the flag is idempotent.
    return this.update({sounds: [{_id: sound.id, [flagPath("resting")]: true}]});
  }

  /**
   * End a gap the way core ends a track: Sequential and Shuffle move to the next track, the other modes stop.
   * Used when Randomize is switched off while the sound is resting.
   * @param {PlaylistSound} sound
   */
  async finishRest(sound) {
    return super._onSoundEnd(sound);
  }

  /** @inheritDoc */
  async playAll() {
    if ( (this.mode !== CONST.PLAYLIST_MODES.SIMULTANEOUS) || !this.sounds.some(isRandomized) ) return super.playAll();
    // The same update core makes in Simultaneous mode, except randomized sounds that aren't already
    // running begin with a gap.
    return this.update({
      playing: true,
      sounds: this.sounds.map(s => {
        const update = {_id: s.id, playing: true};
        if ( isRandomized(s) && !s.playing ) update[flagPath("resting")] = true;
        return update;
      })
    });
  }
};
