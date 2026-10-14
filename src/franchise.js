// ---------- Franchise mode: screens ----------
let FR = null, frSetup = null, frTab = "home", frSaves = [], frMsg = "", frLive = null;
const frUi = { pos: "ALL", q: "", stKind: "sk", stPo: false, stTeam: "ALL", stSort: "pts", schedMine: false, rosterTeam: null, trade: { team: null, mine: new Set(), theirs: new Set(), msg: "", ok: false }, open: new Set(), signYrs: {} };
const frStore = { db: null, ready: false, readOnly: false, timer: null, writing: false, again: false, state: "idle" };
const FR_LAST = "tracen-fr-last";
const frRoot = () => $("#frRoot");
const frTeam = id => FR && FR.teams.find(t => t.id === id);
const frP = id => FR && FR.players.find(p => p.id === id);
const frPhaseName = () => ({ draft: "Draft", season: "Regular season", playoffs: "Playoffs", done: "Season complete", offseason: "Offseason" })[FR.phase] || FR.phase;
const yrs = n => n + (n === 1 ? " yr" : " yrs");
const fmtToi = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const tLogo = (id, n) => { const t = frTeam(id); return t ? `<span class="tlogo sm">${teamLogoSvg(t, n || 20)}</span>` : ""; };
const tName = id => { const t = frTeam(id); return t ? esc(t.name) : esc(id); };
const tAbbr = id => { const t = frTeam(id); return t ? esc(t.abbr) : esc(id); };

// ---------- storage: an index of saves, one core document per save, one document per season ----------
async function frInitStore() {
  const cl = window.claude;
  if (cl && cl.use) { try { frStore.db = await cl.use("db"); } catch (e) {} }
  frStore.ready = true;
  await frLoadIndex();
  if (!FR && !frSetup) { const k = currentView() === "bap" ? "tracen-bap-last" : FR_LAST; let last = null; try { last = localStorage.getItem(k); } catch (e) {} if (last && frSaves.some(s => s.id === last)) await frOpen(last, true); }
  if (currentView() === "franchise" || currentView() === "bap") frRender();
}
function frLocalGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function frLocalSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
async function frLoadIndex() {
  let list = [];
  if (frStore.db) { try { const snap = await frStore.db.collection("fmeta").get(); list = snap.docs.map(d => d.data()).filter(Boolean); } catch (e) {} }
  const local = frLocalGet("tracen-fr-index") || [];
  for (const m of local) if (!list.some(x => x.id === m.id)) list.push(Object.assign({ local: true }, m));
  frSaves = list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
function frMeta(F) { const t = F.teams.find(x => x.id === F.user); return { id: F.id, mode: F.mode || "franchise", name: F.name, team: F.user, teamName: t ? t.name : F.user, color: t ? t.color : "#555", season: F.season, phase: F.phase, updated: Date.now() }; }
function frSplit(F) { const core = Object.assign({}, F); delete core.S; core.sN = F.S ? F.S.n : null; return { core, S: F.S || null }; }
function frSave() {
  if (!FR) return;
  FR.updated = Date.now();
  frLocalSet("tracen-fr-" + FR.id, FR); // keep this browser's copy current right away
  frStore.state = "saving"; frPill();
  clearTimeout(frStore.timer); frStore.timer = setTimeout(frFlush, 500);
}
// don't lose the last few moves when the tab closes or the page reloads
addEventListener("pagehide", () => { if (FR && (frStore.state === "saving" || frStore.state === "retry")) frFlush(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && FR && (frStore.state === "saving" || frStore.state === "retry")) frFlush(); });
// a shared-save call that hasn't answered in 20 seconds counts as failed, so the save can never hang
function frTimed(p) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout", message: "The shared save didn't answer." }), 12000))]); }
async function frFlush() {
  if (!FR) { if (frStore.state === "saving") { frStore.state = "idle"; frPill(); } return; }
  if (frStore.writing) { frStore.again = true; if (Date.now() - (frStore.writeT || 0) < 45000) return; frStore.writing = false; } // a stuck write gets abandoned
  frStore.writing = true; frStore.writeT = Date.now();
  try {
    clearTimeout(frStore.timer);
    const F = FR; if (!F.updated) F.updated = Date.now();
    const { core, S } = frSplit(F), meta = frMeta(F); meta.updated = F.updated;
    // always keep a local copy so nothing is lost if the shared save fails
    frLocalSet("tracen-fr-" + F.id, F);
    const idx = (frLocalGet("tracen-fr-index") || []).filter(x => x.id !== F.id); idx.unshift(meta); frLocalSet("tracen-fr-index", idx.slice(0, 20));
    if (frStore.db && !frStore.readOnly) {
      try {
        await frTimed(frStore.db.doc("franchises/" + F.id).set(JSON.parse(JSON.stringify(core))));
        if (S) await frTimed(frStore.db.doc("franchises/" + F.id + "/seasons/s" + S.n).set(JSON.parse(JSON.stringify(S))));
        await frTimed(frStore.db.doc("fmeta/" + F.id).set(meta));
        frStore.state = "saved"; frStore.fails = 0; frStore.savedAt = Date.now(); frStore.err = "";
      } catch (e) {
        const c = e && e.code; frStore.err = (c || "error") + (e && e.message ? ": " + e.message : "");
        if (c === "invalid_argument") { frStore.readOnly = true; frStore.state = "local"; }
        else if (c === "quota_exceeded") frStore.state = "full";
        else { frStore.fails = (frStore.fails || 0) + 1; frStore.state = frStore.fails > 4 ? "local" : "retry"; if (frStore.fails <= 4) setTimeout(frFlush, 1200 * frStore.fails + Math.random() * 800); }
      }
    } else frStore.state = "local";
    const s = frSaves.find(x => x.id === F.id); if (s) Object.assign(s, meta); else frSaves.unshift(meta);
  } catch (e) { frStore.state = "local"; frStore.err = "save error: " + (e && e.message || e); }
  finally { frStore.writing = false; }
  frPill();
  if (frStore.again) { frStore.again = false; frFlush(); }
}
function frPill() {
  const el = $("#frPill"); if (!el) return;
  const at = frStore.savedAt ? " · " + new Date(frStore.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const map = { saving: ["saving", "Saving…"], retry: ["saving", "Saved in this browser · retrying the shared save"], saved: ["saved", "Saved" + at], local: ["saved", frStore.readOnly ? "View only: saved in this browser" : "Saved in this browser"], full: ["error", "Storage is full: delete an old franchise"], idle: ["idle", ""] };
  const [s, t] = map[frStore.state] || map.idle; el.dataset.s = s; el.textContent = t; el.title = frStore.err ? "Last shared-save problem: " + frStore.err : "";
}
// read a whole save (core + current season), newest copy wins; doesn't open it
async function frFetch(id) {
  let F = null;
  if (frStore.db) {
    try {
      const c = await frStore.db.doc("franchises/" + id).get();
      if (c.exists) { F = JSON.parse(JSON.stringify(c.data())); const s = await frStore.db.doc("franchises/" + id + "/seasons/s" + (F.sN || F.season)).get(); F.S = s.exists ? JSON.parse(JSON.stringify(s.data())) : null; }
    } catch (e) {}
  }
  const local = frLocalGet("tracen-fr-" + id);
  if (local && (!F || (local.updated || 0) > (F.updated || 0))) F = local;
  return F;
}
// ---------- save files: download a franchise or career, load one back ----------
const SAVE_KIND = "tracen-ice-league-save";
async function frExport(id) {
  const F = FR && FR.id === id ? FR : await frFetch(id);
  if (!F) { frMsg = "Couldn't read that save."; frRender(); return; }
  const full = Object.assign({}, F); delete full.sN;
  const slug = String(F.name || "save").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "save";
  const text = JSON.stringify({ kind: SAVE_KIND, mode: F.mode || "franchise", app: "Tracen Ice League", league: LEAGUE_VERSION, exported: new Date().toISOString(), save: full });
  try { await saveTextFile(slug + "-season-" + F.season + "-" + fileStamp() + ".json", text); frMsg = "Saved “" + F.name + "” to a file. Load it from the saves screen with Import save file."; }
  catch (e) { frMsg = e && e.code === "declined" ? "Download cancelled." : "Couldn't save the file here."; }
  frRender();
}
let frImportMode = "franchise";
function frImportPick(mode) { frImportMode = mode; const inp = $("#saveFileIn"); inp.value = ""; inp.click(); }
async function frImportText(text) {
  let obj; try { obj = JSON.parse(text); } catch (e) { return "That file isn't a save file (it couldn't be read as JSON)."; }
  const F = obj && obj.kind === SAVE_KIND ? obj.save : obj && obj.players && obj.teams && obj.phase ? obj : null;
  if (!F || !Array.isArray(F.players) || !Array.isArray(F.teams) || !F.id) return "That file isn't a Tracen Ice League save. Roster files go in Roster sheet → Import / export.";
  const mode = F.mode === "bap" ? "bap" : "franchise";
  if (["season", "playoffs", "done"].includes(F.phase) && !F.S) return "That save is missing its season data, so it can't be loaded.";
  const exists = frSaves.find(s => s.id === F.id);
  if (exists) {
    const replace = await uiConfirm("You already have “" + exists.name + "”. Replace it with the copy from the file? Choose Cancel to keep both.", "Replace");
    if (!replace) { F.id = frId(); F.name = (F.name || "Imported save") + " (copy)"; }
  }
  if (FR && frStore.state === "saving") await frFlush();
  frMigrateChem(F);
  FR = F; frSetup = null; frTab = "home"; FR.updated = Date.now();
  frUi.rosterTeam = F.user; frUi.trade = { team: null, mine: new Set(), theirs: new Set(), msg: "", ok: false };
  try { localStorage.setItem(mode === "bap" ? "tracen-bap-last" : FR_LAST, F.id); } catch (e) {}
  frSave(); await frFlush(); await frLoadIndex();
  if (mode !== frImportMode) { location.hash = mode === "bap" ? "#bap" : "#franchise"; }
  return "";
}
$("#saveFileIn").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const set = m => { if (frImportMode === "bap" && typeof bapMsg !== "undefined") bapMsg = m; else frMsg = m; };
  if (f.size > 8 * 1024 * 1024) { set("That file is too big to be a save."); frRender(); return; }
  const err = await frImportText(await f.text());
  set(err || "Loaded “" + (FR ? FR.name : "the save") + "” from the file.");
  frRender();
});
async function frOpen(id, quiet) {
  let F = null;
  if (frStore.db) {
    try {
      const c = await frStore.db.doc("franchises/" + id).get();
      if (c.exists) { F = JSON.parse(JSON.stringify(c.data())); const s = await frStore.db.doc("franchises/" + id + "/seasons/s" + (F.sN || F.season)).get(); F.S = s.exists ? JSON.parse(JSON.stringify(s.data())) : null; }
    } catch (e) {}
  }
  // this browser may hold a newer copy than the shared save (a save that didn't finish before a reload): take the newest
  const local = frLocalGet("tracen-fr-" + id);
  let fromLocal = false;
  if (local && (!F || (local.updated || 0) > (F.updated || 0))) { F = local; fromLocal = true; }
  if (!F) { if (!quiet) frMsg = "Couldn't open that franchise."; return; }
  frMigrateChem(F);
  FR = F; frSetup = null; frTab = "home"; frStore.state = "idle"; frUi.rosterTeam = F.user; frUi.trade = { team: null, mine: new Set(), theirs: new Set(), msg: "", ok: false };
  try { localStorage.setItem(F.mode === "bap" ? "tracen-bap-last" : FR_LAST, id); } catch (e) {}
  if (fromLocal && frStore.db && !frStore.readOnly) frSave(); // push the newer local copy up to the shared save
}
async function frDelete(id) {
  const meta = frSaves.find(s => s.id === id);
  if (frStore.db) {
    try {
      const c = await frStore.db.doc("franchises/" + id).get(); const n = c.exists ? c.data().season || 1 : (meta && meta.season) || 1;
      for (let k = 1; k <= n; k++) await frStore.db.doc("franchises/" + id + "/seasons/s" + k).delete().catch(() => {});
      await frStore.db.doc("franchises/" + id).delete().catch(() => {}); await frStore.db.doc("fmeta/" + id).delete().catch(() => {});
    } catch (e) {}
  }
  try { localStorage.removeItem("tracen-fr-" + id); } catch (e) {}
  frLocalSet("tracen-fr-index", (frLocalGet("tracen-fr-index") || []).filter(x => x.id !== id));
  frSaves = frSaves.filter(s => s.id !== id);
  if (FR && FR.id === id) FR = null;
}

// ---------- render: which screen ----------
function frRender() { if (currentView() === "bap" && typeof renderBap === "function") renderBap(); else renderFranchise(); }
function renderFranchise() {
  const root = frRoot(); if (!root) return;
  if (FR && FR.mode === "bap") { if (frStore.state === "saving") frFlush(); FR = null; }
  if (!frStore.ready) { root.innerHTML = `<div class="panel fr-empty"><p class="note">Loading franchises…</p></div>`; return; }
  if (frSetup) root.innerHTML = frSetupHtml();
  else if (!FR) root.innerHTML = frSavesHtml();
  else if (FR.phase === "draft") root.innerHTML = frDraftHtml();
  else root.innerHTML = frHubHtml();
  frPill();
  if (FR && !frSetup && FR.phase !== "draft" && frTab === "lines") renderLines(frLinesCtx());
}

// ---------- saves ----------
function frSavesHtml() {
  const cards = frSaves.filter(s => s.mode !== "bap").map(s => `<div class="fr-save" style="--tc:${esc(s.color || "#555")}">
      <div class="fr-save-h"><b>${esc(s.name)}</b><span class="note">${esc(s.teamName || s.team)} · Season ${s.season} · ${esc(({ draft: "Draft", season: "Regular season", playoffs: "Playoffs", done: "Season complete", offseason: "Offseason" })[s.phase] || s.phase)}${s.local ? " · this browser only" : ""}</span></div>
      <div class="fr-save-a"><button class="btn primary" data-fr="open" data-id="${esc(s.id)}">Continue</button><button class="btn" data-fr="export" data-id="${esc(s.id)}" title="Download this franchise as a file">Download</button><button class="btn danger" data-fr="del" data-id="${esc(s.id)}">Delete</button></div></div>`).join("");
  return `<div class="section-h"><h2>Franchise</h2></div>
    <div class="panel fr-intro">
      <div><h3>Run a club, season after season</h3>
      <p>Pick one of the league's ten clubs and rebuild it from a fantasy draft. Every player in the league goes back into the pool. The first-round order is random and the draft snakes from there. Then manage contracts under the salary cap, field trade offers from the other general managers, get through injuries, and chase the Tracen Cup in the playoffs. You can watch any game in the league, not just your own.</p></div>
      <div class="fr-intro-btns"><button class="btn primary big" data-fr="new">New franchise</button><button class="btn big" data-fr="import">Import save file</button></div>
    </div>
    ${frMsg ? `<p class="fr-msg">${esc(frMsg)}</p>` : ""}
    ${cards ? `<div class="sec-h" style="padding-left:0">Saved franchises</div><div class="fr-saves">${cards}</div>` : `<p class="note">No franchises yet.</p>`}
    <p class="note">${frStore.db ? "Franchises are saved to the shared league, so anyone with the link sees the same saves." : "Franchises are saved in this browser only. Download a save to back it up or move it to another device."}</p>`;
}

