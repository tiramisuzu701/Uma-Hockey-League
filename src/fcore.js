// ---------- Franchise: league logic (no DOM) ----------
const FR_VERSION = 1;
// the ten clubs of the league, named for the JRA racecourse towns
const FR_TEAMS = [
  { id: "FCH", name: "Fuchu Comets", abbr: "FCH", color: "#1D3A8A", color2: "#F2B705", color3: "#FFFFFF", logo: { shape: "shield", emblem: "star" } },
  { id: "NKY", name: "Nakayama Tempest", abbr: "NKY", color: "#0E6B4A", color2: "#FFFFFF", color3: "#9BD3B5", logo: { shape: "hexagon", emblem: "bolt" } },
  { id: "KYO", name: "Kyoto Kitsune", abbr: "KYO", color: "#5B2A86", color2: "#F0C24B", color3: "#FFFFFF", logo: { shape: "crest", emblem: "crown" } },
  { id: "TKZ", name: "Takarazuka Roses", abbr: "TKZ", color: "#C8336E", color2: "#FFF0F5", color3: "#2B1B2E", logo: { shape: "roundel", emblem: "laurel" } },
  { id: "SAP", name: "Sapporo Snow Owls", abbr: "SAP", color: "#2F7FC8", color2: "#FFFFFF", color3: "#0E2A4A", logo: { shape: "diamond", emblem: "wings" } },
  { id: "HKD", name: "Hakodate Harbor Hawks", abbr: "HKD", color: "#0F6E74", color2: "#F28C28", color3: "#FFFFFF", logo: { shape: "shield", emblem: "horse" } },
  { id: "NIG", name: "Niigata Northern Lights", abbr: "NIG", color: "#1E1F26", color2: "#7FE0C4", color3: "#B48CF2", logo: { shape: "roundel", emblem: "star" } },
  { id: "KOK", name: "Kokura Kirin", abbr: "KOK", color: "#E0601B", color2: "#1B2A4A", color3: "#FFFFFF", logo: { shape: "crest", emblem: "horseshoe" } },
  { id: "FKS", name: "Fukushima Fireflies", abbr: "FKS", color: "#1C2B45", color2: "#D8F25A", color3: "#F6FBE0", logo: { shape: "roundel", emblem: "firefly" } },
  { id: "CKY", name: "Chukyo Thunder", abbr: "CKY", color: "#F2B705", color2: "#232633", color3: "#FFFFFF", logo: { shape: "shield", emblem: "storm" } }
];
const FR_RULES = { rounds: 16, minF: 9, minD: 4, minG: 2, maxRoster: 20, minSal: 0.75, maxF: 11, maxD: 6, maxG: 2 };
const FR_INJ = ["upper-body injury", "lower-body injury", "sprained knee", "bruised shoulder", "concussion protocol", "sore wrist", "groin strain", "ankle sprain", "hand injury", "rib injury"];

function frRand() { return Math.random(); }
function frGauss() { let u = 0, v = 0; while (!u) u = frRand(); while (!v) v = frRand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function frPoisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= frRand(); } while (p > L); return k - 1; }
function frPick(arr, w) { let tot = 0; for (const x of arr) tot += Math.max(0, w(x)); let r = frRand() * tot; for (const x of arr) { r -= Math.max(0, w(x)); if (r <= 0) return x; } return arr[arr.length - 1]; }
function frShuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(frRand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const frId = () => Math.random().toString(36).slice(2, 10);
const money = v => "$" + (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, "") + "M";

// ---------- contracts ----------
// what a player of this overall is worth per season, in $M
function fairSalary(o) { const x = Math.max(0, o - 66) / 21; return Math.round(Math.min(13, FR_RULES.minSal + 11.25 * Math.pow(x, 2.1)) * 20) / 20; }
// a player's asking price: fair value nudged by who she is and how her season went
function askSalary(p, season) { const h = nameHash(p.name + "|" + (season || 1), 41); return Math.max(FR_RULES.minSal, Math.round(fairSalary(overall(p)) * (0.9 + h * 0.2) * 20) / 20); }
function askYears(p, season) { const h = nameHash(p.name + "|yrs" + (season || 1), 43); return h < 0.2 ? 1 : h < 0.45 ? 2 : h < 0.7 ? 3 : h < 0.88 ? 4 : 5; }
function frPayroll(F, tid) {
  let s = 0; for (const p of F.players) if (p.team === tid && p.con) s += p.con.sal;
  const t = F.teams.find(x => x.id === tid); if (t && t.dead) for (const d of t.dead) s += d.amt;
  return Math.round(s * 100) / 100;
}
function frCapSpace(F, tid) { return Math.round((F.cap - frPayroll(F, tid)) * 100) / 100; }

// ---------- trade value ----------
function tradeValue(p, F) {
  const o = overall(p), con = p.con || { sal: fairSalary(o), yrs: 1 };
  let v = fairSalary(o) * 1.15 + 0.4 + (fairSalary(o) - con.sal) * Math.min(3, con.yrs) * 0.35;
  if (p.inj) v *= 1 - Math.min(0.5, p.inj.g / 40);
  return Math.max(0.05, v);
}
// how badly a team wants a player at her position: does she beat who they dress there?
function needMul(F, tid, p, excluding) {
  const g = posGroup(p), mine = F.players.filter(x => x.team === tid && posGroup(x) === g && !(excluding && excluding.has(x.id))).map(overall).sort((a, b) => b - a);
  const dressN = g === "F" ? 9 : g === "D" ? 4 : 1, need = g === "F" ? FR_RULES.minF : g === "D" ? FR_RULES.minD : FR_RULES.minG;
  const worst = mine.length >= dressN ? mine[dressN - 1] : 50;
  const o = overall(p);
  let m = o > worst + 4 ? 1.22 : o > worst ? 1.1 : 0.85;
  if (mine.length < need) m += 0.25;
  return m;
}

// ---------- lineups ----------
function frHealthy(F, tid) { return F.players.filter(p => p.team === tid && !p.inj); }
// assign line numbers from scratch: best players on top, positions kept where we can
function frAutoLines(F, tid) {
  const overall = p => globalThis.overall(p) + (F.mode === "bap" && p.id === F.me && F.bap ? (F.bap.trust - 50) / 5 : 0);
  const all = F.players.filter(p => p.team === tid);
  for (const p of all) p.line = 0;
  const ok = all.filter(p => !p.inj);
  const gs = ok.filter(p => posGroup(p) === "G").sort((a, b) => overall(b) - overall(a));
  gs.slice(0, 2).forEach((g, i) => g.line = i + 1);
  const ds = ok.filter(p => posGroup(p) === "D").sort((a, b) => overall(b) - overall(a)).slice(0, 2 * N_DPAIRS);
  for (let k = 0; k < N_DPAIRS; k++) {
    const pair = ds.slice(k * 2, k * 2 + 2); pair.forEach(p => p.line = k + 1);
    if (pair.length === 2) { const [a, b] = pair; const la = shootsOf(a) === "L", lb = shootsOf(b) === "L"; a.side = la || !lb ? "L" : "R"; b.side = a.side === "L" ? "R" : "L"; }
  }
  const fs = ok.filter(p => posGroup(p) === "F").sort((a, b) => overall(b) - overall(a)).slice(0, 3 * N_FLINES);
  const left = fs.slice();
  for (let L = 1; L <= N_FLINES; L++) {
    for (const pos of ["C", "LW", "RW"]) {
      const i = left.findIndex(p => p.pos === pos); const j = i >= 0 && (left[0] && overall(left[0]) - overall(left[i]) <= 6) ? i : (i >= 0 ? i : 0);
      const p = left.splice(j, 1)[0]; if (p) p.line = L;
    }
  }
  frChemShuffle(F, fs, ds, gs[0], overall);
  const t = F.teams.find(x => x.id === tid); if (t) { t.pp = null; t.pk = null; }
}
// fine-tune auto lines for chemistry: swap players between lines (or pairs) when friendship and
// familiarity are worth more than the small drop in who gets the top minutes
function frChemShuffle(F, fs, ds, g, ovr) {
  const FW = [0.4, 0.32, 0.28], DW = [0.53, 0.47], LAMBDA = 0.035;
  const lines = [1, 2, 3].map(L => fs.filter(p => p.line === L)), pairs = [1, 2].map(L => ds.filter(p => p.line === L));
  if (lines.some(l => l.length !== 3) || pairs.some(l => l.length !== 2)) return;
  const score = () => {
    let s = 0;
    lines.forEach((l, i) => { s += FW[i] * l.reduce((a, p) => a + ovr(p), 0); s += LAMBDA * unitChemistry([...l, ...pairs[Math.min(i, 1)], g].filter(Boolean), F.fam).value; });
    pairs.forEach((l, i) => { s += DW[i] * l.reduce((a, p) => a + ovr(p), 0); });
    return s;
  };
  let best = score();
  for (let it = 0; it < 4; it++) {
    let improved = false;
    const groups = [lines, pairs];
    for (const G of groups) for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) for (let a = 0; a < G[i].length; a++) for (let b = 0; b < G[j].length; b++) {
      const A = G[i][a], B = G[j][b];
      if (G === lines && A.pos !== B.pos) continue; // keep a center on every line
      G[i][a] = B; G[j][b] = A;
      const sc = score();
      if (sc > best + 0.01) { best = sc; improved = true; } else { G[i][a] = A; G[j][b] = B; }
    }
    if (!improved) break;
  }
  lines.forEach((l, i) => l.forEach(p => p.line = i + 1));
  pairs.forEach((l, i) => { l.forEach(p => p.line = i + 1); const [x, y] = l; const lx = shootsOf(x) === "L", ly = shootsOf(y) === "L"; x.side = lx || !ly ? "L" : "R"; y.side = x.side === "L" ? "R" : "L"; });
}
// the league object the engine and lineup builder read: injured players stay home
function frGameLeague(F, ids, copy) {
  const set = new Set(ids);
  const players = F.players.filter(p => set.has(p.team) && !p.inj);
  const L = { teams: F.teams.filter(t => set.has(t.id)), players, fam: F.fam || null };
  return copy ? JSON.parse(JSON.stringify(L)) : L;
}
// which goalie starts: the backup gets every Nth game
function frStarter(F, tid) {
  const t = F.teams.find(x => x.id === tid); const gs = frHealthy(F, tid).filter(p => posGroup(p) === "G").sort((a, b) => (a.line || 9) - (b.line || 9) || overall(b) - overall(a));
  if (gs.length < 2) return gs[0] || null;
  const every = t.gRot || 4; t.gCount = (t.gCount || 0) + 1;
  return every > 0 && t.gCount % every === 0 ? gs[1] : gs[0];
}
function frLineupFor(F, tid, starter) {
  const L = frGameLeague(F, [tid]);
  if (starter) { L.players = L.players.map(p => posGroup(p) === "G" ? Object.assign({}, p, { line: p.id === starter.id ? 1 : p.line === 1 ? 2 : p.line }) : p); }
  return buildLineup(L, tid);
}

// ---------- Quick Play league: the clubs, rosters dealt out by a quiet snake draft ----------
function frBaseTeam(t) { return Object.assign({ pp: null, pk: null, tactics: { pp: "131", pk: "box", fc: "122", agg: 50 } }, JSON.parse(JSON.stringify(t))); }
// keep: hold on to the existing clubs' names, colors and tactics (a v8 league) and add the new ones
function toClubs(L, keep) {
  const old = keep ? new Map((L.teams || []).map(t => [t.id, t])) : new Map();
  const teams = FR_TEAMS.map(t => { const o = old.get(t.id); return o ? Object.assign(frBaseTeam(t), o, { pp: null, pk: null }) : frBaseTeam(t); });
  const F = { temp: true, teams, players: L.players, news: [], season: 1, phase: "draft" };
  for (const p of F.players) { p.team = "POOL"; p.line = 0; p.con = { sal: askSalary(p, 1), yrs: 1 }; }
  F.cap = frCapFor(F);
  F.draft = { order: frShuffle(F.teams.map(t => t.id)), rounds: FR_RULES.rounds, picks: [], idx: 0, snake: true };
  draftAdvance(F, true);
  for (const p of F.players) { delete p.con; delete p.inj; }
  L.teams = F.teams.map(t => { const x = Object.assign({}, t); delete x.dead; return x; });
}

