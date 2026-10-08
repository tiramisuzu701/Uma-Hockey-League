// ---------- Be A Player: screens ----------
let bapSetup = null, bapTab = "home", bapLeagueTab = "standings", bapAutoTried = false, bapMsg = "";
const BAP_LAST = "tracen-bap-last";
const bapRoot = () => $("#bapRoot");

// a drawn portrait for a created player: hair, ears, eyes, an optional blaze
const CUSTOM_LOOKS = {};
function bapAvatarSvg(L, size, team) {
  const hair = L.hair || "#8A5A3C", eye = L.eye || "#3A7BD5", bg = team ? team.color : "#2B3A55", inner = "#F4B8C8";
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="${bg}"/>
    <path d="M8.5 15 L11.5 3.5 L17 12.5 Z" fill="${hair}"/><path d="M31.5 15 L28.5 3.5 L23 12.5 Z" fill="${hair}"/>
    <path d="M10.6 12.4 L12 6.6 L14.8 11.4 Z" fill="${inner}"/><path d="M29.4 12.4 L28 6.6 L25.2 11.4 Z" fill="${inner}"/>
    <ellipse cx="20" cy="23" rx="13.2" ry="13" fill="${hair}"/>
    <ellipse cx="20" cy="25" rx="9.6" ry="9.2" fill="#FBE3D2"/>
    <path d="M10.2 22.5 Q11 12.5 20 12.2 Q29 12.5 29.8 22.5 Q27 17 23.5 19 Q21 14.5 18 19 Q14.5 16.5 10.2 22.5 Z" fill="${hair}"/>
    ${L.blaze ? `<path d="M19.2 12.3 L20.8 12.3 L20.4 18.5 L19.6 18.5 Z" fill="#FFFFFF"/>` : ""}
    <ellipse cx="16.2" cy="25.6" rx="1.7" ry="2.2" fill="${eye}"/><ellipse cx="23.8" cy="25.6" rx="1.7" ry="2.2" fill="${eye}"/>
    <circle cx="15.7" cy="24.8" r="0.6" fill="#fff"/><circle cx="23.3" cy="24.8" r="0.6" fill="#fff"/>
    <path d="M18.6 29.6 Q20 30.8 21.4 29.6" stroke="#B5655A" stroke-width="0.8" fill="none" stroke-linecap="round"/></svg>`;
}
// your player's portrait: the pony
function bapPony(size, team, name) { return `<span class="chibi-head bap-av" style="width:${size}px;height:${size}px;background-image:url(art/bap-pony-head.webp);${team ? "border-color:" + team.color : ""}" role="img" aria-label="${esc(name || "Your player")}"></span>`; }
const chibiHeadBase = chibiHead, chibiFullBase = chibiFull, hasChibiBase = hasChibi;
// every portrait is clickable: it opens that player's card
chibiHead = function (name, size, team) { const h = CUSTOM_LOOKS[name] ? bapPony(size, team, name) : chibiHeadBase(name, size, team); return h.replace(/^<span /, '<span data-pname="' + esc(name) + '" '); };
chibiFull = function (kind, name, size, extra) { return CUSTOM_LOOKS[name] ? `<span class="chibi bap-full ${extra || ""}" style="width:${size}px;height:${size}px;background-image:url(art/bap-pony.webp)" role="img" aria-label="${esc(name)}"></span>` : chibiFullBase(kind, name, size, extra); };
hasChibi = function (kind, name) { return !!CUSTOM_LOOKS[name] || hasChibiBase(kind, name); };
function bapRegisterLooks() { if (FR && FR.mode === "bap") { const me = bapMe(FR); if (me) CUSTOM_LOOKS[me.name] = me.look || {}; } }

// ---------- render ----------
function renderBap() {
  const root = bapRoot(); if (!root) return;
  if (FR && FR.mode !== "bap") { if (frStore.state === "saving") frFlush(); FR = null; }
  if (!frStore.ready) { root.innerHTML = `<div class="panel fr-empty"><p class="note">Loading careers…</p></div>`; return; }
  if (!FR && !bapSetup && !bapAutoTried) {
    bapAutoTried = true; let last = null; try { last = localStorage.getItem(BAP_LAST); } catch (e) {}
    if (last && frSaves.some(s => s.id === last && s.mode === "bap")) { frOpen(last, true).then(() => { if (FR && FR.mode !== "bap") FR = null; renderBap(); }); return; }
  }
  bapRegisterLooks();
  if (bapSetup) root.innerHTML = bapSetupHtml();
  else if (!FR) root.innerHTML = bapSavesHtml();
  else if (!FR.bap.seen) root.innerHTML = bapDraftHtml();
  else root.innerHTML = bapHubHtml();
  frPill();
}
function bapSavesHtml() {
  const list = frSaves.filter(s => s.mode === "bap");
  const cards = list.map(s => `<div class="fr-save" style="--tc:${esc(s.color || "#555")}"><div class="fr-save-h"><b>${esc(s.name)}</b><span class="note">${esc(s.teamName || s.team)} · Season ${s.season}${s.local ? " · this browser only" : ""}</span></div>
    <div class="fr-save-a"><button class="btn primary" data-bap="open" data-id="${esc(s.id)}">Continue</button><button class="btn danger" data-bap="del" data-id="${esc(s.id)}">Delete</button></div></div>`).join("");
  return `<div class="section-h"><h2>Be A Player</h2></div>
    <div class="panel fr-intro bap-intro">
      <div><h3>Create a player and live her career</h3>
      <p>Build your own Uma from scratch, get drafted, and fight your way up the lineup. In games the camera follows you, and when the puck finds you in a big spot the action pauses so you make the call: shoot, pass, deke, or throw the body. Earn coach trust and skill points, talk to the media, build friendships, negotiate contracts, or ask for a trade.</p></div>
      <button class="btn primary big" data-bap="new">Create a player</button></div>
    ${bapMsg ? `<p class="fr-msg">${esc(bapMsg)}</p>` : ""}
    ${cards ? `<div class="sec-h" style="padding-left:0">Your careers</div><div class="fr-saves">${cards}</div>` : `<p class="note">No careers yet.</p>`}`;
}

// ---------- create ----------
function bapStartSetup() {
  bapSetup = { step: 1, name: "", tag: "", no: 17, pos: "C", style: "Sniper", shoots: "L", look: { hair: "#7A4A2E", eye: "#2F7FC8", blaze: true }, alloc: {}, sp: 12, games: 28, series: 7, injuries: true, moments: true };
}
function bapPreview() {
  const s = bapSetup, p = bapMakePlayer({ name: s.name || "New Player", pos: s.pos, style: s.style, shoots: s.shoots, no: s.no, look: s.look });
  for (const [k, n] of Object.entries(s.alloc)) p[k] += n;
  p.off = Math.round((p.sht + p.pas) / 2);
  return p;
}
function bapSetupHtml() {
  const s = bapSetup, p = bapPreview();
  const seg = (k, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-bap="set" data-k="${k}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join("")}</div>`;
  const styles = STYLES[s.pos === "D" ? "D" : "F"].filter(x => BAP_STYLE[x] || x === "Enforcer" || x === "Two-Way");
  const head = `<div class="section-h"><h2>Create a player · ${["", "Who she is", "Skill points", "League"][s.step]}</h2><button class="btn" data-bap="cancel">Cancel</button></div>`;
  const card = `<div class="bap-card"><span class="bap-big">${bapPony(112, null, s.name)}</span><b>${esc(s.name || "Your player")}</b><span class="note">#${s.no} · ${s.pos} · ${esc(s.style)} · shoots ${s.shoots === "L" ? "left" : "right"}</span><span class="ovr big">${overall(p)} <span class="gr" data-g="${grade(overall(p))}">${grade(overall(p))}</span></span></div>`;
  if (s.step === 1) return head + `<div class="bap-create">${card}<div class="panel fr-settings">
      <div class="fr-row"><span>Name</span><input id="bapName" value="${esc(s.name)}" maxlength="32" placeholder="e.g. Starlight Rhapsody"></div>
      <div class="fr-row"><span>Short name</span><input id="bapTag" value="${esc(s.tag)}" maxlength="9" placeholder="On her jersey tag"></div>
      <div class="fr-row"><span>Number</span><input id="bapNo" type="number" min="1" max="99" value="${s.no}" style="width:5em"></div>
      <div class="fr-row"><span>Position</span>${seg("pos", [["C", "Center"], ["LW", "Left wing"], ["RW", "Right wing"], ["D", "Defense"]], s.pos)}</div>
      <div class="fr-row"><span>Style</span>${seg("style", styles.map(x => [x, x]), s.style)}<span class="note">${esc(STYLE_NOTES[s.style] || "")}</span></div>
      <div class="fr-row"><span>Shoots</span>${seg("shoots", [["L", "Left"], ["R", "Right"]], s.shoots)}</div>
    </div></div><div class="fr-nav"><button class="btn primary" data-bap="step" data-v="2"${s.name.trim() ? "" : " disabled"}>Next: skill points</button></div>`;
  if (s.step === 2) {
    const keys = BAP_KEYS.filter(k => k !== "fo" || s.pos === "C");
    const base = bapMakePlayer({ name: "x", pos: s.pos, style: s.style });
    const rows = keys.map(k => { const v = p[k], c = bapCost(v), a = s.alloc[k] || 0; return `<div class="bap-attr"><span>${BAP_NAMES[k]}</span><div class="bap-bar"><i style="width:${v}%"></i><b style="left:${base[k]}%"></b></div><em>${v}</em>
      <button class="btn sm" data-bap="alloc" data-k="${k}" data-v="-1"${a ? "" : " disabled"} aria-label="Lower ${BAP_NAMES[k]}">−</button><button class="btn sm" data-bap="alloc" data-k="${k}" data-v="1"${s.sp >= c && v < 99 ? "" : " disabled"} aria-label="Raise ${BAP_NAMES[k]}">+${c > 1 ? " (" + c + ")" : ""}</button></div>`; }).join("");
    return head + `<div class="bap-create">${card}<div class="panel"><div class="panel-h"><b>${s.sp} skill point${s.sp === 1 ? "" : "s"} left</b><span class="note">Raising a rating costs 1 point below 70, 2 below 80, 3 below 88, then 4. You earn more by playing.</span></div><div class="bap-attrs">${rows}</div></div></div>
      <div class="fr-nav"><button class="btn" data-bap="step" data-v="1">Back</button><button class="btn primary" data-bap="step" data-v="3">Next: league settings</button></div>`;
  }
  const radio = (k, opts, cur) => seg(k, opts, cur);
  return head + `<div class="panel fr-settings">
      <div class="fr-row"><span>Season length</span>${radio("games", [[14, "14 games"], [28, "28 games"], [42, "42 games"], [56, "56 games"]], s.games)}</div>
      <div class="fr-row"><span>Playoff series</span>${radio("series", [[5, "Best of 5"], [7, "Best of 7"]], s.series)}</div>
      <div class="fr-row"><span>Injuries</span>${radio("injuries", [[true, "On"], [false, "Off"]], s.injuries)}</div>
      <div class="fr-row"><span>Key moments</span>${radio("moments", [[true, "Pause for my calls"], [false, "Let her play on her own"]], s.moments)}<span class="note">When you watch your games, the action stops in big spots so you can choose what she does.</span></div>
      <div class="fr-row"><span>The league</span><span class="note">You join the eight Quick Play clubs with their current rosters. The other clubs are run by the computer.</span></div>
    </div><div class="fr-nav"><button class="btn" data-bap="step" data-v="2">Back</button><button class="btn primary" data-bap="create">Go to the draft</button></div>`;
}
function bapReadForm() {
  const s = bapSetup; if (!s || s.step !== 1) return;
  const v = id => document.getElementById(id);
  if (v("bapName")) { s.name = v("bapName").value.trim().slice(0, 32); s.tag = v("bapTag").value.trim().slice(0, 9); s.no = Math.max(1, Math.min(99, parseInt(v("bapNo").value, 10) || 17)); }
}
function bapCreate() {
  const s = bapSetup;
  if (league.players.some(p => p.name.toLowerCase() === s.name.toLowerCase())) { bapMsg = "There's already a player named " + s.name + ". Pick another name."; s.step = 1; return; }
  const F = bapNew(league, { name: s.name, tag: s.tag || s.name.split(" ").slice(-1)[0], no: s.no, pos: s.pos, style: s.style, shoots: s.shoots, look: s.look, sp: s.sp }, { games: s.games, series: s.series, injuries: s.injuries, moments: s.moments });
  const me = bapMe(F); for (const [k, n] of Object.entries(s.alloc)) me[k] += n; me.off = Math.round((me.sht + me.pas) / 2);
  FR = F; bapSetup = null; bapTab = "home"; bapMsg = "";
  try { localStorage.setItem(BAP_LAST, F.id); } catch (e) {}
  frSave();
}

