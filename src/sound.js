// ---------- sound: menu music, the crowd, and the sounds of the game ----------
// Music is the menu theme on a loop (the file has its own 1-second fade at each end), faded in and out
// over a second whenever you move between the menus and a game. Everything else is synthesized live.
const SND = { ctx: null, out: null, sfx: null, crowdBus: null, crowd: null, unlocked: false, music: null, musicVol: 0, musicTarget: 0, musicRaf: 0,
  lastEv: {}, lastScore: null, lastId: null, crowdLevel: 0, swell: 0, noise: null };
const MUSIC_SRC = "audio/menu-theme.mp3";
const MUSIC_FADE = 1.0; // seconds
// each club's goal horn: 16.5 seconds, fading out over the last 3.5; it sounds 0.15 s after a home goal
const HORN_TEAMS = ["FCH", "NKY", "KYO", "TKZ", "SAP", "HKD", "NIG", "KOK", "FKS", "CKY"], HORN_DELAY = 150;
SND.horns = {}; SND.hornCur = null; SND.hornRaf = 0;
function sndHornEl(id) {
  if (!HORN_TEAMS.includes(id)) return null;
  if (!SND.horns[id]) { const a = new Audio("audio/horns/" + id + ".mp3"); a.preload = "auto"; SND.horns[id] = a; }
  return SND.horns[id];
}
function sndHorn(id) {
  const a = sndHornEl(id); if (!a || !SND.unlocked || !sndOn()) return;
  setTimeout(() => {
    if (currentView() !== "game" || skipping) return;
    if (SND.hornCur && SND.hornCur !== a) SND.hornCur.pause();
    cancelAnimationFrame(SND.hornRaf);
    try { a.currentTime = 0; a.volume = Math.min(1, sndVol("vHorn")); const p = a.play(); if (p && p.catch) p.catch(() => {}); SND.hornCur = a; } catch (e) {}
  }, HORN_DELAY);
}
// leaving the game: let the horn trail off instead of cutting it
function sndHornStop(fast) {
  const a = SND.hornCur; if (!a || a.paused) return;
  const v0 = a.volume, t0 = performance.now(), dur = fast ? 250 : 600;
  cancelAnimationFrame(SND.hornRaf);
  const step = now => { const k = Math.min(1, (now - t0) / dur); try { a.volume = v0 * (1 - k); } catch (e) {} if (k < 1) SND.hornRaf = requestAnimationFrame(step); else a.pause(); };
  SND.hornRaf = requestAnimationFrame(step);
}

function sndOn() { return settings.snd !== false; }
function sndVol(k) { return (sndOn() ? (settings.vMaster ?? 0.8) : 0) * (settings[k] ?? 0.7); }

// browsers only allow sound after the viewer interacts with the page
function sndUnlock() {
  if (SND.unlocked) return;
  SND.unlocked = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      SND.ctx = new AC();
      SND.out = SND.ctx.createGain(); SND.out.connect(SND.ctx.destination);
      SND.sfx = SND.ctx.createGain(); SND.sfx.connect(SND.out);
      SND.crowdBus = SND.ctx.createGain(); SND.crowdBus.gain.value = 0; SND.crowdBus.connect(SND.out);
      // a few seconds of noise to build everything from
      const len = SND.ctx.sampleRate * 3, buf = SND.ctx.createBuffer(2, len, SND.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; } }
      SND.noise = buf;
    }
  } catch (e) { SND.ctx = null; }
  sndApplyVolumes();
  sndRoute();
}
["pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => { sndUnlock(); if (SND.ctx && SND.ctx.state === "suspended") SND.ctx.resume(); }, { passive: true }));

function sndApplyVolumes() {
  if (SND.sfx) SND.sfx.gain.value = sndVol("vSfx");
  sndMusicTo(SND.musicTarget > 0 ? 1 : 0, true);
}

// ---------- music ----------
function sndMusicEl() {
  if (!SND.music) {
    const a = new Audio(MUSIC_SRC); a.loop = true; a.preload = "auto"; a.volume = 0;
    SND.music = a;
  }
  return SND.music;
}
// fade the music toward on (1) or off (0) over MUSIC_FADE seconds
function sndMusicTo(on, instant) {
  SND.musicTarget = on;
  if (!SND.unlocked) return;
  if (!sndOn()) sndHornStop(true);
  const a = sndMusicEl(), goal = on ? sndVol("vMusic") : 0;
  if (on && goal > 0 && a.paused) { a.volume = SND.musicVol = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
  cancelAnimationFrame(SND.musicRaf);
  if (instant && !on) { a.volume = SND.musicVol = 0; a.pause(); return; }
  const from = SND.musicVol, t0 = performance.now(), dur = instant ? 1 : MUSIC_FADE * 1000;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), v = from + (goal - from) * k;
    SND.musicVol = v; try { a.volume = Math.max(0, Math.min(1, v)); } catch (e) {}
    if (k < 1) SND.musicRaf = requestAnimationFrame(step);
    else if (goal <= 0.0001) a.pause();
  };
  SND.musicRaf = requestAnimationFrame(step);
}
// menus get the theme; a game gets the crowd
function sndRoute() {
  const inGame = currentView() === "game";
  if (!inGame) sndHornStop();
  sndMusicTo(inGame ? 0 : 1);
  sndCrowdTo(inGame && game && !game.final ? 1 : inGame && game ? 0.35 : 0);
}
addEventListener("hashchange", () => setTimeout(sndRoute, 0));
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (SND.music) SND.music.pause(); if (SND.ctx) SND.ctx.suspend(); } else { if (SND.ctx) SND.ctx.resume(); SND.musicVol = 0; sndRoute(); } });

