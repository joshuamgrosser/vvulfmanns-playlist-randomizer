import {flagPath, isRandomized, isWaiting, randomDelayMs} from "./config.mjs";

/** Has a change touched one of our flags? Works for nested and dotted-key change data. */
const touches = (change, key) => foundry.utils.hasProperty(change ?? {}, flagPath(key));

/**
 * Times the gaps between plays. Runs only in the active GM's browser, so plays never double up.
 *
 * It looks at a sound's state, not at what just happened to it:
 * - waiting (playing and resting) and randomized: make sure a gap timer is pending;
 * - waiting but no longer randomized: end the gap the way core ends a track;
 * - anything else: cancel any pending timer.
 *
 * When a timer fires the sound's `resting` flag is cleared, and core's PlaylistSound#sync plays it on
 * every client. Timers live only in memory: after a reload each waiting sound draws a fresh gap.
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

  /** Sounds whose gap is being ended by finishRest, so a second change can't advance a playlist twice. */
  #finishing = new Set();

  /**
   * Pending gaps: sound UUID -> {handle, playlistId, soundId}.
   * @type {Map<string, {handle: unknown, playlistId: string, soundId: string}>}
   */
  timers = new Map();

  /** Is this browser the one that keeps time? */
  get active() {
    return !!game.user?.isActiveGM;
  }

  /* -------------------------------------------- */
  /*  State                                       */
  /* -------------------------------------------- */

  /**
   * Bring one sound's timer in line with its state.
   * @param {PlaylistSound} sound     The sound after a change.
   * @param {object} [change]         The change, if any.
   */
  check(sound, change) {
    if ( !this.active || !sound?.uuid ) return;
    if ( !isWaiting(sound) ) return this.cancel(sound.uuid);
    if ( !isRandomized(sound) ) {
      // Randomize was switched off during a gap: end it like a finished track, once.
      this.cancel(sound.uuid);
      if ( this.#finishing.has(sound.uuid) ) return;
      this.#finishing.add(sound.uuid);
      return sound.parent.finishRest(sound).finally(() => this.#finishing.delete(sound.uuid));
    }
    // A new frequency replaces a gap drawn from the old one.
    if ( touches(change, "frequency") ) this.cancel(sound.uuid);
    this.schedule(sound);
  }

  /** Check every sound in a playlist. */
  checkPlaylist(playlist) {
    for ( const sound of playlist.sounds ) this.check(sound);
  }

  /** Start or stop keeping time, depending on whether this browser is the active GM. */
  refresh() {
    if ( !this.active ) return this.clearAll();
    for ( const playlist of game.playlists ) this.checkPlaylist(playlist);
  }

  /* -------------------------------------------- */
  /*  Timers                                      */
  /* -------------------------------------------- */

  /** Draw a gap for a sound, unless one is already pending. */
  schedule(sound) {
    if ( this.timers.has(sound.uuid) ) return;
    const playlistId = sound.parent.id;
    const soundId = sound.id;
    const handle = this.#setTimeout(() => this.fire(sound.uuid, playlistId, soundId), randomDelayMs(sound, this.#random));
    this.timers.set(sound.uuid, {handle, playlistId, soundId});
  }

  /** Cancel a sound's pending gap. */
  cancel(uuid) {
    const timer = this.timers.get(uuid);
    if ( !timer ) return;
    this.#clearTimeout(timer.handle);
    this.timers.delete(uuid);
  }

  /** Cancel every pending gap in a playlist. */
  cancelPlaylist(playlistId) {
    for ( const [uuid, timer] of this.timers ) {
      if ( timer.playlistId === playlistId ) this.cancel(uuid);
    }
  }

  /** Cancel every pending gap. */
  clearAll() {
    for ( const uuid of [...this.timers.keys()] ) this.cancel(uuid);
  }

  /** A gap is over. If the sound is still waiting and randomized, end its rest so core plays it. */
  async fire(uuid, playlistId, soundId) {
    this.timers.delete(uuid);
    if ( !this.active ) return;
    const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
    if ( !isWaiting(sound) || !isRandomized(sound) ) return;
    return sound.update({[flagPath("resting")]: false});
  }

  /* -------------------------------------------- */
  /*  Hooks                                       */
  /* -------------------------------------------- */

  /** updatePlaylist hook: check each sound the update touched, or all of them if the mode changed. */
  onUpdatePlaylist(playlist, changed) {
    if ( !this.active ) return;
    if ( "mode" in changed ) return this.checkPlaylist(playlist);
    for ( const change of changed.sounds ?? [] ) this.check(playlist.sounds.get(change._id), change);
  }

  /** Register the hooks this service listens to. */
  registerHooks() {
    Hooks.on("updatePlaylist", (playlist, changed) => this.onUpdatePlaylist(playlist, changed));
    Hooks.on("updatePlaylistSound", (sound, changed) => this.check(sound, changed));
    Hooks.on("createPlaylistSound", sound => this.check(sound));
    Hooks.on("deletePlaylistSound", sound => this.cancel(sound.uuid));
    Hooks.on("deletePlaylist", playlist => this.cancelPlaylist(playlist.id));
    Hooks.on("userConnected", () => this.refresh());
    Hooks.once("ready", () => this.refresh());
  }
}