function toEightTeams(L) { return toClubs(L, false); } // older name, still called by saves mid-upgrade
// the cap: what an average team would spend on 16 good players, with room to work
function frCapFor(F) {
  const n = F.teams.length, sals = F.players.map(p => p.con.sal).sort((a, b) => b - a).slice(0, n * FR_RULES.rounds);
  return Math.round(sals.reduce((a, b) => a + b, 0) / n * 1.1 * 2) / 2;
}
// ---------- new franchise ----------
// every new save starts from the league's own clubs: names, colors and crests edited in another save never carry over
function frTeamsFrom(league) {
  return FR_TEAMS.map(t => Object.assign(frBaseTeam(t), { dead: [], gRot: 4, gCount: 0 }));
}
function frNew(league, opts) {
  const F = { v: FR_VERSION, id: frId(), name: opts.name || "My franchise", created: Date.now(), season: 1, phase: "draft",
    user: opts.user, settings: Object.assign({ games: 28, series: 7, trades: "normal", autoLines: true, injuries: true }, opts.settings || {}),
    teams: frTeamsFrom(league), players: [], news: [], offers: [], history: [], day: 0, off: null, fam: {}, chemV: 1 };
  if (opts.teamEdit) Object.assign(F.teams.find(t => t.id === opts.user), opts.teamEdit);
  F.players = JSON.parse(JSON.stringify(league.players)).map(p => {
    p.team = "POOL"; p.line = 0; p.inj = null; p.dev = Math.round((nameHash(p.name, 91) * 2.4 - 1) * 10) / 10;
    p.con = { sal: askSalary(p, 1), yrs: askYears(p, 1) }; return p;
  });
  F.cap = frCapFor(F);
  const r1 = frShuffle(F.teams.map(t => t.id));
  F.draft = { order: r1, rounds: FR_RULES.rounds, picks: [], idx: 0, snake: true };
  frNews(F, "The draft order is set. " + F.teams.find(t => t.id === r1[0]).name + " pick first.");
  return F;
}
function frNewsKind(txt) { return /^Trade:/.test(txt) ? "trade" : / release /.test(txt) ? "release" : / sign | re-signed | fill out the roster| leaves /.test(txt) ? "sign" : /is out|injur|healthy and back/.test(txt) ? "injury" : /Hat trick|goals!|Shutout/.test(txt) ? "milestone" : /Training/.test(txt) ? "training" : /win the|Playoffs|semifinal|final|Cup/.test(txt) ? "playoffs" : "league"; }
function frNews(F, txt, team, k) { F.news.unshift({ s: F.season, d: F.phase === "offseason" ? -1 : F.day, txt, team: team || null, k: k || frNewsKind(txt) }); if (F.news.length > 150) F.news.length = 150; }

// ---------- draft ----------
function draftTeamAt(F, idx) { const n = F.teams.length, r = Math.floor(idx / n), k = idx % n; return F.draft.order[r % 2 === 1 && F.draft.snake ? n - 1 - k : k]; }
function draftDone(F) { return F.draft.idx >= F.draft.rounds * F.teams.length; }
function draftCounts(F, tid) { const c = { F: 0, D: 0, G: 0, n: 0 }; for (const p of F.players) if (p.team === tid) { c[posGroup(p)]++; c.n++; } return c; }
function draftPool(F) { return F.players.filter(p => p.team === "POOL"); }
// can this team take this player without painting itself into a corner?
function draftLegal(F, tid, p) {
  const c = draftCounts(F, tid), g = posGroup(p), left = F.draft.rounds - c.n - 1;
  if (left < 0) return "Roster is full.";
  const max = { F: FR_RULES.maxF, D: FR_RULES.maxD, G: FR_RULES.maxG }[g];
  if (c[g] + 1 > max) return "Already has " + c[g] + " " + ({ F: "forwards", D: "defenders", G: "goalies" })[g] + ".";
  c[g]++;
  const need = Math.max(0, FR_RULES.minF - c.F) + Math.max(0, FR_RULES.minD - c.D) + Math.max(0, FR_RULES.minG - c.G);
  if (need > left) return "Needs to save picks for " + [c.F < FR_RULES.minF ? "forwards" : "", c.D < FR_RULES.minD ? "defenders" : "", c.G < FR_RULES.minG ? "goalies" : ""].filter(Boolean).join(" and ") + ".";
  if (frPayroll(F, tid) + p.con.sal + left * FR_RULES.minSal > F.cap + 1e-6) return "Not enough cap space.";
  return "";
}
// goalies are hard to project and a club only needs one starter, so scouts mark them down early
// by overall pick: nobody spends a top-7 pick on one; a club might gamble at 8-10; the discount fades by the third round
function draftGoaliePen(F) { const i = F && F.draft ? F.draft.idx : 0, n = F && F.teams ? F.teams.length : 10; return i < 7 ? 9 : i < 10 ? 5 : i < 2 * n ? 4 : i < 3 * n ? 2 : 0; }
// the big board: overall, with goalies slotted the way scouts would rank them before the draft
function draftValue(p) { return overall(p) - (posGroup(p) === "G" ? 5 : 0); }
function draftScore(F, tid, p) {
  const c = draftCounts(F, tid), g = posGroup(p), left = F.draft.rounds - c.n;
  const need = g === "F" ? FR_RULES.minF - c.F : g === "D" ? FR_RULES.minD - c.D : FR_RULES.minG - c.G;
  const o = overall(p);
  let s = o + (need > 0 ? 6 * need / Math.max(1, left) : -3);
  if (g === "G") s += (c.G === 0 ? 2 : -1) - draftGoaliePen(F);
  const space = F.cap - frPayroll(F, tid) - left * FR_RULES.minSal;
  s -= Math.max(0, p.con.sal - fairSalary(o)) * 0.6;
  if (space < 12) s -= (p.con.sal - FR_RULES.minSal) * (12 - space) / 10;
  const mates = F.players.filter(x => x.team === tid);
  for (const m of mates) if (areFriends(m, p)) s += 0.8;
  return s + frGauss() * 1.2;
}
function draftBest(F, tid) {
  const pool = draftPool(F).filter(p => !draftLegal(F, tid, p));
  if (!pool.length) return draftPool(F).sort((a, b) => a.con.sal - b.con.sal)[0] || null;
  let best = null, bs = -1e9; for (const p of pool) { const s = draftScore(F, tid, p); if (s > bs) { bs = s; best = p; } }
  return best;
}
function draftMake(F, pid) {
  const tid = draftTeamAt(F, F.draft.idx), p = F.players.find(x => x.id === pid);
  if (!p || p.team !== "POOL") return false;
  p.team = tid; F.draft.picks.push({ i: F.draft.idx, team: tid, pid });
  F.draft.idx++;
  if (draftDone(F)) draftFinish(F);
  return true;
}
// run AI picks; stop at the user's turn unless auto is set
function draftAdvance(F, untilEnd) {
  let n = 0;
  while (!draftDone(F)) {
    const tid = draftTeamAt(F, F.draft.idx);
    if (tid === F.user && !untilEnd) break;
    const p = draftBest(F, tid); if (!p) { F.draft.idx++; continue; }
    draftMake(F, p.id); n++;
  }
  return n;
}
function draftFinish(F) {
  for (const p of F.players) if (p.team === "POOL") { p.team = "FA"; p.line = 0; }
  for (const t of F.teams) frAutoLines(F, t.id);
  if (F.temp) return;
  frNews(F, "The draft is complete. " + F.players.filter(p => p.team === "FA").length + " players are left as free agents.");
  frStartSeason(F);
}

// ---------- schedule ----------
function frRoundRobin(ids) {
  const a = ids.slice(); if (a.length % 2) a.push(null);
  const n = a.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x && y) pairs.push(r % 2 ? [x, y] : [y, x]); }
    rounds.push(pairs);
    a.splice(1, 0, a.pop());
  }
  return rounds;
}
function frStartSeason(F) {
  F.phase = "season"; F.day = 0; F.offers = []; F.off = null;
  const ids = F.teams.map(t => t.id), base = frRoundRobin(frShuffle(ids.slice()));
  const cycles = Math.max(1, Math.round(F.settings.games / (ids.length - 1)));
  const days = [];
  for (let c = 0; c < cycles; c++) { const rs = frShuffle(base.map(r => r.map(([h, a]) => c % 2 ? [a, h] : [h, a]))); days.push(...rs); }
  const S = { n: F.season, games: [], days: [], stats: {}, pstats: {}, po: null };
  days.forEach((pairs, d) => { S.days.push(pairs.map(([h, a]) => { const g = { id: "g" + S.games.length, d, h, a, st: "pending" }; S.games.push(g); return g.id; })); });
  F.regDays = S.days.length;
  F.deadline = Math.floor(S.days.length * 0.7);
  for (const t of F.teams) { t.gCount = 0; }
  F.S = S;
  frNews(F, "Season " + F.season + " begins: " + S.days.length + " game days, trade deadline after day " + F.deadline + ".");
}
function frGame(F, gid) { return F.S.games.find(g => g.id === gid); }
function frTodayGames(F) { const ids = F.S.days[F.day] || []; return ids.map(id => frGame(F, id)); }