// ---------- the crowd: real arena recordings ----------
// A looping bed of crowd ambience, plus recorded reactions: big roars for home goals, smaller cheers,
// the visiting section's cheer (quieter and further away), and "ooh"s for big saves and posts.
const CROWD_DIR = "audio/crowd/";
const CROWD_POOLS = { home: 4, cheer: 3, away: 3, ooh: 3 };
function crowdLoad(name) {
  return fetch(CROWD_DIR + name + ".mp3").then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
    .then(b => new Promise((res, rej) => SND.ctx.decodeAudioData(b, res, rej)));
}
async function sndCrowdPrepare() {
  try {
    const amb = await crowdLoad("crowd-ambience"), c = SND.ctx;
    const s = c.createBufferSource(); s.buffer = amb; s.loop = true;
    // skip the few milliseconds of silence mp3 adds at each end, so the loop has no gap
    s.loopStart = 0.06; s.loopEnd = amb.duration - 0.06;
    const g = c.createGain(); g.gain.value = 1; s.connect(g); g.connect(SND.crowdBus);
    s.start(0, 0.06 + Math.random() * (amb.duration - 0.2));
    SND.crowd.bed = g;
  } catch (e) { console.warn("crowd ambience", e); }
  for (const k in CROWD_POOLS) for (let i = 1; i <= CROWD_POOLS[k]; i++)
    crowdLoad(k + i).then(b => SND.crowd.pools[k].push(b)).catch(e => console.warn("crowd", k + i, e));
}
function sndCrowdBuild() {
  if (!SND.ctx || SND.crowd) return;
  SND.crowd = { pools: { home: [], cheer: [], away: [], ooh: [] }, bed: null, last: {}, busyUntil: 0 };
  sndCrowdPrepare();
}
function sndCrowdTo(level) {
  SND.crowdLevel = level;
  if (!SND.ctx) return;
  sndCrowdBuild();
  const t = SND.ctx.currentTime;
  SND.crowdBus.gain.cancelScheduledValues(t);
  SND.crowdBus.gain.setTargetAtTime(level * sndVol("vCrowd") * 0.9, t, 0.45);
}
// a reaction from the stands: size 1+ is a home goal, 0.7+ a home shootout goal, smaller is the visitors'
// section; kind "ooh" is a near miss (size sets how loud)
function sndRoar(size, dur, kind) {
  if (!SND.ctx || !SND.crowd || SND.crowdLevel <= 0) return;
  const c = SND.ctx, now = c.currentTime, P = SND.crowd.pools;
  let k, vol, far = false;
  if (kind === "ooh") {
    if (now < SND.crowd.busyUntil || now - (SND.crowd.last.ooh || -9) < 3) return; // not over a cheer, and not every save
    k = "ooh"; vol = 0.45 + 0.45 * Math.min(1, size);
  } else if (size >= 1) { k = "home"; vol = 1; }
  else if (size >= 0.7) { k = "cheer"; vol = 0.85; }
  else { k = "away"; vol = size >= 0.4 ? 0.5 : 0.38; far = true; }
  const pool = P[k]; if (!pool.length) return;
  // don't play the same clip twice in a row
  let i = Math.floor(Math.random() * pool.length); if (pool.length > 1 && i === SND.crowd.last[k + "i"]) i = (i + 1) % pool.length;
  SND.crowd.last[k + "i"] = i; SND.crowd.last[k] = now;
  const s = c.createBufferSource(); s.buffer = pool[i]; s.playbackRate.value = 0.98 + Math.random() * 0.04;
  const g = c.createGain(); g.gain.value = vol;
  if (far) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; s.connect(lp); lp.connect(g); } else s.connect(g);
  g.connect(SND.crowdBus); s.start(now + 0.02);
  if (kind !== "ooh") SND.crowd.busyUntil = now + pool[i].duration * 0.8;
}

