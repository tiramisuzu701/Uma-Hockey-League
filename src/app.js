// ---------- App ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LS_KEY = "tracen-ice-league-v1";

// ---------- normalize / validate ----------
function normalizeTeam(t, i) {
  const id = String(t.id || t.abbr || ("T" + (i + 1))).trim().toUpperCase().slice(0, 6) || ("T" + (i + 1));
  return { id, name: String(t.name || id).slice(0, 40), abbr: String(t.abbr || id).toUpperCase().slice(0, 4),
    color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#5E6B7D", color2: /^#[0-9a-f]{6}$/i.test(t.color2) ? t.color2 : "#FFFFFF",
    color3: /^#[0-9a-f]{6}$/i.test(t.color3) ? t.color3 : "",
    pp: normUnits(t.pp, 5), pk: normUnits(t.pk, 4), tactics: normTactics(t.tactics), logo: normLogo(t.logo, { id, name: String(t.name || id) }) };
}
function normTactics(x) {
  x = x && typeof x === "object" ? x : {};
  const pick = (v, ok, dflt) => ok.includes(v) ? v : dflt;
  const agg = Math.round(Number(x.agg));
  return { pp: pick(x.pp, ["131", "overload", "spread"], "131"), pk: pick(x.pk, ["box", "diamond", "aggressive"], "box"),
    fc: pick(x.fc, ["122", "212", "trap"], "122"), agg: isFinite(agg) ? Math.max(0, Math.min(100, agg)) : 50 };
}
function normUnits(arr, n) {
  if (!Array.isArray(arr)) return null;
  const out = [0, 1].map(i => { const u = arr[i]; if (!Array.isArray(u)) return null; const v = [...Array(n)].map((_, k) => typeof u[k] === "string" && u[k] ? u[k] : null); return v.some(Boolean) ? v : null; });
  return out.some(Boolean) ? out : null;
}
function normalizePlayer(p, used, teamIds) {
  const name = String(p.name || "").trim();
  if (!name) return null;
  let id = String(p.id || slugify(name)); while (used.has(id)) id += "-" + Math.floor(Math.random() * 1000); used.add(id);
  const team = String(p.team || "FA").trim().toUpperCase() || "FA";
  if (team !== "FA" && !teamIds.has(team)) teamIds.add(team);
  let pos = String(p.pos || "C").trim().toUpperCase(); if (!POSITIONS.includes(pos)) pos = "C";
  let line = parseInt(p.line, 10); if (!(line >= 0 && line <= N_FLINES)) line = 0;
  if (pos === "D" && line > N_DPAIRS) line = 0; if (pos === "G" && line > 2) line = 2;
  const off = clampStat(p.off), def = clampStat(p.def);
  const out = { id, name: name.slice(0, 40), tag: String(p.tag || p.short || name.split(" ")[0]).trim().slice(0, 9) || name.slice(0, 8),
    no: Math.max(0, Math.min(99, parseInt(p.no, 10) || 0)), team, pos, line, off, def, goal: clampStat(p.goal),
    spd: p.spd == null || p.spd === "" ? clampStat((off + def) / 2) : clampStat(p.spd),
    sta: p.sta == null || p.sta === "" ? 75 : clampStat(p.sta),
    dis: p.dis == null || p.dis === "" ? 75 : clampStat(p.dis),
    hnd: 0, side: p.side === "L" || p.side === "R" ? p.side : "", style: "", friends: splitList(p.friends), groups: splitList(p.groups) };
  out.hnd = p.hnd == null || p.hnd === "" ? deriveHands(out) : clampStat(p.hnd);
  out.style = validStyle(out, String(p.style || "").trim());
  for (const k of NEW_STATS) if (p[k] != null && p[k] !== "" && !isNaN(Number(p[k]))) out[k] = clampStat(p[k]);
  fillRatings(out);
  out.pers = normPers(p.pers && typeof p.pers === "object" ? p.pers : p.personality ? { a: p.personality, b: p.personality2, p1: p.cares1, p2: p.cares2 } : null, out);
  return out;
}
function normalizeLeague(L) {
  if (!L || !Array.isArray(L.players)) return null;
  L = JSON.parse(JSON.stringify(L));
  L.teams = Array.isArray(L.teams) ? L.teams : [];
  L.players.forEach(p => { p.friends = splitList(p.friends); p.groups = splitList(p.groups); });
  upgradeLeague(L);
  const teams = L.teams.map(normalizeTeam);
  const seen = new Set(); const teamsU = teams.filter(t => !seen.has(t.id) && seen.add(t.id));
  const ids = new Set(teamsU.map(t => t.id)); const used = new Set();
  const players = L.players.map(p => normalizePlayer(p, used, ids)).filter(Boolean);
  for (const id of ids) if (!teamsU.some(t => t.id === id)) teamsU.push(normalizeTeam({ id, name: id }, teamsU.length));
  return { version: LEAGUE_VERSION, teams: teamsU, players };
}

let league = defaultLeague();
try { const c = localStorage.getItem(LS_KEY); if (c) league = normalizeLeague(JSON.parse(c)) || league; } catch (e) {}

// ---------- persistence ----------
const store = { db: null, ref: null, mode: "local", lastWritten: 0, timer: null, readOnly: false, writing: false, again: false };
function setPill(state, text) { const el = $("#savePill"); el.dataset.s = state; el.textContent = text; }
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(league)); } catch (e) {} }
function scheduleSave() {
  saveLocal();
  if (store.mode !== "db") { setPill("saved", "Saved in this browser"); return; }
  if (store.readOnly) { setPill("error", "View only: changes won't be kept"); return; }
  setPill("saving", "Saving…");
  clearTimeout(store.timer);
  store.timer = setTimeout(flushSave, 700);
}
async function flushSave() {
  if (store.writing) { store.again = true; return; }
  store.writing = true;
  const stamp = Date.now(); store.lastWritten = stamp;
  try {
    await store.ref.set({ version: LEAGUE_VERSION, teams: league.teams, players: league.players, updatedAt: stamp });
    setPill("saved", "Saved");
  } catch (e) {
    const code = e && e.code;
    if (code === "invalid_argument") { store.readOnly = true; setPill("error", "View only: changes won't be kept"); }
    else if (code === "quota_exceeded") setPill("error", "Storage is full. Remove some players and try again.");
    else if (code === "unavailable") { setTimeout(flushSave, 1200 + Math.random() * 800); setPill("saving", "Retrying save…"); }
    else setPill("error", "Couldn't save. Your edits stay in this browser.");
  }
  store.writing = false;
  if (store.again) { store.again = false; flushSave(); }
}
let downloadsApi = null;
async function initStore() {
  const cl = window.claude;
  if (!cl || !cl.use) { setPill("saved", "Saved in this browser"); return; }
  cl.use("downloads").then(d => { if (d) downloadsApi = d; }).catch(() => {});
  let db = null;
  try { db = await cl.use("db"); } catch (e) {}
  if (!db) { setPill("saved", "Saved in this browser"); return; }
  store.db = db; store.mode = "db"; store.ref = db.doc("league/roster");
  setPill("saving", "Loading saved roster…");
  let first = true;
  store.ref.onSnapshot(snap => {
    if (snap.exists) {
      const data = snap.data();
      if (data.updatedAt && data.updatedAt === store.lastWritten) { first = false; return; }
      const L = normalizeLeague(data);
      if (L) {
        league = L; saveLocal(); refreshAll();
        if ((data.version || 1) < LEAGUE_VERSION) scheduleSave();
      }
      setPill("saved", "Saved");
    } else setPill("saved", first ? "Default roster: edit to save" : "Saved");
    first = false;
  }, () => { setPill("error", "Live saving stopped. Edits stay in this browser."); store.mode = "local"; });
}

// ---------- views ----------
function currentView() { const h = location.hash.replace("#", ""); return ["menu", "game", "franchise", "bap", "lines", "roster"].includes(h) ? h : "menu"; }
function showView() {
  const v = currentView();
  for (const id of ["menu", "game", "franchise", "bap", "lines", "roster"]) $("#view-" + id).hidden = id !== v;
  if (v === "franchise") renderFranchise();
  if (v === "bap") renderBap();
  if (v === "game") frLiveBar();
  if (v === "menu") renderMenu();
  document.querySelectorAll(".tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false"));
  if (v === "lines") renderLines();
  if (v === "roster") renderRoster();
  if (v === "game") resizeRink();
}
window.addEventListener("hashchange", showView);
function teamById(id) { return league.teams.find(t => t.id === id); }
function refreshAll() {
  fillTeamSelects();
  if (currentView() === "lines") renderLines();
  if (currentView() === "roster") renderRoster();
}

// ---------- matchup ----------
function fillTeamSelects() {
  const a = $("#awaySel"), h = $("#homeSel");
  const av = a.value, hv = h.value;
  const opts = league.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  a.innerHTML = opts; h.innerHTML = opts;
  const ids = league.teams.map(t => t.id);
  a.value = ids.includes(av) ? av : (ids[1] || ids[0] || "");
  h.value = ids.includes(hv) ? hv : (ids[0] || "");
  checkMatchup();
}
function checkMatchup() {
  const a = $("#awaySel").value, h = $("#homeSel").value;
  let msg = "";
  if (!a || !h) msg = "Add at least two teams in the roster sheet.";
  else if (a === h) msg = "Pick two different teams.";
  else for (const id of [a, h]) { const L = buildLineup(league, id); if (!L.ok) msg = teamById(id).name + ": " + (L.problems[L.problems.length - 1] || "lineup incomplete"); }
  $("#matchNote").textContent = msg;
  $("#newGameBtn").disabled = !!msg;
  return !msg;
}
$("#awaySel").addEventListener("change", checkMatchup);
$("#homeSel").addEventListener("change", checkMatchup);

// ---------- game loop ----------
let game = null, playing = true, speed = 1, acc = 0, lastTs = 0, skipping = null;
let shownEvents = 0, boxTeam = 1, lastBox = 0, bannerRef = null;
const SIM_NOTE = "1× runs the clock at 3 game seconds per real second.";

function newGame() {
  if (!checkMatchup()) return;
  if (typeof frLive !== "undefined" && frLive) { frLive = null; frLiveBar(); }
  beginGame(new Game(JSON.parse(JSON.stringify(league)), $("#homeSel").value, $("#awaySel").value, { randomMoods: settings.qpMoods !== false }));
}
function beginGame(g) {
  game = g;
  stopReplay();
  shownEvents = 0; $("#feed").innerHTML = ""; acc = 0; skipping = null; bannerRef = null;
  $("#banner").hidden = true; $("#starsBox").innerHTML = ""; $("#simNote").textContent = SIM_NOTE;
  playing = true; syncPlay();
  bugGoals = 0; bugUntil = 0; bugBuilt = ""; $("#bug").classList.remove("goal");
  setBoard(); renderBox(true); sumKey = ""; renderSummary();
}
$("#newGameBtn").addEventListener("click", newGame);
function syncPlay() {
  const b = $("#playBtn"), fin = game && game.final;
  b.textContent = fin ? "Final" : playing ? "❚❚ Pause" : "▶ Play";
  b.setAttribute("aria-label", fin ? "Game over" : playing ? "Pause" : "Play");
  b.disabled = !!fin || !!skipping;
  $("#skipPeriodBtn").disabled = !!fin || !!skipping;
  $("#skipGameBtn").disabled = !!fin || !!skipping;
  const sb = $("#skipShiftBtn"); sb.hidden = !(game && game.bap); sb.disabled = !!fin || !!skipping;
}
$("#playBtn").addEventListener("click", () => { playing = !playing; syncPlay(); });
$("#speedSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  speed = parseFloat(b.dataset.speed);
  $("#speedSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
});
document.addEventListener("keydown", e => {
  if (currentView() !== "game" || e.target.closest("input,select,textarea,button")) return;
  if (e.code === "Space") { e.preventDefault(); if (replay) stopReplay(); else if (game && !game.final) { playing = !playing; syncPlay(); } }
});
$("#skipPeriodBtn").addEventListener("click", () => startSkip("period"));
$("#skipGameBtn").addEventListener("click", () => startSkip("game"));
$("#skipShiftBtn").addEventListener("click", () => startSkip("shift"));
// Be A Player: is she out there right now?
const meOnIce = () => !!(game && game.bap && game.skaters.some(s => s.p.id === game.bap.me && s.state === "on"));
function startSkip(mode) {
  if (!game || game.final) return;
  stopReplay();
  if (game.moment) { game.resolveMoment(null, true); hideMoment(); }
  if (game.phase === "intermission") game.nextPeriod();
  skipping = { mode, startP: game.period, wasOn: mode === "shift" && meOnIce() };
  $("#simNote").textContent = mode === "game" ? "Simulating the rest of the game…" : mode === "shift" ? "Skipping ahead to your next shift…" : "Simulating to the end of the period…";
  syncPlay();
}
function runSkipChunk() {
  const t0 = performance.now();
  while (performance.now() - t0 < 14) {
    for (let i = 0; i < 40; i++) {
      if (game.holdInt && game.phase === "intermission") game.holdInt = false; // skipping past a coaching stop
      game.step(SIM_DT * 2);
      if (skipping.mode === "shift" && skipping.wasOn && !meOnIce()) skipping.wasOn = false; // finish the current shift first
      const done = game.final || (skipping.mode === "period" && (game.period !== skipping.startP || game.phase === "intermission")) || (skipping.mode === "shift" && !skipping.wasOn && meOnIce());
      if (done) { skipping = null; acc = 0; $("#simNote").textContent = SIM_NOTE; syncPlay(); renderBox(true); return; }
    }
  }
}
function frame(ts) {
  const dt = Math.min(0.1, lastTs ? (ts - lastTs) / 1000 : 0); lastTs = ts;
  if (game && game.final && frLive && !frLive.saved) frOnFrame();
  if (game && typeof sndGameFrame === "function") sndGameFrame();
  if (game && typeof liveGameFrame === "function") liveGameFrame();
  if (game && game.bap) { game.bap.auto = !!skipping; if (game.moment) showMoment(); else if (momentShown) hideMoment(); }
  if (game) {
    if (replay) { replay.t += dt * replaySpeed; if (replay.t > replay.R.end + 0.5) stopReplay(); else updateReplayUi(); }
    else if (skipping) runSkipChunk();
    else if (playing && !game.final && currentView() !== "menu" && !game.moment) {
      acc += dt * speed; let n = 0;
      while (acc >= SIM_DT && n < 24) { game.step(SIM_DT); acc -= SIM_DT; n++; if (game.replayReady) break; }
      if (n >= 24) acc = 0;
      if (game.final) syncPlay();
    }
    if (game.replayReady && !(performance.now() < bugUntil && $("#autoReplay").checked && !skipping)) {
      const ev = game.replayReady; game.replayReady = null;
      if ($("#autoReplay").checked && !skipping && !replay && currentView() === "game") startReplay(ev);
    }
    if (currentView() === "game") { showSkillPop(); if (typeof frCoachFrame === "function") frCoachFrame(); drawRink(); setBoard(); pumpFeed(); if (ts - lastBox > 600) { lastBox = ts; renderBox(); renderSummary(); } }
  }
  requestAnimationFrame(frame);
}

