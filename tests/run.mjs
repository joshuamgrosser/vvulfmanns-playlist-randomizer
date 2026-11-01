/**
 * Behaviour tests against a mocked Foundry v14 core (see harness.mjs).
 * Run with: npm test
 */
import assert from "node:assert/strict";
import {El, Hooks, MODES, Playlist, PlaylistDirectory, PlaylistSound, clock, installGlobals} from "./harness.mjs";

installGlobals();
Math.random = () => 0.5;   // deterministic gaps: Often = 20 s, Sometimes = 75 s, Seldom = 240 s
const {scheduler} = await import("../scripts/main.js");
const config = await import("../scripts/config.mjs");
const {MODULE_ID, FREQUENCIES, randomDelayMs} = config;

Hooks.callAll("init");

const SEC = 1000;
const SOUND_LEN = 5 * SEC;           // every test sound lasts 5 s
const OFTEN = 20 * SEC;
const SOMETIMES = 75 * SEC;
const flag = (sound, key) => sound.flags?.[MODULE_ID]?.[key];
const resting = sound => flag(sound, "resting") === true;

/** Build a fresh world with one playlist. */
function world({mode=MODES.SIMULTANEOUS, sounds, flags}={}) {
  clock.reset();
  scheduler.clearAll();
  game.playlists.clear();
  game.user.isActiveGM = true;
  const Cls = CONFIG.Playlist.documentClass;
  const playlist = new Cls({_id: "pl1", mode, flags, sounds: sounds ?? [
    {_id: "loop", name: "Low Wind", repeat: true},
    {_id: "bell", name: "Belfry Bell", flags: {[MODULE_ID]: {randomize: true}}},
    {_id: "raven", name: "Raven Caw", flags: {[MODULE_ID]: {randomize: true, frequency: "often"}}},
    {_id: "slam", name: "Door Slam"}
  ]});
  game.playlists.set(playlist.id, playlist);
  return {playlist, s: id => playlist.sounds.get(id)};
}

/** A Sequential-style playlist of three tracks, the middle one randomized. */
const TRACKS = [
  {_id: "a", name: "Track A"},
  {_id: "b", name: "Track B", flags: {[MODULE_ID]: {randomize: true, frequency: "often"}}},
  {_id: "c", name: "Track C"}
];

const tests = [];
const test = (name, fn) => tests.push({name, fn});

/* ---------------------------------------- */
/*  Setup                                   */
/* ---------------------------------------- */

test("init swaps in the extended classes and registers hooks", () => {
  assert.ok(CONFIG.Playlist.documentClass.prototype instanceof Playlist);
  assert.ok(CONFIG.PlaylistSound.documentClass.prototype instanceof PlaylistSound);
  assert.ok(CONFIG.ui.playlists.prototype instanceof PlaylistDirectory);
  assert.equal(typeof CONFIG.ui.playlists.DEFAULT_OPTIONS.actions.soundRandomize, "function");
  for ( const h of ["preUpdatePlaylist", "preUpdatePlaylistSound", "preCreatePlaylistSound", "renderPlaylistSoundConfig",
    "updatePlaylist", "updatePlaylistSound", "createPlaylistSound", "deletePlaylistSound", "userConnected", "ready"] ) {
    assert.ok(Hooks.events.get(h)?.length, `hook ${h} registered`);
  }
});

test("random gaps stay inside each frequency's range", () => {
  for ( const [key, [min, max]] of Object.entries(FREQUENCIES) ) {
    const sound = {flags: {[MODULE_ID]: {frequency: key}}};
    assert.equal(randomDelayMs(sound, () => 0), min * SEC);
    assert.ok(randomDelayMs(sound, () => 0.999999) <= max * SEC);
  }
  assert.equal(randomDelayMs({flags: {}}, () => 0), 30 * SEC, "default is Sometimes");
  assert.equal(randomDelayMs({flags: {[MODULE_ID]: {frequency: "bogus"}}}, () => 0), 30 * SEC);
});

/* ---------------------------------------- */
/*  Simultaneous                            */
/* ---------------------------------------- */