// ---------- standings ----------
function frStandings(F) {
  const T = {}; for (const t of F.teams) T[t.id] = { id: t.id, gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, row: 0, l10: [], strk: "" , home: [0, 0, 0], away: [0, 0, 0] };
  for (const g of F.S.games) {
    if (g.st !== "final" || g.po) continue;
    const H = T[g.h], A = T[g.a]; if (!H || !A) continue;
    H.gp++; A.gp++; H.gf += g.hs; H.ga += g.as; A.gf += g.as; A.ga += g.hs;
    const hw = g.hs > g.as, W = hw ? H : A, L = hw ? A : H;
    W.w++; W.pts += 2; if (g.dec !== "SO") W.row++;
    if (g.dec === "REG") L.l++; else { L.otl++; L.pts++; }
    W.l10.push("W"); L.l10.push(g.dec === "REG" ? "L" : "O");
    (hw ? H.home : A.away)[0]++; (hw ? A.away : H.home)[g.dec === "REG" ? 1 : 2]++;
  }
  const rows = Object.values(T);
  for (const r of rows) { const last = r.l10[r.l10.length - 1]; let k = 0; for (let i = r.l10.length - 1; i >= 0 && r.l10[i] === last; i--) k++; r.strk = last ? (last === "O" ? "OT" : last) + k : "–"; r.l10 = r.l10.slice(-10); }
  return rows.sort((a, b) => b.pts - a.pts || a.gp - b.gp || b.row - a.row || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

// ---------- quick sim ----------
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 70;
function frRt(p, k) { const v = p[k]; return v == null ? 60 : Number(v); }
function offF(p) { return frRt(p, "sht") * 0.35 + frRt(p, "pas") * 0.3 + frRt(p, "hnd") * 0.2 + frRt(p, "skt") * 0.15; }
function offD(p) { return frRt(p, "sht") * 0.3 + frRt(p, "pas") * 0.4 + frRt(p, "hnd") * 0.15 + frRt(p, "skt") * 0.15; }
function defF(p) { return frRt(p, "def") * 0.5 + frRt(p, "chk") * 0.2 + frRt(p, "skt") * 0.3; }
function defD(p) { return frRt(p, "def") * 0.6 + frRt(p, "chk") * 0.2 + frRt(p, "skt") * 0.2; }
function frSide(F, tid, starter) {
  const L = frLineupFor(F, tid, starter), t = F.teams.find(x => x.id === tid);
  const fs = L.fLines.length === 3 ? [0.4, 0.32, 0.28] : L.fLines.length === 2 ? [0.55, 0.45] : [1];
  const ds = L.dPairs.length === 2 ? [0.53, 0.47] : [1];
  let O = 0, D = 0, chem = 0;
  L.fLines.forEach((u, i) => { O += fs[i] * avg(u.map(offF)) * 0.7; D += fs[i] * avg(u.map(defF)) * 0.4; chem += fs[i] * unitChemistry([...u, ...unitPair(L, i), L.goalies[0]].filter(Boolean), F.fam).value; });
  L.dPairs.forEach((u, i) => { O += ds[i] * avg(u.map(offD)) * 0.3; D += ds[i] * avg(u.map(defD)) * 0.6; });
  const g = L.goalies[0];
  const share = {};
  L.fLines.forEach((u, i) => u.forEach(p => share[p.id] = { s: fs[i], u: i, g: "F" }));
  L.dPairs.forEach((u, i) => u.forEach(p => share[p.id] = { s: ds[i], u: i, g: "D" }));
  const agg = (t.tactics && t.tactics.agg != null ? t.tactics.agg : 50) / 100;
  return { tid, L, O: O + (chem - FR_CHEM_MID) / 14, D, G: g ? frRt(g, "goal") * 0.9 + frRt(g, "clu") * 0.1 : 50, g, share, agg,
    dis: avg([...L.fLines.flat(), ...L.dPairs.flat()].map(p => frRt(p, "dis"))), chk: avg([...L.fLines.flat(), ...L.dPairs.flat()].map(p => frRt(p, "chk"))) };
}
function frBlank() { return { gp: 0, g: 0, a: 0, pm: 0, pim: 0, sog: 0, ppg: 0, ppa: 0, shg: 0, sha: 0, gwg: 0, hit: 0, blk: 0, toi: 0, gs: 0, w: 0, l: 0, otl: 0, sa: 0, sv: 0, ga: 0, so: 0 }; }
function frQuickSim(F, game, playoff) {
  const sides = [frSide(F, game.h, frStarter(F, game.h)), frSide(F, game.a, frStarter(F, game.a))];
  const ps = {}, st = id => ps[id] || (ps[id] = frBlank());
  const goals = [], sog = [0, 0], score = [0, 0], pims = [0, 0], ppo = [0, 0], ppgl = [0, 0];
  for (const S of sides) { for (const p of [...S.L.fLines.flat(), ...S.L.dPairs.flat()]) { st(p.id).gp = 1; } if (S.g) { st(S.g.id).gp = 1; st(S.g.id).gs = 1; } }
  const shooterW = (S, p) => { const sh = S.share[p.id]; if (!sh) return 0; const sty = { Sniper: 1.3, "Power Forward": 1.15, Playmaker: 0.8, Offensive: 1.3, "Stay-at-Home": 0.65, Enforcer: 0.75, Grinder: 0.9 }[p.style] || 1; return sh.s * (sh.g === "D" ? 0.45 : 1) * sty * Math.pow(frRt(p, "sht") / 75, 1.4); };
  const unitOf = (S, p) => { const sh = S.share[p.id]; if (!sh) return []; if (sh.g === "F") { const pair = S.L.dPairs[sh.u < S.L.dPairs.length ? sh.u : Math.floor(frRand() * S.L.dPairs.length)] || []; return [...S.L.fLines[sh.u], ...pair]; } const line = frPick(S.L.fLines.map((u, i) => i), i => [0.4, 0.32, 0.28][i] || 0.3); return [...(S.L.fLines[line] || []), ...S.L.dPairs[sh.u]]; };
  const assist = (pool, scorer) => { const out = []; const c = pool.filter(p => p.id !== scorer.id); if (c.length && frRand() < 0.88) { const a = frPick(c, p => frRt(p, "pas") * (posGroup(p) === "D" ? 0.7 : 1)); out.push(a); if (frRand() < 0.62) { const c2 = c.filter(p => p !== a); if (c2.length) out.push(frPick(c2, p => frRt(p, "pas") * (posGroup(p) === "D" ? 0.8 : 1))); } } return out; };
  const pGoal = (p, G, pp) => 0.1 * Math.exp(0.02 * (frRt(p, "sht") - 75)) * Math.exp(-0.05 * (G - 78)) * (posGroup(p) === "D" ? 0.55 : 1) * (pp ? 0.95 : 1);
  const when = () => ({ per: 1 + Math.floor(frRand() * 3), clk: Math.floor(frRand() * 1200) });
  const addGoal = (ti, scorer, as, flags, t) => { const S = sides[ti]; score[ti]++; const s = st(scorer.id); s.g++; if (flags.pp) s.ppg++; if (flags.sh) s.shg++; as.forEach(a => st(a.id).a++); goals.push([ti, scorer.id, as[0] ? as[0].id : null, as[1] ? as[1].id : null, t.per, t.clk, flags.pp ? "PP" : flags.sh ? "SH" : flags.en ? "EN" : ""]); };
  // even strength
  for (let ti = 0; ti < 2; ti++) {
    const S = sides[ti], O = sides[1 - ti];
    const n = Math.max(12, Math.round(23.5 * Math.exp(0.03 * (S.O - O.D)) * (ti === 0 ? 1.03 : 0.97) * (1 + (S.agg - 0.5) * 0.12) * (1 + frGauss() * 0.13)));
    const skaters = [...S.L.fLines.flat(), ...S.L.dPairs.flat()];
    for (let k = 0; k < n; k++) {
      const p = frPick(skaters, x => shooterW(S, x)); sog[ti]++; st(p.id).sog++;
      if (frRand() < pGoal(p, O.G, false)) {
        const unit = unitOf(S, p); const as = assist(unit, p); addGoal(ti, p, as, {}, when());
        for (const x of unit) st(x.id).pm++;
        const ou = frPick(O.L.fLines.map((u, i) => i), i => [0.4, 0.32, 0.28][i] || 0.3); for (const x of [...(O.L.fLines[ou] || []), ...(O.L.dPairs[ou % O.L.dPairs.length] || [])]) st(x.id).pm--;
      }
    }
  }
  // penalties and special teams
  for (let ti = 0; ti < 2; ti++) {
    const S = sides[ti], O = sides[1 - ti];
    const n = frPoisson(Math.max(1, 3.85 * (1.75 - S.dis / 100) * (1 + (S.agg - 0.5) * 0.3)));
    const skaters = [...S.L.fLines.flat(), ...S.L.dPairs.flat()];
    for (let k = 0; k < n; k++) {
      const p = frPick(skaters, x => (S.share[x.id] ? S.share[x.id].s : 0.2) * (110 - frRt(x, "dis")) * (["Enforcer", "Grinder"].includes(x.style) ? 1.5 : 1));
      st(p.id).pim += 2; pims[ti] += 2; ppo[1 - ti]++;
      const unit = O.L.pp[frRand() < 0.66 ? 0 : 1] || O.L.pp[0]; if (!unit) continue;
      const pk = S.L.pk[0];
      const ppO = avg(unit.slots.filter(Boolean).map(offF)), pkD = pk ? avg(pk.slots.filter(Boolean).map(defF)) : 70;
      const shots = frPoisson(1.55); const pool = unit.slots.filter(Boolean);
      let scored = false;
      for (let j = 0; j < shots; j++) {
        const sh = frPick(pool, x => Math.pow(frRt(x, "sht") / 75, 2) * (posGroup(x) === "D" ? 0.5 : 1)); sog[1 - ti]++; st(sh.id).sog++;
        if (!scored && frRand() < pGoal(sh, S.G, true) * Math.exp(0.03 * (ppO - pkD))) { scored = true; ppgl[1 - ti]++; addGoal(1 - ti, sh, assist(pool, sh), { pp: true }, when()); }
      }
      if (!scored && frRand() < 0.012 && pk) { const pool2 = pk.slots.filter(Boolean); const sh = frPick(pool2, x => frRt(x, "skt")); sog[ti]++; st(sh.id).sog++; addGoal(ti, sh, assist(pool2, sh), { sh: true }, when()); }
    }
  }
  // hits, blocks, time on ice
  for (let ti = 0; ti < 2; ti++) {
    const S = sides[ti], skaters = [...S.L.fLines.flat(), ...S.L.dPairs.flat()];
    const nh = frPoisson(24 * (S.chk / 75) * (0.85 + S.agg * 0.3)), nb = frPoisson(5.5);
    for (let k = 0; k < nh; k++) st(frPick(skaters, x => (S.share[x.id] ? S.share[x.id].s : 0) * Math.pow(frRt(x, "chk") / 70, 2) * (["Enforcer", "Grinder", "Power Forward"].includes(x.style) ? 1.4 : 1)).id).hit++;
    for (let k = 0; k < nb; k++) st(frPick(skaters, x => (S.share[x.id] ? S.share[x.id].s : 0) * (S.share[x.id] && S.share[x.id].g === "D" ? 2.2 : 0.7) * frRt(x, "def") / 70).id).blk++;
    for (const p of skaters) { const sh = S.share[p.id]; st(p.id).toi = Math.round(3600 * sh.s * (sh.g === "D" ? 0.9 : 0.97) * (0.93 + frRand() * 0.14)); }
  }
  // empty-net goals when it's close late
  let dec = "REG";
  const m = score[0] - score[1];
  if (Math.abs(m) >= 1 && Math.abs(m) <= 2 && frRand() < (Math.abs(m) === 1 ? 0.17 : 0.09)) {
    const ti = m > 0 ? 0 : 1, S = sides[ti], top = S.L.fLines[0] || []; if (top.length) { const p = frPick(top, x => frRt(x, "sht")); sog[ti]++; st(p.id).sog++; addGoal(ti, p, assist([...top, ...(S.L.dPairs[0] || [])], p), { en: true }, { per: 3, clk: Math.floor(frRand() * 90) }); }
  }
  // overtime / shootout
  if (score[0] === score[1]) {
    const edge = (sides[0].O - sides[1].D) - (sides[1].O - sides[0].D) + (sides[0].G - sides[1].G) * 0.5;
    const pH = Math.min(0.68, Math.max(0.32, 0.51 + edge * 0.012));
    const ot = (ti, per, clkMax) => { const S = sides[ti], pool = [...(S.L.fLines[0] || []).slice(0, 3), ...(S.L.dPairs[0] || [])]; const p = frPick(pool, x => Math.pow(frRt(x, "sht") / 75, 2) * (posGroup(x) === "D" ? 0.5 : 1)); sog[ti]++; st(p.id).sog++; addGoal(ti, p, assist(pool, p), {}, { per, clk: Math.floor(frRand() * clkMax) }); };
    if (playoff) { let per = 4; while (frRand() > 0.72) per++; const ti = frRand() < pH ? 0 : 1; ot(ti, per, 1200); dec = "OT"; }
    else if (frRand() < 0.6) { ot(frRand() < pH ? 0 : 1, 4, 300); dec = "OT"; }
    else { dec = "SO"; score[frRand() < pH ? 0 : 1]++; }
    for (let ti = 0; ti < 2; ti++) { sog[ti] += frPoisson(dec === "OT" ? 1.5 : 2.2); }
  }
  goals.sort((a, b) => a[4] - b[4] || b[5] - a[5]);
  const res = frFinishResult(F, game, sides.map(S => S.tid), sides.map(S => S.g ? S.g.id : null), score, sog, goals, ps, dec, pims, frInjuriesFor(F, sides));
  res.pp = [[ppgl[0], ppo[0]], [ppgl[1], ppo[1]]];
  return res;
}
function frInjuriesFor(F, sides) {
  if (F.settings.injuries === false) return [];
  const out = [];
  for (let ti = 0; ti < 2; ti++) {
    const S = sides[ti], O = sides[1 - ti];
    if (frRand() < 0.055 * (0.7 + O.agg * 0.6) * (O.chk / 72)) {
      const pool = [...S.L.fLines.flat(), ...S.L.dPairs.flat()]; if (S.g) pool.push(S.g);
      const p = frPick(pool, x => posGroup(x) === "G" ? 0.08 : (S.share[x.id] ? S.share[x.id].s : 0.2) * (110 - frRt(x, "sta") * 0.5));
      out.push({ pid: p.id, g: frInjLen(), what: FR_INJ[Math.floor(frRand() * FR_INJ.length)] });
    }
  }
  return out;
}
function frInjLen() { const r = frRand(); return r < 0.45 ? 1 + Math.floor(frRand() * 3) : r < 0.82 ? 4 + Math.floor(frRand() * 7) : 11 + Math.floor(frRand() * 20); }
// both sims end here: goalie decisions, game-winner, the box we keep
function frFinishResult(F, game, tids, gids, score, sog, goals, ps, dec, pims, inj) {
  const w = score[0] > score[1] ? 0 : 1;
  for (let ti = 0; ti < 2; ti++) {
    const gid = gids[ti]; if (!gid) continue; const s = ps[gid] || (ps[gid] = frBlank()); s.gp = 1;
    const ga = goals.filter(g => g[0] === 1 - ti && g[6] !== "EN").length;
    s.ga = ga; s.sa = Math.max(ga, sog[1 - ti] - goals.filter(g => g[0] === 1 - ti && g[6] === "EN").length); s.sv = s.sa - s.ga;
    if (ti === w) s.w = 1; else if (dec === "REG") s.l = 1; else s.otl = 1;
    if (ga === 0 && ti === w) s.so = 1;
    if (!s.toi) s.toi = 3600 + (dec !== "REG" ? 300 : 0);
  }
  if (dec !== "SO") { const lose = score[1 - w]; const gw = goals.filter(g => g[0] === w)[lose]; if (gw && ps[gw[1]]) ps[gw[1]].gwg++; }
  return { h: tids[0], a: tids[1], hs: score[0], as: score[1], dec, sog, goals, ps, gids, pims, inj };
}
// convert a game played out in the engine into the same result
function frFromEngine(F, game, G) {
  const ps = {}, goals = [];
  for (const [pid, s] of Object.entries(G.stats)) {
    if (!s.toi && !s.g && !s.a) continue;
    ps[pid] = Object.assign(frBlank(), { gp: 1, g: s.g, a: s.a, pm: s.pm, pim: s.pim, sog: s.sog, ppg: s.ppg, shg: s.shg, hit: s.hit, blk: s.blk, toi: Math.round(s.toi), sa: s.sa, sv: s.sv, ga: s.ga });
  }
  for (const e of G.events) if (e.type === "goal") goals.push([e.team, e.scorer, (e.assists || [])[0] || null, (e.assists || [])[1] || null, e.period, Math.round(e.clock), e.pp ? "PP" : e.sh ? "SH" : e.en ? "EN" : ""]);
  const gids = G.teams.map((T, ti) => { const gs = T.lineup.goalies.filter(Boolean).filter(g => ps[g.id]); gs.sort((a, b) => (ps[b.id].toi || 0) - (ps[a.id].toi || 0)); if (gs[0]) ps[gs[0].id].gs = 1; return gs[0] ? gs[0].id : null; });
  for (const T of G.teams) for (const g of T.lineup.goalies) if (g && ps[g.id]) { ps[g.id].w = ps[g.id].l = ps[g.id].otl = ps[g.id].so = 0; }
  const score = [G.teams[0].score, G.teams[1].score], sog = [G.teams[0].sog, G.teams[1].sog];
  const inj = []; for (const [pid, o] of Object.entries(G.out || {})) if (o.ret >= 99) inj.push({ pid, g: frInjLen(), what: FR_INJ[Math.floor(frRand() * FR_INJ.length)] });
  const res = frFinishResult(F, game, [game.h, game.a], gids, score, sog, goals, ps, G.decision || "REG", [G.teams[0].pim || 0, G.teams[1].pim || 0], F.settings.injuries === false ? [] : inj);
  // the goalie stats from the engine are exact; keep them over the box estimate
  for (const T of G.teams) for (const g of T.lineup.goalies) if (g && ps[g.id] && G.stats[g.id]) { ps[g.id].sa = G.stats[g.id].sa; ps[g.id].sv = G.stats[g.id].sv; ps[g.id].ga = G.stats[g.id].ga; }
  res.watched = true;
  res.bapLog = G.bap ? G.bap.log : null;
  res.pp = G.teams.map(T => [T.ppG || 0, T.ppOpp || 0]);
  return res;
}
function frApply(F, game, res) {
  Object.assign(game, { hs: res.hs, as: res.as, dec: res.dec, sog: res.sog, goals: res.goals, gids: res.gids, pims: res.pims, pp: res.pp || [[0, 0], [0, 0]], st: "final", w: res.watched ? 1 : 0 });
  // power-play and shorthanded assists come from the goal list
  for (const x of res.goals || []) if (x[6] === "PP" || x[6] === "SH") for (const a of [x[2], x[3]]) if (a && res.ps[a]) res.ps[a][x[6] === "PP" ? "ppa" : "sha"] = (res.ps[a][x[6] === "PP" ? "ppa" : "sha"] || 0) + 1;
  const bucket = game.po ? F.S.pstats : F.S.stats;
  for (const [pid, s] of Object.entries(res.ps)) {
    const p = F.players.find(x => x.id === pid); if (!p) continue;
    const b = bucket[pid] || (bucket[pid] = Object.assign(frBlank(), { team: p.team }));
    b.team = p.team;
    for (const k of Object.keys(s)) if (k !== "team") b[k] = (b[k] || 0) + s[k];
  }
  for (const it of res.inj || []) {
    const p = F.players.find(x => x.id === it.pid); if (!p || p.inj) continue;
    p.inj = { g: it.g, what: it.what };
    if (p.team === F.user || it.g >= 10) frNews(F, p.name + " (" + p.team + ") is out " + it.g + " game" + (it.g > 1 ? "s" : "") + " with a " + it.what + ".", p.team);
  }
  // milestones worth a line in the news
  const hat = Object.entries(res.ps).filter(([, s]) => s.g >= 3);
  for (const [pid, s] of hat) { const p = F.players.find(x => x.id === pid); if (p && (p.team === F.user || s.g >= 4)) frNews(F, (s.g >= 4 ? s.g + " goals! " : "Hat trick! ") + p.name + " scores " + (s.g >= 4 ? s.g : "three") + " for " + p.team + ".", p.team); }
  if (F.mode === "bap" && (game.h === F.user || game.a === F.user)) bapAfterGame(F, game, res);
  for (const tid of [game.h, game.a]) frFamUnits(F, tid, FAM_GAME, 0.5); // playing together builds chemistry
  for (let ti = 0; ti < 2; ti++) { const gid = res.gids[ti]; const s = gid && res.ps[gid]; if (s && s.so && s.sa >= 15) { const p = F.players.find(x => x.id === gid); if (p) frNews(F, "Shutout for " + p.name + ": " + s.sv + " saves.", p.team); } }
}

// ---------- the day ----------
function frSimGame(F, gid) { const g = frGame(F, gid); if (!g || g.st === "final") return; frApply(F, g, frQuickSim(F, g, !!g.po)); }
function frDayDone(F) { return frTodayGames(F).every(g => g.st === "final"); }
function frSimDay(F) {
  if (F.phase !== "season" && F.phase !== "playoffs") return false;
  for (const g of frTodayGames(F)) if (g.st !== "final") frSimGame(F, g.id);
  frEndDay(F);
  return true;
}
function frEndDay(F) {
  const playing = new Set(); for (const g of frTodayGames(F)) { playing.add(g.h); playing.add(g.a); }
  for (const p of F.players) if (p.inj && (playing.has(p.team) || p.team === "FA")) { p.inj.g--; if (p.inj.g <= 0) { p.inj = null; if (p.team === F.user) frNews(F, p.name + " is healthy and back in the lineup.", p.team); } }
  F.day++;
  if (F.phase === "season" && F.day % 7 === 0) { frTrainingWeek(F); F.prPrev = { day: F.day, ranks: frPowerRanks(F).map(r => r.id) }; }
  for (const t of F.teams) if (t.id !== F.user || F.mode === "bap") { frAiFixRoster(F, t.id); frAutoLines(F, t.id); }
  if (F.settings.autoLines && F.mode !== "bap") frAutoLines(F, F.user);
  if (F.mode === "bap") bapDay(F);
  if (F.phase === "season") {
    F.offers = F.offers.filter(o => o.exp >= F.day);
    if (F.day <= F.deadline) { frMaybeOffer(F); frMaybeAiTrade(F); }
    if (F.day === F.deadline) frNews(F, "The trade deadline has passed. Rosters are set for the stretch run.");
    if (F.day >= F.regDays) frStartPlayoffs(F);
  } else if (F.phase === "playoffs") frPlayoffDay(F);
}
// AI teams keep enough healthy players to dress a lineup, signing free agents if they must
function frAiFixRoster(F, tid) {
  const need = { F: FR_RULES.minF, D: FR_RULES.minD, G: FR_RULES.minG };
  for (const g of ["G", "D", "F"]) {
    let have = frHealthy(F, tid).filter(p => posGroup(p) === g).length;
    while (have < need[g] && F.players.filter(p => p.team === tid).length < FR_RULES.maxRoster) {
      const space = frCapSpace(F, tid);
      const fa = F.players.filter(p => p.team === "FA" && !p.inj && posGroup(p) === g && frAsk(F, p).sal <= space).sort((a, b) => overall(b) - overall(a))[0];
      if (!fa) break;
      const ask = frAsk(F, fa); fa.team = tid; fa.con = { sal: ask.sal, yrs: 1 }; have++;
      frNews(F, F.teams.find(t => t.id === tid).name + " sign " + fa.name + " (" + fa.pos + ") for " + money(ask.sal) + ".", tid);
    }
  }
}
// free agents in season take less money the longer they wait
function frAsk(F, p) {
  const base = askSalary(p, F.season);
  const late = F.phase === "season" || F.phase === "playoffs" ? 0.85 : 1;
  return { sal: Math.max(FR_RULES.minSal, Math.round(base * late * 20) / 20), yrs: F.phase === "offseason" ? askYears(p, F.season) : 1 };
}

// ---------- roster moves ----------
function frRosterCheck(F, tid, extra) {
  const ps = F.players.filter(p => p.team === tid);
  const c = { F: 0, D: 0, G: 0 }; for (const p of ps) c[posGroup(p)]++;
  const issues = [];
  if (ps.length > FR_RULES.maxRoster) issues.push("over the " + FR_RULES.maxRoster + "-player limit");
  if (c.F < FR_RULES.minF) issues.push("needs " + FR_RULES.minF + " forwards (has " + c.F + ")");
  if (c.D < FR_RULES.minD) issues.push("needs " + FR_RULES.minD + " defenders (has " + c.D + ")");
  if (c.G < FR_RULES.minG) issues.push("needs " + FR_RULES.minG + " goalies (has " + c.G + ")");
  if (frPayroll(F, tid) > F.cap + 1e-6) issues.push("over the cap by " + money(frPayroll(F, tid) - F.cap));
  return issues;
}
function frSign(F, tid, pid, sal, yrs) {
  const p = F.players.find(x => x.id === pid); if (!p || p.team !== "FA") return "She's not a free agent.";
  const ask = frAsk(F, p);
  if (sal + 1e-6 < ask.sal) return p.name + " wants at least " + money(ask.sal) + ".";
  if (F.players.filter(x => x.team === tid).length >= FR_RULES.maxRoster) return "Your roster is full (" + FR_RULES.maxRoster + ").";
  if (frPayroll(F, tid) + sal > F.cap + 1e-6) return "Not enough cap space.";
  p.team = tid; p.con = { sal, yrs: Math.max(1, Math.min(5, yrs)) }; p.line = 0;
  frNews(F, F.teams.find(t => t.id === tid).name + " sign " + p.name + ": " + money(sal) + " × " + p.con.yrs + (p.con.yrs > 1 ? " years" : " year") + ".", tid);
  return "";
}
// releasing a player leaves half her salary on the books for the rest of the deal
function frRelease(F, pid) {
  const p = F.players.find(x => x.id === pid); if (!p || !F.teams.some(t => t.id === p.team)) return "Not on a team.";
  const t = F.teams.find(x => x.id === p.team);
  const amt = Math.round(p.con.sal * 0.5 * 20) / 20;
  if (amt > 0) (t.dead = t.dead || []).push({ name: p.name, amt, yrs: p.con.yrs });
  frNews(F, t.name + " release " + p.name + ". " + money(amt) + " stays on their cap for " + p.con.yrs + (p.con.yrs > 1 ? " seasons." : " season."), t.id);
  p.team = "FA"; p.line = 0; frScrubUnits(F, t.id);
  return "";
}
function frScrubUnits(F, tid) {
  const t = F.teams.find(x => x.id === tid); if (!t) return;
  const ids = new Set(F.players.filter(p => p.team === tid).map(p => p.id));
  for (const k of ["pp", "pk"]) if (Array.isArray(t[k])) { t[k] = t[k].map(u => Array.isArray(u) ? u.map(id => id && ids.has(id) ? id : null) : u); if (!t[k].some(u => Array.isArray(u) && u.some(Boolean))) t[k] = null; }
}

// ---------- trades ----------
// how the AI side sees a deal: value in, value out, with need weighed in
function frTradeEval(F, aiTid, give, get) {
  // give = players the AI team sends away; get = players it receives
  const out = new Set(give.map(p => p.id));
  const vin = get.reduce((s, p) => s + tradeValue(p, F) * needMul(F, aiTid, p, out), 0);
  const vout = give.reduce((s, p) => s + tradeValue(p, F), 0);
  return { vin, vout, gain: vin - vout - (0.3 + vout * 0.06) };
}
function frTradeLegal(F, A, B, aGive, bGive) {
  // simulate the swap and check both rosters and caps
  const moved = [...aGive.map(p => [p, p.team, B]), ...bGive.map(p => [p, p.team, A])];
  for (const [p, , to] of moved) p.team = to;
  const issues = [...frRosterCheck(F, A).map(x => F.teams.find(t => t.id === A).name + " " + x), ...frRosterCheck(F, B).map(x => F.teams.find(t => t.id === B).name + " " + x)];
  for (const [p, from] of moved) p.team = from;
  // in the offseason rosters are still being built, so only the size limit and the cap apply
  return F.phase === "offseason" ? issues.filter(x => !/ needs \d+ /.test(x)) : issues;
}
function frTradeExec(F, A, B, aGive, bGive, note) {
  for (const p of aGive) { p.team = B; p.line = 0; }
  for (const p of bGive) { p.team = A; p.line = 0; }
  frScrubUnits(F, A); frScrubUnits(F, B);
  if (A !== F.user || F.settings.autoLines) frAutoLines(F, A);
  if (B !== F.user || F.settings.autoLines) frAutoLines(F, B);
  const nm = id => F.teams.find(t => t.id === id).name;
  frNews(F, "Trade: " + nm(A) + " send " + aGive.map(p => p.name).join(", ") + " to " + nm(B) + " for " + bGive.map(p => p.name).join(", ") + "." + (note ? " " + note : ""), A === F.user || B === F.user ? F.user : A);
}
// the user proposes; the AI answers
function frPropose(F, aiTid, userGive, aiGive) {
  if (F.phase === "season" && F.day > F.deadline) return { ok: false, msg: "The trade deadline has passed." };
  if (F.phase === "playoffs") return { ok: false, msg: "No trades during the playoffs." };
  if (!userGive.length && !aiGive.length) return { ok: false, msg: "Add players to both sides." };
  const issues = frTradeLegal(F, F.user, aiTid, userGive, aiGive);
  if (issues.length) return { ok: false, msg: "Not allowed: " + issues.join("; ") + "." };
  const e = frTradeEval(F, aiTid, aiGive, userGive);
  if (e.gain >= 0) { frTradeExec(F, F.user, aiTid, userGive, aiGive); return { ok: true, msg: "Deal! " + F.teams.find(t => t.id === aiTid).name + " accept." }; }
  const short = -e.gain;
  return { ok: false, msg: short < 1 ? "Close. They want a little more coming back." : short < 3 ? "Not enough. They'd need noticeably more value." : "Not interested. That's well short of what they'd give up.", gap: short };
}
// how a proposed deal looks to the AI right now (for the meter)
function frTradeMeter(F, aiTid, userGive, aiGive) { if (!userGive.length && !aiGive.length) return 0; const e = frTradeEval(F, aiTid, aiGive, userGive); return e.gain; }
function frMaybeOffer(F) {
  if (F.mode === "bap") return;
  const rate = { off: 0, low: 0.06, normal: 0.13, high: 0.24 }[F.settings.trades] ?? 0.13;
  if (frRand() > rate || F.offers.length >= 3) return;
  const ai = frShuffle(F.teams.filter(t => t.id !== F.user).map(t => t.id));
  for (const A of ai) { const o = frBuildOffer(F, A); if (o) { F.offers.push(o); frNews(F, F.teams.find(t => t.id === A).name + " have sent you a trade offer.", F.user); return; } }
}
function frBuildOffer(F, A) {
  const mine = F.players.filter(p => p.team === F.user && !p.inj);
  const theirs = F.players.filter(p => p.team === A);
  const targets = mine.filter(p => needMul(F, A, p) > 1.05).sort(() => frRand() - 0.5).slice(0, 5);
  for (const tgt of targets) {
    const want = tradeValue(tgt, F) * needMul(F, A, tgt);
    const tv = tradeValue(tgt, F);
    // the AI pays somewhere between fair and what she's worth to them
    const lo = tv * 0.85, hi = want - 0.3 - want * 0.06;
    if (hi < lo) continue;
    const cands = theirs.filter(p => tradeValue(p, F) < hi);
    const combos = [];
    for (const a of cands) { combos.push([a]); for (const b of cands) if (b.id > a.id) combos.push([a, b]); }
    frShuffle(combos);
    for (const pk of combos) {
      const v = pk.reduce((s, p) => s + tradeValue(p, F), 0);
      if (v < lo || v > hi) continue;
      if (frTradeLegal(F, F.user, A, [tgt], pk).length) continue;
      const e = frTradeEval(F, A, pk, [tgt]); if (e.gain < 0) continue;
      return { id: frId(), from: A, give: pk.map(p => p.id), get: [tgt.id], exp: F.day + 3, made: F.day };
    }
  }
  return null;
}
function frOfferAnswer(F, oid, accept) {
  const o = F.offers.find(x => x.id === oid); if (!o) return "That offer is gone.";
  F.offers = F.offers.filter(x => x !== o);
  if (!accept) { frNews(F, "You turned down an offer from " + F.teams.find(t => t.id === o.from).name + ".", F.user); return ""; }
  const give = o.get.map(id => F.players.find(p => p.id === id)), get = o.give.map(id => F.players.find(p => p.id === id));
  if (give.some(p => !p || p.team !== F.user) || get.some(p => !p || p.team !== o.from)) return "Rosters have changed; the offer no longer works.";
  const issues = frTradeLegal(F, F.user, o.from, give, get); if (issues.length) return "Can't accept: " + issues.join("; ") + ".";
  frTradeExec(F, F.user, o.from, give, get);
  return "";
}
function frMaybeAiTrade(F) {
  if (frRand() > 0.08 || F.settings.trades === "off") return;
  const ai = frShuffle(F.teams.filter(t => t.id !== F.user).map(t => t.id));
  const [A, B] = ai;
  const pa = frShuffle(F.players.filter(p => p.team === A && !p.inj)), pb = F.players.filter(p => p.team === B && !p.inj);
  for (const x of pa.slice(0, 6)) for (const y of pb) {
    if (posGroup(x) === posGroup(y) && frRand() < 0.7) continue;
    const ea = frTradeEval(F, A, [x], [y]), eb = frTradeEval(F, B, [y], [x]);
    if (ea.gain > -0.45 && eb.gain > -0.45 && !frTradeLegal(F, A, B, [x], [y]).length) { frTradeExec(F, A, B, [x], [y]); return; }
  }
}

// ---------- playoffs ----------
function frStartPlayoffs(F) {
  const st = frStandings(F).slice(0, 4).map(r => r.id);
  F.phase = "playoffs";
  F.S.po = { round: 1, series: [frSeries(st[0], st[3], 1, 1, 4), frSeries(st[1], st[2], 1, 2, 3)] };
  frNews(F, "The regular season is over. Playoffs: " + st.map((id, i) => (i + 1) + ". " + F.teams.find(t => t.id === id).name).join(", ") + ".");
  if (!st.includes(F.user)) frNews(F, "Your team missed the playoffs this season.", F.user);
  frPlayoffSchedule(F);
}
function frSeries(hi, lo, round, sh, sl) { return { id: "s" + round + "-" + hi, round, hi, lo, sh, sl, w: [0, 0], games: [], winner: null }; }
function frPlayoffSchedule(F) {
  const S = F.S, need = Math.ceil(F.settings.series / 2), day = [];
  // home ice: 2-2-1-1-1 (or 2-2-1)
  const homeHi = [true, true, false, false, true, false, true];
  for (const s of S.po.series) {
    if (s.winner) continue;
    const k = s.games.length;
    const hi = homeHi[k] !== false;
    const g = { id: "g" + S.games.length, d: S.days.length, h: hi ? s.hi : s.lo, a: hi ? s.lo : s.hi, st: "pending", po: s.id, gn: k + 1 };
    S.games.push(g); s.games.push(g.id); day.push(g.id);
  }
  if (day.length) S.days.push(day);
}
function frPlayoffDay(F) {
  const S = F.S, need = Math.ceil(F.settings.series / 2);
  for (const s of S.po.series) {
    if (s.winner) continue;
    s.w = [0, 0];
    for (const gid of s.games) { const g = frGame(F, gid); if (g.st !== "final") continue; const hw = g.hs > g.as ? g.h : g.a; s.w[hw === s.hi ? 0 : 1]++; }
    if (s.w[0] >= need || s.w[1] >= need) {
      s.winner = s.w[0] >= need ? s.hi : s.lo;
      const nm = id => F.teams.find(t => t.id === id).name;
      frNews(F, nm(s.winner) + " win the " + (s.round === 1 ? "semifinal" : "final") + " " + Math.max(...s.w) + "–" + Math.min(...s.w) + " over " + nm(s.winner === s.hi ? s.lo : s.hi) + ".", s.winner);
    }
  }
  const open = S.po.series.filter(s => s.round === S.po.round && !s.winner);
  if (!open.length) {
    if (S.po.round === 1) {
      const [a, b] = S.po.series.filter(s => s.round === 1).map(s => ({ id: s.winner, seed: s.winner === s.hi ? s.sh : s.sl })).sort((x, y) => x.seed - y.seed);
      S.po.round = 2; S.po.series.push(frSeries(a.id, b.id, 2, a.seed, b.seed));
    } else { frChampion(F); return; }
  }
  frPlayoffSchedule(F);
}
function frChampion(F) {
  const fin = F.S.po.series.find(s => s.round === 2);
  F.phase = "done";
  const champ = fin.winner, ru = champ === fin.hi ? fin.lo : fin.hi;
  const aw = frAwards(F);
  F.history.unshift({ season: F.season, champ, ru, awards: aw, standings: frStandings(F).map(r => [r.id, r.w, r.l, r.otl, r.pts]) });
  frNews(F, "🏆 " + F.teams.find(t => t.id === champ).name + " win the Tracen Cup!", champ);
}

// ---------- awards ----------
function frAwards(F) {
  const S = F.S, list = Object.entries(S.stats).map(([pid, s]) => ({ p: F.players.find(x => x.id === pid), s })).filter(x => x.p);
  const sk = list.filter(x => posGroup(x.p) !== "G" && x.s.gp > 0), gs = list.filter(x => posGroup(x.p) === "G" && x.s.gs >= Math.max(3, F.regDays * 0.3));
  const top = (arr, f) => arr.slice().sort((a, b) => f(b) - f(a))[0];
  const svp = x => x.s.sa ? x.s.sv / x.s.sa : 0;
  const pts = x => x.s.g + x.s.a;
  const res = [];
  const add = (key, name, x, line) => x && res.push({ key, name, pid: x.p.id, who: x.p.name, team: x.s.team, line });
  const mvpSk = top(sk, x => pts(x) + x.s.g * 0.3 + x.s.pm * 0.15), mvpG = top(gs, x => (svp(x) - 0.88) * 400 + x.s.w * 0.8);
  const mv = mvpSk && mvpG && (mvpG.s.w * 0.8 + (svp(mvpG) - 0.88) * 400) > pts(mvpSk) + mvpSk.s.g * 0.3 + 4 ? mvpG : mvpSk;
  add("mvp", "Most Valuable Uma", mv, posGroup(mv.p) === "G" ? mv.s.w + " W · " + svp(mv).toFixed(3) : pts(mv) + " pts");
  const ar = top(sk, pts); add("art", "Golden Stick (points)", ar, ar.s.g + " G · " + ar.s.a + " A · " + pts(ar) + " pts");
  const rk = top(sk, x => x.s.g); add("rocket", "Sharpshooter (goals)", rk, rk.s.g + " goals");
  const dd = top(sk.filter(x => posGroup(x.p) === "D"), x => pts(x) * 0.6 + x.s.pm * 0.5 + x.s.blk * 0.15 + overall(x.p) * 0.2); add("norris", "Iron Wall (defender)", dd, pts(dd) + " pts · " + (dd.s.pm > 0 ? "+" : "") + dd.s.pm);
  const gg = top(gs, x => svp(x) * 100 + x.s.w * 0.15); if (gg) add("vezina", "Golden Glove (goalie)", gg, svp(gg).toFixed(3) + " SV% · " + gg.s.w + " W");
  const pp = Object.entries(S.pstats).map(([pid, s]) => ({ p: F.players.find(x => x.id === pid), s })).filter(x => x.p && posGroup(x.p) !== "G");
  if (pp.length) { const c = top(pp, x => x.s.g + x.s.a + x.s.gwg * 0.5); add("conn", "Playoff MVP", c, (c.s.g + c.s.a) + " playoff pts"); }
  return res;
}

// ---------- offseason ----------
const DEV_KEYS = ["sht", "pas", "hnd", "skt", "spd", "def", "chk", "fo", "sta", "dis", "clu", "goal"];
function frStartOffseason(F) {
  if (F.phase !== "done") return;
  if (F.mode === "bap") bapSeasonClose(F);
  F.phase = "offseason";
  // a summer apart: some of the familiarity fades
  for (const k of Object.keys(F.fam || {})) { F.fam[k] = Math.round(F.fam[k] * 0.75 * 100) / 100; if (F.fam[k] < 0.15) delete F.fam[k]; }
  const dev = [];
  for (const p of F.players) {
    const before = overall(p), g = posGroup(p);
    for (const k of DEV_KEYS) {
      if (p[k] == null) continue;
      if (g === "G" && !["goal", "sta", "clu", "dis"].includes(k)) continue;
      if (g !== "G" && k === "goal") continue;
      const v = Number(p[k]);
      const d = Math.round(frGauss() * 1.3 + (p.dev || 0) * 0.9 - 0.05 * (v - 76));
      p[k] = Math.max(25, Math.min(99, v + d));
    }
    if (p.sht != null && p.pas != null) p.off = Math.round((p.sht + p.pas) / 2);
    p.dev = Math.max(-1.5, Math.min(1.8, (p.dev || 0) * 0.7 + frGauss() * 0.4));
    const after = overall(p); if (after !== before) dev.push({ pid: p.id, from: before, to: after });
    if (p.inj && p.inj.g > 0) p.inj = null;
  }
  for (const t of F.teams) { t.dead = (t.dead || []).map(d => Object.assign(d, { yrs: d.yrs - 1 })).filter(d => d.yrs > 0); }
  for (const p of F.players) if (p.con && F.teams.some(t => t.id === p.team)) p.con.yrs--;
  F.season++;
  const expiring = F.players.filter(p => F.teams.some(t => t.id === p.team) && p.con.yrs <= 0);
  // AI teams decide on their own expiring deals now
  for (const p of expiring) {
    if (F.mode === "bap" ? p.id === F.me : p.team === F.user) continue;
    const ask = { sal: askSalary(p, F.season), yrs: askYears(p, F.season) };
    const keep = overall(p) >= 72 && ask.sal <= fairSalary(overall(p)) * 1.08 && frPayroll(F, p.team) - (p.con.sal) + ask.sal <= F.cap - 2 && frRand() < 0.75;
    if (keep) { p.con = { sal: ask.sal, yrs: ask.yrs }; }
    else { frNews(F, p.name + " leaves " + F.teams.find(t => t.id === p.team).name + " and becomes a free agent.", p.team); p.team = "FA"; p.line = 0; }
  }
  F.off = { step: "resign", dev: dev.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 40), faDay: 0 };
  for (const p of F.players.filter(x => x.team === "FA")) p.con = { sal: askSalary(p, F.season), yrs: askYears(p, F.season) };
  frNews(F, "The offseason is here. Players have developed, and contracts that ran out need decisions.");
  if (F.mode === "bap") bapOffseason(F);
}
// your players whose deals just ran out
function frExpiring(F) { return F.players.filter(p => p.team === F.user && p.con && p.con.yrs <= 0); }
function frResign(F, pid, yrs) {
  const p = F.players.find(x => x.id === pid); if (!p) return "Not found.";
  const ask = askSalary(p, F.season) * (yrs >= 4 ? 1.06 : yrs <= 1 ? 0.97 : 1);
  const sal = Math.round(ask * 20) / 20;
  if (frPayroll(F, F.user) - p.con.sal + sal > F.cap + 1e-6) return "Not enough cap space to re-sign " + p.name + " at " + money(sal) + ".";
  p.con = { sal, yrs };
  frNews(F, "You re-signed " + p.name + ": " + money(sal) + " × " + yrs + ".", F.user);
  return "";
}
function frLetGo(F, pid) { const p = F.players.find(x => x.id === pid); if (!p) return; p.team = "FA"; p.line = 0; p.con = { sal: askSalary(p, F.season), yrs: askYears(p, F.season) }; frNews(F, p.name + " leaves as a free agent.", F.user); }
function frOpenFA(F) {
  for (const p of frExpiring(F)) frLetGo(F, p.id);
  F.off.step = "fa"; F.off.faDay = 1;
  frNews(F, "Free agency is open. " + F.players.filter(p => p.team === "FA").length + " players are available.");
}
// one round of AI signings
function frFADay(F) {
  const ai = frShuffle(F.teams.filter(t => t.id !== F.user || F.mode === "bap").map(t => t.id));
  for (const tid of ai) {
    const ps = F.players.filter(p => p.team === tid); if (ps.length >= 17) continue;
    const c = { F: 0, D: 0, G: 0 }; for (const p of ps) c[posGroup(p)]++;
    const want = c.G < 2 ? "G" : c.D < 5 && c.D <= c.F / 2 ? "D" : c.F < 10 ? "F" : null;
    const space = frCapSpace(F, tid) - Math.max(0, 15 - ps.length - 1) * FR_RULES.minSal;
    const fa = F.players.filter(p => p.team === "FA" && (!want || posGroup(p) === want) && p.con.sal <= space).sort((a, b) => (overall(b) - b.con.sal * 0.4) - (overall(a) - a.con.sal * 0.4))[0];
    if (fa && (want || overall(fa) >= 74)) { fa.team = tid; fa.line = 0; frNews(F, F.teams.find(t => t.id === tid).name + " sign " + fa.name + ": " + money(fa.con.sal) + " × " + fa.con.yrs + ".", tid); }
  }
  F.off.faDay++;
}
// sign the cheapest healthy free agents a team needs to reach the roster minimums
function frFillMinimum(F, tid) {
  const signed = [];
  for (const g of ["G", "D", "F"]) {
    const need = { F: FR_RULES.minF, D: FR_RULES.minD, G: FR_RULES.minG }[g];
    while (F.players.filter(p => p.team === tid && posGroup(p) === g).length < need) {
      const fa = F.players.filter(p => p.team === "FA" && posGroup(p) === g).sort((a, b) => a.con.sal - b.con.sal || overall(b) - overall(a))[0];
      if (!fa) break;
      fa.team = tid; fa.line = 0; fa.con = { sal: Math.max(FR_RULES.minSal, Math.min(fa.con.sal, frAsk(F, fa).sal)), yrs: 1 }; signed.push(fa);
    }
  }
  if (signed.length) frNews(F, F.teams.find(t => t.id === tid).name + " fill out the roster: " + signed.map(p => p.name + " (" + money(p.con.sal) + ")").join(", ") + ".", tid);
  return signed;
}
function frNextSeason(F) {
  // AI teams fill any holes; then everyone starts fresh
  for (let i = 0; i < 4; i++) frFADay(F);
  for (const t of F.teams) { frFillMinimum(F, t.id); if (t.id !== F.user) frAutoLines(F, t.id); }
  if (F.settings.autoLines) frAutoLines(F, F.user);
  frStartSeason(F);
}

// ---------- team chemistry: friends, plus familiarity built in games and at practice ----------
const FAM_GAME = 0.022, FAM_LINES = 0.2, FAM_BOND = 0.07, FRIEND_ODDS = 0.07, FR_CHEM_MID = 58;
const PRACTICE_NAMES = { auto: "Auto", lines: "Line rushes", bonding: "Team bonding", skills: "Skills" };
const PRACTICE_HELP = {
  auto: "The coaching staff picks each week: line rushes while the lines are still learning each other, team bonding now and then, skills once the units click.",
  lines: "Each line and pair drills together, with the starting goalie: a big chemistry boost for the current units, less individual training.",
  bonding: "Team dinners and off-ice time: a little chemistry between everyone, and teammates who get along can become friends. Less individual training.",
  skills: "Individual work only: 30% more training progress, no chemistry practice."
};
// older saves: the new friends list, circles gone, familiarity starts empty
function frMigrateChem(F) {
  if (!F || F.chemV) return;
  applyFriendsV11(F.players); F.fam = F.fam || {}; F.chemV = 1;
}
function frFamAdd(F, a, b, v) {
  if (!a || !b || a.id === b.id) return;
  F.fam = F.fam || {}; const k = famKey(a, b);
  F.fam[k] = Math.min(CHEM_FAM_MAX, Math.round(((F.fam[k] || 0) + v) * 100) / 100);
}
// a line with its D pair and the starting goalie: the group that shares the ice
function frUnitsOf(L) { return L.fLines.map((u, i) => [...u, ...(unitPair(L, i)), L.goalies[0]].filter(Boolean)); }
function frFamUnits(F, tid, v, ppShare) {
  if (!F.teams.some(t => t.id === tid)) return;
  const L = frLineupFor(F, tid);
  for (const u of frUnitsOf(L)) for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) frFamAdd(F, u[i], u[j], v);
  if (ppShare) for (const u of [...L.pp, ...L.pk]) { if (!u) continue; const s = u.slots.filter(Boolean); for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) frFamAdd(F, s[i], s[j], v * ppShare); }
}
function frTeamChem(F, tid) {
  const L = frLineupFor(F, tid);
  const units = frUnitsOf(L).map((ps, i) => Object.assign({ i, ps }, unitChemistry(ps, F.fam)));
  const avg = units.length ? units.reduce((a, u) => a + u.value, 0) / units.length : 0;
  return { units, avg, L };
}
function frPracticeKind(F, t) {
  const k = t.practice || "auto"; if (k !== "auto") return k;
  const ch = frTeamChem(F, t.id), wk = Math.floor(F.day / 7);
  if (ch.avg < 64) return wk % 3 === 2 ? "bonding" : "lines";
  return wk % 2 ? "bonding" : ch.avg >= 80 ? "skills" : "lines";
}
function frPractice(F, t) {
  const kind = frPracticeKind(F, t); t.prWeek = kind;
  const mine = t.id === F.user && F.mode !== "bap";
  const before = mine ? frTeamChem(F, t.id).units.map(u => u.value) : null;
  if (kind === "lines") frFamUnits(F, t.id, FAM_LINES, 0.4);
  const made = [];
  if (kind === "bonding") {
    const ps = F.players.filter(p => p.team === t.id && !p.inj);
    const cand = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      frFamAdd(F, ps[i], ps[j], FAM_BOND);
      if (!areFriends(ps[i], ps[j]) && famOf(F.fam, ps[i], ps[j]) >= 1.2) cand.push([ps[i], ps[j]]);
    }
    for (const [a, b] of frShuffle(cand)) {
      if (made.length >= 2) break;
      if (frRand() < FRIEND_ODDS + famOf(F.fam, a, b) * 0.02) { a.friends.push(b.name); b.friends.push(a.name); made.push(a.name + " and " + b.name); }
    }
  }
  if (made.length && (mine || (F.mode === "bap" && t.id === F.user))) frNews(F, "New friends: " + made.join(", ") + " have hit it off at team bonding.", t.id, "training");
  if (mine && kind !== "skills") {
    const after = frTeamChem(F, t.id).units.map(u => u.value);
    frNews(F, "Practice (" + PRACTICE_NAMES[kind].toLowerCase() + "): " + after.map((v, i) => "Line " + (i + 1) + " " + before[i] + (v !== before[i] ? " → " + v : "")).join(", ") + ".", t.id, "training");
  }
}