// ---------- unique skills: a cut-in on the rink when one fires ----------
let skillPopId = 0, skillPopT = 0;
function showSkillPop() {
  const el = $("#skillPop"); if (!el || !game) return;
  const sp = game.skillPop;
  if (sp && sp.id !== skillPopId && !skipping && !replay && game.time - sp.t < 2) {
    skillPopId = sp.id; skillPopT = performance.now();
    const t = game.teams[sp.team].team;
    el.style.setProperty("--tc", t.color);
    el.innerHTML = `${chibiHead(sp.name, 40, t)}<span><i>✦ Unique skill</i><b>${esc(sp.n)}</b><small>${esc(sp.name)}</small></span>`;
    el.hidden = false; el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
  }
  if (!el.hidden && performance.now() - skillPopT > 2600) el.hidden = true;
}
// ---------- player card: click any portrait (or name button) for a quick look ----------
function pcardPlayers() { if (currentView() === "game" && game && game.league) return game.league.players; return (currentView() === "franchise" || currentView() === "bap") && typeof FR !== "undefined" && FR ? FR.players : league.players; }
function pcardTeam(id) { if (currentView() === "game" && game && game.league) return game.league.teams.find(t => t.id === id) || null; const F = (currentView() === "franchise" || currentView() === "bap") && typeof FR !== "undefined" && FR ? FR : null; return (F ? F.teams : league.teams).find(t => t.id === id) || null; }
function playerCardHtml(p) {
  const F = (currentView() === "franchise" || currentView() === "bap") && typeof FR !== "undefined" && FR ? FR : null;
  const t = pcardTeam(p.team), g = posGroup(p), o = overall(p);
  const keys = g === "G" ? ["goal", "sta", "clu", "dis"] : ["sht", "pas", "hnd", "skt", "spd", "def", "chk", "fo", "sta", "dis", "clu"];
  const bars = keys.map(k => { const v = p[k] == null ? (k === "sht" || k === "pas" ? p.off : 50) : Number(p[k]); return `<div class="pc-r"><span>${STAT_LABEL[k]}</span><i><b style="width:${v}%"></b></i><em>${v}</em></div>`; }).join("");
  let stats = "";
  const line = (lab, s) => g === "G"
    ? `<tr><td>${lab}</td><td>${s.gp}</td><td>${s.w}-${s.l}-${s.otl}</td><td>${s.sa ? (s.sv / s.sa).toFixed(3).replace(/^0/, "") : "–"}</td><td>${s.toi ? (s.ga * 3600 / s.toi).toFixed(2) : "–"}</td><td>${s.so}</td></tr>`
    : `<tr><td>${lab}</td><td>${s.gp}</td><td>${s.g}</td><td>${s.a}</td><td><b>${s.g + s.a}</b></td><td>${s.pm > 0 ? "+" : ""}${s.pm}</td><td>${s.gp ? fmtToi(s.toi / s.gp) : "–"}</td></tr>`;
  if (F && !F.S) stats = "";
  else if (F && F.S) {
    const rs = F.S.stats[p.id], ps = F.S.pstats[p.id];
    if (rs || ps) stats = `<table class="pc-st"><thead><tr><th></th>${g === "G" ? "<th>GP</th><th>Rec</th><th>SV%</th><th>GAA</th><th>SO</th>" : "<th>GP</th><th>G</th><th>A</th><th>P</th><th>+/-</th><th>TOI</th>"}</tr></thead><tbody>${rs ? line("Season " + F.season, rs) : ""}${ps && ps.gp ? line("Playoffs", ps) : ""}</tbody></table>`;
    else stats = `<p class="note">No games this season yet.</p>`;
  } else if (game && game.stats[p.id] && game.stats[p.id].toi) {
    const s = game.stats[p.id];
    stats = g === "G" ? `<p class="note">This game: ${s.sv} saves on ${s.sa} shots.</p>` : `<p class="note">This game: ${s.g} G, ${s.a} A, ${s.sog} SOG, ${s.hit} hits, ${fmtClock(Math.round(s.toi))} on ice.</p>`;
  }
  const mates = pcardPlayers().filter(x => x.team === p.team && x.id !== p.id);
  // friendship runs both ways: her own list plus everyone who lists her; teammates first
  const all = pcardPlayers(), fset = new Map();
  for (const n of p.friends || []) { const q = all.find(x => x.name.toLowerCase() === n.toLowerCase()); if (q) fset.set(q.name, q); }
  for (const q of all) if (q.id !== p.id && (q.friends || []).some(n => n.toLowerCase() === p.name.toLowerCase())) fset.set(q.name, q);
  const fr = [...fset.values()].sort((a, b) => (b.team === p.team) - (a.team === p.team) || a.name.localeCompare(b.name)).map(q => { const on = q.team === p.team && p.team !== "FA" && p.team !== "POOL"; return `<span class="pc-tag${on ? " on" : ""}" title="${on ? "On the same team" : ""}" data-pname="${esc(q.name)}">${esc(q.name)}</span>`; }).join("");
  const extra = [];
  if (F && p.con && t) extra.push(money(p.con.sal) + " × " + p.con.yrs + (p.con.yrs === 1 ? " yr" : " yrs"));
  if (F && typeof frPotential === "function" && F.mode !== "bap") extra.push("Potential: " + frPotential(p));
  if (p.inj) extra.push(`<span class="bad">Out ${p.inj.g} game${p.inj.g > 1 ? "s" : ""}: ${esc(p.inj.what)}</span>`);
  return `<div class="pc-top">${hasChibi("a", p.name) ? chibiFull("a", p.name, 110, "pc-img") : chibiHead(p.name, 96, t)}
      <div class="pc-id"><h2 id="pcardTitle">${esc(p.name)}</h2><span class="note">#${p.no} · ${p.pos} · ${esc(p.style)} · shoots ${shootsOf(p) === "L" ? "left" : "right"}</span>
      <span class="pc-team">${t ? teamLogoSvg(t, 22) + " " + esc(t.name) : p.team === "FA" ? "Free agent" : p.team === "POOL" ? "In the draft pool" : esc(p.team)}</span>
      <span class="pc-ovr">${o} <span class="gr" data-g="${grade(o)}">${grade(o)}</span> OVR</span>${extra.length ? `<span class="note">${extra.join(" · ")}</span>` : ""}</div></div>
    <p class="note pc-style">${esc(STYLE_NOTES[p.style] || "")}</p>
    ${(() => { const pe = persInfo(p), bl = persBlurb(p); return `<div class="pc-pers"><span class="pc-arch" title="${esc(PERS_HELP[pe.a] || "")}">${esc(pe.a)}</span>${pe.b ? `<span class="pc-arch sub" title="${esc(PERS_HELP[pe.b] || "")}">${esc(pe.b)}</span>` : ""}<span class="note">Cares about <b title="${esc(PRI_HELP[pe.p1] || "")}">${esc(pe.p1.toLowerCase())}</b> and <b title="${esc(PRI_HELP[pe.p2] || "")}">${esc(pe.p2.toLowerCase())}</b></span>${p.treq ? `<em class="fr-tagv">Asked for a trade</em>` : p.unhW ? `<em class="fr-tagv">Wants a bigger role</em>` : ""}
      <p class="note pc-blurb">${esc(bl || PERS_HELP[pe.a] || "")}</p></div>`; })()}
    ${(() => { const sk = skillOf(p); if (!sk) return ""; return `<div class="pc-skill"><span class="pc-sk-n">✦ ${esc(sk.n)}</span><span class="note">${esc(SKILL_TRIG[sk.t] || "")}: ${esc(SKILL_FX[sk.e] || "")}. Once a game${posGroup(p) === "G" ? "" : ""}; mood and clutch make it come out sooner.</span>${sk.g ? `<span class="note pc-sk-g">In the Uma game: ${esc(sk.g)}</span>` : ""}</div>`; })()}
    ${p.md != null ? (() => { const lv = moodLevel(p.md), m = MOODS[String(lv)]; return `<div class="pc-mood">${moodBadge(lv)}<b>${m.name} mood</b><span class="note">${m.fx} to her play${(p.mdw || []).length ? " · lately: " + p.mdw.map(x => `<span class="${x.s > 0 ? "good" : "bad"}">${esc(x.t.toLowerCase())}</span>`).join(", ") : ""}</span></div>`; })() : ""}
    ${F && typeof frPcardDraft === "function" ? frPcardDraft(p) : ""}
    <div class="pc-rs">${bars}</div>${stats}
    ${fr ? `<div class="pc-fr"><b>Friends</b>${fr}</div>` : ""}`;
}
function openPlayerCard(name) {
  const p = pcardPlayers().find(x => x.name === name) || league.players.find(x => x.name === name); if (!p) return;
  $("#pcardBody").innerHTML = playerCardHtml(p);
  const d = $("#pcardDlg"); if (d.open) return; if (d.showModal) d.showModal(); else d.setAttribute("open", "");
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-pname]"); if (!el || el.closest(".fr-tp, .mo-btn, #pcardDlg, .menu-crowd")) return;
  e.preventDefault(); e.stopPropagation(); openPlayerCard(el.dataset.pname);
}, true);
$("#pcardDlg").addEventListener("click", e => {
  if (e.target.closest("[data-close]") || e.target === $("#pcardDlg")) { $("#pcardDlg").close(); return; }
  const ft = e.target.closest(".pc-tag[data-pname]"); if (ft) { openPlayerCard(ft.dataset.pname); return; }
  const b = e.target.closest("[data-fr]"); if (b && typeof frAction === "function") { $("#pcardDlg").close(); frAction(b); }
});
// keyboard: Enter or Space on a clickable name opens the card
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".pcl[data-pname]")) { e.preventDefault(); openPlayerCard(e.target.dataset.pname); } });

// ---------- an in-page confirm box (the browser's own confirm() is blocked inside the artifact frame) ----------
function uiConfirm(msg, ok, danger) {
  return new Promise(resolve => {
    const d = $("#confirmDlg");
    $("#confirmMsg").textContent = msg;
    const yes = $("#confirmYes"); yes.textContent = ok || "OK"; yes.className = "btn " + (danger ? "dangerfill" : "primary");
    const done = v => { d.removeEventListener("close", onClose); if (d.open) d.close(); resolve(v); };
    const onClose = () => done(d.returnValue === "yes");
    d.returnValue = ""; d.addEventListener("close", onClose);
    if (d.showModal) d.showModal(); else { d.setAttribute("open", ""); }
    yes.focus();
  });
}

