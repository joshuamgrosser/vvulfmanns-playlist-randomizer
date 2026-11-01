/**
 * A small stand-in for the parts of Foundry v14 the module touches.
 * Playlist methods (playAll, playNext, playSound, stopSound, stopAll, _onSoundEnd, prepareDerivedData)
 * copy core 14.369's logic for all four playlist modes. Updates apply synchronously and fire the same hooks core fires.
 */

/* ---------------------------------------- */
/*  Fake clock (replaces setTimeout)         */
/* ---------------------------------------- */

export const clock = {
  now: 0,
  nextId: 1,
  queue: new Map(),
  // Like a browser's, these throw when called with a receiver other than the global object.
  setTimeout(fn, ms=0) {
    if ( (this !== undefined) && (this !== globalThis) && (this !== clock) ) throw new TypeError("Illegal invocation");
    const id = clock.nextId++;
    clock.queue.set(id, {at: clock.now + ms, fn});
    return id;
  },
  clearTimeout(id) {
    if ( (this !== undefined) && (this !== globalThis) && (this !== clock) ) throw new TypeError("Illegal invocation");
    clock.queue.delete(id);
  },
  /** Advance time, running due callbacks in order. */
  advance(ms) {
    const end = clock.now + ms;
    for (;;) {
      let next = null;
      for ( const [id, t] of clock.queue ) {
        if ( (t.at <= end) && (!next || (t.at < next[1].at)) ) next = [id, t];
      }
      if ( !next ) break;
      clock.queue.delete(next[0]);
      clock.now = next[1].at;
      next[1].fn();
    }
    clock.now = end;
  },
  reset() {
    clock.now = 0;
    clock.queue.clear();
  }
};

/* ---------------------------------------- */
/*  Utilities                               */
/* ---------------------------------------- */

function getProperty(object, key) {
  if ( !key || !object ) return undefined;
  if ( key in object ) return object[key];
  let target = object;
  for ( const p of key.split(".") ) {
    if ( !target || (typeof target !== "object") || !(p in target) ) return undefined;
    target = target[p];
  }
  return target;
}

function hasProperty(object, key) {
  if ( !key || !object ) return false;
  if ( key in object ) return true;
  let target = object;
  const parts = key.split(".");
  for ( let i = 0; i < parts.length; i++ ) {
    if ( !target || (typeof target !== "object") || !(parts[i] in target) ) return false;
    if ( i !== parts.length - 1 ) target = target[parts[i]];
  }
  return true;
}

function setProperty(object, key, value) {
  const parts = key.split(".");
  const last = parts.pop();
  const target = parts.reduce((t, p) => (t[p] ??= {}), object);
  target[last] = value;
  return true;
}

/** Like core's expandObject, which also expands objects inside arrays (such as a playlist's sound changes). */
function expandObject(obj) {
  const out = {};
  for ( const [k, v] of Object.entries(obj) ) {
    let value = v;
    if ( Array.isArray(v) ) value = v.map(x => (x && (typeof x === "object") && !Array.isArray(x)) ? expandObject(x) : x);
    else if ( v && (typeof v === "object") ) value = expandObject(v);
    if ( k.includes(".") ) setProperty(out, k, value);
    else if ( value && (typeof value === "object") && !Array.isArray(value) && out[k] ) Object.assign(out[k], value);
    else out[k] = value;
  }
  return out;
}

function deepMerge(target, source) {
  for ( const [k, v] of Object.entries(source) ) {
    if ( v && (typeof v === "object") && !Array.isArray(v) ) deepMerge(target[k] ??= {}, v);
    else target[k] = v;
  }
  return target;
}

/* ---------------------------------------- */
/*  Hooks                                   */
/* ---------------------------------------- */

export const Hooks = {
  events: new Map(),
  on(name, fn) {
    if ( !Hooks.events.has(name) ) Hooks.events.set(name, []);
    Hooks.events.get(name).push({fn, once: false});
  },
  once(name, fn) {
    if ( !Hooks.events.has(name) ) Hooks.events.set(name, []);
    Hooks.events.get(name).push({fn, once: true});
  },
  callAll(name, ...args) {
    const list = Hooks.events.get(name) ?? [];
    for ( const h of [...list] ) {
      if ( h.once ) list.splice(list.indexOf(h), 1);
      h.fn(...args);
    }
    return true;
  },
  call(name, ...args) {
    return Hooks.callAll(name, ...args);
  }
};

