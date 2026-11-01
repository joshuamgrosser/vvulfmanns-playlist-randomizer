// Logic tests with a minimal stand-in for Foundry's playlist classes. Run: npm test
import assert from "node:assert/strict";
const MOD="vvulfmanns-playlist-randomizer";
const getProperty=(o,p)=>p.split(".").reduce((a,k)=>a==null?undefined:a[k],o);
const setProperty=(o,p,v)=>{const ks=p.split(".");let t=o;for(const k of ks.slice(0,-1)){t[k]??={};t=t[k];}t[ks.at(-1)]=v;};
const isObj=x=>x&&typeof x==="object"&&!Array.isArray(x);
const merge=(a,b)=>{for(const[k,v]of Object.entries(b)){if(k.includes(".")){setProperty(a,k,v);continue;} if(isObj(v)&&isObj(a[k]))merge(a[k],v);else a[k]=structuredClone(v);}return a;};
const hooks={};
globalThis.Hooks={on:(n,f)=>(hooks[n]??=[]).push(f),once:(n,f)=>(hooks[n]??=[]).push(f)};
const call=(n,...a)=>(hooks[n]??[]).forEach(f=>f(...a));
globalThis.CONST={PLAYLIST_MODES:{DISABLED:-1,SEQUENTIAL:0,SHUFFLE:1,SIMULTANEOUS:2}};
globalThis.foundry={utils:{getProperty,setProperty,mergeObject:(a,b,{inplace}={})=>merge(inplace===false?structuredClone(a):a,b)}};
class FakeSound{constructor(){this.playing=false;this.loop=null;this.log=[];}load({autoplayOptions}){this.playing=true;this.loop=autoplayOptions.loop;this.log.push("play");}stop(){this.playing=false;this.log.push("stop");}fade(){}}
class PlaylistSound{constructor(d,parent){Object.assign(this,structuredClone(d));this.parent=parent;this.uuid="S."+d._id;}
  get id(){return this._id} getFlag(m,k){return this.flags?.[m]?.[k]} toObject(){const{parent,sound,...r}=this;return structuredClone(r);}
  get fadeDuration(){return 0}
  _createSound(){return new FakeSound()}
  sync(){ if(!this.playing){ if(this.sound?.playing) this.sound.stop(); return;} this.sound ||= this._createSound(); if(this.sound.playing){this.sound.loop=this.repeat;return;} this.sound.load({autoplayOptions:{loop:this.repeat}}); }
  async update(ch){ call("preUpdatePlaylistSound",this,ch); merge(this,ch); this.sync(); call("updatePlaylistSound",this,ch); }
}
class Playlist{constructor(mode){this.mode=mode;this.playing=false;this.sounds=new Map();}
  async update(ch){ call("preUpdatePlaylist",this,ch); for(const c of ch.sounds??[]){const s=this.sounds.get(c._id);const {_id,...r}=c;merge(s,r);} if("playing"in ch)this.playing=ch.playing; this.sounds.forEach(s=>s.sync()); call("updatePlaylist",this,ch);}
  async _onSoundEnd(sound){ this.coreEnd=(this.coreEnd??0)+1; return this.update({sounds:[{_id:sound.id,playing:false}]}); }
  playAll(){return this.update({playing:true,sounds:[...this.sounds.values()].map(s=>({_id:s.id,playing:true}))});}
  playSound(s){return this.update({playing:true,sounds:[{_id:s.id,playing:true}]});}
  stopSound(s){return this.update({sounds:[{_id:s.id,playing:false}]});}
}
globalThis.CONFIG={PlaylistSound:{documentClass:PlaylistSound},Playlist:{documentClass:Playlist}};
const timers=[];globalThis.setTimeout=(f,ms)=>{timers.push({f,ms});return timers.length;};globalThis.clearTimeout=()=>{};
const pl=new Playlist(2);
const mk=(id,d)=>{const s=new PlaylistSound({_id:id,name:id,repeat:true,playing:false,volume:.5,flags:{},...d},pl);pl.sounds.set(id,s);return s;};
const bed=mk("bed"); const bell=mk("bell",{flags:{[MOD]:{randomize:true,frequency:"often",active:true}}}); const oneshot=mk("door",{repeat:false});
globalThis.game={audio:{locked:false},users:{activeGM:{isSelf:true}},modules:new Map(),playlists:[pl],i18n:{localize:x=>x}};
globalThis.fromUuidSync=u=>[...pl.sounds.values()].find(s=>s.uuid===u);
await import(new URL("../scripts/main.js", import.meta.url));
call("setup"); call("ready");
// 1. Play All: bed loops, bell waits silently
await pl.playAll();
assert.equal(bed.sound.loop,true); assert.ok(Number.isFinite(bell.flags[MOD].nextAt),"bell waits on playAll"); assert.equal(bell.sound?.playing??false,false);
const delay=timers.at(-1).ms; assert.ok(delay>=10000&&delay<=30000,"often range "+delay);
// 2. timer fires -> bell plays once, no loop
await timers.at(-1).f(); assert.equal(bell.flags[MOD].nextAt,null); assert.equal(bell.sound.playing,true); assert.equal(bell.sound.loop,false);
// 3. natural end -> waits again, core end not called, playlist still playing
bell.sound.playing=false; await pl._onSoundEnd(bell);
assert.equal(pl.coreEnd,undefined); assert.ok(Number.isFinite(bell.flags[MOD].nextAt)); assert.equal(bell.playing,true); assert.equal(pl.playing,true);
// 4. dice off while waiting -> normal loop resumes
await bell.update({[`flags.${MOD}.active`]:false}); assert.equal(bell.flags[MOD].nextAt,null); assert.equal(bell.sound.playing,true); assert.equal(bell.sound.loop,true);
// 5. dice on while looping -> finishes pass without loop
await bell.update({[`flags.${MOD}.active`]:true}); assert.equal(bell.sound.loop,false);
// 6. stop clears wait
bell.sound.playing=false; await pl._onSoundEnd(bell); await pl.stopSound(bell); assert.equal(bell.flags[MOD].nextAt,null); assert.equal(bell.playing,false);
// 7. single play -> immediate
await pl.playSound(bell); assert.equal(bell.flags[MOD].nextAt,null); assert.equal(bell.sound.playing,true);
// 8. one-shot uses core end
oneshot.playing=true; await pl._onSoundEnd(oneshot); assert.equal(pl.coreEnd,1);
// 9. sequential playlist ignores randomize
const pl2=new Playlist(0); const s2=new PlaylistSound({_id:"x",repeat:true,playing:true,flags:{[MOD]:{randomize:true}}},pl2); pl2.sounds.set("x",s2); await pl2._onSoundEnd(s2); assert.equal(pl2.coreEnd,1);
// 10. ticking randomize turns dice on
const z=mk("z",{flags:{[MOD]:{active:false}}}); await z.update({flags:{[MOD]:{randomize:true}}}); assert.equal(z.flags[MOD].active,true);
console.log("all tests passed");