test("Simultaneous Play All: loops and one-shots start, randomized sounds start with a gap", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  assert.equal(s("loop").audible, true);
  assert.equal(s("slam").audible, true);
  for ( const id of ["bell", "raven"] ) {
    assert.equal(s(id).playing, true, `${id} counts as playing, so its button shows Stop`);
    assert.equal(resting(s(id)), true, `${id} rests first`);
    assert.equal(s(id).audible, false, `${id} is silent`);
    assert.ok(scheduler.timers.has(s(id).uuid), `${id} has a gap pending`);
  }
  assert.equal(playlist.playing, true);
});

test("a randomized sound plays after its gap, rests when it ends, and plays again", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  const raven = s("raven");
  clock.advance(OFTEN);
  assert.equal(raven.audible, true, "plays after its first gap");
  assert.equal(resting(raven), false);
  clock.advance(SOUND_LEN);
  assert.equal(raven.audible, false);
  assert.equal(raven.playing, true, "still on: core keeps showing Stop");
  assert.equal(resting(raven), true);
  clock.advance(OFTEN);
  assert.equal(raven.audible, true, "plays again");
  assert.equal(raven.playCount, 2);
});

test("a quiet gap keeps the playlist playing", async () => {
  const {playlist, s} = world({sounds: [TRACKS[1]]});
  await playlist.playAll();
  assert.equal(s("b").audible, false);
  assert.equal(playlist.playing, true);
});

test("a sound never overlaps itself: each gap counts from its end", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  clock.advance(OFTEN + SOUND_LEN + OFTEN - 1);
  assert.equal(s("raven").playCount, 1, "second play waits a full gap after the first ends");
  clock.advance(1);
  assert.equal(s("raven").playCount, 2);
});

test("Play on a stopped randomized sound plays it now, then keeps going", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  assert.equal(raven.audible, true, "plays at once, like Repeat");
  clock.advance(SOUND_LEN + OFTEN);
  assert.equal(raven.playCount, 2);
  assert.equal(s("bell").playing, false, "other sounds are left alone");
});

test("Stop on a randomized sound ends it, mid-play or mid-gap", async () => {
  for ( const when of ["mid-play", "mid-gap"] ) {
    const {playlist, s} = world();
    const raven = s("raven");
    await playlist.playSound(raven);
    if ( when === "mid-gap" ) clock.advance(SOUND_LEN);
    await playlist.stopSound(raven);
    assert.equal(raven.playing, false, when);
    assert.equal(resting(raven), false, when);
    assert.equal(scheduler.timers.has(raven.uuid), false, when);
    clock.advance(10 * 60 * SEC);
    assert.equal(raven.playCount, 1, `${when}: never comes back`);
  }
});

test("Stop All stops everything and clears every gap", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  clock.advance(OFTEN);
  await playlist.stopAll();
  assert.equal(playlist.playing, false);
  for ( const sound of playlist.sounds ) {
    assert.equal(sound.playing, false);
    assert.equal(resting(sound), false);
  }
  assert.equal(scheduler.timers.size, 0);
  const plays = s("raven").playCount + s("bell").playCount;
  clock.advance(10 * 60 * SEC);
  assert.equal(s("raven").playCount + s("bell").playCount, plays);
});

test("pause mid-play, then resume: the gaps carry on after that play", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  clock.advance(2 * SEC);
  await raven.update({playing: false, pausedTime: 2});
  assert.equal(raven.audible, false);
  assert.equal(resting(raven), false);
  await playlist.playSound(raven);
  assert.equal(raven.pausedTime, 2, "resumes from where it paused");
  clock.advance(SOUND_LEN);
  assert.equal(resting(raven), true, "rests after the resumed play");
  assert.equal(raven.pausedTime, null, "the next play starts from the beginning");
  clock.advance(OFTEN);
  assert.equal(raven.audible, true);
});

test("an end reported by several owners is harmless", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  clock.advance(SOUND_LEN);
  await playlist._onSoundEnd(raven);   // a second owner's client reports the same end
  assert.equal(resting(raven), true);
  assert.equal(scheduler.timers.size, 1);
});

/* ---------------------------------------- */
/*  Sequential, Shuffle, Soundboard          */
/* ---------------------------------------- */

