/**
 * Behaviour tests against a mocked Foundry v14 core (see harness.mjs).
 * Run with: npm test
 */
import assert from "node:assert/strict";
import {El, Hooks, MODES, Playlist, PlaylistDirectory, clock, installGlobals} from "./harness.mjs";

installGlobals();
Math.random = () => 0.5;   // deterministic waits: Sometimes = 75 s, Often = 20 s
const {scheduler} = await import("../scripts/main.js");
const config = await import("../scripts/config.mjs");
const {MODULE_ID, FREQUENCIES, randomDelayMs} = config;

Hooks.callAll("init");

const SEC = 1000;
const MAX_GAP = 120 * SEC;          // "sometimes" upper bound
const SOUND_LEN = 5 * SEC;

/** Build a fresh world with one playlist. */
function world({mode=MODES.SIMULTANEOUS, sounds}={}) {
  clock.reset();
  scheduler.clearAll();
  game.playlists.clear();
  game.user.isActiveGM = true;
  const Cls = CONFIG.Playlist.documentClass;
  const playlist = new Cls({_id: "pl1", mode, sounds: sounds ?? [
    {_id: "loop", name: "Low Wind", repeat: true},
    {_id: "bell", name: "Belfry Bell", flags: {[MODULE_ID]: {randomize: true}}},
    {_id: "raven", name: "Raven Caw", flags: {[MODULE_ID]: {randomize: true, frequency: "often"}}},
    {_id: "slam", name: "Door Slam"}
  ]});
  game.playlists.set(playlist.id, playlist);
  return {playlist, s: id => playlist.sounds.get(id)};
}

const tests = [];
const test = (name, fn) => tests.push({name, fn});

/* ---------------------------------------- */

test("init swaps in the extended classes and registers hooks", () => {
  assert.notEqual(CONFIG.Playlist.documentClass, Playlist);
  assert.ok(CONFIG.Playlist.documentClass.prototype instanceof Playlist);
  assert.ok(CONFIG.ui.playlists.prototype instanceof PlaylistDirectory);
  assert.equal(typeof CONFIG.ui.playlists.DEFAULT_OPTIONS.actions.randomizeToggle, "function");
  for ( const h of ["preUpdatePlaylist", "preUpdatePlaylistSound", "preCreatePlaylistSound", "renderPlaylistSoundConfig",
    "updatePlaylist", "updatePlaylistSound", "userConnected", "ready"] ) {
    assert.ok(Hooks.events.get(h)?.length, `hook ${h} registered`);
  }
});

test("random waits stay inside each frequency's range", () => {
  for ( const [key, [min, max]] of Object.entries(FREQUENCIES) ) {
    const sound = {flags: {[MODULE_ID]: {frequency: key}}};
    assert.equal(randomDelayMs(sound, () => 0), min * SEC);
    assert.ok(randomDelayMs(sound, () => 0.999999) <= max * SEC);
  }
  assert.equal(randomDelayMs({flags: {}}, () => 0), 30 * SEC, "default is Sometimes");
  assert.equal(randomDelayMs({flags: {[MODULE_ID]: {frequency: "bogus"}}}, () => 0), 30 * SEC);
});

test("Play All starts loops and one-shots, arms the playlist, and holds randomized sounds back", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  assert.equal(s("loop").playing, true);
  assert.equal(s("slam").playing, true);
  assert.equal(s("bell").playing, false);
  assert.equal(s("raven").playing, false);
  assert.equal(playlist.getFlag(MODULE_ID, "armed"), true);
  assert.ok(scheduler.timers.has(s("bell").uuid));
  assert.ok(scheduler.timers.has(s("raven").uuid));
});

test("an armed playlist shows as playing during a quiet gap", async () => {
  const {playlist} = world({sounds: [{_id: "bell", flags: {[MODULE_ID]: {randomize: true}}}]});
  await playlist.playAll();
  assert.equal(playlist.sounds.some(x => x.playing), false);
  assert.equal(playlist.playing, true);
});

test("a randomized sound plays after its gap, ends, and plays again", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  clock.advance(MAX_GAP);
  assert.ok(s("bell").playCount >= 1, "played at least once");
  const played = s("bell").playCount;
  clock.advance(SOUND_LEN + MAX_GAP + SOUND_LEN);
  assert.ok(s("bell").playCount > played, "played again");
});

test("a sound never overlaps itself: each gap starts when it ends", async () => {
  const {playlist, s} = world({sounds: [{_id: "bell", duration: 200 * SEC, flags: {[MODULE_ID]: {randomize: true}}}]});
  await playlist.playAll();
  clock.advance(MAX_GAP);
  assert.equal(s("bell").playing, true);
  assert.equal(scheduler.timers.has(s("bell").uuid), false, "no timer while playing");
  clock.advance(200 * SEC);
  assert.equal(s("bell").playing, false);
  assert.ok(scheduler.timers.has(s("bell").uuid), "next turn scheduled at the end");
});

