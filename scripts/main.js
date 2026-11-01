/**
 * Vvulfmann's Playlist Randomizer
 *
 * Adds a "Randomize" option to looped playlist sounds. A randomized loop plays through once,
 * waits a random time chosen from its Frequency, then plays again, for as long as the sound
 * is playing in its playlist.
 *
 * How it fits into core:
 * - The sound's own `repeat` stays on. Randomizing only changes how the loop is played.
 * - Every client plays a randomized sound with `loop: false` (see #sync below).
 * - When the sound reaches its natural end, the active GM records the time of the next play
 *   in the sound's flags (`nextAt`) instead of letting core mark it as stopped.
 * - While `nextAt` is set, every client keeps the sound silent. The active GM clears
 *   `nextAt` when the wait is over, and every client starts the sound again.
 * - Because `nextAt` is stored on the document, waits survive a reload.
 */

const MODULE_ID = "vvulfmanns-playlist-randomizer";

/** Wait between plays, in seconds, for each frequency. */
const FREQUENCIES = {
  often: [10, 30],
  sometimes: [30, 120],
  seldom: [120, 360]
};
const DEFAULT_FREQUENCY = "sometimes";

const FLAG = key => `flags.${MODULE_ID}.${key}`;

/* -------------------------------------------- */
/*  State helpers                               */
/* -------------------------------------------- */

/**
 * Playlist modes in which randomizing applies. In Sequential and Shuffle playlists the end of a
 * sound advances to the next track, so randomizing is left out there.
 */
function supportsMode(playlist) {
  const { SIMULTANEOUS, DISABLED } = CONST.PLAYLIST_MODES;
  return [SIMULTANEOUS, DISABLED].includes(playlist?.mode);
}

/** Read this module's flags from a sound document or from plain sound data. */
function flagsOf(data) {
  return foundry.utils.getProperty(data, `flags.${MODULE_ID}`) ?? {};
}

/** Whether the sound is set up for randomizing in its sound window (shows the dice). */
function isConfigured(sound, data = sound) {
  return !!(data.repeat && flagsOf(data).randomize && supportsMode(sound.parent));
}

/** Whether the sound is currently being played as a randomized loop. */
function isRandomized(sound, data = sound) {
  return isConfigured(sound, data) && (flagsOf(data).active !== false);
}

/** Whether a randomized sound is between plays. */
function isWaiting(sound) {
  return sound.playing && isRandomized(sound) && Number.isFinite(flagsOf(sound).nextAt);
}

/** Pick a random wait, in milliseconds, from the sound's frequency. */
function randomDelay(sound) {
  const [min, max] = FREQUENCIES[flagsOf(sound).frequency] ?? FREQUENCIES[DEFAULT_FREQUENCY];
  return Math.round((min + (Math.random() * (max - min))) * 1000);
}

function isActiveGM() {
  return !!game.users.activeGM?.isSelf;
}

/* -------------------------------------------- */
/*  Method wrappers                             */
/* -------------------------------------------- */

/**
 * Wrap a prototype method. Uses libWrapper when it is active, otherwise patches directly.
 * @param {string} target   Dotted path from globalThis to the method.
 * @param {Function} fn     Wrapper called as fn(wrapped, ...args) with `this` bound.
 */