// ---------- effects ----------
function sndPan(x) { if (!SND.ctx.createStereoPanner) return null; const p = SND.ctx.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, (x || 0) / 110)); return p; }
function sndOut(node, x) { const p = sndPan(x); if (p) { node.connect(p); p.connect(SND.sfx); } else node.connect(SND.sfx); }
// a burst of filtered noise
function sndNoise(t, { f = 2000, q = 1, type = "bandpass", a = 0.002, d = 0.06, v = 0.5, rate = 1, x = 0 }) {
  const c = SND.ctx, s = c.createBufferSource(); s.buffer = SND.noise; s.playbackRate.value = rate;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  s.connect(fl); fl.connect(g); sndOut(g, x); s.start(t, Math.random() * 2.5, a + d + 0.05);
}
// a pitched tone with a quick decay
function sndTone(t, { f = 440, type = "sine", a = 0.002, d = 0.2, v = 0.3, x = 0, glide = 0 }) {
  const c = SND.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * glide), t + a + d);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  o.connect(g); sndOut(g, x); o.start(t); o.stop(t + a + d + 0.05);
}
const SND_FX = {
  // stick on puck: a sharp click with a little body
  pass: (t, e) => { sndNoise(t, { f: 2600, q: 1.4, d: 0.035, v: 0.35 * e.v, x: e.x }); sndTone(t, { f: 380, d: 0.05, v: 0.12 * e.v, x: e.x, glide: 0.6 }); },
  shot: (t, e) => { sndNoise(t, { f: 1700, q: 0.8, d: 0.07, v: 0.6 * e.v, x: e.x }); sndNoise(t, { f: 4200, q: 2, d: 0.03, v: 0.25 * e.v, x: e.x }); sndTone(t, { f: 160, d: 0.09, v: 0.28 * e.v, x: e.x, glide: 0.5 }); },
  // the iron: inharmonic ring that hangs in the air
  post: (t, e) => { sndNoise(t, { f: 3000, q: 1, d: 0.03, v: 0.4, x: e.x }); [[740, 0.22, 1.1], [1316, 0.14, 0.9], [2049, 0.1, 0.7], [2970, 0.06, 0.5], [3820, 0.04, 0.35]].forEach(([f, v, d]) => sndTone(t, { f, v, d, x: e.x, type: "sine" })); },
  save: (t, e) => { sndNoise(t, { f: 420, type: "lowpass", q: 0.7, d: 0.11, v: 0.55 * e.v, x: e.x }); sndTone(t, { f: 110, d: 0.12, v: 0.2 * e.v, x: e.x, glide: 0.7 }); },
  block: (t, e) => { sndNoise(t, { f: 520, type: "lowpass", d: 0.08, v: 0.45, x: e.x }); },
  boards: (t, e) => { sndNoise(t, { f: 700, q: 0.8, d: 0.12, v: 0.4 * e.v, x: e.x }); sndTone(t, { f: 95, d: 0.16, v: 0.25 * e.v, x: e.x, glide: 0.8 }); },
  hit: (t, e) => { sndNoise(t, { f: 300, type: "lowpass", d: 0.16, v: 0.6, x: e.x }); sndTone(t, { f: 70, d: 0.18, v: 0.35, x: e.x, glide: 0.6 }); },
  // into the boards: the thud plus the glass and panels rattling
  hitb: (t, e) => { SND_FX.hit(t, e); sndNoise(t + 0.01, { f: 1800, q: 0.7, d: 0.35, v: 0.3, x: e.x, rate: 0.8 }); sndNoise(t + 0.03, { f: 520, q: 1.5, d: 0.25, v: 0.3, x: e.x }); },
  drop: (t, e) => { sndNoise(t, { f: 2200, q: 2, d: 0.025, v: 0.2, x: e.x }); },
  // a referee's pea whistle: two close pitches warbling together
  whistle: (t, e) => {
    const c = SND.ctx, d = 0.42, g = c.createGain(), am = c.createOscillator(), amG = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + d - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    am.frequency.value = 28; amG.gain.value = 0.06; am.connect(amG); amG.connect(g.gain);
    for (const f of [2860, 3010]) { const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + d + 0.05); }
    am.start(t); am.stop(t + d + 0.05); sndOut(g, e.x);
  }
};
const SND_GAP = { pass: 0.05, shot: 0.05, boards: 0.09, drop: 0.3, whistle: 0.6, hit: 0.1, hitb: 0.1, save: 0.08, block: 0.08, post: 0.2 };