for ( const [label, mode] of [["Sequential", MODES.SEQUENTIAL], ["Shuffle", MODES.SHUFFLE]] ) {
  test(`${label}: a randomized track plays at once, then holds the playlist with gaps`, async () => {
    const {playlist, s} = world({mode, sounds: TRACKS});
    await playlist.playAll();
    clock.advance(SOUND_LEN);
    assert.equal(s("b").audible, true, "reached in order and played at once");
    assert.equal(resting(s("b")), false);
    clock.advance(SOUND_LEN);
    assert.equal(s("b").playing, true, "holds on the randomized track");
    assert.equal(resting(s("b")), true);
    assert.equal(s("c").playing, false, "doesn't advance");
    assert.equal(playlist.playing, true);
    clock.advance(OFTEN);
    assert.equal(s("b").playCount, 2, "plays again after the gap");
  });

  test(`${label}: Next moves on from a randomized track and ends its gaps`, async () => {
    const {playlist, s} = world({mode, sounds: TRACKS});
    await playlist.playSound(s("b"));
    clock.advance(SOUND_LEN);
    assert.equal(resting(s("b")), true);
    await playlist.playNext();
    assert.equal(s("b").playing, false);
    assert.equal(resting(s("b")), false);
    assert.equal(scheduler.timers.size, 0);
    assert.equal(s("c").audible, true);
  });
}

test("Sequential: switching the randomized track to Once during a gap moves to the next track", async () => {
  const {playlist, s} = world({mode: MODES.SEQUENTIAL, sounds: TRACKS});
  await playlist.playSound(s("b"));
  clock.advance(SOUND_LEN);
  await s("b").setFlag(MODULE_ID, "randomize", false);
  assert.equal(s("b").playing, false);
  assert.equal(resting(s("b")), false);
  assert.equal(s("c").audible, true);
});

test("Sequential: ending a gap for Once only advances one track, however many changes arrive", async () => {
  const {playlist, s} = world({mode: MODES.SEQUENTIAL, sounds: TRACKS});
  await playlist.playSound(s("b"));
  clock.advance(SOUND_LEN);
  s("b").flags[MODULE_ID].randomize = false;   // as if a change landed while another is in flight
  const first = scheduler.check(s("b"));
  scheduler.check(s("b"));
  await first;
  assert.equal(s("c").audible, true);
  assert.equal(s("a").playing, false, "didn't wrap around to the first track");
});

test("Soundboard Only: Play All does nothing, and each sound runs on its own", async () => {
  const {playlist, s} = world({mode: MODES.DISABLED});
  await playlist.playAll();
  assert.equal(playlist.playing, false);
  const raven = s("raven");
  await playlist.playSound(raven);
  clock.advance(SOUND_LEN);
  assert.equal(raven.playing, true);
  assert.equal(resting(raven), true);
  clock.advance(OFTEN);
  assert.equal(raven.playCount, 2);
  await playlist.stopSound(raven);
  assert.equal(raven.playing, false);
  assert.equal(scheduler.timers.size, 0);
});

/* ---------------------------------------- */
/*  Switching between Once, Repeat and Randomize                               */
/* ---------------------------------------- */

test("dice on a looping sound: Repeat goes off, the pass finishes, then gaps begin", async () => {
  const {playlist, s} = world();
  const loop = s("loop");
  await playlist.playSound(loop);
  assert.equal(loop.audible, true);
  await loop.setFlag(MODULE_ID, "randomize", true);
  assert.equal(loop.repeat, false, "Repeat turned off");
  assert.equal(loop.audible, true, "current pass keeps going");
  clock.advance(SOUND_LEN);
  assert.equal(loop.playing, true);
  assert.equal(resting(loop), true);
  clock.advance(SOMETIMES);
  assert.equal(loop.audible, true);
});

test("Repeat on during a gap: the loop starts at once", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  clock.advance(SOUND_LEN);
  await raven.update({repeat: true});
  assert.equal(flag(raven, "randomize"), false, "Randomize turned off");
  assert.equal(resting(raven), false);
  assert.equal(raven.audible, true, "looping now");
  assert.equal(scheduler.timers.size, 0);
});

test("dice off during a gap (Simultaneous): the sound stops", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  clock.advance(SOUND_LEN);
  await raven.setFlag(MODULE_ID, "randomize", false);
  assert.equal(raven.playing, false);
  assert.equal(resting(raven), false);
  assert.equal(scheduler.timers.size, 0);
});