function wrap(target, fn) {
  if ( game.modules.get("lib-wrapper")?.active && globalThis.libWrapper ) {
    globalThis.libWrapper.register(MODULE_ID, target, fn, "MIXED");
    return;
  }
  const parts = target.split(".");
  const name = parts.pop();
  const owner = foundry.utils.getProperty(globalThis, parts.join("."));
  const original = owner[name];
  owner[name] = function(...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}

/**
 * PlaylistSound#sync: play randomized sounds once per pass and keep them silent while waiting.
 * Mirrors core's sync for the playing case, with looping turned off.
 */
function syncWrapper(wrapped, ...args) {
  if ( !this.playing || !isRandomized(this) ) return wrapped(...args);
  if ( game.audio.locked ) return;

  // Between plays: make sure nothing is audible
  if ( isWaiting(this) ) {
    if ( this.sound?.playing ) this.sound.stop({ fade: this.fadeDuration, volume: 0 });
    return;
  }

  this.sound ||= this._createSound();
  const sound = this.sound;
  if ( !sound || sound.failed ) return;

  // Already playing (for example randomizing was just switched on): finish this pass, then wait
  if ( sound.playing ) {
    sound.loop = false;
    sound.fade(this.volume, { duration: 500 });
    return;
  }

  sound.load({
    autoplay: true,
    autoplayOptions: {
      loop: false,
      volume: this.volume,
      fade: this.fadeDuration,
      offset: this.pausedTime || undefined
    }
  });
}

/**
 * Playlist#_onSoundEnd: when a randomized sound finishes a pass, schedule the next one instead of
 * stopping it. Only the active GM writes the change.
 */
async function onSoundEndWrapper(wrapped, sound, ...args) {
  if ( !sound?.playing || !isRandomized(sound) ) return wrapped(sound, ...args);
  if ( !isActiveGM() || isWaiting(sound) ) return;
  return sound.update({ [FLAG("nextAt")]: Date.now() + randomDelay(sound) });
}

/* -------------------------------------------- */
/*  Scheduling (active GM only)                 */
/* -------------------------------------------- */

const timers = new Map();

function clearTimer(sound) {
  const handle = timers.get(sound.uuid);
  if ( handle ) clearTimeout(handle);
  timers.delete(sound.uuid);
}

function schedule(sound) {
  clearTimer(sound);
  if ( !isActiveGM() || !isWaiting(sound) ) return;
  const nextAt = flagsOf(sound).nextAt;
  const handle = setTimeout(() => fire(sound.uuid, nextAt), Math.max(0, nextAt - Date.now()));
  timers.set(sound.uuid, handle);
}

async function fire(uuid, nextAt) {
  timers.delete(uuid);
  const sound = fromUuidSync(uuid);
  if ( !sound || !isWaiting(sound) || (flagsOf(sound).nextAt !== nextAt) ) return;
  await sound.update({ [FLAG("nextAt")]: null });
}

function scheduleAll() {
  for ( const playlist of game.playlists ) {
    for ( const sound of playlist.sounds ) schedule(sound);
  }
}

/* -------------------------------------------- */
/*  Update hooks                                */
/* -------------------------------------------- */

/**
 * Playlist updates carry sound changes for Play All, Play Sound, Stop Sound and Stop All.
 * - Starting a whole playlist: randomized sounds begin with a wait, so they don't all fire at once.
 * - Starting one sound: it plays right away.
 * - Stopping: any pending wait is cleared.
 */
function onPreUpdatePlaylist(playlist, changed) {
  if ( !Array.isArray(changed.sounds) ) return;
  const startingPlaylist = (changed.playing === true) && !playlist.playing && (changed.sounds.length > 1);
  for ( const change of changed.sounds ) {
    const sound = playlist.sounds.get(change._id);
    if ( !sound || !("playing" in change) ) continue;
    if ( change.playing === false ) {
      if ( flagsOf(sound).nextAt != null ) foundry.utils.setProperty(change, FLAG("nextAt"), null);
    }
    else if ( (change.playing === true) && !sound.playing && isRandomized(sound) ) {
      const nextAt = startingPlaylist ? Date.now() + randomDelay(sound) : null;
      foundry.utils.setProperty(change, FLAG("nextAt"), nextAt);
    }
  }
}

/** Direct sound updates: the sound window, the dice toggle, pause, and our own scheduling. */
function onPreUpdatePlaylistSound(sound, changed) {
  const flags = flagsOf(sound);
  const changedFlags = flagsOf(changed);

  // Ticking Randomize in the sound window switches the dice on
  if ( (changedFlags.randomize === true) && !flags.randomize ) {
    foundry.utils.setProperty(changed, FLAG("active"), true);
  }

  // Starting or stopping playback directly clears any pending wait
  if ( ("playing" in changed) && (changed.playing !== sound.playing) ) {
    if ( flags.nextAt != null ) foundry.utils.setProperty(changed, FLAG("nextAt"), null);
    return;
  }

  // Randomizing switched off (Repeat, Randomize, the dice): drop the wait so core resumes the loop
  if ( "nextAt" in changedFlags ) return;
  const next = foundry.utils.mergeObject(sound.toObject(), changed, { inplace: false });
  if ( (flags.nextAt != null) && !isRandomized(sound, next) ) {
    foundry.utils.setProperty(changed, FLAG("nextAt"), null);
  }
}

/* -------------------------------------------- */
/*  Playlists sidebar: dice toggle              */
/* -------------------------------------------- */

function onRenderPlaylistDirectory(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if ( !root ) return;
  for ( const button of root.querySelectorAll('.sound [data-action="soundRepeat"]') ) {
    const { playlistId, soundId } = button.closest(".sound")?.dataset ?? {};
    const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
    if ( !sound || !isConfigured(sound) ) continue;
    const active = flagsOf(sound).active !== false;
    const label = game.i18n.localize(active ? "VPR.Randomize.On" : "VPR.Randomize.Off");

    // Swap the loop icon for a dice, keeping core's button and its classes
    const icon = button.matches("[class*='fa-']") ? button : (button.querySelector("[class*='fa-']") ?? button);
    for ( const cls of [...icon.classList] ) {
      if ( cls.startsWith("fa-") && !["fa-solid", "fa-regular", "fa-fw"].includes(cls) ) icon.classList.remove(cls);
    }
    icon.classList.add("fa-dice");
    button.classList.toggle("inactive", !active);
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(active));

    // Take the click away from core's loop toggle
    delete button.dataset.action;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      sound.update({ [FLAG("active")]: !active });
    });
  }
}