// called every frame while a game is on screen
function sndGameFrame() {
  if (!game) return;
  const live = SND.ctx && SND.unlocked && sndOn() && currentView() === "game" && !skipping && !replay && SND.ctx.state === "running";
  const q = game.sfx; game.sfx = [];
  // a new game: reset the score tracker
  if (SND.lastId !== game) { SND.lastId = game; SND.lastScore = null; SND.wasFinal = game.final; sndHornStop(true); sndHornEl(game.teams[0].team.id); sndRoute(); }
  const sc = [game.teams[0].score, game.teams[1].score], so = game.so ? game.so.goals.slice() : [0, 0];
  if (SND.lastScore && live) {
    if (sc[0] > SND.lastScore[0]) { sndRoar(1.25, 5.5); sndHorn(game.teams[0].team.id); } // home goal: the horn, and the building comes down
    else if (sc[1] > SND.lastScore[1]) sndRoar(0.45, 2.2);                                   // away goal: their fans make some noise
    else if (so[0] > SND.lastSO[0]) sndRoar(0.8, 2.5);                                        // shootout goals get a cheer, not the horn
    else if (so[1] > SND.lastSO[1]) sndRoar(0.35, 1.5);
    // (a home shootout win adds the deciding goal to the score, so it gets the horn above)
  }
  SND.lastScore = sc; SND.lastSO = so; SND.wasFinal = game.final;
  if (game.final && SND.crowdLevel > 0.35) sndCrowdTo(0.35);
  if (!live) return;
  // how loud the room is: louder late in a close game
  const close = Math.abs(game.teams[0].score - game.teams[1].score) <= 1, late = game.period >= 3 && game.clock < 300;
  const want = game.final ? 0.35 : game.phase === "intermission" ? 0.45 : close && late ? 1.25 : 1;
  if (Math.abs(want - SND.crowdLevel) > 0.05) sndCrowdTo(want);
  const t = SND.ctx.currentTime + 0.01;
  for (const e of q) {
    const f = SND_FX[e.k]; if (!f) continue;
    if (t - (SND.lastEv[e.k] || 0) < (SND_GAP[e.k] || 0.05)) continue;
    SND.lastEv[e.k] = t;
    try { f(t, e); } catch (x) {}
    // a big save gets an "ooh" from the crowd
    if (e.k === "save" && e.v >= 1) sndRoar(0.6, 1, "ooh");
    if (e.k === "post") sndRoar(0.9, 1, "ooh");
  }
}

// ---------- settings ----------
function sndSettingsWire() {
  const dlg = $("#settingsDlg"); if (!dlg) return;
  const rows = [["vMaster", "setVolMaster"], ["vMusic", "setVolMusic"], ["vSfx", "setVolSfx"], ["vCrowd", "setVolCrowd"], ["vHorn", "setVolHorn"]];
  for (const [k, id] of rows) {
    const el = document.getElementById(id); if (!el) continue;
    el.value = Math.round((settings[k] ?? 0.7) * 100);
    const out = document.getElementById(id + "Out"); if (out) out.textContent = el.value + "%";
    el.addEventListener("input", () => { settings[k] = +el.value / 100; if (out) out.textContent = el.value + "%"; saveSettings(); sndApplyVolumes(); sndCrowdTo(SND.crowdLevel); });
  }
  const on = $("#setSnd"); if (on) { on.checked = sndOn(); on.addEventListener("change", () => { settings.snd = on.checked; saveSettings(); sndQuickSync(); sndUnlock(); sndApplyVolumes(); sndRoute(); }); }
  const qb = $("#sndBtn"); if (qb) qb.addEventListener("click", () => { settings.snd = !sndOn(); saveSettings(); const o = $("#setSnd"); if (o) o.checked = sndOn(); sndQuickSync(); sndUnlock(); sndApplyVolumes(); sndRoute(); });
  sndQuickSync();
}
function sndQuickSync() {
  const b = $("#sndBtn"); if (!b) return;
  b.setAttribute("aria-pressed", String(sndOn())); b.title = sndOn() ? "Sound on (click to mute)" : "Sound off (click to unmute)";
  b.innerHTML = sndOn()
    ? `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Sound`
    : `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Muted`;
}
sndSettingsWire();