/* ---------------------------------------- */
/*  Documents                               */
/* ---------------------------------------- */

const MODES = {DISABLED: -1, SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2};

class Collection extends Map {
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  map(fn) { return this.contents.map(fn); }
  filter(fn) { return this.contents.filter(fn); }
  some(fn) { return this.contents.some(fn); }
  find(fn) { return this.contents.find(fn); }
}

export class PlaylistSound {
  constructor(data, parent) {
    Object.assign(this, {playing: false, repeat: false, pausedTime: null, volume: 0.5, flags: {}}, structuredClone(data));
    this.id = this._id;
    this.parent = parent;
    this.uuid = `Playlist.${parent.id}.PlaylistSound.${this.id}`;
    this.duration = data.duration ?? 5000;   // ms of audio
    this.endTimer = null;
    this.playCount = 0;
  }

  get isOwner() { return true; }

  get fadeDuration() { return 0; }

  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }

  setFlag(scope, key, value) { return this.update({flags: {[scope]: {[key]: value}}}); }

  /** Core creates the audio object lazily; the stand-in only records that it exists. */
  _createSound() {
    if ( game.audio.locked ) throw new Error("You may not call PlaylistSound#_createSound until after game audio is unlocked.");
    const doc = this;
    return {
      playing: false,
      loaded: false,
      failed: false,
      stopCount: 0,
      load() { this.loaded = true; return Promise.resolve(this); },
      /** Stopping audio silences it without an "end" event, as in core. */
      stop(options) {
        this.lastStopOptions = options;
        this.playing = false;
        this.stopCount++;
        if ( doc.endTimer ) clock.clearTimeout(doc.endTimer);
        doc.endTimer = null;
        doc.audioLooping = false;
      }
    };
  }

  updateSource(changes) { deepMerge(this, expandObject(changes)); }

  /** Direct update: fires the sound's own hooks. */
  update(data) {
    const changed = expandObject(data);
    Hooks.call("preUpdatePlaylistSound", this, changed, {}, "user");
    this._apply(changed);
    this.parent.prepareDerivedData();
    Hooks.callAll("updatePlaylistSound", this, changed, {}, "user");
    this.sync();
    return Promise.resolve(this);
  }

  _apply(changed) {
    deepMerge(this, changed);
  }

  /** Simulated audio: a one-shot ends on its own after its duration. */
  sync() {
    this.sound ||= this._createSound();
    if ( !this.playing ) {
      if ( this.endTimer ) clock.clearTimeout(this.endTimer);
      this.endTimer = null;
      this.audioLooping = false;
      this.sound.playing = false;
      return;
    }
    if ( this.audioLooping && !this.repeat ) {
      // Core's "loop change case": the current pass finishes, then the sound ends.
      this.audioLooping = false;
      this.#scheduleEnd();
      return;
    }
    if ( this.endTimer || this.audioLooping ) return;  // already sounding
    this.playCount++;
    this.sound.playing = true;
    if ( this.repeat ) {
      this.audioLooping = true;
      return;
    }
    this.#scheduleEnd();
  }

  #scheduleEnd() {
    this.endTimer = clock.setTimeout(() => {
      this.endTimer = null;
      this.sound.playing = false;
      this.endCount = (this.endCount ?? 0) + 1;
      this.parent._onSoundEnd(this);   // core: PlaylistSound#_onEnd -> Playlist#_onSoundEnd (owners only)
    }, this.duration);
  }

  /** Is audio coming out right now? */
  get audible() {
    return !!(this.endTimer || this.audioLooping);
  }
}

/** Core v14 Playlist behaviour. */
export class Playlist {
  constructor({_id, name="Playlist", mode=MODES.SIMULTANEOUS, flags={}, sounds=[]}) {
    this._id = this.id = _id;
    this.name = name;
    this.mode = mode;
    this.flags = structuredClone(flags);
    this.sounds = new Collection();
    const Sound = CONFIG.PlaylistSound.documentClass;
    for ( const s of sounds ) this.sounds.set(s._id, new Sound(s, this));
    this.prepareDerivedData();
  }