test("Stop Playlist stops everything, disarms, and cancels turns", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  clock.advance(MAX_GAP);
  await playlist.stopAll();
  assert.equal(playlist.getFlag(MODULE_ID, "armed"), false);
  assert.equal(playlist.playing, false);
  assert.ok(playlist.sounds.contents.every(x => !x.playing));
  assert.equal(scheduler.timers.size, 0);
  const counts = playlist.sounds.map(x => x.playCount);
  clock.advance(10 * MAX_GAP);
  assert.deepEqual(playlist.sounds.map(x => x.playCount), counts, "nothing plays after stopping");
  assert.equal(s("bell").getFlag(MODULE_ID, "randomize"), true, "settings kept");
});

test("pressing Play on a randomized sound plays it once and does not arm the playlist", async () => {
  const {playlist, s} = world();
  await playlist.playSound(s("bell"));
  assert.equal(s("bell").playing, true);
  assert.equal(playlist.getFlag(MODULE_ID, "armed"), undefined);
  clock.advance(SOUND_LEN);
  assert.equal(s("bell").playing, false);
  clock.advance(10 * MAX_GAP);
  assert.equal(s("bell").playCount, 1);
  assert.equal(scheduler.timers.size, 0);
});

test("stopping a randomized sound mid-play keeps its next turn coming", async () => {
  const {playlist, s} = world({sounds: [{_id: "bell", duration: 60 * SEC, flags: {[MODULE_ID]: {randomize: true}}}]});
  await playlist.playAll();
  clock.advance(MAX_GAP);
  assert.equal(s("bell").playing, true);
  await playlist.stopSound(s("bell"));
  assert.equal(s("bell").playing, false);
  assert.equal(playlist.playing, true, "still armed");
  assert.ok(scheduler.timers.has(s("bell").uuid));
});

test("a turn that comes up while the sound is playing by hand is skipped", async () => {
  const {playlist, s} = world({sounds: [{_id: "bell", duration: 300 * SEC, flags: {[MODULE_ID]: {randomize: true}}}]});
  await playlist.playAll();
  await playlist.playSound(s("bell"));        // by hand, before its turn
  assert.equal(scheduler.timers.has(s("bell").uuid), false, "pending turn dropped");
  clock.advance(MAX_GAP);
  assert.equal(s("bell").playCount, 1, "no second start");
  clock.advance(180 * SEC);                  // it ends at 300 s
  assert.ok(scheduler.timers.has(s("bell").uuid), "rescheduled after it ends");
});

test("dice off cancels future turns but lets a current play finish; dice on rejoins", async () => {
  const {playlist, s} = world({sounds: [{_id: "bell", duration: 10 * SEC, flags: {[MODULE_ID]: {randomize: true}}}]});
  await playlist.playAll();
  clock.advance(80 * SEC);                   // its turn came at 75 s
  assert.equal(s("bell").playing, true);
  await s("bell").setFlag(MODULE_ID, "enabled", false);
  assert.equal(s("bell").playing, true, "current play continues");
  clock.advance(10 * SEC);
  assert.equal(s("bell").playing, false);
  assert.equal(scheduler.timers.size, 0);
  clock.advance(10 * MAX_GAP);
  assert.equal(s("bell").playCount, 1);
  await s("bell").setFlag(MODULE_ID, "enabled", true);
  assert.ok(scheduler.timers.has(s("bell").uuid));
  clock.advance(MAX_GAP);
  assert.equal(s("bell").playCount, 2);
});

test("dice-off sounds stay silent on Play All", async () => {
  const {playlist, s} = world({sounds: [{_id: "bell", flags: {[MODULE_ID]: {randomize: true, enabled: false}}}]});
  await playlist.playAll();
  assert.equal(s("bell").playing, false);
  assert.equal(scheduler.timers.size, 0);
});

test("ticking Randomize on a sound in an armed playlist joins the rotation", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  await s("slam").update({[`flags.${MODULE_ID}.randomize`]: true});
  clock.advance(SOUND_LEN);              // let its Play All one-shot end
  assert.ok(scheduler.timers.has(s("slam").uuid));
});

test("a randomized sound created in an armed playlist gets its first turn", async () => {
  const {playlist} = world();
  await playlist.playAll();
  const created = new (playlist.sounds.get("bell").constructor)({_id: "owl", flags: {[MODULE_ID]: {randomize: true}}}, playlist);
  playlist.sounds.set("owl", created);
  Hooks.callAll("createPlaylistSound", created, {}, "user");   // payload uses a literal dotted key
  assert.ok(scheduler.timers.has(created.uuid));
});