test("dice off mid-play: that play finishes and ends like a one-shot", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  await raven.setFlag(MODULE_ID, "randomize", false);
  assert.equal(raven.audible, true);
  clock.advance(SOUND_LEN);
  assert.equal(raven.playing, false);
  clock.advance(10 * 60 * SEC);
  assert.equal(raven.playCount, 1);
});

test("Frequency: a change during a gap redraws it, and switching off and on keeps the choice", async () => {
  const {playlist, s} = world();
  const bell = s("bell");
  await playlist.playSound(bell);
  clock.advance(SOUND_LEN);
  await bell.setFlag(MODULE_ID, "frequency", "often");
  clock.advance(OFTEN);
  assert.equal(bell.playCount, 2, "new, shorter gap took effect at once");
  await bell.setFlag(MODULE_ID, "randomize", false);
  await bell.setFlag(MODULE_ID, "randomize", true);
  assert.equal(config.frequencyOf(bell), "often", "kept");
  assert.equal(config.frequencyOf(s("slam")), "sometimes", "never configured: Sometimes");
});

test("a playlist update that changes mode and a frequency together still redraws that gap", async () => {
  const {playlist, s} = world();
  const bell = s("bell");
  await playlist.playSound(bell);
  clock.advance(SOUND_LEN);
  await playlist.update({mode: MODES.DISABLED, sounds: [{_id: "bell", flags: {[MODULE_ID]: {frequency: "often"}}}]});
  clock.advance(OFTEN);
  assert.equal(bell.playCount, 2, "gap redrawn from Often, not left on Sometimes");
});

/* ---------------------------------------- */
/*  Rules                                    */
/* ---------------------------------------- */

test("Repeat and Randomize stay exclusive on direct, playlist and create paths", async () => {
  const {playlist, s} = world();
  await s("loop").setFlag(MODULE_ID, "randomize", true);
  assert.equal(s("loop").repeat, false);
  await s("bell").update({repeat: true});
  assert.equal(flag(s("bell"), "randomize"), false);
  await playlist.update({sounds: [{_id: "slam", repeat: true, flags: {[MODULE_ID]: {randomize: true}}}]});
  assert.equal(s("slam").repeat, false, "both on: Randomize wins");
  assert.equal(flag(s("slam"), "randomize"), true);
  await playlist.update({sounds: [{_id: "raven", repeat: true}]});
  assert.equal(flag(s("raven"), "randomize"), false);
  const created = new PlaylistSound({_id: "new", repeat: true, flags: {[MODULE_ID]: {randomize: true, resting: true}}}, playlist);
  Hooks.call("preCreatePlaylistSound", created, {}, {}, "user");
  assert.equal(created.repeat, false);
  assert.equal(resting(created), false, "a stopped sound can't be resting");
});

test("a resting sound stays silent but keeps an audio object", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  const bell = s("bell");
  bell.sync();
  assert.equal(bell.audible, false);
  assert.equal(bell.playCount, 0);
  assert.ok(bell.sound, "so Currently Playing can list it with a volume slider");
});

test("entering a gap silences a client whose audio is still playing", async () => {
  const {playlist, s} = world();
  const raven = s("raven");
  await playlist.playSound(raven);
  assert.equal(raven.sound.playing, true);
  // Another owner's client reported the end first; this client's audio is still sounding.
  await playlist._onSoundEnd(raven);
  assert.equal(resting(raven), true);
  assert.equal(raven.sound.playing, false, "stopped");
  assert.equal(raven.sound.stopCount, 1);
  assert.equal(raven.audible, false);
  clock.advance(OFTEN);
  assert.equal(raven.audible, true, "plays again after the gap");
  assert.equal(raven.playCount, 2);
});

test("beta flags (dice enabled, playlist armed) are ignored", async () => {
  const {playlist, s} = world({flags: {[MODULE_ID]: {armed: true}}, sounds: [
    {_id: "old", flags: {[MODULE_ID]: {randomize: true, enabled: false, frequency: "often"}}}
  ]});
  assert.equal(playlist.playing, false);
  await playlist.playSound(s("old"));
  clock.advance(SOUND_LEN + OFTEN);
  assert.equal(s("old").playCount, 2);
});

/* ---------------------------------------- */
/*  GM and sessions                         */
/* ---------------------------------------- */