// ---------- Be A Player: the key-moment card over the rink ----------
let momentShown = null, momentT0 = 0, moLast = 0;
const MOMENT_SECS = 12;
function showMoment() {
  const M = game.moment, el = $("#moment"); if (!el) return;
  if (momentShown !== M) {
    momentShown = M; momentT0 = performance.now();
    el.innerHTML = `<div class="mo-h"><span class="mo-tag">Your call</span><b>${esc(M.title)}</b><i class="mo-time"><span id="moTime"></span></i></div>
      <div class="mo-opts">${M.choices.map((c, i) => `<button class="mo-btn" data-mo="${esc(c.key)}"><kbd>${i + 1}</kbd><span><b>${esc(c.label)}</b><small>${esc(c.sub)}</small></span></button>`).join("")}</div>`;
    el.hidden = false;
    // the card sits under the rink; bring it into view without hiding the ice
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), rk = cv.getBoundingClientRect();
      let dy = 0;
      if (r.bottom - rk.top <= innerHeight - 12) { // the ice and the card both fit: show the whole rink with the card under it
        if (r.bottom > innerHeight - 8) dy = r.bottom - innerHeight + 8;
        if (rk.top - dy < 4) dy = rk.top - 4;
      } else if (r.bottom > innerHeight - 8 || r.top < 0) dy = r.bottom - innerHeight + 8;
      if (Math.abs(dy) > 2) scrollBy({ top: dy, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    const first = el.querySelector(".mo-btn"); if (first && !matchMedia("(pointer: coarse)").matches) first.focus({ preventScroll: true });
  }
  const now = performance.now(); if (!playing || currentView() !== "game") momentT0 += now - (moLast || now); moLast = now; // the clock waits while paused
  const left = MOMENT_SECS - (now - momentT0) / 1000, bar = $("#moTime");
  if (bar) bar.style.width = Math.max(0, left / MOMENT_SECS * 100) + "%";
  if (left <= 0) { game.resolveMoment(null, true); hideMoment(); }
}
function hideMoment() { momentShown = null; const el = $("#moment"); if (el) { el.hidden = true; el.innerHTML = ""; } }
{ const mo = $("#moment"), rb = mo && mo.closest(".rinkbox"); if (rb) rb.after(mo); } // the decision card lives below the ice, not on it
$("#moment").addEventListener("click", e => { const b = e.target.closest("[data-mo]"); if (!b || !game || !game.moment) return; game.resolveMoment(b.dataset.mo); hideMoment(); });
document.addEventListener("keydown", e => {
  if (!game || !game.moment || currentView() !== "game") return;
  const n = parseInt(e.key, 10); if (n >= 1 && n <= game.moment.choices.length) { e.preventDefault(); game.resolveMoment(game.moment.choices[n - 1].key); hideMoment(); }
});

// ---------- main menu: a few characters hanging around the rink ----------
function renderMenu() {
  const crowd = $("#menuCrowd"); if (!crowd) return;
  const names = [...new Set([...Object.keys(CHIBI.a.map)])];
  const byKey = {}; for (const p of league.players) byKey[chibiKey(p.name)] = p;
  const pool = names.filter(k => byKey[k]);
  const n = window.innerWidth < 640 ? 3 : window.innerWidth < 1100 ? 4 : 6;
  const pick = []; const used = new Set();
  while (pick.length < n && used.size < pool.length) { const k = pool[Math.floor(Math.random() * pool.length)]; if (!used.has(k)) { used.add(k); pick.push(byKey[k]); } }
  // on wide screens they stand on the ice either side of the menu; on narrow ones they line up underneath it
  const slots = n === 3 ? [16, 50, 84] : n === 4 ? [10, 30, 70, 90] : [5, 15, 25, 75, 85, 95];
  crowd.innerHTML = pick.map((p, i) => {
    const cheer = hasChibi("b", p.name) && Math.random() < 0.5, size = 130 + Math.round(Math.random() * 40), flip = slots[i] > 50 ? " flip" : "";
    const t = league.teams.find(x => x.id === p.team);
    const art = chibiFull(cheer ? "b" : "a", p.name, size, "mc-art");
    return `<button type="button" class="mc${flip}" style="left:${slots[i]}%;--d:${(Math.random() * 2).toFixed(2)}s;z-index:${2 + (i % 2)}" aria-label="${esc(p.name)}${t ? ", " + esc(t.name) : ", free agent"}">${art}<span class="mc-tip">${esc(p.name)}<small>${t ? esc(t.name) : "Free agent"}</small></span></button>`;
  }).join("");
}
$("#menuCrowd").addEventListener("click", e => {
  const b = e.target.closest(".mc"); if (!b) return;
  b.classList.remove("hop"); void b.offsetWidth; b.classList.add("hop");
  b.classList.add("tip"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("tip"), 2200);
});
$("#menuSettings").addEventListener("click", () => $("#settingsBtn").click());

// ---------- settings ----------
const SET_DEFAULTS = { snd: true, vMaster: 0.8, vMusic: 0.6, vSfx: 0.8, vCrowd: 0.6, vHorn: 0.8, live: "big", qpMoods: true, net: "un", names: true, arrows: true, sticks: true, rings: true, passes: true, lineInfo: false, zoom: 1.2, icon: 1.15, bugSize: 1, motion: "device" };
let settings = Object.assign({}, SET_DEFAULTS);
try {
  const raw = JSON.parse(localStorage.getItem("tracen-settings") || "null");
  if (raw && typeof raw === "object") for (const k of Object.keys(SET_DEFAULTS)) if (typeof raw[k] === typeof SET_DEFAULTS[k]) settings[k] = raw[k];
  else { const old = localStorage.getItem("tracen-net"); if (old) settings.net = { uma: "nbc", uhl: "espn", off: "classic" }[old] || "un"; }
} catch (x) {}
function saveSettings() { try { localStorage.setItem("tracen-settings", JSON.stringify(settings)); } catch (x) {} }

// ---------- broadcast scorebugs (made-up networks, styled after the usual layouts) ----------
const NETS = [
  { id: "un", name: "Uma Network", short: "UN", note: "Team, score and clock on top, shots underneath" },
  { id: "nbc", name: "UMA Sports", short: "UMA", note: "Long bar along the bottom in team colors" },
  { id: "espn", name: "UHL on USPN", short: "USPN", note: "Stacked teams with logos, shots on the side" },
  { id: "tsn", name: "USN", short: "USN", note: "Clock box, stacked teams, power play on the right" },
  { id: "classic", name: "Classic", short: "", note: "The full scoreboard above the rink" }
];
let bugGoals = 0, bugUntil = 0, bugTimer = null, bugBuilt = "";
function textOn(hex) { return lum(hex) > 0.42 ? "#111722" : "#FFFFFF"; }
const ppClock = sec => sec < 60 ? ":" + String(Math.max(0, Math.ceil(sec))).padStart(2, "0") : fmtClock(sec);
function bugTemplate(id) {
  const team = (k, extra) => `<div class="b-team" data-k="${k}"${extra || ""}><span class="b-logo" data-r="logo${k}"></span><span class="b-ab" data-r="ab${k}"></span><b class="b-sc" data-r="sc${k}"></b></div>`;
  const goal = `<div class="bug-goal" aria-hidden="true"><i class="sweep"></i><i class="shine"></i><span class="glogo" data-r="goalLogo"></span><span class="gw">${"GOAL".split("").map((ch, i) => `<b style="--i:${i}">${ch}</b>`).join("")}</span><span class="gwho" data-r="goalWho"></span></div>`;
  if (id === "un") return `<div class="b-net"><span class="un-mark">U<i>N</i></span></div><div class="b-feat" data-r="featLogo"></div>
    <div class="b-main"><div class="b-row1">${team("A")}${team("H")}</div><div class="b-row2"><b data-r="sogA"></b><span>SHOTS</span><b data-r="sogH"></b></div></div>
    <div class="b-clock"><b data-r="clk"></b><span data-r="per"></span></div><div class="b-pp" data-r="ppwrap"><span data-r="pp"></span></div>${goal}`;
  if (id === "nbc") return `<div class="b-net"><span class="uma-mark"><i></i>UMA</span></div>
    <div class="b-teams">${["A", "H"].map(k => `<div class="b-team" data-k="${k}"><span class="b-ab" data-r="ab${k}"></span><b class="b-sc" data-r="sc${k}"></b><span class="b-sh"><i>SHOTS</i><b data-r="sog${k}"></b></span></div>`).join("")}</div>
    <div class="b-clock"><span data-r="per"></span><b data-r="clk"></b></div><div class="b-pp" data-r="ppwrap"><span data-r="pp"></span></div>${goal}`;
  if (id === "espn") return `<div class="b-brand"><span class="uhl-shield">UHL</span><span class="uspn">USPN</span></div>
    <div class="b-clock"><b data-r="per"></b><b data-r="clk"></b></div>
    <div class="b-teams">${team("A")}${team("H")}</div>
    <div class="b-shots"><b data-r="sogA"></b><span>SHOTS</span><b data-r="sogH"></b></div>
    <div class="b-pp" data-r="ppwrap"><span data-r="pp"></span></div>${goal}`;
  if (id === "tsn") return `<div class="b-left"><span class="usn">USN</span><b data-r="clk"></b><span data-r="per"></span></div>
    <div class="b-teams">${team("A")}${team("H")}</div>
    <div class="b-pp" data-r="ppwrap"><span data-r="pp"></span></div>
    <div class="b-sog"><b data-r="sogA"></b><span>SOG</span><b data-r="sogH"></b></div>${goal}`;
  return "";
}
function bugSet(r, v) { const el = $("#bug").querySelector(`[data-r="${r}"]`); if (el) setText(el, v); }
function updateBug() {
  const bug = $("#bug"), id = settings.net;
  $("#view-game").classList.toggle("bugmode", id !== "classic");
  const [H, A] = game.teams;
  const key = id + "|" + JSON.stringify([H.team, A.team].map(t => [t.color, t.color2, t.color3, t.logo, t.abbr, t.name]));
  if (bugBuilt !== key) {
    bugBuilt = key; bug.dataset.net = id; bug.innerHTML = bugTemplate(id);
    for (const [T, k] of [[A, "A"], [H, "H"]]) {
      bug.querySelectorAll(`[data-r="logo${k}"]`).forEach(el => el.innerHTML = teamLogoSvg(T.team, 30));
      bug.querySelectorAll(`.b-team[data-k="${k}"]`).forEach(el => el.style.setProperty("--ti", teamInk(T.team)));
      bug.querySelectorAll(`.b-team[data-k="${k}"]`).forEach(el => { el.style.setProperty("--tc", T.team.color); el.style.setProperty("--tt", textOn(T.team.color)); el.style.setProperty("--t3", T.team.color3 || T.team.color2); });
    }
  }
  if (id === "classic") return;
  bug.classList.toggle("hide", !!replay && !bug.classList.contains("goal"));
  for (const [T, k] of [[A, "A"], [H, "H"]]) {
    bugSet("ab" + k, T.team.abbr); bugSet("sog" + k, T.sog);
    const sc = bug.querySelector(`[data-r="sc${k}"]`);
    if (sc && sc.textContent !== String(T.score)) { const first = sc.textContent === ""; sc.textContent = T.score; if (!first) { sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop"); } }
  }
  const per = game.final ? (game.decision === "REG" ? "FINAL" : "F/" + (game.playoff && game.otN > 1 ? game.otN + "OT" : game.decision)) : game.phase === "intermission" ? "END " + (game.period === 4 && game.playoff ? game.otName(game.otN - 1) : periodName(game.period)).toUpperCase() : game.period >= 5 ? "SO" : game.perName().toUpperCase();
  bugSet("per", per); bugSet("clk", game.final || game.period >= 5 ? "" : fmtClock(game.clock));
  // the strip: power play first, then empty net, delayed penalty, 4-on-4, shootout
  let strip = "", st = null;
  const n0 = game.strength(0), n1 = game.strength(1);
  if (game.period >= 5 && !game.final && game.so) strip = "SHOOTOUT " + A.team.abbr + " " + game.so.goals[1] + " – " + game.so.goals[0] + " " + H.team.abbr;
  else if (!game.final && n0 !== n1) {
    const ti = n0 > n1 ? 0 : 1, O = game.teams[1 - ti], bx = O.box.filter(x => x.active && !x.coin); st = game.teams[ti].team;
    const left = bx.length ? ppClock(Math.min(...bx.map(x => x.left))) : "";
    const five = Math.abs(n0 - n1) > 1 ? (id === "tsn" ? "5 ON 3" : "5-ON-3 ") : "";
    strip = id === "espn" ? `${st.abbr} ${five || "POWER PLAY"} ${left}` : id === "tsn" ? `${five || "POWER PLAY"}|${left}` : `${five || "POWER PLAY"} ${left}`;
  }
  else if (!game.final && n0 === n1 && n0 < 5 && game.period <= 4) strip = n0 + " ON " + n1;
  if (!strip && !game.final) for (let ti = 0; ti < 2; ti++) if (game.teams[ti].pulled) { st = game.teams[ti].team; strip = id === "espn" ? st.abbr + " EMPTY NET" : "EMPTY NET"; }
  if (!strip && !game.final) for (let ti = 0; ti < 2; ti++) if (game.teams[ti].pend.length) strip = "DELAYED PENALTY";
  const wrap = bug.querySelector('[data-r="ppwrap"]');
  if (wrap) {
    wrap.classList.toggle("on", !!strip);
    const pp = wrap.querySelector('[data-r="pp"]');
    if (id === "tsn") { const [a, b2] = strip.split("|"); const h = strip ? `${a.replace(" ", "<br>")}${b2 ? "<br><b>" + b2 + "</b>" : ""}` : ""; if (pp.innerHTML !== h) pp.innerHTML = h; }
    else setText(pp, strip);
    // UMA Sports hangs the strip under the team on the power play
    if (id === "nbc") wrap.dataset.side = st && st === H.team ? "H" : "A";
    // power play and empty net strips wear the team's color
    wrap.classList.toggle("team", !!st);
    wrap.style.setProperty("--sc", st ? st.color : ""); wrap.style.setProperty("--st", st ? textOn(st.color) : "");
  }
  // Uma Network only brings out a big logo for the team on the power play
  if (id === "un") {
    const ppTeam = !game.final && n0 !== n1 ? game.teams[n0 > n1 ? 0 : 1].team : null, k = ppTeam ? ppTeam.abbr + ppTeam.color + JSON.stringify(ppTeam.logo) : "";
    bug.classList.toggle("ppon", !!ppTeam);
    const f = bug.querySelector('[data-r="featLogo"]');
    if (f && f.dataset.k !== k) { f.dataset.k = k; f.innerHTML = ppTeam ? teamLogoSvg(ppTeam, 48) : ""; }
  }
  // goal graphic
  const goals = game.events.reduce((n, e) => n + (e.type === "goal" ? 1 : 0), 0);
  if (goals > bugGoals) {
    const ev = [...game.events].reverse().find(e => e.type === "goal");
    bugGoals = goals;
    if (ev && !skipping) playBugGoal(ev);
  } else if (goals < bugGoals) bugGoals = goals;
}
function playBugGoal(ev) {
  const bug = $("#bug"), T = game.teams[ev.team].team;
  if (!bug.querySelector(".bug-goal")) return;
  bug.style.setProperty("--gc", T.color); bug.style.setProperty("--gt", textOn(T.color));
  const who = id => { for (const t of game.teams) { const p = t.lineup.roster.find(x => x.id === id); if (p) return p; } return null; };
  const sp = who(ev.scorer), name = sp ? sp.name : "";
  const a = (ev.assists || []).map(id => { const p = who(id); return p ? p.tag || p.name : ""; }).filter(Boolean);
  bugSet("goalWho", name + (a.length ? "  ·  " + a.join(", ") : "  ·  unassisted"));
  const gl = bug.querySelector('[data-r="goalLogo"]'); if (gl) gl.innerHTML = teamLogoSvg(T, 34);
  bug.dataset.gside = ev.team === 0 ? "H" : "A";
  bug.classList.remove("goal"); void bug.offsetWidth; bug.classList.add("goal");
  bugUntil = performance.now() + 3700;
  clearTimeout(bugTimer); bugTimer = setTimeout(() => bug.classList.remove("goal"), 3900);
}
// settings dialog and the quick picker
function renderNetPickers() {
  $("#netQuick").innerHTML = NETS.map(n => `<option value="${n.id}"${n.id === settings.net ? " selected" : ""}>${esc(n.name)}</option>`).join("");
  $("#netGrid").innerHTML = NETS.map(n => `<label class="net-opt${n.id === settings.net ? " on" : ""}"><input type="radio" name="net" value="${n.id}"${n.id === settings.net ? " checked" : ""}><span class="net-prev" data-net="${n.id}">${n.short ? esc(n.short) : "▤"}</span><span><b>${esc(n.name)}</b><small>${esc(n.note)}</small></span></label>`).join("");
}
function setNet(id) { settings.net = id; saveSettings(); bugBuilt = ""; renderNetPickers(); if (game) { updateBug(); setBoard(); } resizeRink(); }
$("#netQuick").addEventListener("change", e => setNet(e.target.value));
$("#netGrid").addEventListener("change", e => { if (e.target.name === "net") setNet(e.target.value); });
const rmQuery = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
function applyMotion() {
  const reduce = settings.motion === "reduced" || (settings.motion !== "full" && rmQuery && rmQuery.matches);
  document.documentElement.classList.toggle("rm", !!reduce);
  document.querySelectorAll('input[name="motion"]').forEach(el => { el.checked = el.value === settings.motion; });
  const n = document.getElementById("motionNote"); if (n) n.textContent = rmQuery && rmQuery.matches ? "(your device asks for reduced motion)" : "(your device uses full motion)";
}
if (rmQuery && rmQuery.addEventListener) rmQuery.addEventListener("change", applyMotion);
document.querySelectorAll('input[name="motion"]').forEach(el => el.addEventListener("change", () => { if (el.checked) { settings.motion = el.value; saveSettings(); applyMotion(); } }));
function applyDisplaySettings() {
  applyMotion();
  document.querySelectorAll("[data-set]").forEach(el => { el.checked = !!settings[el.dataset.set]; });
  document.querySelectorAll("[data-range]").forEach(el => { el.value = Math.round(settings[el.dataset.range] * 100); const o = $("#" + el.id + "Out"); if (o) o.textContent = el.value + "%"; });
  $("#bug").style.setProperty("--bugz", settings.bugSize);
  setText($("#zoomTxt"), Math.round(settings.zoom * 100) + "%");
  $("#view-game").classList.toggle("lineinfo", !!settings.lineInfo);
}
document.querySelectorAll("[data-set]").forEach(el => el.addEventListener("change", () => { settings[el.dataset.set] = el.checked; saveSettings(); applyDisplaySettings(); }));
document.querySelectorAll("[data-range]").forEach(el => el.addEventListener("input", () => { settings[el.dataset.range] = +el.value / 100; saveSettings(); applyDisplaySettings(); }));
function nudgeZoom(d) { settings.zoom = clamp(Math.round((settings.zoom + d) * 10) / 10, 1, 2); liveCam = null; saveSettings(); applyDisplaySettings(); }
$("#zoomOut").addEventListener("click", () => nudgeZoom(-0.1));
$("#zoomIn").addEventListener("click", () => nudgeZoom(0.1));
$("#settingsBtn").addEventListener("click", () => { renderNetPickers(); applyDisplaySettings(); const d = $("#settingsDlg"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); });
renderNetPickers(); applyDisplaySettings();
// test tools
$("#testBtn").addEventListener("click", () => {
  if (game) { setText($("#tGoalA"), game.teams[1].team.abbr + " (away)"); setText($("#tGoalH"), game.teams[0].team.abbr + " (home)"); setText($("#tPPA"), game.teams[1].team.abbr + " (away)"); setText($("#tPPH"), game.teams[0].team.abbr + " (home)"); }
  setText($("#testMsg"), ""); const d = $("#testDlg"); if (d.showModal) d.showModal(); else d.setAttribute("open", "");
});
$("#testDlg").addEventListener("click", e => {
  const b = e.target.closest("[data-test]"); if (!b || !game) return;
  if (replay) stopReplay();
  const t = +b.dataset.t, k = b.dataset.test;
  const msg = k === "goal" ? game.forceGoal(t) : k === "pp" ? game.forcePowerPlay(t) : k === "ot" ? game.forceOvertime() : game.forceShootout();
  setText($("#testMsg"), msg);
  if (!game.final) { playing = true; syncPlay(); }
  setBoard(); renderBox(true);
});

// ---------- scoreboard ----------
function setText(el, v) { v = String(v); if (el.textContent !== v) el.textContent = v; }
function strengthText(ti) {
  const T = game.teams[ti], O = game.teams[1 - ti];
  const bits = [];
  if (game.so && (game.phase === "shootout" || game.decision === "SO")) return "Shootout " + game.so.shots[ti].map(x => x ? "●" : "○").join(" ");
  const n = game.strength(ti), m = game.strength(1 - ti);
  if (n > m) { const left = Math.min(...O.box.filter(b => b.active && !b.coin).map(b => b.left)); bits.push("PP " + fmtClock(left) + " · " + TAC_NAMES.pp[game.tac(ti).pp]); }
  if (n < m) bits.push("PK · " + TAC_NAMES.pk[game.tac(ti).pk]);
  if (n === m && game.tac(ti).late) bits.push("Pushing");
  if (n === m && n < 5) bits.push(n + "-on-" + m);
  if (T.pulled || (game.goalies[ti] && game.goalies[ti].state === "leaving")) bits.push("Empty net");
  if (O.pend.length) bits.push("Delayed penalty");
  if (!game.final && game.momo && game.momo(ti) > 0.35) bits.push("Momentum");
  return bits.join(" · ");
}
function setBoard() {
  if (!game) return;
  const [H, A] = game.teams;
  setText($("#homeAb"), H.team.abbr); setText($("#awayAb"), A.team.abbr);
  setText($("#homeName"), H.team.name); setText($("#awayName"), A.team.name);
  setText($("#homeScore"), H.score); setText($("#awayScore"), A.score);
  setText($("#homeSog"), "SOG " + H.sog); setText($("#awaySog"), "SOG " + A.sog);
  setText($("#homeStr"), game.final ? "" : strengthText(0)); setText($("#awayStr"), game.final ? "" : strengthText(1));
  for (const [el, T] of [[$("#homeChip"), H], [$("#awayChip"), A]]) { const k = JSON.stringify([T.team.color, T.team.color2, T.team.color3, T.team.logo, T.team.abbr, T.team.name]); if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = teamLogoSvg(T.team, 44); } }
  setText($("#perTxt"), game.final ? (game.decision === "REG" ? "Final" : "Final/" + (game.playoff && game.otN > 1 ? game.otN + "OT" : game.decision)) : game.phase === "intermission" ? "End " + (game.period === 4 && game.playoff ? game.otName(game.otN - 1) : periodName(game.period)) : game.perName());
  setText($("#clkTxt"), game.final ? "0:00" : fmtClock(game.clock));
  const ice = ti => {
    const T = game.teams[ti];
    const on = game.onIce(ti);
    if (!on.length) return T.team.abbr;
    const avg = Math.round(on.reduce((t, s) => t + game.energy[s.p.id], 0) / on.length);
    const unit = T.situation === "ES" ? "F" + (T.fIdx + 1) + " · D" + (T.dIdx + 1) : T.situation + (T.stIdx % 2 + 1);
    return `${T.team.abbr} ${unit} · chem ${game.chemValue(ti)} · energy ${avg}%`;
  };
  setText($("#awayIce"), ice(1)); setText($("#homeIce"), ice(0));
  updateBug();
  let b = replay ? null : game.banner;
  if (b && b.kind === "goal" && settings.net !== "classic") b = null; // the scorebug carries the goal graphic
  if (b !== bannerRef) {
    bannerRef = b;
    const el = $("#banner");
    if (!b) el.hidden = true;
    else {
      el.hidden = false;
      setText($("#bannerT"), b.title); setText($("#bannerS"), b.sub);
      el.style.borderTopColor = b.team === 0 || b.team === 1 ? game.teams[b.team].team.color : "";
    }
  }
}

// ---------- feed ----------
const TAGS = { goal: ["GOAL", ""], save: ["SAVE", "var(--g-d)"], miss: ["MISS", "var(--g-f)"], block: ["BLK", "var(--g-e)"],
  takeaway: ["TK", "var(--g-c)"], hit: ["HIT", "var(--g-b)"], change: ["CHG", "var(--g-f)"], dump: ["DUMP", "var(--g-f)"],
  stop: ["STOP", "var(--g-f)"], offside: ["OFF", "var(--g-f)"], icing: ["ICE", "var(--g-e)"], penalty: ["PEN", "var(--bad)"],
  delayed: ["DLY", "var(--warn)"], play: ["PLAY", "var(--g-c)"], skill: ["SKILL", "var(--accent)"], "skill-fail": ["SKILL", "var(--g-f)"], ppend: ["PP", "var(--g-d)"], goalie: ["G", "var(--g-s)"], fight: ["FIGHT", "var(--bad)"], momentum: ["MOM", "var(--accent)"], injury: ["INJ", "var(--warn)"], shootout: ["SO", "var(--g-s)"], final: ["FINAL", "var(--ink)"], coach: ["BENCH", "var(--accent)"], uskill: ["✦ SKILL", "#C9961A"], period: ["", ""] };
const MINOR_TYPES = new Set(["change", "takeaway", "hit", "dump", "stop", "miss", "block", "delayed", "skill-fail", "play"]);
function pumpFeed() {
  if (!game || shownEvents >= game.events.length) return;
  const ul = $("#feed"), frag = document.createDocumentFragment();
  for (; shownEvents < game.events.length; shownEvents++) {
    const e = game.events[shownEvents];
    const li = document.createElement("li");
    li.className = e.type + (MINOR_TYPES.has(e.type) ? " minor" : "");
    const [lab, col] = TAGS[e.type] || ["", ""];
    const team = e.team >= 0 ? game.teams[e.team].team : null;
    const bg = e.type === "goal" && team ? team.color : col;
    const when = e.period <= 4 ? periodName(e.period) + " " + fmtClock(e.clock) : "SO";
    const face = e.type === "goal" && e.scorer ? (() => { for (const t of game.teams) { const p = t.lineup.roster.find(x => x.id === e.scorer); if (p) return chibiHead(p.name, 26, t.team); } return ""; })() : "";
    li.innerHTML = `<span class="t">${esc(when)}</span>` + (lab ? `<span class="tag" style="background:${bg}">${lab}</span>` : `<span></span>`) +
      `<span class="msg">${face}${esc(e.text)}${e.type === "goal" ? `<span class="ts">${game.teams[1].team.abbr} ${e.score[1]}–${e.score[0]} ${game.teams[0].team.abbr}</span><button class="replay-btn" data-ev="${shownEvents}" type="button">▶ Replay</button>` : ""}</span>`;
    frag.prepend(li);
  }
  ul.prepend(frag);
  applyMinor();
  while (ul.children.length > 500) ul.lastChild.remove();
}
function applyMinor() { const show = $("#showMinor").checked; $("#feed").querySelectorAll("li.minor").forEach(li => li.hidden = !show); }
$("#showMinor").addEventListener("change", applyMinor);

// ---------- box score ----------
$("#boxSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  boxTeam = +b.dataset.t;
  $("#boxSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderBox(true);
});
function renderBox() {
  if (!game) return;
  setText($("#boxAwayBtn"), game.teams[1].team.abbr); setText($("#boxHomeBtn"), game.teams[0].team.abbr);
  const T = game.teams[boxTeam], L = T.lineup;
  const nrg = id => { const v = Math.round(game.energy[id]); const c = v >= 65 ? "var(--ok)" : v >= 40 ? "var(--warn)" : "var(--bad)"; return `<span class="nrg"><i style="width:${v}%;background:${c}"></i></span>${v}`; };
  const pm = v => v > 0 ? "+" + v : String(v);
  const mb = p => (game.moods && game.moods[p.id] != null ? moodBadge(game.moods[p.id]) + " " : "") + (game.stats[p.id] && game.stats[p.id].sk ? `<span class="skstar" title="Used her unique skill: ${esc((skillOf(p) || {}).n || "")}">✦</span> ` : "");
  const row = p => { const s = game.stats[p.id]; return `<tr><td>${mb(p)}${esc(p.name)}</td><td>${p.pos}</td><td>${s.g}</td><td>${s.a}</td><td>${s.g + s.a}</td><td>${pm(s.pm)}</td><td>${s.sog}</td><td>${s.dk}</td><td>${s.hit}</td><td>${s.blk}</td><td>${s.tk}</td><td>${s.pim}</td><td>${s.fow + s.fol ? s.fow + "–" + s.fol : "–"}</td><td>${fmtClock(s.toi)}</td><td>${s.top ? s.top.toFixed(1) : "–"}</td><td>${s.dist ? (s.dist / 5280).toFixed(2) : "–"}</td><td>${s.hard || "–"}</td><td class="nrgc">${nrg(p.id)}</td></tr>`; };
  const COLS = 18;
  let html = `<thead><tr><th>Skater</th><th>Pos</th><th>G</th><th>A</th><th>P</th><th>+/-</th><th>SOG</th><th title="Successful dekes and dangles">DK</th><th>HIT</th><th>BLK</th><th>TK</th><th>PIM</th><th>FO</th><th>TOI</th><th title="Top skating speed, mph">Top</th><th title="Distance skated, miles">Dist</th><th title="Hardest shot, mph">Shot</th><th>Energy</th></tr></thead><tbody>`;
  L.fLines.forEach((u, i) => { html += `<tr class="sub"><td colspan="${COLS}">Forward line ${i + 1}</td></tr>` + u.map(row).join(""); });
  L.dPairs.forEach((u, i) => { html += `<tr class="sub"><td colspan="${COLS}">Defense pair ${i + 1}</td></tr>` + u.map(row).join(""); });
  html += `<tr class="sub"><td colspan="${COLS}">Goalies</td></tr>`;
  for (const g of L.goalies.filter(Boolean)) {
    const gs = game.stats[g.id];
    html += `<tr><td>${mb(g)}${esc(g.name)}${g === game.goalieOf(boxTeam) && !game.final ? " ●" : ""}</td><td>G</td><td colspan="3">SA ${gs.sa}</td><td colspan="2">SV ${gs.sv}</td><td colspan="3">SV% ${gs.sa ? (gs.sv / gs.sa).toFixed(3).replace(/^0/, "") : "–"}</td><td colspan="3">GA ${gs.ga}</td><td>${fmtClock(gs.toi)}</td><td></td><td></td><td></td><td></td></tr>`;
  }
  const fo = T.fow + game.teams[1 - boxTeam].fow;
  html += `<tr class="sub"><td colspan="${COLS}">Team: ${T.sog} shots · PP ${T.ppG}/${T.ppOpp} · ${T.pim} PIM · ${T.hits} hits · FO ${fo ? Math.round(T.fow / fo * 100) : 0}% · ${T.icings || 0} icings · ${T.offsides || 0} offsides</td></tr></tbody>`;
  const tbl = $("#boxTable"); if (tbl.innerHTML !== html) tbl.innerHTML = html;
  const sb = $("#starsBox");
  if (game.final && game.stars) {
    // game-winning goal: the winner's goal that put them one past the loser's final total
    const w = game.teams[0].score > game.teams[1].score ? 0 : 1, lose = game.teams[1 - w].score;
    const wg = game.decision === "SO" ? null : game.events.filter(e => e.type === "goal" && e.team === w)[lose];
    const desc = st => {
      const s = game.stats[st.p.id];
      if (posGroup(st.p) === "G") return `${s.sv} saves on ${s.sa}` + (s.sa ? ` · ${(s.sv / s.sa).toFixed(3).replace(/^0/, "")}` : "") + (s.ga === 0 && s.sa ? " · shutout" : "");
      const bits = [];
      if (s.g || s.a) bits.push(`${s.g} G, ${s.a} A`);
      if (wg && wg.scorer === st.p.id) bits.push("GWG");
      bits.push(`${s.sog} SOG`);
      if (s.pm) bits.push((s.pm > 0 ? "+" : "") + s.pm);
      if (s.hit >= 3) bits.push(`${s.hit} hits`);
      if (s.blk >= 2) bits.push(`${s.blk} blocks`);
      if (s.fow + s.fol >= 10) bits.push(`${Math.round(s.fow / (s.fow + s.fol) * 100)}% FO`);
      return bits.join(" · ");
    };
    const h = `<div class="stars">${game.stars.map((st, i) => `<div class="star">${chibiFull(posGroup(st.p) === "G" ? "a" : "b", st.p.name, 84, "star-pic") || chibiHead(st.p.name, 56, game.teams[st.team].team)}<span class="label">${["First", "Second", "Third"][i]} star</span><span class="n">${esc(st.p.name)}</span><span class="k">${esc(game.teams[st.team].team.abbr)} · ${desc(st)}</span></div>`).join("")}</div>`;
    if (sb.innerHTML !== h) sb.innerHTML = h;
  } else if (sb.innerHTML) sb.innerHTML = "";
}

// ---------- game summary: shot map, period table, win probability ----------
let shotPer = 0, sumKey = "", wpPts = [];
const svgEsc = esc;
// the darker of a team's two colors, for outlines and hollow marks on the ice
function lum(hex) { const h = String(hex).replace("#", ""); const v = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
function teamInk(t) { return lum(t.color) < lum(t.color2) ? t.color : t.color2; }
function teamEdge(t) { return lum(t.color) > 0.35 ? teamInk(t) : t.color2; }
const OUT_LABEL = { goal: "Goal", save: "Saved", miss: "Missed", block: "Blocked" };
function markSvg(o, t, x, y, i) {
  const c = t.color, ink = teamInk(t), edge = teamEdge(t), a = `class="sm-mark" data-i="${i}"`;
  if (o === "goal") {
    const pts = []; for (let k = 0; k < 10; k++) { const r = k % 2 ? 1.5 : 3.6, an = -Math.PI / 2 + k * Math.PI / 5; pts.push((x + Math.cos(an) * r).toFixed(2) + "," + (y + Math.sin(an) * r).toFixed(2)); }
    return `<polygon ${a} points="${pts.join(" ")}" fill="${c}" stroke="${edge}" stroke-width="0.6" stroke-linejoin="round"/>`;
  }
  if (o === "save") return `<circle ${a} cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="${c}" stroke="${edge}" stroke-width="0.45"/>`;
  if (o === "miss") return `<circle ${a} cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.45" fill="none" stroke="${ink}" stroke-width="0.6"/>`;
  return `<path ${a} d="M${(x - 1.2).toFixed(2)} ${(y - 1.2).toFixed(2)}l2.4 2.4m0 -2.4l-2.4 2.4" stroke="${ink}" stroke-width="0.6" stroke-linecap="round"/><rect data-i="${i}" class="sm-mark" x="${(x - 1.8).toFixed(2)}" y="${(y - 1.8).toFixed(2)}" width="3.6" height="3.6" fill="transparent"/>`;
}
function rinkSvg() {
  const L = 100, W = 42.5, R = 28, g = 89, b = 25;
  const rr = `M${-L + R} ${-W}H${L - R}A${R} ${R} 0 0 1 ${L} ${-W + R}V${W - R}A${R} ${R} 0 0 1 ${L - R} ${W}H${-L + R}A${R} ${R} 0 0 1 ${-L} ${W - R}V${-W + R}A${R} ${R} 0 0 1 ${-L + R} ${-W}Z`;
  const circ = (x, y) => `<circle class="red" cx="${x}" cy="${y}" r="15" stroke-width="0.35" opacity="0.6"/><circle cx="${x}" cy="${y}" r="0.9" fill="var(--rink-red)" opacity="0.7"/>`;
  return `<g class="sm-rink"><path class="ice" d="${rr}"/>` +
    `<line class="red" x1="0" y1="${-W}" x2="0" y2="${W}" stroke-width="0.9" opacity="0.8"/>` +
    `<line class="blue" x1="${-b}" y1="${-W}" x2="${-b}" y2="${W}" stroke-width="1.2" opacity="0.85"/><line class="blue" x1="${b}" y1="${-W}" x2="${b}" y2="${W}" stroke-width="1.2" opacity="0.85"/>` +
    `<line class="red" x1="${-g}" y1="${-W + 6}" x2="${-g}" y2="${W - 6}" stroke-width="0.35"/><line class="red" x1="${g}" y1="${-W + 6}" x2="${g}" y2="${W - 6}" stroke-width="0.35"/>` +
    `<path class="crease" d="M${-g} -4A6 6 0 0 1 ${-g + 6} 0A6 6 0 0 1 ${-g} 4Z"/><path class="crease" d="M${g} -4A6 6 0 0 0 ${g - 6} 0A6 6 0 0 0 ${g} 4Z"/>` +
    `<rect x="${-g - 3.4}" y="-3" width="3.4" height="6" fill="none" stroke="var(--net)" stroke-width="0.5"/><rect x="${g}" y="-3" width="3.4" height="6" fill="none" stroke="var(--net)" stroke-width="0.5"/>` +
    circ(-69, -22) + circ(-69, 22) + circ(69, -22) + circ(69, 22) + `</g>`;
}
function renderSummary() {
  if (!game) return;
  const log = game.shotLog || [], A = game.teams[1], H = game.teams[0];
  const key = [log.length, game.wp.length, shotPer, game.final ? 1 : 0, game.period, A.team.color, H.team.color].join("|");
  if (key === sumKey) return; sumKey = key;
  // shot map: each team shoots at its own end of the map, away on the left, home on the right
  const marks = []; const order = { block: 0, miss: 1, save: 2, goal: 3 };
  const list = log.map((sh, i) => ({ sh, i })).filter(({ sh }) => !shotPer || (shotPer === 4 ? sh.period >= 4 : sh.period === shotPer)).sort((a, b) => order[a.sh.outcome] - order[b.sh.outcome]);
  for (const { sh, i } of list) {
    const t = game.teams[sh.team].team, sgn = sh.team === 0 ? 1 : -1;
    marks.push(markSvg(sh.outcome, t, Math.max(-97, Math.min(97, sgn * sh.ax)), Math.max(-40, Math.min(40, sgn * sh.ay)), i));
  }
  const lbl = `<text class="lbl" x="-50" y="-37.5" text-anchor="middle">← ${svgEsc(A.team.abbr)} shots</text><text class="lbl" x="50" y="-37.5" text-anchor="middle">${svgEsc(H.team.abbr)} shots →</text>`;
  $("#shotMap").innerHTML = rinkSvg() + lbl + marks.join("");
  // legend: team identity + outcome shapes, with counts for the shown period
  const cnt = (ti, o) => list.filter(({ sh }) => sh.team === ti && (!o || sh.outcome === o)).length;
  const swatch = (o, t) => `<svg viewBox="-4 -4 8 8" aria-hidden="true">${markSvg(o, t, 0, 0, -1)}</svg>`;
  const tLeg = ti => { const t = game.teams[ti].team; return `<span class="li"><span class="tm">${esc(t.abbr)}</span> ${cnt(ti, "goal")} G · ${cnt(ti, "goal") + cnt(ti, "save")} SOG · ${cnt(ti)} att</span>`; };
  const nt = { color: "#8792A6", color2: "#FFFFFF" };
  renderTracking();
  $("#shotLegend").innerHTML = tLeg(1) + tLeg(0) + ["goal", "save", "miss", "block"].map(o => `<span class="li">${swatch(o, nt)}${OUT_LABEL[o]}</span>`).join("");
  // period table
  const nP = Math.max(3, Math.min(4, game.period)), so = game.decision === "SO" || game.period >= 5;
  const cols = [1, 2, 3].concat(nP >= 4 ? [4] : []);
  const gBy = (ti, p) => game.events.filter(e => e.type === "goal" && e.team === ti && e.period === p).length;
  const sBy = (ti, p) => log.filter(sh => sh.team === ti && sh.period === p && (sh.outcome === "goal" || sh.outcome === "save")).length;
  const pn = p => p === 4 ? "OT" : periodName(p);
  let ph = `<thead><tr><th>Goals</th>${cols.map(p => `<th>${pn(p)}</th>`).join("")}${so ? "<th>SO</th>" : ""}<th>T</th></tr></thead><tbody>`;
  for (const ti of [1, 0]) { const t = game.teams[ti]; ph += `<tr><td><span class="tlogo sm">${teamLogoSvg(t.team, 18)}</span>${esc(t.team.abbr)}</td>${cols.map(p => `<td>${p <= game.period ? gBy(ti, p) : "–"}</td>`).join("")}${so ? `<td>${t.soGoals || (game.so ? game.so.goals[ti] : 0)}</td>` : ""}<td class="tot">${t.score}</td></tr>`; }
  ph += `<tr class="sub"><td colspan="${cols.length + (so ? 3 : 2)}">Shots on goal</td></tr>`;
  for (const ti of [1, 0]) { const t = game.teams[ti]; ph += `<tr><td><span class="tlogo sm">${teamLogoSvg(t.team, 18)}</span>${esc(t.team.abbr)}</td>${cols.map(p => `<td>${p <= game.period ? sBy(ti, p) : "–"}</td>`).join("")}${so ? "<td></td>" : ""}<td class="tot">${t.sog}</td></tr>`; }
  $("#periodTable").innerHTML = ph + "</tbody>";
  renderWP();
}
// player tracking: the fastest, the hardest, the farthest
function renderTracking() {
  const all = [];
  for (const T of game.teams) for (const p of T.lineup.roster) { const s = game.stats[p.id]; if (s && s.toi && posGroup(p) !== "G") all.push({ p, s, t: T.team }); }
  const best = (f, min) => all.filter(x => f(x.s) > (min || 0)).sort((a, b) => f(b.s) - f(a.s))[0];
  const hardShot = (game.shotLog || []).filter(x => x.mph && !x.tipper).sort((a, b) => b.mph - a.mph)[0];
  const tile = (lab, val, unit, who) => `<div class="trk"><span class="label">${lab}</span><span class="v">${val}<small>${unit}</small></span><span class="k">${who || "–"}</span></div>`;
  const fast = best(s => s.top), far = best(s => s.dist), bur = best(s => s.bursts);
  const nm = x => x ? `${esc(x.p.name)} <span class="m">${esc(x.t.abbr)}</span>` : "";
  const html = tile("Hardest shot", hardShot ? hardShot.mph : "–", " mph", hardShot ? `${esc(hardShot.name)} <span class="m">${esc(game.teams[hardShot.team].team.abbr)} · ${esc(hardShot.tag || "shot")}</span>` : "") +
    tile("Top speed", fast ? fast.s.top.toFixed(1) : "–", " mph", nm(fast)) +
    tile("Most distance", far ? (far.s.dist / 5280).toFixed(2) : "–", " mi", nm(far)) +
    tile("20+ mph bursts", bur ? bur.s.bursts : 0, "", nm(bur));
  const el = $("#trackTiles"); if (el.innerHTML !== html) el.innerHTML = html;
}
function renderWP() {
  const svg = $("#wpChart"), W = Math.round(Math.max(320, Math.min(640, (svg.parentElement.clientWidth || 640) - 24))), Hh = W < 480 ? 200 : 230, l = 54, r = 14, top = 14, bot = 30;
  svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`); svg.dataset.w = W;
  const end = Math.max(3600, game.period >= 4 ? 3900 : 3600), pw = W - l - r, ph = Hh - top - bot;
  const xs = e => l + Math.min(e, end) / end * pw, ys = p => top + (1 - p) * ph;
  const A = game.teams[1].team, H = game.teams[0].team;
  wpPts = [{ e: 0, p: game.wp.length ? game.wp[0].p : 0.5 }].concat(game.wp);
  let g = "";
  for (const p of [0, 0.25, 0.5, 0.75, 1]) g += `<line class="wp-grid" x1="${l}" x2="${W - r}" y1="${ys(p)}" y2="${ys(p)}" ${p === 0.5 ? 'stroke-dasharray="4 3"' : ""}/>`;
  for (const [e, t] of [[0, "1st"], [1200, "2nd"], [2400, "3rd"]].concat(end > 3600 ? [[3600, "OT"]] : [])) g += `<line class="wp-grid" x1="${xs(e)}" x2="${xs(e)}" y1="${top}" y2="${top + ph}"/><text class="wp-axis" x="${xs(e) + 4}" y="${Hh - 10}">${t}</text>`;
  g += `<text class="wp-axis tm" x="${l - 8}" y="${top + 4}" text-anchor="end">${esc(H.abbr)}</text><text class="wp-axis" x="${l - 8}" y="${ys(0.5) + 4}" text-anchor="end">50%</text><text class="wp-axis tm" x="${l - 8}" y="${top + ph}" text-anchor="end">${esc(A.abbr)}</text>`;
  // area above 50% in the home color, below in the away color
  const path = wpPts.map((w, i) => (i ? "L" : "M") + xs(w.e).toFixed(1) + " " + ys(w.p).toFixed(1)).join("");
  const lastX = xs(wpPts[wpPts.length - 1].e).toFixed(1);
  const area = path + `L${lastX} ${ys(0.5)}L${l} ${ys(0.5)}Z`;
  g += `<defs><clipPath id="wpTop"><rect x="${l}" y="${top}" width="${pw}" height="${ph / 2}"/></clipPath><clipPath id="wpBot"><rect x="${l}" y="${ys(0.5)}" width="${pw}" height="${ph / 2}"/></clipPath></defs>`;
  g += `<path d="${area}" fill="${H.color}" opacity="0.28" clip-path="url(#wpTop)"/><path d="${area}" fill="${A.color}" opacity="0.28" clip-path="url(#wpBot)"/>`;
  g += `<path class="wp-line" d="${path}"/>`;
  for (const w of game.wp) if (w.goal != null) { const t = game.teams[w.goal].team; g += `<circle cx="${xs(w.e).toFixed(1)}" cy="${ys(w.p).toFixed(1)}" r="4.5" fill="${t.color}" stroke="var(--surface)" stroke-width="2"/>`; }
  g += `<line class="wp-x" id="wpX" x1="0" x2="0" y1="${top}" y2="${top + ph}" visibility="hidden"/><circle id="wpDot" r="4" fill="var(--ink)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
  g += `<rect id="wpHit" x="${l}" y="${top}" width="${pw}" height="${ph}" fill="transparent"/>`;
  svg.innerHTML = g;
  const now = wpPts[wpPts.length - 1].p;
  const fav = now >= 0.5 ? H : A, fp = now >= 0.5 ? now : 1 - now;
  $("#wpNow").textContent = game.final ? "Final" : `${fav.abbr} ${Math.round(fp * 100)}% to win`;
  svg.dataset.l = l; svg.dataset.pw = pw; svg.dataset.end = end; svg.dataset.top = top; svg.dataset.ph = ph;
}
function fmtElapsed(e) { const p = e >= 3600 ? 4 : Math.floor(e / 1200) + 1; const left = p === 4 ? 300 - (e - 3600) : 1200 - (e - (p - 1) * 1200); return (p === 4 ? "OT" : periodName(p)) + " " + fmtClock(Math.max(0, left)); }
$("#wpChart").addEventListener("pointermove", ev => {
  const svg = $("#wpChart"); if (!wpPts.length) return;
  const rc = svg.getBoundingClientRect(), sx = (+svg.dataset.w || 640) / rc.width, x = (ev.clientX - rc.left) * sx;
  const l = +svg.dataset.l, pw = +svg.dataset.pw, end = +svg.dataset.end, top = +svg.dataset.top, ph = +svg.dataset.ph;
  if (x < l || x > l + pw) { hideWpTip(); return; }
  const e = (x - l) / pw * end;
  let best = wpPts[0]; for (const w of wpPts) if (Math.abs(w.e - e) < Math.abs(best.e - e)) best = w;
  const bx = l + Math.min(best.e, end) / end * pw, by = top + (1 - best.p) * ph;
  const X = $("#wpX"), D = $("#wpDot"); if (!X) return;
  X.setAttribute("x1", bx); X.setAttribute("x2", bx); X.setAttribute("visibility", "visible"); D.setAttribute("cx", bx); D.setAttribute("cy", by); D.setAttribute("visibility", "visible");
  const H = game.teams[0].team, A = game.teams[1].team, tip = $("#wpTip");
  const goalTxt = best.goal != null ? `<br><b>Goal ${esc(game.teams[best.goal].team.abbr)}</b>` : "";
  tip.innerHTML = `<span class="m">${fmtElapsed(best.e)}</span><br><b>${esc(H.abbr)}</b> ${Math.round(best.p * 100)}% · <b>${esc(A.abbr)}</b> ${Math.round((1 - best.p) * 100)}%${goalTxt}`;
  tip.hidden = false;
  const wrap = svg.parentElement.getBoundingClientRect(), px = bx / sx + rc.left - wrap.left, py = by / sx + rc.top - wrap.top;
  tip.style.left = Math.min(wrap.width - tip.offsetWidth - 6, Math.max(6, px + 12)) + "px"; tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + "px";
});
function hideWpTip() { $("#wpTip").hidden = true; const X = $("#wpX"), D = $("#wpDot"); if (X) X.setAttribute("visibility", "hidden"); if (D) D.setAttribute("visibility", "hidden"); }
$("#wpChart").addEventListener("pointerleave", hideWpTip);
$("#shotMap").addEventListener("pointerover", ev => {
  const m = ev.target.closest(".sm-mark"); const tip = $("#shotTip");
  if (!m || !game) { tip.hidden = true; return; }
  const sh = game.shotLog[+m.dataset.i]; if (!sh) return;
  const t = game.teams[sh.team].team;
  const how = sh.tag ? String(sh.tag).replace(/^./, c => c.toUpperCase()) : "Shot";
  tip.innerHTML = `<b>${esc(sh.tipper || sh.name)}</b> <span class="m">${esc(t.abbr)}</span><br>${esc(how)} · ${sh.dist} ft${sh.pp ? " · PP" : ""}<br><b>${OUT_LABEL[sh.outcome]}</b> <span class="m">· ${sh.period >= 4 ? "OT" : periodName(sh.period)} ${fmtClock(Math.max(0, sh.clock))}</span>`;
  tip.hidden = false;
  const wrap = $("#shotMap").parentElement.getBoundingClientRect(), mr = m.getBoundingClientRect();
  tip.style.left = Math.min(wrap.width - tip.offsetWidth - 6, Math.max(6, mr.left - wrap.left + mr.width / 2 - tip.offsetWidth / 2)) + "px";
  tip.style.top = Math.max(4, mr.top - wrap.top - tip.offsetHeight - 8) + "px";
});
$("#shotMap").addEventListener("pointerleave", () => { $("#shotTip").hidden = true; });
$("#shotPerSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  shotPer = +b.dataset.p;
  $("#shotPerSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderSummary();
});

// ---------- rink drawing ----------
const WORLD_H = 101, WORLD_HALF = 50.5;
const cv = $("#rink"), ctx = cv.getContext("2d");
let K = 4, rinkCache = null, tokens = {};
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const n of ["ice", "ice-edge", "rink-red", "rink-blue", "crease", "net", "board", "board-2", "board-muted", "accent", "ok", "warn", "bad", "f-display", "f-body"]) tokens[n] = cs.getPropertyValue("--" + n).trim();
  rinkCache = null;
}
function resizeRink() {
  const r = cv.parentElement.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  K = cv.width / 204;
  rinkCache = null;
}
new ResizeObserver(resizeRink).observe($(".rinkbox"));
new ResizeObserver(() => { if (game) renderWP(); }).observe($("#wpChart").parentElement);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readTokens);
new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
const X = x => (x + 102) * K, Y = y => (y + WORLD_HALF) * K;
function rinkPath(c, inset) {
  const L = 100 - inset, W = 42.5 - inset, R = 28 - inset;
  c.beginPath();
  c.moveTo(X(-L + R), Y(-W)); c.lineTo(X(L - R), Y(-W));
  c.arc(X(L - R), Y(-W + R), R * K, -Math.PI / 2, 0); c.lineTo(X(L), Y(W - R));
  c.arc(X(L - R), Y(W - R), R * K, 0, Math.PI / 2); c.lineTo(X(-L + R), Y(W));
  c.arc(X(-L + R), Y(W - R), R * K, Math.PI / 2, Math.PI); c.lineTo(X(-L), Y(-W + R));
  c.arc(X(-L + R), Y(-W + R), R * K, Math.PI, Math.PI * 1.5); c.closePath();
}
function buildRink() {
  // drawn at a higher resolution than the screen so the lines stay sharp when the camera zooms in
  const S = Math.max(1, Math.min(1.8, 4096 / Math.max(1, cv.width))), K0 = K;
  K = K0 * S;
  try { buildRinkAt(S); } finally { K = K0; }
}
function buildRinkAt(S) {
  const oc = document.createElement("canvas"); oc.width = Math.round(cv.width * S); oc.height = Math.round(cv.height * S);
  const c = oc.getContext("2d");
  // benches and penalty boxes
  const pad = (x0, x1, y0, y1, label) => {
    c.fillStyle = tokens["board-2"]; c.fillRect(X(x0), Y(y0), (x1 - x0) * K, (y1 - y0) * K);
    c.fillStyle = tokens["board-muted"]; c.font = `600 ${Math.max(8, 1.6 * K)}px ${tokens["f-display"]}`; c.textAlign = "center"; c.textBaseline = "middle";
    if (label) { const left = x0 < 0; c.textAlign = left ? "right" : "left"; c.fillText(label, X(left ? x0 - 1 : x1 + 1), Y((y0 + y1) / 2)); }
  };
  if (game) {
    BENCH_X.forEach((b, ti) => pad(b[0], b[1], -50, -43.2, game.teams[ti].team.abbr + " bench"));
    BOX_X.forEach((x, ti) => pad(x - 6, x + 6, 43.2, 50, game.teams[ti].team.abbr + " box"));
  }
  rinkPath(c, 0); c.fillStyle = tokens.ice; c.fill();
  c.save(); rinkPath(c, 0); c.clip();
  const vline = (x, w, col) => { c.fillStyle = col; c.fillRect(X(x) - w * K / 2, Y(-42.5), w * K, 85 * K); };
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(X(s * 89), Y(-4)); c.arc(X(s * 89), Y(0), 6 * K, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); c.closePath();
    c.fillStyle = tokens.crease; c.fill(); c.strokeStyle = tokens["rink-red"]; c.lineWidth = Math.max(1, 0.2 * K); c.stroke();
  }
  vline(89, 0.17, tokens["rink-red"]); vline(-89, 0.17, tokens["rink-red"]);
  vline(25, 1, tokens["rink-blue"]); vline(-25, 1, tokens["rink-blue"]);
  vline(0, 1, tokens["rink-red"]);
  c.fillStyle = tokens.ice; for (let y = -42; y < 43; y += 4) c.fillRect(X(-0.12), Y(y), 0.24 * K, 1.4 * K);
  const circ = (x, y, r, col, w) => { c.beginPath(); c.arc(X(x), Y(y), r * K, 0, Math.PI * 2); c.strokeStyle = col; c.lineWidth = Math.max(1, w * K); c.stroke(); };
  const dot = (x, y, r, col) => { c.beginPath(); c.arc(X(x), Y(y), r * K, 0, Math.PI * 2); c.fillStyle = col; c.fill(); };
  circ(0, 0, 15, tokens["rink-blue"], 0.2); dot(0, 0, 0.6, tokens["rink-blue"]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    circ(sx * 69, sy * 22, 15, tokens["rink-red"], 0.2); dot(sx * 69, sy * 22, 1, tokens["rink-red"]); dot(sx * 20, sy * 22, 1, tokens["rink-red"]);
    c.strokeStyle = tokens["rink-red"]; c.lineWidth = Math.max(1, 0.2 * K);
    for (const hx of [-3, 3]) { c.beginPath(); c.moveTo(X(sx * 69 + hx), Y(sy * 22 - 15)); c.lineTo(X(sx * 69 + hx), Y(sy * 22 - 17)); c.moveTo(X(sx * 69 + hx), Y(sy * 22 + 15)); c.lineTo(X(sx * 69 + hx), Y(sy * 22 + 17)); c.stroke(); }
  }
  c.save(); c.globalAlpha = 0.18; c.strokeStyle = tokens["rink-blue"]; c.lineWidth = 2.2 * K; c.lineCap = "round";
  c.beginPath(); c.arc(X(0), Y(-1), 7 * K, Math.PI * 0.82, Math.PI * 2.18); c.stroke();
  c.fillStyle = tokens.ice; c.globalAlpha = 1;
  for (let a = Math.PI * 0.95; a < Math.PI * 2.1; a += 0.42) { c.beginPath(); c.arc(X(Math.cos(a) * 7), Y(-1 + Math.sin(a) * 7), 0.45 * K, 0, Math.PI * 2); c.fill(); }
  c.restore();
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(X(s * 89), Y(-3)); c.lineTo(X(s * 91.5), Y(-3.2)); c.quadraticCurveTo(X(s * 92.6), Y(0), X(s * 91.5), Y(3.2)); c.lineTo(X(s * 89), Y(3));
    c.strokeStyle = tokens.net; c.lineWidth = Math.max(1.2, 0.35 * K); c.stroke();
    c.save(); c.globalAlpha = 0.25; c.fillStyle = tokens.net; c.fill(); c.restore();
  }
  c.restore();
  rinkPath(c, 0); c.strokeStyle = tokens["ice-edge"]; c.lineWidth = Math.max(2, 0.9 * K); c.stroke();
  rinkCache = oc;
}
let rinkCacheGame = null, liveCam = null;
function energyColor(v) { return v >= 65 ? tokens.ok : v >= 40 ? tokens.warn : tokens.bad; }