// ---------- training: a weekly focus for every player ----------
const TRAIN_KEYS = { F: ["sht", "pas", "hnd", "skt", "def", "chk", "fo", "sta"], D: ["def", "chk", "pas", "sht", "skt", "hnd", "sta"], G: ["goal", "sta", "clu"] };
const TRAIN_NAMES = { sht: "Shooting", pas: "Passing", hnd: "Hands", skt: "Skating", def: "Defense", chk: "Checking", fo: "Faceoffs", sta: "Stamina", goal: "Goaltending", clu: "Clutch" };
const TRAIN_INT = { light: 0.6, normal: 1, hard: 1.4 };
function frPotential(p) { const d = p.dev || 0; return d >= 0.6 ? "High" : d <= -0.4 ? "Low" : "Average"; }
// what a player works on when left on auto: the weakest of the skills that matter for how she plays
function frAutoFocus(p) {
  const g = posGroup(p);
  if (g === "G") return Number(p.goal) <= 90 ? "goal" : "sta";
  const want = { Sniper: ["sht", "hnd", "skt"], Playmaker: ["pas", "hnd", "skt"], "Power Forward": ["sht", "chk", "skt"], "Two-Way": ["def", "pas", "skt"], Grinder: ["chk", "def", "skt"], Speedster: ["skt", "hnd", "sht"], Enforcer: ["chk", "def", "sta"],
    Offensive: ["pas", "sht", "skt"], "Stay-at-Home": ["def", "chk", "skt"] }[p.style] || (g === "D" ? ["def", "pas", "skt"] : ["sht", "pas", "skt"]);
  if (p.pos === "C") want.push("fo");
  return want.slice().sort((a, b) => Number(p[a] ?? 99) - Number(p[b] ?? 99))[0];
}
function frFocusOf(p) { return p.tf && TRAIN_KEYS[posGroup(p)].includes(p.tf) ? p.tf : frAutoFocus(p); }
function frTrainGain(F, p) {
  const t = F.teams.find(x => x.id === p.team), k = frFocusOf(p), v = Number(p[k] ?? 60);
  const prac = t && t.prWeek ? (t.prWeek === "skills" ? 1.3 : 0.85) : 1; // skills practice trades team chemistry for individual work
  return 0.8 * (1 + 0.35 * (p.dev || 0)) * (TRAIN_INT[(t && t.train) || "normal"] || 1) * prac * Math.max(0.2, Math.min(1.2, (95 - v) / 30));
}
function frTrainingWeek(F) {
  const ups = [];
  for (const t of F.teams) frPractice(F, t);
  for (const p of F.players) {
    if (!F.teams.some(t => t.id === p.team) || p.inj || p.id === F.me) continue;
    const t = F.teams.find(x => x.id === p.team), k = frFocusOf(p);
    p.tp = p.tp || {};
    p.tp[k] = (p.tp[k] || 0) + frTrainGain(F, p);
    while (p.tp[k] >= 1) { p.tp[k] -= 1; if (Number(p[k]) < 99) { p[k] = Number(p[k]) + 1; if (p.team === F.user) ups.push(p.name + " +1 " + TRAIN_NAMES[k] + " (" + p[k] + ")"); } }
    if (k === "sht" || k === "pas") p.off = Math.round((Number(p.sht) + Number(p.pas)) / 2);
    // hard practices wear players down
    if ((t.train || "normal") === "hard" && F.settings.injuries !== false && frRand() < 0.012) { p.inj = { g: 1 + Math.floor(frRand() * 4), what: "practice injury" }; if (p.team === F.user) frNews(F, p.name + " is out " + p.inj.g + " game" + (p.inj.g > 1 ? "s" : "") + " after getting hurt in a hard practice.", F.user, "injury"); }
  }
  if (F.mode !== "bap") frNews(F, ups.length ? "Training week: " + ups.join(", ") + "." : "Training week: steady progress, no rating changes yet.", F.user, "training");
}