test("only the active GM keeps time, and a new active GM takes over", async () => {
  const {playlist, s} = world();
  game.user.isActiveGM = false;
  await playlist.playAll();
  assert.equal(scheduler.timers.size, 0);
  game.user.isActiveGM = true;
  Hooks.callAll("userConnected", {}, true);
  assert.equal(scheduler.timers.size, 2);
  game.user.isActiveGM = false;
  Hooks.callAll("userConnected", {}, true);
  assert.equal(scheduler.timers.size, 0);
  assert.equal(s("raven").playCount, 0);
});

test("a gap re-checks that this is still the active GM when it ends", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  game.user.isActiveGM = false;
  clock.advance(OFTEN);
  assert.equal(s("raven").playCount, 0);
  assert.equal(resting(s("raven")), true, "left for the next GM");
});

test("after a reload, resting sounds draw fresh gaps on ready", async () => {
  const {s} = world({sounds: [{_id: "r", playing: true, flags: {[MODULE_ID]: {randomize: true, resting: true, frequency: "often"}}}]});
  assert.equal(scheduler.timers.size, 0);
  scheduler.refresh();   // what the ready hook runs
  assert.equal(scheduler.timers.size, 1);
  clock.advance(OFTEN);
  assert.equal(s("r").audible, true);
});

test("deleting a sound or playlist cancels its gap", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  Hooks.callAll("deletePlaylistSound", s("bell"));
  assert.equal(scheduler.timers.has(s("bell").uuid), false);
  Hooks.callAll("deletePlaylist", playlist);
  assert.equal(scheduler.timers.size, 0);
});

/* ---------------------------------------- */
/*  Sidebar                                  */
/* ---------------------------------------- */

test("sidebar: a dice sits beside every repeat button, lit only on randomized sounds", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  const row = (id, {owner=true}={}) => new El("li", {classes: ["sound"], dataset: {playlistId: "pl1", soundId: id}, children: [
    new El("header", {children: [
      new El("label", {classes: ["ellipsis"]}),
      new El("div", {classes: ["sound-controls"], children: [
        ...(owner ? [new El("button", {classes: ["inline-control", "sound-control", "icon", "fa-solid", "fa-arrows-rotate"],
          dataset: {action: "soundRepeat"}})] : []),
        new El("button", {classes: ["fa-solid", "fa-pause"], dataset: {action: "soundPause"}}),
        new El("button", {classes: ["fa-solid", "fa-square"], dataset: {action: "soundStop"}})
      ]})
    ]})
  ]});
  const ids = ["loop", "bell", "raven", "slam"];
  const root = new El("section", {children: [...ids.map(id => row(id)), row("bell", {owner: false})]});
  const app = new CONFIG.ui.playlists();
  app.element = root;
  await app._onRender({}, {});
  assert.ok(app.baseRendered, "core render ran");
  const rows = root.querySelectorAll(".sound[data-sound-id]");
  const controls = li => li.querySelector(".sound-controls").children;
  const dice = li => li.querySelector('[data-action="soundRandomize"]');
  for ( const [i, id] of ids.entries() ) {
    const c = controls(rows[i]);
    assert.equal(c[0].dataset.action, "soundRepeat", `${id}: repeat stays first`);
    assert.equal(c[1].dataset.action, "soundRandomize", `${id}: dice right after it`);
    assert.ok(c[1].classList.has("fa-dice") && !c[1].classList.has("fa-arrows-rotate"));
    assert.ok(c[1].classList.has("inline-control"), "styled like core's button");
  }
  assert.equal(dice(rows[0]).classList.has("inactive"), true, "loop: dice dim");
  assert.equal(dice(rows[1]).classList.has("inactive"), false, "bell: dice lit");
  assert.equal(dice(rows[3]).classList.has("inactive"), true, "one-shot: dice dim");
  assert.equal(dice(rows[4]), null, "non-owners get no dice");
  // Resting rows are marked and can't be paused
  assert.ok(rows[1].classList.has("vpr-resting"));
  assert.ok(rows[1].querySelector('[data-action="soundPause"]').hasAttribute("disabled"));
  assert.ok(rows[4].classList.has("vpr-resting"), "players see the dimmed row too");
  assert.equal(rows[0].classList.has("vpr-resting"), false);
  // A second render doesn't add a second dice
  await app._onRender({}, {});
  assert.equal(rows[1].querySelectorAll('[data-action="soundRandomize"]').length, 1);
  // Clicking the dice toggles Randomize; Repeat goes off
  const click = li => CONFIG.ui.playlists.DEFAULT_OPTIONS.actions.soundRandomize.call(app, {}, dice(li));
  await click(rows[0]);
  assert.equal(flag(s("loop"), "randomize"), true);
  assert.equal(s("loop").repeat, false);
  await click(rows[3]);
  await click(rows[3]);
  assert.equal(flag(s("slam"), "randomize"), false, "clicking the lit dice makes a one-shot");
});