// ---------- draft night ----------
function bapDraftHtml() {
  const F = FR, me = bapMe(F), dr = F.bap.draft;
  const C = F.bap.combine;
  if (!dr && (!C || !C.done)) return bapCombineHtml();
  if (!dr) return `${C && C.games.length ? bapCombineSummary() : ""}<div class="panel bap-draft"><span class="note">Season ${F.season} · Draft night</span><h2>The Tracen Draft</h2>
    <div class="bap-draft-teams">${F.teams.map(t => `<span title="${esc(t.name)}">${teamLogoSvg(t, 54)}</span>`).join("")}</div>
    <p>Eight clubs. One of them is about to call your name.</p>${chibiHead(me.name, 96)}<b class="bap-name">${esc(me.name)}</b><span class="note">${me.pos} · ${esc(me.style)} · ${overall(me)} OVR · ${bapStockLabel(bapProjected(F))}</span>
    <button class="btn primary big" data-bap="draft">Start the draft</button></div>`;
  const t = frTeam(dr.team);
  return `<div class="panel bap-draft revealed" style="--tc:${esc(t.color)}"><span class="note">Round 1 · Pick ${dr.pick}</span><h2>With the ${dr.pick}${["st", "nd", "rd"][dr.pick - 1] || "th"} pick, the ${esc(t.name)} select…</h2>
    <div class="bap-reveal">${teamLogoSvg(t, 130)}${chibiHead(me.name, 120, t)}</div>
    <b class="bap-name">${esc(me.name)}</b><span class="note">#${me.no} · ${me.pos} · ${esc(me.style)}</span>
    <p>Entry-level contract: ${money(me.con.sal)} a year for ${me.con.yrs} years. Your first role: <b>${esc(bapRoleText(bapRole(F)))}</b>. Earn the coach's trust to move up.</p>
    <button class="btn primary big" data-bap="seen">Start my career</button></div>`;
}