// ---------- goal replays ----------
let replay = null, replaySpeed = 0.3;
try {
  if (localStorage.getItem("tracen-auto-replay") === "0") $("#autoReplay").checked = false;
  const rs = parseFloat(localStorage.getItem("tracen-replay-speed")); if ([0.15, 0.3, 0.6].includes(rs)) replaySpeed = rs;
} catch (e) {}
$("#autoReplay").addEventListener("change", e => { try { localStorage.setItem("tracen-auto-replay", e.target.checked ? "1" : "0"); } catch (x) {} });
function syncReplaySpeed() {
  $("#replaySpeedSeg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.rs === replaySpeed ? "true" : "false"));
  $("#replaySpeedTxt").textContent = "· " + (replaySpeed <= 0.15 ? "super slow motion" : replaySpeed <= 0.3 ? "slow motion" : "half speed");
}
function startReplay(ev) {
  if (!game || !ev || !ev.replay || !ev.replay.frames.length) return;
  const R = ev.replay;
  replay = { ev, R, t: R.start, cam: null };
  const team = game.teams[R.team].team;
  const tags = (ev.text.match(/\(([^)]*)\)/) || [, ""])[1];
  $("#replayWho").textContent = team.abbr + " goal · " + R.scorer.name + (tags ? " · " + tags : "") + " · " + periodName(ev.period) + " " + fmtClock(ev.clock);
  // the scorer celebrating, and the assists beside them
  const who = id => { for (const t of game.teams) { const p = t.lineup.roster.find(x => x.id === id); if (p) return p; } return null; };
  const ast = (ev.assists || []).map(who).filter(Boolean);
  const big = chibiFull("b", R.scorer.name, 150, "rc-big") || chibiHead(R.scorer.name, 90, team);
  $("#replayCard").innerHTML = `${big}<div class="rc-txt"><span class="rc-goal" style="background:${team.color};color:${textOn(team.color)}">GOAL</span><b class="rc-name">${esc(R.scorer.name)}</b>
    ${ast.length ? `<div class="rc-ast">${ast.map(p => `<span class="rc-a">${chibiFull("a", p.name, 58, "rc-mini") || chibiHead(p.name, 40, team)}<small>${esc(p.tag || p.name)}</small></span>`).join("")}<span class="rc-lab">Assists</span></div>` : `<div class="rc-ast"><span class="rc-lab">Unassisted</span></div>`}</div>`;
  $("#replayCard").style.setProperty("--team", team.color);
  const rc = $("#replayCard"); rc.classList.toggle("right", R.gx < 0); rc.classList.remove("in"); void rc.offsetWidth; rc.classList.add("in");
  $("#replayGoalMark").style.left = ((R.goalT - R.start) / Math.max(0.01, R.end - R.start) * 100) + "%";
  $("#replayUi").hidden = false; $("#replayUi").style.setProperty("--team", team.color);
  syncReplaySpeed(); updateReplayUi();
}
function stopReplay() {
  if (!replay) return;
  replay = null; $("#replayUi").hidden = true; bannerRef = undefined;
}
function updateReplayUi() {
  const R = replay.R; $("#replayBar").style.width = clamp((replay.t - R.start) / Math.max(0.01, R.end - R.start), 0, 1) * 100 + "%";
}
$("#replaySkipBtn").addEventListener("click", stopReplay);
$("#replayAgainBtn").addEventListener("click", () => { if (replay) { replay.t = replay.R.start; replay.cam = null; } });
$("#replaySpeedSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  replaySpeed = +b.dataset.rs; syncReplaySpeed();
  try { localStorage.setItem("tracen-replay-speed", String(replaySpeed)); } catch (x) {}
});
$("#feed").addEventListener("click", e => {
  const b = e.target.closest(".replay-btn"); if (!b || !game) return;
  const ev = game.events[+b.dataset.ev];
  if (!ev || !ev.replay) return;
  if (currentView() !== "game") location.hash = "#game";
  startReplay(ev);
  const st = $(".stage"); if (st && st.getBoundingClientRect().top < 0) st.scrollIntoView({ block: "start", behavior: "smooth" });
});