// ---------- media: power rankings, streaks, team stats ----------
function frTeamGames(F, tid, po) { return F.S.games.filter(g => g.st === "final" && !!g.po === !!po && (g.h === tid || g.a === tid)).sort((a, b) => a.d - b.d); }
function frTeamStats(F, tid, po) {
  const r = { gp: 0, gf: 0, ga: 0, sf: 0, sa: 0, ppg: 0, ppo: 0, ppga: 0, tsh: 0, shg: 0, pim: 0, so: 0 };
  for (const g of frTeamGames(F, tid, po)) {
    const i = g.h === tid ? 0 : 1, o = 1 - i;
    r.gp++; r.gf += i ? g.as : g.hs; r.ga += i ? g.hs : g.as; r.sf += (g.sog || [0, 0])[i]; r.sa += (g.sog || [0, 0])[o];
    const pp = g.pp || [[0, 0], [0, 0]]; r.ppg += pp[i][0]; r.ppo += pp[i][1]; r.ppga += pp[o][0]; r.tsh += pp[o][1];
    r.pim += (g.pims || [0, 0])[i];
    r.shg += (g.goals || []).filter(x => x[0] === i && x[6] === "SH").length;
    if ((i ? g.hs : g.as) === 0) r.so++;
  }
  r.ppPct = r.ppo ? r.ppg / r.ppo : 0; r.pkPct = r.tsh ? 1 - r.ppga / r.tsh : 0;
  return r;
}
function frPowerRanks(F) {
  const st = frStandings(F);
  return st.map(r => {
    const ts = frTeamStats(F, r.id), gp = Math.max(1, r.gp);
    const l10 = r.l10.length ? r.l10.reduce((s, x) => s + (x === "W" ? 2 : x === "O" ? 1 : 0), 0) / (r.l10.length * 2) : 0.5;
    const roster = F.players.filter(p => p.team === r.id && !p.inj).map(overall).sort((a, b) => b - a).slice(0, 15);
    const talent = roster.length ? roster.reduce((a, b) => a + b, 0) / roster.length : 70;
    const w = Math.min(1, r.gp / 10);
    const score = w * ((r.pts / (gp * 2)) * 50 + (ts.gf - ts.ga) / gp * 8 + l10 * 25) + (1 - w) * 0 + (talent - 70) * 2;
    return { id: r.id, score, rec: r.w + "–" + r.l + "–" + r.otl, l10, strk: r.strk, gd: ts.gf - ts.ga, ts };
  }).sort((a, b) => b.score - a.score);
}
// points by game for everyone, in order, for streaks and hot/cold
function frPlayerGameLog(F) {
  const log = {};
  const games = F.S.games.filter(g => g.st === "final" && !g.po).sort((a, b) => a.d - b.d);
  for (const g of games) {
    const pts = {};
    for (const x of g.goals || []) for (const id of [x[1], x[2], x[3]]) if (id) pts[id] = (pts[id] || 0) + 1;
    for (const tid of [g.h, g.a]) (log[tid] = log[tid] || []).push({ d: g.d, pts, g });
  }
  return log;
}
function frStreaks(F) {
  const log = frPlayerGameLog(F), out = { hot: [], cold: [], streak: [], goalies: [] };
  for (const p of F.players) {
    if (!log[p.team] || posGroup(p) === "G") continue;
    const games = log[p.team].slice(-5); if (games.length < 3) continue;
    const last5 = games.reduce((s, x) => s + (x.pts[p.id] || 0), 0);
    let run = 0; for (let i = log[p.team].length - 1; i >= 0 && log[p.team][i].pts[p.id]; i--) run++;
    out.hot.push({ p, v: last5, n: games.length });
    if (overall(p) >= 78 && last5 === 0 && !p.inj) out.cold.push({ p, v: overall(p), n: games.length });
    if (run >= 3) out.streak.push({ p, v: run });
  }
  for (const p of F.players.filter(x => posGroup(x) === "G" && F.teams.some(t => t.id === x.team))) {
    const starts = (log[p.team] || []).filter(x => (x.g.gids || []).includes(p.id)).slice(-3);
    if (starts.length < 2) continue;
    let sa = 0, ga = 0; for (const x of starts) { const i = x.g.gids.indexOf(p.id), o = 1 - i; sa += (x.g.sog || [0, 0])[o]; ga += (x.g.goals || []).filter(q => q[0] === o && q[6] !== "EN").length; }
    if (sa) out.goalies.push({ p, v: (sa - ga) / sa, n: starts.length, ga });
  }
  out.hot.sort((a, b) => b.v - a.v); out.cold.sort((a, b) => b.v - a.v); out.streak.sort((a, b) => b.v - a.v); out.goalies.sort((a, b) => b.v - a.v);
  return out;
}