// ---------- new franchise ----------
function frStartSetup() {
  const t = FR_TEAMS[0];
  frSetup = { step: 1, user: t.id, edit: frTeamDraft(t), name: "", games: 28, series: 7, trades: "normal", injuries: true };
}
function frTeamDraft(t) { return { name: t.name, abbr: t.abbr, color: t.color, color2: t.color2, color3: t.color3 || t.color2, shape: (t.logo || {}).shape || logoDefaults(t).shape, emblem: (t.logo || {}).emblem || logoDefaults(t).emblem }; }
function frSetupHtml() {
  const s = frSetup, e = s.edit;
  const preview = { id: s.user, name: e.name, abbr: e.abbr, color: e.color, color2: e.color2, color3: e.color3, logo: { shape: e.shape, emblem: e.emblem } };
  if (s.step === 1) {
    const cards = FR_TEAMS.map(t => `<button class="fr-club${t.id === s.user ? " on" : ""}" data-fr="club" data-id="${esc(t.id)}" aria-pressed="${t.id === s.user}" style="--tc:${esc(t.color)}">${teamLogoSvg(t.id === s.user ? Object.assign({}, t, preview) : t, 54)}<b>${esc(t.id === s.user ? e.name : t.name)}</b><span>${esc(t.id === s.user ? e.abbr : t.abbr)}</span></button>`).join("");
    const opt = (arr, cur) => arr.map(v => `<option value="${v}"${v === cur ? " selected" : ""}>${LOGO_NAMES[v]}</option>`).join("");
    return `<div class="section-h"><h2>New franchise · Choose your club</h2><button class="btn" data-fr="cancel">Cancel</button></div>
      <div class="fr-clubs">${cards}</div>
      <div class="panel fr-custom">
        <div class="fr-prev">${teamLogoSvg(preview, 120)}</div>
        <div class="fr-form">
          <p class="note" style="margin:0 0 6px">Make the club your own. Rosters come from the draft, so every club starts on equal footing.</p>
          <label>Club name<input id="frName" value="${esc(e.name)}" maxlength="40"></label>
          <label>Abbreviation<input id="frAbbr" value="${esc(e.abbr)}" maxlength="4" style="text-transform:uppercase;width:6em"></label>
          <div class="fr-colors"><label>Main<input type="color" id="frC1" value="${esc(e.color)}"></label><label>Second<input type="color" id="frC2" value="${esc(e.color2)}"></label><label>Trim<input type="color" id="frC3" value="${esc(e.color3)}"></label></div>
          <div class="fr-colors"><label>Crest<select id="frShape">${opt(LOGO_SHAPES, e.shape)}</select></label><label>Emblem<select id="frEmblem">${opt(LOGO_EMBLEMS, e.emblem)}</select></label></div>
          <span class="note">Changes here belong to this save only. Quick Play and your other saves keep the league's own clubs.</span>
        </div>
      </div>
      <div class="fr-nav"><button class="btn primary" data-fr="step2">Next: league settings</button></div>`;
  }
  const radio = (name, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-fr="opt" data-k="${name}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join("")}</div>`;
  return `<div class="section-h"><h2>New franchise · League settings</h2><button class="btn" data-fr="cancel">Cancel</button></div>
    <div class="panel fr-settings">
      <div class="fr-row"><span>Save name</span><input id="frSaveName" value="${esc(s.name || e.name + " franchise")}" maxlength="40"></div>
      <div class="fr-row"><span>Season length</span>${radio("games", [[14, "14 games"], [28, "28 games"], [42, "42 games"], [56, "56 games"]], s.games)}</div>
      <div class="fr-row"><span>Playoff series</span>${radio("series", [[5, "Best of 5"], [7, "Best of 7"]], s.series)}</div>
      <div class="fr-row"><span>Trade offers from other clubs</span>${radio("trades", [["off", "Off"], ["low", "Rare"], ["normal", "Normal"], ["high", "Frequent"]], s.trades)}</div>
      <div class="fr-row"><span>Injuries</span>${radio("injuries", [[true, "On"], [false, "Off"]], s.injuries)}</div>
      <div class="fr-row"><span>Draft</span><span class="note">16 rounds, snake order. The first round is shuffled for every new save. Each club needs at least 9 forwards, 4 defenders and 2 goalies, and has to stay under the salary cap.</span></div>
    </div>
    <div class="fr-nav"><button class="btn" data-fr="step1">Back</button><button class="btn primary" data-fr="create">Start the draft</button></div>`;
}
function frReadSetupForm() {
  const s = frSetup; if (!s || s.step !== 1) return;
  const v = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const e = s.edit;
  if (v("frName") != null) { e.name = v("frName").trim() || e.name; e.abbr = (v("frAbbr") || e.abbr).trim().toUpperCase().slice(0, 4) || e.abbr; e.color = v("frC1"); e.color2 = v("frC2"); e.color3 = v("frC3"); e.shape = v("frShape"); e.emblem = v("frEmblem"); }
}
function frCreate() {
  const s = frSetup, e = s.edit;
  const nm = document.getElementById("frSaveName"); if (nm) s.name = nm.value.trim();
  const teamEdit = { name: e.name, abbr: e.abbr, color: e.color, color2: e.color2, color3: e.color3, logo: { shape: e.shape, emblem: e.emblem } };
  const src = JSON.parse(JSON.stringify(league));
  FR = frNew(src, { user: s.user, name: s.name || e.name + " franchise", teamEdit, settings: { games: s.games, series: s.series, trades: s.trades, injuries: s.injuries } });
  frSetup = null; frTab = "home"; frUi.rosterTeam = FR.user;
  try { localStorage.setItem(FR_LAST, FR.id); } catch (x) {}
  draftAdvance(FR, false);
  frSave();
}

// ---------- draft room ----------
function frRatingsCell(p) {
  if (posGroup(p) === "G") return `<span class="rt3"><i>GOAL</i>${p.goal}</span><span class="rt3"><i>STA</i>${p.sta}</span><span class="rt3"><i>CLU</i>${p.clu ?? "–"}</span>`;
  return ["sht", "pas", "skt", "def"].map(k => `<span class="rt3"><i>${STAT_ABBR[k]}</i>${p[k] ?? "–"}</span>`).join("");
}
function frOvr(p) { const o = overall(p); return `<span class="ovr">${o} <span class="gr" data-g="${grade(o)}">${grade(o)}</span></span>`; }
function frDraftHtml() {
  const F = FR, n = F.teams.length, idx = F.draft.idx, round = Math.floor(idx / n) + 1, pick = idx % n + 1;
  const onClock = draftTeamAt(F, idx), mine = onClock === F.user;
  const upcoming = []; for (let i = idx; i < Math.min(idx + 16, F.draft.rounds * n); i++) upcoming.push(draftTeamAt(F, i));
  let nextMine = -1; for (let i = idx; i < F.draft.rounds * n; i++) if (draftTeamAt(F, i) === F.user) { nextMine = i; break; }
  const pool = draftPool(F).filter(p => frUi.pos === "ALL" || (frUi.pos === "F" ? posGroup(p) === "F" : p.pos === frUi.pos))
    .filter(p => !frUi.q || p.name.toLowerCase().includes(frUi.q)).sort((a, b) => draftValue(b) - draftValue(a) || overall(b) - overall(a));
  const rows = pool.slice(0, 120).map(p => {
    const why = mine ? draftLegal(F, F.user, p) : "";
    return `<tr><td class="nm"><div class="pn">${chibiHead(p.name, 30)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${esc(p.name)}</b><small>${esc(p.style)}</small></span></div></td><td>${p.pos}</td><td>${frOvr(p)}</td><td class="rts">${frRatingsCell(p)}</td><td class="num">${money(p.con.sal)} · ${yrs(p.con.yrs)}</td>
      <td><button class="btn sm${mine && !why ? " primary" : ""}" data-fr="pick" data-id="${esc(p.id)}" ${!mine || why ? "disabled" : ""} title="${esc(why || (mine ? "Draft " + p.name : "Wait for your pick"))}">Draft</button></td></tr>`;
  }).join("");
  const c = draftCounts(F, F.user), pay = frPayroll(F, F.user);
  const myList = g => F.players.filter(p => p.team === F.user && posGroup(p) === g).sort((a, b) => overall(b) - overall(a)).map(p => `<li>${chibiHead(p.name, 24)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0">${esc(p.name)}</span><small>${p.pos} · ${overall(p)} · ${money(p.con.sal)}</small></li>`).join("") || `<li class="note">None yet</li>`;
  const recent = F.draft.picks.slice(-10).reverse().map(k => { const p = frP(k.pid); return `<li>${tLogo(k.team, 18)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${Math.floor(k.i / n) + 1}.${k.i % n + 1}</b> ${esc(p.name)}</span><small>${p.pos} · ${overall(p)}</small></li>`; }).join("");
  const seg = ["ALL", "F", "C", "LW", "RW", "D", "G"].map(v => `<button data-fr="dpos" data-v="${v}" aria-pressed="${frUi.pos === v}">${v === "ALL" ? "All" : v}</button>`).join("");
  return `<div class="fr-head">${tLogo(F.user, 40)}<div><h2>${tName(F.user)} · Draft</h2><span class="note">${esc(F.name)} · Salary cap ${money(F.cap)}</span></div><span class="save-pill" id="frPill"></span><button class="btn" data-fr="saves">All franchises</button></div>
    <div class="panel fr-clock">
      <div class="fr-clock-now">${tLogo(onClock, 44)}<div><span class="note">Round ${round} of ${F.draft.rounds} · Pick ${pick} · #${idx + 1} overall</span><b>${mine ? "You're on the clock" : tName(onClock) + " are on the clock"}</b><span class="note">${nextMine < 0 ? "You have no picks left." : mine ? "Choose a player below, or let the computer pick for you." : "Your next pick is #" + (nextMine + 1) + ", in " + (nextMine - idx) + " picks."}</span></div></div>
      <div class="fr-clock-btns">${mine ? `<button class="btn primary" data-fr="autopick">Auto-pick for me</button>` : `<button class="btn primary" data-fr="tomine">Sim to my pick</button>`}<button class="btn" data-fr="toend">Sim to the end</button></div>
      <div class="fr-order" aria-label="Upcoming picks">${upcoming.map((t, i) => `<span class="${t === F.user ? "me" : ""}${i === 0 ? " now" : ""}" title="${tName(t)}">${tAbbr(t)}</span>`).join("")}</div>
    </div>
    <div class="seg fr-dview" role="group" aria-label="Draft view"><button data-fr="dview" data-v="board" aria-pressed="${frUi.dview !== "recap"}">Draft board</button><button data-fr="dview" data-v="recap" aria-pressed="${frUi.dview === "recap"}">Draft recap · ${F.draft.picks.length} picks</button></div>
    ${frUi.dview === "recap" ? frRecapHtml() : `<div class="fr-draft">
      <div class="panel"><div class="panel-h"><div class="seg">${seg}</div><input type="search" id="frDraftQ" placeholder="Search players" value="${esc(frUi.q)}" aria-label="Search players"><span class="note" title="Goalies are hard to project, so scouts rank them lower than their overall">${pool.length} available · big-board order</span></div>
        <div class="tscroll lim"><table class="fr-tbl"><thead><tr><th title="Ranked by the scouts' big board: goalies are hard to project, so they slide">Player</th><th>Pos</th><th>OVR</th><th class="rcol">Ratings</th><th class="num">Contract</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="note">No players match.</td></tr>`}</tbody></table></div></div>
      <div class="fr-side">
        <div class="panel"><div class="panel-h"><b>Your picks · ${c.n}/${F.draft.rounds}</b><span class="note">F ${c.F}/9 · D ${c.D}/4 · G ${c.G}/2</span></div>
          ${frCapBar(pay, F.cap)}
          <div class="fr-mini"><div class="sec-h">Forwards</div><ul>${myList("F")}</ul><div class="sec-h">Defense</div><ul>${myList("D")}</ul><div class="sec-h">Goalies</div><ul>${myList("G")}</ul></div></div>
        <div class="panel"><div class="panel-h"><b>Recent picks</b></div><ul class="fr-recent">${recent || `<li class="note">The draft is about to begin.</li>`}</ul></div>
      </div>
    </div>`}`;
}
// ---------- draft recap: every pick, filterable by round and team ----------
function frRecapHtml() {
  const F = FR, n = F.teams.length, R = F.draft.rounds, picks = F.draft.picks;
  const fr = frUi.rcRound || "ALL", ft = frUi.rcTeam || "ALL", fp = frUi.rcPos || "ALL";
  if (!picks.length) return `<div class="panel fr-empty"><p class="note">No picks yet. The recap fills in as the draft goes.</p></div>`;
  const rnd = k => Math.floor(k.i / n) + 1, lab = k => rnd(k) + "." + (k.i % n + 1);
  // value: how far a player outplays her draft slot, by current overall among everyone drafted
  const byOvr = picks.map(k => frP(k.pid)).filter(Boolean).sort((a, b) => overall(b) - overall(a)).map(p => p.id);
  const val = k => k.i - byOvr.indexOf(k.pid);
  const posOk = p => fp === "ALL" || (fp === "F" ? posGroup(p) === "F" : posGroup(p) === fp);
  const list = picks.filter(k => (fr === "ALL" || rnd(k) === +fr) && (ft === "ALL" || k.team === ft)).filter(k => { const p = frP(k.pid); return p && posOk(p); });
  const S = F.phase !== "draft" && F.S ? F.S.stats : null;
  const rows = list.map(k => {
    const p = frP(k.pid), g = posGroup(p), s = S && S[p.id];
    const now = p.team === k.team ? `<span class="note">–</span>` : p.team === "FA" ? `<span class="note">Free agent</span>` : frTeam(p.team) ? `${tLogo(p.team, 16)} ${tAbbr(p.team)}` : `<span class="note">${esc(p.team)}</span>`;
    const v = val(k), tag = v >= n ? `<em class="fr-tagv good">Steal</em>` : v <= -2 * n ? `<em class="fr-tagv">Reach</em>` : "";
    const st = !S ? "" : `<td class="num">${s ? s.gp : 0}</td><td class="num">${!s ? "–" : g === "G" ? (s.sa ? (s.sv / s.sa).toFixed(3).replace(/^0/, "") : "–") : s.g + s.a}</td>`;
    return `<tr class="${k.team === F.user ? "me" : ""}"><td class="num"><b>${lab(k)}</b><small class="note"> #${k.i + 1}</small></td><td>${tLogo(k.team, 20)} ${tAbbr(k.team)}</td>
      <td class="nm"><div class="pn">${chibiHead(p.name, 28)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${esc(p.name)}</b><small>${esc(p.style)}</small></span></div></td><td>${p.pos}</td><td>${frOvr(p)} ${tag}</td><td>${now}</td><td class="num">${money(p.con.sal)}</td>${st}</tr>`;
  }).join("");
  // each club's haul
  const hauls = F.teams.map(t => { const ks = picks.filter(k => k.team === t.id), ps = ks.map(k => frP(k.pid)).filter(Boolean); return { t, n: ks.length, avg: ps.length ? ps.reduce((a, p) => a + overall(p), 0) / ps.length : 0, best: ps.sort((a, b) => overall(b) - overall(a))[0] }; }).filter(h => h.n).sort((a, b) => b.avg - a.avg);
  const strip = hauls.map((h, i) => `<button class="fr-haul${ft === h.t.id ? " on" : ""}${h.t.id === F.user ? " me" : ""}" data-fr="rcteam" data-v="${ft === h.t.id ? "ALL" : esc(h.t.id)}" title="${ft === h.t.id ? "Show every team" : "Show only " + esc(h.t.name)}">${tLogo(h.t.id, 26)}<span><b>${i + 1}. ${tAbbr(h.t.id)}</b><small>${h.n} pick${h.n === 1 ? "" : "s"} · avg ${h.avg.toFixed(1)} OVR</small><small>Best: ${h.best ? esc(h.best.name) : "–"}</small></span></button>`).join("");
  const steals = picks.filter(k => val(k) > 0).sort((a, b) => val(b) - val(a)).slice(0, 3).map(k => { const p = frP(k.pid); return `<li>${tLogo(k.team, 18)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${lab(k)}</b> ${esc(p.name)}</span><small>${p.pos} · ${overall(p)} OVR · ${val(k)} spots of value</small></li>`; }).join("");
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const rounds = [opt("ALL", "All rounds", fr)].concat([...Array(R)].map((_, i) => opt(i + 1, "Round " + (i + 1), fr))).join("");
  const teams = [opt("ALL", "All teams", ft)].concat(F.teams.map(t => opt(t.id, t.name + (t.id === F.user ? " (you)" : ""), ft))).join("");
  const pseg = ["ALL", "F", "D", "G"].map(v => `<button data-fr="rcpos" data-v="${v}" aria-pressed="${fp === v}">${v === "ALL" ? "All" : v}</button>`).join("");
  return `<div class="panel"><div class="panel-h"><b>Draft recap</b><label class="note">Round <select data-fr-sel="rcRound">${rounds}</select></label><label class="note">Team <select data-fr-sel="rcTeam">${teams}</select></label><div class="seg">${pseg}</div><span class="note">${list.length} of ${picks.length} picks</span></div>
      <div class="fr-hauls">${strip}</div>
      ${steals && ft === "ALL" && fr === "ALL" ? `<div class="sec-h" style="padding:6px 14px 0">Biggest steals so far</div><ul class="fr-recent">${steals}</ul>` : ""}
      <div class="tscroll lim"><table class="fr-tbl"><thead><tr><th class="num">Pick</th><th>Team</th><th>Player</th><th>Pos</th><th>OVR</th><th>Now with</th><th class="num">Salary</th>${S ? `<th class="num">GP</th><th class="num">P / SV%</th>` : ""}</tr></thead><tbody>${rows || `<tr><td colspan="9" class="note">No picks match.</td></tr>`}</tbody></table></div>
      <p class="note" style="padding:4px 14px 12px">Steal: playing well above where she went, by current overall among everyone drafted. Reach: taken well before her rating says. Click any player for her full card.</p></div>`;
}
// draft details for the player card
function frPcardDraft(p) {
  const F = FR; if (!F || F.mode === "bap" || !F.draft) return "";
  const n = F.teams.length, k = F.draft.picks.find(x => x.pid === p.id);
  const lab = i => "Round " + (Math.floor(i / n) + 1) + ", pick " + (i % n + 1) + " · #" + (i + 1) + " overall";
  if (k) return `<div class="pc-draft"><b>Drafted</b><span>${tLogo(k.team, 20)} ${tName(k.team)} · ${lab(k.i)}</span>${k.team === F.user ? `<em class="pc-tag on">Your pick</em>` : ""}</div>`;
  if (F.phase !== "draft" || p.team !== "POOL") return "";
  const pool = draftPool(F).sort((a, b) => draftValue(b) - draftValue(a) || overall(b) - overall(a)), g = posGroup(p);
  const rk = pool.findIndex(x => x.id === p.id) + 1, prk = pool.filter(x => posGroup(x) === g).findIndex(x => x.id === p.id) + 1;
  const mine = draftTeamAt(F, F.draft.idx) === F.user, why = mine ? draftLegal(F, F.user, p) : "";
  return `<div class="pc-draft"><b>Available</b><span>#${rk} of ${pool.length} on the board · #${prk} ${({ F: "forward", D: "defender", G: "goalie" })[g]}</span>
    ${mine ? (why ? `<span class="bad">${esc(why)}</span>` : `<button class="btn primary sm" data-fr="pick" data-id="${esc(p.id)}">Draft ${esc(p.name)}</button>`) : `<span class="note">${tName(draftTeamAt(F, F.draft.idx))} are on the clock.</span>`}</div>`;
}
function frCapBar(pay, cap) {
  const pct = Math.min(100, pay / cap * 100), over = pay > cap;
  return `<div class="fr-cap"><div class="fr-capbar${over ? " over" : ""}"><i style="width:${pct.toFixed(1)}%"></i></div><span>${money(pay)} of ${money(cap)}</span><b class="${over ? "bad" : ""}">${over ? "Over by " + money(pay - cap) : money(cap - pay) + " space"}</b></div>`;
}

// ---------- the hub ----------
const FR_TABS = [["home", "Home"], ["media", "Media"], ["schedule", "Schedule"], ["standings", "Standings"], ["stats", "Stats"], ["roster", "Rosters"], ["lines", "Lines"], ["training", "Training"], ["trades", "Trades"], ["fa", "Free agents"], ["draft", "Draft"], ["history", "History"]];
function frHubHtml() {
  const F = FR, st = frStandings(F), me = st.findIndex(r => r.id === F.user), r = st[me];
  const pay = frPayroll(F, F.user);
  const dayTxt = F.phase === "season" ? "Day " + Math.min(F.day + 1, F.regDays) + " of " + F.regDays : F.phase === "playoffs" ? (F.S.po.round === 1 ? "Semifinals" : "Final") : F.phase === "offseason" ? (F.off.step === "resign" ? "Re-signing" : "Free agency") : "";
  const tabs = FR_TABS.filter(([k]) => k !== "draft" || (F.draft && F.draft.picks.length)).map(([k, l]) => `<button data-fr="tab" data-v="${k}" aria-current="${frTab === k ? "page" : "false"}">${l}${k === "trades" && F.offers.length ? ` <i class="dot">${F.offers.length}</i>` : ""}</button>`).join("");
  const body = { home: frHomeHtml, media: frMediaHtml, training: frTrainingHtml, schedule: frScheduleHtml, standings: frStandingsHtml, stats: frStatsHtml, roster: frRosterHtml, lines: frLinesHtml, trades: frTradesHtml, fa: frFaHtml, draft: () => F.draft ? frRecapHtml() : "", history: frHistoryHtml }[frTab] || frHomeHtml;
  return `<div class="fr-head" style="--tc:${esc(frTeam(F.user).color)}">${tLogo(F.user, 44)}<div><h2>${tName(F.user)}</h2><span class="note">${esc(F.name)} · Season ${F.season} · ${frPhaseName()}${dayTxt ? " · " + dayTxt : ""}</span></div>
      <div class="fr-kpis"><span><b>${r ? r.w + "–" + r.l + "–" + r.otl : "0–0–0"}</b><i>Record</i></span><span><b>${me + 1}<sup>${["st", "nd", "rd"][me] || "th"}</sup></b><i>Standing</i></span><span><b class="${pay > F.cap ? "bad" : ""}">${money(F.cap - pay)}</b><i>Cap space</i></span>${(() => { const ms = frMoodSummary(F, F.user); return `<span><b>${moodBadge(moodLevel(ms.avg))}</b><i>Locker room</i></span>`; })()}</div>
      <span class="save-pill" id="frPill"></span><button class="btn" data-fr="export" data-id="${esc(F.id)}" title="Download this franchise as a file">Download save</button><button class="btn" data-fr="saves">All franchises</button></div>
    <nav class="fr-tabs" aria-label="Franchise sections">${tabs}</nav>
    ${frMsg ? `<p class="fr-msg">${esc(frMsg)}</p>` : ""}
    ${body()}`;
}
function frGameRow(g, opts) {
  const F = FR, fin = g.st === "final", mine = g.h === F.user || g.a === F.user;
  const live = frLive && frLive.fid === F.id && frLive.season === F.season && frLive.gid === g.id && !frLive.saved && !fin;
  const score = fin ? `<b>${g.as}</b><span>–</span><b>${g.hs}</b>${g.dec !== "REG" ? `<em>${g.dec}</em>` : ""}` : `<span class="note">${g.po ? "Game " + g.gn : "@"}</span>`;
  const act = fin ? `<button class="btn sm" data-fr="box" data-id="${g.id}">Box score</button>` : (opts && opts.today ? `<button class="btn sm${mine ? " primary" : ""}" data-fr="watch" data-id="${g.id}">${live ? "Resume" : "Watch"}</button>${opts.sim ? `<button class="btn sm" data-fr="simgame" data-id="${g.id}">Sim</button>` : ""}` : "");
  return `<div class="fr-game${mine ? " mine" : ""}${fin ? " fin" : ""}"><span class="tm">${tLogo(g.a, 22)}<b>${tAbbr(g.a)}</b></span><span class="sc">${score}</span><span class="tm">${tLogo(g.h, 22)}<b>${tAbbr(g.h)}</b></span><span class="act">${act}${fin && g.w ? `<i class="note">watched</i>` : ""}</span></div>`;
}
function frHomeHtml() {
  const F = FR;
  let main = "";
  if (F.phase === "season" || F.phase === "playoffs") {
    const today = frTodayGames(F);
    const left = (F.phase === "season" ? F.regDays : F.day + 1) - F.day;
    main = `<div class="panel"><div class="panel-h"><b>${F.phase === "playoffs" ? "Playoffs · " + (F.S.po.round === 1 ? "Semifinals" : "Final") + " · today" : "Day " + (F.day + 1) + " games"}</b><span class="note">Watch any game, or sim the day and see the results.</span></div>
      <div class="fr-games">${today.map(g => frGameRow(g, { today: true, sim: true })).join("") || `<p class="note" style="padding:10px 14px">No games today.</p>`}</div>
      <div class="fr-simbar"><button class="btn primary" data-fr="simday">${today.some(g => g.st !== "final") ? "Sim the day" : "Finish the day"}</button>
        ${F.phase === "season" ? `<button class="btn" data-fr="simn" data-v="7">Sim 7 days</button>${F.day < F.deadline ? `<button class="btn" data-fr="simto" data-v="deadline">Sim to the trade deadline</button>` : ""}<button class="btn" data-fr="simto" data-v="season">Sim to the playoffs</button>` : `<button class="btn" data-fr="simto" data-v="round">Sim this round</button><button class="btn" data-fr="simto" data-v="cup">Sim to the end</button>`}
        <label class="chk note"><input type="checkbox" id="frStopOffer"${F.settings.stopOnOffer !== false ? " checked" : ""}> Stop when a trade offer arrives</label></div></div>`;
    if (F.phase === "playoffs") main += frBracketHtml();
  } else if (F.phase === "done") {
    const h = F.history[0];
    main = `<div class="panel fr-champ" style="--tc:${esc(frTeam(h.champ).color)}">${tLogo(h.champ, 80)}<div><span class="note">Season ${h.season} champions</span><h3>${tName(h.champ)} win the Tracen Cup</h3><span class="note">over ${tName(h.ru)} in the final</span></div></div>
      ${frBracketHtml()}
      <div class="panel"><div class="panel-h"><b>Season awards</b></div><div class="fr-awards">${h.awards.map(a => `<div>${chibiHead(a.who, 46, frTeam(a.team))}<span><i>${esc(a.name)}</i><b>${esc(a.who)}</b><small>${tAbbr(a.team)} · ${esc(a.line)}</small></span></div>`).join("")}</div></div>
      <div class="fr-simbar"><button class="btn primary" data-fr="offseason">Start the offseason</button><span class="note">Players develop, contracts tick down a year, and expiring deals need decisions.</span></div>`;
  } else if (F.phase === "offseason") main = frOffseasonHtml();
  const offers = F.offers.length ? `<div class="panel"><div class="panel-h"><b>Trade offers</b><span class="note">Offers expire after a few days.</span></div>${F.offers.map(frOfferHtml).join("")}</div>` : "";
  const news = F.news.slice(0, 18).map(n => `<li class="${n.team === F.user ? "mine" : ""}"><span class="note">S${n.s} · ${n.d < 0 ? "Offseason" : "Day " + (n.d + 1)}</span>${esc(n.txt)}</li>`).join("");
  return `<div class="fr-home"><div class="fr-col">${main}${offers}</div>
    <div class="fr-col"><div class="panel"><div class="panel-h"><b>Standings</b><button class="btn sm" data-fr="tab" data-v="standings">Full table</button></div>${frMiniStandings()}</div>
    <div class="panel"><div class="panel-h"><b>League news</b></div><ul class="fr-news">${news || `<li class="note">Nothing yet.</li>`}</ul></div></div></div>`;
}
function frMiniStandings() {
  return `<table class="fr-tbl tight"><thead><tr><th></th><th>Team</th><th class="num">GP</th><th class="num">Rec</th><th class="num">PTS</th></tr></thead><tbody>${frStandings(FR).map((r, i) => `<tr class="${r.id === FR.user ? "me" : ""}${i === 3 ? " cut" : ""}"><td>${i + 1}</td><td>${tLogo(r.id)}${tAbbr(r.id)}</td><td class="num">${r.gp}</td><td class="num">${r.w}–${r.l}–${r.otl}</td><td class="num"><b>${r.pts}</b></td></tr>`).join("")}</tbody></table>`;
}
function frPlayerChip(p) { return `<span class="fr-chip">${chibiHead(p.name, 30)}<span><b>${esc(p.name)}</b><small>${p.pos} · ${overall(p)} OVR · ${money(p.con.sal)} × ${yrs(p.con.yrs)}${p.inj ? ` · <em class="bad">injured ${p.inj.g}g</em>` : ""}</small></span></span>`; }
function frOfferHtml(o) {
  const F = FR, give = o.get.map(frP).filter(Boolean), get = o.give.map(frP).filter(Boolean);
  const vGive = give.reduce((s, p) => s + tradeValue(p, F), 0), vGet = get.reduce((s, p) => s + tradeValue(p, F), 0);
  const capAfter = frPayroll(F, F.user) - give.reduce((s, p) => s + p.con.sal, 0) + get.reduce((s, p) => s + p.con.sal, 0);
  const verdict = vGet >= vGive * 1.05 ? "Good value for you" : vGet >= vGive * 0.92 ? "About even" : "They're getting the better end";
  return `<div class="fr-offer"><div class="fr-offer-h">${tLogo(o.from, 26)}<b>${tName(o.from)}</b><span class="note">expires after day ${o.exp + 1}</span></div>
    <div class="fr-offer-b"><div><i>You get</i>${get.map(frPlayerChip).join("")}</div><div><i>You give</i>${give.map(frPlayerChip).join("")}</div></div>
    <div class="fr-offer-f"><span class="note">${verdict} · your cap after: ${money(capAfter)} of ${money(F.cap)}</span><button class="btn primary" data-fr="accept" data-id="${o.id}">Accept</button><button class="btn" data-fr="decline" data-id="${o.id}">Decline</button></div></div>`;
}
function frBracketHtml() {
  const po = FR.S.po; if (!po) return "";
  const ser = s => `<div class="fr-ser${s.winner ? " done" : ""}"><div class="${s.winner === s.hi ? "w" : ""}"><span class="sd">${s.sh}</span>${tLogo(s.hi)}<b>${tName(s.hi)}</b><em>${s.w[0]}</em></div><div class="${s.winner === s.lo ? "w" : ""}"><span class="sd">${s.sl}</span>${tLogo(s.lo)}<b>${tName(s.lo)}</b><em>${s.w[1]}</em></div></div>`;
  const r1 = po.series.filter(s => s.round === 1), r2 = po.series.filter(s => s.round === 2);
  return `<div class="panel"><div class="panel-h"><b>Playoff bracket</b><span class="note">Best of ${FR.settings.series}</span></div><div class="fr-bracket"><div><i>Semifinals</i>${r1.map(ser).join("")}</div><div><i>Final</i>${r2.map(ser).join("") || `<div class="fr-ser tbd note">Winners meet here</div>`}</div></div></div>`;
}
function frOffseasonHtml() {
  const F = FR, o = F.off;
  const dev = o.dev.filter(d => { const p = frP(d.pid); return p && p.team === F.user; }).slice(0, 12).map(d => { const p = frP(d.pid); const up = d.to > d.from; return `<li>${chibiHead(p.name, 26)}<span>${esc(p.name)}</span><b class="${up ? "good" : "bad"}">${d.from} → ${d.to}</b></li>`; }).join("");
  if (o.step === "resign") {
    const ex = frExpiring(F);
    const rows = ex.map(p => {
      const y = frUi.signYrs[p.id] || askYears(p, F.season);
      const ra = frResignAsk(F, p, y), ask = ra.sal;
      return `<tr><td class="nm"><div class="pn">${chibiHead(p.name, 30)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${esc(p.name)}</b><small>${p.pos} · ${esc(p.style)}</small></span></div></td><td>${frOvr(p)}</td><td>${frWantsHtml(p, ra.deal)}</td><td class="num">${money(p.con.sal)}</td>
        <td><select data-fr-yrs="${esc(p.id)}" aria-label="Years">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === y ? " selected" : ""}>${yrs(n)}</option>`).join("")}</select></td><td class="num"><b>${money(ask)}</b>/yr</td>
        <td>${p.treq ? `<span class="note">Won't re-sign: she asked for a trade</span> ` : `<button class="btn sm primary" data-fr="resign" data-id="${esc(p.id)}">Re-sign</button>`}<button class="btn sm" data-fr="letgo" data-id="${esc(p.id)}">Let go</button></td></tr>`;
    }).join("");
    return `<div class="panel"><div class="panel-h"><b>Offseason · Re-sign your players</b>${frCapBar(frPayroll(F, F.user) - ex.reduce((s, p) => s + p.con.sal, 0), F.cap)}</div>
      ${ex.length ? `<div class="tscroll"><table class="fr-tbl"><thead><tr><th>Player</th><th>OVR</th><th>Wants</th><th class="num">Last deal</th><th>Length</th><th class="num">Asking</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="note" style="padding:10px 14px">No contracts to decide on. Anyone you didn't re-sign becomes a free agent.</p>`}
      <div class="fr-simbar"><button class="btn primary" data-fr="openfa">${ex.length ? "Let the rest go and open free agency" : "Open free agency"}</button></div></div>
      <div class="panel"><div class="panel-h"><b>How your players developed</b></div><ul class="fr-dev">${dev || `<li class="note">No changes on your roster.</li>`}</ul></div>`;
  }
  const issues = frRosterCheck(F, F.user);
  return `<div class="panel"><div class="panel-h"><b>Offseason · Free agency, day ${o.faDay}</b><span class="note">Other clubs sign players each day. Sign yours from the Free agents tab.</span></div>
    <div class="fr-simbar"><button class="btn" data-fr="faday">Next free-agency day</button><button class="btn" data-fr="tab" data-v="fa">Browse free agents</button><button class="btn primary" data-fr="nextseason">Start season ${F.season}</button></div>
    ${issues.length ? `<p class="fr-warn">Your roster ${esc(issues.join("; "))}. Starting the season will sign the cheapest free agents needed to fill the gaps.</p>` : ""}</div>
    <div class="panel"><div class="panel-h"><b>How your players developed</b></div><ul class="fr-dev">${dev || `<li class="note">No changes on your roster.</li>`}</ul></div>`;
}
function frScheduleHtml() {
  const F = FR, S = F.S;
  const days = S.days.map((ids, d) => {
    const gs = ids.map(id => frGame(F, id)).filter(g => !frUi.schedMine || g.h === F.user || g.a === F.user);
    if (!gs.length) return "";
    const today = d === F.day && (F.phase === "season" || F.phase === "playoffs");
    const label = d < F.regDays ? "Day " + (d + 1) : "Playoffs · day " + (d - F.regDays + 1);
    return `<div class="fr-day${today ? " today" : ""}"><div class="fr-day-h">${label}${today ? ` <i>Today</i>` : ""}</div>${gs.map(g => frGameRow(g, { today })).join("")}</div>`;
  }).join("");
  return `<div class="panel"><div class="panel-h"><b>Schedule &amp; results</b><label class="chk"><input type="checkbox" data-fr-chk="schedMine"${frUi.schedMine ? " checked" : ""}> Only my games</label></div><div class="fr-sched">${days}</div></div>`;
}
function frStandingsHtml() {
  const rows = frStandings(FR).map((r, i) => `<tr class="${r.id === FR.user ? "me" : ""}${i === 3 ? " cut" : ""}"><td>${i + 1}</td><td class="tn"><div class="pn">${tLogo(r.id)}<b>${tName(r.id)}</b></div></td><td class="num">${r.gp}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${r.otl}</td><td class="num"><b>${r.pts}</b></td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td class="num">${r.home.join("-")}</td><td class="num">${r.away.join("-")}</td><td>${r.l10.filter(x => x === "W").length}-${r.l10.filter(x => x === "L").length}-${r.l10.filter(x => x === "O").length}</td><td>${r.strk}</td></tr>`).join("");
  return `<div class="panel"><div class="panel-h"><b>Standings</b><span class="note">Two points for a win, one for an overtime or shootout loss. The top four make the playoffs.</span></div>
    <div class="tscroll"><table class="fr-tbl"><thead><tr><th></th><th>Team</th><th class="num">GP</th><th class="num">W</th><th class="num">L</th><th class="num">OTL</th><th class="num">PTS</th><th class="num">GF</th><th class="num">GA</th><th class="num">DIFF</th><th class="num">Home</th><th class="num">Away</th><th>L10</th><th>Streak</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
const FR_SK_COLS = [["gp", "GP"], ["g", "G"], ["a", "A"], ["pts", "P"], ["pm", "+/-"], ["pim", "PIM"], ["sog", "SOG"], ["shp", "SH%"], ["ppg", "PPG"], ["ppp", "PPP"], ["shg", "SHG"], ["shp2", "SHP"], ["gwg", "GWG"], ["hit", "HIT"], ["blk", "BLK"], ["toi", "TOI/G"]];
const FR_G_COLS = [["gp", "GP"], ["gs", "GS"], ["w", "W"], ["l", "L"], ["otl", "OTL"], ["sa", "SA"], ["sv", "SV"], ["ga", "GA"], ["svp", "SV%"], ["gaa", "GAA"], ["so", "SO"]];
function frStatVal(s, k) {
  if (k === "pts") return s.g + s.a; if (k === "ppp") return (s.ppg || 0) + (s.ppa || 0); if (k === "shp2") return (s.shg || 0) + (s.sha || 0); if (k === "shp") return s.sog ? s.g / s.sog : 0; if (k === "toi") return s.gp ? s.toi / s.gp : 0;
  if (k === "svp") return s.sa ? s.sv / s.sa : 0; if (k === "gaa") return s.toi ? s.ga * 3600 / s.toi : 0; return s[k] || 0;
}
function frStatFmt(s, k) { const v = frStatVal(s, k); if (k === "shp") return s.sog ? (v * 100).toFixed(1) : "–"; if (k === "toi") return fmtToi(v); if (k === "svp") return s.sa ? v.toFixed(3).replace(/^0/, "") : "–"; if (k === "gaa") return s.toi ? v.toFixed(2) : "–"; if (k === "pm") return (v > 0 ? "+" : "") + v; return v; }
function frTeamStatsHtml() {
  const F = FR, po = frUi.stPo;
  const cols = [["gp", "GP"], ["gfpg", "GF/GP"], ["gapg", "GA/GP"], ["sfpg", "SF/GP"], ["sapg", "SA/GP"], ["pp", "PP"], ["ppPct", "PP%"], ["pk", "PK"], ["pkPct", "PK%"], ["shg", "SHG"], ["pimpg", "PIM/GP"], ["so", "SO"]];
  const rows = F.teams.map(t => { const r = frTeamStats(F, t.id, po), g = Math.max(1, r.gp);
    return { t, r, v: { gp: r.gp, gfpg: r.gf / g, gapg: r.ga / g, sfpg: r.sf / g, sapg: r.sa / g, pp: r.ppg, ppPct: r.ppPct, pk: r.tsh - r.ppga, pkPct: r.pkPct, shg: r.shg, pimpg: r.pim / g, so: r.so } }; });
  const k = cols.some(c => c[0] === frUi.stSort) ? frUi.stSort : "ppPct", asc = ["gapg", "sapg", "pimpg"].includes(k);
  rows.sort((a, b) => (asc ? 1 : -1) * (a.v[k] - b.v[k]));
  const fmt = (r, c) => c === "ppPct" || c === "pkPct" ? (r.v[c] * 100).toFixed(1) + "%" : c === "pp" ? r.r.ppg + "/" + r.r.ppo : c === "pk" ? (r.r.tsh - r.r.ppga) + "/" + r.r.tsh : /pg$/.test(c) ? r.v[c].toFixed(2) : r.v[c];
  return `<div class="tscroll"><table class="fr-tbl frstats"><thead><tr><th></th><th>Team</th>${cols.map(([c, l]) => `<th class="num"><button data-fr="sort" data-v="${c}" aria-pressed="${c === k}">${l}</button></th>`).join("")}</tr></thead>
    <tbody>${rows.map((x, i) => `<tr class="${x.t.id === F.user ? "me" : ""}"><td>${i + 1}</td><td class="tn"><div class="pn">${tLogo(x.t.id)}<b>${esc(x.t.name)}</b></div></td>${cols.map(([c]) => `<td class="num${c === k ? " on" : ""}">${fmt(x, c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function frStatsHtml() {
  const F = FR, src = frUi.stPo ? F.S.pstats : F.S.stats, gk = frUi.stKind === "g", tm = frUi.stKind === "t";
  let list = Object.entries(src).map(([pid, s]) => ({ p: frP(pid), s })).filter(x => x.p && (posGroup(x.p) === "G") === gk && x.s.gp > 0);
  if (frUi.stTeam !== "ALL") list = list.filter(x => x.s.team === frUi.stTeam);
  const cols = gk ? FR_G_COLS : FR_SK_COLS;
  const k = cols.some(c => c[0] === frUi.stSort) ? frUi.stSort : gk ? "w" : "pts";
  const asc = k === "gaa";
  const minGs = gk && (k === "svp" || k === "gaa") ? Math.max(1, Math.floor(Math.max(...list.map(x => x.s.gs || 0), 0) * 0.3)) : 0;
  list = list.filter(x => !minGs || x.s.gs >= minGs).sort((a, b) => (asc ? 1 : -1) * (frStatVal(a.s, k) - frStatVal(b.s, k)) || (b.s.g + b.s.a) - (a.s.g + a.s.a));
  const leaders = (lab, key, fmt, g) => { const arr = Object.entries(F.S.stats).map(([pid, s]) => ({ p: frP(pid), s })).filter(x => x.p && (posGroup(x.p) === "G") === !!g && (!g || x.s.gs >= Math.max(1, F.day * 0.3))).sort((a, b) => (key === "gaa" ? 1 : -1) * (frStatVal(a.s, key) - frStatVal(b.s, key))).slice(0, 3);
    return `<div class="fr-lead"><i>${lab}</i>${arr.map((x, i) => `<div class="${i ? "" : "top"}">${i ? "" : chibiHead(x.p.name, 40, frTeam(x.s.team))}<span><b>${esc(x.p.name)}</b><small>${tAbbr(x.s.team)}</small></span><em>${fmt(x.s)}</em></div>`).join("") || `<span class="note">–</span>`}</div>`; };
  const head = cols.map(([c, l]) => `<th class="num"><button data-fr="sort" data-v="${c}" aria-pressed="${c === k}">${l}</button></th>`).join("");
  const rows = list.slice(0, 80).map((x, i) => `<tr class="${x.s.team === F.user ? "me" : ""}"><td>${i + 1}</td><td class="nm"><div class="pn">${chibiHead(x.p.name, 26)}<span><b>${esc(x.p.name)}</b><small>${x.p.pos} · ${tAbbr(x.s.team)}</small></span></div></td>${cols.map(([c]) => `<td class="num${c === k ? " on" : ""}">${frStatFmt(x.s, c)}</td>`).join("")}</tr>`).join("");
  const teamOpts = `<option value="ALL">All teams</option>` + F.teams.map(t => `<option value="${esc(t.id)}"${frUi.stTeam === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("");
  return `${frUi.stPo ? "" : `<div class="fr-leaders">${leaders("Points", "pts", s => s.g + s.a)}${leaders("Goals", "g", s => s.g)}${leaders("Assists", "a", s => s.a)}${leaders("Plus/minus", "pm", s => (s.pm > 0 ? "+" : "") + s.pm)}${leaders("Save %", "svp", s => frStatFmt(s, "svp"), true)}${leaders("Wins", "w", s => s.w, true)}</div>`}
    <div class="panel"><div class="panel-h"><div class="seg"><button data-fr="stkind" data-v="sk" aria-pressed="${!gk && !tm}">Skaters</button><button data-fr="stkind" data-v="g" aria-pressed="${gk}">Goalies</button><button data-fr="stkind" data-v="t" aria-pressed="${tm}">Teams</button></div>
      <div class="seg"><button data-fr="stpo" data-v="0" aria-pressed="${!frUi.stPo}">Regular season</button><button data-fr="stpo" data-v="1" aria-pressed="${frUi.stPo}">Playoffs</button></div>
      ${tm ? `<span class="note">Power play and penalty kill include every game, watched or simmed.</span></div>${frTeamStatsHtml()}</div>` : `<select data-fr-sel="stTeam" aria-label="Team">${teamOpts}</select>${minGs ? `<span class="note">Min ${minGs} starts</span>` : ""}</div>
      <div class="tscroll lim"><table class="fr-tbl frstats"><thead><tr><th></th><th>Player</th>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${cols.length + 2}" class="note">No games played yet.</td></tr>`}</tbody></table></div></div>`}`;
}
function frRosterHtml() {
  const F = FR, tid = frUi.rosterTeam || F.user, mine = tid === F.user, t = frTeam(tid);
  const ps = F.players.filter(p => p.team === tid).sort((a, b) => ({ F: 0, D: 1, G: 2 })[posGroup(a)] - ({ F: 0, D: 1, G: 2 })[posGroup(b)] || (a.line || 9) - (b.line || 9) || overall(b) - overall(a));
  const S = F.S.stats;
  const role = p => p.inj ? `<em class="bad">Out ${p.inj.g} game${p.inj.g > 1 ? "s" : ""} · ${esc(p.inj.what)}</em>` : posGroup(p) === "G" ? (p.line === 1 ? "Starter" : p.line === 2 ? "Backup" : "Extra") : p.line ? (posGroup(p) === "D" ? "Pair " : "Line ") + p.line : "Extra";
  const rows = ps.map(p => { const s = S[p.id] || frBlank(); const g = posGroup(p) === "G";
    return `<tr><td class="nm"><div class="pn">${chibiHead(p.name, 30, t)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${p.md != null ? moodBadge(moodLevel(p.md)) + " " : ""}${esc(p.name)}</b><small>${esc(p.style)} · ${esc(persInfo(p).a)}</small></span></div></td><td>${p.pos}</td><td>${frOvr(p)}</td><td>${role(p)}${p.treq ? ` <em class="fr-tagv">Trade request</em>` : p.unhW ? ` <em class="fr-tagv" title="She wants a bigger role">Unhappy</em>` : ""}</td><td class="num">${money(p.con.sal)}</td><td class="num">${yrs(p.con.yrs)}</td>
      <td class="num">${s.gp}</td><td class="num">${g ? s.w + "-" + s.l + "-" + s.otl : s.g}</td><td class="num">${g ? frStatFmt(s, "svp") : s.a}</td><td class="num">${g ? frStatFmt(s, "gaa") : s.g + s.a}</td>
      ${mine ? `<td><button class="btn sm danger" data-fr="release" data-id="${esc(p.id)}">Release</button></td>` : ""}</tr>`; }).join("");
  const opts = F.teams.map(x => `<option value="${esc(x.id)}"${x.id === tid ? " selected" : ""}>${esc(x.name)}${x.id === F.user ? " (you)" : ""}</option>`).join("");
  const dead = (t.dead || []).map(d => `${esc(d.name)} ${money(d.amt)} (${yrs(d.yrs)})`).join(", ");
  const issues = frRosterCheck(F, tid);
  const rot = t.gRot ?? 4;
  return `<div class="panel"><div class="panel-h"><select data-fr-sel="rosterTeam" aria-label="Team">${opts}</select>${frCapBar(frPayroll(F, tid), F.cap)}<span class="note">${ps.length}/${FR_RULES.maxRoster} players</span></div>
    ${issues.length ? `<p class="fr-warn">This roster ${esc(issues.join("; "))}.</p>` : ""}
    ${dead ? `<p class="note" style="padding:0 14px">Dead cap: ${dead}</p>` : ""}
    <div class="tscroll"><table class="fr-tbl"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Role</th><th class="num">Salary</th><th class="num">Term</th><th class="num">GP</th><th class="num">G / Rec</th><th class="num">A / SV%</th><th class="num">P / GAA</th>${mine ? "<th></th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div>
    ${mine ? `<div class="fr-simbar"><label class="note">Backup goalie starts <select data-fr-sel="gRot">${[[0, "never"], [5, "every 5th game"], [4, "every 4th game"], [3, "every 3rd game"], [2, "every other game"]].map(([v, l]) => `<option value="${v}"${v === rot ? " selected" : ""}>${l}</option>`).join("")}</select></label><span class="note">Releasing a player keeps half her salary on your cap for the rest of her deal.</span></div>` : ""}</div>`;
}
function frLinesHtml() {
  return `<div class="panel"><div class="panel-h"><b>Lines, tactics &amp; special teams</b><label class="chk"><input type="checkbox" data-fr-chk="autoLines"${FR.settings.autoLines ? " checked" : ""}> Set my lines automatically every day</label><button class="btn sm" data-fr="relines">Auto-set lines now</button></div>
    <p class="note" style="padding:0 14px">Injured players are left out. If you edit a slot, automatic lines turn off so your choices stick. Empty slots are filled from your extras on game day.</p>
    <div class="fr-coachset"><b>Behind the bench</b><span class="note">For games you watch. Every option can also be changed during the game.</span>${frCoachSelects("data-fr-sel")}</div></div>
    <div class="lines-grid" id="frLinesGrid"></div>`;
}
function frLinesCtx() {
  if (!FR) return qpLinesCtx();
  const L = { teams: FR.teams, players: FR.players.filter(p => !p.inj), fam: FR.fam || null };
  frUi.open.add(FR.user);
  return { grid: $("#frLinesGrid"), L, teams: FR.teams.filter(t => t.id === FR.user), open: frUi.open, save: kind => { if (kind === "lines" && FR.settings.autoLines) { FR.settings.autoLines = false; const c = document.querySelector('[data-fr-chk="autoLines"]'); if (c) c.checked = false; } frSave(); } };
}
function frTradesHtml() {
  const F = FR, T = frUi.trade;
  const closed = F.phase === "playoffs" || (F.phase === "season" && F.day > F.deadline) || F.phase === "done";
  const ai = F.teams.filter(t => t.id !== F.user);
  if (!T.team || !frTeam(T.team) || T.team === F.user) T.team = ai[0].id;
  const list = (tid, set, side) => F.players.filter(p => p.team === tid).sort((a, b) => ({ F: 0, D: 1, G: 2 })[posGroup(a)] - ({ F: 0, D: 1, G: 2 })[posGroup(b)] || overall(b) - overall(a)).map(p => `<label class="fr-tp${set.has(p.id) ? " on" : ""}"><input type="checkbox" data-fr-tp="${side}" value="${esc(p.id)}"${set.has(p.id) ? " checked" : ""}>${chibiHead(p.name, 28)}<span><b>${esc(p.name)}</b><small>${p.pos} · ${overall(p)} · ${money(p.con.sal)} × ${yrs(p.con.yrs)}${p.inj ? " · inj" : ""}</small></span></label>`).join("");
  const give = [...T.mine].map(frP).filter(p => p && p.team === F.user), get = [...T.theirs].map(frP).filter(p => p && p.team === T.team);
  const meter = give.length || get.length ? frTradeMeter(F, T.team, give, get) : null;
  const mtxt = meter == null ? "Pick players on both sides." : meter >= 0.5 ? "They like this deal." : meter >= 0 ? "They'd probably say yes." : meter > -1 ? "Close. A little more would do it." : meter > -3 ? "They'd want noticeably more." : "Not interested.";
  const capMe = frPayroll(F, F.user) - give.reduce((s, p) => s + p.con.sal, 0) + get.reduce((s, p) => s + p.con.sal, 0);
  const capThem = frPayroll(F, T.team) + give.reduce((s, p) => s + p.con.sal, 0) - get.reduce((s, p) => s + p.con.sal, 0);
  const pct = meter == null ? 0 : Math.max(4, Math.min(100, 50 + meter * 12));
  const opts = ai.map(t => `<option value="${esc(t.id)}"${t.id === T.team ? " selected" : ""}>${esc(t.name)}</option>`).join("");
  return `${F.offers.length ? `<div class="panel"><div class="panel-h"><b>Offers for you</b></div>${F.offers.map(frOfferHtml).join("")}</div>` : ""}
    <div class="panel"><div class="panel-h"><b>Build a trade</b><select data-fr-sel="tradeTeam" aria-label="Trade partner">${opts}</select><span class="note">${closed ? "Trading is closed until the offseason." : F.phase === "season" ? "Trade deadline: after day " + (F.deadline + 1) + "." : "The offseason is open for trades."}</span></div>
      <div class="fr-trade"><div><div class="sec-h">${tName(F.user)} give</div><div class="fr-tlist">${list(F.user, T.mine, "mine")}</div></div>
        <div><div class="sec-h">${tName(T.team)} give</div><div class="fr-tlist">${list(T.team, T.theirs, "theirs")}</div></div></div>
      <div class="fr-tsum"><div class="fr-meter"><i style="width:${pct}%"></i></div><b>${mtxt}</b><span class="note">Your cap after: ${money(capMe)} · Theirs: ${money(capThem)} (cap ${money(F.cap)})</span>
        <button class="btn primary" data-fr="propose"${closed || meter == null ? " disabled" : ""}>Propose trade</button><button class="btn" data-fr="tclear">Clear</button></div>
      ${T.msg ? `<p class="fr-msg${T.ok ? " ok" : ""}">${esc(T.msg)}</p>` : ""}</div>`;
}
function frFaHtml() {
  const F = FR, fa = F.players.filter(p => p.team === "FA").sort((a, b) => overall(b) - overall(a));
  const off = F.phase === "offseason";
  const rows = fa.map(p => {
    const ask = frAsk(F, p), y = off ? (frUi.signYrs[p.id] || ask.yrs) : 1;
    const sel = off ? `<select data-fr-yrs="${esc(p.id)}" aria-label="Years">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === y ? " selected" : ""}>${yrs(n)}</option>`).join("")}</select>` : "1 yr";
    return `<tr><td class="nm"><div class="pn">${chibiHead(p.name, 30)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0"><b>${esc(p.name)}</b><small>${esc(p.style)}</small></span></div></td><td>${p.pos}</td><td>${frOvr(p)}</td><td class="rts">${frRatingsCell(p)}</td><td>${p.inj ? `<em class="bad">inj ${p.inj.g}g</em>` : ""}</td><td>${frWantsHtml(p, ask.deal)}</td><td class="num"><b>${money(ask.sal)}</b></td><td>${sel}</td>
      <td><button class="btn sm primary" data-fr="sign" data-id="${esc(p.id)}"${F.phase === "playoffs" || F.phase === "done" ? " disabled" : ""}>Sign</button></td></tr>`;
  }).join("");
  return `<div class="panel"><div class="panel-h"><b>Free agents · ${fa.length}</b>${frCapBar(frPayroll(F, F.user), F.cap)}<span class="note">${F.players.filter(p => p.team === F.user).length}/${FR_RULES.maxRoster} on your roster</span></div>
    <p class="note" style="padding:0 14px">${off ? "Offseason deals can run up to five years." : "During the season, free agents sign one-year deals at a discount."}</p>
    <div class="tscroll lim"><table class="fr-tbl"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th class="rcol">Ratings</th><th></th><th>Wants</th><th class="num">Asking</th><th>Term</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="note">No free agents right now.</td></tr>`}</tbody></table></div></div>`;
}
function frHistoryHtml() {
  const F = FR;
  const rows = F.history.map(h => `<div class="panel fr-hist"><div class="panel-h">${tLogo(h.champ, 30)}<b>Season ${h.season}: ${tName(h.champ)}</b><span class="note">beat ${tName(h.ru)} in the final</span></div>
    <div class="fr-awards">${h.awards.map(a => `<div>${chibiHead(a.who, 36, frTeam(a.team))}<span><i>${esc(a.name)}</i><b>${esc(a.who)}</b><small>${tAbbr(a.team)} · ${esc(a.line)}</small></span></div>`).join("")}</div>
    <p class="note" style="padding:0 14px 10px">Final standings: ${h.standings.map((r, i) => (i + 1) + ". " + tAbbr(r[0]) + " " + r[4]).join(" · ")}</p></div>`).join("");
  return rows || `<div class="panel"><p class="note" style="padding:12px 14px">Champions and award winners will be listed here after each season.</p></div>`;
}
function frBoxHtml(g) {
  const F = FR, nm = id => { const p = frP(id); return p ? esc(p.name) : "?"; };
  const per = p => p <= 3 ? periodName(p) : p === 4 ? "OT" : (p - 3) + "OT";
  const goals = (g.goals || []).map(x => `<li><span class="note">${per(x[4])} ${fmtClock(x[5])}</span>${tLogo(g[x[0] === 0 ? "h" : "a"], 18)}<b>${nm(x[1])}</b>${x[6] ? ` <em>${x[6]}</em>` : ""}<small>${x[2] ? "Assists: " + nm(x[2]) + (x[3] ? ", " + nm(x[3]) : "") : "Unassisted"}</small></li>`).join("");
  const gl = (g.gids || []).map((id, i) => id ? `${tAbbr(i ? g.a : g.h)}: ${nm(id)}` : "").filter(Boolean).join(" · ");
  return `<h2 id="frBoxTitle">${tName(g.a)} ${g.as} @ ${tName(g.h)} ${g.hs}${g.dec !== "REG" ? " (" + g.dec + ")" : ""}</h2>
    <p class="note">${g.po ? "Playoff game " + g.gn : "Day " + (g.d + 1)} · Shots ${tAbbr(g.a)} ${g.sog[1]}, ${tAbbr(g.h)} ${g.sog[0]} · Goalies ${gl}${g.w ? " · watched live" : ""}</p>
    <ul class="fr-goals">${goals || `<li class="note">No goals.</li>`}</ul>`;
}


// ---------- media ----------
const FR_KINDS = [["all", "All"], ["media", "About you"], ["trade", "Trades"], ["sign", "Signings"], ["injury", "Injuries"], ["milestone", "Milestones"], ["training", "Training"], ["playoffs", "Playoffs"]];
function frMediaHtml() {
  const F = FR, pr = frPowerRanks(F), prev = F.prPrev && F.prPrev.ranks, sk = frStreaks(F);
  const leaders = Object.entries(F.S.stats).map(([pid, s]) => ({ p: frP(pid), s })).filter(x => x.p && posGroup(x.p) !== "G").sort((a, b) => (b.s.g + b.s.a) - (a.s.g + a.s.a) || b.s.g - a.s.g);
  const stories = [];
  const story = (kick, head, sub, pic) => stories.push({ kick, head, sub, pic });
  const st = frStandings(F);
  if (pr[0] && st[0] && st[0].gp) story("Power rankings", tName(pr[0].id) + " are the team to beat", "Number one this week at " + pr[0].rec + (pr[0].gd ? ", " + (pr[0].gd > 0 ? "+" : "") + pr[0].gd + " goal differential" : "") + ".", tLogo(pr[0].id, 46));
  const runT = st.filter(r => /^W\d/.test(r.strk) && +r.strk.slice(1) >= 3).sort((a, b) => +b.strk.slice(1) - +a.strk.slice(1))[0];
  if (runT) story("Hot streak", tName(runT.id) + " have won " + runT.strk.slice(1) + " straight", "Their record is up to " + runT.w + "–" + runT.l + "–" + runT.otl + ".", tLogo(runT.id, 46));
  const skid = st.filter(r => /^L\d/.test(r.strk) && +r.strk.slice(1) >= 4).sort((a, b) => +b.strk.slice(1) - +a.strk.slice(1))[0];
  if (skid) story("Slump", tName(skid.id) + " have dropped " + skid.strk.slice(1) + " in a row", "Something has to change for the " + tAbbr(skid.id) + ".", tLogo(skid.id, 46));
  if (sk.hot[0] && sk.hot[0].v >= 5) { const x = sk.hot[0]; story("On fire", esc(x.p.name) + " has " + x.v + " points in her last " + x.n + " games", tName(x.p.team) + " can't keep her off the scoresheet.", chibiHead(x.p.name, 46, frTeam(x.p.team))); }
  if (sk.streak[0] && sk.streak[0].v >= 4) { const x = sk.streak[0]; story("Point streak", esc(x.p.name) + " has a point in " + x.v + " straight games", "Longest active streak in the league.", chibiHead(x.p.name, 46, frTeam(x.p.team))); }
  if (leaders[0] && leaders[0].s.gp >= 3) { const x = leaders[0]; story("Scoring race", esc(x.p.name) + " leads the league with " + (x.s.g + x.s.a) + " points", x.s.g + " goals and " + x.s.a + " assists for " + tName(x.s.team) + ".", chibiHead(x.p.name, 46, frTeam(x.s.team))); }
  if (sk.goalies[0] && sk.goalies[0].v >= 0.94) { const x = sk.goalies[0]; story("Brick wall", esc(x.p.name) + " is stopping " + x.v.toFixed(3).replace(/^0/, "") + " of shots", "Over her last " + x.n + " starts for " + tName(x.p.team) + ".", chibiHead(x.p.name, 46, frTeam(x.p.team))); }
  const trade = F.news.find(n => n.k === "trade" && n.s === F.season && F.day - n.d <= 7);
  if (trade) story("Trade", "A deal goes down", esc(trade.txt.replace(/^Trade: /, "")), "");
  const hurt = F.players.filter(p => p.inj && p.inj.g >= 8 && F.teams.some(t => t.id === p.team)).sort((a, b) => overall(b) - overall(a))[0];
  if (hurt) story("Injury", esc(hurt.name) + " is out " + hurt.inj.g + " games", tName(hurt.team) + " lose her to a " + esc(hurt.inj.what) + ".", chibiHead(hurt.name, 46, frTeam(hurt.team)));
  const cards = stories.slice(0, 6).map(x => `<div class="fr-story">${x.pic ? `<span class="pic">${x.pic}</span>` : ""}<div><i>${esc(x.kick)}</i><b>${x.head}</b><span>${x.sub}</span></div></div>`).join("");
  const prRows = pr.map((r, i) => {
    const was = prev ? prev.indexOf(r.id) : -1, mv = was < 0 ? 0 : was - i;
    const top = leaders.find(x => x.s.team === r.id);
    const l10 = st.find(x => x.id === r.id);
    const blurb = !l10 || !l10.gp ? "Season about to start." : (l10.l10.filter(x => x === "W").length + " wins in the last " + l10.l10.length) + (top ? " · " + esc(top.p.name) + " leads with " + (top.s.g + top.s.a) + " pts" : "") + " · PP " + (r.ts.ppPct * 100).toFixed(0) + "%, PK " + (r.ts.pkPct * 100).toFixed(0) + "%";
    return `<tr class="${r.id === F.user ? "me" : ""}"><td class="num"><b>${i + 1}</b></td><td><span class="mv ${mv > 0 ? "up" : mv < 0 ? "dn" : ""}">${mv > 0 ? "▲" + mv : mv < 0 ? "▼" + -mv : "–"}</span></td><td class="tn"><div class="pn">${tLogo(r.id)}<span><b>${tName(r.id)}</b><small>${r.rec} · ${esc(blurb)}</small></span></div></td></tr>`;
  }).join("");
  const li = (arr, f) => arr.length ? arr.map(f).join("") : `<li class="note">Nobody yet.</li>`;
  const hot = li(sk.hot.slice(0, 5), x => `<li>${chibiHead(x.p.name, 26)}<span>${esc(x.p.name)} <small>${tAbbr(x.p.team)}</small></span><b>${x.v} pts / ${x.n} gp</b></li>`);
  const streak = li(sk.streak.slice(0, 4), x => `<li>${chibiHead(x.p.name, 26)}<span>${esc(x.p.name)} <small>${tAbbr(x.p.team)}</small></span><b>${x.v} games</b></li>`);
  const cold = li(sk.cold.slice(0, 4), x => `<li>${chibiHead(x.p.name, 26)}<span>${esc(x.p.name)} <small>${tAbbr(x.p.team)}</small></span><b class="bad">0 pts / ${x.n} gp</b></li>`);
  const gl = li(sk.goalies.slice(0, 3), x => `<li>${chibiHead(x.p.name, 26)}<span>${esc(x.p.name)} <small>${tAbbr(x.p.team)}</small></span><b>${x.v.toFixed(3).replace(/^0/, "")} · ${x.n} starts</b></li>`);
  const inj = li(F.players.filter(p => p.inj && F.teams.some(t => t.id === p.team)).sort((a, b) => b.inj.g - a.inj.g), p => `<li>${tLogo(p.team, 18)}<span>${esc(p.name)} <small>${p.pos} · ${esc(p.inj.what)}</small></span><b class="${p.inj.g >= 10 ? "bad" : ""}">${p.inj.g} gm</b></li>`);
  const mf = frUi.mf || "all";
  const wire = F.news.filter(n => mf === "all" || (n.k || frNewsKind(n.txt)) === mf).slice(0, 40).map(n => `<li class="${n.team === F.user ? "mine" : ""}"><span class="note">S${n.s} · ${n.d < 0 ? "Offseason" : "Day " + (n.d + 1)} · ${esc((FR_KINDS.find(k => k[0] === (n.k || frNewsKind(n.txt))) || ["", "League"])[1])}</span>${esc(n.txt)}</li>`).join("");
  return `<div class="fr-stories">${cards || `<div class="fr-story"><div><i>Preseason</i><b>The season is about to begin</b><span>Stories show up here once games are played.</span></div></div>`}</div>
    <div class="fr-home"><div class="fr-col">
      <div class="panel"><div class="panel-h"><b>Power rankings</b><span class="note">${prev ? "Arrows show the change since day " + F.prPrev.day + "." : "Updated every 7 days."}</span></div><table class="fr-tbl pr"><tbody>${prRows}</tbody></table></div>
      <div class="panel"><div class="panel-h"><b>News wire</b><div class="seg sm">${FR_KINDS.filter(k => k[0] !== "media" || F.mode === "bap").map(([k, l]) => `<button data-fr="mfilter" data-v="${k}" aria-pressed="${mf === k}">${l}</button>`).join("")}</div></div><ul class="fr-news">${wire || `<li class="note">Nothing here yet.</li>`}</ul></div>
    </div><div class="fr-col">
      <div class="panel"><div class="panel-h"><b>Hot: last 5 games</b></div><ul class="fr-list">${hot}</ul><div class="sec-h">Point streaks</div><ul class="fr-list">${streak}</ul><div class="sec-h">Cold</div><ul class="fr-list">${cold}</ul><div class="sec-h">Goalies, last 3 starts</div><ul class="fr-list">${gl}</ul></div>
      <div class="panel"><div class="panel-h"><b>Injury report</b></div><ul class="fr-list">${inj}</ul></div>
    </div></div>`;
}

// ---------- training ----------
function frTrainingHtml() {
  const F = FR, t = frTeam(F.user), inten = t.train || "normal";
  const ps = F.players.filter(p => p.team === F.user).sort((a, b) => ({ F: 0, D: 1, G: 2 })[posGroup(a)] - ({ F: 0, D: 1, G: 2 })[posGroup(b)] || overall(b) - overall(a));
  const rows = ps.map(p => {
    const k = frFocusOf(p), v = Number(p[k] ?? 0), prog = Math.min(1, (p.tp && p.tp[k]) || 0), gain = frTrainGain(F, p);
    const opts = `<option value=""${!p.tf ? " selected" : ""}>Auto · ${TRAIN_NAMES[frAutoFocus(p)]}</option>` + TRAIN_KEYS[posGroup(p)].map(x => `<option value="${x}"${p.tf === x ? " selected" : ""}>${TRAIN_NAMES[x]} (${p[x] ?? "–"})</option>`).join("");
    const pot = frPotential(p);
    return `<tr><td class="nm"><div class="pn">${chibiHead(p.name, 30, t)}<span><b>${esc(p.name)}</b><small>${p.pos} · ${esc(p.style)}</small></span></div></td><td>${frOvr(p)}</td><td><span class="pot ${pot.toLowerCase()}">${pot}</span></td>
      <td><select data-fr-tf="${esc(p.id)}" aria-label="Training focus for ${esc(p.name)}">${opts}</select></td>
      <td class="num"><b>${v}</b></td><td><div class="fr-prog" title="${Math.round(prog * 100)}% to the next point"><i style="width:${(prog * 100).toFixed(0)}%"></i></div></td><td class="num note">${p.inj ? "injured" : "~" + Math.max(1, Math.ceil((1 - prog) / Math.max(0.05, gain))) + " wk"}</td></tr>`;
  }).join("");
  const seg = [["light", "Light"], ["normal", "Normal"], ["hard", "Hard"]].map(([k, l]) => `<button data-fr="tint" data-v="${k}" aria-pressed="${inten === k}">${l}</button>`).join("");
  return `${frMoodPanelHtml()}${frChemPanelHtml()}<div class="panel"><div class="panel-h"><b>Training</b><div class="seg">${seg}</div><span class="note">${inten === "hard" ? "Faster progress, but players can get hurt in practice." : inten === "light" ? "Slower progress, no practice injuries." : "Steady progress."} Ratings tick up once a week during the season.</span></div>
    <p class="note" style="padding:0 14px">Each player works on one skill. Auto picks the weakest skill that matters for her style. Higher potential and lower ratings improve faster. The other clubs train too.</p>
    <div class="tscroll"><table class="fr-tbl"><thead><tr><th>Player</th><th>OVR</th><th>Potential</th><th>Focus</th><th class="num">Now</th><th>Next point</th><th class="num">ETA</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// what a player cares about, and how that moves her price with you
function frWantsHtml(p, deal) {
  const pe = persInfo(p), net = deal ? Math.round((deal.m - 1) * 100) : 0;
  const tip = (deal && deal.why.length ? frDealText(deal) + ". " : "") + (PRI_HELP[pe.p1] || "");
  return `<span class="fr-wants" title="${esc(tip)}"><span class="pc-tag">${esc(pe.p1)}</span><span class="pc-tag sub">${esc(pe.p2)}</span>${net ? `<small class="${net < 0 ? "good" : "bad"}">${net > 0 ? "+" : "−"}${Math.abs(net)}%</small>` : ""}</span>`;
}

// ---------- the locker room: everyone's mood and why ----------
function frMoodPanelHtml() {
  const F = FR, ms = frMoodSummary(F, F.user), t = frTeam(F.user), n = ms.ps.length || 1;
  const bars = [2, 1, 0, -1, -2].map(l => { const m = MOODS[String(l)], k = ms.c[l]; return `<div class="fr-moodbar m-${m.k}" style="flex:${Math.max(k, 0.0001)}" title="${m.name}: ${k}">${k ? moodBadge(l) + " " + k : ""}</div>`; }).join("");
  const low = ms.ps.filter(p => moodLevel(p.md) < 0).sort((a, b) => a.md - b.md).slice(0, 4).map(p => `<li>${chibiHead(p.name, 24, t)}<span class="pcl" data-pname="${esc(p.name)}" role="button" tabindex="0">${moodBadge(moodLevel(p.md))} ${esc(p.name)}</span><small>${esc(((p.mdw || []).find(x => x.s < 0) || {}).t || "")}${p.treq ? " · wants a trade" : p.unhW ? " · wants a bigger role" : ""}</small></li>`).join("");
  return `<div class="panel"><div class="panel-h"><b>Locker room</b><span class="note">Team mood ${MOODS[String(moodLevel(ms.avg))].name.toLowerCase()}</span></div>
    <p class="note" style="padding:0 14px">Mood changes how well each player plays, from +4% when Great to −4% when Awful. Winning, scoring, friends on the team, a Leader in the room and team bonding lift it; losing, healthy scratches, injuries and hard practices drag it down. Hotheads and Timid players take bad news hardest, and Leaders stay steady.</p>
    <div class="fr-moodbars">${bars}</div>
    ${low ? `<div class="sec-h" style="padding:6px 14px 0">Could use some attention</div><ul class="fr-recent">${low}</ul>` : `<p class="note" style="padding:4px 14px 12px">Nobody is in a bad mood right now.</p>`}</div>`;
}

// ---------- team chemistry and practice ----------
function frChemPanelHtml() {
  const F = FR, t = frTeam(F.user), cur = t.practice || "auto";
  const ch = frTeamChem(F, F.user), next = frPracticeKind(F, t);
  const ranks = F.teams.map(x => ({ id: x.id, v: frTeamChem(F, x.id).avg })).sort((a, b) => b.v - a.v), rk = ranks.findIndex(r => r.id === F.user) + 1;
  const seg = Object.entries(PRACTICE_NAMES).map(([k, l]) => `<button data-fr="prac" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`).join("");
  const units = ch.units.map(u => {
    const fr = u.links.length, lab = u.i < ch.L.dPairs.length ? "Line " + (u.i + 1) + " + pair " + (u.i + 1) : "Line " + (u.i + 1) + " + pair " + ch.L.dPairs.length;
    return `<div class="fr-chem-u"><div class="fr-chem-h"><b>${lab}</b><span class="meter"><span class="bar"><i style="width:${u.value}%"></i></span><b>${u.value}</b> ${chemLabel(u.value)}</span></div>
      <div class="fr-chem-ps">${u.ps.map(p => chibiHead(p.name, 26, t)).join("")}</div>
      <small class="note">${fr} friend pair${fr === 1 ? "" : "s"} (+${fr * CHEM_FRIEND}) · familiarity +${u.fam}</small></div>`;
  }).join("");
  const newsF = F.news.filter(n => n.team === F.user && /^New friends/.test(n.txt)).slice(0, 3).map(n => `<li>${esc(n.txt)}</li>`).join("");
  const daysTo = F.phase === "season" ? 7 - (F.day % 7) : null;
  return `<div class="panel"><div class="panel-h"><b>Team chemistry</b><span class="note">Average ${ch.avg.toFixed(0)} · ${rk}${["st", "nd", "rd"][rk - 1] || "th"} in the league</span></div>
    <p class="note" style="padding:0 14px">A unit starts at ${CHEM_BASE}. Every pair of friends on it adds ${CHEM_FRIEND}, and every pair builds familiarity (up to +${CHEM_FAM_MAX} each) by playing games together and at practice. Moving players between lines keeps what they built with old linemates, but new pairings start fresh.</p>
    <div class="fr-chem">${units}</div>
    <div class="fr-simbar"><b>Team practice</b><div class="seg">${seg}</div><span class="note">${esc(PRACTICE_HELP[cur])}${cur === "auto" ? " Next week: " + PRACTICE_NAMES[next].toLowerCase() + "." : ""}${daysTo ? " Next practice in " + daysTo + " day" + (daysTo > 1 ? "s" : "") + "." : ""}</span></div>
    ${newsF ? `<ul class="fr-recent">${newsF}</ul>` : ""}</div>`;
}

// ---------- watching a franchise game ----------
function frWatchLeague(F, g) {
  const L = frGameLeague(F, [g.h, g.a], true);
  for (const tid of [g.h, g.a]) {
    const st = frStarter(F, tid); if (!st) continue;
    for (const p of L.players) if (p.team === tid && posGroup(p) === "G") p.line = p.id === st.id ? 1 : p.line === 1 ? 2 : p.line;
  }
  return L;
}
function frWatch(gid) {
  const g = frGame(FR, gid); if (!g || g.st === "final") return;
  if (frLive && frLive.fid === FR.id && frLive.season === FR.season && frLive.gid === gid && game && !game.final) { location.hash = "#game"; return; }
  const GL = frWatchLeague(FR, g);
  frLive = { fid: FR.id, season: FR.season, gid, saved: false, label: (g.po ? "Playoffs · game " + g.gn : "Day " + (g.d + 1)) + " · " + FR.name };
  if (game && game.bap) hideMoment && hideMoment();
  const mine = FR.mode === "bap" && (g.h === FR.user || g.a === FR.user) && GL.players.some(p => p.id === FR.me);
  beginGame(new Game(GL, g.h, g.a, { playoff: !!g.po, bap: mine ? { me: FR.me, moments: FR.settings.moments !== false } : null }));
  frLive.bap = FR.mode === "bap";
  frCoachSetup();
  // a healthy scratch watches from the press box: no key moments, no shift skipping
  if (game.bap && !game.teams.some(T => [...T.lineup.fLines.flat(), ...T.lineup.dPairs.flat()].some(p => p.id === FR.me))) { game.bap = null; syncPlay(); }
  location.hash = "#game";
  frLiveBar();
}
function frLiveBar() {
  const bar = $("#frLiveBar"), on = !!frLive;
  document.body.classList.toggle("fr-live", on);
  if (!bar) return;
  bar.hidden = !on; if (!on) return;
  const fin = game && game.final;
  bar.innerHTML = `<span class="fr-live-tag">${frLive.bap ? "Be A Player" : "Franchise"}</span><b>${esc(frLive.label)}</b><span class="note">${fin ? (frLive.saved ? "Final. The result is saved." : "Final.") : (frLive.combine != null ? "Scouts are watching: this game counts toward your draft stock." : "The result is saved to your season when the game ends.") + " Skip ahead any time."}</span><a class="btn primary" href="${frLive.bap ? "#bap" : "#franchise"}">${frLive.bap ? "Back to my career" : "Back to franchise"}</a><button class="btn" data-fr-live="qp">Switch to Quick Play</button>`;
}
// called from the game loop
function frOnFrame() {
  if (!frLive || frLive.saved || !game || !game.final) return;
  frLive.saved = true;
  if (frLive.combine != null) { // a draft-combine showcase game
    if (FR && FR.id === frLive.fid && FR.mode === "bap") {
      const ti = game.teams.findIndex(T => T.team.id === "CMB"), won = game.teams[ti].score > game.teams[1 - ti].score;
      const st = game.stats[FR.me];
      bapCombineRecord(FR, frLive.combine, st ? Object.assign(frBlank(), { gp: st.toi ? 1 : 0, g: st.g, a: st.a, pm: st.pm, pim: st.pim, sog: st.sog, hit: st.hit, blk: st.blk, toi: Math.round(st.toi), tk: st.tk }) : null, game.bap ? game.bap.log : [], (won ? "W " : (game.decision === "REG" ? "L " : "OTL ")) + game.teams[ti].score + "–" + game.teams[1 - ti].score);
      frSave();
    }
    frLiveBar(); return;
  }
  if (!FR || FR.id !== frLive.fid || FR.season !== frLive.season) { frLiveBar(); return; }
  const g = frGame(FR, frLive.gid);
  if (g && g.st !== "final") {
    frApply(FR, g, frFromEngine(FR, g, game));
    if (frDayDone(FR)) frEndDay(FR);
    frSave();
  }
  frLiveBar();
}

// ---------- actions ----------
function frSimDays(n, until) {
  const F = FR; let k = 0;
  const offers0 = F.offers.length, stop = F.settings.stopOnOffer !== false;
  while (k < n && (F.phase === "season" || F.phase === "playoffs")) {
    if (until === "deadline" && F.day > F.deadline) break;
    const round = F.phase === "playoffs" ? F.S.po.round : 0;
    frSimDay(F); k++;
    if (stop && F.offers.length > offers0) { frMsg = "A trade offer just came in. Simulation paused."; break; }
    if (until === "season" && F.phase !== "season") break;
    if (until === "round" && (F.phase !== "playoffs" || F.S.po.round !== round)) break;
  }
  if (frLive && frLive.fid === F.id) { const g = frGame(F, frLive.gid); if (!g || g.st === "final") { if (!frLive.saved) frLive = null; } }
  frSave();
}
async function frAction(b) {
  const a = b.dataset.fr, id = b.dataset.id, v = b.dataset.v;
  frMsg = "";
  switch (a) {
    case "new": frStartSetup(); break;
    case "cancel": frSetup = null; break;
    case "club": frReadSetupForm(); { const t = FR_TEAMS.find(x => x.id === id); frSetup.user = id; frSetup.edit = frTeamDraft(t); } break;
    case "step2": frReadSetupForm(); frSetup.step = 2; break;
    case "step1": { const nm = document.getElementById("frSaveName"); if (nm) frSetup.name = nm.value; frSetup.step = 1; } break;
    case "opt": frSetup[b.dataset.k] = v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v; { const nm = document.getElementById("frSaveName"); if (nm) frSetup.name = nm.value; } break;
    case "create": frCreate(); break;
    case "open": await frOpen(id); break;
    case "del": { const s = frSaves.find(x => x.id === id); if (!(await uiConfirm("Delete “" + (s ? s.name : "this franchise") + "” for everyone? This can't be undone.", "Delete", true))) return; await frDelete(id); } break;
    case "export": await frExport(id); return;
    case "import": frImportPick("franchise"); return;
    case "saves": if (FR && frStore.state === "saving") await frFlush(); FR = null; frSetup = null; try { localStorage.removeItem(FR_LAST); } catch (e) {} await frLoadIndex(); break;
    case "pick": if (draftTeamAt(FR, FR.draft.idx) === FR.user && !draftLegal(FR, FR.user, frP(id))) { draftMake(FR, id); draftAdvance(FR, false); frSave(); } break;
    case "autopick": { const p = draftBest(FR, FR.user); if (p) draftMake(FR, p.id); draftAdvance(FR, false); frSave(); } break;
    case "tomine": draftAdvance(FR, false); frSave(); break;
    case "toend": if (!(await uiConfirm("Let the computer make all your remaining picks?", "Sim to the end"))) return; draftAdvance(FR, true); frSave(); break;
    case "dpos": frUi.pos = v; break;
    case "dview": frUi.dview = v; break;
    case "rcteam": frUi.rcTeam = v; break;
    case "rcpos": frUi.rcPos = v; break;
    case "tab": frTab = v; break;
    case "simday": frSimDays(1); break;
    case "simn": frSimDays(+v); break;
    case "simto": frSimDays(999, v); break;
    case "simgame": frSimGame(FR, id); if (frDayDone(FR)) frEndDay(FR); frSave(); break;
    case "watch": frWatch(id); return;
    case "box": { const g = frGame(FR, id); if (g) { $("#frBoxBody").innerHTML = frBoxHtml(g); const d = $("#frBoxDlg"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); } } return;
    case "accept": { const e = frOfferAnswer(FR, id, true); frMsg = e || "Trade done."; frSave(); } break;
    case "decline": frOfferAnswer(FR, id, false); frSave(); break;
    case "offseason": frStartOffseason(FR); frSave(); break;
    case "resign": { const p = frP(id); const y = frUi.signYrs[id] || askYears(p, FR.season); frMsg = frResign(FR, id, y) || ""; frSave(); } break;
    case "letgo": frLetGo(FR, id); frSave(); break;
    case "openfa": frOpenFA(FR); frSave(); break;
    case "faday": frFADay(FR); frSave(); break;
    case "nextseason": frNextSeason(FR); frTab = "home"; frSave(); break;
    case "sort": frUi.stSort = v; break;
    case "stkind": frUi.stKind = v; frUi.stSort = v === "g" ? "w" : v === "t" ? "ppPct" : "pts"; break;
    case "mfilter": frUi.mf = v; break;
    case "tint": frTeam(FR.user).train = v; frSave(); break;
    case "prac": frTeam(FR.user).practice = v; frSave(); break;
    case "stpo": frUi.stPo = v === "1"; break;
    case "release": { const p = frP(id); if (!(await uiConfirm("Release " + p.name + "? Half of her salary (" + money(p.con.sal * 0.5) + ") stays on your cap for " + yrs(p.con.yrs) + ".", "Release", true))) return; frRelease(FR, id); if (FR.settings.autoLines) frAutoLines(FR, FR.user); frSave(); } break;
    case "relines": frAutoLines(FR, FR.user); frSave(); break;
    case "sign": { const p = frP(id), ask = frAsk(FR, p), y = FR.phase === "offseason" ? (frUi.signYrs[id] || ask.yrs) : 1; const e = frSign(FR, FR.user, id, ask.sal, y); frMsg = e || "Signed " + p.name + "."; if (!e && FR.settings.autoLines) frAutoLines(FR, FR.user); frSave(); } break;
    case "propose": { const T = frUi.trade; const give = [...T.mine].map(frP).filter(p => p && p.team === FR.user), get = [...T.theirs].map(frP).filter(p => p && p.team === T.team); const r = frPropose(FR, T.team, give, get); T.msg = r.msg; T.ok = r.ok; if (r.ok) { T.mine.clear(); T.theirs.clear(); frSave(); } } break;
    case "tclear": frUi.trade.mine.clear(); frUi.trade.theirs.clear(); frUi.trade.msg = ""; break;
  }
  frRender();
}
function frWire() {
  const root = frRoot();
  root.addEventListener("click", e => { const b = e.target.closest("[data-fr]"); if (!b || b.disabled) return; e.preventDefault(); frAction(b); });
  root.addEventListener("change", e => {
    const el = e.target;
    if (el.dataset.frYrs) { frUi.signYrs[el.dataset.frYrs] = +el.value; frRender(); return; }
    if (el.dataset.frTf) { const p = frP(el.dataset.frTf); if (p) { p.tf = el.value || null; frSave(); } frRender(); return; }
    if (el.dataset.frTp) { const T = frUi.trade, set = el.dataset.frTp === "mine" ? T.mine : T.theirs; if (el.checked) set.add(el.value); else set.delete(el.value); T.msg = ""; frRender(); return; }
    if (el.dataset.frChk) {
      if (el.dataset.frChk === "schedMine") frUi.schedMine = el.checked;
      if (el.dataset.frChk === "autoLines") { FR.settings.autoLines = el.checked; if (el.checked) frAutoLines(FR, FR.user); frSave(); }
      frRender(); return;
    }
    if (el.id === "frStopOffer") { FR.settings.stopOnOffer = el.checked; frSave(); return; }
    const s = el.dataset.frSel;
    if (s === "stTeam") frUi.stTeam = el.value;
    else if (s === "rosterTeam") frUi.rosterTeam = el.value;
    else if (s === "tradeTeam") { frUi.trade.team = el.value; frUi.trade.theirs.clear(); frUi.trade.msg = ""; }
    else if (FR_COACH_OPTS.some(o => o[0] === s)) { FR.settings[s] = el.value; frSave(); return; }
    else if (s === "rcRound") frUi.rcRound = el.value;
    else if (s === "rcTeam") frUi.rcTeam = el.value;
    else if (s === "gRot") { frTeam(FR.user).gRot = +el.value; frSave(); }
    else if (frSetup && frSetup.step === 1 && /^fr(C\d|Shape|Emblem)$/.test(el.id)) { frReadSetupForm(); }
    else return;
    frRender();
  });
  root.addEventListener("input", e => {
    const el = e.target;
    if (el.id === "frDraftQ") { frUi.q = el.value.trim().toLowerCase(); frRender(); const q = $("#frDraftQ"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } return; }
    if (frSetup && frSetup.step === 1 && /^fr(Name|Abbr|C\d)$/.test(el.id)) {
      frReadSetupForm();
      const e2 = frSetup.edit, prev = $(".fr-prev"); if (prev) prev.innerHTML = teamLogoSvg({ id: frSetup.user, name: e2.name, abbr: e2.abbr, color: e2.color, color2: e2.color2, color3: e2.color3, logo: { shape: e2.shape, emblem: e2.emblem } }, 120);
      const card = document.querySelector(".fr-club.on"); if (card) { card.querySelector("b").textContent = e2.name; card.querySelector("span").textContent = e2.abbr; }
    }
  });
  wireLinesGrid(root);
  $("#frBoxDlg").addEventListener("click", e => { if (e.target.closest("[data-close]") || e.target === $("#frBoxDlg")) $("#frBoxDlg").close(); });
  $("#frLiveBar").addEventListener("click", e => { const b = e.target.closest("[data-fr-live]"); if (!b) return; frLive = null; frLiveBar(); newGame(); });
}
frWire();

// ---------- behind the bench: coaching your own club in a watched franchise game ----------
const FR_COACH_OPTS = [
  ["coachInt", "Intermissions", [["auto", "Auto: play straight through"], ["manual", "Stop so I can coach"]]],
  ["goaliePull", "Goalie pull", [["auto", "Auto: pull late when trailing"], ["manual", "Manual: only when I say"]]],
  ["goalieChange", "Goalie change", [["auto", "Auto: after 5 goals against"], ["manual", "Manual: only when I say"]]]
];
function frCoachSelects(attr) {
  const S = FR ? FR.settings : {};
  return FR_COACH_OPTS.map(([k, lab, opts]) => `<label class="tac"><span class="pos">${lab}</span><select class="slotsel" ${attr}="${k}">${opts.map(([v, l]) => `<option value="${v}"${(S[k] || "auto") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`).join("");
}
let coachKey = "", coachPanelKey = "", coachKeep = false, coachScrolled = "";
function frCoachTi() {
  if (!frLive || frLive.bap || frLive.combine != null || !FR || FR.id !== frLive.fid || FR.mode === "bap" || !game) return -1;
  return game.teams.findIndex(T => T.team.id === FR.user);
}
function frCoachSetup() {
  coachKey = coachPanelKey = ""; coachKeep = false;
  const ti = frCoachTi(); if (ti < 0) return;
  const S = FR.settings, T = game.teams[ti];
  game.intHold = S.coachInt === "manual"; T.manualPull = S.goaliePull === "manual"; T.manualSwap = S.goalieChange === "manual";
}
function frCoachLinesCtx() {
  const ti = frCoachTi(); if (ti < 0) return qpLinesCtx();
  const T = game.teams[ti];
  return { grid: $("#coachLines"), L: game.league, teams: [T.team], open: new Set([T.team.id]), save: () => { game.refreshLineup(ti); } };
}
const AGG_STEPS = [[25, "Conservative"], [45, "Balanced"], [65, "Assertive"], [85, "Aggressive"]];
function frGoalieLine(ti, p) { const s = game.stats[p.id] || {}; return s.sa ? s.sv + " saves on " + s.sa + " (" + (s.sv / s.sa).toFixed(3).replace(/^0/, "") + ")" : "no shots yet"; }
function frCoachBarHtml(ti) {
  const T = game.teams[ti], g = game.goalies[ti], inInt = game.phase === "intermission", over = game.final || game.phase === "shootout" || game.period >= 5;
  const cur = game.goalieOf(ti), back = T.lineup.goalies.find(x => x && cur && x.id !== cur.id);
  const empty = T.pulled || (g && g.state === "leaving" && !inInt);
  let pull;
  if (T.holdPull) pull = T.pulled || (g && g.state === "leaving") ? `<button class="btn sm on" data-coach="unpull" title="She goes back in at the next whistle">Put the goalie back</button>`
    : `<button class="btn sm on" data-coach="unpull" title="She heads for the bench as soon as you have the puck">Pull ready: goes when we have the puck · cancel</button>`;
  else if (empty) pull = `<button class="btn sm" disabled title="The bench pulled her for the extra attacker">Net is empty</button>`;
  else pull = `<button class="btn sm" data-coach="pull" ${over || inInt ? "disabled" : ""} title="Six skaters until you put her back. She returns at whistles and leaves again when you have the puck.">Pull the goalie</button>`;
  const swap = !back ? `<button class="btn sm" disabled>No backup dressed</button>`
    : T.swapG ? `<button class="btn sm on" data-coach="swap" title="Cancel the change">${esc(back.name)} in at the next whistle · cancel</button>`
    : `<button class="btn sm" data-coach="swap" ${over ? "disabled" : ""} title="${esc(back.name)} replaces ${esc(cur ? cur.name : "the starter")} at the next whistle">Change goalie</button>`;
  const tac = T.tac, aggNow = AGG_STEPS.reduce((b, x) => Math.abs(x[0] - tac.agg) < Math.abs(b[0] - tac.agg) ? x : b, AGG_STEPS[0])[0];
  const fc = `<label class="cb-sel"><span>Forecheck</span><select data-coach-tac="fc">${Object.entries(TAC_NAMES.fc).map(([v, n]) => `<option value="${v}"${tac.fc === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
  const agg = `<label class="cb-sel"><span>Push</span><select data-coach-tac="agg">${AGG_STEPS.map(([v, n]) => `<option value="${v}"${aggNow === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
  const S = FR.settings;
  const set = FR_COACH_OPTS.map(([k, lab, opts]) => `<label class="cb-sel"><span>${lab}</span><select data-coach-set="${k}">${opts.map(([v, l]) => `<option value="${v}"${(S[k] || "auto") === v ? " selected" : ""}>${l.split(":")[0]}</option>`).join("")}</select></label>`).join("");
  const hold = inInt && !game.holdInt && !over ? `<button class="btn sm primary" data-coach="hold">Coach this intermission</button>` : "";
  return `<span class="cb-tag">${teamLogoSvg(T.team, 22)} Bench</span>
    <span class="cb-g"><small>In net</small><b>${esc(empty && !T.pulled ? cur.name : T.pulled ? "Empty net" : cur ? cur.name : "–")}</b><small id="coachGStat"></small></span>
    <span class="cb-btns">${pull}${swap}${hold}</span>
    <span class="cb-grp">${fc}${agg}</span>
    <details class="cb-more"><summary>Auto / manual</summary><div>${set}</div></details>`;
}
function frCoachPanelHtml(ti) {
  const T = game.teams[ti], O = game.teams[1 - ti], cur = game.goalieOf(ti);
  const nextLab = game.otAgain ? game.otName(game.otN) : game.period + 1 === 4 ? "overtime" : periodName(game.period + 1) + " period";
  const doneLab = game.otAgain ? game.otName(game.otN - 1) : periodName(game.period);
  const gs = T.lineup.goalies.filter(Boolean).map(p => `<button class="mo-btn light${cur && p.id === cur.id ? " on" : ""}" data-coach="goalie" data-id="${esc(p.id)}" aria-pressed="${cur && p.id === cur.id}">${chibiHead(p.name, 34, T.team)}<span><b>${esc(p.name)}</b><small>${overall(p)} OVR · ${frGoalieLine(ti, p)}</small></span></button>`).join("");
  const st = [["Shots", T.sog, O.sog], ["Power play", T.ppG + "/" + T.ppOpp, O.ppG + "/" + O.ppOpp], ["Faceoffs", T.fow, O.fow], ["Hits", T.hits, O.hits]].map(([l, a, b]) => `<span><i>${l}</i><b>${a}</b><em>${b}</em></span>`).join("");
  const tired = T.lineup.roster.filter(p => posGroup(p) !== "G" && game.fatigue[p.id] > 12).sort((a, b) => game.fatigue[b.id] - game.fatigue[a.id]).slice(0, 4).map(p => esc(p.name));
  return `<div class="coach-h"><span class="mo-tag">Intermission</span><b>After the ${doneLab} · ${esc(T.team.abbr)} ${T.score} – ${O.score} ${esc(O.team.abbr)}</b><span class="grow"></span><button class="btn primary" data-coach="start">Start the ${nextLab}</button></div>
    <div class="coach-sum"><span class="hd"><i></i><b>${esc(T.team.abbr)}</b><em>${esc(O.team.abbr)}</em></span>${st}</div>
    ${tired.length ? `<p class="note">Running heavy legs: ${tired.join(", ")}. Lighter minutes would help.</p>` : ""}
    <div class="sec-h">In net for the ${nextLab}</div><div class="coach-gs">${gs}</div>
    <div class="coach-keep"><label class="chk"><input type="checkbox" id="coachKeep"${coachKeep ? " checked" : ""}> Keep these lines and tactics for future games</label><span class="note">Otherwise the changes last for this game only.</span></div>
    <div class="lines-grid" id="coachLines"></div>`;
}
function frCoachKeepNow(ti) {
  const T = game.teams[ti], ft = frTeam(FR.user); if (!ft) return;
  for (const p of game.league.players) if (p.team === FR.user && posGroup(p) !== "G") { const q = frP(p.id); if (q && q.team === FR.user) { q.line = p.line; q.pos = p.pos; q.side = p.side; q.style = p.style; } }
  ft.tactics = Object.assign({}, T.team.tactics || {}); ft.pp = T.team.pp ? JSON.parse(JSON.stringify(T.team.pp)) : null; ft.pk = T.team.pk ? JSON.parse(JSON.stringify(T.team.pk)) : null;
  FR.settings.autoLines = false; frSave();
}
function frCoachFrame() {
  const bar = $("#coachBar"), panel = $("#coachPanel"); if (!bar || !panel) return;
  const ti = frCoachTi();
  if (ti < 0 || currentView() !== "game") { if (!bar.hidden) { bar.hidden = true; bar.innerHTML = ""; coachKey = ""; } if (!panel.hidden) { panel.hidden = true; panel.innerHTML = ""; coachPanelKey = ""; } return; }
  const T = game.teams[ti], g = game.goalies[ti];
  if (game.final) { if (!bar.hidden) { bar.hidden = true; coachKey = ""; } } else {
    const key = [ti, game.phase === "intermission", game.holdInt, T.pulled, g ? g.state : "-", T.holdPull, T.swapG, T.gIdx, T.tac.fc, T.tac.agg, game.phase === "shootout", game.period, FR.settings.coachInt, FR.settings.goaliePull, FR.settings.goalieChange].join("|");
    if (key !== coachKey) { coachKey = key; bar.innerHTML = frCoachBarHtml(ti); bar.hidden = false; }
    const cur = game.goalieOf(ti), gs = $("#coachGStat"); if (gs && cur) setText(gs, frGoalieLine(ti, cur));
  }
  const show = game.phase === "intermission" && game.holdInt && !game.final;
  if (!show) { if (!panel.hidden) { panel.hidden = true; panel.innerHTML = ""; coachPanelKey = ""; } return; }
  const pk = game.period + "|" + game.otN + "|" + T.gIdx;
  if (pk !== coachPanelKey) {
    const first = !coachPanelKey || coachPanelKey.split("|")[0] !== String(game.period) || coachPanelKey.split("|")[1] !== String(game.otN);
    coachPanelKey = pk; panel.innerHTML = frCoachPanelHtml(ti); panel.hidden = false; renderLines(frCoachLinesCtx());
    if (first && coachScrolled !== pk) { coachScrolled = pk; requestAnimationFrame(() => panel.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })); }
  }
}
function frCoachWire() {
  const bar = $("#coachBar"), panel = $("#coachPanel"); if (!bar || !panel) return;
  const click = e => {
    const b = e.target.closest("[data-coach]"); if (!b || b.disabled) return;
    const ti = frCoachTi(); if (ti < 0) return;
    const T = game.teams[ti], a = b.dataset.coach;
    if (a === "pull") game.coachPull(ti);
    else if (a === "unpull") game.coachPull(ti, false);
    else if (a === "swap") { if (game.phase === "intermission") { const back = T.lineup.goalies.find(x => x && x.id !== game.goalieOf(ti).id); if (back) game.setGoalie(ti, back.id); } else game.coachSwap(ti); }
    else if (a === "hold") game.holdInt = true;
    else if (a === "goalie") game.setGoalie(ti, b.dataset.id);
    else if (a === "start") {
      if (coachKeep) frCoachKeepNow(ti);
      game.holdInt = false; game.nextPeriod(); playing = true; syncPlay();
      const rb = document.querySelector("#view-game .stage"); if (rb) rb.scrollIntoView({ block: "nearest" });
    }
    coachKey = ""; frCoachFrame();
  };
  bar.addEventListener("click", click); panel.addEventListener("click", click);
  bar.addEventListener("change", e => {
    const el = e.target, ti = frCoachTi(); if (ti < 0) return;
    const T = game.teams[ti];
    if (el.dataset.coachTac) { const k = el.dataset.coachTac, v = k === "agg" ? +el.value : el.value; T.tac[k] = v; T.team.tactics = Object.assign({}, T.team.tactics || {}, { [k]: v }); game.log("coach", ti, T.team.abbr + " switch it up: " + (k === "fc" ? "forecheck to " + TAC_NAMES.fc[v] : AGG_STEPS.find(x => x[0] === v)[1].toLowerCase() + " pressure") + "."); }
    if (el.dataset.coachSet) {
      const k = el.dataset.coachSet; FR.settings[k] = el.value; frSave();
      if (k === "coachInt") game.intHold = el.value === "manual";
      if (k === "goaliePull") T.manualPull = el.value === "manual";
      if (k === "goalieChange") T.manualSwap = el.value === "manual";
    }
    coachKey = "";
  });
  panel.addEventListener("change", e => { if (e.target.id === "coachKeep") coachKeep = e.target.checked; });
  wireLinesGrid(panel);
}
frCoachWire();