  get isOwner() { return game.user.isGM; }

  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }

  setFlag(scope, key, value) { return this.update({flags: {[scope]: {[key]: value}}}); }

  prepareDerivedData() {
    this.playing = this.sounds.some(s => s.playing);
  }

  /** Sorted order; Shuffle uses the same order here, which is enough for the module's purposes. */
  get playbackOrder() {
    return this.sounds.map(s => s.id);
  }

  async playAll() {
    if ( this.sounds.size === 0 ) return this;
    const updateData = {playing: true};
    switch ( this.mode ) {
      case MODES.DISABLED: updateData.playing = false; break;
      case MODES.SEQUENTIAL:
      case MODES.SHUFFLE: {
        const paused = this.sounds.find(s => s.pausedTime);
        const nextId = paused?.id || this.playbackOrder[0];
        updateData.sounds = this.sounds.map(s => ({_id: s.id, playing: s.id === nextId}));
        break;
      }
      case MODES.SIMULTANEOUS:
        updateData.sounds = this.sounds.map(s => ({_id: s.id, playing: true}));
        break;
    }
    return this.update(updateData);
  }

  async playNext(soundId, {direction=1}={}) {
    if ( ![MODES.SEQUENTIAL, MODES.SHUFFLE].includes(this.mode) ) return null;
    if ( !soundId ) soundId = this.sounds.find(s => s.playing)?.id ?? null;
    let next = direction === 1 ? this._getNextSound(soundId) : this._getPreviousSound(soundId);
    if ( !this.playing ) next = null;
    const sounds = this.sounds.map(s => ({_id: s.id, playing: s.id === next?.id, pausedTime: null}));
    return this.update({sounds});
  }

  _getNextSound(soundId) {
    const order = this.playbackOrder;
    let idx = order.indexOf(soundId);
    if ( idx === order.length - 1 ) idx = -1;
    return this.sounds.get(order[idx + 1]);
  }

  _getPreviousSound(soundId) {
    const order = this.playbackOrder;
    let idx = order.indexOf(soundId);
    if ( idx === -1 ) idx = 1;
    else if ( idx === 0 ) idx = order.length;
    return this.sounds.get(order[idx - 1]);
  }

  async playSound(sound) {
    const updates = {playing: true};
    switch ( this.mode ) {
      case MODES.SEQUENTIAL:
      case MODES.SHUFFLE:
        updates.sounds = this.sounds.map(s => {
          const isPlaying = s.id === sound.id;
          return {_id: s.id, playing: isPlaying, pausedTime: isPlaying ? s.pausedTime : null};
        });
        break;
      default:
        updates.sounds = [{_id: sound.id, playing: true}];
    }
    return this.update(updates);
  }

  async stopSound(sound) {
    return this.update({
      playing: this.sounds.some(s => (s.id !== sound.id) && s.playing),
      sounds: [{_id: sound.id, playing: false, pausedTime: null}]
    });
  }

  async stopAll() {
    return this.update({playing: false, sounds: this.sounds.map(s => ({_id: s.id, playing: false}))});
  }

  async _onSoundEnd(sound) {
    switch ( this.mode ) {
      case MODES.SEQUENTIAL:
      case MODES.SHUFFLE:
        return this.playNext(sound.id);
      case MODES.SIMULTANEOUS:
      case MODES.DISABLED: {
        const updates = {playing: true, sounds: [{_id: sound.id, playing: false, pausedTime: null}]};
        for ( const s of this.sounds ) {
          if ( (s !== sound) && s.playing ) break;
          updates.playing = false;
        }
        return this.update(updates);
      }
    }
  }

  /** Update through the playlist: only the playlist's hooks fire. */
  update(data) {
    const changed = expandObject(data);
    Hooks.call("preUpdatePlaylist", this, changed, {}, "user");
    const {sounds, playing, ...rest} = changed;
    deepMerge(this, rest);
    for ( const s of sounds ?? [] ) this.sounds.get(s._id)?._apply(s);
    this.prepareDerivedData();
    Hooks.callAll("updatePlaylist", this, changed, {}, "user");
    if ( sounds || ("mode" in changed) ) this.sounds.forEach(s => s.sync());
    return Promise.resolve(this);
  }
}

/** Core's PlaylistDirectory, reduced to what the module touches. */
export class PlaylistDirectory {
  static DEFAULT_OPTIONS = {actions: {soundRepeat() {}, soundPlay() {}, soundStop() {}, soundPause() {}}};
  constructor() { this.element = null; }
  async _onRender() { this.baseRendered = true; }
  _replaceHTML() { this.htmlReplaced = true; }
  /** Core rewrites each Currently Playing timer from the audio's current time: "∞" when not sounding. */
  updateTimestamps() {
    for ( const el of this.element.querySelectorAll(".current") ) el.textContent = "∞";
    for ( const el of this.element.querySelectorAll(".duration") ) el.textContent = "0:13";
  }
}

