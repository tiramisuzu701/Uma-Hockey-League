// ---------- Winning Live: the post-game concert for the winners ----------
// The winning team's three stars take the stage, center spot to the best of the night, with a synthesized
// pop track, sweeping lights, confetti and a sea of penlights in the team's colors.
const LIVE = { open: false, t0: 0, timer: 0, music: null, data: null };
const LIVE_LEN = 16; // seconds

function liveStarsFromGame(g) {
  const w = g.teams[0].score > g.teams[1].score ? 0 : 1, T = g.teams[w];
  const list = [];
  for (const p of T.lineup.roster) {
    const s = g.stats[p.id]; if (!s || !s.toi) continue;
    let v = s.g * 3.2 + s.a * 2 + s.sog * 0.25 + s.tk * 0.12 + s.blk * 0.25 + s.hit * 0.08 + s.pm * 0.3 + (s.sk ? 0.6 : 0);
    if (posGroup(p) === "G") v = s.sv * 0.18 - s.ga * 0.9 + (s.ga === 0 && s.sa > 10 ? 3 : 0);
    const line = posGroup(p) === "G" ? `${s.sv} saves` + (s.ga === 0 && s.sa ? " · shutout" : "") : `${s.g} G · ${s.a} A`;
    list.push({ p, v, line, team: T.team });
  }
  list.sort((a, b) => b.v - a.v);
  // Be A Player: if she's on the winning side and played her part, she takes center stage
  if (g.bap) { const i = list.findIndex(x => x.p.id === g.bap.me); if (i > 0 && i < 6) list.unshift(list.splice(i, 1)[0]); }
  return { team: T.team, w, stars: list.slice(0, 3) };
}
// a game worth a concert: playoffs, a hat trick, a shutout or a comeback (Settings decide how often)
function liveBigGame(g) {
  if (g.playoff) return "Playoff win";
  const w = g.teams[0].score > g.teams[1].score ? 0 : 1;
  if (Object.values(g.stats).some(s => s.g >= 3) && g.events.some(e => e.type === "goal" && e.team === w)) {
    const ht = g.teams[w].lineup.roster.find(p => g.stats[p.id] && g.stats[p.id].g >= 3); if (ht) return "Hat trick for " + ht.name;
  }
  if (g.teams[1 - w].score === 0) return "Shutout";
  let lowest = 0, d = 0; for (const e of g.events) if (e.type === "goal") { d += e.team === w ? 1 : -1; lowest = Math.min(lowest, d); }
  if (lowest <= -2) return "Comeback win";
  return "";
}
function liveFromGame(g, occasion) {
  const r = liveStarsFromGame(g); if (!r.stars.length) return null;
  const [h, a] = [g.teams[0].score, g.teams[1].score];
  return { team: r.team, stars: r.stars, title: occasion || (r.team.name + " win!"),
    sub: g.teams[1].team.abbr + " " + a + " – " + h + " " + g.teams[0].team.abbr + (g.decision && g.decision !== "REG" ? " (" + g.decision + ")" : "") };
}