// ---------- Be A Player: one player's career inside an AI-run league ----------
const BAP_STYLE = {
  Sniper: { sht: 12, hnd: 6, skt: 4 }, Playmaker: { pas: 12, hnd: 8 }, "Power Forward": { sht: 6, chk: 10, sta: 4 }, "Two-Way": { def: 8, pas: 4, skt: 4 },
  Grinder: { chk: 10, def: 6, sta: 6 }, Speedster: { skt: 12, spd: 12, hnd: 4 }, Enforcer: { chk: 14, sta: 4, dis: -10 },
  Offensive: { pas: 10, sht: 6, skt: 4, def: 4 }, "Stay-at-Home": { def: 12, chk: 8 }
};
const BAP_KEYS = ["sht", "pas", "hnd", "skt", "spd", "def", "chk", "fo", "sta", "dis", "clu"];
const BAP_NAMES = { sht: "Shooting", pas: "Passing", hnd: "Hands", skt: "Skating", spd: "Speed", def: "Defense", chk: "Checking", fo: "Faceoffs", sta: "Stamina", dis: "Discipline", clu: "Clutch" };
const BAP_DRILLS = { sht: "Shooting drills", pas: "Passing drills", hnd: "Stickhandling", skt: "Power skating", def: "Defensive positioning", chk: "Battle drills", fo: "Faceoff practice", sta: "Conditioning", mate: "Extra work with a teammate" };
const bapCost = v => v < 70 ? 1 : v < 80 ? 2 : v < 88 ? 3 : 4;
const BAP_SP_XP = 250;
// a new player's starting ratings: a prospect shaped by her style
function bapMakePlayer(c) {
  const pos = c.pos, g = pos === "D" ? "D" : "F";
  const p = { id: "me-" + frId(), name: c.name, tag: (c.tag || c.name.split(" ").slice(-1)[0]).slice(0, 9), no: c.no, team: "POOL", pos, line: 0, style: c.style,
    side: g === "D" ? (c.shoots || "L") : "", shoots: c.shoots || "L", goal: 10, friends: [], groups: [], dev: 0.9, look: c.look || { hair: "#8A5A3C", eye: "#3A7BD5" }, custom: true };
  for (const k of BAP_KEYS) p[k] = 65;
  p.sta = 72; p.dis = 72; p.clu = 62; p.fo = pos === "C" ? 66 : 48;
  for (const [k, v] of Object.entries(BAP_STYLE[c.style] || {})) p[k] = Math.max(30, Math.min(99, p[k] + v));
  if (!(BAP_STYLE[c.style] || {}).spd) p.spd = p.skt;
  p.off = Math.round((p.sht + p.pas) / 2); p.hnd = p.hnd || 60;
  return p;
}
function bapNew(league, c, settings) {
  const src = JSON.parse(JSON.stringify(league));
  const keep = new Map(src.players.map(p => [p.id, { team: p.team, line: p.line, side: p.side }]));
  const F = frNew(src, { user: src.teams[0].id, name: c.saveName || c.name + "'s career", settings: Object.assign({ games: 28, series: 7, trades: "normal", autoLines: true, injuries: true, moments: true }, settings || {}) });
  F.mode = "bap"; F.draft = null; F.news = [];
  // the league keeps its current rosters: no fantasy draft
  for (const p of F.players) { const k = keep.get(p.id); if (k) { p.team = k.team; p.line = k.line; p.side = k.side; } }
  const me = bapMakePlayer(c); me.con = { sal: 0.95, yrs: 3 };
  F.players.push(me); F.me = me.id;
  F.bap = { trust: 70, hype: 10, xp: 0, sp: c.sp != null ? c.sp : 0, drill: "sht", mate: null, rel: {}, log: [], career: [], interview: null, tr: null, offers: null, lastRole: "", moments: 0, great: 0, draft: null, firsts: {} };
  return F;
}
// draft night: which club takes her, and where
function bapDraft(F) {
  const me = F.players.find(p => p.id === F.me), g = posGroup(me);
  const weights = F.teams.map(t => { const n = F.players.filter(p => p.team === t.id && posGroup(p) === g).length; const tot = F.players.filter(p => p.team === t.id).length; return { t, w: (g === "D" ? 7 - n : 12 - n) + 2 + frRand() * 3 - (tot >= FR_RULES.maxRoster ? 4 : 0) }; });
  const pick = weights.sort((a, b) => b.w - a.w)[0].t;
  const slot = Math.max(1, Math.min(F.teams.length, Math.round(bapProjected(F) + frGauss() * 0.7)));
  me.team = pick.id; F.user = pick.id; me.line = 0;
  if (F.players.filter(p => p.team === pick.id).some(p => p.no === me.no && p.id !== me.id)) { let n = me.no; const used = new Set(F.players.filter(p => p.team === pick.id).map(p => p.no)); while (used.has(n)) n = (n % 98) + 1; me.no = n; }
  // make room if the roster is full
  const roster = F.players.filter(p => p.team === pick.id);
  if (roster.length > FR_RULES.maxRoster) { const cut = roster.filter(p => p.id !== me.id && posGroup(p) === g).sort((a, b) => overall(a) - overall(b))[0]; if (cut) { cut.team = "FA"; cut.line = 0; } }
  F.bap.draft = { team: pick.id, pick: slot };
  F.bap.rel = {}; for (const p of F.players) if (p.team === pick.id && p.id !== me.id) F.bap.rel[p.id] = 40;
  frNews(F, "With pick #" + slot + " in the first round, the " + pick.name + " select " + me.name + " (" + me.pos + ").", pick.id, "draft");
  frStartSeason(F);
  frAutoLines(F, pick.id);
  F.bap.lastRole = bapRole(F).label;
  return F.bap.draft;
}
function bapMe(F) { return F.players.find(p => p.id === F.me); }
// where the coach has her: line, pair, special teams
function bapRole(F) {
  const me = bapMe(F); if (!me) return { label: "–" };
  if (me.inj) return { label: "Injured", out: true };
  if (me.team === "FA") return { label: "Free agent", out: true };
  const L = frLineupFor(F, me.team);
  let label = "Healthy scratch", unit = 0;
  L.fLines.forEach((u, i) => { if (u.some(p => p.id === me.id)) { label = ["1st", "2nd", "3rd", "4th"][i] + " line"; unit = i + 1; } });
  L.dPairs.forEach((u, i) => { if (u.some(p => p.id === me.id)) { label = ["Top", "2nd", "3rd"][i] + " pair"; unit = i + 1; } });
  const pp = L.pp.findIndex(u => u.slots.some(p => p && p.id === me.id)), pk = L.pk.findIndex(u => u.slots.some(p => p && p.id === me.id));
  return { label, unit, pp: pp >= 0 ? pp + 1 : 0, pk: pk >= 0 ? pk + 1 : 0, out: !unit };
}
function bapRoleText(r) { return r.label + (r.pp ? " · PP" + r.pp : "") + (r.pk ? " · PK" + r.pk : ""); }
function bapGrade(s, moments) {
  if (!s || !s.gp) return null;
  let v = 1 + s.g * 3 + s.a * 2 + s.sog * 0.3 + s.hit * 0.15 + s.blk * 0.3 + s.pm * 0.8 + (s.tk || 0) * 0.3 - s.pim * 0.25;
  if (moments) for (const m of moments) v += m.q === "great" ? 0.6 : m.q === "good" ? 0.25 : -0.3;
  return { v, g: v >= 7 ? "A+" : v >= 5 ? "A" : v >= 3.2 ? "B" : v >= 1.6 ? "C" : v >= 0 ? "D" : "F" };
}
const BAP_GRADE_FX = { "A+": [3, 90, 3], A: [2, 65, 2], B: [1, 45, 1], C: [0, 30, 0.3], D: [-1.5, 18, 0], F: [-3, 10, 0] }; // trust, xp, hype
function bapAddXP(F, n) { F.bap.xp += n; while (F.bap.xp >= BAP_SP_XP) { F.bap.xp -= BAP_SP_XP; F.bap.sp++; } }
function bapAfterGame(F, game, res) {
  const me = bapMe(F), B = F.bap, s = res.ps[F.me], mine = game.h === me.team ? 0 : 1, won = (mine === 0 ? res.hs > res.as : res.as > res.hs);
  const opp = game.h === me.team ? game.a : game.h;
  const moments = res.bapLog || [];
  const entry = { s: F.season, d: game.d, gid: game.id, opp, home: mine === 0, res: (won ? "W " : res.dec === "REG" ? "L " : "OTL ") + (mine === 0 ? res.hs + "–" + res.as : res.as + "–" + res.hs), po: !!game.po };
  if (!s || !s.gp) {
    entry.grade = "–"; entry.scratch = true; B.trust = Math.min(100, B.trust + 1.5); bapAddXP(F, 15);
    B.log.unshift(entry); if (B.log.length > 120) B.log.length = 120; return;
  }
  const gr = bapGrade(s, moments), fx = BAP_GRADE_FX[gr.g];
  const great = moments.filter(m => m.q === "great").length, risky = moments.filter(m => m.q === "risky").length;
  B.trust = Math.max(0, Math.min(100, B.trust + fx[0] + great * 0.4 - risky * 0.6 - (s.pim >= 4 ? 1.5 : 0) + (won ? 0.3 : 0) - (B.trust > 80 ? 0.6 : 0)));
  B.hype = Math.max(0, Math.min(100, B.hype + fx[2] + s.g * 1 - 0.8));
  const xp = fx[1] + s.g * 15 + s.a * 8 + great * 12 + moments.filter(m => m.q === "good").length * 6;
  bapAddXP(F, xp);
  B.moments += moments.length; B.great += great;
  Object.assign(entry, { grade: gr.g, g: s.g, a: s.a, pm: s.pm, sog: s.sog, hit: s.hit, toi: s.toi, xp, moments: moments.length, great, watched: !!res.watched });
  B.log.unshift(entry); if (B.log.length > 120) B.log.length = 120;
  // teammates she scored with grow closer
  for (const x of res.goals || []) { if (x[0] !== mine) continue; const ids = [x[1], x[2], x[3]].filter(Boolean); if (!ids.includes(F.me)) continue; for (const id of ids) if (id !== F.me) bapRel(F, id, 4); }
  const L = frLineupFor(F, me.team);
  for (const u of [...L.fLines, ...L.dPairs]) if (u.some(p => p.id === F.me)) for (const p of u) if (p.id !== F.me) bapRel(F, p.id, 0.8);
  // firsts and milestones
  const tot = F.S.stats[F.me] || frBlank();
  if (s.g && !B.firsts.goal) { B.firsts.goal = 1; frNews(F, me.name + " scores the first goal of her career!", me.team, "media"); B.hype += 4; }
  if (s.a && !B.firsts.assist) { B.firsts.assist = 1; frNews(F, me.name + " picks up her first career assist.", me.team, "media"); }
  if (s.g >= 3) frNews(F, "Hat trick for " + me.name + "! The hats rain down.", me.team, "media");
  // the post-game scrum
  const big = s.g + s.a >= 2 || (won && s.g) || (!won && gr.g === "F") || frRand() < 0.18;
  if (big && !B.interview) B.interview = bapMakeInterview(F, s, won, gr.g, opp);
  // role changes are news
  const role = bapRole(F), lbl = bapRoleText(role);
  if (B.lastRole && lbl !== B.lastRole) frNews(F, "Coach's lineup: " + me.name + " is now " + lbl + " (was " + B.lastRole + ").", me.team, "media");
  B.lastRole = lbl;
}
function bapRel(F, pid, d) { const B = F.bap; B.rel[pid] = Math.max(0, Math.min(100, (B.rel[pid] ?? 40) + d)); const me = bapMe(F), p = F.players.find(x => x.id === pid); if (p && B.rel[pid] >= 75 && !me.friends.includes(p.name)) { me.friends.push(p.name); frNews(F, me.name + " and " + p.name + " have become close friends. They'll play better together.", me.team, "media"); } }
function bapMakeInterview(F, s, won, grade, opp) {
  const me = bapMe(F), on = F.teams.find(t => t.id === opp).name;
  const q = s.g + s.a >= 2 ? "Big night for you against " + on + ". What clicked out there?"
    : won && s.g ? "That goal made the difference tonight. Walk us through it."
    : !won && grade === "F" ? "Tough one tonight. What went wrong for you?"
    : won ? "A win over " + on + ". How did the team pull it off?" : "A loss to " + on + ". What does the team need to fix?";
  const opts = s.g + s.a >= 2 || (won && s.g) ? [
    { t: "Honestly, it's all my linemates. They put the puck right where I wanted it.", fx: { trust: 1, hype: 1, team: 2 } },
    { t: "I've been putting in extra work after practice. It's paying off.", fx: { trust: 2, hype: 2, team: 0 } },
    { t: "I told everyone I'd light it up. Get used to it.", fx: { trust: -2, hype: 6, team: -2 } }]
    : !won ? [
    { t: "That's on me. I have to be better, and I will be.", fx: { trust: 2, hype: 0, team: 1 } },
    { t: "We win and lose as a team. We'll regroup.", fx: { trust: 1, hype: 0, team: 2 } },
    { t: "I'd play better with more ice time, to be honest.", fx: { trust: -4, hype: 4, team: -1 } }]
    : [
    { t: "Everybody chipped in. That's how we win.", fx: { trust: 1, hype: 1, team: 2 } },
    { t: "We stuck to the coach's game plan and it worked.", fx: { trust: 2, hype: 0, team: 1 } },
    { t: "We were the better team. It wasn't close.", fx: { trust: -1, hype: 4, team: 0 } }];
  return { q, opts, d: F.day, s: F.season };
}
function bapAnswer(F, i) {
  const B = F.bap, iv = B.interview; if (!iv) return;
  const o = iv.opts[i]; B.interview = null; if (!o) return;
  B.trust = Math.max(0, Math.min(100, B.trust + o.fx.trust)); B.hype = Math.max(0, Math.min(100, B.hype + o.fx.hype));
  const me = bapMe(F);
  for (const pid of Object.keys(B.rel)) if (F.players.find(p => p.id === pid && p.team === me.team)) bapRel(F, pid, o.fx.team);
  frNews(F, me.name + ": “" + o.t + "”", me.team, "media");
}
// daily practice: a little XP and steady work on one skill
function bapDay(F) {
  const B = F.bap, me = bapMe(F); if (!me || me.inj || F.phase === "offseason") return;
  const k = B.drill || "sht";
  if (k === "mate") { bapAddXP(F, 18); if (B.mate) bapRel(F, B.mate, 2.5); return; }
  bapAddXP(F, 25);
  me.tp = me.tp || {}; me.tp[k] = (me.tp[k] || 0) + 0.12 * (1 + 0.3 * (me.dev || 0)) * Math.max(0.25, (95 - Number(me[k])) / 30);
  while (me.tp[k] >= 1) { me.tp[k] -= 1; if (me[k] < 99) { me[k]++; frNews(F, "Practice pays off: " + me.name + "'s " + BAP_NAMES[k] + " is up to " + me[k] + ".", me.team, "training"); } }
  if (k === "sht" || k === "pas") me.off = Math.round((me.sht + me.pas) / 2);
  bapTradeTick(F);
}
function bapSpend(F, k) {
  const me = bapMe(F), B = F.bap; if (!BAP_KEYS.includes(k) || me[k] >= 99) return "Maxed out.";
  if (k === "fo" && me.pos !== "C" && me.fo >= 70) return "Only centers can push faceoffs past 70.";
  const c = bapCost(me[k]); if (B.sp < c) return "Not enough skill points.";
  B.sp -= c; me[k]++; if (k === "sht" || k === "pas") me.off = Math.round((me.sht + me.pas) / 2);
  return "";
}
// asking out: the club shops her and moves her within a couple of weeks
function bapRequestTrade(F) {
  const B = F.bap; if (B.tr) return "You already asked for a trade.";
  if (F.phase === "playoffs" || F.phase === "done") return "Trades open again in the offseason.";
  if (F.phase === "season" && F.day > F.deadline) return "The deadline has passed. Ask again in the offseason.";
  B.tr = { day: F.day, s: F.season, wait: 3 + Math.floor(frRand() * 8) };
  B.trust = Math.max(0, B.trust - 10);
  for (const pid of Object.keys(B.rel)) B.rel[pid] = Math.max(0, B.rel[pid] - 4);
  frNews(F, bapMe(F).name + " has asked " + F.teams.find(t => t.id === F.user).name + " for a trade.", F.user, "trade");
  return "";
}
function bapTradeTick(F) {
  const B = F.bap; if (!B.tr) return;
  if (F.phase === "season" && F.day > F.deadline) return;
  if (--B.tr.wait > 0) return;
  bapDoTrade(F);
}
function bapDoTrade(F) {
  const B = F.bap, me = bapMe(F), from = me.team, g = posGroup(me), tv = tradeValue(me, F);
  const teams = frShuffle(F.teams.filter(t => t.id !== from).map(t => t.id));
  for (const to of teams) {
    const cands = F.players.filter(p => p.team === to && posGroup(p) === g && !p.inj).sort((a, b) => Math.abs(tradeValue(a, F) - tv) - Math.abs(tradeValue(b, F) - tv));
    for (const back of cands.slice(0, 3)) {
      if (frTradeLegal(F, from, to, [me], [back]).length) continue;
      frTradeExec(F, from, to, [me], [back], "");
      F.user = to; B.tr = null; B.trust = 52; B.rel = {};
      for (const p of F.players) if (p.team === to && p.id !== me.id) B.rel[p.id] = 40;
      frAutoLines(F, to); frAutoLines(F, from);
      frNews(F, "You've been traded! " + me.name + " heads to the " + F.teams.find(t => t.id === to).name + " for " + back.name + ".", to, "trade");
      B.lastRole = bapRoleText(bapRole(F));
      return true;
    }
  }
  B.tr.wait = 3; return false;
}
function bapSeasonClose(F) {
  const B = F.bap, me = bapMe(F), s = F.S.stats[F.me] || frBlank(), ps = F.S.pstats[F.me] || frBlank();
  B.career.unshift({ season: F.season, team: me.team, gp: s.gp, g: s.g, a: s.a, pm: s.pm, pim: s.pim, sog: s.sog, ppg: s.ppg, ppa: s.ppa || 0, hit: s.hit, toi: s.toi, pgp: ps.gp, pg: ps.g, pa: ps.a, ovr: overall(me), champ: F.history[0] && F.history[0].champ === me.team, awards: (F.history[0] ? F.history[0].awards.filter(a => a.pid === F.me).map(a => a.name) : []) });
  for (const a of F.history[0] ? F.history[0].awards.filter(a => a.pid === F.me) : []) frNews(F, me.name + " wins the " + a.name + " award!", me.team, "media");
}
// contract time: her club and a few others make offers
function bapOffseason(F) {
  const me = bapMe(F), B = F.bap;
  B.tr = null;
  if (me.con.yrs > 0) { B.offers = null; return; }
  const o = overall(me), base = fairSalary(o) * (0.95 + B.hype / 300);
  const offer = (tid, mult, line) => ({ team: tid, sal: Math.max(FR_RULES.minSal, Math.round(base * mult * 20) / 20), yrs: 1 + Math.floor(frRand() * 4), role: line });
  const rank = tid => { const g = posGroup(me), n = F.players.filter(p => p.team === tid && posGroup(p) === g && p.id !== me.id && overall(p) > o).length; return g === "D" ? (n < 2 ? "Top pair" : n < 4 ? "2nd pair" : "Depth") : (n < 3 ? "1st line" : n < 6 ? "2nd line" : n < 9 ? "3rd line" : "Depth"); };
  const offers = [];
  if (B.trust >= 25) offers.push(Object.assign(offer(me.team, 1 + (B.trust - 50) / 400, rank(me.team)), { own: true }));
  const others = frShuffle(F.teams.filter(t => t.id !== me.team && frCapSpace(F, t.id) > base * 0.8).map(t => t.id)).slice(0, 2 + (B.hype > 40 ? 1 : 0));
  for (const t of others) offers.push(offer(t, 0.92 + frRand() * 0.2, rank(t)));
  if (!offers.length) offers.push(Object.assign(offer(me.team, 0.9, rank(me.team)), { own: true }));
  B.offers = offers;
  frNews(F, me.name + "'s contract is up. " + offers.length + " clubs have made offers.", me.team, "sign");
}
function bapSign(F, i) {
  const B = F.bap, o = B.offers && B.offers[i], me = bapMe(F); if (!o) return "That offer is gone.";
  const from = me.team;
  me.team = o.team; me.con = { sal: o.sal, yrs: o.yrs }; me.line = 0;
  if (o.team !== from) { F.user = o.team; B.trust = 52; B.rel = {}; for (const p of F.players) if (p.team === o.team && p.id !== me.id) B.rel[p.id] = 40; frScrubUnits(F, from); }
  B.offers = null;
  frNews(F, me.name + (o.team === from ? " re-signs with the " : " signs with the ") + F.teams.find(t => t.id === o.team).name + ": " + money(o.sal) + " × " + o.yrs + ".", o.team, "sign");
  return "";
}
function bapNextSeason(F) {
  if (F.bap.offers) return "Pick one of your contract offers first.";
  for (let i = 0; i < 4; i++) frFADay(F);
  frNextSeason(F);
  F.bap.lastRole = bapRoleText(bapRole(F));
  return "";
}