test("Sequential and Shuffle playlists keep core behaviour", async () => {
  for ( const mode of [MODES.SEQUENTIAL, MODES.SHUFFLE, MODES.DISABLED] ) {
    const {playlist} = world({mode});
    await playlist.playAll();
    assert.equal(playlist.getFlag(MODULE_ID, "armed"), undefined);
    assert.equal(scheduler.timers.size, 0);
  }
});

test("Repeat and Randomize stay exclusive on direct and playlist updates", async () => {
  const {playlist, s} = world();
  await s("bell").update({repeat: true});
  assert.equal(s("bell").repeat, true);
  assert.equal(s("bell").getFlag(MODULE_ID, "randomize"), false);
  await s("loop").update({[`flags.${MODULE_ID}.randomize`]: true});
  assert.equal(s("loop").repeat, false);
  await playlist.update({sounds: [{_id: "raven", repeat: true}]});
  assert.equal(s("raven").getFlag(MODULE_ID, "randomize"), false);
  await s("slam").update({repeat: true, flags: {[MODULE_ID]: {randomize: true}}});
  assert.equal(s("slam").repeat, false, "Randomize wins");
  await s("slam").update({repeat: false});
  assert.equal(s("slam").getFlag(MODULE_ID, "randomize"), true, "unrelated change leaves it alone");
});

test("only the active GM keeps time, and a new active GM takes over", async () => {
  const {playlist} = world();
  game.user.isActiveGM = false;
  await playlist.playAll();
  assert.equal(scheduler.timers.size, 0, "non-GM schedules nothing");
  game.user.isActiveGM = true;
  Hooks.callAll("userConnected", {}, false);
  assert.equal(scheduler.timers.size, 2);
  game.user.isActiveGM = false;
  Hooks.callAll("userConnected", {}, true);
  assert.equal(scheduler.timers.size, 0, "hands off");
});

test("a turn checks again that this is still the active GM", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  game.user.isActiveGM = false;      // changed without a userConnected event yet
  clock.advance(MAX_GAP);
  assert.equal(s("bell").playCount, 0);
});

test("after a reload, armed playlists resume on ready", async () => {
  const {playlist} = world({sounds: [{_id: "bell", flags: {[MODULE_ID]: {randomize: true}}}]});
  playlist.flags[MODULE_ID] = {armed: true};
  playlist.prepareDerivedData();
  assert.equal(playlist.playing, true);
  scheduler.refresh();   // what the ready hook does
  assert.equal(scheduler.timers.size, 1);
});

test("deleting a sound cancels its turn", async () => {
  const {playlist, s} = world();
  await playlist.playAll();
  Hooks.callAll("deletePlaylistSound", s("bell"));
  assert.equal(scheduler.timers.has(s("bell").uuid), false);
});

test("sidebar: the repeat button becomes the dice on randomized sounds only", async () => {
  const {s} = world();
  await s("raven").setFlag(MODULE_ID, "enabled", false);
  const row = id => new El("li", {classes: ["sound"], dataset: {playlistId: "pl1", soundId: id}, children: [
    new El("button", {classes: ["fa-solid", "fa-arrows-rotate"], dataset: {action: "soundRepeat", tooltip: ""}}),
    new El("button", {classes: ["fa-solid", "fa-play"], dataset: {action: "soundPlay"}})
  ]});
  const root = new El("section", {children: ["loop", "bell", "raven"].map(row)});
  const app = new CONFIG.ui.playlists();
  app.element = root;
  await app._onRender({}, {});
  assert.ok(app.baseRendered, "core render ran");
  const btn = id => root.querySelectorAll(".sound[data-sound-id]").find(li => li.dataset.soundId === id).children[0];
  assert.equal(btn("loop").dataset.action, "soundRepeat");
  assert.ok(btn("loop").classList.has("fa-arrows-rotate"));
  assert.equal(btn("bell").dataset.action, "randomizeToggle");
  assert.ok(btn("bell").classList.has("fa-dice"));
  assert.equal(btn("bell").classList.has("inactive"), false);
  assert.ok(btn("raven").classList.has("inactive"), "dice off is dim");
  // Clicking the dice flips the flag
  await CONFIG.ui.playlists.DEFAULT_OPTIONS.actions.randomizeToggle.call(app, {}, btn("bell"));
  assert.equal(s("bell").getFlag(MODULE_ID, "enabled"), false);
});

test("sound window: Once / Repeat / Randomize radios replace Repeat in Simultaneous playlists", () => {
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
  // Other playlist modes keep core's Repeat checkbox untouched
  playlist.mode = MODES.SEQUENTIAL;
  const seq = build();
  render(s("bell"), seq.form);
  assert.equal(seq.form.children.length, 2);
  assert.equal(seq.form.children[0].hidden, false);
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