/* ---------------------------------------- */
/*  Minimal DOM                              */
/* ---------------------------------------- */

class ClassList extends Set {
  contains(c) { return this.has(c); }
  replace(a, b) { if ( !this.has(a) ) return false; this.delete(a); this.add(b); return true; }
  toggle(c, force) { const on = force ?? !this.has(c); if ( on ) this.add(c); else this.delete(c); return on; }
}

export class El {
  constructor(tag, {classes=[], dataset={}, attrs={}, children=[]}={}) {
    this.tagName = tag.toUpperCase();
    this.classList = new ClassList(classes);
    this.dataset = {...dataset};
    this.attrs = {...attrs};
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.hidden = false;
    this.checked = !!attrs.checked;
    for ( const c of children ) this.append(c);
  }
  get name() { return this.attrs.name; }
  get textContent() { return this.text ?? ""; }
  set textContent(value) { this.text = String(value); }
  append(...els) {
    for ( const e of els ) {
      if ( typeof e === "string" ) { this.text = (this.text ?? "") + e; continue; }
      e.parent = this;
      this.children.push(e);
    }
  }
  after(...els) {
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, ...els);
    for ( const e of els ) e.parent = this.parent;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  hasAttribute(k) { return k in this.attrs; }
  cloneNode(deep=false) {
    const copy = new El(this.tagName, {classes: [...this.classList], dataset: this.dataset, attrs: this.attrs});
    if ( deep ) for ( const c of this.children ) copy.append(c.cloneNode(true));
    return copy;
  }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) { for ( const fn of this.listeners[type] ?? [] ) fn({target: this}); }
  *walk() { for ( const c of this.children ) { yield c; yield* c.walk(); } }
  matches(sel) {
    // Supports ".a", ".a[data-x]", "[name=\"x\"]", "[data-action=\"x\"]"
    const m = sel.match(/^(\.[\w-]+)?(\[([\w-]+)(="([^"]*)")?\])?$/);
    if ( !m ) throw new Error(`Unsupported selector ${sel}`);
    if ( m[1] && !this.classList.has(m[1].slice(1)) ) return false;
    if ( m[3] ) {
      const key = m[3];
      let value;
      if ( key.startsWith("data-") ) value = this.dataset[key.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())];
      else value = this.attrs[key];
      if ( value === undefined ) return false;
      if ( (m[5] !== undefined) && (value !== m[5]) ) return false;
    }
    return true;
  }
  querySelectorAll(sel) { return [...this.walk()].filter(e => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { let e = this; while ( e ) { if ( e.matches(sel) ) return e; e = e.parent; } return null; }
}

/** foundry.applications.fields, reduced. */
const fields = {
  createCheckboxInput: ({name, value}) => new El("input", {attrs: {type: "checkbox", name, checked: !!value}}),
  createSelectInput: ({name, value, options}) => {
    const el = new El("select", {attrs: {name}});
    el.value = value;
    el.options = options;
    return el;
  },
  createFormGroup: ({label, input, hidden}) => {
    const group = new El("div", {classes: ["form-group"], children: [new El("label"), new El("div", {classes: ["form-fields"], children: [input].flat()})]});
    group.label = label;
    group.hidden = hidden ?? false;
    return group;
  }
};

/* ---------------------------------------- */
/*  Globals                                  */
/* ---------------------------------------- */

export function installGlobals() {
  globalThis.realSetTimeout ??= globalThis.setTimeout;
  globalThis.setTimeout = clock.setTimeout;
  globalThis.clearTimeout = clock.clearTimeout;
  globalThis.CONST = {PLAYLIST_MODES: MODES};
  globalThis.foundry = {utils: {getProperty, hasProperty, setProperty, expandObject}, applications: {fields}};
  globalThis.Hooks = Hooks;
  globalThis.document = {createElement: tag => new El(tag)};
  globalThis.CONFIG = {Playlist: {documentClass: Playlist}, PlaylistSound: {documentClass: PlaylistSound},
    ui: {playlists: PlaylistDirectory}};
  const playlists = new Collection();
  globalThis.game = {
    user: {isGM: true, isActiveGM: true},
    playlists,
    audio: {locked: false},
    i18n: {localize: k => k}
  };
}

export {MODES};