// ---------- the stage ----------
function liveHtml(d) {
  const t = d.team, c1 = t.color || "#2F67D8", c2 = t.color2 || "#FFFFFF";
  const order = [d.stars[1], d.stars[0], d.stars[2]].filter(Boolean); // center to the best
  const perf = order.map((st, i) => {
    const center = st === d.stars[0], size = center ? 210 : 160;
    const img = hasChibi("b", st.p.name) ? chibiFull("b", st.p.name, size, "wl-img") : hasChibi("a", st.p.name) ? chibiFull("a", st.p.name, size, "wl-img") : `<span class="wl-ini" style="width:${size * 0.7}px;height:${size * 0.7}px">${esc(String(st.p.name).split(/\s+/).map(w => w[0]).join("").slice(0, 2))}</span>`;
    return `<div class="wl-perf${center ? " center" : ""}" style="--d:${(i * 0.13).toFixed(2)}s"><div class="wl-bounce">${img}</div><div class="wl-name"><b>${esc(st.p.name)}</b><small>${esc(st.line)}</small></div></div>`;
  }).join("");
  const sticks = Array.from({ length: 42 }, (_, i) => `<i style="--x:${(i * 2.4 + (i % 3) * 0.7).toFixed(1)}%;--h:${(8 + (i * 7) % 9)}px;--dl:${((i * 0.37) % 1).toFixed(2)}s;--c:${i % 3 === 1 ? c2 : c1}"></i>`).join("");
  const conf = Array.from({ length: 46 }, (_, i) => `<i style="--x:${(i * 13.7) % 100}%;--dl:${((i * 0.29) % 4).toFixed(2)}s;--c:${["#F2C14E", c1, c2, "#FF6FA8", "#7FE0C4"][i % 5]};--r:${(i * 47) % 360}deg"></i>`).join("");
  return `<div class="wl-stage" style="--c1:${esc(c1)};--c2:${esc(c2)}">
    <div class="wl-lights"><span></span><span></span><span></span><span></span></div>
    <div class="wl-confetti" aria-hidden="true">${conf}</div>
    <div class="wl-head"><span class="wl-logo">${teamLogoSvg(t, 54)}</span><div><span class="wl-tag">✦ Winning Live ✦</span><h2>${esc(d.title)}</h2><span class="wl-sub">${esc(d.sub || "")}</span></div></div>
    <div class="wl-floor"><div class="wl-perfs">${perf}</div></div>
    <div class="wl-crowd" aria-hidden="true">${sticks}</div>
    <div class="wl-btns"><button class="btn" id="wlEncore">Encore</button><button class="btn primary" id="wlClose">Close</button></div>
  </div>`;
}
function openWinningLive(d) {
  if (!d || !d.stars || !d.stars.length) return;
  let el = $("#winLive");
  if (!el) { el = document.createElement("div"); el.id = "winLive"; el.className = "wl"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Winning Live"); document.body.appendChild(el); }
  LIVE.data = d; LIVE.open = true;
  el.innerHTML = liveHtml(d); el.hidden = false; el.classList.remove("out"); void el.offsetWidth; el.classList.add("on");
  $("#wlClose").addEventListener("click", closeWinningLive);
  $("#wlEncore").addEventListener("click", () => { liveMusicStop(true); openWinningLive(LIVE.data); });
  if (typeof sndHornStop === "function") sndHornStop();
  if (typeof sndCrowdTo === "function") sndCrowdTo(0.25);
  liveMusicStart(d.team);
  clearTimeout(LIVE.timer); LIVE.timer = setTimeout(closeWinningLive, LIVE_LEN * 1000);
  setTimeout(() => { const b = $("#wlClose"); if (b) b.focus({ preventScroll: true }); }, 50);
}
function closeWinningLive() {
  const el = $("#winLive"); if (!el || !LIVE.open) return;
  LIVE.open = false; clearTimeout(LIVE.timer);
  liveMusicStop();
  el.classList.add("out");
  setTimeout(() => { if (!LIVE.open) { el.hidden = true; el.innerHTML = ""; el.classList.remove("on", "out"); } }, 700);
  if (typeof sndRoute === "function") sndRoute();
}
addEventListener("keydown", e => { if (e.key === "Escape" && LIVE.open) { e.preventDefault(); closeWinningLive(); } });

// ---------- the song: an upbeat four-chord pop loop, faded in and out over a second ----------
function liveMusicStart(team) {
  if (typeof SND === "undefined" || !SND.ctx || !sndOn()) return;
  const c = SND.ctx, out = c.createGain(), now = c.currentTime + 0.05, vol = Math.min(1, sndVol("vMusic") * 0.9);
  out.gain.setValueAtTime(0.0001, now); out.gain.linearRampToValueAtTime(vol, now + 1); // 1-second fade-in
  const end = now + LIVE_LEN; out.gain.setValueAtTime(vol, end - 1); out.gain.linearRampToValueAtTime(0.0001, end); // and out
  out.connect(SND.out);
  // each club plays in its own key
  const key = 57 + Math.floor(nameHash(team.id || team.name || "x", 5) * 7), bpm = 132, beat = 60 / bpm;
  const prog = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]; // I V vi IV
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const nodes = [];
  const note = (t, f, d, type, v, filt) => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    if (filt) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filt; o.connect(lp); lp.connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(t + d + 0.05); nodes.push(o);
  };
  const hit = (t, f, q, d, v, type) => {
    const s = c.createBufferSource(); s.buffer = SND.noise; const fl = c.createBiquadFilter(); fl.type = type || "highpass"; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 2, d + 0.05); nodes.push(s);
  };
  const bars = Math.floor(LIVE_LEN / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const ch = prog[b % 4], t0 = now + b * beat * 4;
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      // kick on every beat, a little pitch drop
      const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); nodes.push(o);
      if (k % 2 === 1) hit(t, 1800, 0.7, 0.14, 0.32, "bandpass");                 // snare
      hit(t + beat / 2, 7000, 0.5, 0.05, 0.12); hit(t, 8000, 0.5, 0.03, 0.06);   // hats
      note(t, hz(key - 24 + ch[0]), beat * 0.9, "triangle", 0.28);               // bass
      note(t + beat / 2, hz(key - 24 + ch[0] + 12), beat * 0.4, "triangle", 0.14);
    }
    for (const n of ch) note(t0, hz(key - 12 + n), beat * 3.6, "sawtooth", 0.045, 1800); // pad
    // a bright hook over the top
    const hook = [ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[2] + 14, ch[2] + 12, ch[1] + 12];
    hook.forEach((n, i) => note(t0 + i * beat / 2, hz(key + n), beat * 0.45, "square", b < 1 ? 0.0001 : 0.05, 3200));
  }
  LIVE.music = { out, nodes };
}
function liveMusicStop(now) {
  const m = LIVE.music; if (!m || !SND.ctx) return; LIVE.music = null;
  const t = SND.ctx.currentTime;
  m.out.gain.cancelScheduledValues(t); m.out.gain.setValueAtTime(m.out.gain.value, t); m.out.gain.linearRampToValueAtTime(0.0001, t + (now ? 0.15 : 1));
  setTimeout(() => { for (const n of m.nodes) { try { n.stop(); } catch (e) {} } try { m.out.disconnect(); } catch (e) {} }, now ? 250 : 1100);
}

// ---------- when it plays ----------
// after a watched game: a button always, and on its own for big games (Settings: big games / every win / never)
let liveShownFor = null;
function liveGameFrame() {
  const b = $("#liveBtn"); if (!b || !game) return;
  const show = game.final && !!game.stars;
  if (b.hidden === show) b.hidden = !show;
  if (!show || liveShownFor === game || currentView() !== "game" || skipping) return;
  liveShownFor = game;
  const mode = settings.live || "big";
  if (mode === "off") return;
  const why = (typeof frLiveOccasion === "function" && frLiveOccasion()) || liveBigGame(game);
  if (mode === "all" || why) setTimeout(() => { if (game && game.final && currentView() === "game" && !LIVE.open) openWinningLive(liveFromGame(game, why)); }, 3500);
}
(() => { const b = $("#liveBtn"); if (b) b.addEventListener("click", () => { if (game && game.final) openWinningLive(liveFromGame(game, liveBigGame(game) || null)); }); })();
(() => { const s = $("#setLive"); if (!s) return; s.value = settings.live || "big"; s.addEventListener("change", () => { settings.live = s.value; saveSettings(); }); })();