// ---------- the draft combine: a few showcase games that move her draft stock ----------
const BAP_COMBINE_TEAMS = [
  { id: "CMB", name: "Team Prospect", abbr: "PRO", color: "#F2B705", color2: "#1B1300", color3: "#FFFFFF", logo: { shape: "roundel", emblem: "star" } },
  { id: "AUR", name: "Team Aurora", abbr: "AUR", color: "#3BB4A6", color2: "#0E2A33", color3: "#FFFFFF", logo: { shape: "hexagon", emblem: "wings" } },
  { id: "MET", name: "Team Meteor", abbr: "MET", color: "#D9542B", color2: "#FFFFFF", color3: "#2A1208", logo: { shape: "shield", emblem: "bolt" } },
  { id: "GLA", name: "Team Glacier", abbr: "GLA", color: "#6E8BC9", color2: "#FFFFFF", color3: "#14213D", logo: { shape: "diamond", emblem: "crown" } }
];
const BAP_COMBINE_N = 3;
// where she'd go if the draft were tonight: her rating, plus what the combine showed
function bapProjected(F) {
  const me = bapMe(F), stock = F.bap.combine ? F.bap.combine.stock : 0;
  const n = F.teams.length;
  return Math.max(1, Math.min(n, n + 1 - (overall(me) - 58) / 2.2 * n / 8 - stock / 2.5 * n / 8));
}
function bapStockLabel(p) { return p <= 1.5 ? "Projected #1 overall" : p <= 3.5 ? "Projected top-3 pick" : p <= 6 ? "Projected mid-first round" : "Projected late first round"; }
// build the showcase rosters once: depth players and free agents from around the league
function bapCombineSetup(F) {
  const me = bapMe(F), g = posGroup(me);
  const pool = frShuffle(F.players.filter(p => p.id !== me.id && overall(p) <= 77 && overall(p) >= 62));
  const take = (grp, n, used) => { const out = []; for (const p of pool) if (out.length < n && posGroup(p) === grp && !used.has(p.id)) { out.push(p.id); used.add(p.id); } return out; };
  const used = new Set();
  const goalies = F.players.filter(p => posGroup(p) === "G").sort((a, b) => overall(a) - overall(b)).map(p => p.id);
  const team = (withMe, k) => ({ f: take("F", withMe && g === "F" ? 8 : 9, used), d: take("D", withMe && g === "D" ? 3 : 4, used), g: goalies.slice(k * 2, k * 2 + 2) });
  const mine = team(true, 0); const opps = [1, 2, 3].map(k => team(false, k));
  F.bap.combine = { mine, opps, games: [], stock: 0, done: false };
}
function bapCombineLeague(F, i) {
  const C = F.bap.combine, me = bapMe(F), base = id => F.players.find(p => p.id === id);
  const players = [], add = (id, team) => { const p = base(id); if (!p) return; const c = JSON.parse(JSON.stringify(p)); c.team = team; c.inj = null; c.line = 0; players.push(c); };
  for (const id of [...C.mine.f, ...C.mine.d, ...C.mine.g]) add(id, "CMB");
  add(me.id, "CMB");
  const o = C.opps[i % C.opps.length], ot = BAP_COMBINE_TEAMS[1 + (i % 3)].id;
  for (const id of [...o.f, ...o.d, ...o.g]) add(id, ot);
  const L = { teams: [BAP_COMBINE_TEAMS[0], BAP_COMBINE_TEAMS[1 + (i % 3)]].map(t => frBaseTeam(Object.assign({ dead: [], gRot: 0 }, t))), players, settings: { injuries: false }, mode: "combine" };
  frAutoLines(L, "CMB"); frAutoLines(L, ot);
  // the showcase puts her on the top unit
  const meC = players.find(p => p.id === me.id), g = posGroup(meC);
  if (meC.line !== 1) { const top = players.filter(p => p.team === "CMB" && posGroup(p) === g && p.line === 1 && p.id !== meC.id).sort((a, b) => (a.pos === meC.pos ? -1 : 0) - (b.pos === meC.pos ? -1 : 0))[0]; if (top) { top.line = meC.line; if (g === "D") { const sd = top.side; top.side = meC.side; meC.side = sd; } } meC.line = 1; }
  return { L, home: i % 2 ? ot : "CMB", away: i % 2 ? "CMB" : ot, opp: ot };
}
function bapCombineRecord(F, i, s, moments, res) {
  const C = F.bap.combine; if (!C || C.games[i]) return;
  const gr = bapGrade(s, moments) || { v: 0, g: "F" };
  const before = bapProjected(F);
  C.stock += gr.v - 2; // a C-grade game holds your stock; better games move you up
  const after = bapProjected(F);
  C.games[i] = { grade: gr.g, v: gr.v, g: s ? s.g : 0, a: s ? s.a : 0, sog: s ? s.sog : 0, pm: s ? s.pm : 0, toi: s ? s.toi : 0, res, moments: moments ? moments.length : 0, great: moments ? moments.filter(m => m.q === "great").length : 0, move: before - after };
  bapAddXP(F, Math.round((BAP_GRADE_FX[gr.g] || [0, 20])[1] * 0.6));
  if (C.games.filter(Boolean).length >= BAP_COMBINE_N) C.done = true;
}
function bapCombineSim(F, i) {
  const { L, home, away } = bapCombineLeague(F, i);
  const res = frQuickSim(L, { h: home, a: away }, false);
  const mine = home === "CMB" ? 0 : 1, won = mine === 0 ? res.hs > res.as : res.as > res.hs;
  bapCombineRecord(F, i, res.ps[F.me], [], (won ? "W " : "L ") + (mine === 0 ? res.hs + "–" + res.as : res.as + "–" + res.hs));
}