// ---------- draft combine ----------
function bapCombineGameRow(i) {
  const F = FR, C = F.bap.combine, g = C.games[i], opp = BAP_COMBINE_TEAMS[1 + (i % 3)], next = C.games.filter(Boolean).length === i;
  const logo = teamLogoSvg(frBaseTeam(opp), 40);
  if (g) return `<div class="bap-cmb done">${logo}<div><b>Game ${i + 1} vs ${esc(opp.name)} · ${esc(g.res)}</b><span class="note">${g.g} G · ${g.a} A · ${g.sog} SOG · ${g.pm > 0 ? "+" : ""}${g.pm}${g.moments ? " · " + g.great + "/" + g.moments + " great reads" : ""}</span></div><span class="g sm" data-g="${esc(g.grade)}">${esc(g.grade)}</span><span class="mv ${g.move > 0.05 ? "up" : g.move < -0.05 ? "dn" : ""}">${g.move > 0.05 ? "▲ stock up" : g.move < -0.05 ? "▼ stock down" : "– steady"}</span></div>`;
  return `<div class="bap-cmb${next ? "" : " later"}">${logo}<div><b>Game ${i + 1} vs ${esc(opp.name)}</b><span class="note">${next ? "Scouts from all eight clubs are watching." : "Later in the week."}</span></div>${next ? `<button class="btn primary" data-bap="cplay" data-v="${i}">Play</button><button class="btn" data-bap="csim" data-v="${i}">Sim</button>` : ""}</div>`;
}
function bapCombineHtml() {
  const F = FR, me = bapMe(F), C = F.bap.combine, proj = bapProjected(F);
  if (!C) return `<div class="panel bap-draft"><span class="note">Before the draft</span><h2>The Draft Combine</h2>${chibiHead(me.name, 96)}
    <p>Three showcase games against other prospects and depth players from around the league. You play on the top unit of Team Prospect, and every club's scouts are in the stands. Good games raise your draft stock; bad ones drop it.</p>
    <span class="bap-stock">${bapStockLabel(proj)}</span>
    <div class="fr-simbar" style="justify-content:center"><button class="btn primary big" data-bap="cstart">Go to the combine</button><button class="btn" data-bap="cskip">Skip it and go to the draft</button></div></div>`;
  return `<div class="panel bap-draft"><span class="note">Draft combine · ${C.games.filter(Boolean).length} of ${BAP_COMBINE_N} games played</span><h2>Draft stock</h2>
      <span class="bap-stock">${bapStockLabel(proj)}</span><span class="note">Projected around pick #${Math.round(proj)} of 8</span>
      <div class="bap-cmbs">${Array.from({ length: BAP_COMBINE_N }, (_, i) => bapCombineGameRow(i)).join("")}</div>
      <div class="fr-simbar" style="justify-content:center"><button class="btn" data-bap="cskip">${C.games.filter(Boolean).length ? "Finish the combine and go to the draft" : "Skip it and go to the draft"}</button></div></div>`;
}
function bapCombineSummary() {
  const C = FR.bap.combine, gs = C.games.filter(Boolean);
  return `<div class="panel"><div class="panel-h"><b>Combine results</b><span class="note">${gs.map(g => g.grade).join(" · ")} · ${bapStockLabel(bapProjected(FR))}</span></div></div>`;
}
function bapCombineWatch(i) {
  const F = FR, { L, home, away } = bapCombineLeague(F, i);
  frLive = { fid: F.id, season: F.season, combine: i, gid: "cmb" + i, saved: false, bap: true, label: "Draft combine · game " + (i + 1) + " · " + F.name };
  beginGame(new Game(L, home, away, { bap: { me: F.me, moments: F.settings.moments !== false } }));
  location.hash = "#game";
  frLiveBar();
}