// what to draw: the live game, or a replay frame blended between two recorded frames
function liveView() {
  const P = game.puck;
  return {
    puck: { x: P.x, y: P.y, shot: !!P.shot, fast: Math.hypot(P.vx, P.vy) > 30, trail: P.trail,
      pass: P.pass && P.pass.to && P.pass.to !== P.pass.from ? { tx: P.pass.tx, ty: P.pass.ty, saucer: P.pass.saucer } : null },
    skaters: game.skaters.map(s => ({ x: s.x, y: s.y, team: s.team, p: s.p, alpha: s.state === "on" ? 1 : 0.55, carrier: s === P.carrier, energy: game.energy[s.p.id], fa: s.fa || 0, shove: s.shove || 0,
      anim: s.anim ? { k: s.anim.k, at: game.time - s.anim.t, a: s.anim.a } : null, ss: game.stickState(s) })),
    goalies: game.goalies.filter(Boolean).map(g => ({ x: g.x, y: g.y, team: g.team, p: g.p, alpha: g.state === "net" ? 1 : 0.75, fa: Math.atan2(P.y - g.y, P.x - g.x) })),
    fx: game.fx.map(f => { const on = f.s && game.skaters.includes(f.s); return { x: on ? f.s.x : f.x, y: on ? f.s.y : f.y, text: f.text, team: f.team, t: f.t }; }),
    hidePuck: (game.phase === "goal" || game.phase === "postgoal") && game.phaseT > 0.4, benches: true, goalLit: -1
  };
}
function replayView(R, t) {
  const F = R.frames;
  let lo = 0, hi = F.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (F[mid].t <= t) lo = mid; else hi = mid - 1; }
  const a = F[lo], b = F[Math.min(lo + 1, F.length - 1)];
  const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0, L = (u, v) => u + (v - u) * k;
  const bs = new Map(b.s.map(r => [r[3], r])), bg = new Map(b.g.map(r => [r[3], r]));
  const LA = (u, v) => { let d = v - u; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return u + d * k; };
  const skaters = a.s.map(r => { const q = bs.get(r[3]) || r; return { x: L(r[0], q[0]), y: L(r[1], q[1]), team: r[2], p: r[3], alpha: r[4] ? 1 : 0.55, carrier: !!r[5], energy: r[6], fa: LA(r[7] || 0, q[7] || 0),
    anim: r[8] ? { k: r[8], at: L(r[9], r[8] === q[8] ? q[9] : r[9] + (b.t - a.t)), a: r[10] } : null, ss: r[11] || 0 }; });
  const goalies = a.g.map(r => { const q = bg.get(r[3]) || r; return { x: L(r[0], q[0]), y: L(r[1], q[1]), team: r[2], p: r[3], alpha: r[4] ? 1 : 0.75, fa: LA(r[5] || 0, q[5] || 0) }; });
  const x = L(a.px, b.px), y = L(a.py, b.py), trail = [];
  for (let j = Math.max(0, lo - 8); j <= lo; j++) trail.push({ x: F[j].px, y: F[j].py });
  trail.push({ x, y });
  const prev = F[Math.max(0, lo - 1)], fast = a.t > prev.t && Math.hypot(a.px - prev.px, a.py - prev.py) / (a.t - prev.t) > 30;
  const fx = a.fx.map(f => { const sk = f[3] ? skaters.find(s => s.p === f[3]) : null; return { x: sk ? sk.x : f[4], y: sk ? sk.y : f[5], text: f[0], team: f[1], t: f[2] }; });
  return { puck: { x, y, shot: !!a.sh, fast, trail, pass: a.pas ? { tx: a.pas[0], ty: a.pas[1], saucer: !!a.pas[2] } : null },
    skaters, goalies, fx, hidePuck: false, benches: false, goalLit: t >= R.goalT ? t - R.goalT : -1, gx: R.gx };
}