/* -------------------------------------------- */
/*  Sound window: Randomize and Frequency       */
/* -------------------------------------------- */

function onRenderPlaylistSoundConfig(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const form = root?.matches("form") ? root : root?.querySelector("form");
  const repeatInput = form?.querySelector('[name="repeat"]');
  const repeatGroup = repeatInput?.closest(".form-group");
  if ( !repeatGroup || form.querySelector(`[name="${FLAG("randomize")}"]`) ) return;

  const { createFormGroup, createCheckboxInput, createSelectInput } = foundry.applications.fields;
  const flags = flagsOf(app.document);

  const randomizeGroup = createFormGroup({
    label: "VPR.Randomize.Label",
    hint: "VPR.Randomize.Hint",
    localize: true,
    input: createCheckboxInput({ name: FLAG("randomize"), value: !!flags.randomize })
  });
  const frequencyGroup = createFormGroup({
    label: "VPR.Frequency.Label",
    hint: "VPR.Frequency.Hint",
    localize: true,
    input: createSelectInput({
      name: FLAG("frequency"),
      value: flags.frequency ?? DEFAULT_FREQUENCY,
      options: Object.keys(FREQUENCIES).map(key => ({ value: key, label: `VPR.Frequency.${key}` })),
      localize: true
    })
  });
  repeatGroup.after(randomizeGroup, frequencyGroup);

  const randomizeInput = form.querySelector(`[name="${FLAG("randomize")}"]`);
  const refresh = () => {
    const repeat = !!(repeatInput.checked ?? repeatInput.value);
    randomizeGroup.hidden = !repeat;
    frequencyGroup.hidden = !(repeat && randomizeInput.checked);
    app.setPosition?.({ height: "auto" });
  };
  repeatInput.addEventListener("change", refresh);
  randomizeInput.addEventListener("change", refresh);
  refresh();
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("setup", () => {
  wrap("CONFIG.PlaylistSound.documentClass.prototype.sync", syncWrapper);
  wrap("CONFIG.Playlist.documentClass.prototype._onSoundEnd", onSoundEndWrapper);
});

Hooks.once("ready", scheduleAll);
Hooks.on("preUpdatePlaylist", onPreUpdatePlaylist);
Hooks.on("preUpdatePlaylistSound", onPreUpdatePlaylistSound);
Hooks.on("updatePlaylistSound", sound => schedule(sound));
Hooks.on("updatePlaylist", playlist => playlist.sounds.forEach(schedule));
Hooks.on("deletePlaylistSound", sound => clearTimer(sound));
Hooks.on("renderPlaylistDirectory", onRenderPlaylistDirectory);
Hooks.on("renderPlaylistSoundConfig", onRenderPlaylistSoundConfig);