// ---------- hub ----------
const BAP_TABS = [["home", "Home"], ["player", "Player"], ["career", "Career"], ["team", "Team"], ["media", "Media"], ["league", "League"]];
function bapMeter(v, cls) { return `<span class="bap-meter ${cls || ""}"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%"></i></span>`; }
function bapHubHtml() {
  const F = FR, me = bapMe(F), B = F.bap, t = frTeam(me.team), role = bapRole(F), s = F.S.stats[F.me] || frBlank();
  const phase = F.phase === "season" ? "Day " + Math.min(F.day + 1, F.regDays) + " of " + F.regDays : frPhaseName();
  const tabs = BAP_TABS.map(([k, l]) => `<button data-bap="tab" data-v="${k}" aria-current="${bapTab === k ? "page" : "false"}">${l}${k === "home" && B.interview ? ` <i class="dot">1</i>` : ""}${k === "player" && B.sp ? ` <i class="dot">${B.sp}</i>` : ""}</button>`).join("");
  const body = { home: bapHomeHtml, player: bapPlayerHtml, career: bapCareerHtml, team: bapTeamHtml, media: frMediaHtml, league: bapLeagueHtml }[bapTab] || bapHomeHtml;
  return `<div class="fr-head bap-head" style="--tc:${esc(t ? t.color : "#555")}">${chibiHead(me.name, 58, t)}<div><h2>${esc(me.name)} <span class="no">#${me.no}</span></h2><span class="note">${me.pos} · ${esc(me.style)} · ${tLogo(me.team, 16)}${t ? esc(t.name) : "Free agent"} · Season ${F.season} · ${phase}</span><span class="bap-role">${esc(bapRoleText(role))}</span></div>
      <div class="fr-kpis"><span><b>${overall(me)}</b><i>Overall</i></span><span><b>${s.gp}–${s.g}–${s.a}–${s.g + s.a}</b><i>GP-G-A-P</i></span><span><b>${Math.round(B.trust)}</b><i>Coach trust</i>${bapMeter(B.trust, "trust")}</span><span><b>${Math.round(B.hype)}</b><i>Hype</i>${bapMeter(B.hype, "hype")}</span></div>
      <span class="save-pill" id="frPill"></span><button class="btn" data-bap="saves">All careers</button></div>
    <nav class="fr-tabs" aria-label="Career sections">${tabs}</nav>
    ${frMsg || bapMsg ? `<p class="fr-msg">${esc(frMsg || bapMsg)}</p>` : ""}
    ${body()}`;
}
function bapTodayGame(F) { return frTodayGames(F).find(g => g.h === F.user || g.a === F.user); }
function bapHomeHtml() {
  const F = FR, me = bapMe(F), B = F.bap, role = bapRole(F);
  let main = "";
  if (F.phase === "season" || F.phase === "playoffs") {
    const g = bapTodayGame(F);
    if (g && g.st !== "final") {
      const opp = g.h === F.user ? g.a : g.h, home = g.h === F.user;
      const live = frLive && frLive.fid === F.id && frLive.season === F.season && frLive.gid === g.id && !frLive.saved;
      main = `<div class="panel bap-next"><div class="panel-h"><b>${g.po ? "Playoffs · game " + g.gn : "Day " + (g.d + 1)} · ${home ? "Home" : "Away"} vs ${tName(opp)}</b><span class="note">${esc(bapRoleText(role))}</span></div>
        <div class="bap-vs">${tLogo(g.a, 64)}<span>@</span>${tLogo(g.h, 64)}</div>
        <div class="fr-simbar">${role.out ? `<button class="btn primary" data-fr="watch" data-id="${g.id}">${live ? "Resume" : "Watch from the press box"}</button>` : `<button class="btn primary big" data-fr="watch" data-id="${g.id}">${live ? "Resume the game" : "Play the game"}</button>`}
          <button class="btn" data-bap="simmine">Sim my game</button><button class="btn" data-fr="simday">Sim the day</button>${F.phase === "season" ? `<button class="btn" data-fr="simn" data-v="7">Sim 7 days</button>` : `<button class="btn" data-fr="simto" data-v="round">Sim this round</button>`}</div>
        <p class="note" style="padding:0 14px 12px">${role.out ? (me.inj ? "You're injured: out " + me.inj.g + " more game" + (me.inj.g > 1 ? "s" : "") + "." : "You're a healthy scratch tonight. Keep earning the coach's trust in practice.") : F.settings.moments !== false ? "When you play the game, the action pauses in big moments so you make the call. Tap a choice, or press 1 to 5." : "Key moments are off, so she plays on her own."}</p></div>`;
    } else if (g) main = `<div class="panel"><div class="panel-h"><b>Your game is done</b></div><div class="fr-games">${frGameRow(g, {})}</div><div class="fr-simbar"><button class="btn primary" data-fr="simday">Finish the day</button></div></div>`;
    else main = `<div class="panel"><div class="panel-h"><b>${F.phase === "playoffs" ? "Your season is over" : "No game today"}</b></div><div class="fr-simbar"><button class="btn primary" data-fr="simday">Sim the day</button>${F.phase === "playoffs" ? `<button class="btn" data-fr="simto" data-v="cup">Sim to the end</button>` : ""}</div></div>`;
    if (F.phase === "playoffs") main += frBracketHtml();
  } else if (F.phase === "done") {
    const h = F.history[0], s = F.S.stats[F.me] || frBlank(), mine = h.awards.filter(a => a.pid === F.me);
    main = `<div class="panel fr-champ" style="--tc:${esc(frTeam(h.champ).color)}">${tLogo(h.champ, 70)}<div><span class="note">Season ${h.season}</span><h3>${h.champ === me.team ? "You won the Tracen Cup!" : tName(h.champ) + " win the Tracen Cup"}</h3><span class="note">Your season: ${s.gp} GP, ${s.g} G, ${s.a} A, ${s.g + s.a} P${mine.length ? " · " + mine.map(a => a.name).join(", ") : ""}</span></div></div>
      <div class="fr-simbar"><button class="btn primary" data-fr="offseason">Start the offseason</button></div>`;
  } else if (F.phase === "offseason") {
    if (B.offers) main = `<div class="panel"><div class="panel-h"><b>Your contract is up</b><span class="note">Pick where you play next. Your hype raises the offers.</span></div><div class="bap-offers">${B.offers.map((o, i) => `<div class="bap-offer" style="--tc:${esc(frTeam(o.team).color)}">${tLogo(o.team, 44)}<div><b>${tName(o.team)}${o.own ? " (stay)" : ""}</b><span>${money(o.sal)} × ${yrs(o.yrs)}</span><small>Role: ${esc(o.role)}</small></div><button class="btn primary" data-bap="sign" data-v="${i}">Sign</button></div>`).join("")}</div></div>`;
    else main = `<div class="panel"><div class="panel-h"><b>Offseason</b><span class="note">Contract: ${money(me.con.sal)} × ${yrs(me.con.yrs)} left with ${tName(me.team)}.</span></div><div class="fr-simbar"><button class="btn primary" data-bap="nextseason">Start season ${F.season}</button><button class="btn" data-bap="tab" data-v="player">Spend skill points</button></div></div>`;
  }
  const iv = B.interview ? `<div class="panel bap-iv"><div class="panel-h"><b>Postgame interview</b><span class="note">What you say reaches the coach, your teammates and the fans.</span></div><p class="bap-q">“${esc(B.interview.q)}”</p>
    <div class="bap-ans">${B.interview.opts.map((o, i) => `<button class="mo-btn light" data-bap="answer" data-v="${i}"><span><b>${esc(o.t)}</b></span></button>`).join("")}<button class="btn sm" data-bap="answer" data-v="-1">No comment</button></div></div>` : "";
  const L = B.log[0];
  const last = L ? `<div class="panel bap-last"><div class="panel-h"><b>Last game · ${L.res} vs ${tAbbr(L.opp)}</b>${L.watched ? `<span class="note">played live</span>` : ""}</div>
    ${L.scratch ? `<p class="note" style="padding:10px 14px">Healthy scratch. +1 coach trust for the work in practice.</p>` : `<div class="bap-grade"><span class="g" data-g="${esc(L.grade)}">${esc(L.grade)}</span><div><b>${L.g} G · ${L.a} A · ${L.pm > 0 ? "+" : ""}${L.pm} · ${L.sog} SOG · ${L.hit} HIT · ${fmtToi(L.toi)} TOI</b><span class="note">+${L.xp} XP${L.moments ? " · " + L.great + " great read" + (L.great === 1 ? "" : "s") + " in " + L.moments + " key moment" + (L.moments === 1 ? "" : "s") : ""}</span></div></div>`}</div>` : "";
  const news = F.news.filter(n => n.team === me.team || n.k === "media").slice(0, 12).map(n => `<li class="${n.k === "media" ? "mine" : ""}"><span class="note">S${n.s} · ${n.d < 0 ? "Offseason" : "Day " + (n.d + 1)}</span>${esc(n.txt)}</li>`).join("");
  return `<div class="fr-home"><div class="fr-col">${iv}${main}${last}</div><div class="fr-col">
    <div class="panel"><div class="panel-h"><b>Progress</b><button class="btn sm" data-bap="tab" data-v="player">Player</button></div>
      <div class="bap-prog"><span>Skill points</span><b>${B.sp}</b></div><div class="bap-prog"><span>XP to next point</span>${bapMeter(B.xp / BAP_SP_XP * 100, "xp")}<b>${B.xp}/${BAP_SP_XP}</b></div>
      <div class="bap-prog"><span>Coach trust</span>${bapMeter(B.trust, "trust")}<b>${Math.round(B.trust)}</b></div><div class="bap-prog"><span>Hype</span>${bapMeter(B.hype, "hype")}<b>${Math.round(B.hype)}</b></div></div>
    <div class="panel"><div class="panel-h"><b>Standings</b></div>${frMiniStandings()}</div>
    <div class="panel"><div class="panel-h"><b>Your news</b></div><ul class="fr-news">${news || `<li class="note">Nothing yet.</li>`}</ul></div></div></div>`;
}
function bapPlayerHtml() {
  const F = FR, me = bapMe(F), B = F.bap;
  const keys = BAP_KEYS.filter(k => k !== "fo" || me.pos === "C" || me.fo > 48);
  const rows = keys.map(k => { const v = me[k], c = bapCost(v); const prog = (me.tp && me.tp[k]) || 0; return `<div class="bap-attr"><span>${BAP_NAMES[k]}</span><div class="bap-bar"><i style="width:${v}%"></i></div><em>${v}</em>
    <button class="btn sm" data-bap="spend" data-k="${k}"${B.sp >= c && v < 99 ? "" : " disabled"} aria-label="Raise ${BAP_NAMES[k]} for ${c} points">+1 · ${c} SP</button>${B.drill === k ? `<small class="note">practice ${Math.round(prog * 100)}%</small>` : ""}</div>`; }).join("");
  const mates = F.players.filter(p => p.team === me.team && p.id !== me.id).sort((a, b) => (B.rel[b.id] ?? 40) - (B.rel[a.id] ?? 40));
  const drills = Object.entries(BAP_DRILLS).filter(([k]) => k !== "fo" || me.pos === "C").map(([k, l]) => `<option value="${k}"${B.drill === k ? " selected" : ""}>${l}</option>`).join("");
  return `<div class="fr-home"><div class="fr-col"><div class="panel"><div class="panel-h"><b>Ratings · ${overall(me)} OVR</b><span class="note">${B.sp} skill point${B.sp === 1 ? "" : "s"} to spend</span></div><div class="bap-attrs">${rows}</div>
      <p class="note" style="padding:0 14px 12px">Skill points come from XP: every ${BAP_SP_XP} XP is one point. You earn XP from games (more for good grades, goals and smart reads) and from daily practice.</p></div></div>
    <div class="fr-col"><div class="panel"><div class="panel-h"><b>Daily practice</b></div>
      <div class="fr-row"><span>Drill</span><select data-bap-sel="drill">${drills}</select></div>
      ${B.drill === "mate" ? `<div class="fr-row"><span>With</span><select data-bap-sel="mate">${mates.map(p => `<option value="${esc(p.id)}"${B.mate === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>` : ""}
      <p class="note" style="padding:0 14px 12px">Every day of the season you get XP from practice, and your drill slowly raises that rating. Working with a teammate earns less XP but builds your friendship. Close friends play better together.</p></div>
      <div class="panel"><div class="panel-h"><b>Settings</b></div><div class="fr-row"><span>Key moments</span><div class="seg"><button data-bap="moments" data-v="1" aria-pressed="${F.settings.moments !== false}">On</button><button data-bap="moments" data-v="0" aria-pressed="${F.settings.moments === false}">Off</button></div></div></div></div></div>`;
}
function bapCareerHtml() {
  const F = FR, me = bapMe(F), B = F.bap, s = F.S.stats[F.me] || frBlank(), ps = F.S.pstats[F.me];
  const row = (lab, x, team) => `<tr><td>${lab}</td><td>${team ? tLogo(team) + tAbbr(team) : ""}</td><td class="num">${x.gp}</td><td class="num">${x.g}</td><td class="num">${x.a}</td><td class="num"><b>${x.g + x.a}</b></td><td class="num">${x.pm > 0 ? "+" : ""}${x.pm}</td><td class="num">${x.pim}</td><td class="num">${x.sog}</td><td class="num">${(x.ppg || 0) + (x.ppa || 0)}</td><td class="num">${x.hit}</td><td class="num">${x.gp ? fmtToi(x.toi / x.gp) : "–"}</td></tr>`;
  const seasons = row("Season " + F.season + (F.phase === "offseason" ? "" : " (now)"), s, me.team) + (ps && ps.gp ? row("Playoffs", ps, me.team) : "") + B.career.map(c => row("Season " + c.season + (c.champ ? " 🏆" : ""), c, c.team) + (c.pgp ? row("Playoffs", { gp: c.pgp, g: c.pg, a: c.pa, pm: 0, pim: 0, sog: 0, hit: 0, toi: 0 }, c.team) : "")).join("");
  const tot = B.career.reduce((a, c) => ({ gp: a.gp + c.gp, g: a.g + c.g, a: a.a + c.a }), { gp: s.gp, g: s.g, a: s.a });
  const awards = B.career.flatMap(c => c.awards.map(a => "Season " + c.season + ": " + a));
  const log = B.log.slice(0, 30).map(e => `<tr><td>${e.po ? "PO" : "D" + (e.d + 1)}</td><td>${e.home ? "vs" : "@"} ${tLogo(e.opp)}${tAbbr(e.opp)}</td><td>${esc(e.res)}</td>${e.scratch ? `<td colspan="7" class="note">Healthy scratch</td>` : `<td class="num"><span class="g sm" data-g="${esc(e.grade)}">${esc(e.grade)}</span></td><td class="num">${e.g}</td><td class="num">${e.a}</td><td class="num">${e.pm > 0 ? "+" : ""}${e.pm}</td><td class="num">${e.sog}</td><td class="num">${fmtToi(e.toi)}</td><td class="num">${e.moments ? e.great + "/" + e.moments : "–"}</td>`}</tr>`).join("");
  const tr = B.tr ? `<p class="note">You asked for a trade on day ${B.tr.day + 1}. Your club is shopping you around.</p>` : `<button class="btn danger" data-bap="trade"${F.phase === "playoffs" || F.phase === "done" ? " disabled" : ""}>Request a trade</button><span class="note">Your club will move you within a couple of weeks. The coach and your teammates won't love it.</span>`;
  return `<div class="panel"><div class="panel-h"><b>Career · ${tot.gp} GP · ${tot.g} G · ${tot.a} A · ${tot.g + tot.a} P</b><span class="note">${B.great} great reads in ${B.moments} key moments</span></div>
      <div class="tscroll"><table class="fr-tbl"><thead><tr><th></th><th>Team</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">+/-</th><th class="num">PIM</th><th class="num">SOG</th><th class="num">PPP</th><th class="num">HIT</th><th class="num">TOI/G</th></tr></thead><tbody>${seasons}</tbody></table></div>
      ${awards.length ? `<p class="note" style="padding:0 14px">Awards: ${esc(awards.join(" · "))}</p>` : ""}</div>
    <div class="panel"><div class="panel-h"><b>Contract</b><span class="note">${money(me.con.sal)} a year · ${yrs(me.con.yrs)} left · ${tName(me.team)}</span></div><div class="fr-simbar">${tr}</div></div>
    <div class="panel"><div class="panel-h"><b>Game log</b><span class="note">Reads = great reads / key moments</span></div><div class="tscroll lim"><table class="fr-tbl"><thead><tr><th></th><th>Opp</th><th>Result</th><th class="num">Grade</th><th class="num">G</th><th class="num">A</th><th class="num">+/-</th><th class="num">SOG</th><th class="num">TOI</th><th class="num">Reads</th></tr></thead><tbody>${log || `<tr><td colspan="10" class="note">No games yet.</td></tr>`}</tbody></table></div></div>`;
}
function bapTeamHtml() {
  const F = FR, me = bapMe(F), B = F.bap, t = frTeam(me.team), L = frLineupFor(F, me.team);
  const chip = p => `<span class="bap-chip${p.id === me.id ? " me" : ""}">${chibiHead(p.name, 30, t)}<span><b>${esc(p.name)}</b><small>${p.pos} · ${overall(p)}</small></span></span>`;
  const lines = L.fLines.map((u, i) => `<div class="bap-line"><i>Line ${i + 1}</i>${u.map(chip).join("")}</div>`).join("") + L.dPairs.map((u, i) => `<div class="bap-line"><i>Pair ${i + 1}</i>${u.map(chip).join("")}</div>`).join("") + `<div class="bap-line"><i>Goalies</i>${L.goalies.filter(Boolean).map(chip).join("")}</div>`;
  const rel = F.players.filter(p => p.team === me.team && p.id !== me.id).sort((a, b) => (B.rel[b.id] ?? 40) - (B.rel[a.id] ?? 40)).map(p => { const v = B.rel[p.id] ?? 40, fr = me.friends.includes(p.name); return `<li>${chibiHead(p.name, 28, t)}<span>${esc(p.name)} <small>${p.pos}${fr ? " · friend" : ""}</small></span>${bapMeter(v, fr ? "hype" : "trust")}<b>${Math.round(v)}</b></li>`; }).join("");
  return `<div class="fr-home"><div class="fr-col"><div class="panel"><div class="panel-h">${tLogo(me.team, 26)}<b>${tName(me.team)} lineup</b><span class="note">${esc(bapRoleText(bapRole(F)))}</span></div><div class="bap-lines">${lines}</div></div></div>
    <div class="fr-col"><div class="panel"><div class="panel-h"><b>Teammates</b><span class="note">Score together and practice together to get closer. At 75 you become friends.</span></div><ul class="fr-list">${rel}</ul></div></div></div>`;
}
function bapLeagueHtml() {
  const seg = [["standings", "Standings"], ["stats", "Stats"], ["schedule", "Schedule"]].concat(FR.S.po ? [["playoffs", "Playoffs"]] : []).map(([k, l]) => `<button data-bap="ltab" data-v="${k}" aria-pressed="${bapLeagueTab === k}">${l}</button>`).join("");
  const body = { standings: frStandingsHtml, stats: frStatsHtml, schedule: frScheduleHtml, playoffs: frBracketHtml }[bapLeagueTab] || frStandingsHtml;
  return `<div class="seg bap-lseg">${seg}</div>${body()}`;
}

// ---------- actions ----------
async function bapAction(b) {
  const a = b.dataset.bap, v = b.dataset.v, id = b.dataset.id;
  bapMsg = ""; frMsg = "";
  switch (a) {
    case "new": bapStartSetup(); break;
    case "cancel": bapSetup = null; break;
    case "set": bapReadForm(); bapSetup[b.dataset.k] = v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
      if (b.dataset.k === "pos") { const g = v === "D" ? "D" : "F"; if (!STYLES[g].includes(bapSetup.style) || !(BAP_STYLE[bapSetup.style] || ["Two-Way", "Enforcer"].includes(bapSetup.style))) bapSetup.style = g === "D" ? "Two-Way" : "Sniper"; bapSetup.alloc = {}; bapSetup.sp = 12; }
      if (b.dataset.k === "style") { bapSetup.alloc = {}; bapSetup.sp = 12; }
      break;
    case "step": bapReadForm(); if (+v === 2 && !bapSetup.name) return; bapSetup.step = +v; break;
    case "alloc": { const s = bapSetup, p = bapPreview(), k = b.dataset.k, n = +v; if (n > 0) { const c = bapCost(p[k]); if (s.sp >= c) { s.sp -= c; s.alloc[k] = (s.alloc[k] || 0) + 1; } } else if (s.alloc[k]) { s.alloc[k]--; s.sp += bapCost(p[k] - 1); } } break;
    case "create": bapCreate(); break;
    case "open": await frOpen(id); if (FR && FR.mode !== "bap") FR = null; bapTab = "home"; break;
    case "del": { const s = frSaves.find(x => x.id === id); if (!(await uiConfirm("Delete “" + (s ? s.name : "this career") + "” for everyone? This can't be undone.", "Delete", true))) return; await frDelete(id); } break;
    case "saves": if (FR && frStore.state === "saving") await frFlush(); FR = null; bapSetup = null; try { localStorage.removeItem(BAP_LAST); } catch (e) {} await frLoadIndex(); break;
    case "draft": bapDraft(FR); frSave(); break;
    case "cstart": bapCombineSetup(FR); frSave(); break;
    case "cskip": if (!FR.bap.combine) FR.bap.combine = { mine: null, opps: [], games: [], stock: 0 }; FR.bap.combine.done = true; frSave(); break;
    case "cplay": bapCombineWatch(+v); return;
    case "csim": bapCombineSim(FR, +v); frSave(); break;
    case "seen": FR.bap.seen = 1; frSave(); break;
    case "tab": bapTab = v; break;
    case "ltab": bapLeagueTab = v; break;
    case "simmine": { const g = bapTodayGame(FR); if (g) { frSimGame(FR, g.id); if (frDayDone(FR)) frEndDay(FR); frSave(); } } break;
    case "answer": if (+v < 0) FR.bap.interview = null; else bapAnswer(FR, +v); frSave(); break;
    case "spend": bapMsg = bapSpend(FR, b.dataset.k); frSave(); break;
    case "moments": FR.settings.moments = v === "1"; frSave(); break;
    case "trade": if (!(await uiConfirm("Ask for a trade? Your coach's trust and your teammates' opinion of you will drop.", "Request a trade", true))) return; bapMsg = bapRequestTrade(FR) || "Your agent has told the club you want out."; frSave(); break;
    case "sign": bapMsg = bapSign(FR, +v); frSave(); break;
    case "nextseason": bapMsg = bapNextSeason(FR); frSave(); break;
  }
  renderBap();
}
function bapWire() {
  const root = bapRoot();
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-bap]"); if (b && !b.disabled) { e.preventDefault(); bapAction(b); return; }
    const f = e.target.closest("[data-fr]"); if (f && !f.disabled) { e.preventDefault(); frAction(f); }
  });
  root.addEventListener("change", e => {
    const el = e.target;
    if (el.dataset.bapSel === "drill") { FR.bap.drill = el.value; if (el.value === "mate" && !FR.bap.mate) { const m = FR.players.find(p => p.team === FR.user && p.id !== FR.me); FR.bap.mate = m ? m.id : null; } frSave(); renderBap(); return; }
    if (el.dataset.bapSel === "mate") { FR.bap.mate = el.value; frSave(); return; }
    if (bapSetup && /^bap(Hair|Eye|Blaze)$/.test(el.id)) { bapReadForm(); renderBap(); return; }
    if (el.dataset.frSel === "stTeam") { frUi.stTeam = el.value; renderBap(); return; }
    if (el.dataset.frChk === "schedMine") { frUi.schedMine = el.checked; renderBap(); }
  });
  root.addEventListener("input", e => {
    const el = e.target;
    if (bapSetup && /^bap(Name|Tag|No|Hair|Eye)$/.test(el.id)) {
      bapReadForm();
      const card = root.querySelector(".bap-card"); if (card) card.querySelector("b").textContent = bapSetup.name || "Your player";
      const nx = root.querySelector('[data-bap="step"][data-v="2"]'); if (nx) nx.disabled = !bapSetup.name;
    }
  });
}
bapWire();