/* ---------------------------------------- */
/*  Sound window                             */
/* ---------------------------------------- */

test("sound window: Once / Repeat / Randomize radios replace Repeat in every playlist mode", () => {
  const {playlist, s} = world();
  const build = () => {
    const repeat = new El("input", {attrs: {type: "checkbox", name: "repeat", checked: false}});
    const form = new El("form", {children: [
      new El("div", {classes: ["form-group"], children: [new El("label"), new El("div", {children: [repeat]})]}),
      new El("div", {classes: ["form-group"], dataset: {fade: "1"}})
    ]});
    return {form, repeat};
  };
  const {form, repeat} = build();
  const render = (doc, f) => Hooks.callAll("renderPlaylistSoundConfig", {id: "cfg", document: doc}, f);
  render(s("bell"), form);
  const groups = form.children;
  assert.equal(groups.length, 4);
  assert.equal(groups[0].hidden, true, "core Repeat row hidden");
  assert.equal(groups[1].label, "VPR.Playback.Label");
  assert.equal(groups[2].label, "VPR.Frequency.Label");
  assert.equal(groups[3].dataset.fade, "1", "inserted directly after Repeat");
  const radios = groups[1].querySelectorAll('[type="radio"]');
  assert.deepEqual(radios.map(r => r.getAttribute("value")), ["once", "repeat", "randomize"]);
  assert.ok(radios.every(r => r.getAttribute("form") && (r.getAttribute("name") === radios[0].getAttribute("name"))),
    "one radio group, never submitted");
  const pick = value => { for ( const r of radios ) r.checked = (r.getAttribute("value") === value); radios.find(r => r.checked).dispatch("change"); };
  const randomize = form.querySelector(`[name="flags.${MODULE_ID}.randomize"]`);
  const frequency = form.querySelector(`[name="flags.${MODULE_ID}.frequency"]`);
  assert.equal(radios.find(r => r.checked).getAttribute("value"), "randomize");
  assert.equal(randomize.checked, true);
  assert.equal(randomize.hidden, true);
  assert.equal(frequency.value, "sometimes");
  assert.equal(groups[2].hidden, false);
  pick("repeat");
  assert.equal(repeat.checked, true);
  assert.equal(randomize.checked, false);
  assert.equal(groups[2].hidden, true);
  pick("once");
  assert.equal(repeat.checked, false);
  assert.equal(randomize.checked, false);
  pick("randomize");
  assert.equal(repeat.checked, false);
  assert.equal(randomize.checked, true);
  assert.equal(groups[2].hidden, false);
  // A re-render of the same form doesn't add the rows twice
  render(s("bell"), form);
  assert.equal(form.children.length, 4);
  // A loop opens on Repeat with Frequency hidden
  const loopForm = build();
  loopForm.repeat.checked = true;
  render(s("loop"), loopForm.form);
  const loopRadios = loopForm.form.children[1].querySelectorAll('[type="radio"]');
  assert.equal(loopRadios.find(r => r.checked).getAttribute("value"), "repeat");
  assert.equal(loopForm.form.children[2].hidden, true);
  // Every other playlist mode gets the same rows
  for ( const mode of [MODES.SEQUENTIAL, MODES.SHUFFLE, MODES.DISABLED] ) {
    playlist.mode = mode;
    const other = build();
    render(s("raven"), other.form);
    assert.equal(other.form.children.length, 4, `mode ${mode}`);
    assert.equal(other.form.querySelector(`[name="flags.${MODULE_ID}.frequency"]`).value, "often", "keeps its frequency");
  }
});

/* ---------------------------------------- */

let failed = 0;
for ( const {name, fn} of tests ) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.stack?.split("\n").slice(0, 3).join("\n     ")}`);
  }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