function drawRink() {
  if (!cv.width) { resizeRink(); if (!cv.width) return; }
  if (!tokens.ice) readTokens();
  if (!rinkCache || rinkCacheGame !== game) { rinkCacheGame = game; buildRink(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!game) { ctx.drawImage(rinkCache, 0, 0, cv.width, cv.height); return; }
  const V = replay ? replayView(replay.R, replay.t) : liveView();
  // bigger player icons push the carried puck out in front of the jersey so the stick has something to handle
  { const c = V.skaters.find(s => s.carrier); if (c) { const f = (2.3 * (settings.icon || 1) + 1.9) / 2.3, dx = V.puck.x - c.x, dy = V.puck.y - c.y; V.puck = Object.assign({}, V.puck, { x: c.x + dx * f, y: c.y + dy * f }); } }
  // replay camera: zoomed in, following the puck toward the net it ends up in
  let z = 1;
  if (replay) {
    z = 1.75;
    const tx = V.puck.x * 0.6 + replay.R.gx * 0.4, ty = V.puck.y * 0.5;
    const c = replay.cam || { x: tx, y: ty };
    c.x += (tx - c.x) * 0.06; c.y += (ty - c.y) * 0.06; replay.cam = c;
    const hw = 102 / z, hh = WORLD_HALF / z;
    c.x = clamp(c.x, -102 + hw, 102 - hw); c.y = clamp(c.y, -WORLD_HALF + hh, WORLD_HALF - hh);
    ctx.translate(cv.width / 2, cv.height / 2); ctx.scale(z, z); ctx.translate(-X(c.x), -Y(c.y));
  } else if (settings.zoom > 1.01) {
    // live camera: zoomed in, drifting with the play a little ahead of the puck
    z = settings.zoom;
    const GP = game.puck, meS = game.bap ? game.skaters.find(x => x.p.id === game.bap.me && x.state === "on") : null;
    let tx = V.puck.x + clamp(GP.vx, -40, 40) * 0.35, ty = V.puck.y * 0.55;
    if (meS) { tx = tx * 0.72 + meS.x * 0.28; ty = ty * 0.72 + meS.y * 0.28; } // Be A Player: keep her in the shot
    const c = liveCam || { x: tx, y: ty };
    c.x += (tx - c.x) * 0.07; c.y += (ty - c.y) * 0.05; liveCam = c;
    const hw = 102 / z, hh = WORLD_HALF / z;
    c.x = clamp(c.x, -102 + hw, 102 - hw); c.y = clamp(c.y, -WORLD_HALF + hh, WORLD_HALF - hh);
    ctx.translate(cv.width / 2, cv.height / 2); ctx.scale(z, z); ctx.translate(-X(c.x), -Y(c.y));
  }
  ctx.drawImage(rinkCache, 0, 0, cv.width, cv.height);
  const P = V.puck;
  // goal light
  if (V.goalLit >= 0) {
    const gx = V.gx + Math.sign(V.gx) * 2, a = 0.55 + 0.35 * Math.sin(V.goalLit * 18);
    const gr = ctx.createRadialGradient(X(gx), Y(0), 0, X(gx), Y(0), 9 * K);
    gr.addColorStop(0, `rgba(230, 40, 50, ${0.6 * a})`); gr.addColorStop(1, "rgba(230, 40, 50, 0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X(gx), Y(0), 9 * K, 0, Math.PI * 2); ctx.fill();
  }
  if (P.pass && settings.passes) {
    ctx.save(); ctx.setLineDash([3 * K / 4, 3 * K / 4]); ctx.strokeStyle = P.pass.saucer ? tokens.accent : "rgba(20,32,54,0.28)"; ctx.lineWidth = Math.max(1, 0.25 * K);
    ctx.beginPath(); ctx.moveTo(X(P.x), Y(P.y));
    if (P.pass.saucer) { const mx = (P.x + P.pass.tx) / 2, my = (P.y + P.pass.ty) / 2 - 6; ctx.quadraticCurveTo(X(mx), Y(my), X(P.pass.tx), Y(P.pass.ty)); }
    else ctx.lineTo(X(P.pass.tx), Y(P.pass.ty));
    ctx.stroke(); ctx.restore();
  }
  if (P.trail.length > 1 && (P.shot || P.fast)) {
    ctx.save(); ctx.lineCap = "round";
    for (let i = 1; i < P.trail.length; i++) {
      ctx.globalAlpha = i / P.trail.length * 0.45; ctx.strokeStyle = P.shot ? tokens.accent : "#3A4658"; ctx.lineWidth = 0.9 * K;
      ctx.beginPath(); ctx.moveTo(X(P.trail[i - 1].x), Y(P.trail[i - 1].y)); ctx.lineTo(X(P.trail[i].x), Y(P.trail[i].y)); ctx.stroke();
    }
    ctx.restore();
  }
  const fs = Math.max(9, 1.7 * K * Math.sqrt(settings.icon || 1)) / Math.sqrt(z);
  const drawP = (x, y, team, p, r, opts) => {
    const t = game.teams[team].team;
    ctx.save();
    if (opts.alpha) ctx.globalAlpha = opts.alpha;
    if (opts.carrier) { ctx.beginPath(); ctx.arc(X(x), Y(y), (r + 1.5) * K, 0, Math.PI * 2); ctx.strokeStyle = tokens.accent; ctx.lineWidth = Math.max(2, 0.5 * K); ctx.stroke(); }
    if (game.bap && p.id === game.bap.me && !opts.bench) { // Be A Player: a gold halo and a YOU tag
      ctx.save(); ctx.beginPath(); ctx.arc(X(x), Y(y), (r + 2.4) * K, 0, Math.PI * 2); ctx.setLineDash([0.9 * K, 0.6 * K]); ctx.strokeStyle = "#F2B705"; ctx.lineWidth = Math.max(2, 0.45 * K); ctx.stroke(); ctx.setLineDash([]);
      const ty = Y(y - r - 3.1); ctx.font = `700 ${Math.max(9, 1.5 * K)}px ${tokens["f-display"]}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w = ctx.measureText("YOU").width + 0.9 * K; ctx.fillStyle = "#F2B705"; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(X(x) - w / 2, ty - 0.85 * K, w, 1.7 * K, 0.4 * K); ctx.fill(); } else ctx.fillRect(X(x) - w / 2, ty - 0.85 * K, w, 1.7 * K);
      ctx.fillStyle = "#1B1300"; ctx.fillText("YOU", X(x), ty + 0.5); ctx.restore();
    }
    if (opts.energy != null && (settings.rings || opts.bench)) {
      ctx.beginPath(); ctx.arc(X(x), Y(y), (r + 0.7) * K, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * opts.energy / 100);
      ctx.strokeStyle = energyColor(opts.energy); ctx.lineWidth = Math.max(1.5, 0.45 * K); ctx.stroke();
    }
    ctx.beginPath();
    if (opts.goalie) { const w = r * 1.05; if (ctx.roundRect) ctx.roundRect(X(x - w), Y(y - w), 2 * w * K, 2 * w * K, 0.8 * K); else ctx.rect(X(x - w), Y(y - w), 2 * w * K, 2 * w * K); }
    else ctx.arc(X(x), Y(y), r * K, 0, Math.PI * 2);
    ctx.fillStyle = t.color; ctx.fill();
    ctx.strokeStyle = t.color3 || t.color2; ctx.lineWidth = Math.max(1.4, 0.4 * K); ctx.stroke();
    if (opts.fa != null && settings.sticks) drawStick(x, y, r, p, opts);
    if (opts.fa != null && settings.arrows) { // facing arrow: a small point on the edge of the jersey
      const a = opts.fa, cx = Math.cos(a), cy = Math.sin(a), lx = -cy, ly = cx;
      const tip = r + 1.25, base = r - 0.35, w = 0.95;
      ctx.beginPath(); ctx.moveTo(X(x + cx * tip), Y(y + cy * tip)); ctx.lineTo(X(x + cx * base + lx * w), Y(y + cy * base + ly * w)); ctx.lineTo(X(x + cx * base - lx * w), Y(y + cy * base - ly * w)); ctx.closePath();
      ctx.fillStyle = t.color3 || t.color2; ctx.fill(); ctx.lineWidth = Math.max(1, 0.18 * K); ctx.strokeStyle = t.color; ctx.stroke();
    }
    ctx.fillStyle = t.color2; ctx.font = `700 ${Math.max(7, r * 1.05 * K)}px ${tokens["f-display"]}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(p.no), X(x), Y(y) + 0.5);
    if (opts.label !== false && settings.names) {
      ctx.font = `600 ${fs}px ${tokens["f-body"]}`;
      ctx.lineWidth = 3; ctx.strokeStyle = tokens.ice; ctx.strokeText(p.tag, X(x), Y(y + r + 2.2 * Math.min(1.3, r / 2.3)));
      ctx.fillStyle = "#1A2538"; ctx.fillText(p.tag, X(x), Y(y + r + 2.2 * Math.min(1.3, r / 2.3)));
    }
    ctx.restore();
  };
  // sticks: the shaft from the hands on the shooting side, the blade on the ice (on the puck for the carrier)
  // sticks: the shaft from the hands on the shooting side, the blade on the ice
  // carrying, the blade cups the puck; shots and passes swing through; receivers show a target; checkers reach for the puck
  const ANIM_DUR = { 1: 0.28, 2: 0.4, 3: 0.24, 4: 0.26, 5: 0.26 };
  const lerpA = (a, b, u) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * u; };
  const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  function drawStick(x, y, r, p, o) {
    const fa = o.fa, cx = Math.cos(fa), cy = Math.sin(fa), side = shootsOf(p) === "L" ? 1 : -1, lx = cy * side, ly = -cx * side;
    const q = r / 2.3, D = 0.0174533;
    const hx = x + lx * r * 0.75 + cx * r * 0.3, hy = y + ly * r * 0.75 + cy * r * 0.3;
    const fore = fa - side * 90 * D; // the forehand side
    let ang = null, reach = 3.9 * q, lift = 0, trail = null, bx, by, cup = false;
    const an = o.anim, dur = an ? ANIM_DUR[an.k] : 0;
    if (o.goalie) { ang = fa; reach = 3.1 * q; }
    else if (an && an.at >= 0 && an.at < dur) {
      const u = an.at / dur, e = ease(u);
      if (an.k === 1) { const a0 = fa - side * 80 * D, a1 = an.a - side * 8 * D; ang = lerpA(a0, a1, e); reach = (2.5 + 2.1 * e) * q; lift = u > 0.6 ? (u - 0.6) / 0.4 : 0; trail = [a0, ang]; }
      else if (an.k === 2) { const a0 = fa - side * 150 * D, a1 = an.a - side * 4 * D; ang = lerpA(a0, a1, e); reach = 5 * q; lift = u < 0.15 ? 1 - u / 0.15 : u > 0.7 ? (u - 0.7) / 0.3 : 0; trail = [a0, ang]; }
      else if (an.k === 3) { ang = lerpA(fa - side * 60 * D, an.a - side * 14 * D, e); reach = (2.6 + 1.3 * e) * q; lift = u > 0.75 ? (u - 0.75) * 2 : 0; }
      else if (an.k === 4) { ang = an.a; reach = (3.5 + Math.sin(u * Math.PI) * 2.4) * q; }
      else { const a0 = fa + side * 70 * D, a1 = an.a + side * 10 * D; ang = lerpA(a0, a1, e); reach = (2.4 + 1.8 * e) * q; lift = u > 0.65 ? (u - 0.65) / 0.35 : 0; trail = [a0, ang]; }
    }
    if (ang === null) {
      if (o.carrier && !V.hidePuck) { bx = P.x; by = P.y; cup = true; }
      else if (o.ss === 2) { ang = fa - side * 135 * D; reach = 4.7 * q; lift = 0.55; }             // loaded for the one-timer
      else if (o.ss === 1 || o.ss === 3) {                                                           // presenting a target, or reaching for the puck
        const pa = Math.atan2(P.y - y, P.x - x), pd = Math.hypot(P.x - x, P.y - y);
        let rel = pa - fa; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
        ang = fa + Math.max(-75 * D, Math.min(75 * D, rel)); reach = Math.min(Math.max(2.6 * q, pd - 0.6), (o.ss === 3 ? 4.9 : 3.8) * q);
      }
      else { ang = lerpA(fa, fore, 0.3); reach = 3.9 * q; }
    }
    if (!cup) { bx = x + Math.cos(ang) * reach; by = y + Math.sin(ang) * reach; }
    // shaft and blade directions
    let sx = bx - hx, sy = by - hy; const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
    let tx = -sy, ty = sx; if (tx * -lx + ty * -ly < 0) { tx = -tx; ty = -ty; } // toe turns in toward the body line
    if (cup) { bx -= sx * 0.75; by -= sy * 0.75; }                                // heel sits just behind the puck
    ctx.save(); ctx.lineCap = "round";
    if (trail) { // the swing, as a faint arc
      ctx.globalAlpha *= 0.28; ctx.strokeStyle = "#11161F"; ctx.lineWidth = Math.max(2, 0.55 * K);
      ctx.beginPath(); const steps = 8; for (let i = 0; i <= steps; i++) { const aa = lerpA(trail[0], trail[1], i / steps), px = x + Math.cos(aa) * reach, py = y + Math.sin(aa) * reach; if (i) ctx.lineTo(X(px), Y(py)); else ctx.moveTo(X(px), Y(py)); } ctx.stroke();
      ctx.globalAlpha /= 0.28;
    }
    const la = 1 - 0.4 * lift;
    ctx.globalAlpha *= la;
    ctx.strokeStyle = "#1E2533"; ctx.lineWidth = Math.max(1.5, (o.goalie ? 0.42 : 0.32) * K);
    ctx.beginPath(); ctx.moveTo(X(hx), Y(hy)); ctx.lineTo(X(bx), Y(by)); ctx.stroke();
    const bl = (o.goalie ? 2.2 : 1.35) * (1 - 0.45 * lift) * Math.min(1.25, q);
    ctx.lineWidth = Math.max(2, (o.goalie ? 0.75 : 0.5) * K); ctx.strokeStyle = "#11161F";
    ctx.beginPath(); ctx.moveTo(X(bx - tx * bl * 0.25), Y(by - ty * bl * 0.25)); ctx.lineTo(X(bx + tx * bl), Y(by + ty * bl)); ctx.stroke();
    if (!o.goalie && !lift) { ctx.lineWidth = Math.max(1, 0.18 * K); ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.moveTo(X(bx + tx * bl * 0.35), Y(by + ty * bl * 0.35)); ctx.lineTo(X(bx + tx * bl * 0.8), Y(by + ty * bl * 0.8)); ctx.stroke(); } // tape
    ctx.restore();
  }
  const IS = settings.icon || 1;
  for (const g of V.goalies) drawP(g.x, g.y, g.team, g.p, 2.4 * IS, { goalie: true, alpha: g.alpha, fa: g.fa });
  for (const s of V.skaters) drawP(s.x + Math.sin((s.shove || 0) * 40) * (s.shove ? 0.35 : 0), s.y, s.team, s.p, 2.3 * IS, { carrier: s.carrier, energy: s.energy, alpha: s.alpha, fa: s.fa, anim: s.anim, ss: s.ss });
  // benches: dressed players not on the ice
  if (V.benches) for (let ti = 0; ti < 2; ti++) {
    const T = game.teams[ti], b = BENCH_X[ti];
    const onIds = new Set(game.skaters.filter(s => s.team === ti).map(s => s.p.id));
    const boxIds = new Set(T.box.map(x => x.p.id));
    const g = game.goalies[ti];
    const bench = [...T.lineup.fLines.flat(), ...T.lineup.dPairs.flat(), ...T.lineup.goalies.filter(Boolean)].filter(p => !onIds.has(p.id) && !boxIds.has(p.id) && !(g && g.p === p));
    const perRow = Math.ceil(bench.length / 2), step = Math.min(3.1, (b[1] - b[0] - 2.4) / Math.max(1, perRow - 1));
    bench.forEach((p, i) => { const r = Math.floor(i / perRow), k = i % perRow; drawP(b[0] + 1.4 + k * step + r * step / 2, r ? -45 : -48.2, ti, p, 1.15, { label: false, bench: true, energy: posGroup(p) === "G" ? null : game.energy[p.id] }); });
    T.box.forEach((x, i) => {
      const bx = BOX_X[ti] - 2.5 + i * 5;
      drawP(bx, 45.4, ti, x.p, 1.15, { label: false });
      ctx.fillStyle = tokens["board-muted"]; ctx.font = `600 ${Math.max(8, 1.3 * K)}px ${tokens["f-body"]}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(x.active ? fmtClock(x.left) : "wait", X(bx), Y(48.4));
    });
  }
  for (const f of V.fx) {
    const sx = f.x, sy = f.y - 5 - f.t * 2.5;
    const a = f.t < 1.1 ? 1 : Math.max(0, 1 - (f.t - 1.1) / 0.5);
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = `700 ${Math.max(11, 2.4 * K) / Math.sqrt(z)}px ${tokens["f-display"]}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = ctx.measureText(f.text).width + 10;
    ctx.fillStyle = game.teams[f.team].team.color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(X(sx) - w / 2, Y(sy) - 1.6 * K, w, 3.2 * K, 4); else ctx.rect(X(sx) - w / 2, Y(sy) - 1.6 * K, w, 3.2 * K);
    ctx.fill(); ctx.fillStyle = game.teams[f.team].team.color2; ctx.fillText(f.text.toUpperCase(), X(sx), Y(sy) + 0.5);
    ctx.restore();
  }
  if (!V.hidePuck) {
    ctx.beginPath(); ctx.arc(X(P.x), Y(P.y), Math.max(2.5, 0.85 * K), 0, Math.PI * 2); ctx.fillStyle = "#0B0F16"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- lines view ----------
const STYLE_ABBR = { "Sniper": "SNP", "Playmaker": "PLY", "Power Forward": "PWF", "Two-Way": "2W", "Grinder": "GRD", "Speedster": "SPD", "Offensive": "OFF", "Enforcer": "ENF", "Stay-at-Home": "SAH", "Butterfly": "BUT", "Hybrid": "HYB", "Reflex": "RFX" };
const openTeams = new Set();
let openInit = false;
// the lines editor serves Quick Play's league and the franchise team; ctx says which
function qpLinesCtx() { return { grid: $("#linesGrid"), L: league, teams: league.teams, open: openTeams, save: () => { scheduleSave(); checkMatchup(); } }; }
function linesCtxFor(grid) { if (grid && grid.id === "coachPanel" && typeof frCoachLinesCtx === "function") return frCoachLinesCtx(); return grid && (grid.id === "frLinesGrid" || grid.id === "frRoot") && typeof frLinesCtx === "function" ? frLinesCtx() : qpLinesCtx(); }
function renderLines(ctx) {
  ctx = ctx || qpLinesCtx();
  const grid = ctx.grid, openTeams = ctx.open;
  if (!grid) return;
  if (!openInit && ctx.L === league && league.teams[0]) { openTeams.add(league.teams[0].id); openInit = true; }
  const linksOf = ch => ch.links.filter(l => l.kind === "friend").map(l => `<span class="link friend">${esc(l.a.tag)} &amp; ${esc(l.b.tag)}</span>`).join("") +
    (ch.fam ? `<span class="link fam" title="Built up by playing and practicing together">Familiarity +${ch.fam}</span>` : "");
  const fam = ctx.L.fam || null;
  const meter = ch => `<span class="meter"><span class="bar"><i style="width:${ch.value}%"></i></span><b>${ch.value}</b> ${chemLabel(ch.value)}</span>`;
  const optLabel = p => `${p.name} · ${p.pos} · ${overall(p)}`;
  // one dropdown slot; ds = data attributes describing where it writes
  const sel = (t, roster, cur, label, ds, opts) => {
    opts = opts || {};
    const pool = roster.filter(p => opts.goalie ? true : posGroup(p) !== "G")
      .sort((a, b) => (opts.goalie ? (posGroup(b) === "G") - (posGroup(a) === "G") : 0) || (opts.prefer ? (posGroup(b) === opts.prefer) - (posGroup(a) === opts.prefer) : 0) || overall(b) - overall(a));
    const auto = opts.auto ? `<option value=""${opts.isAuto ? " selected" : ""}>Auto${cur && opts.isAuto ? " · " + esc(cur.name) : ""}</option>` : "";
    const o = pool.map(p => `<option value="${esc(p.id)}"${cur && p.id === cur.id && !opts.isAuto ? " selected" : ""}>${esc(optLabel(p))}</option>`).join("");
    const sty = cur ? `<span class="sty" title="${esc(cur.style + ": " + (STYLE_NOTES[cur.style] || ""))}">${esc(cur.style)}</span>` : "";
    const id = "sl-" + Object.values(ds).join("-");
    return `<label class="slot pic${opts.isAuto ? " auto" : ""}" for="${id}"><span class="slot-pic">${cur ? chibiHead(cur.name, 38, t) : `<span class="chibi-head none empty" style="width:38px;height:38px"></span>`}</span><span class="slot-body"><span class="pos">${label}${sty}</span>
      <select class="slotsel" id="${id}" ${Object.entries(ds).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}>${auto}${!cur && !opts.auto ? '<option value="" selected>Empty</option>' : ""}${o}</select>
      ${cur ? `<span class="rt">OVR ${overall(cur)} <span class="gr" data-g="${grade(overall(cur))}">${grade(overall(cur))}</span>${cur.md != null ? " " + moodBadge(moodLevel(cur.md)) : ""}</span>` : ""}</span></label>`;
  };
  grid.innerHTML = ctx.teams.map(t => {
    const L = buildLineup(ctx.L, t.id);
    const R = L.roster;
    const dressed = new Set([...L.goalies.filter(Boolean), ...L.fLines.flat(), ...L.dPairs.flat()].map(p => p.id));
    const extras = R.filter(p => !dressed.has(p.id));
    let lines = "";
    for (let i = 0; i < N_FLINES; i++) {
      const F = L.fLines[i] || [], D = i < N_DPAIRS ? L.dPairs[i] || [] : [];
      const ch = unitChemistry([...F, ...(i < N_DPAIRS ? D : unitPair(L, i)), L.goalie].filter(Boolean), fam);
      const byPos = pos => F.find(p => p.pos === pos) || null;
      const Fo = [byPos("LW"), byPos("C"), byPos("RW")]; const left = F.filter(p => !Fo.includes(p)); for (let k = 0; k < 3; k++) if (!Fo[k]) Fo[k] = left.shift() || null;
      lines += `<div class="unit"><div class="unit-h"><span class="label">${i < N_DPAIRS ? `Line ${i + 1} + pair ${i + 1}` : "Line " + (i + 1)}</span>${meter(ch)}</div>
        <div class="slots">${["LW", "C", "RW"].map((pos, k) => sel(t, R, Fo[k], pos, { team: t.id, kind: "line", u: i, k, pos }, { prefer: "F" })).join("")}</div>
        ${i < N_DPAIRS ? `<div class="slots d">${["LD", "RD"].map((lab, k) => sel(t, R, D[k], lab, { team: t.id, kind: "pair", u: i, k, pos: "D" }, { prefer: "D" })).join("")}</div>` : ""}
        <div class="links">${i >= N_DPAIRS && L.dPairs.length ? `<span class="note">Chemistry counts the pair this line plays with most (pair ${L.dPairs.length}).</span>` : ""}${linksOf(ch) || '<span class="note">No friendships on this unit yet.</span>'}</div></div>`;
    }
    const goalies = `<div class="unit gunit"><span class="label">Goalies</span><div class="slots d">${["Starter", "Backup"].map((lab, k) => sel(t, R, L.goalies[k], lab, { team: t.id, kind: "goal", u: 0, k, pos: "G" }, { goalie: true })).join("")}</div></div>`;
    const stUnit = (kind, i, u) => {
      if (!u) return "";
      const ch = unitChemistry([...u.slots, L.goalie].filter(Boolean), fam);
      const lab = kind.toUpperCase() + (i + 1), names = kind === "pp" ? PP_SLOTS : PK_SLOTS;
      const one = k => sel(t, R, u.slots[k], names[k], { team: t.id, kind, u: i, k }, { auto: true, isAuto: !u.custom[k], prefer: kind === "pp" ? (k === 4 ? "D" : k === 3 ? null : "F") : (k >= 2 ? "D" : "F") });
      const rows = kind === "pp" ? `<div class="slots">${[0, 1, 2].map(one).join("")}</div><div class="slots d">${[3, 4].map(one).join("")}</div>`
        : `<div class="slots d">${[0, 1].map(one).join("")}</div><div class="slots d">${[2, 3].map(one).join("")}</div>`;
      return `<div class="unit"><div class="unit-h"><span class="label">${lab}</span>${meter(ch)}</div>${rows}</div>`;
    };
    const anyCustom = !!(t.pp || t.pk);
    const special = `<div class="st-head"><span class="note">Dashed slots are on Auto.</span>${anyCustom ? `<button class="btn" data-autost="${esc(t.id)}">Set all to auto</button>` : ""}</div>
      <div class="st-grid"><div>${stUnit("pp", 0, L.pp[0])}${stUnit("pp", 1, L.pp[1])}</div><div>${stUnit("pk", 0, L.pk[0])}${stUnit("pk", 1, L.pk[1])}</div></div>`;
    const avg = R.length ? Math.round(R.reduce((s, p) => s + overall(p), 0) / R.length) : 0;
    const ch1 = L.fLines[0] ? unitChemistry([...L.fLines[0], ...(L.dPairs[0] || []), L.goalie].filter(Boolean), fam).value : 0;
    return `<details class="panel tcard" data-team="${esc(t.id)}"${openTeams.has(t.id) ? " open" : ""}>
      <summary class="tcard-h"><span class="tlogo">${teamLogoSvg(t, 30)}</span><h2>${esc(t.name)}</h2>
        <span class="meta">${R.length} players · avg OVR ${avg} · top line chem ${ch1}</span><span class="caret" aria-hidden="true"></span></summary>
      ${L.problems.length ? `<div class="problems">${L.problems.map(esc).join(" ")}</div>` : ""}
      <div class="tbody"><div class="tcol"><div class="sec-h">Lines</div>${lines}${goalies}
        <div class="extras">Extras: ${extras.length ? extras.map(p => `<button class="linkbtn" data-pname="${esc(p.name)}">${esc(p.name)}</button>`).join(", ") : "none"}</div></div>
        <div class="tcol"><div class="sec-h">Tactics</div>${tacticsHtml(t)}<div class="sec-h">Special teams</div>${special}</div></div>
    </details>`;
  }).join("");
}
// keep track of which teams are expanded
// put a player into a line, pair or goalie slot by swapping line and position with whoever held it
function setLineSlot(team, kind, u, k, pos, pid, LG) {
  LG = LG || league;
  const L = buildLineup(LG, team);
  const A = LG.players.find(p => p.id === pid); if (!A) return;
  let cur;
  if (kind === "line") { const F = L.fLines[u] || []; cur = F.find(p => p.pos === pos) || (F.length === 3 ? F[[1, 0, 2][k]] : null); }
  else cur = kind === "pair" ? (L.dPairs[u] || [])[k] : L.goalies[k];
  const side = kind === "pair" ? (k === 0 ? "L" : "R") : "";
  if (cur === A) { if (kind === "pair") A.side = side; return; }
  const B = cur ? LG.players.find(p => p.id === cur.id) : null;
  const old = { line: A.line, pos: A.pos, side: A.side || "" };
  if (kind === "goal") { A.line = k + 1; A.pos = "G"; }
  else { A.line = u + 1; A.pos = pos; A.side = side; }
  if (B) { B.line = old.line; B.pos = old.pos; B.side = old.side; B.style = validStyle(B, B.style); }
  A.style = validStyle(A, A.style);
}
function setSpecialSlot(team, kind, u, k, pid, LG) {
  LG = LG || league;
  const t = LG.teams.find(x => x.id === team); if (!t) return;
  const n = kind === "pp" ? 5 : 4;
  const shown = buildLineup(LG, team)[kind][u]; if (!shown) return;
  if (!t[kind]) t[kind] = [null, null];
  if (!t[kind][u]) t[kind][u] = [...Array(n)].map(() => null);
  const unit = t[kind][u];
  if (pid) { // a player already in another slot of this unit swaps with the one being replaced
    const was = shown.slots[k];
    shown.slots.forEach((p, kk) => { if (p && p.id === pid && kk !== k) unit[kk] = was ? was.id : null; });
  }
  unit[k] = pid || null;
  if (!unit.some(Boolean)) t[kind][u] = null;
  if (!t[kind].some(Boolean)) t[kind] = null;
}
const TAC_HELP = {
  pp: { "131": "Net-front, two flanks, a bumper in the slot and one point. Cross-seam one-timers.", overload: "Everyone stacks the strong side: half-wall, goal line, point and net, with a back-door threat.", spread: "Two points, a high slot and two low. Lots of point shots through traffic." },
  pk: { box: "Two low, two high, protect the middle. The steady default.", diamond: "One at the top, two on the sides, one in front. Takes away the bumper and point.", aggressive: "Two pressure the puck and its nearest option, and a forward forechecks up ice. Forces turnovers, but leaves seams." },
  fc: { "122": "One forward hunts the puck, two cut off the walls, both D stay back. Safe.", "212": "Two forwards on the puck, D pinch. Creates turnovers, risks odd-man rushes.", trap: "1-3-1 neutral-zone trap: one forward steers, three wait across the middle. Kills the opponent's speed." }
};
function tacticsHtml(t) {
  const tc = t.tactics || normTactics(null), id = esc(t.id);
  const sel = (k, label) => `<label class="tac" for="tac-${id}-${k}"><span class="pos">${label}</span>
    <select class="slotsel tacsel" id="tac-${id}-${k}" data-team="${id}" data-tac="${k}">${Object.entries(TAC_NAMES[k]).map(([v, n]) => `<option value="${v}"${tc[k] === v ? " selected" : ""}>${n}</option>`).join("")}</select>
    <span class="rt">${esc(TAC_HELP[k][tc[k]])}</span></label>`;
  const agg = tc.agg, word = agg >= 75 ? "Aggressive" : agg >= 55 ? "Assertive" : agg >= 35 ? "Balanced" : "Conservative";
  return `<div class="unit tac-grid">${sel("pp", "Power play")}${sel("pk", "Penalty kill")}${sel("fc", "Forecheck")}
    <label class="tac" for="tac-${id}-agg"><span class="pos">Aggression <b>${agg} · ${word}</b></span>
      <input type="range" min="0" max="100" step="5" id="tac-${id}-agg" class="tacrange" data-team="${id}" data-tac="agg" value="${agg}">
      <span class="rt">Higher means more pinching, tighter gaps, more shots, more hits, and more stretch passes. It also draws more penalties. Teams push harder on their own when trailing late.</span></label></div>`;
}
function wireLinesGrid(grid) {
grid.addEventListener("toggle", e => {
  const d = e.target.closest("details[data-team]"); if (!d) return;
  const open = linesCtxFor(grid).open;
  if (d.open) open.add(d.dataset.team); else open.delete(d.dataset.team);
}, true);
grid.addEventListener("input", e => {
  const el = e.target.closest("[data-tac]"); if (!el) return;
  const ctx = linesCtxFor(grid);
  const t = ctx.L.teams.find(x => x.id === el.dataset.team); if (!t) return;
  t.tactics = normTactics(Object.assign({}, t.tactics, { [el.dataset.tac]: el.dataset.tac === "agg" ? +el.value : el.value }));
  if (el.dataset.tac === "agg") { const b = el.parentElement.querySelector(".pos b"); const a = t.tactics.agg; b.textContent = a + " · " + (a >= 75 ? "Aggressive" : a >= 55 ? "Assertive" : a >= 35 ? "Balanced" : "Conservative"); }
  ctx.save("tactics");
});
grid.addEventListener("change", e => {
  const ctx = linesCtxFor(grid);
  if (e.target.closest("[data-tac]")) { renderLines(ctx); const again = document.getElementById(e.target.id); if (again) again.focus(); return; }
  const el = e.target.closest("select.slotsel"); if (!el) return;
  const ds = el.dataset;
  if (ds.kind === "pp" || ds.kind === "pk") setSpecialSlot(ds.team, ds.kind, +ds.u, +ds.k, el.value, ctx.L);
  else if (el.value) setLineSlot(ds.team, ds.kind, +ds.u, +ds.k, ds.pos, el.value, ctx.L);
  ctx.save("lines"); renderLines(linesCtxFor(grid));
  const again = document.getElementById(el.id); if (again) again.focus();
});
grid.addEventListener("click", e => {
  const b = e.target.closest("[data-autost]"); if (!b) return;
  const ctx = linesCtxFor(grid);
  const t = ctx.L.teams.find(x => x.id === b.dataset.autost); if (!t) return;
  t.pp = null; t.pk = null; ctx.save("lines"); renderLines(linesCtxFor(grid));
});
}
wireLinesGrid($("#linesGrid"));

// ---------- roster sheet ----------
let filterTeam = "ALL", searchQ = "";
function teamOptions(sel) {
  return league.teams.map(t => `<option value="${esc(t.id)}"${t.id === sel ? " selected" : ""}>${esc(t.abbr)}</option>`).join("") + `<option value="FA"${sel === "FA" ? " selected" : ""}>FA</option>`;
}
const STAT_FIELDS = ["sht", "pas", "hnd", "skt", "spd", "def", "chk", "fo", "sta", "dis", "clu", "goal"];
const STAT_LABEL = { sht: "Shooting", pas: "Passing", hnd: "Hands", skt: "Skating", spd: "Speed", def: "Defense", chk: "Checking", fo: "Faceoffs", sta: "Stamina", dis: "Discipline", clu: "Clutch", goal: "Goaltending" };
const STAT_ABBR = { sht: "SHT", pas: "PAS", hnd: "HND", skt: "SKT", spd: "SPD", def: "DEF", chk: "CHK", fo: "FO", sta: "STA", dis: "DIS", clu: "CLU", goal: "GOAL" };
const STAT_TIP = { sht: "Shooting: shot accuracy and finishing", pas: "Passing: accuracy, pass reads, fewer picked-off passes", hnd: "Hands: dekes, dangles, saucer passes, protecting the puck",
  skt: "Skating: acceleration, edges and balance", spd: "Speed: top speed", def: "Defense: positioning, stick checks, blocking lanes", chk: "Checking: winning hits and board battles",
  fo: "Faceoffs", sta: "Stamina: how fast they tire and recover", dis: "Discipline: fewer penalties", clu: "Clutch: rises (or shrinks) late in close games, in overtime and shootouts", goal: "Goaltending" };
function renderRoster() {
  const tf = $("#teamFilter");
  tf.innerHTML = `<option value="ALL">All teams</option>` + league.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("") + `<option value="FA">Free agents</option>`;
  if (![...tf.options].some(o => o.value === filterTeam)) filterTeam = "ALL";
  tf.value = filterTeam;
  renderTeamTable();
  const rows = league.players.filter(p => (filterTeam === "ALL" || p.team === filterTeam) && (!searchQ || (p.name + " " + p.tag + " " + p.style + " " + p.friends.join(" ")).toLowerCase().includes(searchQ)));
  const order = id => { const i = league.teams.findIndex(t => t.id === id); return i < 0 ? 99 : i; };
  const grp = p => p.pos === "G" ? 2 : p.pos === "D" ? 1 : 0;
  rows.sort((a, b) => order(a.team) - order(b.team) || grp(a) - grp(b) || (a.line || 9) - (b.line || 9) || POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos));
  const head = `<thead><tr><th>No</th><th>Name</th><th>Short</th><th>Team</th><th>Pos</th><th>Line</th><th>Playstyle</th>${STAT_FIELDS.map(f => `<th title="${STAT_TIP[f]}">${STAT_ABBR[f]}</th>`).join("")}<th>OVR</th><th>Personality</th><th>Friends</th><th><span hidden>Remove</span></th></tr></thead>`;
  const body = rows.map(p => {
    const id = p.id;
    const stat = f => `<span class="stat"><input class="cell num" type="number" min="1" max="99" id="r-${id}-${f}" data-id="${id}" data-f="${f}" value="${p[f]}" aria-label="${STAT_LABEL[f]} for ${esc(p.name)}"><span class="gr" data-g="${grade(p[f])}">${grade(p[f])}</span></span>`;
    const t = teamById(p.team);
    const lineOpts = (p.pos === "G" ? [[1, "Starter"], [2, "Backup"], [0, "Extra"]] : p.pos === "D" ? [[1, "1"], [2, "2"], [0, "Extra"]] : [[1, "1"], [2, "2"], [3, "3"], [0, "Extra"]]).map(([v, l]) => `<option value="${v}"${v === p.line ? " selected" : ""}>${l}</option>`).join("");
    const styleOpts = STYLES[posGroup(p)].map(s => `<option${s === p.style ? " selected" : ""} title="${esc(STYLE_NOTES[s])}">${s}</option>`).join("");
    return `<tr data-row="${id}">
      <td><input class="cell no" type="number" min="0" max="99" id="r-${id}-no" data-id="${id}" data-f="no" value="${p.no}" aria-label="Number"></td>
      <td><div class="nm-wrap">${chibiHead(p.name, 30, t)}<input class="cell name" id="r-${id}-name" data-id="${id}" data-f="name" value="${esc(p.name)}" aria-label="Name"></div></td>
      <td><input class="cell tagc" id="r-${id}-tag" data-id="${id}" data-f="tag" value="${esc(p.tag)}" maxlength="9" aria-label="Short name on the rink"></td>
      <td><select class="cell" id="r-${id}-team" data-id="${id}" data-f="team" aria-label="Team">${teamOptions(p.team)}</select></td>
      <td><select class="cell" id="r-${id}-pos" data-id="${id}" data-f="pos" aria-label="Position">${POSITIONS.map(x => `<option${x === p.pos ? " selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><select class="cell" id="r-${id}-line" data-id="${id}" data-f="line" aria-label="Line">${lineOpts}</select></td>
      <td><select class="cell" id="r-${id}-style" data-id="${id}" data-f="style" aria-label="Playstyle" title="${esc(STYLE_NOTES[p.style] || "")}">${styleOpts}</select></td>
      ${STAT_FIELDS.map(f => `<td>${stat(f)}</td>`).join("")}
      <td><span class="ovr" id="ovr-${id}">${overall(p)} <span class="gr" data-g="${grade(overall(p))}">${grade(overall(p))}</span></span></td>
      <td><select class="cell" id="r-${id}-pers" data-id="${id}" data-f="pers" aria-label="Personality">${PERS_TYPES.map(x => `<option${persInfo(p).a === x ? " selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><input class="cell list" id="r-${id}-friends" data-id="${id}" data-f="friends" value="${esc(p.friends.join(", "))}" aria-label="Friends" placeholder="Names, comma separated"></td>
      <td><button class="del" data-del="${id}" aria-label="Remove ${esc(p.name)}" title="Remove">×</button></td></tr>`;
  }).join("");
  $("#sheet").innerHTML = head + `<tbody>${body || `<tr><td colspan="24" class="note" style="padding:14px">No players match. Clear the search or add a player.</td></tr>`}</tbody>`;
  const fa = league.players.filter(p => p.team === "FA").length;
  $("#rosterCount").textContent = `${league.players.length} players · ${league.teams.length} teams · ${fa} free agents`;
}
function renderTeamTable() {
  const counts = id => league.players.filter(p => p.team === id).length;
  $("#teamTable").innerHTML = `<thead><tr><th>ID</th><th>Team name</th><th>Abbr</th><th>Jersey</th><th>Numbers</th><th>Accent</th><th>Logo</th><th>Players</th><th></th></tr></thead><tbody>` +
    league.teams.map(t => `<tr><td style="padding-left:10px;font-family:var(--f-mono);font-size:0.8rem">${esc(t.id)}</td>
      <td><input class="cell name" id="t-${t.id}-name" data-tid="${t.id}" data-f="name" value="${esc(t.name)}" aria-label="Team name"></td>
      <td><input class="cell tagc" style="width:5em;min-width:0" id="t-${t.id}-abbr" data-tid="${t.id}" data-f="abbr" value="${esc(t.abbr)}" maxlength="4" aria-label="Abbreviation"></td>
      <td><input type="color" id="t-${t.id}-color" data-tid="${t.id}" data-f="color" value="${t.color}" aria-label="Jersey color"></td>
      <td><input type="color" id="t-${t.id}-color2" data-tid="${t.id}" data-f="color2" value="${t.color2}" aria-label="Number color"></td>
      <td><input type="color" id="t-${t.id}-color3" data-tid="${t.id}" data-f="color3" value="${t.color3 || t.color2}" aria-label="Accent color"></td>
      <td><div class="logo-pick"><span class="tlogo" id="tlogo-${t.id}">${teamLogoSvg(t, 34)}</span>
        <select class="cell" data-tid="${t.id}" data-f="logoShape" aria-label="Logo shape">${LOGO_SHAPES.map(x => `<option value="${x}"${normLogo(t.logo, t).shape === x ? " selected" : ""}>${LOGO_NAMES[x]}</option>`).join("")}</select>
        <select class="cell" data-tid="${t.id}" data-f="logoEmblem" aria-label="Logo emblem">${LOGO_EMBLEMS.map(x => `<option value="${x}"${normLogo(t.logo, t).emblem === x ? " selected" : ""}>${LOGO_NAMES[x]}</option>`).join("")}</select></div></td>
      <td style="font-variant-numeric:tabular-nums">${counts(t.id)}</td>
      <td><button class="del" data-tdel="${t.id}" aria-label="Remove ${esc(t.name)}" title="Remove team (players become free agents)">×</button></td></tr>`).join("") + `</tbody>`;
}
function updateOvr(p) { const o = overall(p); const el = $("#ovr-" + p.id); if (el) el.innerHTML = `${o} <span class="gr" data-g="${grade(o)}">${grade(o)}</span>`; }
function onSheetInput(e) {
  const el = e.target;
  if (el.dataset.tid) {
    const t = teamById(el.dataset.tid); if (!t) return;
    const f = el.dataset.f;
    if (f === "abbr") t.abbr = el.value.toUpperCase().slice(0, 4) || t.id;
    else if (f === "name") t.name = el.value.slice(0, 40) || t.id;
    else if (f === "logoShape" || f === "logoEmblem") { t.logo = normLogo(t.logo, t); t.logo[f === "logoShape" ? "shape" : "emblem"] = el.value; }
    else t[f] = el.value;
    const lg = $("#tlogo-" + t.id); if (lg) lg.innerHTML = teamLogoSvg(t, 34);
    fillTeamSelects(); scheduleSave(); return;
  }
  const id = el.dataset.id; if (!id) return;
  const p = league.players.find(x => x.id === id); if (!p) return;
  const f = el.dataset.f;
  if (STAT_FIELDS.includes(f)) {
    if (el.value === "") return;
    p[f] = clampStat(el.value);
    if (f === "sht" || f === "pas") syncOffense(p);
    const g = el.nextElementSibling; g.textContent = grade(p[f]); g.dataset.g = grade(p[f]);
    updateOvr(p);
  } else if (f === "no") p.no = Math.max(0, Math.min(99, parseInt(el.value, 10) || 0));
  else if (f === "name") {
    const old = p.name, nv = el.value.trim();
    if (!nv) return;
    p.name = nv.slice(0, 40);
    for (const q of league.players) q.friends = q.friends.map(n => n.toLowerCase() === old.toLowerCase() ? p.name : n);
  }
  else if (f === "tag") p.tag = el.value.trim().slice(0, 9) || p.name.split(" ")[0].slice(0, 9);
  else if (f === "team") p.team = el.value;
  else if (f === "pos") { p.pos = el.value; p.style = validStyle(p, p.style); if (p.line > 2 && p.pos === "G") p.line = 2; if (p.line > N_DPAIRS && p.pos === "D") p.line = N_DPAIRS; updateOvr(p); }
  else if (f === "line") p.line = parseInt(el.value, 10) || 0;
  else if (f === "style") { p.style = validStyle(p, el.value); el.title = STYLE_NOTES[p.style] || ""; }
  else if (f === "friends" || f === "groups") p[f] = splitList(el.value);
  else if (f === "pers") p.pers = normPers(Object.assign({}, persInfo(p), { a: el.value }), p);
  scheduleSave();
  if (f === "team" || f === "line" || f === "pos") checkMatchup();
}
$("#view-roster").addEventListener("input", e => { if (e.target.matches("input:not([type=search]):not([type=file])")) onSheetInput(e); });
$("#view-roster").addEventListener("change", e => {
  if (e.target.matches("select.cell")) { onSheetInput(e); if (e.target.dataset.f === "team" || e.target.dataset.f === "pos") renderRoster(); }
  if (e.target.matches("input.num")) e.target.value = clampStat(e.target.value);
});
$("#view-roster").addEventListener("click", e => {
  const d = e.target.closest("[data-del]");
  if (d) { league.players = league.players.filter(p => p.id !== d.dataset.del); scheduleSave(); renderRoster(); checkMatchup(); return; }
  const td = e.target.closest("[data-tdel]");
  if (td) {
    const id = td.dataset.tdel;
    league.players.forEach(p => { if (p.team === id) { p.team = "FA"; p.line = 0; } });
    league.teams = league.teams.filter(t => t.id !== id);
    scheduleSave(); fillTeamSelects(); renderRoster();
  }
});
$("#search").addEventListener("input", e => { searchQ = e.target.value.trim().toLowerCase(); renderRoster(); $("#search").focus(); });
$("#teamFilter").addEventListener("change", e => { filterTeam = e.target.value; renderRoster(); });
$("#addPlayerBtn").addEventListener("click", () => {
  const team = filterTeam !== "ALL" ? filterTeam : "FA";
  let n = 1; while (league.players.some(p => p.name === "New Player " + n)) n++;
  const p = { id: "p-" + Date.now().toString(36), name: "New Player " + n, tag: "New" + n, no: 0, team, pos: "C", line: 0, off: 60, sht: 60, pas: 60, hnd: 60, skt: 65, def: 60, chk: 55, fo: 50, clu: 60, goal: 10, spd: 65, sta: 70, dis: 75, style: "Two-Way", friends: [], groups: [] };
  league.players.unshift(p); scheduleSave();
  searchQ = ""; $("#search").value = "";
  renderRoster();
  const el = $("#r-" + p.id + "-name"); if (el) { el.focus(); el.select(); }
});
$("#addTeamBtn").addEventListener("click", () => {
  let n = league.teams.length + 1, id; do { id = "T" + n++; } while (teamById(id));
  league.teams.push({ id, name: "New Team " + id.slice(1), abbr: id, color: "#2E8B7A", color2: "#FFFFFF" });
  scheduleSave(); fillTeamSelects(); renderRoster();
  const el = $("#t-" + id + "-name"); if (el) { el.focus(); el.select(); }
});
const RESET_BTN = `<button class="btn danger" id="resetBtn">Reset to defaults</button>`;
$("#resetWrap").addEventListener("click", e => {
  const id = e.target.id;
  if (id === "resetBtn") $("#resetWrap").innerHTML = `<span class="row"><span class="note">Replace everything with the default roster?</span><button class="btn danger" id="resetYes">Reset</button><button class="btn" id="resetNo">Cancel</button></span>`;
  else if (id === "resetYes") { league = defaultLeague(); scheduleSave(); $("#resetWrap").innerHTML = RESET_BTN; refreshAll(); }
  else if (id === "resetNo") $("#resetWrap").innerHTML = RESET_BTN;
});

// ---------- import / export ----------
let ioFmt = "csv";
const CSV_COLS = ["name", "short", "no", "team", "pos", "line", "style", "sht", "pas", "hnd", "skt", "spd", "def", "chk", "fo", "sta", "dis", "clu", "goal", "friends", "personality", "personality2", "cares1", "cares2"];
const CSV_IN = CSV_COLS.concat(["off"]); // older exports have one Offense column
function toCSV() {
  const q = v => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [CSV_COLS.join(",")].concat(league.players.map(p => [p.name, p.tag, p.no, p.team, p.pos, p.line, p.style, ...STAT_FIELDS.map(f => p[f]), p.friends.join("; "), persInfo(p).a, persInfo(p).b, persInfo(p).p1, persInfo(p).p2].map(q).join(","))).join("\n");
}
function parseCSV(text) {
  const rows = []; let row = [], f = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inq) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inq = false; } else f += ch; }
    else if (ch === '"') inq = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function fillIO() { $("#ioText").value = ioFmt === "csv" ? toCSV() : JSON.stringify({ version: LEAGUE_VERSION, teams: league.teams, players: league.players }, null, 1); }
$("#ioBtn").addEventListener("click", () => { const p = $("#ioPanel"); p.hidden = !p.hidden; $("#ioBtn").setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) fillIO(); });
$("#fmtSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; ioFmt = b.dataset.f; $("#fmtSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false")); fillIO(); });
function ioMsg(t, kind) { const m = $("#ioMsg"); m.textContent = t; m.className = "msgline " + (kind || "note"); }
$("#copyBtn").addEventListener("click", () => {
  const ta = $("#ioText");
  try { navigator.clipboard.writeText(ta.value).then(() => ioMsg("Copied to the clipboard.", "ok"), () => { ta.select(); ioMsg("Text selected. Press Ctrl+C or Cmd+C to copy."); }); }
  catch (e) { ta.select(); ioMsg("Text selected. Press Ctrl+C or Cmd+C to copy."); }
});
// save text as a file: through claude.ai's download prompt when the page runs there, otherwise a normal browser download
async function saveTextFile(filename, text, mime) {
  if (downloadsApi) { await downloadsApi.save({ filename, data: text }); return; }
  const url = URL.createObjectURL(new Blob([text], { type: mime || "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function fileStamp() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
$("#saveFileBtn").addEventListener("click", async () => {
  try { await saveTextFile("tracen-ice-league-roster-" + fileStamp() + "." + ioFmt, $("#ioText").value, ioFmt === "csv" ? "text/csv" : "application/json"); ioMsg("File saved.", "ok"); }
  catch (e) { ioMsg(e && e.code === "declined" ? "Save cancelled." : "Couldn't save the file here. Use Copy instead.", e && e.code === "declined" ? "note" : "err"); }
});
function importText(text) {
  text = text.trim();
  if (!text) { ioMsg("The text box is empty. Paste a CSV or JSON roster first.", "err"); return; }
  try {
    if (text[0] === "{" || text[0] === "[") {
      const obj = JSON.parse(text);
      const raw = Array.isArray(obj) ? { teams: league.teams, players: obj, version: LEAGUE_VERSION } : obj;
      if (!raw.version) raw.version = LEAGUE_VERSION;
      const L = normalizeLeague(raw);
      if (!L || !L.players.length) throw new Error("No players found in that JSON.");
      league = L;
    } else {
      const rows = parseCSV(text);
      const head = rows.shift().map(h => h.trim().toLowerCase());
      const idx = c => head.indexOf(c);
      if (idx("name") < 0) throw new Error("The first row needs a 'name' column.");
      const players = rows.map(r => { const o = {}; for (const c of CSV_IN) { const i = idx(c === "short" && idx("short") < 0 ? "tag" : c); if (i >= 0) o[c] = r[i]; }
        if (o.off == null && o.sht != null && o.pas != null) o.off = Math.round((Number(o.sht) + Number(o.pas)) / 2); return o; });
      const L = normalizeLeague({ version: LEAGUE_VERSION, teams: league.teams, players });
      if (!L.players.length) throw new Error("No players with names found.");
      league = L;
    }
    scheduleSave(); refreshAll(); fillIO();
    ioMsg(`Imported ${league.players.length} players on ${league.teams.length} teams.`, "ok");
  } catch (e) { ioMsg("Couldn't import: " + (e.message || "the text isn't valid CSV or JSON."), "err"); }
}
$("#importBtn").addEventListener("click", () => importText($("#ioText").value));
$("#fileIn").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { $("#ioText").value = r.result; ioFmt = /\.json$/i.test(f.name) ? "json" : "csv"; importText(r.result); };
  r.readAsText(f); e.target.value = "";
});

