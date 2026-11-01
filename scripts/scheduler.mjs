import {flagPath, isArmed, isEligible, randomDelayMs} from "./config.mjs";

/** Has a change touched one of our flags? Works for nested and dotted-key change data. */
const touches = (change, key) => foundry.utils.hasProperty(change, flagPath(key));

/**
 * Takes turns with randomized sounds. Runs only in the active GM's browser, so plays never double up.
 *
 * Each turn is an ordinary Playlist#playSound call, the same path as the Play button, so every client
 * hears it through normal document sync and core shows Stop while it plays. Gaps start when a sound
 * stops playing (a natural end or a manual stop), so a sound never overlaps itself.
 *
 * Timers live only in memory. After a reload, ready() gives each sound a fresh random wait.
 */
export class Scheduler {
  /**
   * @param {object} [options]
   * @param {Function} [options.setTimeout]
   * @param {Function} [options.clearTimeout]
   * @param {() => number} [options.random]
   */
  constructor({setTimeout, clearTimeout, random=Math.random}={}) {
    // Wrap the browser timers so they're never called with a Scheduler as `this` ("Illegal invocation").
    this.#setTimeout = setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.#clearTimeout = clearTimeout ?? (handle => globalThis.clearTimeout(handle));
    this.#random = random;
  }

  #setTimeout;
  #clearTimeout;
  #random;

  /**
   * Pending turns: sound UUID -> {handle, playlistId, soundId}.
   * @type {Map<string, {handle: unknown, playlistId: string, soundId: string}>}
   */
  timers = new Map();

  /** Is this browser the one that keeps time? */
  get active() {
    return !!game.user?.isActiveGM;
  }

  /* -------------------------------------------- */
  /*  Scheduling                                  */
  /* -------------------------------------------- */

  /** Schedule a turn for a sound, unless one is already pending. */
  schedule(sound) {
    if ( !this.active || !sound?.uuid || this.timers.has(sound.uuid) ) return;
    const playlistId = sound.parent.id;
    const soundId = sound.id;
    const handle = this.#setTimeout(() => this.fire(sound.uuid, playlistId, soundId), randomDelayMs(sound, this.#random));
    this.timers.set(sound.uuid, {handle, playlistId, soundId});
  }

  /** Cancel a sound's pending turn. */
  cancel(uuid) {
    const timer = this.timers.get(uuid);
    if ( !timer ) return;
    this.#clearTimeout(timer.handle);
    this.timers.delete(uuid);
  }

  /** Give every eligible, silent sound in an armed playlist a pending turn. */
  armPlaylist(playlist) {
    if ( !isArmed(playlist) ) return;
    for ( const sound of playlist.sounds ) {
      if ( isEligible(sound) && !sound.playing ) this.schedule(sound);
    }
  }

  /** Cancel every pending turn in a playlist. */
  disarmPlaylist(playlistId) {
    for ( const [uuid, timer] of this.timers ) {
      if ( timer.playlistId === playlistId ) this.cancel(uuid);
    }
  }

  /** Cancel every pending turn. */
  clearAll() {
    for ( const uuid of [...this.timers.keys()] ) this.cancel(uuid);
  }

  /** Start or stop keeping time, depending on whether this browser is the active GM. */
  refresh() {
    if ( !this.active ) return this.clearAll();
    for ( const playlist of game.playlists ) this.armPlaylist(playlist);
  }

  /**
   * A turn comes up. Check everything again, then play the sound the way the Play button does.
   * If the sound is already playing (started by hand), skip: its next turn is scheduled when it stops.
   */
  async fire(uuid, playlistId, soundId) {
    this.timers.delete(uuid);
    if ( !this.active ) return;
    const playlist = game.playlists.get(playlistId);
    const sound = playlist?.sounds.get(soundId);
    if ( !sound || !isArmed(playlist) || !isEligible(sound) || sound.playing ) return;
    return playlist.playSound(sound);
  }

  /* -------------------------------------------- */
  /*  Document events                             */
  /* -------------------------------------------- */

  /**
   * React to one sound's change.
   * @param {PlaylistSound} sound     The sound after the change.
   * @param {object} change           Its changed data.
   */
  onSoundChange(sound, change) {
    if ( !this.active || !sound ) return;
    if ( !isArmed(sound.parent) || !isEligible(sound) ) return this.cancel(sound.uuid);
    if ( change.playing === true ) return this.cancel(sound.uuid); // Played by hand or by us: the gap restarts at its end.
    if ( sound.playing ) return;
    // A new frequency replaces a wait drawn from the old one, so switching Seldom to Often takes effect now.
    if ( touches(change, "frequency") ) this.cancel(sound.uuid);
    const flagsChanged = touches(change, "randomize") || touches(change, "enabled") || touches(change, "frequency");
    if ( (change.playing === false) || flagsChanged ) this.schedule(sound);
  }

  /** updatePlaylist hook. */
  onUpdatePlaylist(playlist, changed) {
    if ( !this.active ) return;
    if ( !isArmed(playlist) ) return this.disarmPlaylist(playlist.id);
    if ( ("mode" in changed) || touches(changed, "armed") ) this.armPlaylist(playlist);
    for ( const change of changed.sounds ?? [] ) this.onSoundChange(playlist.sounds.get(change._id), change);
  }

  /** updatePlaylistSound hook. */
  onUpdatePlaylistSound(sound, changed) {
    this.onSoundChange(sound, changed);
  }

  /** Register the hooks this service listens to. */
  registerHooks() {
    Hooks.on("updatePlaylist", (playlist, changed) => this.onUpdatePlaylist(playlist, changed));
    Hooks.on("updatePlaylistSound", (sound, changed) => this.onUpdatePlaylistSound(sound, changed));
    Hooks.on("createPlaylistSound", sound => this.onSoundChange(sound, {[flagPath("enabled")]: true}));
    Hooks.on("deletePlaylistSound", sound => this.cancel(sound.uuid));
    Hooks.on("deletePlaylist", playlist => this.disarmPlaylist(playlist.id));
    Hooks.on("userConnected", () => this.refresh());
    Hooks.once("ready", () => this.refresh());
  }
}
