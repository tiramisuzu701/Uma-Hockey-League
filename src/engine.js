// ---------- Game engine (pure, no DOM) ----------
const RINK = { L: 100, W: 42.5, R: 28, goalX: 89, blueX: 25, netHalf: 3, dotX: 69, dotY: 22 };
const BENCH_X = [[-30, -7], [7, 30]];   // home, away benches along the top boards
const BOX_X = [-9, 9];                  // penalty boxes along the bottom boards
const CLOCK_RATE = 3;                   // game-clock seconds per simulated second
const SIM_DT = 1 / 30;
const PERIOD_LEN = 1200, OT_LEN = 300, MINOR = 120;
const SHOT_SPEED = 95, PASS_SPEED = 62;
const MPH = 0.69; // sim feet per second to displayed mph (calibrated so the fastest skaters top out around 23)
const OZ_HOLD = 0.019;
const LANE_R = 4.6, LANE_K = 0.6; // passing lanes: how close a stick has to be, and how often it gets there
const TUNE = { goal: 0.29, shoot: 1.6, pen: 6, check: 2.4 };
const TAC_DEFAULT = { pp: "131", pk: "box", fc: "122", agg: 50 };
const TAC_NAMES = { pp: { "131": "1-3-1 umbrella", overload: "Overload", spread: "Spread 2-1-2" }, pk: { box: "Box", diamond: "Diamond", aggressive: "Aggressive" }, fc: { "122": "1-2-2", "212": "2-1-2", trap: "1-3-1 trap" } };
const PEN_STICK = ["hooking", "slashing", "tripping", "holding", "high-sticking", "holding the stick"];
const PEN_BODY = ["roughing", "interference", "cross-checking", "boarding", "elbowing", "charging"];

function rnd() { return Math.random(); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return { d: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)), t };
}
function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function periodName(p) { return p === 1 ? "1st" : p === 2 ? "2nd" : p === 3 ? "3rd" : p === 4 ? "OT" : "SO"; }
function weighted(opts) {
  let tot = 0; for (const o of opts) tot += Math.max(0, o[1]);
  if (tot <= 0) return null;
  let r = rnd() * tot; for (const o of opts) { r -= Math.max(0, o[1]); if (r <= 0) return o[0]; }
  return opts[opts.length - 1][0];
}
function containPoint(o, r, bounce) {
  const L = RINK.L, W = RINK.W, R = RINK.R, ix = L - R, iy = W - R;
  let hit = false;
  if (Math.abs(o.x) > ix && Math.abs(o.y) > iy) {
    const cx = Math.sign(o.x) * ix, cy = Math.sign(o.y) * iy, dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d > R - r) {
      const nx = dx / d, ny = dy / d; o.x = cx + nx * (R - r); o.y = cy + ny * (R - r);
      const vn = o.vx * nx + o.vy * ny; if (vn > 0) { o.vx -= (1 + bounce) * vn * nx; o.vy -= (1 + bounce) * vn * ny; }
      hit = true;
    }
  } else {
    if (Math.abs(o.x) > L - r) { o.x = Math.sign(o.x) * (L - r); if (o.vx * Math.sign(o.x) > 0) o.vx = -o.vx * bounce; hit = true; }
    if (Math.abs(o.y) > W - r) { o.y = Math.sign(o.y) * (W - r); if (o.vy * Math.sign(o.y) > 0) o.vy = -o.vy * bounce; hit = true; }
  }
  return hit;
}
// ---- the boards as a loop: arc-length position <-> point, used for rims and chips ----
const BR = { ix: RINK.L - RINK.R, iy: RINK.W - RINK.R };
function boardSegs(inset) {
  const L = RINK.L - inset, W = RINK.W - inset, R = RINK.R - inset, { ix, iy } = BR, q = Math.PI / 2 * R;
  return { L, W, R, segs: [["line", L, -iy, L, iy, 2 * iy], ["arc", ix, iy, 0, q], ["line", ix, W, -ix, W, 2 * ix], ["arc", -ix, iy, 1, q],
    ["line", -L, iy, -L, -iy, 2 * iy], ["arc", -ix, -iy, 2, q], ["line", -ix, -W, ix, -W, 2 * ix], ["arc", ix, -iy, 3, q]] };
}
const BOARDS = boardSegs(0.6);
BOARDS.total = BOARDS.segs.reduce((t, g) => t + g[g.length - 1], 0);
function boardPoint(sv) {
  const B = BOARDS; sv = ((sv % B.total) + B.total) % B.total;
  for (const g of B.segs) {
    const len = g[g.length - 1];
    if (sv <= len) {
      if (g[0] === "line") { const t = sv / len; const x = g[1] + (g[3] - g[1]) * t, y = g[2] + (g[4] - g[2]) * t; const nx = Math.abs(g[1] - g[3]) < 1e-6 ? Math.sign(g[1]) : 0, ny = nx ? 0 : Math.sign(g[2]); return { x, y, nx, ny }; }
      const a = g[3] * Math.PI / 2 + sv / B.R; const nx = Math.cos(a), ny = Math.sin(a); return { x: g[1] + nx * B.R, y: g[2] + ny * B.R, nx, ny };
    }
    sv -= len;
  }
  return boardPoint(0);
}
function boardParam(x, y) {
  const B = BOARDS, { ix, iy } = BR; let acc = 0;
  const lens = B.segs.map(g => g[g.length - 1]);
  const at = i => lens.slice(0, i).reduce((a, b) => a + b, 0);
  if (Math.abs(x) <= ix) return y >= 0 ? at(2) + (ix - x) : at(6) + (x + ix);
  if (Math.abs(y) <= iy) return x >= 0 ? at(0) + (y + iy) : at(4) + (iy - y);
  const qd = x > 0 ? (y > 0 ? 1 : 7) : (y > 0 ? 3 : 5), base = [0, 0, 0, 1, 0, 2, 0, 3][qd];
  const cx = Math.sign(x) * ix, cy = Math.sign(y) * iy;
  let a = Math.atan2(y - cy, x - cx) - base * Math.PI / 2; while (a < 0) a += Math.PI * 2;
  return at(qd) + clamp(a, 0, Math.PI / 2) * B.R;
}
function perimDelta(a, b) { const T = BOARDS.total; let d = ((b - a) % T + T) % T; if (d > T / 2) d -= T; return d; }
// the puck against the boards: soft, mostly dead bounces, and it slides along the curve when it comes in at a glancing angle
function containPuck(o, soft) {
  const L = RINK.L, W = RINK.W, R = RINK.R, ix = L - R, iy = W - R, r = 0.5;
  let nx = 0, ny = 0, pen = 0;
  if (Math.abs(o.x) > ix && Math.abs(o.y) > iy) {
    const cx = Math.sign(o.x) * ix, cy = Math.sign(o.y) * iy, dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d > R - r) { nx = dx / d; ny = dy / d; pen = d - (R - r); o.x = cx + nx * (R - r); o.y = cy + ny * (R - r); }
  } else {
    if (Math.abs(o.x) > L - r) { nx = Math.sign(o.x); pen = Math.abs(o.x) - (L - r); o.x = nx * (L - r); }
    else if (Math.abs(o.y) > W - r) { ny = Math.sign(o.y); pen = Math.abs(o.y) - (W - r); o.y = ny * (W - r); }
  }
  if (!nx && !ny) return false;
  const v = Math.hypot(o.vx, o.vy), vn = o.vx * nx + o.vy * ny;
  if (vn > 0 && v > 0) {
    const f = vn / v, e = soft ? 0.05 : vn > 12 ? 0.42 : 0.12;
    const kt = 1 - 0.12 * f - 0.2 * f * f;
    const tx = o.vx - vn * nx, ty = o.vy - vn * ny;
    o.vx = tx * kt - e * vn * nx; o.vy = ty * kt - e * vn * ny;
  }
  return true;
}
function zoneOf(x) { return x > RINK.blueX ? 1 : x < -RINK.blueX ? -1 : 0; }

class Game {
  constructor(league, homeId, awayId, opts) {
    this.playoff = !!(opts && opts.playoff); this.otN = 1; this.league = league; this.fam = league.fam || null; // franchise familiarity between teammates
    // coaching from the bench: hold at intermissions, manual goalie pulls and changes
    this.intHold = false; this.holdInt = false;
    // Be A Player: one skater the viewer makes the big decisions for
    this.bap = opts && opts.bap ? { me: opts.bap.me, moments: opts.bap.moments !== false, auto: false, last: -99, n: 0, log: [], cap: 16 } : null; this.moment = null;
    this.teams = [homeId, awayId].map((id, i) => {
      const team = league.teams.find(t => t.id === id);
      const lineup = buildLineup(league, id);
      const tac = Object.assign({}, TAC_DEFAULT, team.tactics || {});
      return { idx: i, team, lineup, tac, score: 0, sog: 0, fow: 0, hits: 0, tk: 0, pim: 0, ppG: 0, ppOpp: 0, shG: 0, giveaways: 0,
        fIdx: 0, dIdx: 0, stIdx: 0, fShift: 0, dShift: 0, stShift: 0, situation: "ES",
        box: [], pend: [], pulled: false, gIdx: 0, manualPull: false, manualSwap: false, holdPull: false, swapG: false, noChange: false, queue: [], changeCheck: 0, soShots: [], soGoals: 0 };
    });
    this.stats = {}; this.energy = {}; this.fatigue = {};
    for (const t of this.teams) for (const p of t.lineup.roster) {
      this.stats[p.id] = { top: 0, dist: 0, bursts: 0, hard: 0, g: 0, a: 0, pm: 0, sog: 0, att: 0, tk: 0, blk: 0, hit: 0, pim: 0, toi: 0, sa: 0, sv: 0, ga: 0, fow: 0, fol: 0, ppg: 0, shg: 0, shifts: 0, dk: 0 };
      this.energy[p.id] = 100; this.fatigue[p.id] = 0;
    }
    // every goalie has a night: some are hot, some fight the puck
    this.gForm = {}; this.fought = new Set(); this.out = {};
    for (const t of this.teams) for (const g of t.lineup.goalies) if (g) { const z = (rnd() + rnd() + rnd() - 1.5) * 2; this.gForm[g.id] = clamp(1 + z * 0.09, 0.82, 1.2); }
    this.gRecent = [[], []]; // shot times on each goalie, for scrambles
    this.period = 1; this.clock = PERIOD_LEN; this.time = 0;
    this.events = []; this.final = false; this.decision = ""; this.banner = null;
    this.skaters = []; this.goalies = [null, null];
    this.puck = { x: 0, y: 0, vx: 0, vy: 0, carrier: null, lastTeam: -1, lastTouchTeam: -1, chain: [], pass: null, shot: null, release: null, touched: true, idle: 0, trail: [] };
    this.lastSave = { t: -99, team: -1 }; this.lastShot = { t: -99, team: -1 };
    this.ozPasses = [0, 0]; // completed passes in the attacking zone since the last shot: the longer it goes, the more a team wants it on net
    this.chemCache = {};
    this.shotLog = []; this.wp = []; this.wpT = 0;
    this.mom = [0, 0]; this.momLog = [-999, -999]; this.momT = [0, 0];
    this.pTeam = {}; this.teams.forEach((T, ti) => { for (const p of T.lineup.roster) this.pTeam[p.id] = ti; });
    // team quality for the win-probability model: the dressed lineup's overall ratings
    this.teamRating = this.teams.map(T => { const sk = [...T.lineup.fLines.flat(), ...T.lineup.dPairs.flat()].filter(Boolean); const g = T.lineup.goalies[0]; return (sk.reduce((a, p) => a + overall(p), 0) / Math.max(1, sk.length)) * 0.75 + (g ? overall(g) : 70) * 0.25; });
    this.spotT = 0; this.fx = []; this.michigan = {};
    this.rec = []; this.pendingReplay = null; this.replayReady = null;
    this.setupPeriod();
    this.log("period", -1, "Puck drop. " + this.teams[1].team.name + " at " + this.teams[0].team.name + ".");
  }

  // ---------- helpers ----------
  // the coach's plan, plus the late-game push when chasing
  tac(ti) {
    const T = this.teams[ti], t = T.tac;
    const chasing = this.teams[1 - ti].score > T.score && this.period >= 3 && this.clock < 420;
    return chasing ? { pp: t.pp, pk: t.pk, fc: "212", agg: Math.max(t.agg, 85), late: true } : t;
  }
  aggr(ti) { return clamp(this.tac(ti).agg / 100 + 0.18 * this.momo(ti), 0, 1); }
  // momentum: -1..1 from this team's point of view
  momo(ti) { return this.mom ? clamp(this.mom[ti] - this.mom[1 - ti], -1, 1) : 0; }
  bump(ti, v) {
    if (!this.mom || ti < 0) return;
    this.mom[ti] = clamp(this.mom[ti] + v, 0, 1);
    const m = this.momo(ti);
    if (m > 0.62 && this.time - (this.momLog[ti] || -999) > 150 && this.phase !== "final") { this.momLog[ti] = this.time; this.log("momentum", ti, this.teams[ti].team.name + " have all the momentum right now."); }
  }
  canPinch(s) {
    const a = this.aggr(s.team), st = s.p.style;
    return (st === "Offensive" && a >= 0.2) || (st === "Two-Way" && a >= 0.6) || a >= 0.85;
  }
  dir(ti) { const base = (this.period % 2 === 1) ? 1 : -1; return ti === 0 ? base : -base; }
  benchDoor(ti) { const b = BENCH_X[ti]; return { x: (b[0] + b[1]) / 2, y: -40.6 }; }
  strength(ti) {
    const own = this.teams[ti].box.filter(b => !b.coin).length, opp = this.teams[1 - ti].box.filter(b => !b.coin).length;
    // 3-on-3 overtime: a penalty adds a skater to the other side; when it ends it's 4-on-4 until the next whistle
    if (this.period === 4 && !this.playoff) return 3 + Math.max(0, Math.min(2, opp - own)) + (this.otHold && opp === own ? 1 : 0);
    return 5 - Math.min(2, own);
  }
  // injured, or sitting in the box: can't be sent out
  isOut(ti, id) { return this.teams[ti].box.some(b => b.p.id === id) || !!(this.out && this.out[id]); }
  activateBox(T) { let k = 0; for (const b of T.box) { if (b.coin) { b.active = true; continue; } if (k++ < 2) b.active = true; } }
  shorthanded(ti) { return this.strength(ti) < this.strength(1 - ti); }
  onIce(ti) { return this.skaters.filter(s => s.team === ti && s.state === "on"); }
  netEmpty(ti) { const g = this.goalies[ti]; return !g || g.state !== "net"; }
  // ---------- the bench boss: changes a human coach can make mid-game ----------
  refreshLineup(ti) {
    const T = this.teams[ti], gid = (this.goalieOf(ti) || {}).id;
    T.lineup = buildLineup(this.league, T.team.id);
    T.tac = Object.assign({}, TAC_DEFAULT, T.team.tactics || {});
    for (const p of T.lineup.roster) {
      if (!this.stats[p.id]) { this.stats[p.id] = { top: 0, dist: 0, bursts: 0, hard: 0, g: 0, a: 0, pm: 0, sog: 0, att: 0, tk: 0, blk: 0, hit: 0, pim: 0, toi: 0, sa: 0, sv: 0, ga: 0, fow: 0, fol: 0, ppg: 0, shg: 0, shifts: 0, dk: 0 }; this.energy[p.id] = 100; this.fatigue[p.id] = 0; }
      this.pTeam[p.id] = ti;
      if (posGroup(p) === "G" && this.gForm[p.id] == null) this.gForm[p.id] = 1;
    }
    // keep whoever is in net unless the coach picked someone else
    const want = T.wantG || gid, gi = T.lineup.goalies.findIndex(g => g && g.id === want);
    T.gIdx = gi >= 0 ? gi : 0; T.wantG = null;
  }
  setGoalie(ti, id) { // between periods: pick who starts the next one
    const T = this.teams[ti], gi = T.lineup.goalies.findIndex(g => g && g.id === id); if (gi < 0) return;
    T.swapG = false;
    if (gi !== T.gIdx) { const was = this.goalieOf(ti); T.gIdx = gi; this.log("goalie", ti, "Goalie change: " + T.lineup.goalies[gi].name + " will start the next period in place of " + (was ? was.name : "the starter") + "."); }
  }
  coachPull(ti, on) {
    const T = this.teams[ti], g = this.goalies[ti];
    if (on === false) { T.holdPull = false; return; }
    if (this.final || this.phase === "shootout" || this.period >= 5) return;
    T.holdPull = true;
    if (g && g.state === "net" && this.phase === "play" && !T.pulled) { g.state = "leaving"; this.log("goalie", ti, g.p.name + " skates to the bench. The coach wants six skaters."); }
  }
  coachSwap(ti) {
    const T = this.teams[ti]; if (!T.lineup.goalies[1 - T.gIdx]) return false;
    T.swapG = !T.swapG; return true;
  }
  applySwap(ti, between) {
    const T = this.teams[ti]; T.swapG = false;
    const next = T.lineup.goalies[1 - T.gIdx]; if (!next || this.phase === "shootout") return;
    const was = this.goalieOf(ti); T.gIdx = 1 - T.gIdx;
    this.log("goalie", ti, "Goalie change: " + next.name + " replaces " + (was ? was.name : "the starter") + " in net.");
    if (between) return; // setupPeriod builds the new goalie
    if (T.pulled) return; // she comes on when the net is filled again
    this.goalies[ti] = this.makeGoalie(ti); const door = this.benchDoor(ti); this.goalies[ti].x = door.x; this.goalies[ti].y = -40; this.goalies[ti].state = "returning";
  }
  goalieOf(ti) { const T = this.teams[ti]; return T.lineup.goalies[T.gIdx] || T.lineup.goalies[0]; }
  e(p) { return this.energy[p.id]; }
  hands(p) { return (p.hnd == null ? p.off : p.hnd) * this.skill(p); }
  r(p, k) { const v = p[k]; return v == null ? (k === "chk" ? p.def : k === "skt" ? p.spd : k === "fo" ? (p.off + p.def) / 2 : k === "clu" ? 60 : p.off) : v; }
  // late in a close game, overtime, the shootout: clutch players rise
  clutchOn() { return this.period >= 4 || (this.period === 3 && this.clock < 480 && Math.abs(this.teams[0].score - this.teams[1].score) <= 1); }
  clutch(p) { return this.clutchOn() ? 1 + (this.r(p, "clu") - 60) / 300 : 1; }
  addFx(s, text) { this.fx.push({ s, x: s.x, y: s.y, text, t: 0, team: s.team }); if (this.fx.length > 8) this.fx.shift(); }
  spdMul(p) { return 0.68 + 0.32 * Math.pow(this.energy[p.id] / 100, 0.8); }
  skill(p) { const ti = this.pTeam ? this.pTeam[p.id] : undefined; return (0.8 + 0.2 * this.energy[p.id] / 100) * (ti == null ? 1 : 1 + 0.08 * this.momo(ti)); }
  chemKey(ti) { const ps = this.onIce(ti).map(s => s.p); const g = this.goalies[ti]; if (g) ps.push(g.p); return { ps, key: ps.map(p => p.id).sort().join("|") }; }
  chemValue(ti) { const { ps, key } = this.chemKey(ti); if (!(key in this.chemCache)) this.chemCache[key] = unitChemistry(ps, this.fam).value; return this.chemCache[key]; }
  chemMult(ti) { return 1 + (this.chemValue(ti) - 60) / 200; }
  xgAt(x, y, ti) {
    const d = this.dir(ti), gx = d * RINK.goalX;
    if (d * x > RINK.goalX - 1) return 0.005;
    const dd = dist(x, y, gx, 0), ang = Math.abs(gx - x) / (dd || 1);
    return (0.32 * Math.exp(-dd / 20) + 0.015) * (0.45 + 0.55 * ang);
  }
  nearestOpp(s) {
    let best = null, bd = 1e9;
    for (const o of this.skaters) if (o.team !== s.team && o.state === "on") { const d = dist(o.x, o.y, s.x, s.y); if (d < bd) { bd = d; best = o; } }
    return best ? { s: best, d: bd } : null;
  }
  log(type, ti, text, extra) {
    this.events.push(Object.assign({ type, team: ti, text, period: this.period, clock: this.clock, score: [this.teams[0].score, this.teams[1].score] }, extra || {}));
  }

  // ---------- personnel ----------
  makeSkater(p, ti, g, x, y) {
    return { p, team: ti, g, x, y, vx: 0, vy: 0, tx: x, ty: y, state: "on", maxSpd: 20 + p.spd * 0.11, cool: 0, stun: 0, checkCool: 0,
      decideT: rnd() * 0.3, holdT: 0, dekeCool: 0, spot: null, spotKey: "", gotT: -99, gotFrom: null, lane: 0, zoneT: 0, wrap: 0 };
  }
  makeGoalie(ti) {
    const d = this.dir(ti);
    return { p: this.goalieOf(ti), team: ti, x: -d * (RINK.goalX - 3), y: 0, vx: 0, vy: 0, state: "net" };
  }
  dressedF(ti) { return this.teams[ti].lineup.fLines.flat(); }
  dressedD(ti) { return this.teams[ti].lineup.dPairs.flat(); }
  desiredSet(ti) {
    const T = this.teams[ti], L = T.lineup;
    const inBox = new Set([...T.box.map(b => b.p.id), ...Object.keys(this.out || {})]);
    const n = this.strength(ti), m = this.strength(1 - ti);
    let F, D;
    const taken = new Set();
    const fPool = this.dressedF(ti).slice().sort((a, b) => this.e(b) - this.e(a));
    const dPool = this.dressedD(ti).slice().sort((a, b) => this.e(b) - this.e(a));
    // special teams: the unit's slots, dropping the least important ones when short, each player playing their own position
    const special = (u, keep) => {
      const out = [], cap = n + (T.pulled ? 1 : 0);
      for (const k of keep) { const p = u.slots[k]; if (p && out.length < cap && !inBox.has(p.id) && !taken.has(p.id)) { out.push(p); taken.add(p.id); } }
      for (const p of [...fPool, ...dPool]) if (out.length < cap && !inBox.has(p.id) && !taken.has(p.id)) { out.push(p); taken.add(p.id); }
      return out.map(p => ({ p, g: posGroup(p) === "D" ? "D" : "F" }));
    };
    if (n > m && L.pp.length) { T.situation = "PP"; return special(L.pp[T.stIdx % L.pp.length], PP_KEEP); }
    if (n < m && L.pk.length) { T.situation = "PK"; return special(L.pk[T.stIdx % L.pk.length], PK_KEEP); }
    F = L.fLines[T.fIdx % L.fLines.length].slice(); D = L.dPairs[T.dIdx % L.dPairs.length].slice(); T.situation = "ES";
    const fill = (arr, pools, k) => {
      const out = [];
      for (const p of arr) if (out.length < k && !inBox.has(p.id) && !taken.has(p.id)) { out.push(p); taken.add(p.id); }
      for (const pool of pools) for (const p of pool) if (out.length < k && !inBox.has(p.id) && !taken.has(p.id)) { out.push(p); taken.add(p.id); }
      return out;
    };
    const nD = n === 3 ? 1 : 2; // 3-on-3: two forwards and a defenseman
    const Fs = fill(F, [fPool, dPool], n - nD), Ds = fill(D, [dPool, fPool], nD);
    const out = [...Fs.map(p => ({ p, g: "F" })), ...Ds.map(p => ({ p, g: "D" }))];
    if (T.pulled) { const x = fill([], [this.dressedF(ti).slice().sort((a, b) => b.off - a.off), dPool], 1)[0]; if (x) out.push({ p: x, g: "F" }); }
    return out;
  }
  // players not in the desired set skate to the bench; replacements hop on as they arrive
  // group: "F" or "D" changes only that group, "fill" only fills empty spots, nothing = full change (stoppages)
  // can this skater head for the bench right now? not deep in the attack, not with the puck, not miles away
  canChange(s) {
    const P = this.puck, d = this.dir(s.team), door = this.benchDoor(s.team);
    if (s === P.carrier || (P.pass && (P.pass.to === s || P.pass.interceptor === s))) return false;
    if (s.g === "D" && !(P.carrier && P.carrier.team === s.team)) return false; // D only change with the puck
    const zx = d * s.x, pz = d * P.x;
    // forwards finish the play in the zone; a D at the point can go once the puck is safely deep or out
    if (zx > RINK.blueX + 3 && !(s.g === "D" && zx < RINK.blueX + 10 && pz < RINK.blueX)) return false;
    return dist(s.x, s.y, door.x, door.y) < (s.g === "D" ? 66 : 52);
  }
  // on-ice skaters in a group who aren't in the coach's current plan for that group
  stragglers(ti, group) {
    const want = new Set(this.desiredSet(ti).filter(w => w.g === group).map(w => w.p.id));
    return this.onIce(ti).filter(s => s.g === group && !want.has(s.p.id));
  }
  requestChange(ti, atStoppage, group) {
    const T = this.teams[ti];
    let want = this.desiredSet(ti);
    const mine = this.skaters.filter(s => s.team === ti);
    if (group === "fill") {
      const present = new Set(mine.filter(s => s.state === "on" || s.state === "leaving").map(s => s.p.id));
      T.queue = want.filter(w => !present.has(w.p.id));
      return T.queue.length > 0;
    }
    if (group && !atStoppage) {
      // on the fly: only the players who can get to the bench now go; the rest follow when they're clear
      const present = new Set(mine.filter(s => s.state === "on" || s.state === "leaving").map(s => s.p.id));
      const out = this.stragglers(ti, group).filter(s => this.canChange(s));
      if (!out.length) return false;
      const queued = new Set(T.queue.map(w => w.p.id));
      const repl = want.filter(w => w.g === group && !present.has(w.p.id) && !queued.has(w.p.id)).slice(0, out.length);
      for (const s of out) s.state = "leaving";
      T.queue = T.queue.concat(repl);
      return true;
    }
    if (group) {
      const keep = mine.filter(s => s.state === "on" && s.g !== group);
      const keepIds = new Set(keep.map(s => s.p.id));
      want = [...keep.map(s => ({ p: s.p, g: s.g })), ...want.filter(w => w.g === group && !keepIds.has(w.p.id))];
    }
    const wantIds = new Map(want.map(w => [w.p.id, w.g]));
    const out = mine.filter(s => s.state === "on" && !wantIds.has(s.p.id));
    if (!atStoppage && out.includes(this.puck.carrier)) return false;
    for (const s of mine) if (wantIds.has(s.p.id)) { if (s.state === "leaving") s.state = "on"; s.g = wantIds.get(s.p.id); }
    for (const s of out) { s.state = "leaving"; if (this.puck.carrier === s) this.puck.carrier = null; }
    const present = new Set(mine.filter(s => s.state === "on" || s.state === "leaving").map(s => s.p.id));
    T.queue = want.filter(w => !present.has(w.p.id));
    return out.length > 0 || T.queue.length > 0;
  }
  processBench(ti, force) {
    const T = this.teams[ti];
    const door = this.benchDoor(ti), b = BENCH_X[ti];
    for (const s of this.skaters) {
      if (s.team !== ti) continue;
      if (s.state === "leaving" && (force || (s.y < -38.8 && s.x > b[0] - 2 && s.x < b[1] + 2))) s.state = "gone";
      if (s.state === "toBox" && (force || (s.y > 38.8 && Math.abs(s.x - BOX_X[ti]) < 6))) s.state = "gone";
    }
    this.skaters = this.skaters.filter(s => s.state !== "gone");
    const atDoor = s => s.y < -35.5 && s.x > b[0] - 3 && s.x < b[1] + 3;
    const present = this.skaters.filter(s => s.team === ti && (s.state === "on" || (s.state === "leaving" && !atDoor(s)))).length;
    let room = this.strength(ti) + (T.pulled ? 1 : 0) - present;
    while (room > 0 && T.queue.length) {
      const w = T.queue.shift();
      if (this.skaters.some(s => s.p === w.p) || T.box.some(b => b.p === w.p)) continue; // already out there
      room--;
      const near = this.skaters.find(s => s.team === ti && s.state === "leaving" && atDoor(s));
      const s = this.makeSkater(w.p, ti, w.g, near ? clamp(near.x, b[0] + 1, b[1] - 1) : door.x + (rnd() - 0.5) * 10, door.y);
      s.vy = 12; this.skaters.push(s); this.stats[w.p.id].shifts++;
    }
  }

  // ---------- periods, whistles, faceoffs ----------
  setupPeriod() {
    this.skaters = [];
    for (let ti = 0; ti < 2; ti++) {
      const T = this.teams[ti]; T.fIdx = 0; T.dIdx = 0; T.stIdx = 0; T.fShift = T.dShift = T.stShift = 0; T.queue = []; T.pulled = false; T.holdPull = false;
      if (T.swapG) this.applySwap(ti, true);
      for (const w of this.desiredSet(ti)) { const s = this.makeSkater(w.p, ti, w.g, 0, 0); this.skaters.push(s); this.stats[w.p.id].shifts++; }
      this.goalies[ti] = this.makeGoalie(ti);
    }
    this.startFaceoff(0, 0, true);
  }
  whistle(fx, fy, reason, type) {
    if (this.phase === "stoppage" || this.final) return;
    const P = this.puck;
    P.carrier = null; P.pass = null; P.shot = null; P.vx *= 0.3; P.vy *= 0.3;
    if (reason) this.log(type || "stop", -1, reason);
    let penTeam = -1;
    for (let ti = 0; ti < 2; ti++) if (this.teams[ti].pend.length) { this.assessPenalties(ti); penTeam = penTeam === -1 ? ti : -2; }
    if (penTeam >= 0) { const d = this.dir(penTeam); fx = -d * RINK.dotX; fy = (P.y >= 0 ? 1 : -1) * RINK.dotY; }
    this.phase = "stoppage"; this.phaseT = 0; this.pendingFace = { x: fx, y: fy };
    this.stoppageChanges();
  }
  stoppageChanges() {
    this.otHold = false;
    for (let ti = 0; ti < 2; ti++) {
      const T = this.teams[ti];
      if (T.swapG) this.applySwap(ti, false);
      if (T.pulled || (this.goalies[ti] && this.goalies[ti].state !== "net")) {
        if (T.pulled) { T.pulled = false; this.goalies[ti] = this.makeGoalie(ti); const door = this.benchDoor(ti); this.goalies[ti].x = door.x; this.goalies[ti].y = -40; }
        this.goalies[ti].state = "returning";
      }
      const prevSit = T.situation;
      const sit = this.strength(ti) > this.strength(1 - ti) ? "PP" : this.strength(ti) < this.strength(1 - ti) ? "PK" : "ES";
      if (sit !== prevSit) { T.stIdx = 0; T.stShift = 0; }
      if (!T.noChange) {
        const fE = this.avgEnergy(ti, "F"), dE = this.avgEnergy(ti, "D");
        if (sit === "ES") {
          if (T.fShift > 22 || fE < 72) { T.fIdx = this.nextUnit(ti, "F"); T.fShift = 0; }
          if (T.dShift > 28 || dE < 70) { T.dIdx = this.nextUnit(ti, "D"); T.dShift = 0; }
        } else if (T.stShift > 50) { T.stIdx++; T.stShift = 0; }
      }
      for (const s of this.skaters) if (s.team === ti && s.state === "on" && this.out && this.out[s.p.id]) s.state = "leaving";
      const mustFix = sit !== prevSit || this.skaters.some(s => s.team === ti && s.state === "on" && T.box.some(b => b.p.id === s.p.id)) ||
        this.onIce(ti).length !== this.strength(ti);
      if (!T.noChange || mustFix) { this.requestChange(ti, true); T.pendF = T.pendD = false; }
    }
  }
  // pick the next line or pair: the freshest unit, with a lean toward the top units
  // coach's rotation: top units get more shifts, a gassed unit gets skipped
  nextUnit(ti, g) {
    const T = this.teams[ti], units = g === "F" ? T.lineup.fLines : T.lineup.dPairs;
    if (units.length < 2) return 0;
    const seq = (g === "F" ? [0, 1, 2, 0, 1, 3, 0, 1, 2, 3] : [0, 1, 2, 0, 1, 2, 0, 1]).filter(i => i < units.length);
    const key = g === "F" ? "rotF" : "rotD", cur = g === "F" ? T.fIdx : T.dIdx;
    for (let tries = 0; tries < seq.length; tries++) {
      T[key] = ((T[key] || 0) + 1) % seq.length;
      const i = seq[T[key]];
      if (i === cur) continue;
      const e = units[i].reduce((t, p) => t + this.e(p), 0) / units[i].length;
      if (e >= 62 || tries >= seq.length - 1) return i;
    }
    return (cur + 1) % units.length;
  }
  avgEnergy(ti, g) { const a = this.onIce(ti).filter(s => s.g === g); return a.length ? a.reduce((t, s) => t + this.e(s.p), 0) / a.length : 100; }
  startFaceoff(fx, fy, teleport) {
    this.phase = "faceoff"; this.phaseT = 0; this.face = { x: fx, y: fy };
    const P = this.puck;
    Object.assign(P, { x: fx, y: fy, vx: 0, vy: 0, carrier: null, pass: null, shot: null, chain: [], idle: 0, trail: [], release: null, touched: true });
    this.prevPuckX = fx; this.delayedOffside = null;
    this.faceTargets();
    if (teleport) {
      for (const s of this.skaters) { s.x = s.tx; s.y = s.ty; s.vx = s.vy = 0; }
      for (let ti = 0; ti < 2; ti++) if (this.goalies[ti]) { const g = this.goalies[ti]; g.x = -this.dir(ti) * (RINK.goalX - 3); g.y = 0; g.state = "net"; }
    }
  }
  faceTargets() {
    const { x: fx, y: fy } = this.face;
    for (let ti = 0; ti < 2; ti++) {
      const d = this.dir(ti);
      const on = this.onIce(ti);
      const wingOrder = { C: 0, LW: 1, RW: 2 };
      const Fs = on.filter(s => s.g === "F").sort((a, b) => (wingOrder[a.p.pos] ?? 3) - (wingOrder[b.p.pos] ?? 3) || (b.p.off + b.p.def) - (a.p.off + a.p.def));
      const Ds = on.filter(s => s.g === "D").sort((a, b) => (a.p.side === "R") - (b.p.side === "R") || (b.p.side === "L") - (a.p.side === "L"));
      const fSpots = [[-2.5, 0], [-4, -15], [-4, 15], [-12, 0]], dSpots = [[-22, -9], [-22, 9]];
      const place = (s, off) => { s.tx = clamp(fx + d * off[0], -86, 86); s.ty = clamp(fy + d * off[1], -39, 39); if (Math.abs(s.tx) > 84 && Math.abs(s.ty) < 6) s.ty = (s.ty >= 0 ? 1 : -1) * 7; };
      const at = (s, x, y) => { s.tx = clamp(x, -86, 86); s.ty = clamp(y, -39, 39); };
      const zf = d * fx, sg = fy >= 0 ? 1 : -1;
      if (Math.abs(zf) > RINK.blueX && Fs.length) {
        // end-zone draw: one winger on the wall, one in the slot (shooter or slot cover), D at the points or around the net
        const wallW = Fs.slice(1).find(s => (s.p.pos === "LW" ? -d : s.p.pos === "RW" ? d : 0) === sg) || Fs[1];
        const others = Fs.slice(1).filter(s => s !== wallW);
        at(Fs[0], fx - d * 2.5, fy);
        if (wallW) at(wallW, fx - d * 3, fy + sg * 14);
        if (zf > 0) { // attacking
          if (others[0]) at(others[0], fx - d * 13, fy * 0.35);
          if (others[1]) at(others[1], fx - d * 22, 0);
          Ds.forEach((s, k) => at(s, d * 30, k ? -sg * 8 : sg * 16));
        } else { // defending our own end
          if (others[0]) at(others[0], fx + d * 14, fy * 0.3);
          if (others[1]) at(others[1], fx + d * 20, -sg * 10);
          Ds.forEach((s, k) => at(s, -d * (RINK.goalX - (k ? 12 : 9)), k ? -sg * 6 : sg * 5));
        }
      } else {
        Fs.forEach((s, k) => place(s, fSpots[Math.min(k, 3)]));
        Ds.forEach((s, k) => place(s, dSpots[k % 2]));
      }
      for (const s of this.skaters) if (s.team === ti && s.state !== "on") this.offIceTarget(s);
    }
  }
  offIceTarget(s) {
    if (s.fightT > 0 && this.fight) { // still throwing punches: circle the other fighter
      const F = this.fight, o = s === F.a ? F.b : F.a, ang = F.ang + (s === F.a ? 0 : Math.PI);
      s.tx = F.x + Math.cos(ang) * 1.7; s.ty = F.y + Math.sin(ang) * 1.7; return;
    }
    if (s.state === "leaving") { const b = BENCH_X[s.team]; s.tx = clamp(s.x, b[0] + 2, b[1] - 2); s.ty = -42; }
    else if (s.state === "toBox") { s.tx = BOX_X[s.team]; s.ty = 42; }
  }
  // after the whistle at the net: a shove becomes a scrum, now and then a couple of minors
  maybeScrum(x, y) {
    if (this.phase !== "stoppage" || this.fight || this.scrum) return;
    const near = this.skaters.filter(s => s.state === "on" && dist(s.x, s.y, x, y) < 14);
    const t0 = near.filter(s => s.team === 0), t1 = near.filter(s => s.team === 1);
    if (!t0.length || !t1.length) return;
    const heat = near.reduce((a, s) => a + (1.6 - s.p.dis / 100) * (s.p.style === "Enforcer" || s.p.style === "Grinder" || s.p.style === "Power Forward" ? 1.4 : 1), 0) / near.length;
    if (rnd() > 0.22 * heat * (1 + 0.5 * Math.abs(this.momo(0)))) return;
    const dur = 1.6 + rnd() * 2;
    this.scrum = { x, y, t: 0, dur, who: near };
    for (const s of near) s.shove = dur;
    this.addFx(near[0], "Scrum!");
    this.log("stop", -1, "A scrum breaks out in front of the net after the whistle.");
    // the referee sends one from each side for roughing now and then
    if (rnd() < 0.14 * heat) {
      const a = t0.sort((p, q) => p.p.dis - q.p.dis)[0], b = t1.sort((p, q) => p.p.dis - q.p.dis)[0];
      for (const [o, v] of [[a, b], [b, a]]) { this.teams[o.team].pend.push({ p: o.p, kind: "roughing" }); }
      this.log("delayed", -1, a.p.name + " and " + b.p.name + " get matching minors for roughing.");
      this.scrum.pens = true;
    }
  }
  stepScuffle(dt) {
    // returns true while something is still going on after the whistle
    let busy = false;
    if (this.fight) {
      const F = this.fight; F.t += dt; F.ang += dt * (2.2 + Math.sin(F.t * 3) * 1.5);
      for (const s of [F.a, F.b]) { s.shove = 0.3; if (F.t > F.dur) s.fightT = 0; }
      if (F.t > F.dur) { this.finishFight(); } else busy = true;
      // everyone else gives them room and watches
      for (const s of this.skaters) if (s.state === "on") { const ang = Math.atan2(s.y - F.y, s.x - F.x); s.tx = F.x + Math.cos(ang) * 13; s.ty = clamp(F.y + Math.sin(ang) * 13, -38, 38); }
    }
    if (this.scrum) {
      const S = this.scrum; S.t += dt;
      for (const s of S.who) if (s.state === "on") { s.tx = S.x + Math.sin(s.p.no * 1.7 + S.t * 2) * 2.4; s.ty = S.y + Math.cos(s.p.no * 2.3 + S.t * 2) * 2.4; s.shove = Math.max(0, S.dur - S.t); }
      if (S.t > S.dur) {
        if (S.pens) for (let ti = 0; ti < 2; ti++) if (this.teams[ti].pend.length) { this.assessPenalties(ti); this.teams[1 - ti].ppOpp--; }
        for (const s of S.who) s.shove = 0;
        this.scrum = null;
        for (let ti = 0; ti < 2; ti++) if (this.onIce(ti).length !== this.strength(ti)) this.requestChange(ti, true);
      } else busy = true;
    }
    return busy;
  }
  dropPuck() {
    this.ozPasses = [0, 0];
    const cs = [0, 1].map(ti => this.onIce(ti).filter(s => s.g === "F").sort((a, b) => dist(a.x, a.y, this.face.x, this.face.y) - dist(b.x, b.y, this.face.x, this.face.y))[0] || this.onIce(ti)[0]);
    if (!cs[0] || !cs[1]) return;
    const sc = s => this.r(s.p, "fo") * 0.85 * this.clutch(s.p) + s.p.def * 0.1 + s.p.dis * 0.05;
    const pHome = clamp(0.5 + (sc(cs[0]) - sc(cs[1])) / 150, 0.22, 0.78);
    const win = rnd() < pHome ? 0 : 1, w = cs[win], l = cs[1 - win];
    this.teams[win].fow++; this.stats[w.p.id].fow++; this.stats[l.p.id].fol++;
    this.phase = "play"; this.phaseT = 0;
    for (const T of this.teams) T.noChange = false;
    if (!this.pendingReplay) this.rec = [];
    const d = this.dir(win);
    const back = this.onIce(win).filter(s => s !== w).sort((a, b) => d * a.x - d * b.x)[0] || w;
    this.puck.lastTeam = win; this.puck.chain = [w.p.id];
    const zf = d * this.face.x;
    if (zf > RINK.blueX && rnd() < 0.85) { // offensive-zone set play: straight back for a quick shot
      const mates = this.onIce(win).filter(s => s !== w);
      const slot = mates.filter(s => s.g === "F").sort((a, b) => dist(a.x, a.y, d * 75, 0) - dist(b.x, b.y, d * 75, 0))[0];
      const pointD = mates.filter(s => s.g === "D").sort((a, b) => dist(a.x, a.y, w.x, w.y) - dist(b.x, b.y, w.x, w.y))[0];
      const t = slot && (!pointD || rnd() < 0.45) ? slot : pointD || back;
      if (t && t !== w) {
        t.setPlay = { kind: "oz", until: this.time + 1.2 };
        this.launchPass(w, t, { x: t.x, y: t.y }, null, 50);
        this.log("play", win, w.p.name + " wins the draw clean back to " + t.p.name + " for the shot.");
        return;
      }
    }
    if (zf < -RINK.blueX && back !== w) back.setPlay = { kind: "dz", until: this.time + 1.8 };
    if (back === w) this.gainPossession(w, "face"); else this.launchPass(w, back, { x: back.x, y: back.y }, null, 42);
  }

  // ---------- penalties ----------
  callPenalty(o, victim, list) {
    const T = this.teams[o.team];
    const kind = list[Math.floor(rnd() * list.length)];
    T.pend.push({ p: o.p, kind });
    this.log("delayed", o.team, "Delayed penalty coming to " + o.p.name + " for " + kind + ".");
  }
  assessPenalties(ti) {
    const T = this.teams[ti], O = this.teams[1 - ti];
    for (const pen of T.pend) {
      // a second minor to someone already serving (or called twice on the play) stacks: a double minor
      const have = T.box.find(b => b.p.id === pen.p.id && !b.coin);
      if (have) { have.left += MINOR; have.dbl = true; this.stats[pen.p.id].pim += 2; T.pim += 2; this.log("penalty", ti, pen.p.name + " (" + T.team.abbr + ") gets another 2 minutes for " + pen.kind + ": a double minor."); continue; }
      T.box.push({ p: pen.p, kind: pen.kind, left: MINOR, active: false });
      this.stats[pen.p.id].pim += 2; T.pim += 2; O.ppOpp++;
      const s = this.skaters.find(x => x.p === pen.p && x.team === ti);
      if (s) { s.state = "toBox"; if (this.puck.carrier === s) this.puck.carrier = null; }
      else T.queue = T.queue.filter(w => w.p !== pen.p);
      this.log("penalty", ti, pen.p.name + " (" + T.team.abbr + ") 2 minutes for " + pen.kind + ".");
    }
    T.pend = [];
    this.activateBox(T);
  }
  tickPenalties(gdt) {
    for (let ti = 0; ti < 2; ti++) {
      const T = this.teams[ti];
      for (const b of T.box) if (b.active) b.left -= gdt;
      for (const b of T.box.filter(b => b.active && b.left <= 0)) this.releaseFromBox(ti, b, false);
    }
  }
  releaseFromBox(ti, b, early) {
    const T = this.teams[ti];
    T.box = T.box.filter(x => x !== b);
    this.activateBox(T);
    if (b.coin) { this.log("ppend", ti, b.p.name + "'s fighting major is over; she heads to the bench."); return; }
    if (this.period === 4 && !early) this.otHold = true;
    if (T.box.filter(x => !x.coin).length >= 2) { this.log("ppend", ti, b.p.name + " leaves the box; the next penalty starts."); return; }
    if (T.box.some(x => x.p.id === b.p.id)) return; // still serving another penalty
    this.skaters = this.skaters.filter(x => !(x.p.id === b.p.id && x.team === ti && x.state === "toBox")); // released before she even sat down
    if (this.skaters.some(x => x.p.id === b.p.id && x.team === ti)) return; // already out there: never two of her
    const s = this.makeSkater(b.p, ti, posGroup(b.p) === "D" ? "D" : "F", BOX_X[ti], 40.4);
    s.vy = -10; this.skaters.push(s);
    this.log("ppend", ti, early ? b.p.name + " is released after the power-play goal." : b.p.name + " is back from the box.");
    if (!early) this.bump(ti, 0.15); // a big kill
  }

  // ---------- puck actions ----------
  setRelease(team) { const P = this.puck; P.release = { team, x: P.x, sh: this.shorthanded(team) }; P.touched = false; P.lastTouchTeam = team; }
  launchPass(from, to, target, interceptor, speed) {
    const P = this.puck;
    if (from && from.p) from.anim = { k: 3, t: this.time, a: Math.atan2(target.y - from.y, target.x - from.x) };
    P.carrier = null;
    const dx = target.x - P.x, dy = target.y - P.y, d = Math.hypot(dx, dy) || 1;
    const spd = speed || PASS_SPEED;
    P.vx = dx / d * spd; P.vy = dy / d * spd;
    P.pass = { from, to, interceptor, tx: target.x, ty: target.y, left: d + 3, fromTeam: from.team };
    if (to && to.team === from.team && this.dir(to.team) * target.x > RINK.blueX + 6 && this.dir(to.team) * target.x < RINK.goalX - 3 && this.oneTimerOK(from.x, from.y, target.x, target.y, to.team) && this.xgAt(target.x, target.y, to.team) > 0.05) P.pass.ot = true;
    this.setRelease(from.team);
    from.cool = 0.35;
  }
  gainPossession(s, how) {
    const P = this.puck;
    if (P.lastTeam !== s.team) { this.ozPasses[0] = this.ozPasses[1] = 0; }
    else if (P.pass && P.pass.from && P.pass.to === s && this.dir(s.team) * s.x > RINK.blueX) this.ozPasses[s.team]++;
    if (P.lastTeam !== s.team) { P.chain = []; if (P.lastTeam >= 0 && how !== "face") this.teams[P.lastTeam].giveaways++; }
    if (P.chain[P.chain.length - 1] !== s.p.id) P.chain.push(s.p.id);
    if (P.pass && P.pass.from && P.pass.from.team === s.team && P.pass.to === s) { s.gotT = this.time; s.gotFrom = P.pass.from; s.otOK = this.oneTimerOK(P.pass.from.x, P.pass.from.y, s.x, s.y, s.team); }
    else { s.gotT = -99; s.gotFrom = null; s.otOK = false; }
    s.haveT = this.time;
    P.carrier = s; P.lastTeam = s.team; P.lastTouchTeam = s.team; P.touched = true; P.release = null;
    P.pass = null; P.shot = null; P.vx = P.vy = 0; P.idle = 0;
    s.decideT = this.xgAt(s.x, s.y, s.team) > 0.06 ? 0.05 : 0.12 + rnd() * 0.15; s.zoneT = 0; s.wrap = 0; s.holdT = 0; s.baPlan = null; s.route = null;
    if (s.setPlay && s.setPlay.until > this.time) s.decideT = s.setPlay.kind === "oz" ? 0.05 : 0.1;
    s.lane = s.g === "D" ? (s.y >= 0 ? 1 : -1) * 18 : s.p.style === "Speedster" ? (s.y >= 0 ? 1 : -1) * 26 : clamp(s.y, -26, 26);
    if (how === "intercept") { this.stats[s.p.id].tk++; this.teams[s.team].tk++; this.log("takeaway", s.team, s.p.name + " picks off the pass."); }
    if (this.teams[s.team].pend.length && this.phase === "play") this.whistle(P.x, P.y, null);
  }
  // a pass you can one-time: long enough, and coming across or from below rather than straight from behind you
  oneTimerOK(fx, fy, x, y, ti) {
    const d = this.dir(ti), gx = d * RINK.goalX, L = dist(fx, fy, x, y);
    if (L < 12 || d * x < RINK.blueX) return false;
    const px = (x - fx) / L, py = (y - fy) / L, G = dist(x, y, gx, 0) || 1, ux = (gx - x) / G, uy = -y / G;
    return px * ux + py * uy < 0.55; // not a pass going the same way you're shooting
  }
  // everything about a shot except the dice: used both to decide and to shoot
  shotModel(s, opt) {
    opt = opt || {};
    const ti = s.team, d = this.dir(ti), gx = d * RINK.goalX;
    const empty = this.netEmpty(1 - ti), goalie = this.goalies[1 - ti];
    const st = s.p.style, dd = dist(s.x, s.y, gx, 0);
    const xg = opt.wrap ? opt.wrap / Math.max(0.2, TUNE.goal) : this.xgAt(s.x, s.y, ti);
    let mods = (0.55 + this.r(s.p, "sht") / 133) * this.skill(s.p) * this.clutch(s.p), tag = "";
    if (st === "Sniper") mods *= 1.12; else if (st === "Playmaker") mods *= 0.92; else if (st === "Power Forward" && dd < 16) mods *= 1.12;
    const oneTimer = this.time - s.gotT < 0.7 && s.gotFrom && s.otOK;
    if (oneTimer) { mods *= dd < 13 ? 1.15 : 1.35; tag = "one-timer"; if (areFriends(s.p, s.gotFrom.p)) { mods *= 1.15; tag = "chemistry one-timer"; } }
    const rebound = this.lastSave.team === 1 - ti && this.time - this.lastSave.t < 1.6;
    if (rebound) { mods *= 1.6; tag = "rebound"; }
    const near = this.nearestOpp(s);
    if (near && near.d < 5) mods *= 0.78;
    const alone = this.breakaway(s);
    if (alone && dd < 32) { mods *= alone.chaser > 12 ? 2.2 : alone.chaser > 6 ? 1.5 : 1.15; if (!tag && alone.chaser > 8) tag = "breakaway"; }
    mods *= Math.sqrt(this.chemMult(ti) / this.chemMult(1 - ti));
    const adv = this.strength(ti) - this.strength(1 - ti);
    if (adv > 0) mods *= 0.95; else if (adv < 0) mods *= 0.7;
    let screen = null;
    for (const o of this.skaters) if (o.team === ti && o !== s && o.state === "on") { const r = segDist(o.x, o.y, s.x, s.y, gx, 0); if (r.t > 0.66 && r.d < 4.5) { screen = o; break; } }
    if (screen) mods *= 1.18;
    if (!empty) {
      const gp = goalie.p, gs = gp.style;
      let gm = 1 + (85 - gp.goal) * 0.02;
      if (gs === "Butterfly" && dd < 20) gm *= 0.88;
      if (gs === "Reflex" && (oneTimer || rebound)) gm *= 0.85;
      if (gs === "Hybrid" && dd > 35) gm *= 0.94;
      gm *= this.gForm[gp.id] || 1;
      gm /= this.clutch(gp);
      // a scramble in front wears a goalie down: several shots in a few seconds
      const recent = (this.gRecent[1 - ti] || []).filter(t => this.time - t < 5).length;
      if (recent >= 2) gm *= 1 + 0.06 * Math.min(recent - 1, 3);
      // shaken after giving up goals in quick succession
      if (this.lastGA && this.lastGA[1 - ti] && this.time - this.lastGA[1 - ti].t < 40 && this.lastGA[1 - ti].n >= 2) gm *= 1.07;
      mods *= gm;
    }
    const pGoal = clamp(xg * mods * TUNE.goal, 0.008, 0.55);
    let pOn = clamp(0.45 + (this.r(s.p, "sht") - 70) / 250 - (dd > 40 ? 0.08 : 0) + (st === "Sniper" ? 0.05 : 0), 0.38, 0.86);
    if (empty) pOn = clamp(1.08 - dd / 140, 0.25, 0.95);
    let blocker = null, best = 4.4;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") { const r = segDist(o.x, o.y, s.x, s.y, gx, 0); if (r.t > 0.1 && r.t < 0.88 && r.d < best) { best = r.d; blocker = o; } }
    const pBlock = blocker ? Math.min(0.9, 1.05 * (blocker.p.def / 90) * (blocker.p.style === "Stay-at-Home" ? 1.3 : 1) * (1 - best / 4.6)) : 0;
    let pG = pGoal, pB = pBlock;
    if (opt.toeDrag) { pB *= 0.4; pG = clamp(pGoal * 1.12, 0.008, 0.58); tag = "toe-drag snipe"; }
    return { ti, d, gx, empty, goalie, dd, xg, mods, tag, oneTimer: !!oneTimer, rebound, screen, pGoal: pG, pOn, blocker, pBlock: pB };
  }
  // how hard it came off the stick, in mph
  shotSpeed(s, tag, dd, opt) {
    if (opt && opt.forced) return 0;
    const t = String(tag || "");
    let base = /slap/.test(t) ? 89 : /one-timer|redirect/.test(t) ? 84 : /snap/.test(t) ? 80 : /wrist|snipe/.test(t) ? 75 : /backhand/.test(t) ? 56 : /wrap/.test(t) ? 42 : /tight|tip|deflect/.test(t) ? 62 : 72;
    if (s.g === "D" && /slap|one-timer/.test(t)) base += 4;
    const st = s.p.style;
    base += (this.r(s.p, "sht") - 70) * 0.28 + (st === "Power Forward" || st === "Offensive" || st === "Enforcer" ? 3 : st === "Sniper" ? 2 : 0);
    base *= 0.92 + 0.08 * this.e(s.p) / 100;
    return Math.round(clamp(base + (rnd() - 0.5) * 8, 30, 108));
  }
  shotKind(s, dd) {
    const d = this.dir(s.team);
    if (d * s.x > RINK.goalX - 1.5 && Math.abs(s.y) < 10) return "wraparound";
    if (dd < 12) return rnd() < 0.4 ? "backhand" : "in tight";
    if (dd > 40 && (s.g === "D" || rnd() < 0.3)) return "slap shot";
    return rnd() < 0.6 ? "wrist shot" : "snap shot";
  }
  takeShot(s, opt) {
    opt = opt || {};
    const P = this.puck, m = this.shotModel(s, opt), { ti, d, gx, empty, goalie, dd } = m;
    let pGoal = m.pGoal, tag = opt.tag || m.tag, tipper = null;
    if (opt.toeDrag) { this.addFx(s, "Toe drag!"); this.stats[s.p.id].dk++; }
    let pOn = m.pOn, deflector = null;
    // tip-in: a teammate screening in front gets a stick on it (point shots most of all)
    if (!opt.forced && !empty && m.screen && rnd() < (dd > 32 ? 0.42 : 0.15) * (m.screen.p.style === "Power Forward" ? 1.4 : m.screen.p.style === "Grinder" ? 1.2 : 1)) {
      tipper = m.screen; tag = "tip-in"; pOn *= 0.82;
      pGoal = clamp(pGoal * 1.75 * (goalie.p.style === "Reflex" ? 0.85 : 1), 0.008, 0.6);
    }
    // redirect: a cross-crease pass one-timed from right on top of the net
    if (!opt.forced && !tipper && m.oneTimer && dd < 13 && s.gotFrom && Math.abs(s.gotFrom.y - s.y) > 10) tag = "redirect";
    if (opt.wrap) tag = "wraparound";
    if (!tag || tag === "") tag = this.shotKind(s, dd);
    let outcome, tx, ty;
    if (opt.forced === "goal") { outcome = "goal"; tx = gx + d * 2; ty = (rnd() - 0.5) * 4; }
    else if (opt.forced === "save") { outcome = "save"; tx = goalie.x; ty = goalie.y; }
    else if (rnd() < m.pBlock) { outcome = "block"; tx = m.blocker.x; ty = m.blocker.y; }
    else {
      // a defender in the lane who doesn't block it can still change its direction
      if (!empty && !tipper && m.blocker && segDist(m.blocker.x, m.blocker.y, s.x, s.y, gx, 0).d < 3.2 && rnd() < 0.22) {
        deflector = m.blocker; pOn *= 0.8; pGoal = clamp(pGoal * 1.5, 0.008, 0.55); tag = "deflected in off " + deflector.p.name;
      }
      if (rnd() > pOn) {
        outcome = "miss";
        const far = s.y >= 0 ? -1 : 1, r = rnd();
        if (r < 0.45) { tx = gx + d * 9; ty = far * (4.5 + rnd() * 9); }           // wide to the far side: rims around the end boards
        else if (r < 0.75) { tx = gx + d * 9; ty = -far * (4.5 + rnd() * 6); }     // wide on the near side
        else { tx = gx - d * (4 + rnd() * 10); ty = (rnd() - 0.5) * 30; opt.glass = true; } // high off the glass, drops back in front
      }
      else if (empty || rnd() < pGoal / pOn * 0.9) { outcome = "goal"; tx = gx + d * 2; ty = (rnd() - 0.5) * 5; }
      else { outcome = "save"; tx = goalie.x; ty = goalie.y + (rnd() - 0.5) * 2; }
    }
    if (deflector && outcome !== "goal") tag = "deflection";
    this.stats[s.p.id].att++;
    { const t = String(tag || ""); s.anim = { k: /slap/.test(t) || (/one-timer|redirect/.test(t) && dd > 20) ? 2 : /backhand|tight|wrap/.test(t) ? 5 : 1, t: this.time, a: Math.atan2(ty - s.y, tx - s.x) }; }
    const mph = this.shotSpeed(s, tag, dd, opt);
    if (mph && !tipper) this.stats[s.p.id].hard = Math.max(this.stats[s.p.id].hard, mph);
    this.shotLog.push({ mph, team: ti, ax: d * s.x, ay: d * s.y, outcome, period: this.period, clock: this.clock, name: s.p.name, dist: Math.round(dd), tag: tipper ? "tip-in" : tag, tipper: tipper ? tipper.p.name : null, pp: this.strength(ti) > this.strength(1 - ti) });
    const dx = tx - s.x, dy = ty - s.y, L = Math.hypot(dx, dy) || 1;
    P.carrier = null; P.x = s.x + dx / L * 1.5; P.y = s.y + dy / L * 1.5;
    const spd = opt.forced ? 45 : empty && dd > 60 ? 70 : SHOT_SPEED;
    P.vx = dx / L * spd; P.vy = dy / L * spd;
    P.shot = { mph, pGoal, glass: !!opt.glass, shooter: s, outcome, blocker: m.blocker, tipper, tx, ty, team: ti, dist: Math.round(dd), tag, left: L + 1, empty, deke: !!opt.forced, saucer: P.lastPassSaucer && P.lastPassSaucer.to === s && this.time - P.lastPassSaucer.t < 1.5 ? P.lastPassSaucer.from : null };
    P.pass = null;
    this.setRelease(ti);
    this.lastShot = { t: this.time, team: ti }; this.ozPasses[ti] = 0; this.lastShotY = s.y;
    this.bump(ti, 0.02);
    if (!empty) { const R = this.gRecent[1 - ti]; R.push(this.time); if (R.length > 6) R.shift(); }
    s.cool = 0.4;
  }
  resolveShot() {
    const P = this.puck, sh = P.shot, s = sh.shooter, ti = sh.team, d = this.dir(ti);
    const T = this.teams[ti], O = this.teams[1 - ti];
    const goalie = this.goalies[1 - ti];
    if (sh.outcome === "block") {
      this.stats[sh.blocker.p.id].blk++;
      this.log("block", 1 - ti, sh.blocker.p.name + " blocks " + s.p.name + "'s shot.");
      P.shot = null; P.lastTouchTeam = 1 - ti; P.touched = true; P.release = null;
      const a = Math.atan2(P.vy, P.vx) + Math.PI + (rnd() - 0.5) * 2.8;
      const sp = 14 + rnd() * 14; P.vx = Math.cos(a) * sp; P.vy = Math.sin(a) * sp;
      sh.blocker.cool = Math.max(sh.blocker.cool, 0.35); // the puck caroms off the shin pads before anyone controls it
      if (sh.blocker.p.style !== "Stay-at-Home" && rnd() < 0.18) sh.blocker.stun = 0.5;
      return;
    }
    if (sh.outcome === "miss") {
      this.log("miss", ti, s.p.name + (sh.empty ? " misses the empty net from " : " misses wide from ") + sh.dist + " ft.");
      P.shot = null;
      if (sh.glass) { const a = Math.atan2(-P.vy, -P.vx) + (rnd() - 0.5) * 2.2, v = 11 + rnd() * 9; P.vx = Math.cos(a) * v; P.vy = Math.sin(a) * v; } // drops off the glass and skips back into play
      else { P.vx *= 0.82; P.vy *= 0.82; }
      return;
    }
    const scorerSk = sh.tipper || s;
    const st = this.stats[scorerSk.p.id];
    T.sog++; st.sog++;
    if (!sh.empty && goalie) this.stats[goalie.p.id].sa++;
    if (sh.outcome === "goal") {
      const pp = this.strength(ti) > this.strength(1 - ti), shg = this.strength(ti) < this.strength(1 - ti);
      T.score++; st.g++; if (pp) { T.ppG++; st.ppg++; } if (shg) { T.shG++; st.shg++; }
      if (!sh.empty && goalie) this.stats[goalie.p.id].ga++;
      const chain = P.chain.filter(id => id !== scorerSk.p.id);
      if (sh.tipper && chain[chain.length - 1] !== s.p.id) chain.push(s.p.id);
      const assists = [];
      for (let i = chain.length - 1; i >= 0 && assists.length < 2; i--) if (!assists.includes(chain[i])) assists.push(chain[i]);
      const nameOf = id => (T.lineup.roster.find(p => p.id === id) || {}).name;
      assists.forEach(id => { if (this.stats[id]) this.stats[id].a++; });
      if (!pp) {
        for (const x of this.onIce(ti)) this.stats[x.p.id].pm++;
        for (const x of this.onIce(1 - ti)) this.stats[x.p.id].pm--;
      }
      const aTxt = (assists.length ? " Assists: " + assists.map(nameOf).join(", ") + "." : " Unassisted.") + (sh.saucer ? " Set up by " + sh.saucer.p.name + "'s saucer pass." : "");
      const tags = [sh.tag, pp ? "PP" : shg ? "SH" : "", sh.empty ? "empty net" : ""].filter(Boolean);
      const how = " (" + (tags.length ? tags.join(", ") + ", " : "") + sh.dist + " ft" + (sh.mph && sh.dist >= 20 && !sh.tipper ? ", " + sh.mph + " mph" : "") + ")";
      this.log("goal", ti, "GOAL " + T.team.abbr + ": " + scorerSk.p.name + how + "." + aTxt, { scorer: scorerSk.p.id, assists, pp, sh: shg, en: !!sh.empty });
      this.lastGA = this.lastGA || [null, null];
      { const L = this.lastGA[1 - ti]; this.lastGA[1 - ti] = { t: this.time, n: L && this.time - L.t < 40 ? L.n + 1 : 1 }; }
      this.pendingReplay = { ev: this.events[this.events.length - 1], goalT: this.time, team: ti, gx: d * RINK.goalX, scorer: scorerSk.p };
      P.shot = null; P.x = d * (RINK.goalX + 2); P.y = clamp(P.y, -2.5, 2.5); P.vx = P.vy = 0; P.carrier = null; P.pass = null;
      this.phase = "goal"; this.phaseT = 0;
      this.bump(ti, 0.5); this.mom[1 - ti] *= 0.4;
      this.sampleWP(true); this.wp[this.wp.length - 1].goal = ti;
      const fancy = sh.deke || sh.tag === "toe-drag snipe" ? sh.tag.replace(/^./, ch => ch.toUpperCase()) + "!" : "";
      this.banner = { kind: "goal", team: ti, title: pp ? "Power-play goal" : sh.empty ? "Empty-net goal" : shg ? "Shorthanded goal" : "GOAL", sub: scorerSk.p.name + (fancy ? " · " + fancy : ""), t: 0 };
      if (pp) { const b = O.box.filter(x => x.active && !x.coin).sort((a, c) => a.left - c.left)[0]; if (b) { if (b.left > MINOR + 0.5) { b.left = MINOR; this.log("ppend", 1 - ti, b.p.name + " stays in the box: the second half of the double minor starts."); } else this.releaseFromBox(1 - ti, b, true); } }
      if (O.pend.length) { this.log("ppend", 1 - ti, "Delayed penalty to " + O.pend[0].p.name + " is wiped out by the goal."); O.pend.shift(); }
      const gStats = goalie ? this.stats[goalie.p.id] : null;
      if (goalie && gStats.ga >= 5 && O.gIdx === 0 && O.lineup.goalies[1] && this.period <= 3 && !O.manualSwap && !O.swapG) {
        O.gIdx = 1; this.log("goalie", 1 - ti, goalie.p.name + " is pulled after " + gStats.ga + " goals. " + O.lineup.goalies[1].name + " takes over in net.");
        this.goalies[1 - ti] = this.makeGoalie(1 - ti);
      }
      this.teams[ti].holdPull = false;
      if (this.period === 4) this.endGame("OT");
      return;
    }
    // save
    this.stats[goalie.p.id].sv++;
    this.bump(ti, 0.025); if (sh.pGoal > 0.14 || sh.deke) this.bump(1 - ti, 0.12); // a big stop swings it back
    this.lastSave = { t: this.time, team: 1 - ti };
    P.shot = null; P.touched = true; P.release = null; P.lastTouchTeam = 1 - ti;
    const gs = goalie.p.style;
    const freezeP = sh.deke ? 0.7 : (sh.dist > 35 ? 0.6 : 0.42) * (gs === "Butterfly" ? 1.25 : gs === "Reflex" ? 0.8 : 1);
    const who = sh.tipper ? sh.tipper.p.name + "'s tip" : s.p.name + (sh.tag ? "'s " + sh.tag.replace("chemistry ", "") : "");
    if (rnd() < freezeP) {
      this.log("save", 1 - ti, goalie.p.name + " stops " + who + " (" + sh.dist + " ft) and covers.");
      this.whistle(d * RINK.dotX, (P.y >= 0 ? 1 : -1) * RINK.dotY, null);
      this.maybeScrum(goalie.x - d * 3, goalie.y);
    } else {
      this.log("save", 1 - ti, goalie.p.name + " kicks out " + who + ". Rebound!");
      P.x = goalie.x - d * 1.5;
      // rebound control: the better the goalie, the more often it goes to a corner instead of the slot
      const ctrl = clamp(0.35 + (goalie.p.goal - 70) / 60 + (gs === "Butterfly" ? 0.08 : 0), 0.2, 0.75);
      const side = rnd() < 0.5 ? -1 : 1, out = d > 0 ? Math.PI : 0;
      const a = rnd() < ctrl ? out + side * d * (1.0 + rnd() * 0.6) : out + (rnd() - 0.5) * 1.4;
      const sp = 12 + rnd() * 14; P.vx = Math.cos(a) * sp; P.vy = Math.sin(a) * sp;
    }
  }

  // ---------- carrier decisions ----------
  // how good it is for team ti to have the puck at (x, y): territory plus the scoring chance from there
  posValue(ti, x, y, terrOnly) {
    const zx = this.dir(ti) * x;
    let v = 0.006 + 0.028 * clamp((zx + 89) / 178, 0, 1);
    // set up in the attacking zone, keeping the puck is worth a better chance later (less so the longer it's been going)
    if (zx > RINK.blueX && zx < RINK.goalX + 8) v += OZ_HOLD * Math.max(0, 1 - (this.ozPasses ? this.ozPasses[ti] : 0) / 7);
    if (terrOnly) return v;
    if (zx > RINK.blueX) v = Math.max(v, 0.6 * v + 0.9 * this.xgAt(x, y, ti) * TUNE.goal * 0.85);
    if (this.netEmpty(1 - ti) && zx > -40) v += 0.08;
    return v;
  }
  loseRisk(s, x, y) {
    let r = 0;
    for (const o of this.skaters) if (o.team !== s.team && o.state === "on") {
      const dd = dist(o.x, o.y, x, y);
      const k = 2 * o.p.def / (o.p.def + s.p.off) * (1.25 - this.hands(s.p) / 200);
      if (dd < 3.5) r += 0.3 * k; else if (dd < 6) r += 0.12 * k; else if (dd < 10) r += 0.03 * k;
    }
    return clamp(r, 0, 0.85);
  }
  shotEV(s, opt) {
    const m = this.shotModel(s, opt), ti = s.team, d = this.dir(ti), gx = d * RINK.goalX;
    // shooters only partly see the sticks and bodies in the lane, so pucks get thrown into traffic
    const seen = m.pBlock * 0.75;
    if (m.empty) return { ev: m.pOn * (1 - seen) - seen * 0.5 * this.posValue(1 - ti, s.x, s.y), m };
    const pScore = m.pGoal * 0.9 * (1 - seen);
    // a shot is worth more than its goal chance: tips through a screen, rebounds, an offensive-zone draw, or a miss the forecheck retrieves
    const dd = m.dd, gs = m.goalie.p.style;
    const tip = m.screen ? (dd > 32 ? 0.42 : 0.15) * m.pGoal * 0.75 : 0;
    const pSaved = Math.max(0, m.pOn - m.pGoal * 0.9) * (1 - seen);
    const freezeP = (dd > 35 ? 0.6 : 0.42) * (gs === "Butterfly" ? 1.25 : gs === "Reflex" ? 0.8 : 1);
    let crash = 0; // teammates near the net to jump on a rebound
    for (const o of this.skaters) if (o.team === ti && o !== s && o.state === "on" && dist(o.x, o.y, gx, 0) < 22) crash++;
    const pRet = clamp(0.3 + crash * 0.12, 0.3, 0.62);
    const draw = 0.5 * this.posValue(ti, d * RINK.dotX, RINK.dotY) - 0.5 * this.posValue(1 - ti, d * RINK.dotX, RINK.dotY);
    const reb = pRet * (this.posValue(ti, gx - d * 9, 4) + 0.012 * crash) - (1 - pRet) * this.posValue(1 - ti, gx - d * 12, 8);
    const after = pSaved * (freezeP * draw + (1 - freezeP) * reb);
    const pMiss = (1 - m.pOn) * (1 - seen);
    const miss = pMiss * (0.42 * this.posValue(ti, gx - d * 2, 30) - 0.58 * this.posValue(1 - ti, gx - d * 2, 30));
    const far = clamp(1.7 - dd / 40, m.screen || crash >= 2 ? 0.62 : crash ? 0.4 : 0.15, 1); // long shots give easy rebounds and get frozen or chipped out
    const ev = pScore + tip * (1 - seen) + (after + miss) * far - seen * 0.5 * this.posValue(1 - ti, s.x, s.y);
    return { ev, m };
  }
  // how likely the pass gets broken up where it arrives: a stick in the lane at the receiver, or the goalie across the crease
  contest(s, tx, ty) {
    const ti = s.team; let p = 0, who = null, bk = 0, goalie = false;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on" && o.stun <= 0) {
      const dd = dist(o.x, o.y, tx, ty);
      if (dd < 6.5) {
        const k = clamp((1 - dd / 6.5) * 0.9 * (2 * o.p.def * this.skill(o.p) / (o.p.def + this.r(s.p, "pas") * this.skill(s.p))) * (o.p.style === "Stay-at-Home" ? 1.15 : 1), 0, 0.85);
        p = 1 - (1 - p) * (1 - k); if (k > bk) { bk = k; who = o; }
      }
    }
    const g = this.goalies[1 - ti];
    if (g && g.state === "net") {
      const q = segDist(g.x, g.y, s.x, s.y, tx, ty);
      if (q.d < 3.4 && q.t > 0.12) { const k = 0.4 * (1 - q.d / 3.4) * (0.8 + g.p.goal / 400); p = 1 - (1 - p) * (1 - k); if (k > bk) { bk = k; goalie = true; who = null; } }
    }
    return { p, who, goalie };
  }
  passFlub(s, r) {
    const chem = this.chemMult(s.team), friend = areFriends(s.p, r.p), pm = s.p.style === "Playmaker";
    return clamp((0.11 - (this.r(s.p, "pas") - 70) / 400 - (friend ? 0.04 : 0) - (chem - 1) * 0.15) * (pm ? 0.6 : 1) / this.skill(s.p), 0.02, 0.22);
  }
  // opponents lined up across the carrier's path in the next ~28 ft
  wallAhead(s) {
    const d = this.dir(s.team); let w = 0;
    for (const o of this.skaters) if (o.team !== s.team && o.state === "on") { const ahead = d * (o.x - s.x); if (ahead > 0 && ahead < 28 && Math.abs(o.y - s.y) < 16) w++; }
    return w;
  }
  passEV(s, r, ctx) {
    ctx = ctx || {};
    const ti = s.team, d = this.dir(ti);
    const L = dist(s.x, s.y, r.x, r.y);
    if (L < 6 || L > 95) return null;
    const puckOZ = d * s.x > RINK.blueX;
    if (!puckOZ && d * r.x > RINK.blueX + 0.5) return null; // would be offside
    const tt = L / PASS_SPEED;
    let tx = clamp(r.x + r.vx * tt * 0.8, -97, 97), ty = clamp(r.y + r.vy * tt * 0.8, -40, 40);
    if (!puckOZ && d * tx > RINK.blueX - 1) tx = d * (RINK.blueX - 1);
    const chem = this.chemMult(ti), friend = areFriends(s.p, r.p), pm = s.p.style === "Playmaker";
    let pInt = 0;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") {
      const q = segDist(o.x, o.y, s.x, s.y, tx, ty);
      if (q.t > 0.1 && q.t < 0.92 && q.d < LANE_R) {
        const pi = (1 - q.d / LANE_R) * LANE_K * (2 * o.p.def * this.skill(o.p) / (o.p.def + this.r(s.p, "pas") * this.skill(s.p))) / chem * (pm ? 0.75 : 1) - (friend ? 0.05 : 0);
        pInt = 1 - (1 - pInt) * (1 - clamp(pi, 0, 0.9));
      }
    }
    let flub = clamp((0.11 - (this.r(s.p, "pas") - 70) / 400 - (friend ? 0.04 : 0) - (chem - 1) * 0.15) * (pm ? 0.6 : 1) / this.skill(s.p), 0.02, 0.22);
    // a saucer pass floats over sticks: skilled hands only, a little harder to handle
    let saucer = false;
    const h = this.hands(s.p);
    if (h >= 70 && pInt > 0.12) {
      const pIntS = pInt * (0.25 + (100 - h) / 160), flubS = flub + 0.04;
      if ((1 - pIntS) * (1 - flubS * 0.6) > (1 - pInt) * (1 - flub * 0.6) + 0.04) { pInt = pIntS; flub = flubS; saucer = true; }
    }
    const ct = this.contest(s, tx, ty);
    let pS = (1 - pInt) * (1 - flub * 0.6) * (1 - ct.p * (saucer ? 0.8 : 1)) * (L > 60 ? 0.9 : 1);
    let open = 20;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") open = Math.min(open, dist(o.x, o.y, tx, ty));
    const recvOZ = d * tx > RINK.blueX && d * tx < RINK.goalX - 1;
    let vR = this.posValue(ti, tx, ty, recvOZ) * (0.55 + 0.45 * open / 20) * (1 - this.loseRisk(r, tx, ty) * 0.5);
    if (recvOZ) { // the receiver can shoot it off the pass: same shot value the shooter would see
      const proxy = Object.assign(Object.create(Object.getPrototypeOf(r)), r, { x: tx, y: ty, gotT: this.time, gotFrom: s, otOK: this.oneTimerOK(s.x, s.y, tx, ty, ti) });
      const se = this.shotEV(proxy).ev * (open > 6 ? 1 : 0.65) * (saucer ? 0.92 : 1);
      vR = Math.max(vR, se);
    }
    let ev = pS * vR - (1 - pS) * this.posValue(1 - ti, tx, ty), tag = null;
    const zx = d * s.x, rzx = d * r.x;
    // drop pass to the trailer when the blue line is stacked
    if (d * (r.x - s.x) < -2 && L < 20 && zx > -8 && zx < RINK.blueX + 3 && (ctx.wall || 0) >= 2 && d * r.vx > 6) { ev += 0.006; tag = "drop"; }
    // low cycle: bump it down the wall to support when you're pinned
    else if (zx > 58 && rzx > 55 && Math.sign(r.y) === Math.sign(s.y) && Math.abs(r.y) > 16 && (ctx.press || 99) < 8) { ev += 0.005; tag = "cycle"; }
    // out from behind the net to the slot
    else if (zx > RINK.goalX && rzx > 60 && rzx < RINK.goalX - 2 && Math.abs(r.y) < 16) { ev += 0.003; tag = "behind"; }
    // pinned on the wall in the offensive zone: bump it up to the point
    else if (zx > RINK.blueX + 8 && Math.abs(s.y) > 16 && r.g === "D" && rzx > RINK.blueX && rzx < RINK.blueX + 14 && (ctx.press || 99) < 8 && open > 7) { ev += 0.005; tag = "point"; }
    else if (L > 60 && d * tx > -8) tag = "stretch";
    // off a defensive-zone draw the D moves it straight up the wall
    if (s.setPlay && s.setPlay.kind === "dz" && Math.abs(r.y) > 22 && d * (r.x - s.x) > 0) ev += 0.01;
    return { ev, tx, ty, saucer, tag };
  }
  // a pass played off the side boards: around a stick in the lane, out of the zone, or past a pinching D
  bankEV(s, r) {
    const ti = s.team, d = this.dir(ti);
    const L = dist(s.x, s.y, r.x, r.y);
    if (L < 14 || L > 62 || d * (r.x - s.x) < 8) return null;
    if (d * s.x > RINK.blueX - 4 || d * r.x > RINK.blueX + 6) return null; // off the wall to get out of your end or through the neutral zone
    const puckOZ = d * s.x > RINK.blueX;
    if (!puckOZ && d * r.x > RINK.blueX + 0.5) return null;
    const tt = L / PASS_SPEED;
    let tx = clamp(r.x + r.vx * tt * 0.8, -95, 95), ty = clamp(r.y + r.vy * tt * 0.8, -39, 39);
    if (!puckOZ && d * tx > RINK.blueX - 1) tx = d * (RINK.blueX - 1);
    if (Math.abs(s.y) < 12 && Math.abs(ty) < 12) return null;
    const sb = Math.sign((s.y + ty) / 2 || s.y || 1), wy = sb * 41.9, my = 2 * wy - ty;
    const t = (wy - s.y) / (my - s.y);
    if (!(t > 0.15 && t < 0.85)) return null;
    const bx = s.x + (tx - s.x) * t, by = wy;
    if (Math.abs(bx) > RINK.L - RINK.R - 2) return null;
    const chem = this.chemMult(ti);
    let pInt = 0, icp = null;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") for (const [ax, ay, cx, cy, leg] of [[s.x, s.y, bx, by, 1], [bx, by, tx, ty, 2]]) {
      const q = segDist(o.x, o.y, ax, ay, cx, cy);
      if (q.t > 0.08 && q.t < 0.95 && q.d < 3.5) {
        const pi = clamp((1 - q.d / 3.5) * 0.45 * (2 * o.p.def * this.skill(o.p) / (o.p.def + this.r(s.p, "pas") * this.skill(s.p))) / chem, 0, 0.9);
        pInt = 1 - (1 - pInt) * (1 - pi);
      }
    }
    const flub = this.passFlub(s, r) + 0.06;
    const pS = (1 - pInt) * (1 - flub * 0.6);
    let open = 20;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") open = Math.min(open, dist(o.x, o.y, tx, ty));
    const vR = this.posValue(ti, tx, ty) * (0.55 + 0.45 * open / 20) * (1 - this.loseRisk(r, tx, ty) * 0.5);
    return { ev: pS * vR - (1 - pS) * this.posValue(1 - ti, tx, ty), tx, ty, bx, by };
  }
  // rim it hard around the boards to a teammate on the wall
  rimEV(s) {
    const ti = s.team, d = this.dir(ti), zx = d * s.x;
    const near = this.nearestOpp(s), press = near ? near.d : 99;
    const breakout = zx < -48, pointRim = s.g === "D" && zx > RINK.blueX && zx < 48 && Math.abs(s.y) > 8 && press < 8;
    if (!breakout && !pointRim) return null;
    let best = null;
    for (const r of this.skaters) {
      if (r.team !== ti || r === s || r.state !== "on" || r.stun > 0) continue;
      const bpR = boardPoint(boardParam(r.x, r.y));
      if (dist(bpR.x, bpR.y, r.x, r.y) > 11) continue; // receiver has to be on the wall
      const rz = d * r.x;
      if (breakout && (rz < zx + 6 || rz > -RINK.blueX + 14)) continue;
      if (pointRim && rz < 68) continue;
      const s0 = boardParam(s.x, s.y), s1 = boardParam(r.x, r.y), delta = perimDelta(s0, s1);
      if (Math.abs(delta) < 18 || Math.abs(delta) > 130) continue;
      // never rim it through your own crease or along the boards behind it toward the wrong way
      const bp = boardPoint(s1), C = { x: bp.x - bp.nx * 2.2, y: bp.y - bp.ny * 2.2 };
      let risk = 0;
      for (let k = 6; k < Math.abs(delta); k += 6) { const pt = boardPoint(s0 + Math.sign(delta) * k); for (const o of this.skaters) if (o.team !== ti && o.state === "on" && dist(o.x, o.y, pt.x, pt.y) < 4.5) risk += 0.16; }
      for (const o of this.skaters) if (o.team !== ti && o.state === "on" && dist(o.x, o.y, C.x, C.y) < 7) risk += 0.18;
      const flight = Math.abs(delta) / 45, rEta = Math.max(flight, this.etaTo(r, C.x, C.y));
      const oEta = Math.min(9, ...this.skaters.filter(o => o.team !== ti && o.state === "on").map(o => this.etaTo(o, C.x, C.y)));
      if (oEta < rEta - 0.2) continue; // someone on the other side gets there first
      const p = clamp(0.88 - risk, 0.1, 0.92);
      let ev = p * this.posValue(ti, C.x, C.y) * 1.08 - (1 - p) * this.posValue(1 - ti, C.x, C.y);
      if (press < 7) ev += 0.004;                       // the forechecker is on you: get it around him
      if (s.setPlay && s.setPlay.kind === "dz") ev += 0.004;
      if (pointRim) ev += 0.002;
      if (!best || ev > best.ev) best = { ev, r, s0, delta, C };
    }
    return best;
  }
  rimPuck(s, info) {
    const P = this.puck, aim = boardPoint(info.s0 + Math.sign(info.delta) * Math.min(20, Math.max(8, Math.abs(info.delta) * 0.45)));
    this.launchPass(s, info.r, { x: aim.x, y: aim.y }, null, clamp(30 + Math.abs(info.delta) * 0.32, 36, 60));
    Object.assign(P.pass, { rim: true, rx: info.C.x, ry: info.C.y, left: 1e9, tried: new Set(), t0: this.time, eta: dist(s.x, s.y, info.C.x, info.C.y) * 1.35 / Math.max(30, Math.hypot(P.vx, P.vy)) });
    this.log("play", s.team, s.p.name + " rims it around the boards to " + info.r.p.name + ".");
  }
  bankRedirect() {
    const P = this.puck, pb = P.pass && P.pass.bank; if (!pb) return;
    let tx = pb.rx + (rnd() - 0.5) * 3, ty = pb.ry + (rnd() - 0.5) * 3;
    if (pb.icp) { tx = pb.icp.x; ty = pb.icp.y; P.pass.interceptor = pb.icpO; }
    const sp = Math.max(36, Math.hypot(P.vx, P.vy) * 0.85), dx = tx - P.x, dy = ty - P.y, L = Math.hypot(dx, dy) || 1;
    P.vx = dx / L * sp; P.vy = dy / L * sp;
    P.pass.tx = tx; P.pass.ty = ty; P.pass.left = L + 3; P.pass.bank = null; P.pass.banked = true;
  }
  carrierThink(s) {
    const ti = s.team, d = this.dir(ti), zx = d * s.x, st = s.p.style, isD = s.g === "D";
    const shorth = this.shorthanded(ti), side = s.y >= 0 ? 1 : -1;
    const opts = [];
    const jit = () => 1 + (rnd() - 0.5) * 0.14;
    const setPlay = s.setPlay && s.setPlay.until > this.time ? s.setPlay : null;
    s.setPlay = setPlay;
    const alone = this.breakaway(s);
    if (alone && !this.netEmpty(1 - ti)) { this.breakawayThink(s, alone); return; }
    const near0 = this.nearestOpp(s), press = near0 ? near0.d : 99, wall = this.wallAhead(s);
    const pp = this.strength(ti) > this.strength(1 - ti);
    if (zx < RINK.blueX) this.ozPasses[ti] = 0;
    const stale = Math.min(this.ozPasses[ti], 6);
    let clearLook = false, shootEV = -1;
    // shoot
    if ((zx > RINK.blueX && zx < RINK.goalX - 1) || (this.netEmpty(1 - ti) && zx > -60)) {
      let { ev, m } = this.shotEV(s);
      ev *= st === "Sniper" ? 1.2 : st === "Playmaker" ? 0.9 : st === "Offensive" ? 1.15 : st === "Stay-at-Home" ? 0.8 : 1;
      ev *= (0.6 + 0.24 * this.aggr(ti)) * (1 + 0.08 * this.momo(ti));
      if (m.xg < 0.045 && !m.screen && !isD) ev *= 0.6;   // forwards don't fire from distance with nothing in front
      if (shorth) ev *= 0.75;
      if (pp && m.xg < 0.05 && !setPlay && !(isD && m.screen)) ev *= 0.65; // power plays work it for a better look
      if (setPlay && setPlay.kind === "oz") ev *= 1.8;  // off the draw: shoot it
      ev *= 1 + (pp ? 0.06 : 0.11) * stale;             // enough passing around the perimeter: get it to the net
      if (isD && zx < 66) { // point shots: get it through for a tip or a rebound, and walk-ins from the top of the circle
        let mates = 0; for (const o of this.skaters) if (o.team === ti && o !== s && o.state === "on" && dist(o.x, o.y, d * RINK.goalX, 0) < 14) mates++;
        ev *= (m.screen ? 2 : 1.55) * (1 + 0.12 * mates) * (press > 8 ? 1.12 : 1) * (st === "Offensive" ? 1.1 : 1);
        if (s.entryT != null && this.time - s.entryT < 2.5 && zx > 30 && m.pBlock < 0.3) ev *= 1.35; // shooting in stride off the rush
      }
      // a clean look from a good spot: let it go instead of looking for something better
      clearLook = m.xg > 0.1 && m.pBlock < 0.12 && press > 7 && !alone;
      if (clearLook) ev *= 1.25;
      shootEV = ev; // D get pucks through from the point for tips and rebounds
      opts.push(["shoot", ev * jit()]);
    }
    // wraparound: coming out from behind the net at the post
    let wrapInfo = null;
    if (zx > RINK.goalX + 0.5 && zx < RINK.goalX + 7 && Math.abs(s.y) < 7.5 && !this.netEmpty(1 - ti) && d * s.vx < 2 && Math.abs(s.vy) > 6 && Math.sign(s.vy) !== Math.sign(s.y || 1)) {
      const g = this.goalies[1 - ti], beat = g ? Math.abs(g.y - Math.sign(s.vy) * 2.6) / 5 : 1; // is the goalie across to that post?
      const pG = clamp((0.05 + beat * 0.08) * (0.7 + this.hands(s.p) / 200) * this.clutch(s.p), 0.02, 0.2);
      wrapInfo = pG;
      opts.push(["wrap", (pG + 0.012) * jit()]);
    }
    // pass
    let best = null, bestEV = -1e9, bestSaucer = false, bestTag = null, bestBank = null;
    const passCands = [];
    for (const r of this.skaters) {
      if (r.team !== ti || r === s || r.state !== "on" || r.stun > 0) continue;
      const pe = this.passEV(s, r, { wall, press }); if (!pe) continue;
      const k = (st === "Playmaker" ? 1.15 : st === "Stay-at-Home" ? 1.08 : 1) * jit();
      let ev = pe.ev * k * (zx > RINK.blueX ? 1 - 0.035 * stale : 1);
      if (r === s.gotFrom && this.time - s.gotT < 2.5) ev = ev > 0 ? ev * 0.5 : ev * 1.5;
      // the cycle: low on the wall with a checker on you, leave it for the teammate coming down behind you
      const cyc = !isD && zx > 64 && Math.abs(s.y) > 18 && r.g === "F" && Math.sign(r.y || 1) === side && Math.abs(r.y) > 14 && d * (s.x - r.x) > 3 && dist(s.x, s.y, r.x, r.y) < 28 && stale < 5;
      if (cyc && ev > 0) ev *= 1.15 + (press < 9 ? 0.3 : 0.05);
      if (ev > bestEV) { bestEV = ev; best = r; bestSaucer = pe.saucer; bestTag = cyc ? "cycle" : pe.tag; bestBank = null; }
      passCands.push({ r, ev, saucer: pe.saucer, tag: cyc ? "cycle" : pe.tag });
      const be = this.bankEV(s, r);
      if (be && be.ev * k > bestEV) { bestEV = be.ev * k; best = r; bestSaucer = false; bestTag = "bank"; bestBank = be; }
    }
    if (best) opts.push(["pass", bestEV]);
    // rim it around the boards when the forecheck is on you down low
    let rimInfo = null;
    if ((zx < -48 && (press < 12 || setPlay)) || (isD && zx > RINK.blueX && press < 8)) { rimInfo = this.rimEV(s); if (rimInfo) opts.push(["rim", rimInfo.ev * jit()]); }
    // carry: where will I be in half a second, and do I keep it?
    this.carrierTarget(s);
    const dx = s.tx - s.x, dy = s.ty - s.y, L = Math.hypot(dx, dy) || 1;
    let adv = Math.min(10, L);
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") { const q = segDist(o.x, o.y, s.x, s.y, s.x + dx / L * 10, s.y + dy / L * 10); if (q.d < 3) adv = Math.min(adv, q.t * 10 - 2); }
    adv = Math.max(0, adv);
    const px = s.x + dx / L * adv, py = s.y + dy / L * adv;
    let pLose = this.loseRisk(s, px, py);
    // protecting it along the wall or behind the net: body between the puck and the checker
    const onWall = zx > RINK.blueX && (Math.abs(py) > 27 || this.dir(ti) * px > RINK.goalX - 2);
    if (onWall) pLose *= clamp(1.05 - (this.hands(s.p) * 0.5 + this.r(s.p, "chk") * 0.5) / 200, 0.45, 0.85);
    // in the attacking zone, holding on is only worth the shot you'll have from where you end up
    let holdV = this.posValue(ti, px, py);
    if (d * px > RINK.blueX && d * px < RINK.goalX - 1 && !this.netEmpty(1 - ti)) {
      const proxy = Object.assign(Object.create(Object.getPrototypeOf(s)), s, { x: px, y: py, gotT: -99, gotFrom: null });
      holdV = Math.max(this.posValue(ti, px, py, true) * (1 + 0.04 * Math.max(0, 3 - stale)), this.shotEV(proxy).ev * 0.96);
    }
    let carryEV = (1 - pLose) * holdV - pLose * this.posValue(1 - ti, s.x, s.y);
    if (s.route && zx > 52 && stale < 4 && !pp && press < 11) carryEV += 0.003; // keep the cycle going
    // a stacked blue line makes carrying in risky
    if (zx > -10 && zx < RINK.blueX + 2 && wall >= 2) carryEV -= 0.006 * (wall - 1) * (1.15 - (s.p.hnd || 70) / 200);
    // don't stand around with it in your own end
    if (zx < -RINK.blueX) carryEV += Math.min(0.01, s.holdT * 0.006);
    carryEV *= (st === "Speedster" && zx < RINK.blueX) || (st === "Power Forward" && zx > RINK.blueX) ? 1.1 : 1;
    // a D tied up at the point doesn't wrestle for it: move it (shoot, D-to-D, rim) before the forward strips her
    if (isD && zx > RINK.blueX && zx < 45 && press < 5) carryEV -= 0.002 + 0.008 * clamp(this.time - (s.haveT ?? this.time) - 0.4, 0, 1);
    if (clearLook) carryEV = Math.min(carryEV, shootEV * 0.9); // no dangling with a clean look
    opts.push(["carry", carryEV * jit()]);
    // dump it in (only from past the red line unless shorthanded)
    if ((zx > 0 && zx < RINK.blueX + 2) || (shorth && zx > -RINK.blueX && zx < RINK.blueX)) {
      const lx = d * 82, ly = side * 26;
      const chasers = this.skaters.filter(o => o.team === ti && o !== s && o.state === "on" && d * o.x > zx - 10).length;
      const pRet = clamp(0.2 + chasers * 0.055 + (st === "Grinder" || st === "Power Forward" ? 0.07 : 0), 0.15, 0.48);
      let ev = pRet * this.posValue(ti, lx, ly) - (1 - pRet) * this.posValue(1 - ti, lx, ly) + 0.004 * wall;
      if (st === "Grinder") ev *= 1.25;
      if (this.e(s.p) < 45) ev += 0.004; // dump and change
      opts.push(["dump", ev * jit()]);
    }
    // clear the zone; shorthanded teams can ice it
    if ((zx < -RINK.blueX + 5 && (press < 8 || this.avgEnergy(ti, "F") < 50)) || (shorth && zx < 0)) {
      const tired = this.avgEnergy(ti, "F") < 50 || this.avgEnergy(ti, "D") < 48;
      const ev = shorth ? 0.02 + 0.03 * pLose : 0.25 * this.posValue(ti, d * 15, side * 40) - 0.75 * this.posValue(1 - ti, d * 15, side * 40) + (press < 4 ? 0.007 : 0) + (tired ? 0.005 : 0);
      opts.push(["clear", ev * jit()]);
    }
    // ---- skill moves ----
    const h = this.hands(s.p);
    let dekeInfo = null, gdekeInfo = null, michiganP = 0;
    if (s.dekeCool <= 0) {
      // beat the defender in front of you
      let o = null, od = 1e9;
      for (const x of this.skaters) if (x.team !== ti && x.state === "on" && x.stun <= 0) {
        const ah = d * (x.x - s.x); if (ah > -1 && ah < 11 && Math.abs(x.y - s.y) < 7.5) { const q = dist(x.x, x.y, s.x, s.y); if (q < od) { od = q; o = x; } }
      }
      if (o && od < 9 && zx > -RINK.blueX) {
        const moves = [["stickhandle", 0, 0.8]];
        if (h >= 76) moves.push(["toe drag", 0.04, 0.95]);
        if (h >= 84) moves.push(["spin-o-rama", 0.02, 1.1]);
        if (h >= 89) moves.push(["between the legs", -0.03, 1.2]);
        if (st === "Speedster" && Math.abs(s.y) > 24) moves.push(["chip and chase", (s.p.spd - o.p.spd) / 120, 0.9]);
        const mv = moves[Math.floor(rnd() * moves.length)];
        const pS = clamp(0.3 + (h - o.p.def * this.skill(o.p)) / 85 + (s.p.spd - o.p.spd) / 260 + mv[1], 0.08, 0.82);
        const bx = s.x + d * 12, by = s.y + (s.y >= o.y ? 5 : -5);
        // beating a defender clean opens the ice up: worth more than the spot alone
        let ev = pS * (this.posValue(ti, bx, by) * 1.1 + 0.012 + Math.max(0, h - 72) / 1200) - (1 - pS) * this.posValue(1 - ti, s.x, s.y);
        ev *= st === "Sniper" || st === "Playmaker" || st === "Speedster" ? 1.1 : st === "Grinder" ? 0.7 : st === "Two-Way" ? 0.9 : isD ? 0.6 : 1;
        dekeInfo = { o, move: mv[0], pS, stun: mv[2] };
        opts.push(["deke", ev * jit()]);
      }
      // in tight on the goalie with nobody on you: deke instead of shooting
      const g = this.goalies[1 - ti], gx = d * RINK.goalX, dd = dist(s.x, s.y, gx, 0);
      const free = !this.skaters.some(x => x.team !== ti && x.state === "on" && (dist(x.x, x.y, s.x, s.y) < 10 || (d * x.x > zx && dist(x.x, x.y, s.x, s.y) < 18)));
      if (g && g.state === "net" && zx > 62 && zx < RINK.goalX - 2 && dd < 24 && free) {
        const gmoves = [["backhand deke", 0], ["forehand-backhand deke", 0.02], ["five-hole deke", -0.02]];
        if (h >= 86) gmoves.push(["one-handed tuck", 0.04]);
        if (h >= 91) gmoves.push(["spin-o-rama deke", 0.03]);
        const gm = gmoves[Math.floor(rnd() * gmoves.length)];
        const gsty = g.p.style === "Butterfly" ? 1.08 : g.p.style === "Reflex" ? 0.9 : 1;
        const pG = clamp((0.13 + (h - g.p.goal) / 120 + gm[1]) * gsty, 0.05, 0.45);
        let ev = pG * 0.95 + 0.004;
        ev *= st === "Sniper" ? 0.85 : st === "Playmaker" || st === "Speedster" ? 1.1 : st === "Power Forward" ? 0.95 : 1;
        gdekeInfo = { move: gm[0], p: pG };
        opts.push(["gdeke", ev * jit()]);
      }
      // the Michigan from behind the net (rare, elite hands only)
      if (g && g.state === "net" && h >= 86 && d * s.x > RINK.goalX + 0.5 && Math.abs(s.y) < 9 && !(this.time - (this.michigan[s.p.id] || -1e9) < 400)) {
        michiganP = clamp((h - 82) / 70, 0.04, 0.2) * (g.p.style === "Butterfly" ? 1.1 : 1);
        opts.push(["michigan", michiganP * 0.9 * (rnd() < 0.35 ? 1 : 0.2)]);
      }
      // toe-drag to change the shot angle around a shot blocker
      const ddT = dist(s.x, s.y, d * RINK.goalX, 0);
      if (zx > RINK.blueX && zx < RINK.goalX - 1 && h >= 75 && !this.netEmpty(1 - ti) && ddT >= 18 && ddT <= 50) {
        const m = this.shotModel(s, { toeDrag: true }), m0 = this.shotModel(s);
        if (m0.pBlock > 0.2) {
          const fumble = (100 - h) / 250;
          const ev = (1 - fumble) * this.shotEV(s, { toeDrag: true }).ev - fumble * this.posValue(1 - ti, s.x, s.y);
          opts.push(["toedrag", ev * (st === "Sniper" ? 1.15 : 1) * jit()]);
          s.toeFumble = fumble;
        }
      }
    }
    // Be A Player: hand the big decision to the viewer
    if (this.bap && s.p.id === this.bap.me && this.wantMoment(s, zx, press, opts, shorth)) {
      this.openMoment(s, zx > RINK.blueX - 2 ? "attack" : zx > -14 ? "entry" : "breakout", { opts, passCands, wrapInfo, rimInfo, dekeInfo, gdekeInfo, shorth, zx, press });
      return;
    }
    let choice = opts[0];

    for (const o of opts) if (o[1] > choice[1]) choice = o;
    if (choice[0] === "toedrag" && rnd() < (s.toeFumble || 0)) { // fumbled the toe drag
      const P = this.puck; P.carrier = null; s.cool = 0.5; s.dekeCool = 2;
      const a = rnd() * Math.PI * 2; P.vx = Math.cos(a) * 8; P.vy = Math.sin(a) * 8;
      this.log("skill-fail", ti, s.p.name + " loses the handle trying to toe-drag around the block.");
      return;
    }
    if (choice[0] === "shoot") this.takeShot(s);
    else if (choice[0] === "pass") {
      if (bestTag === "cycle") { // pass it back and go: the passer cuts to the net, the receiver carries on the cycle
        s.cycleGo = { until: this.time + 2.4, x: d * (RINK.goalX - 7), y: side * 5 };
        if (rnd() < 0.35) this.log("play", ti, s.p.name + " cycles it back up the wall to " + best.p.name + ".");
      }
      this.passTo(s, best, { saucer: bestSaucer, tag: bestTag === "cycle" ? null : bestTag, bank: bestBank });
    }
    else if (choice[0] === "rim") this.rimPuck(s, rimInfo);
    else if (choice[0] === "deke") this.dekeDefender(s, dekeInfo);
    else if (choice[0] === "gdeke") this.startGoalieDeke(s, gdekeInfo);
    else if (choice[0] === "toedrag") this.takeShot(s, { toeDrag: true });
    else if (choice[0] === "wrap") this.takeShot(s, { wrap: wrapInfo });
    else if (choice[0] === "michigan") this.startGoalieDeke(s, { move: "Michigan", p: michiganP });
    else if (choice[0] === "dump") this.dumpIn(s);
    else if (choice[0] === "clear") this.clearPuck(s, shorth);
    if (choice[0] !== "carry") s.setPlay = null;
  }
  breakawayThink(s, alone) {
    const ti = s.team, d = this.dir(ti), gx = d * RINK.goalX, dd = dist(s.x, s.y, gx, 0), st = s.p.style, h = this.hands(s.p);
    const g = this.goalies[1 - ti];
    if (!s.baPlan && this.bap && s.p.id === this.bap.me && this.bap.moments && !this.bap.auto && !this.moment && dd < 75 && this.time - this.bap.last > 6 && this.bap.n < this.bap.cap + 4) { this.openBreakaway(s, alone); return; }
    // 2-on-0 / 2-on-1: a teammate level or ahead with a better look gets it across
    let mate = null;
    for (const r of this.skaters) if (r.team === ti && r !== s && r.state === "on" && d * (r.x - s.x) > -4 && Math.abs(r.y - s.y) > 10) {
      const lane = this.skaters.some(o => o.team !== ti && o.state === "on" && segDist(o.x, o.y, s.x, s.y, r.x, r.y).d < 4);
      const open = !this.skaters.some(o => o.team !== ti && o.state === "on" && dist(o.x, o.y, r.x, r.y) < 8);
      if (!lane && open && this.xgAt(r.x, r.y, ti) > this.xgAt(s.x, s.y, ti) * 1.35) mate = r;
    }
    // pick the move once, then commit to it
    if (!s.baPlan) {
      const dekeW = clamp((h - 70) / 25, 0, 1) * (st === "Playmaker" || st === "Speedster" ? 1.3 : st === "Sniper" ? 0.6 : 1);
      s.baPlan = mate && rnd() < (st === "Playmaker" ? 0.55 : 0.3) ? "pass" : rnd() < dekeW * 0.55 ? "deke" : "shot";
      s.baRange = s.baPlan === "shot" ? 14 + rnd() * 14 : 10;
    }
    if (s.baPlan === "pass") {
      if (mate && (dd < 30 || alone.chaser < 5)) { this.passTo(s, mate, { tag: "across" }); this.log("play", ti, s.p.name + " slides it across to " + mate.p.name + "."); s.baPlan = null; return; }
      if (!mate) s.baPlan = "shot";
    }
    const caught = alone.chaser < 4;
    if (s.baPlan === "shot" && (dd <= s.baRange || caught)) { this.takeShot(s); s.baPlan = null; return; }
    if (s.baPlan === "deke" && dd <= s.baRange && g && g.state === "net") {
      const gmoves = [["backhand deke", 0], ["forehand-backhand deke", 0.02], ["five-hole deke", -0.02]];
      if (h >= 86) gmoves.push(["one-handed tuck", 0.04]);
      if (h >= 91) gmoves.push(["spin-o-rama deke", 0.03]);
      const gm = gmoves[Math.floor(rnd() * gmoves.length)];
      const gsty = g.p.style === "Butterfly" ? 1.08 : g.p.style === "Reflex" ? 0.9 : 1;
      const pG = clamp((0.3 + (h - g.p.goal) / 100 + gm[1]) * gsty, 0.12, 0.6);
      this.startGoalieDeke(s, { move: gm[0], p: pG }); s.baPlan = null; return;
    }
    if (s.baPlan === "deke" && caught && dd < 30) { this.takeShot(s); s.baPlan = null; return; }
    // keep skating: decide again very soon
    s.decideT = 0.08;
  }
  dekeDefender(s, info) {
    const o = info.o, ti = s.team, d = this.dir(ti), P = this.puck;
    s.dekeCool = 1.6;
    if (rnd() < info.pS) {
      o.stun = 0.55 + 0.35 * info.stun; o.checkCool = 1.1;
      const lat = s.y >= o.y ? 1 : -1;
      const sp = s.maxSpd * this.spdMul(s.p);
      s.vx = d * sp * 1.05; s.vy = lat * 7;
      if (info.move === "chip and chase") { this.launchPass(s, s, { x: s.x + d * 18, y: s.y + lat * 2 }, null, 30); P.pass.loose = true; P.pass.left = 20; s.cool = 0.25; }
      this.stats[s.p.id].dk++;
      const verb = { "stickhandle": "dangles past", "toe drag": "toe-drags around", "spin-o-rama": "spins away from", "between the legs": "goes between the legs to beat", "chip and chase": "chips it past and blows by" }[info.move];
      const fxText = { "stickhandle": "Dangle!", "toe drag": "Toe drag!", "spin-o-rama": "Spin-o-rama!", "between the legs": "Between the legs!", "chip and chase": "Chip and chase!" }[info.move];
      this.addFx(s, fxText);
      this.log("skill", ti, s.p.name + " " + verb + " " + o.p.name + ".");
    } else {
      s.stun = 0.3;
      if (rnd() < 0.55) {
        this.stats[o.p.id].tk++; this.teams[o.team].tk++;
        this.log("skill-fail", ti, o.p.name + " reads " + s.p.name + "'s " + info.move + " and pokes it away.");
        this.gainPossession(o, "steal");
      } else {
        P.carrier = null; P.lastTouchTeam = o.team;
        const a = rnd() * Math.PI * 2; P.vx = Math.cos(a) * 12; P.vy = Math.sin(a) * 12;
        this.log("skill-fail", ti, s.p.name + "'s " + info.move + " gets knocked loose by " + o.p.name + ".");
      }
    }
  }
  startGoalieDeke(s, info) {
    const d = this.dir(s.team);
    if (info.move === "Michigan") this.michigan[s.p.id] = this.time;
    s.deke = { t: info.move === "Michigan" ? 0.3 : 0.45, move: info.move, goal: rnd() < info.p, side: s.y >= 0 ? -1 : 1 };
    s.dekeCool = 2;
    this.addFx(s, info.move === "Michigan" ? "Michigan!" : info.move.replace(/^./, c => c.toUpperCase()) + "!");
  }
  finishGoalieDeke(s) {
    const dk = s.deke; s.deke = null;
    if (this.puck.carrier !== s) return;
    if (dk.goal) this.stats[s.p.id].dk++;
    this.takeShot(s, { forced: dk.goal ? "goal" : "save", tag: dk.move });
  }
  // time for a skater to get to a spot
  etaTo(o, x, y) { return dist(o.x, o.y, x, y) / Math.max(10, o.maxSpd * this.spdMul(o.p) * 0.9) + (o.stun > 0 ? o.stun : 0); }
  dumpIn(s) {
    const ti = s.team, d = this.dir(ti), side = s.y >= 0 ? 1 : -1;
    // dump it where our forecheckers beat their defense: near corner, far corner around the boards, or soft behind the net
    const mates = this.onIce(ti).filter(o => o !== s), opps = this.onIce(1 - ti);
    const opts = [{ k: "near", x: d * 89, y: side * 30 }, { k: "far", x: d * 89, y: -side * 30 }, { k: "behind", x: d * 96, y: side * 6 }];
    let best = null;
    for (const o of opts) {
      const flight = dist(s.x, s.y, o.x, o.y) / (o.k === "far" ? 50 : 42);
      const us = mates.length ? Math.min(...mates.map(m => this.etaTo(m, o.x, o.y))) : 9, them = opps.length ? Math.min(...opps.map(m => this.etaTo(m, o.x, o.y))) : 9;
      const v = Math.min(them, 6) - Math.max(us, flight) + (rnd() - 0.5) * 0.6;
      if (!best || v > best.v) best = Object.assign({ v, chase: mates.slice().sort((a, b) => this.etaTo(a, o.x, o.y) - this.etaTo(b, o.x, o.y))[0] }, o);
    }
    if (best.k === "far") { // around the boards to the far corner
      const s0 = boardParam(s.x, side * 42), dirn = d * (boardPoint(s0 + 10).x - boardPoint(s0).x) > 0 ? 1 : -1;
      const aim = boardPoint(s0 + dirn * 22);
      this.launchPass(s, null, { x: aim.x, y: aim.y }, null, 56);
      Object.assign(this.puck.pass, { loose: true, rim: true, left: 1e9 });
      this.log("dump", ti, s.p.name + " rims it around to the far corner.");
    } else {
      this.launchPass(s, null, { x: best.x, y: best.y }, null, best.k === "behind" ? 44 : 50);
      this.puck.pass.loose = true; this.puck.pass.left = 1e9;
      this.log("dump", ti, s.p.name + (best.k === "behind" ? " chips it in behind the net." : " dumps it into the corner."));
    }
    if (best.chase) this.puck.pass.chase = best.chase;
    this.teams[ti].changeCheck = 0.2;
  }
  clearPuck(s, long) {
    const ti = s.team, d = this.dir(ti), side = s.y >= 0 ? 1 : -1;
    const nOpp = this.nearestOpp(s), press = nOpp ? nOpp.d : 99;
    const deep = long ? rnd() < 0.55 : press < 6 && rnd() < 0.45; // at even strength only a desperate clear goes the length of the ice
    let t = deep ? { x: d * 98, y: side * (10 + rnd() * 25) } : { x: d * (8 + rnd() * 25), y: side * 41 }, mate = null;
    if (!deep) {
      // chip it into space for a winger heading up that wall instead of to nobody
      const w = this.onIce(ti).filter(o => o !== s && Math.sign(o.y || 1) === side && d * (o.x - s.x) > 8 && d * o.x < RINK.blueX + 10)
        .sort((a, b) => d * b.x - d * a.x)[0];
      if (w) { mate = w; t = { x: clamp(w.x + d * 12 + w.vx * 0.3, -RINK.blueX - 4, RINK.blueX + 4), y: side * 39 }; if (!this.skaters.some(o => o.team !== ti && o.state === "on" && segDist(o.x, o.y, s.x, s.y, t.x, t.y).d < 3.5)) t.y = side * 36; }
    }
    this.launchPass(s, null, t, null, deep ? 64 : mate ? 48 : 56);
    this.puck.pass.loose = true; this.puck.pass.left = 1e9; this.puck.pass.clear = { deep, tried: new Set() };
    if (mate) this.puck.pass.chase = mate;
    if (!deep) this.log("play", ti, s.p.name + (mate ? " chips it up the wall for " + mate.p.name + "." : " chips it off the boards and out of the zone."));
  }
  passTo(s, r, opt) {
    opt = typeof opt === "object" && opt ? opt : { saucer: !!opt };
    const saucer = opt.saucer;
    const ti = s.team, P = this.puck;
    if (opt.bank) return this.bankPass(s, r, opt.bank);
    const L = dist(s.x, s.y, r.x, r.y), tt = L / PASS_SPEED;
    const target = { x: clamp(r.x + r.vx * tt * 0.8, -97, 97), y: clamp(r.y + r.vy * tt * 0.8, -40, 40) };
    { const d = this.dir(ti); if (d * s.x <= RINK.blueX && d * target.x > RINK.blueX - 1) target.x = d * (RINK.blueX - 1); }
    const friend = areFriends(s.p, r.p);
    const chem = this.chemMult(ti);
    const pm = s.p.style === "Playmaker";
    let inter = null, best = LANE_R;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") {
      const q = segDist(o.x, o.y, s.x, s.y, target.x, target.y);
      if (q.t > 0.1 && q.t < 0.92 && q.d < best) { best = q.d; inter = o; }
    }
    if (inter) {
      let pInt = (1 - best / LANE_R) * LANE_K * (2 * inter.p.def * this.skill(inter.p) / (inter.p.def + this.r(s.p, "pas") * this.skill(s.p))) / chem * (pm ? 0.75 : 1) - (friend ? 0.05 : 0);
      if (saucer) pInt *= 0.25 + (100 - this.hands(s.p)) / 160;
      if (rnd() < pInt) {
        const q = segDist(inter.x, inter.y, s.x, s.y, target.x, target.y);
        const ix = s.x + (target.x - s.x) * q.t, iy = s.y + (target.y - s.y) * q.t;
        this.launchPass(s, r, { x: ix, y: iy }, inter);
        P.pass.left = dist(s.x, s.y, ix, iy) + 6;
        return;
      }
    }
    const ct = this.contest(s, target.x, target.y);
    if (rnd() < ct.p * (saucer ? 0.8 : 1)) {
      if (ct.goalie) { // the goalie reaches out and knocks it away
        const g = this.goalies[1 - ti];
        this.launchPass(s, null, { x: g.x, y: g.y }, null, 50); P.pass.loose = true; P.pass.left = dist(s.x, s.y, g.x, g.y) + 1;
        this.log("save", 1 - ti, g.p.name + " pokes away the pass to " + r.p.name + ".");
        return;
      }
      if (ct.who) { // a defender gets a stick on it at the receiver
        this.launchPass(s, r, target, ct.who); P.pass.left = dist(s.x, s.y, target.x, target.y) + 4;
        if (rnd() < 0.5) { P.pass.knock = true; }
        return;
      }
    }
    const flub = clamp((0.11 - (this.r(s.p, "pas") - 70) / 400 - (friend ? 0.04 : 0) - (chem - 1) * 0.15) * (pm ? 0.6 : 1) / this.skill(s.p), 0.02, 0.22);
    if (rnd() < flub + (saucer ? 0.04 : 0)) { target.x += (rnd() - 0.5) * 16; target.y += (rnd() - 0.5) * 16; }
    this.launchPass(s, r, target, null, L > 55 ? 76 : PASS_SPEED);
    this.finishCheck(s);
    if (opt.tag === "drop") this.log("play", ti, s.p.name + " drops it back to " + r.p.name + ".");
    else if (opt.tag === "stretch") this.log("play", ti, s.p.name + " hits " + r.p.name + " with a stretch pass.");
    else if (opt.tag === "cycle") this.log("play", ti, s.p.name + " cycles it down low to " + r.p.name + ".");
    else if (opt.tag === "behind") this.log("play", ti, s.p.name + " finds " + r.p.name + " out front from behind the net.");
    else if (opt.tag === "point") this.log("play", ti, s.p.name + " bumps it up to " + r.p.name + " at the point.");
    if (saucer) { P.pass.saucer = true; P.lastPassSaucer = { from: s, to: r, t: this.time + dist(s.x, s.y, target.x, target.y) / PASS_SPEED }; }
  }
  finishCheck(s) {
    for (const o of this.skaters) {
      if (o.team === s.team || o.state !== "on" || o.stun > 0 || o.checkCool > 0 || dist(o.x, o.y, s.x, s.y) > 3.6) continue;
      const st = o.p.style, hb = st === "Grinder" ? 0.6 : st === "Power Forward" || st === "Stay-at-Home" ? 0.5 : st === "Two-Way" ? 0.32 : 0.2;
      if (rnd() < 0.85 * hb * (0.8 + 0.4 * this.aggr(o.team)) * (this.shorthanded(o.team) ? 0.5 : 1)) {
        o.checkCool = 0.8; s.stun = Math.max(s.stun, 0.25);
        this.stats[o.p.id].hit++; this.teams[o.team].hits++;
      }
      return;
    }
  }
  bankPass(s, r, b) {
    const ti = s.team, P = this.puck;
    // a stick can still get to it on either leg
    let icp = null, icpO = null;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") for (const [ax, ay, cx, cy, leg] of [[s.x, s.y, b.bx, b.by, 1], [b.bx, b.by, b.tx, b.ty, 2]]) {
      const q = segDist(o.x, o.y, ax, ay, cx, cy);
      if (q.t > 0.08 && q.t < 0.95 && q.d < 3.5 && rnd() < (1 - q.d / 3.5) * 0.45 * (2 * o.p.def * this.skill(o.p) / (o.p.def + this.r(s.p, "pas") * this.skill(s.p))) / this.chemMult(ti)) {
        if (leg === 1) { const ix = ax + (cx - ax) * q.t, iy = ay + (cy - ay) * q.t; this.launchPass(s, r, { x: ix, y: iy }, o); P.pass.left = dist(s.x, s.y, ix, iy) + 6; return; }
        if (!icp) { icp = { x: ax + (cx - ax) * q.t, y: ay + (cy - ay) * q.t }; icpO = o; }
      }
    }
    this.launchPass(s, r, { x: b.bx, y: b.by }, null, 66);
    Object.assign(P.pass, { bank: { rx: b.tx, ry: b.ty, icp, icpO }, rx: b.tx, ry: b.ty, left: dist(s.x, s.y, b.bx, b.by) + 4 });
    this.log("play", ti, s.p.name + " banks it off the boards to " + r.p.name + ".");
  }
  carrierTarget(s) {
    const d = this.dir(s.team), zx = d * s.x, st = s.p.style, side = s.y >= 0 ? 1 : -1;
    let tx, ty;
    // remember when she carried it over the blue line: a rush entry keeps its legs
    if (zx > RINK.blueX && s.zxPrev != null && s.zxPrev <= RINK.blueX) s.entryT = this.time;
    if (zx < RINK.blueX - 6) s.entryT = null;
    s.zxPrev = zx;
    const T = this.teams[s.team], pp = this.strength(s.team) > this.strength(1 - s.team);
    const near = this.nearestOpp(s), press = near ? near.d : 99;
    if (s.bapDrive && s.bapDrive > this.time) { s.tx = d * (RINK.goalX - 7); s.ty = clamp(s.y * 0.3, -4, 4); return; }
    const ba = this.breakaway(s);
    if (ba) {
      if (!s.baLane) s.baLane = (s.y >= 0 ? 1 : -1) * (Math.abs(s.y) > 6 ? 1 : (rnd() < 0.5 ? 1 : -1));
      const gx = d * RINK.goalX;
      s.tx = gx - d * 2; s.ty = s.baLane * (zx > 70 ? 2.5 : 5); return;
    } else s.baLane = 0;
    if (pp && zx > RINK.blueX && T.ppCarrierSpot) {
      // the power-play carrier keeps her feet moving: she walks downhill from her spot toward the slot and back out,
      // slides along her lane, and attacks harder when nobody is on her
      const sp = T.ppCarrierSpot, gx = d * RINK.goalX;
      const ph = (this.time * 0.45 + s.p.no * 0.37) % 1, a = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
      const low = d * sp.x > RINK.goalX - 12; // goal-line spots work along the goal line instead
      const ax = low ? gx - d * 9 : gx - d * 17, ay = low ? (sp.y >= 0 ? 1 : -1) * 6 : 0;
      const reach = press > 12 ? 0.62 : press > 8 ? 0.48 : 0.36;
      tx = sp.x + (ax - sp.x) * reach * a; ty = sp.y + (ay - sp.y) * reach * a;
      const vx = ax - sp.x, vy = ay - sp.y, L = Math.hypot(vx, vy) || 1, sway = Math.sin(this.time * 1.6 + s.p.no) * 4.5;
      tx += -vy / L * sway; ty += vx / L * sway;
      if (near && press < 7) { const ux = s.x - near.s.x, uy = s.y - near.s.y, q = Math.hypot(ux, uy) || 1; tx += ux / q * (7 - press) * 1.3; ty += uy / q * (7 - press) * 1.3; } // spin away from the stick
      if (d * tx > RINK.goalX - 1 && Math.abs(ty) < 6) ty = (ty >= 0 ? 1 : -1) * 6;
      s.tx = clamp(tx, -96, 96); s.ty = clamp(ty, -40, 40); return;
    }
    if (pp && zx < -RINK.blueX && press > 14) { // regroup: wait for the forwards to swing before going
      const mates = this.onIce(s.team).filter(o => o !== s && o.spot);
      const unset = mates.length && mates.reduce((t, o) => t + dist(o.x, o.y, o.spot.x, o.spot.y), 0) / mates.length > 9;
      if (unset && (s.ppWait || 0) < 0.6) { s.ppWait = (s.ppWait || 0) + 0.3; s.tx = -d * (RINK.goalX - 6); s.ty = (s.y >= 0 ? 1 : -1) * 10; return; }
    } else s.ppWait = 0;
    if (zx <= RINK.blueX) {
      tx = s.x + d * 30; ty = s.lane;
      // hold up at the blue line while a teammate tags up
      if (zx > RINK.blueX - 14 && this.skaters.some(o => o.team === s.team && o !== s && o.state === "on" && d * o.x > RINK.blueX + 1)) tx = d * (RINK.blueX - 2.5);
    }
    else if (s.g === "D" && zx < 45) {
      const ahead = (lx, ly, r) => this.skaters.some(o => o.team !== s.team && o.state === "on" && dist(o.x, o.y, lx, ly) < r);
      if (!s.walkDir || s.walkT == null || this.time - s.walkT > 4) { s.walkDir = s.y >= 0 ? -1 : 1; s.walkT = this.time; }
      const room = press > 13 && !ahead(s.x + d * 10, s.y * 0.8, 9);
      const rush = s.entryT != null && this.time - s.entryT < 2.2 && Math.hypot(s.vx, s.vy) > 9;
      const wallRun = Math.abs(s.y) > 20 && press > 10 && !ahead(d * 60, side * 31, 12) && (st === "Offensive" || this.aggr(s.team) > 0.55 || s.p.skt >= 82);
      if (rush && press > 6 && !ahead(s.x + d * 12, s.y * 0.6, 7)) { tx = d * 58; ty = clamp(s.y * 0.45, -15, 15); } // carried it in with speed: keep driving to the top of the circles for a shot
      else if (wallRun) { tx = d * 62; ty = side * 31; }                             // activate down the wall; a forward rotates up to cover
      else if (room) { tx = d * 56; ty = clamp(s.y * 0.5, -14, 14); }               // walk downhill to the top of the circle for a better shot
      else {                                                                         // walk the line to open a lane
        const end = s.walkDir * 20; if (Math.abs(s.y - end) < 3) { s.walkDir = -s.walkDir; s.walkT = this.time; }
        tx = d * (31 + Math.sin(this.time * 1.3 + s.p.no) * 2); ty = s.walkDir * 20;
        // pressured: spin off toward the middle, never into the boards at the line
        if (near && press < 6) ty = Math.abs(s.y) > 16 ? s.y - side * 10 : s.y + (s.y >= near.s.y ? 1 : -1) * 8;
        if (Math.abs(s.y) > 28) { ty = side * 16; tx = d * 33; }
      }
    }
    else if (s.g === "F" && !pp && zx > 52) {
      // working it down low: each forward has a few routes and picks one for the possession
      if (!s.route) {
        const w = { Playmaker: [0.45, 0.2, 0.3, 0.05], Grinder: [0.3, 0.5, 0.05, 0.15], "Power Forward": [0.3, 0.2, 0.0, 0.5], Sniper: [0.15, 0.1, 0.6, 0.15], Speedster: [0.4, 0.1, 0.4, 0.1], Enforcer: [0.2, 0.5, 0.0, 0.3] }[st] || [0.3, 0.35, 0.25, 0.1];
        const kinds = ["wrap", "cycleUp", "curl", "drive"]; let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0; while (i < 3 && r > w[i]) { r -= w[i]; i++; }
        const sd = side, kind = kinds[i];
        const pts = kind === "wrap" ? [[86, sd * 27], [95, sd * 7], [95, -sd * 7], [84, -sd * 20]]
          : kind === "cycleUp" ? [[86, sd * 31], [74, sd * 35], [62, sd * 32]]
          : kind === "curl" ? [[74, sd * 20], [68, sd * 8], [64, -sd * 6]]
          : [[80, sd * 9], [84, sd * 4]];
        s.route = { kind, pts, i: 0, side: sd };
      }
      const R = s.route;
      // open ice in a scoring area: forget the route and take it to the net
      if (press > 11 && R.kind !== "wrap" && this.xgAt(s.x, s.y, s.team) > 0.05) { s.tx = d * 80; s.ty = clamp(s.y * 0.4, -8, 8); return; }
      while (R.i < R.pts.length - 1 && dist(s.x, s.y, d * R.pts[R.i][0], R.pts[R.i][1]) < 5) R.i++;
      tx = d * R.pts[R.i][0]; ty = R.pts[R.i][1];
      s.tx = clamp(tx, -96, 96); s.ty = clamp(ty, -40, 40); return;
    }
    else {
      switch (st) {
        case "Sniper": tx = d * 68; ty = side * 13; break;
        case "Playmaker":
          if (s.wrap === 0) { tx = d * 94; ty = side * 8; if (dist(s.x, s.y, tx, ty) < 5) s.wrap = 1; }
          else { tx = d * 82; ty = -side * 16; }
          break;
        case "Power Forward": tx = d * 80; ty = side * 6; break;
        case "Grinder": tx = d * 86; ty = side * 34; if (Math.abs(s.y) > 30 && d * s.x > 80) { tx = d * 72; ty = side * 30; } break;
        case "Speedster": if (Math.abs(s.y) < 20 && d * s.x < 70) { tx = d * 76; ty = side * 24; } else { tx = d * 82; ty = side * 9; } break;
        default: tx = d * 72; ty = side * 10;
      }
    }
    const n = this.nearestOpp(s);
    if (n && n.d < 12 && d * (n.s.x - s.x) > -2) ty += (s.y >= n.s.y ? 1 : -1) * (12 - n.d) * 1.1;
    s.tx = clamp(tx, -96, 96); s.ty = clamp(ty, -40, 40);
  }

  // ---------- team systems ----------
  layoutTeam(ti, possTeam, exclude) {
    const P = this.puck, d = this.dir(ti), og = -d * RINK.goalX, gx = d * RINK.goalX;
    const px = P.x, py = P.y, side = py >= 0 ? 1 : -1, pz = d * px;
    const c = P.carrier;
    const elig = this.skaters.filter(s => s.team === ti && s.state === "on" && !exclude.has(s));
    const nOn = this.onIce(ti).length, nOpp = this.onIce(1 - ti).length;
    const own = possTeam === ti || (possTeam === -1 && P.lastTeam === ti);
    const opps = this.skaters.filter(s => s.team !== ti && s.state === "on");
    const S = [];
    const add = (g, x, y, key, extra) => S.push(Object.assign({ g, x, y, key }, extra || {}));
    const mark = (g, m, off, key) => S.push({ g, mark: m, off, key, x: m.x, y: m.y });
    if (this.period === 4 && !this.playoff && Math.max(nOn, nOpp) <= 4 && nOn === nOpp) {
      // 3-on-3 overtime: possession hockey with open ice, and man-to-man coverage without it
      if (own) {
        if (pz > RINK.blueX) { add("*", gx - d * 12, -side * 17, "ot-low"); add("*", d * (RINK.blueX + 7), -side * 4, "ot-high"); add("*", gx - d * 7, 0, "ot-net"); }
        else if (pz < -RINK.blueX) { add("*", og + d * 30, -side * 30, "ot-out"); add("*", og + d * 52, side * 18, "ot-swing"); add("*", og + d * 12, -side * 10, "ot-back"); }
        else { add("*", px + d * 26, -side * 24, "ot-wide"); add("*", px - d * 14, side * 8, "ot-trail"); add("*", px + d * 18, side * 26, "ot-far"); }
      } else {
        const att = c && c.team !== ti ? c : null;
        const order = opps.slice().sort((a, b) => (a === att ? -1 : b === att ? 1 : dist(a.x, a.y, og, 0) - dist(b.x, b.y, og, 0)));
        order.forEach((o, i) => mark("*", o, o === att ? 2.5 : 4, "ot-m" + i));
      }
    } else if (own) {
      if (pz > RINK.blueX && (nOn > nOpp || this.teams[ti].pulled)) {
        const T = this.teams[ti];
        if (T.ppSide == null || (Math.abs(py) > 8 && Math.sign(py) !== T.ppSide)) T.ppSide = py >= 0 ? 1 : -1;
        const ss = T.ppSide, f = this.tac(ti).pp;
        if (f === "overload") {
          add("F", gx - d * 26, ss * 30, "pp-wall"); add("F", gx - d * 1.5, ss * 17, "pp-low"); add("D", d * 30, ss * 15, "pp-point");
          add("F", gx - d * 5.5, clamp(py * 0.14, -3.5, 3.5), "pp-net"); add("*", gx - d * 8, -ss * 14, "pp-door"); add("F", d * 30, -ss * 10, "pp-extra");
        } else if (f === "spread") {
          add("D", d * 30, 15, "pp-pt-l"); add("*", d * 30, -15, "pp-pt-r"); add("F", gx - d * 21, 0, "pp-high");
          add("F", gx - d * 8, 13, "pp-low-l"); add("F", gx - d * 8, -13, "pp-low-r"); add("F", gx - d * 14, 0, "pp-extra");
        } else {
          add("F", gx - d * 5.5, clamp(py * 0.14, -3.5, 3.5), "pp-net"); add("F", gx - d * 24, 25, "pp-flank-l"); add("F", gx - d * 24, -25, "pp-flank-r");
          add("D", d * 31, 0, "pp-point"); add("*", gx - d * 18, 0, "pp-bumper"); add("F", gx - d * 10, -ss * 8, "pp-extra");
        }
        T.ppCarrierSpot = null;
        if (c) { let bi = -1, bd = 16; S.forEach((sp, i) => { const q = dist(sp.x, sp.y, c.x, c.y); if (q < bd) { bd = q; bi = i; } }); if (bi >= 0) { T.ppCarrierSpot = S[bi]; S.splice(bi, 1); } }
      } else if (nOn > nOpp && pz <= RINK.blueX) { // power-play breakout: regroup, swing, drop pass
        if (pz < -RINK.blueX) {
          add("F", og + d * 62, 30, "ppb-wl"); add("F", og + d * 62, -30, "ppb-wr"); add("F", og + d * 36, -side * 8, "ppb-swing"); add("D", og + d * 18, -side * 16, "ppb-d");
          add("F", og + d * 50, 0, "ppb-x");
        } else {
          const ax = d * Math.min(pz + 18, RINK.blueX - 3);
          add("F", ax, 30, "ppr-l"); add("F", ax, -30, "ppr-r"); add("F", px - d * 8, clamp(-py * 0.4, -8, 8), "ppr-trail"); add("D", px - d * 24, 0, "ppr-d"); add("F", ax, 0, "ppr-x");
        }
      } else if (pz > RINK.blueX) {
        const cz = c && c.team === ti ? d * c.x : pz, cy = c && c.team === ti ? c.y : py, cs = cy >= 0 ? 1 : -1;
        const cr = c && c.team === ti && c.route ? c.route : null;
        // one forward owns the net front; the other gives the carrier a real option, never a third body in the crease
        add("F", gx - d * 6.5, clamp(py * 0.14, -3.5, 3.5), "oz-net");
        const deepD = this.skaters.find(x => x.team === ti && x.state === "on" && x.g === "D" && d * x.x > (x === c ? 42 : 50));
        if (deepD) add("*", d * 29, deepD.y >= 0 ? 14 : -14, "oz-rotate");
        const flip = Math.floor(this.time / 5 + ti) % 2; // support alternates between two looks every few seconds
        if (cr && cr.kind === "cycleUp") add("F", gx - d * 3, cr.side * 25, "oz-support");            // drop low to take it back down the wall
        else if (cr && cr.kind === "wrap") add("F", gx - d * 18, -cr.side * 9, "oz-support");       // high slot for the pass out of the wrap
        else if (cr && cr.kind === "drive") add("F", gx - d * 24, cr.side * 20, "oz-support");      // high option to drop it to
        else if (cz > 86) add("F", gx - d * 19, -cs * 6, "oz-support");                             // carrier behind the net: someone in the slot
        else if (cz > 66 && Math.abs(cy) > 20 && c && c.team === ti && c.g === "F") add("F", flip ? gx - d * 21 : gx - d * 23, flip ? cs * 4 : cs * 29, "oz-support"); // carrier low on the wall: come down the wall behind her for the cycle, or sit in the high slot
        else if (cz > 68) add("F", flip ? gx + d * 4 : gx - d * 21, flip ? -cs * 9 : cs * 4, "oz-support"); // carrier low: below the net on the far side, or the high slot
        else add("F", flip ? gx + d * 3 : gx - d * 4, flip ? cs * 9 : cs * 26, "oz-support");      // carrier high: support below the goal line or low on the wall
        add("F", gx - d * 24, -cs * 10, "oz-high");
        add("D", d * 28, side * 20, "oz-point-s", { pinch: true });
        add("D", d * 29, -side * 10, "oz-point-w");
        add("F", gx - d * 12, side * 8, "oz-extra");
      } else if (pz < -RINK.blueX && (!c || d * c.x < -58)) {
        add("D", og + d * 8, -side * 14, "bo-d2d");
        add("F", og + d * 26, side * 37, "bo-wall");
        add("F", og + d * 20, -side * 4, "bo-swing");
        if (this.aggr(ti) >= 0.45) add("F", -d * 12, -side * 26, "bo-stretch"); else add("F", og + d * 48, -side * 30, "bo-stretch");
        add("D", og + d * 20, side * 16, "bo-d");
        add("F", og + d * 35, 0, "bo-extra");
      } else {
        const cy = c ? c.y : py;
        const lanes = [-26, 0, 26].sort((a, b) => Math.abs(b - cy) - Math.abs(a - cy));
        const ahead = px + d * 18;
        add("F", ahead, lanes[0], "rush-a"); add("F", ahead - d * 4, lanes[1], "rush-b");
        add("F", px - d * 8, clamp(cy * -0.3, -10, 10), "rush-trail");
        const gapD = pz > 0 ? 17 : 22; // past the red line the D close up to join as the trailers and hold the blue line
        add("D", d > 0 ? Math.max(px - gapD, -80) : Math.min(px + gapD, 80), -12, "rush-d1"); add("D", d > 0 ? Math.max(px - gapD - 2, -80) : Math.min(px + gapD + 2, 80), 12, "rush-d2");
        add("F", ahead - d * 8, 0, "rush-x");
      }
    } else {
      const att = c && c.team !== ti ? c : null;
      const oppD = opps.filter(o => o.g === "D").sort((a, b) => Math.abs(a.y - py) - Math.abs(b.y - py));
      const oppF = opps.filter(o => o !== att).sort((a, b) => dist(a.x, a.y, og, 0) - dist(b.x, b.y, og, 0));
      const tc = this.tac(ti), a = this.aggr(ti);
      const pressNearest = (target, within, off, key) => { let bi = -1, bd = within; S.forEach((sp, i) => { if (sp.mark) return; const q = dist(sp.x, sp.y, target.x, target.y); if (q < bd) { bd = q; bi = i; } }); if (bi >= 0) S[bi] = { g: S[bi].g, mark: target, off, key, x: target.x, y: target.y }; };
      if (pz < -RINK.blueX && nOn < nOpp) { // penalty kill in our end
        let box;
        if (nOn < 4) box = [["D", og + d * 8, -6], ["D", og + d * 8, 6], ["F", og + d * 22, 0]];
        else if (tc.pk === "diamond") box = [["F", og + d * 30, 0], ["F", og + d * 17, 14], ["D", og + d * 17, -14], ["D", og + d * 6, 0]];
        else if (tc.pk === "aggressive") box = [["D", og + d * 9, -8], ["D", og + d * 9, 8], ["F", og + d * 30, -14], ["F", og + d * 30, 14]];
        else box = [["D", og + d * 9, -7], ["D", og + d * 9, 7], ["F", og + d * 25, -11], ["F", og + d * 25, 11]];
        box.forEach((b, i) => add(b[0], b[1], b[2], "pk" + i));
        if (att) pressNearest(att, tc.pk === "aggressive" ? 26 : 16, tc.pk === "aggressive" ? 1.2 : 1.5, "pk-press");
        if (att && tc.pk === "aggressive") { const opt = opps.filter(o => o !== att).sort((p, q) => dist(p.x, p.y, att.x, att.y) - dist(q.x, q.y, att.x, att.y))[0]; if (opt) pressNearest(opt, 30, 2.5, "pk-press2"); }
      } else if (nOn < nOpp && pz >= -RINK.blueX) { // shorthanded up ice
        if (tc.pk === "aggressive" && att && d * att.x > RINK.blueX) { mark("F", att, 3, "pk-fc"); add("F", d * 6, -side * 14, "pk-f2"); }
        else { add("F", d * 6, -12, "pk-f1"); add("F", d * 6, 12, "pk-f2"); }
        add("D", -d * 30, -13, "pk-d1"); add("D", -d * 30, 13, "pk-d2");
        if (att && d * att.x < 20 && tc.pk !== "aggressive") pressNearest(att, 22, 3, "pk-gap");
      } else if (pz > RINK.blueX) { // forecheck
        if (tc.fc === "trap") { // 1-3-1: one steers, three wait across the neutral zone, one back
          if (att) mark("F", att, d * att.x > 75 ? 6 : 5, "fc-f1"); else add("F", d * 58, py * 0.5, "fc-f1");
          add("F", d * 8, -24, "trap-l"); add("D", d * 6, 0, "trap-m"); add("F", d * 8, 24, "trap-r"); add("D", -d * 22, 0, "trap-back");
        } else if (tc.fc === "212") { // two on the puck
          if (att) mark("F", att, 1.5, "fc-f1"); else add("F", px - d * 6, py, "fc-f1");
          const second = oppF.filter(o => o !== att).sort((p, q) => dist(p.x, p.y, px, py) - dist(q.x, q.y, px, py))[0];
          if (second) mark("F", second, 3, "fc-f2"); else add("F", d * 60, side * 24, "fc-f2");
          add("F", d * 50, -side * 8, "fc-f3");
          add("D", d * 27, side * 15, "fc-d1", { pinch: true }); add("D", d * 26, -side * 13, "fc-d2");
        } else { // 1-2-2: one hunter, two cutting off the walls, two back
          if (att) mark("F", att, a > 0.6 || d * att.x > 70 ? 1.5 : 4, "fc-f1"); else add("F", px - d * 6, py, "fc-f1");
          add("F", d * 58, side * 24, "fc-f2"); add("F", d * 52, -side * 16, "fc-f3");
          add("D", d * 27, side * 15, "fc-d1", { pinch: true }); add("D", d * 26, -side * 13, "fc-d2");
        }
      } else if (pz < -RINK.blueX) {
        const lowCarrier = att && (d * att.x < -62 || Math.abs(att.y) > 25);
        const atPoint = att && d * att.x > -48;
        // pressure the puck: whoever is closest; tight on the wall, closing the lane at the point
        if (att) mark("*", att, lowCarrier ? 1.1 : atPoint ? 3 : 1.6, "dz-press");
        // net-front and slot threats get a body on them, most dangerous first
        const threats = opps.filter(o => o !== att && dist(o.x, o.y, og, 0) < 30).sort((a, b) => this.xgAt(b.x, b.y, 1 - ti) - this.xgAt(a.x, a.y, 1 - ti));
        if (threats[0]) mark("D", threats[0], 2, "dz-net"); else add("D", og + d * 7, 0, "dz-net");
        // on the wall: a second man comes in on the inside to pin the carrier and take away the pass to the slot
        if (att && lowCarrier) mark("F", att, 5.5, "dz-pin");
        if (threats[1]) mark("*", threats[1], 2.5, "dz-x"); else add("D", og + d * 12, -side * 10, "dz-x");
        if (threats[2]) mark("F", threats[2], 3, "dz-slot"); else add("F", og + d * 20, (att ? -Math.sign(att.y || 1) : -side) * 4, "dz-slot");
        const pts = oppD.filter(o => o !== att && !threats.slice(0, 3).includes(o));
        if (pts[0]) mark("F", pts[0], 7, "dz-pt1"); else add("F", og + d * 46, side * 16, "dz-pt1");
        if (pts[1]) mark("F", pts[1], 7, "dz-pt2"); else add("F", og + d * 46, -side * 16, "dz-pt2");
      } else if (tc.fc === "trap") { // neutral-zone trap: steer the carrier into a wall of three
        if (att) mark("F", att, 6, "nz-steer"); else add("F", px - d * 10, py, "nz-steer");
        add("F", -d * 8, -22, "trap-l"); add("D", -d * 10, 0, "trap-m"); add("F", -d * 8, 22, "trap-r"); add("D", -d * 30, 0, "trap-back");
      } else {
        const gap = 16 - 6 * a;
        if (att) { const ux = og - att.x, uy = -att.y, L = Math.hypot(ux, uy) || 1; add("D", att.x + ux / L * gap, att.y + uy / L * gap, "nz-gap"); }
        else add("D", -d * 30, side * 10, "nz-gap");
        add("D", -d * 32, -side * 12, "nz-d2");
        oppF.slice(0, 3).forEach((o, i) => mark("F", o, 4, "nz-m" + i));
        add("F", -d * 20, 0, "nz-x");
      }
    }
    const used = new Set();
    for (const sp of S) {
      let best = null, bc = 1e9;
      for (const s of elig) {
        if (used.has(s)) continue;
        let cost = dist(s.x, s.y, sp.x, sp.y) + (sp.g !== "*" && sp.g !== s.g ? 22 : 0);
        if (s.spotKey === sp.key) cost -= 6;
        if (cost < bc) { bc = cost; best = s; }
      }
      if (best) { used.add(best); best.spot = sp; best.spotKey = sp.key; }
    }
    for (const s of elig) if (!used.has(s)) { s.spot = null; s.spotKey = ""; }
  }
  // alone: past the red line with nobody between the carrier and the net
  breakaway(s) {
    const d = this.dir(s.team), zx = d * s.x;
    if (zx < 0 || zx > RINK.goalX - 1) return null;
    let chaser = 99;
    for (const o of this.skaters) if (o.team !== s.team && o.state === "on") {
      const ahead = d * (o.x - s.x);
      if (ahead > -1 && Math.abs(o.y - s.y) < 28) return null;
      chaser = Math.min(chaser, dist(o.x, o.y, s.x, s.y));
    }
    return { chaser };
  }
  // the opposing skater closest to our own goal, in our attacking coordinate
  deepestThreat(ti) {
    const d = this.dir(ti); let m = 1e9;
    for (const o of this.skaters) if (o.team !== ti && o.state === "on") m = Math.min(m, d * o.x);
    return m;
  }
  assignTargets(dt) {
    const P = this.puck, c = P.carrier;
    const possTeam = c ? c.team : P.pass && !P.pass.loose ? P.pass.fromTeam : -1;
    const loose = !c && (!P.pass || P.pass.loose) && !P.shot;
    P.looseT = loose ? (P.looseT || 0) + dt : 0;
    const exclude = new Set();
    if (c) exclude.add(c);
    if (P.pass) { if (P.pass.to) exclude.add(P.pass.to); if (P.pass.interceptor) exclude.add(P.pass.interceptor); }
    const chasers = new Set();
    if (loose) {
      for (let ti = 0; ti < 2; ti++) {
        // the last player back stays home unless the puck is right on him or in his own end
        const d = this.dir(ti), all = this.onIce(ti);
        const lastBack = all.slice().sort((a, b) => d * a.x - d * b.x)[0];
        // race to the puck: how long until each skater gets there
        const eta = x => dist(x.x, x.y, P.x + P.vx * 0.4, P.y + P.vy * 0.4) / Math.max(10, x.maxSpd * this.spdMul(x.p) * 0.85) + (x.stun > 0 ? x.stun : 0);
        const oppEta = Math.min(99, ...this.onIce(1 - ti).map(eta));
        // the last player back stays home unless they'd clearly win the race or the puck is in their end
        const mine = all.filter(s => s.stun <= 0 && !(s === lastBack && d * P.x > -RINK.blueX && dist(s.x, s.y, P.x, P.y) > 6 && all.length > 2 && eta(s) > oppEta - 0.5))
          .sort((a, b) => eta(a) - eta(b));
        if (mine[0]) chasers.add(mine[0]);
        if (mine[1] && dist(mine[1].x, mine[1].y, P.x, P.y) < 9) chasers.add(mine[1]);
        // a puck that has been sitting loose with nobody close: a second player goes for it too
        if (mine[1] && P.looseT > 1 && eta(mine[0]) > 1 && !(mine[1] === lastBack && d * P.x > 0)) chasers.add(mine[1]);
        const ch = P.pass && P.pass.chase; if (ch && ch.team === ti && ch.state === "on" && ch.stun <= 0) chasers.add(ch);
      }
      chasers.forEach(s => exclude.add(s));
    }
    this.spotT -= dt;
    if (this.spotT <= 0) { this.spotT = 0.2; this.layoutTeam(0, possTeam, exclude); this.layoutTeam(1, possTeam, exclude); }
    const crash = !P.shot && this.time - this.lastShot.t < 1.3;
    // after a shot: one forward to the net, one to the far post for the rebound or the rim around the end boards
    const crashRole = new Map();
    if (crash || P.shot) {
      const ti = this.lastShot.team;
      if (ti >= 0) {
        const d = this.dir(ti), gx = d * RINK.goalX, far = (this.lastShotY || 0) >= 0 ? -1 : 1;
        const fs = this.skaters.filter(x => x.team === ti && x.state === "on" && x.g === "F" && x !== c && !exclude.has(x) && dist(x.x, x.y, gx, 0) < 40)
          .sort((a, b) => dist(a.x, a.y, gx, 0) - dist(b.x, b.y, gx, 0));
        if (fs[0]) crashRole.set(fs[0], { x: gx - d * 6, y: clamp(P.y, -5, 5) });
        if (fs[1] && dist(fs[1].x, fs[1].y, gx, 0) < 20) crashRole.set(fs[1], { x: gx - d * 3, y: far * 15 });
      }
    }
    for (const s of this.skaters) {
      const d = this.dir(s.team);
      if (s.state !== "on") { this.offIceTarget(s); continue; }
      if (s === c) {
        if (s.deke) { const gx = d * RINK.goalX; s.tx = s.deke.move === "Michigan" ? gx + d * 1.5 : gx - d * 5; s.ty = s.deke.move === "Michigan" ? (s.y >= 0 ? 1 : -1) * 3.2 : s.deke.side * 4; }
        else this.carrierTarget(s);
        continue;
      }
      let tx, ty;
      if (P.pass && P.pass.to === s) {
        tx = P.pass.rx ?? P.pass.tx; ty = P.pass.ry ?? P.pass.ty;
        // a rim that comes up short, runs long or is already on top of her: play the puck, not the spot
        if (P.pass.rim && (dist(s.x, s.y, P.x, P.y) < 14 || this.time - P.pass.t0 > P.pass.eta * 0.85)) { tx = P.x + P.vx * 0.3; ty = P.y + P.vy * 0.3; }
      }
      else if (P.pass && P.pass.interceptor === s) { tx = P.x + P.vx * 0.15; ty = P.y + P.vy * 0.15; }
      else if (chasers.has(s)) { tx = P.x + P.vx * 0.35; ty = P.y + P.vy * 0.35; }
      else if (s.spot) {
        const sp = s.spot;
        if (sp.mark) {
          const og = -d * RINK.goalX, m = sp.mark;
          const ux = og - m.x, uy = -m.y, L = Math.hypot(ux, uy) || 1;
          tx = m.x + ux / L * sp.off; ty = m.y + uy / L * sp.off;
        } else { tx = sp.x; ty = sp.y; }
        if (sp.pinch && this.canPinch(s) && Math.sign(P.y || 1) === Math.sign(sp.y) && d * P.x > 50 && Math.abs(P.y) > 22) { tx = d * 50; ty = Math.sign(sp.y) * 33; }
      } else { tx = s.x; ty = s.y; }
      if (crashRole.has(s)) { const cr = crashRole.get(s); tx = cr.x; ty = cr.y; }
      if (s.bapDef && s.bapDef.until > this.time && c && c.team !== s.team) { if (s.bapDef.kind === "contain") { const og = -d * RINK.goalX; tx = c.x + (og - c.x) * 0.18; ty = c.y * 0.85; } else { tx = c.x + c.vx * 0.2; ty = c.y + c.vy * 0.2; } }
      if (s.cycleGo) { if (s.cycleGo.until > this.time && possTeam === s.team) { tx = s.cycleGo.x; ty = s.cycleGo.y; } else s.cycleGo = null; }
      if (s.bapRun) { if (s.bapRun.until > this.time && possTeam === s.team) { tx = s.bapRun.x; ty = s.bapRun.y; } else s.bapRun = null; }
      const attacking = possTeam === s.team || (possTeam === -1 && P.lastTeam === s.team);
      if (!(s.spot && s.spot.mark === c) && !(s.spot && s.spot.key === "dz-press") && !chasers.has(s)) {
        const deepest = this.deepestThreat(s.team);
        const pzS = d * P.x;
        let lim = 1e9;
        if (s.g === "D") {
          // always deeper than the deepest attacker -- but not inside our own zone, where the D play the man and the net, not the goal line
          if ((!attacking && (pzS >= -RINK.blueX || this.shorthanded(s.team))) || pzS > RINK.blueX) lim = deepest - 3;
          if (attacking && pzS > RINK.blueX && deepest > -6) lim = Math.max(lim, RINK.blueX + 3); // ...but a forward floating high doesn't pull the D off the point
          // lost it deep in their end: hold the line for a beat instead of bailing, as long as nobody is behind you yet
          if (!attacking && pzS > RINK.blueX + 30 && deepest > 2) lim = Math.max(lim, Math.min(RINK.blueX - 2, deepest + 6));
          if (!attacking && pzS >= -RINK.blueX) lim = Math.min(lim, pzS - (17 - 6 * this.aggr(s.team))); // keep a gap on the puck
        } else if (!attacking && pzS < RINK.blueX && (pzS > -RINK.blueX || this.shorthanded(s.team)) && !chasers.has(s)) lim = pzS + 4; // backcheck through the neutral zone (and a penalty kill stays tight)
        if (lim < 1e9 && d * tx > lim) { tx = d * Math.max(lim, -86); }
      }
      if (attacking && d * P.x <= RINK.blueX && d * tx > RINK.blueX - 3.5) tx = d * (RINK.blueX - 3.5);
      if (this.delayedOffside && this.delayedOffside.team === s.team) tx = d * (RINK.blueX - 4);
      if (Math.abs(tx) > 86 && Math.abs(tx) < 93.5 && Math.abs(ty) < 5) ty = (ty >= 0 ? 1 : -1) * 5;
      s.tx = clamp(tx, -97.5, 97.5); s.ty = clamp(ty, -40.5, 40.5);
    }
    this.ozMovement(possTeam, chasers);
  }
  // attackers without the puck in the offensive zone keep moving: they slide to open ice, keep a lane to the carrier, and spread out
  ozMovement(possTeam, chasers) {
    const P = this.puck, c = P.carrier;
    if (possTeam < 0 || this.phase !== "play") return;
    const ti = possTeam, d = this.dir(ti);
    if (d * P.x < RINK.blueX) return;
    const pp = this.strength(ti) > this.strength(1 - ti);
    const opps = this.skaters.filter(o => o.team !== ti && o.state === "on");
    const mates = this.skaters.filter(s => s.team === ti && s.state === "on" && s !== c && !chasers.has(s) && !(P.pass && P.pass.to === s) && s.spot && !s.spot.mark && (pp ? /^pp-/ : /^oz-/).test(s.spot.key) && !(s.bapRun && s.bapRun.until > this.time) && !(s.cycleGo && s.cycleGo.until > this.time));
    const score = (x, y, s) => {
      let open = 16; for (const o of opps) open = Math.min(open, dist(o.x, o.y, x, y));
      let lane = 1; if (c) for (const o of opps) { const q = segDist(o.x, o.y, c.x, c.y, x, y); if (q.t > 0.1 && q.t < 0.9 && q.d < 3.5) lane = 0.55; }
      return open * lane;
    };
    // the weak-side D sneaks down the back door when the puck is low on the other side and nobody is watching her
    if (!pp && c && c.team === ti && d * c.x > 58) {
      const cs = c.y >= 0 ? 1 : -1, gx = d * RINK.goalX;
      for (const s of mates) {
        if (s.g !== "D" || (s.y >= 0 ? 1 : -1) === cs || d * s.x > 45) continue; // the D on the far side, still up top
        if (s.dAct && s.dAct.until > this.time) continue;
        if ((s.dActNext || 0) > this.time) continue;
        s.dActNext = this.time + 1.2;
        const tx = gx - d * 21, ty = -cs * 15, open = !opps.some(o => dist(o.x, o.y, tx, ty) < 9);
        const other = this.skaters.find(x => x.team === ti && x.state === "on" && x.g === "D" && x !== s);
        const pAct = (0.18 + 0.35 * this.aggr(ti) + (s.p.style === "Offensive" ? 0.15 : s.p.style === "Stay-at-Home" ? -0.12 : 0)) * (open ? 1 : 0.3);
        if (other && d * other.x < RINK.blueX + 12 && rnd() < pAct) s.dAct = { until: this.time + 2.6, x: tx, y: ty };
      }
    }
    for (const s of mates) {
      if (s.dAct) { if (s.dAct.until > this.time && c && c.team === ti && d * c.x > 50) { s.tx = s.dAct.x; s.ty = s.dAct.y; continue; } s.dAct = null; }
      const key = s.spot.key, net = key === "oz-net" || key === "pp-net";
      // keep the legs moving: a slow loop around the spot (the net-front player only shuffles)
      const amp = net ? 1.2 : key === "oz-support" ? 3.5 : pp ? 3 : 2.5, ph = s.p.no * 1.37;
      let bx = s.tx + Math.sin(this.time * 0.8 + ph) * amp, by = s.ty + Math.cos(this.time * 0.65 + ph) * amp;
      if (!net) {
        // slide to the most open spot nearby, with some stickiness so they don't twitch between two
        let best = { x: bx, y: by, v: score(bx, by, s) * 1.15 };
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + (s.p.no % 3) * 0.3, x = bx + Math.cos(a) * 6, y = by + Math.sin(a) * 6; if (d * x > RINK.goalX + 8 || d * x < RINK.blueX + 3 || Math.abs(y) > 38) continue; const v = score(x, y, s); if (v > best.v) best = { x, y, v }; }
        bx = best.x; by = best.y;
      }
      s.tx = clamp(bx, -97.5, 97.5); s.ty = clamp(by, -39, 39);
      if (Math.abs(s.tx) > 86 && Math.abs(s.tx) < 93.5 && Math.abs(s.ty) < 5) s.ty = (s.ty >= 0 ? 1 : -1) * 5;
    }
    // spacing: nobody piles into the same few feet as a teammate (the carrier included)
    const all = c && c.team === ti ? [c, ...mates] : mates;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; if (b === c) continue;
      const ax = a === c ? a.x : a.tx, ay = a === c ? a.y : a.ty, dd = dist(ax, ay, b.tx, b.ty);
      const need = (a.spot && /-net$/.test(a.spot.key)) || (b.spot && /-net$/.test(b.spot.key)) ? 8 : pp ? 10 : 12;
      if (dd < need) { const ux = (b.tx - ax) / (dd || 1), uy = (b.ty - ay) / (dd || 1), push = need - dd; b.tx = clamp(b.tx + (dd ? ux : 1) * push, -97.5, 97.5); b.ty = clamp(b.ty + (dd ? uy : 0) * push, -39, 39); }
    }
  }

  // ---------- movement ----------
  // which way a skater faces: the way they skate, except when backing off a rush or standing still, when they watch the puck
  turnTo(s, dt) {
    const P = this.puck, sp = Math.hypot(s.vx, s.vy);
    const toP = Math.atan2(P.y - s.y, P.x - s.x), pd = dist(P.x, P.y, s.x, s.y);
    let want;
    if (s === P.carrier && s.hfx != null) want = Math.atan2(s.hfy, s.hfx);
    else if (sp < 4) want = pd > 0.5 ? toP : (s.fa ?? 0);
    else {
      const va = Math.atan2(s.vy, s.vx), back = ((P.x - s.x) * s.vx + (P.y - s.y) * s.vy) / (pd * sp || 1) < -0.35;
      const defending = !(P.carrier && P.carrier.team === s.team);
      want = back && defending && pd < 45 && s.state === "on" ? toP : va;
    }
    if (s.fa == null) { s.fa = want; return; }
    let dA = want - s.fa; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
    const mx = 9 * dt; s.fa += clamp(dA, -mx, mx);
  }
  moveSkaters(dt) {
    const P = this.puck;
    for (const s of this.skaters) {
      let vmax = s.maxSpd * this.spdMul(s.p) * (s === P.carrier ? 0.92 : 1);
      if (s.stun > 0) { vmax *= 0.35; s.stun -= dt; }
      if (this.phase !== "play" && this.phase !== "shootout" && s.state === "on") vmax *= 0.7;
      // skate around the net, not into it, when the target is on the other side of the goal line
      // low-pass the off-puck target so support skaters glide instead of twitching between spots
      const ownPuck = P.carrier ? P.carrier.team === s.team : P.pass && !P.pass.loose && P.pass.fromTeam === s.team;
      if (s !== P.carrier && s.state === "on" && this.phase === "play" && ownPuck) {
        if (s.stx == null || dist(s.stx, s.sty, s.tx, s.ty) > 24) { s.stx = s.tx; s.sty = s.ty; }
        else { const k = Math.min(1, dt * 5); s.stx += (s.tx - s.stx) * k; s.sty += (s.ty - s.sty) * k; }
      } else { s.stx = s.tx; s.sty = s.ty; }
      const TX = s.stx, TY = s.sty;
      let gx2 = TX, gy2 = TY;
      for (const nxs of [-1, 1]) {
        const nx = nxs * 90.7, front = Math.abs(s.x) < Math.abs(nx) || Math.sign(s.x) !== nxs, tFront = Math.abs(TX) < Math.abs(nx) || Math.sign(TX) !== nxs;
        if (Math.sign(TX) !== nxs && Math.sign(s.x) !== nxs) continue;
        if (front !== tFront && segDist(nx, 0, s.x, s.y, TX, TY).d < 5.5) {
          const sy = Math.abs(TY) > 1 ? Math.sign(TY) : Math.abs(s.y) > 1 ? Math.sign(s.y) : 1;
          gx2 = nx + (front ? -nxs * 1.5 : nxs * 2.5); gy2 = sy * 7.5;
          if (dist(s.x, s.y, gx2, gy2) < 2.5) gx2 = nx + (front ? nxs * 3 : -nxs * 3);
        }
      }
      const dx = gx2 - s.x, dy = gy2 - s.y, L = Math.hypot(dx, dy);
      let wx = 0, wy = 0;
      if (L > 0.3) { const sp = s.baLane && s === P.carrier ? vmax : Math.min(vmax, L * 2.2); wx = dx / L * sp; wy = dy / L * sp; }
      for (const o of this.skaters) if (o !== s) {
        const ox = s.x - o.x, oy = s.y - o.y, od = Math.hypot(ox, oy);
        if (od < 3.2 && od > 0.01) { wx += ox / od * (3.2 - od) * 6; wy += oy / od * (3.2 - od) * 6; }
      }
      for (const nx of [-90.7, 90.7]) { const ox = s.x - nx, oy = s.y, od = Math.hypot(ox, oy); if (od < 4.2 && od > 0.01) { wx += ox / od * (4.2 - od) * 9; wy += oy / od * (4.2 - od) * 9; } }
      let ax = wx - s.vx, ay = wy - s.vy; const A = Math.hypot(ax, ay), amax = (26 + s.p.spd * 0.06 + this.r(s.p, "skt") * 0.11) * dt;
      if (A > amax) { ax = ax / A * amax; ay = ay / A * amax; }
      s.vx += ax; s.vy += ay;
      s.x += s.vx * dt; s.y += s.vy * dt;
      containPoint(s, 1.6, 0);
      this.turnTo(s, dt);
      if (s.cool > 0) s.cool -= dt;
      if (s.checkCool > 0) s.checkCool -= dt;
    }
    for (let ti = 0; ti < 2; ti++) {
      const g = this.goalies[ti]; if (!g) continue;
      const d = this.dir(ti), ox = -d * RINK.goalX;
      let tx, ty, vmax = 14;
      if (g.state === "leaving") { const door = this.benchDoor(ti); tx = door.x; ty = -41; vmax = 22; }
      else {
        const behind = d * P.x < -RINK.goalX;
        const inHalf = Math.sign(P.x) === Math.sign(ox) || Math.abs(P.x) < 10;
        ty = behind ? (P.y >= 0 ? 1 : -1) * 2.6 : inHalf ? clamp(P.y * 0.16, -2.6, 2.6) : 0;
        tx = behind ? ox + d * 1.2 : ox + d * (inHalf ? 3.5 - Math.min(1.5, Math.abs(P.y) / 20) : 3);
        const c = P.carrier;
        if (c && c.team !== ti && c.baLane && inHalf && Math.abs(c.x - ox) > 14) tx = ox + d * 5.5; // challenge the shooter
        if (g.state === "returning") { vmax = 22; if (dist(g.x, g.y, tx, ty) < 2) g.state = "net"; }
      }
      const dx = tx - g.x, dy = ty - g.y, L = Math.hypot(dx, dy);
      const sp = Math.min(vmax, L * 6);
      if (L > 0.05) { g.x += dx / L * sp * dt; g.y += dy / L * sp * dt; }
      if (g.state === "leaving" && g.y < -39) {
        this.goalies[ti] = null; this.teams[ti].pulled = true;
        this.requestChange(ti, false, "fill");
      }
    }
  }
  movePuck(dt) {
    const P = this.puck;
    this.prevPuckX = P.x; this.prevPuckY = P.y;
    if (P.carrier) {
      const s = P.carrier, d = this.dir(s.team);
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const hx = sp > 2 ? s.vx / sp : d, hy = sp > 2 ? s.vy / sp : 0;
      // the blade swings toward the skating direction instead of snapping to it
      if (s.hfx == null || P.lastCarrier !== s) { s.hfx = hx; s.hfy = hy; }
      else { const k = Math.min(1, dt * 9); s.hfx += (hx - s.hfx) * k; s.hfy += (hy - s.hfy) * k; const n = Math.hypot(s.hfx, s.hfy) || 1; s.hfx /= n; s.hfy /= n; }
      P.lastCarrier = s;
      const fx = s.hfx, fy = s.hfy;
      const side = shootsOf(s.p) === "L" ? 1 : -1, lx = fy * side, ly = -fx * side;
      const h = this.hands(s.p), near = this.nearestOpp(s), tight = near ? near.d < 9 : false, fast = sp > 20;
      s.dribT = (s.dribT || 0) + dt * (fast ? 4.5 : 7 + h / 22);
      const amp = (s.deke ? 1.5 : tight ? 1.05 : fast ? 0.3 : 0.65) * (0.75 + h / 300);
      const lat = 0.35 + Math.sin(s.dribT) * amp, fwd = (fast ? 2.6 : 2.15) + Math.cos(s.dribT * 2) * 0.15;
      s.lat = lat;
      P.x = s.x + fx * fwd + lx * lat; P.y = s.y + fy * fwd + ly * lat; P.vx = s.vx; P.vy = s.vy;
      if (Math.abs(P.x) > 90 && Math.abs(P.y) < 3.4) P.y = (P.y >= 0 ? 1 : -1) * 3.6;
      return;
    }
    P.lastCarrier = null;
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      const h = dt / steps;
      P.x += P.vx * h; P.y += P.vy * h;
      const sp = Math.hypot(P.vx, P.vy) * h;
      if (P.shot) {
        P.shot.left -= sp;
        const sh = P.shot, d = this.dir(sh.team);
        if (sh.outcome === "block" && (dist(P.x, P.y, sh.blocker.x, sh.blocker.y) < 2.4 || sh.left <= 0)) { this.resolveShot(); continue; }
        if (sh.outcome === "save") { const g = this.goalies[1 - sh.team]; if (!g || dist(P.x, P.y, g.x, g.y) < 2.4 || sh.left <= 0) { if (!g) sh.outcome = "goal"; else { this.resolveShot(); if (this.phase !== "play") return; continue; } } }
        if (sh.outcome === "goal" && d * P.x >= RINK.goalX + 0.5) { this.resolveShot(); return; }
        if (sh.outcome === "miss" && d * P.x >= RINK.goalX) { this.resolveShot(); continue; }
      } else if (P.pass) {
        P.pass.left -= sp;
        if (P.pass.rim) { // rims ride the boards until someone gets there or they die out
          const f = Math.exp(-0.5 * h); P.vx *= f; P.vy *= f;
          if (Math.hypot(P.vx, P.vy) < 13) { P.pass = null; }
        } else if (P.pass.bank && P.pass.left <= 0) this.bankRedirect();
        else if (P.pass.left <= 0) { P.pass = null; P.vx *= 0.8; P.vy *= 0.8; }
      } else {
        const f = Math.exp(-0.9 * h); P.vx *= f; P.vy *= f;
      }
      if (!P.shot && Math.abs(P.x) > RINK.goalX - 0.3 && Math.abs(P.x) < 92.8 && Math.abs(P.y) < 3.4) {
        const front = Math.abs(P.x - P.vx * h) < RINK.goalX - 0.3;
        if (front) { P.x = Math.sign(P.x) * (RINK.goalX - 0.4); P.vx = -P.vx * 0.3; }
        else { P.y = (P.y >= 0 ? 1 : -1) * 3.5; P.vy = -P.vy * 0.5; }
      }
      const hit = containPuck(P, P.pass && P.pass.rim);
      if (hit && P.pass) { if (P.pass.bank) this.bankRedirect(); else if (!P.pass.rim) P.pass = null; }
      if (P.shot && Math.abs(P.x) > 99) this.resolveShot();
      if (this.phase !== "play") return;
    }
    P.trail.push({ x: P.x, y: P.y }); if (P.trail.length > 10) P.trail.shift();
  }
  checkLines() {
    const P = this.puck;
    const zPrev = zoneOf(this.prevPuckX), zNow = zoneOf(P.x);
    // delayed offside: attackers already in the zone must tag up before touching the puck
    const DO = this.delayedOffside;
    if (DO) {
      const d = this.dir(DO.team);
      if (d * P.x <= RINK.blueX) this.delayedOffside = null;
      else if (P.carrier && P.carrier.team === DO.team) {
        this.delayedOffside = null;
        this.teams[DO.team].offsides = (this.teams[DO.team].offsides || 0) + 1;
        this.whistle(d * 20, (P.y >= 0 ? 1 : -1) * RINK.dotY, "Offside: " + DO.name + " (" + this.teams[DO.team].team.abbr + ") didn't tag up.", "offside");
        return;
      } else if (!this.skaters.some(s => s.team === DO.team && s.state === "on" && d * s.x > RINK.blueX)) this.delayedOffside = null;
    }
    if (zNow !== 0 && zPrev === 0) {
      const ti = this.dir(0) === zNow ? 0 : 1, d = this.dir(ti);
      if (P.lastTouchTeam === ti && !(P.shot && P.shot.outcome === "goal")) {
        const off = this.skaters.find(s => s.team === ti && s.state === "on" && s !== P.carrier && d * s.x > RINK.blueX + 2.2);
        if (off) {
          if (P.carrier) {
            this.teams[ti].offsides = (this.teams[ti].offsides || 0) + 1;
            this.whistle(d * 20, (P.y >= 0 ? 1 : -1) * RINK.dotY, "Offside: " + off.p.name + " (" + this.teams[ti].team.abbr + ") was over the line early.", "offside");
            return;
          }
          this.delayedOffside = { team: ti, name: off.p.name };
        }
      }
    }
    if (!P.carrier && P.release && !P.touched && !(P.shot && P.shot.outcome === "goal")) {
      const ti = P.release.team, d = this.dir(ti);
      if (d * P.x > RINK.goalX + 0.5 && d * P.release.x < 0 && !P.release.sh && !this.shorthanded(ti)) {
        this.teams[ti].noChange = true; this.teams[ti].icings = (this.teams[ti].icings || 0) + 1;
        this.bump(1 - ti, 0.06);
        P.release = null;
        this.whistle(-d * RINK.dotX, (P.y >= 0 ? 1 : -1) * RINK.dotY, "Icing on " + this.teams[ti].team.name + ". They can't change lines.", "icing");
      }
    }
  }
  // a pass in flight is anybody's puck if it goes by their stick: opponents can pick it off or knock it down,
  // and a teammate can collect a soft one meant for somebody else
  contestPass() {
    const P = this.puck, ps = P.pass, r = ps.to;
    const x0 = this.prevPuckX ?? P.x, y0 = this.prevPuckY ?? P.y, sp = Math.hypot(P.vx, P.vy);
    if (!ps.tried) ps.tried = new Set();
    for (const o of this.skaters) {
      if (o === r || o === ps.interceptor || o === ps.from || o.state !== "on" || o.stun > 0 || o.cool > 0 || ps.tried.has(o)) continue;
      const reach = o.g === "D" ? 2.6 : 2.3, q = segDist(o.x, o.y, x0, y0, P.x, P.y);
      if (q.d > reach) continue;
      ps.tried.add(o);
      if (o.team === ps.fromTeam) {
        if (sp < 34 || !r || dist(r.x, r.y, P.x, P.y) > 18) { this.gainPossession(o, "loose"); return true; }
        continue;
      }
      // the closer to the blade and the softer the pass, the better the chance; good hands catch it clean
      const hands = this.hands(o.p), close = 1 - q.d / reach;
      const p = clamp((0.16 + close * 0.34 + (hands - 70) / 220 + (o.p.def - 70) / 300) * (sp > 55 ? 0.6 : sp > 40 ? 0.8 : 1), 0.05, 0.55);
      if (rnd() >= p) continue;
      if (sp < 48 && rnd() < 0.35 + (hands - 60) / 120) { this.log("takeaway", o.team, o.p.name + " picks off the pass" + (r ? " meant for " + r.p.name : "") + "."); this.gainPossession(o, "intercept"); return true; }
      // a stick on it: knocked down and loose
      const a = Math.atan2(P.vy, P.vx) + (rnd() - 0.5) * 2.2, v = 6 + rnd() * 10; P.vx = Math.cos(a) * v; P.vy = Math.sin(a) * v;
      P.pass = null; P.lastTouchTeam = o.team; P.touched = true; P.release = null; o.cool = 0.15;
      this.log("play", o.team, o.p.name + " gets a stick on the pass and knocks it down.");
      return true;
    }
    return false;
  }
  checkPickups(dt) {
    const P = this.puck;
    if (P.carrier || P.shot) return;
    if (P.pass && !P.pass.loose) {
      const i = P.pass.interceptor, r = P.pass.to;
      if (i && i.state === "on" && dist(i.x, i.y, P.x, P.y) < 3.2) {
        if (P.pass.knock) { // stick on puck: it squirts loose
          const a = rnd() * Math.PI * 2; P.vx = Math.cos(a) * 12; P.vy = Math.sin(a) * 12; P.pass = null; P.lastTouchTeam = i.team; P.touched = true; P.release = null;
          i.checkCool = 0.4; this.stats[i.p.id].tk += 0; return;
        }
        this.gainPossession(i, "intercept"); return;
      }
      if (r && r.state === "on" && dist(r.x, r.y, P.x, P.y) < 3.2 && r.cool <= 0) {
        // reception in traffic: whoever closed in while the puck travelled gets a stick on it
        if (!P.pass.recvChecked) {
          P.pass.recvChecked = true;
          let p = 0, who = null, bk = 0;
          for (const o of this.skaters) if (o.team !== r.team && o.state === "on" && o.stun <= 0) {
            const dd = dist(o.x, o.y, r.x, r.y);
            if (dd < 5) { const k = clamp((1 - dd / 5) * 0.55 * (2 * o.p.def * this.skill(o.p) / (o.p.def + this.r(r.p, "hnd") * this.skill(r.p))), 0, 0.7); p = 1 - (1 - p) * (1 - k); if (k > bk) { bk = k; who = o; } }
          }
          const sp = Math.hypot(P.vx, P.vy);
          p = 1 - (1 - p) * (1 - clamp((sp - 55) / 200, 0, 0.12) * (1.2 - this.hands(r.p) / 100)); // hard passes are harder to handle
          if (rnd() < p) {
            if (who && rnd() < 0.45) { this.log("takeaway", who.team, who.p.name + " lifts " + r.p.name + "'s stick and takes it."); this.gainPossession(who, "intercept"); return; }
            const a = Math.atan2(P.vy, P.vx) + (rnd() - 0.5) * 2.4; P.vx = Math.cos(a) * 10; P.vy = Math.sin(a) * 10;
            P.pass = null; P.touched = true; P.release = null; r.cool = 0.35; return;
          }
        }
        this.gainPossession(r, "pass"); return;
      }
      if (P.pass.rim) for (const o of this.skaters) if (o.state === "on" && o.stun <= 0 && o.cool <= 0 && !P.pass.tried.has(o) && dist(o.x, o.y, P.x, P.y) < 2.8) {
        P.pass.tried.add(o);
        if (o.team === P.pass.fromTeam) { this.gainPossession(o, "loose"); return; } // a teammate picks it off the wall
        if (rnd() < 0.5) { this.log("takeaway", o.team, o.p.name + " cuts off the rim along the wall."); this.gainPossession(o, "intercept"); return; }
      }
      if (!P.pass.rim && this.contestPass()) return;
      // nobody is going to get to it any more: it's a loose puck, and everyone can play it
      const rOk = r && r.state === "on" && r.stun <= 0;
      if (!rOk || (P.pass.rim && this.time - P.pass.t0 > P.pass.eta + 0.6 && dist(r.x, r.y, P.x, P.y) > 6)) { P.pass.loose = true; P.pass.to = null; P.pass.interceptor = null; if (P.pass.rim) P.pass.left = 0; }
      return;
    }
    // a clearing attempt can be knocked down: a point man holding the line, or anyone it goes right past
    if (P.pass && P.pass.clear) {
      const cl = P.pass.clear;
      for (const o of this.skaters) if (o.team !== P.pass.fromTeam && o.state === "on" && o.stun <= 0 && !cl.tried.has(o) && dist(o.x, o.y, P.x, P.y) < (o.g === "D" ? 4.6 : 3.6)) {
        cl.tried.add(o);
        const zx = this.dir(o.team) * o.x, atLine = zx > RINK.blueX - 4 && zx < RINK.blueX + 10;
        const pK = clamp((0.3 + (this.hands(o.p) - 65) / 160 + (o.g === "D" ? 0.1 : 0) + (atLine ? 0.15 : 0)) * (cl.deep ? 0.55 : 1), 0.08, 0.7);
        if (rnd() < pK) {
          P.vx *= 0.12; P.vy *= 0.12; P.pass = null; P.lastTouchTeam = o.team; P.touched = true; P.release = null;
          if (atLine) this.log("play", o.team, o.p.name + " knocks down the clear and keeps it in.");
          break;
        }
      }
    }
    const speed = Math.hypot(P.vx, P.vy);
    const reach = speed > 45 ? 1.6 : speed < 10 ? 3 : 2.6;
    const cands = this.skaters.filter(s => s.state === "on" && s.cool <= 0 && s.stun <= 0 && dist(s.x, s.y, P.x, P.y) < reach);
    // goalies stop hard rims and clears around their net and set the puck up for a defenseman
    for (let ti = 0; ti < 2; ti++) {
      const g = this.goalies[ti], d = this.dir(ti);
      if (!g || g.state !== "net" || (P.pass && !P.pass.loose) || speed < 6 || speed > 32) continue; // a hard rim or a wide shot goes right by
      // only a puck already behind the goal line and within a stride of the net: the goalie steps out and stops it where it is
      const behind = -d * P.x > RINK.goalX + 1.5 && Math.abs(P.y) < 16;
      if (behind && dist(-d * (RINK.goalX + 1), (P.y >= 0 ? 1 : -1) * 3, P.x, P.y) < 5 && !this.skaters.some(s => s.team !== ti && s.state === "on" && dist(s.x, s.y, P.x, P.y) < 9)) {
        P.pass = null; P.vx = P.vy = 0; P.touched = true; P.lastTouchTeam = ti; P.release = null;
        P.goalieSet = this.time;
        this.log("play", ti, g.p.name + " stops it behind the net and leaves it for the defense.");
        return;
      }
    }
    for (let ti = 0; ti < 2; ti++) {
      const g = this.goalies[ti];
      if (g && g.state === "net" && speed < 10 && !(P.goalieSet && this.time - P.goalieSet < 3) && dist(g.x, g.y, P.x, P.y) < 3 && !this.skaters.some(s => s.team !== ti && s.state === "on" && dist(s.x, s.y, P.x, P.y) < 5) && rnd() < 1.6 * dt) {
        this.whistle(-this.dir(ti) * RINK.dotX, (P.y >= 0 ? 1 : -1) * RINK.dotY, g.p.name + " smothers the loose puck.");
        return;
      }
    }
    if (!cands.length) {
      // only a dead puck in a scrum counts toward a whistle; a puck people are skating to doesn't
      const near = this.skaters.some(s => s.state === "on" && dist(s.x, s.y, P.x, P.y) < 7);
      if (speed < 5 && near) P.idle += dt; else P.idle = Math.max(0, P.idle - dt);
      return;
    }
    const w = cands.map(s => (this.r(s.p, "chk") * 0.35 + this.r(s.p, "skt") * 0.35 + s.p.def * 0.3) * this.skill(s.p) + (s.p.style === "Grinder" || s.p.style === "Power Forward" ? 10 : 0) + 20);
    let r = rnd() * w.reduce((a, b) => a + b, 0), k = 0;
    while (k < w.length - 1 && r > w[k]) { r -= w[k]; k++; }
    const s = cands[k];
    if (P.lastTeam !== s.team && P.lastTeam >= 0 && rnd() < 0.4) { this.stats[s.p.id].tk++; this.teams[s.team].tk++; }
    this.gainPossession(s, "loose");
  }
  checkBattles(dt) {
    const c = this.puck.carrier; if (!c) return;
    for (const o of this.skaters) {
      if (o.team === c.team || o.state !== "on" || o.checkCool > 0 || o.stun > 0) continue;
      if (dist(o.x, o.y, c.x, c.y) > 3.4) continue;
      const bd = o.bapDef && o.bapDef.until > this.time ? o.bapDef : null;
      if (bd && bd.kind === "contain") continue;
      if (!bd && rnd() > TUNE.check * dt * (this.shorthanded(o.team) ? 0.55 : 1)) continue;
      if (bd) o.bapDef = null;
      o.checkCool = 0.45;
      const so = o.p.def * this.skill(o.p), sc = (this.hands(c.p) * 0.6 + this.r(c.p, "skt") * 0.4);
      const soH = this.r(o.p, "chk") * this.skill(o.p), scH = (this.r(c.p, "skt") * 0.5 + this.r(c.p, "chk") * 0.5) * this.skill(c.p);
      const st = o.p.style;
      const nearBoards = Math.abs(c.y) > 32 || Math.abs(c.x) > 84;
      const hitBase = (this.r(o.p, "chk") - 72) / 200 + (st === "Enforcer" ? 0.8 : st === "Grinder" ? 0.7 : st === "Power Forward" || st === "Stay-at-Home" ? 0.6 : st === "Two-Way" ? 0.4 : 0.28);
      const ag = this.aggr(o.team);
      const isHit = bd ? bd.kind === "hit" : rnd() < hitBase * (nearBoards ? 1.4 : 0.7) * (0.8 + 0.4 * ag);
      const d = this.dir(c.team);
      const beaten = d * (c.x - o.x) > 0.5 && Math.hypot(c.vx, c.vy) > Math.hypot(o.vx, o.vy);
      const penP = (isHit ? 0.012 : 0.009) * TUNE.pen * (1.75 - o.p.dis / 100 * 1.25) * (this.e(o.p) < 40 ? 1.35 : 1) *
        (st === "Enforcer" ? 1.4 : st === "Grinder" ? 1.3 : st === "Power Forward" ? 1.15 : st === "Stay-at-Home" ? 1.1 : 1) * (beaten ? 1.6 : 1) * (0.85 + 0.3 * ag);
      if (rnd() < penP) {
        this.callPenalty(o, c, isHit ? PEN_BODY : beaten ? ["hooking", "tripping", "holding"] : PEN_STICK);
        if (rnd() < 0.5) { const P = this.puck; P.carrier = null; c.stun = 0.5; c.cool = 0.6; const a = rnd() * Math.PI * 2; P.vx = Math.cos(a) * 10 + c.vx * 0.4; P.vy = Math.sin(a) * 10 + c.vy * 0.4; }
        return;
      }
      if (isHit) {
        const pS = 0.42 * (2 * soH / (soH + scH)) * (c.p.style === "Power Forward" ? 0.8 : 1);
        if (rnd() < pS) {
          this.stats[o.p.id].hit++; this.teams[o.team].hits++;
          const P = this.puck; P.carrier = null; c.stun = 0.6; c.cool = 0.8;
          const a = Math.atan2(c.vy, c.vx) + (rnd() - 0.5) * 1.6; P.vx = Math.cos(a) * 12; P.vy = Math.sin(a) * 12;
          P.lastTouchTeam = c.team;
          this.log("hit", o.team, o.p.name + " lays a big hit on " + c.p.name + ".");
          this.bump(o.team, 0.07);
          this.afterHit(o, c, nearBoards);
          return;
        } else { this.stats[o.p.id].hit++; this.teams[o.team].hits++; }
      } else {
        o.anim = { k: 4, t: this.time, a: Math.atan2(this.puck.y - o.y, this.puck.x - o.x) };
        const pS = 0.3 * (2 * so / (so + sc)) * (1.25 - this.hands(c.p) / 200) * (st === "Two-Way" ? 1.15 : 1) / Math.sqrt(this.chemMult(c.team)) * (c.p.style === "Speedster" && !nearBoards ? 0.85 : 1);
        if (rnd() < pS) {
          c.cool = 0.7;
          if (rnd() < 0.5) {
            this.stats[o.p.id].tk++; this.teams[o.team].tk++;
            this.log("takeaway", o.team, o.p.name + " strips " + c.p.name + ".");
            this.gainPossession(o, "steal");
          } else {
            const P = this.puck; P.carrier = null; P.lastTouchTeam = o.team;
            const a = rnd() * Math.PI * 2; P.vx = Math.cos(a) * 14 + c.vx * 0.5; P.vy = Math.sin(a) * 14 + c.vy * 0.5;
          }
          return;
        }
      }
    }
  }

  // ---------- test tools: force situations to check them ----------
  testReady() {
    if (this.final) return "The game is over. Start a new game first.";
    if (this.phase === "shootout" || this.period >= 5) return "The shootout is already on.";
    if (this.phase === "goal" || this.phase === "postgoal") return "Wait for the faceoff after the goal.";
    if (this.phase === "intermission") this.nextPeriod();
    if (this.phase === "stoppage") { this.fight = null; this.scrum = null; this.startFaceoff(this.pendingFace.x, this.pendingFace.y, true); }
    if (this.phase === "faceoff") { this.processBench(0, true); this.processBench(1, true); this.faceTargets(); for (const s of this.skaters) { s.x = s.tx; s.y = s.ty; } this.dropPuck(); }
    return this.phase === "play" ? "" : "Can't do that right now.";
  }
  forceGoal(ti) {
    const why = this.testReady(); if (why) return why;
    const P = this.puck, d = this.dir(ti), gx = d * RINK.goalX;
    let s = P.carrier && P.carrier.team === ti ? P.carrier : null;
    if (!s) s = this.onIce(ti).filter(x => x.g === "F").sort((a, b) => dist(a.x, a.y, gx, 0) - dist(b.x, b.y, gx, 0))[0] || this.onIce(ti)[0];
    if (!s) return "No skaters on the ice.";
    P.pass = null; P.shot = null; this.gainPossession(s, "loose");
    if (this.phase !== "play") return "Can't do that right now.";
    this.takeShot(s, { forced: "goal" });
    return "Goal forced for " + this.teams[ti].team.name + ".";
  }
  forcePowerPlay(ti) {
    const why = this.testReady(); if (why) return why;
    const o = this.onIce(1 - ti).sort((a, b) => a.p.dis - b.p.dis)[0];
    if (!o) return "No skaters on the ice.";
    const v = this.onIce(ti)[0] || o;
    this.callPenalty(o, v, PEN_STICK);
    this.whistle(this.puck.x, this.puck.y, "Whistle. The penalty is called.");
    return "Power play for " + this.teams[ti].team.name + ".";
  }
  tieUp() { const m = Math.max(this.teams[0].score, this.teams[1].score); this.teams[0].score = this.teams[1].score = m; }
  forceOvertime() {
    if (this.final) return "The game is over. Start a new game first.";
    if (this.period >= 4) return this.period === 4 ? "It's already overtime." : "The shootout is already on.";
    this.tieUp(); this.period = 3; this.clock = Math.min(this.clock, 2);
    const why = this.testReady(); if (why) return why;
    return "Tied up with 2 seconds left in the 3rd. Overtime is next.";
  }
  forceShootout() {
    if (this.final) return "The game is over. Start a new game first.";
    if (this.period >= 5) return "The shootout is already on.";
    this.tieUp(); this.pendingReplay = null; this.fight = null; this.scrum = null; this.banner = null;
    this.log("period", -1, "Test tools: straight to a shootout.");
    this.shootout();
    return "Shootout started.";
  }

  // ---------- win probability (home team) ----------
  elapsed() { return this.period <= 3 ? (this.period - 1) * PERIOD_LEN + (PERIOD_LEN - this.clock) : this.playoff ? (2 + this.otN) * PERIOD_LEN + (PERIOD_LEN - Math.max(0, this.clock)) : 3 * PERIOD_LEN + (OT_LEN - Math.max(0, this.clock)); }
  winProb() {
    const [h, a] = [this.teams[0].score, this.teams[1].score];
    if (this.final) return h > a ? 1 : 0;
    const q = clamp((this.teamRating[0] - this.teamRating[1]) / 22, -0.6, 0.6);
    const pOT = clamp(0.5 + q * 0.25 + 0.02, 0.3, 0.7); // overtime and shootout lean a little to the better (and home) team
    if (this.period >= 5) return clamp(0.5 + (this.so ? (this.so.goals[0] - this.so.goals[1]) * 0.25 : 0) + q * 0.1, 0.03, 0.97);
    const base = 3.0 / 3600; // goals per second per team
    let lh = base * Math.exp(q / 2 + 0.03), la = base * Math.exp(-q / 2 - 0.03);
    if (this.period === 4) { // 3-on-3: next goal wins
      const T = Math.max(0, this.clock), r = 3.2;
      const Lh = lh * r * T, La = la * r * T, tot = Lh + La;
      const none = Math.exp(-tot);
      return clamp((tot ? Lh / tot : 0.5) * (1 - none) + none * pOT, 0.01, 0.99);
    }
    const rem = Math.max(0, this.clock + (3 - this.period) * PERIOD_LEN);
    let mh = lh * rem, ma = la * rem;
    // a power play in progress is worth about a fifth of a goal over two minutes
    const ppLeft = ti => { const O = this.teams[1 - ti]; const b = O.box.filter(x => x.active && !x.coin); return this.strength(ti) > this.strength(1 - ti) && b.length ? Math.min(...b.map(x => x.left)) : 0; };
    mh += 0.2 * ppLeft(0) / 120; ma += 0.2 * ppLeft(1) / 120;
    // an empty net late changes everything
    if (this.teams[0].pulled) { mh *= 1.6; ma += 0.6 * Math.min(rem, 120) / 120; }
    if (this.teams[1].pulled) { ma *= 1.6; mh += 0.6 * Math.min(rem, 120) / 120; }
    const pois = (m, k) => { let p = Math.exp(-m); for (let i = 1; i <= k; i++) p *= m / i; return p; };
    let win = 0, tie = 0;
    for (let i = 0; i <= 12; i++) { const pi = pois(mh, i); if (pi < 1e-7 && i > mh) break; for (let j = 0; j <= 12; j++) { const pj = pois(ma, j); const dlt = h + i - (a + j); if (dlt > 0) win += pi * pj; else if (dlt === 0) tie += pi * pj; } }
    return clamp(win + tie * pOT, 0.005, 0.995);
  }
  sampleWP(force) {
    const e = this.elapsed();
    const last = this.wp[this.wp.length - 1];
    if (!force && last && e - last.e < 15) return;
    if (last && last.e === e && !force) return;
    this.wp.push({ e, p: this.winProb(), period: this.period });
  }

  tickMomentum(dt) {
    const k = Math.exp(-dt / 22);
    this.mom[0] *= k; this.mom[1] *= k;
    // sustained possession in the attacking zone builds pressure
    const c = this.puck.carrier;
    for (let ti = 0; ti < 2; ti++) {
      const inZ = this.dir(ti) * this.puck.x > RINK.blueX && (c ? c.team === ti : this.puck.lastTeam === ti);
      this.momT[ti] = inZ ? this.momT[ti] + dt : 0;
      if (this.momT[ti] > 2.5) this.bump(ti, 0.02 * dt * Math.min(3, this.momT[ti] / 2.5));
    }
  }

  // ---------- physical play ----------
  fightiness(s) {
    const st = s.p.style;
    return (st === "Enforcer" ? 3.2 : st === "Grinder" ? 1.4 : st === "Power Forward" ? 1.2 : st === "Stay-at-Home" ? 0.9 : 0.45) * (1.65 - s.p.dis / 100);
  }
  afterHit(hitter, victim, boards) {
    const ti = victim.team, P = this.puck;
    this.out = this.out || {};
    // injuries: rare, worse into the boards, worse from the heavy hitters
    const pInj = 0.003 * (boards ? 1.7 : 1) * (hitter.p.style === "Enforcer" || hitter.p.style === "Power Forward" ? 1.3 : 1) * (victim.p.style === "Power Forward" || victim.p.style === "Enforcer" ? 0.6 : 1);
    if (rnd() < pInj && this.onIce(ti).length >= 4) {
      const back = rnd() < 0.4 && this.period < 3;
      this.out[victim.p.id] = { team: ti, name: victim.p.name, ret: back ? this.period + 1 : 99, by: hitter.p.name };
      victim.stun = 3;
      this.log("injury", ti, victim.p.name + " is slow to get up after the hit and heads down the tunnel." + (back ? " Questionable to return." : " She won't return."));
      if (boards && rnd() < 0.5) this.callPenalty(hitter, victim, ["boarding"]);
      this.whistle(P.x, P.y, "Play is stopped with " + victim.p.name + " down on the ice.");
      return;
    }
    // somebody answers for a big hit on a teammate, especially on a star
    const star = victim.p.off >= 82 || victim.p.style === "Sniper" || victim.p.style === "Playmaker";
    const mates = this.skaters.filter(x => x.team === ti && x !== victim && x.state === "on" && x.stun <= 0 && dist(x.x, x.y, victim.x, victim.y) < 22 && !this.fought.has(x.p.id))
      .sort((a, b) => this.fightiness(b) - this.fightiness(a));
    const m = mates[0]; if (!m) return;
    const blowout = this.period >= 3 && Math.abs(this.teams[0].score - this.teams[1].score) >= 3;
    const pFight = clamp(0.03 * this.fightiness(m) * (star ? 1.7 : 1) * (blowout ? 1.6 : 1), 0, 0.4);
    if (rnd() < pFight) {
      // the hitter answers, or a heavyweight steps in for them
      const opp = this.skaters.filter(x => x.team === hitter.team && x.state === "on" && !this.fought.has(x.p.id) && dist(x.x, x.y, m.x, m.y) < 25)
        .sort((a, b) => (this.fightiness(b) + (b === hitter ? 1 : 0)) - (this.fightiness(a) + (a === hitter ? 1 : 0)))[0];
      if (opp) { this.startFight(m, opp); return; }
    }
    if (rnd() < 0.03 * (1.65 - m.p.dis / 100) * (star ? 1.5 : 1)) {
      this.addFx(m, "Roughing");
      this.callPenalty(m, hitter, ["roughing"]);
    }
  }
  startFight(a, b) {
    const P = this.puck;
    this.fought.add(a.p.id); this.fought.add(b.p.id);
    this.whistle(P.x, P.y, a.p.name + " and " + b.p.name + " drop the gloves!", "fight");
    const mx = clamp((a.x + b.x) / 2, -80, 80), my = clamp((a.y + b.y) / 2, -34, 34);
    a.vx = a.vy = b.vx = b.vy = 0;
    this.addFx(a, "Fight!");
    this.fight = { a, b, x: mx, y: my, t: 0, dur: 3.5 + rnd() * 3, ang: Math.atan2(a.y - b.y, a.x - b.x) };
    const pw = s => s.p.def * 0.5 + (s.p.style === "Enforcer" ? 30 : s.p.style === "Grinder" || s.p.style === "Power Forward" ? 12 : 0) + this.e(s.p) * 0.15 + rnd() * 30;
    const wa = pw(a), wb = pw(b);
    const res = Math.abs(wa - wb) < 6 ? null : wa > wb ? a : b;
    this.fight.res = res;
    if (res) this.bump(res.team, 0.3);
    if (res) for (const s of this.skaters) if (s.team === res.team) this.energy[s.p.id] = Math.min(100 - this.fatigue[s.p.id], this.energy[s.p.id] + 6); // a lift for the bench
    for (const s of [a, b]) {
      const T = this.teams[s.team];
      T.box.push({ p: s.p, kind: "fighting", left: 300, active: true, coin: true });
      this.stats[s.p.id].pim += 5; T.pim += 5;
      this.log("penalty", s.team, s.p.name + " (" + T.team.abbr + ") 5 minutes for fighting.");
      s.state = "toBox"; s.fightT = 99;
    }
    this.fights = (this.fights || 0) + 1;
  }
  finishFight() {
    const F = this.fight, res = F.res, a = F.a, b = F.b;
    this.log("fight", -1, res ? res.p.name + " wins the fight against " + (res === a ? b : a).p.name + "." : "The linesmen step in. The fight ends in a draw.");
    if (res) this.addFx(res, "Wins the fight");
    a.fightT = b.fightT = 0; a.shove = b.shove = 0;
    this.fight = null;
  }

  // ---------- energy ----------
  tickEnergy(gdt) {
    const sk = new Map(this.skaters.map(s => [s.p.id, s]));
    for (const T of this.teams) for (const p of T.lineup.roster) {
      if (posGroup(p) === "G") continue;
      const id = p.id, s = sk.get(id);
      if (s) {
        const f = Math.hypot(s.vx, s.vy) / s.maxSpd;
        const pinned = s.state === "on" && this.dir(s.team) * this.puck.x < -RINK.blueX && !(this.puck.carrier && this.puck.carrier.team === s.team);
        const drain = (0.42 + 0.75 * f * f) * (1.32 - p.sta * 0.0065) * (this.puck.carrier === s ? 1.15 : 1) * (pinned ? 1.25 : 1);
        this.energy[id] = Math.max(5, this.energy[id] - drain * gdt);
        if (s.state === "on") {
          const st = this.stats[id], v = Math.hypot(s.vx, s.vy); s.vs = (s.vs || 0) + (v - (s.vs || 0)) * Math.min(1, gdt / CLOCK_RATE / 0.35); const mph = s.vs * MPH; // smoothed so a bump doesn't count as a sprint
          this.stats[id].toi += gdt;
          st.dist += v * gdt; // the clock runs faster than the skating, so distance is counted on the game clock like TOI
          if (mph > st.top) st.top = mph;
          if (mph >= 20 && !s.burst) { st.bursts++; s.burst = true; } else if (mph < 18) s.burst = false;
        }
        this.fatigue[id] += gdt / 60 * (0.55 - p.sta * 0.0035);
      } else {
        this.energy[id] = Math.min(100 - this.fatigue[id], this.energy[id] + (0.4 + p.sta * 0.0045) * gdt);
      }
    }
    for (let ti = 0; ti < 2; ti++) { const g = this.goalies[ti]; if (g) this.stats[g.p.id].toi += gdt; }
  }
  breather(dt) {
    for (const T of this.teams) for (const p of T.lineup.roster) this.energy[p.id] = Math.min(100 - this.fatigue[p.id], this.energy[p.id] + dt * 0.9);
  }

  // ---------- coaching ----------
  coach(gdt) {
    const P = this.puck;
    for (let ti = 0; ti < 2; ti++) {
      const T = this.teams[ti], d = this.dir(ti);
      T.fShift += gdt; T.dShift += gdt; T.stShift += gdt;
      T.changeCheck -= gdt;
      if (T.changeCheck > 0) continue;
      T.changeCheck = 1.5;
      const ourPuck = P.carrier && P.carrier.team === ti;
      const safeNow = d * P.x > -RINK.blueX && (ourPuck || d * P.x > RINK.blueX || (!P.carrier && d * P.x > 0));
      // players still out from an earlier change call head off once they're clear
      if (safeNow && (T.pendF || T.pendD)) {
        for (const g of ["F", "D"]) {
          const k = g === "F" ? "pendF" : "pendD";
          if (!T[k]) continue;
          if (!this.stragglers(ti, g).length) { T[k] = false; continue; }
          this.requestChange(ti, false, g);
        }
      }
      if (T.queue.length || this.skaters.some(s => s.team === ti && s.state === "leaving")) continue;
      // delayed penalty coming the other way: get the goalie off for a sixth attacker
      if (this.teams[1 - ti].pend.length && !T.pulled && this.goalies[ti] && this.goalies[ti].state === "net" && ourPuck && d * P.x > -20 && !this.shorthanded(ti) && this.phase === "play") {
        this.goalies[ti].state = "leaving"; this.goalies[ti].delayed = true;
        this.log("goalie", ti, this.goalies[ti].p.name + " races to the bench on the delayed penalty.");
        continue;
      }
      const deficit = this.teams[1 - ti].score - T.score;
      if (T.holdPull && !T.pulled && this.goalies[ti] && this.goalies[ti].state === "net" && this.phase === "play" && (ourPuck || d * P.x > 0) && !this.shorthanded(ti)) {
        this.goalies[ti].state = "leaving";
        this.log("goalie", ti, this.goalies[ti].p.name + " skates to the bench. The coach wants six skaters.");
        continue;
      }
      if (this.period === 3 && !T.manualPull && !T.pulled && this.goalies[ti] && this.goalies[ti].state === "net" && (deficit === 1 || deficit === 2) &&
          this.clock < (deficit === 1 ? 100 : 160) && ourPuck && d * P.x > -10 && !this.shorthanded(ti)) {
        this.goalies[ti].state = "leaving";
        this.log("goalie", ti, this.goalies[ti].p.name + " heads to the bench for an extra attacker.");
        continue;
      }
      const safe = d * P.x > -RINK.blueX && (ourPuck || d * P.x > RINK.blueX || (!P.carrier && d * P.x > 0));
      if (!safe) continue;
      const sit = this.strength(ti) > this.strength(1 - ti) ? "PP" : this.strength(ti) < this.strength(1 - ti) ? "PK" : "ES";
      let change = false;
      let group = null;
      if (sit !== T.situation) { T.stIdx = 0; T.stShift = 0; change = true; group = T.changedF ? "D" : "F"; T.changedF = !T.changedF; }
      else if (sit === "ES") {
        const fE = this.avgEnergy(ti, "F"), dE = this.avgEnergy(ti, "D");
        const fLen = [48, 44, 38, 32][T.fIdx % 4], dLen = [52, 48, 42][T.dIdx % 3];
        const wantF = T.fShift > fLen || fE < 48, wantD = T.dShift > dLen || dE < 45;
        if (wantF && (!wantD || T.fShift / fLen >= T.dShift / dLen)) { T.fIdx = this.nextUnit(ti, "F"); T.fShift = 0; change = true; group = "F"; }
        else if (wantD) { T.dIdx = this.nextUnit(ti, "D"); T.dShift = 0; change = true; group = "D"; }
      } else if (T.stShift > 55) { T.stIdx++; T.stShift = 0; change = true; group = "F"; }
      if (!change && this.onIce(ti).length + this.skaters.filter(s => s.team === ti && s.state === "leaving").length < this.strength(ti) + (T.pulled ? 1 : 0)) { change = true; group = "fill"; }
      if (change && group !== "fill") { if (group === "F") T.pendF = true; else T.pendD = true; }
      if (change && this.requestChange(ti, false, group)) {
        const lab = T.situation === "ES" ? (group === "D" ? "D pair " + (T.dIdx + 1) : "F line " + (T.fIdx + 1)) : T.situation + " unit " + (T.stIdx % 2 + 1);
        this.log("change", ti, T.team.abbr + " change on the fly: " + lab + " coming on.");
      }
    }
  }

  // ---------- replays ----------
  // what the stick is doing besides carrying: 1 = waiting for a pass, 2 = loaded up for a one-timer, 3 = active stick on the carrier
  stickState(s) {
    const P = this.puck;
    if (P.pass && P.pass.to === s && !P.pass.loose) return P.pass.ot ? 2 : 1;
    const c = P.carrier;
    if (c && c.team !== s.team && dist(c.x, c.y, s.x, s.y) < 9) return 3;
    return 0;
  }
  recordFrame() {
    const P = this.puck;
    const pas = P.pass && P.pass.to && P.pass.to !== P.pass.from ? [P.pass.tx, P.pass.ty, P.pass.saucer ? 1 : 0] : null;
    this.rec.push({ t: this.time, px: P.x, py: P.y, sh: P.shot ? 1 : 0, pas,
      s: this.skaters.map(s => [s.x, s.y, s.team, s.p, s.state === "on" ? 1 : 0, s === P.carrier ? 1 : 0, Math.round(this.energy[s.p.id]), s.fa || 0,
        s.anim ? s.anim.k : 0, s.anim ? this.time - s.anim.t : 9, s.anim ? s.anim.a : 0, this.stickState(s)]),
      g: this.goalies.filter(Boolean).map(g => [g.x, g.y, g.team, g.p, g.state === "net" ? 1 : 0, Math.atan2(P.y - g.y, P.x - g.x)]),
      fx: this.fx.map(f => [f.text, f.team, f.t, f.s ? f.s.p : null, f.x, f.y]) });
    while (this.rec.length && this.rec[0].t < this.time - 5.5) this.rec.shift();
  }
  afterStep() {
    if (this.phase === "play" || this.phase === "goal" || this.pendingReplay) this.recordFrame();
    const pr = this.pendingReplay;
    if (pr && (this.time >= pr.goalT + 1.1 || this.final || this.phase !== "goal" && this.time > pr.goalT + 0.2)) {
      const frames = this.rec.filter(f => f.t >= pr.goalT - 4.2);
      pr.ev.replay = { frames, goalT: pr.goalT, team: pr.team, gx: pr.gx, scorer: pr.scorer, start: frames.length ? frames[0].t : pr.goalT, end: frames.length ? frames[frames.length - 1].t : pr.goalT };
      this.replayReady = pr.ev; this.pendingReplay = null;
    }
  }
  // ---------- main step ----------
  step(dt) {
    if (this.moment) { if (this.bap.auto || !this.bap.moments) this.resolveMoment(null, true); else return; }
    this.stepCore(dt); this.afterStep();
    if (this.bap && this.phase === "play" && !this.moment) this.bapDefCheck();
  }
  stepCore(dt) {
    if (this.final) return;
    this.time += dt; this.phaseT += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 3.2 && this.phase !== "intermission") this.banner = null; }
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < 1.6);
    for (const k of this.skaters) { if (k.deke && this.puck.carrier !== k) k.deke = null; if (k !== this.puck.carrier && k.dekeCool > 0) k.dekeCool -= dt; }
    const gdt = dt * CLOCK_RATE;
    if (this.phase === "shootout") { this.stepShootout(dt); return; }
    if (this.phase !== "play") {
      if (this.phase === "intermission") { if (this.phaseT > 2.5 && !this.holdInt) this.nextPeriod(); return; }
      this.breather(dt);
      for (let ti = 0; ti < 2; ti++) this.processBench(ti, false);
      if (this.phase === "faceoff") {
        this.faceTargets();
        this.moveSkaters(dt);
        const settled = this.phaseT > 1.4 && this.skaters.every(s => s.state === "on" && dist(s.x, s.y, s.tx, s.ty) < 3) && !this.teams.some(T => T.queue.length) &&
          this.goalies.every(g => !g || g.state === "net");
        if (settled || this.phaseT > 8) {
          if (!settled) { for (let ti = 0; ti < 2; ti++) this.processBench(ti, true); this.faceTargets(); for (const s of this.skaters) { s.x = s.tx; s.y = s.ty; } for (const g of this.goalies) if (g) { g.state = "net"; g.x = -this.dir(g.team) * (RINK.goalX - 3); g.y = 0; } }
          this.dropPuck();
        }
        return;
      }
      for (const s of this.skaters) { if (s.state === "on") { s.tx = s.x + s.vx * 0.25; s.ty = s.y + s.vy * 0.25; } else this.offIceTarget(s); if (s.shove > 0) s.shove = Math.max(0, s.shove - dt); }
      const scuffle = (this.fight || this.scrum) ? this.stepScuffle(dt) : false;
      this.moveSkaters(dt);
      if (this.phase === "stoppage" && this.phaseT > 1.2 && !scuffle) this.startFaceoff(this.pendingFace.x, this.pendingFace.y, false);
      else if (this.phase === "goal" && this.phaseT > 3 && !this.final) { this.phase = "postgoal"; this.whistle(0, 0, null); }
      return;
    }
    this.clock -= gdt;
    this.sampleWP(false);
    this.tickMomentum(dt);
    this.tickEnergy(gdt);
    this.tickPenalties(gdt);
    this.coach(gdt);
    for (let ti = 0; ti < 2; ti++) this.processBench(ti, false);
    this.assignTargets(dt);
    this.moveSkaters(dt);
    if (this.phase !== "play") return;
    this.movePuck(dt);
    if (this.phase !== "play") return;
    this.checkLines();
    if (this.phase !== "play") return;
    this.checkPickups(dt);
    if (this.phase !== "play") return;
    this.checkBattles(dt);
    if (this.phase !== "play") return;
    const c = this.puck.carrier;
    if (c) {
      if (this.dir(c.team) * c.x > RINK.blueX) c.zoneT += dt; else c.zoneT = 0;
      if (this.dir(c.team) * c.x < -RINK.blueX) c.holdT += dt;
      if (c.dekeCool > 0) c.dekeCool -= dt;
      if (c.deke) { c.deke.t -= dt; if (c.deke.t <= 0) this.finishGoalieDeke(c); }
      else if ((c.decideT -= dt) <= 0) { const n = this.nearestOpp(c); c.decideT = this.xgAt(c.x, c.y, c.team) > 0.09 && (!n || n.d > 7) ? 0.08 + rnd() * 0.05 : (n && n.d < 6 ? 0.18 : 0.3) + rnd() * 0.12; this.carrierThink(c); }
    }
    if (this.phase === "play" && this.puck.idle > 3) { this.puck.idle = 0; const P = this.puck; this.whistle(Math.abs(P.x) > 45 ? Math.sign(P.x) * RINK.dotX : Math.sign(P.x || 1) * 20, (P.y >= 0 ? 1 : -1) * RINK.dotY, "The puck is frozen along the boards. Whistle."); }
    if (this.phase === "play" && this.clock <= 0) this.endPeriod();
  }

  endPeriod() {
    this.clock = 0;
    for (let ti = 0; ti < 2; ti++) if (this.teams[ti].pend.length) this.assessPenalties(ti);
    const [h, a] = [this.teams[0].score, this.teams[1].score];
    if (this.period >= 3 && h !== a) { this.endGame(this.period === 4 ? "OT" : "REG"); return; }
    if (this.period === 4 && this.playoff) { // playoff hockey: another full period of 5-on-5, sudden death
      this.log("period", -1, "Still tied after " + this.otName() + ". Another overtime is coming.");
      this.otN++; this.otAgain = true;
      this.phase = "intermission"; this.phaseT = 0; this.holdInt = !!this.intHold;
      this.banner = { kind: "period", title: "End of " + this.otName(this.otN - 1), sub: this.teams[0].team.abbr + " " + h + " – " + a + " " + this.teams[1].team.abbr, t: 0 };
      return;
    }
    if (this.period === 4) { this.shootout(); return; }
    this.log("period", -1, "End of the " + periodName(this.period) + " period. " + this.teams[0].team.abbr + " " + h + ", " + this.teams[1].team.abbr + " " + a + ".");
    this.phase = "intermission"; this.phaseT = 0; this.holdInt = !!this.intHold;
    this.banner = { kind: "period", title: "End of " + periodName(this.period), sub: this.teams[0].team.abbr + " " + h + " – " + a + " " + this.teams[1].team.abbr, t: 0 };
  }
  otName(n) { n = n || this.otN; return n > 1 ? n + "OT" : "OT"; }
  perName() { return this.period === 4 && this.playoff ? this.otName() : periodName(this.period); }
  nextPeriod() {
    this.holdInt = false;
    if (this.otAgain) this.otAgain = false; else this.period++;
    for (const id of Object.keys(this.out || {})) {
      const o = this.out[id];
      if (o.ret <= this.period) { delete this.out[id]; this.log("injury", o.team, o.name + " is back on the bench after being checked out."); }
    }
    this.clock = this.period === 4 && !this.playoff ? OT_LEN : PERIOD_LEN;
    this.banner = null;
    for (const T of this.teams) for (const p of T.lineup.roster) this.energy[p.id] = Math.min(100 - this.fatigue[p.id], this.energy[p.id] + 45);
    this.setupPeriod();
    this.log("period", -1, this.period === 4 ? (this.playoff ? (this.otN > 1 ? this.otName() + ": " : "Overtime: ") + "20 minutes of 5-on-5, next goal wins." : "Overtime: 5 minutes of 3-on-3, next goal wins.") : "Start of the " + periodName(this.period) + " period.");
  }
  // ---------- shootout: one shooter at a time, skating in on the goalie ----------
  shootout() {
    this.period = 5; this.phase = "shootout"; this.phaseT = 0; this.clock = 0;
    this.log("period", -1, "Still tied after overtime. Shootout.");
    this.banner = { kind: "period", title: "Shootout", sub: "Best of three, then sudden death", t: 0 };
    const rank = p => this.r(p, "sht") * 0.4 + this.hands(p) * 0.4 + this.r(p, "clu") * 0.2 + (p.style === "Sniper" ? 4 : 0) + (posGroup(p) === "D" ? -8 : 0);
    const order = this.teams.map(t => [...t.lineup.fLines.flat(), ...t.lineup.dPairs.flat()].filter(Boolean).sort((a, b) => rank(b) - rank(a)));
    for (let ti = 0; ti < 2; ti++) {
      const T = this.teams[ti]; T.pulled = false; T.box = []; T.pend = []; T.queue = [];
      this.goalies[ti] = this.makeGoalie(ti); this.goalies[ti].x = -this.dir(ti) * (RINK.goalX - 3);
    }
    this.skaters = [];
    const P = this.puck; P.carrier = null; P.pass = null; P.shot = null; P.x = 0; P.y = 0; P.vx = P.vy = 0;
    // the home team picks and shoots second
    this.so = { order, goals: [0, 0], shots: [[], []], n: [0, 0], next: 1, state: "wait", t: 0, round: 1, cur: null };
  }
  soDecided() {
    const so = this.so, [a, b] = so.n, [ga, gb] = so.goals;
    if (a <= 3 || b <= 3) {
      if (a <= 3 && b <= 3) { const leftA = 3 - a, leftB = 3 - b; if (ga > gb + leftB || gb > ga + leftA) return true; }
      if (a === 3 && b === 3 && ga !== gb) return true;
      return false;
    }
    return a === b && ga !== gb;
  }
  stepShootout(dt) {
    const so = this.so, P = this.puck; so.t += dt;
    if (so.state === "wait") {
      if (so.t < (so.n[0] + so.n[1] === 0 ? 2.2 : 1.1)) return;
      const ti = so.next, d = this.dir(ti), list = so.order[ti], p = list[so.n[ti] % list.length];
      const s = this.makeSkater(p, ti, posGroup(p) === "D" ? "D" : "F", -d * 2, 0);
      s.state = "on"; s.vx = d * 4; this.skaters = [s];
      P.carrier = s; P.x = s.x + d * 2; P.y = 0; P.pass = null; P.shot = null;
      const h = this.hands(p), g = this.goalies[1 - ti].p;
      // shoot or deke: hands against the goalie, snipers shoot
      const dekeLean = clamp(0.35 + (h - 75) / 60 + (p.style === "Sniper" ? -0.2 : p.style === "Playmaker" || p.style === "Speedster" ? 0.12 : 0), 0.1, 0.85);
      const deke = rnd() < dekeLean;
      const moves = deke ? ["backhand deke", "forehand-backhand deke", "five-hole deke"].concat(h >= 86 ? ["one-handed tuck"] : []).concat(h >= 91 ? ["spin-o-rama"] : []) : ["wrist shot", "snap shot", "glove-side snipe", "blocker-side wrister"];
      const move = moves[Math.floor(rnd() * moves.length)];
      const side = rnd() < 0.5 ? -1 : 1;
      so.cur = { s, ti, deke, move, side, release: deke ? 9 + rnd() * 4 : 16 + rnd() * 12, phase: "in", t: 0 };
      s.baLane = side * 3;
      this.log("shootout", ti, "Round " + so.round + ": " + p.name + " picks up the puck at center ice.");
      so.state = "attempt"; so.t = 0;
      return;
    }
    if (so.state === "attempt") {
      const c = so.cur, s = c.s, ti = c.ti, d = this.dir(ti), gx = d * RINK.goalX, g = this.goalies[1 - ti];
      c.t += dt;
      const dd = dist(s.x, s.y, gx, 0);
      if (c.phase === "in") {
        // a slow curl in, then straight at the goalie
        const wob = Math.sin(c.t * 1.6) * (dd > 50 ? 10 : 4);
        s.tx = gx - d * Math.max(4, c.release - 2); s.ty = c.side * 3 + wob;
        this.moveSkaters(dt); this.movePuck(dt);
        if (dd < c.release || c.t > 9) {
          if (c.deke) { c.phase = "deke"; c.t = 0; s.baLane = 0; this.addFx(s, c.move === "spin-o-rama" ? "Spin-o-rama!" : "Deke!"); }
          else this.soRelease(c);
        }
        return;
      }
      if (c.phase === "deke") {
        s.tx = gx - d * 5.5; s.ty = -c.side * 5; this.moveSkaters(dt); this.movePuck(dt);
        // the move has to finish in front of the goal line
        if (c.t > 0.55 || d * P.x > RINK.goalX - 3.5) this.soRelease(c);
        return;
      }
      if (c.phase === "flight") {
        P.x += P.vx * dt; P.y += P.vy * dt; s.tx = s.x + s.vx * 0.3; s.ty = s.y; this.moveSkaters(dt);
        if (dist(P.x, P.y, c.tx, c.ty) < 1.5 || c.t > 1.2) {
          P.vx = P.vy = 0;
          const p = s.p, gp = g.p, T = this.teams[ti];
          so.n[ti]++; so.shots[ti].push(c.scored); T.soShots.push(c.scored);
          if (c.scored) { so.goals[ti]++; this.addFx(s, "Scores!"); }
          else this.addFx(g, "Save!");
          this.log("shootout", ti, p.name + (c.scored ? " scores on " + gp.name + " with a " + c.move + "!" : "'s " + c.move + " is stopped by " + gp.name + ".") + " (" + this.teams[1].team.abbr + " " + so.goals[1] + ", " + this.teams[0].team.abbr + " " + so.goals[0] + ")");
          so.state = "result"; so.t = 0;
        }
        return;
      }
    }
    if (so.state === "result") {
      if (so.t < 1.4) { this.moveSkaters(dt); return; }
      this.skaters = []; P.carrier = null; P.x = 0; P.y = 0;
      if (this.soDecided()) {
        const w = so.goals[0] > so.goals[1] ? 0 : 1;
        this.teams[w].score++; this.teams[0].soGoals = so.goals[0]; this.teams[1].soGoals = so.goals[1];
        this.endGame("SO"); return;
      }
      so.next = 1 - so.next;
      if (so.n[0] === so.n[1]) so.round++;
      so.state = "wait"; so.t = 0;
    }
  }
  soRelease(c) {
    const P = this.puck, s = c.s, ti = c.ti, d = this.dir(ti), gx = d * RINK.goalX, g = this.goalies[1 - ti], gp = g.p, p = s.p;
    const h = this.hands(p), gs = gp.style;
    let pr;
    const cl = 1 + (this.r(p, "clu") - this.r(gp, "clu")) / 400;
    if (c.deke) pr = clamp(cl * (0.27 + (h - gp.goal) / 110 + (c.move === "spin-o-rama" ? 0.04 : c.move === "one-handed tuck" ? 0.03 : 0)) * (gs === "Butterfly" ? 1.08 : gs === "Reflex" ? 0.88 : 1), 0.08, 0.6);
    else pr = clamp(cl * 0.3 * (0.55 + this.r(p, "sht") / 133) * (p.style === "Sniper" ? 1.12 : 1) * (1 + (82 - gp.goal) * 0.02) * (gs === "Reflex" ? 1.05 : gs === "Butterfly" ? 0.95 : 1), 0.08, 0.55);
    c.scored = rnd() < pr && d * P.x < RINK.goalX - 1; // nothing counts from behind the goal line
    const ty = c.scored ? (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 1.3) : g.y + (rnd() - 0.5) * 2;
    c.tx = c.scored ? gx + d * 1.2 : g.x - d * 0.5; c.ty = ty;
    const L = dist(P.x, P.y, c.tx, c.ty) || 1, sp = c.deke ? 30 : 80;
    P.carrier = null; P.vx = (c.tx - P.x) / L * sp; P.vy = (c.ty - P.y) / L * sp;
    s.baLane = 0;
    c.phase = "flight"; c.t = 0;
  }
  endGame(how) {
    this.final = true; this.phase = "final"; this.decision = how;
    const [h, a] = [this.teams[0].score, this.teams[1].score];
    const w = h > a ? 0 : 1;
    const tail = how === "OT" ? " in overtime" : how === "SO" ? " in a shootout" : "";
    this.log("final", w, "Final: " + this.teams[w].team.name + " win " + Math.max(h, a) + "–" + Math.min(h, a) + tail + ".");
    this.banner = { kind: "final", team: w, title: "Final" + (how === "REG" ? "" : "/" + how), sub: this.teams[0].team.abbr + " " + h + " – " + a + " " + this.teams[1].team.abbr, t: 0 };
    this.stars = this.threeStars();
    this.sampleWP(true);
  }
  threeStars() {
    const list = [];
    for (const t of this.teams) for (const p of t.lineup.roster) {
      const s = this.stats[p.id]; if (!s.toi) continue;
      let v = s.g * 3.2 + s.a * 2 + s.sog * 0.25 + s.tk * 0.12 + s.blk * 0.25 + s.hit * 0.08 + s.pm * 0.3 + s.dk * 0.1;
      if (posGroup(p) === "G") v = s.sv * 0.18 - s.ga * 0.9 + (s.ga === 0 && s.sa > 10 ? 3 : 0);
      if (this.teams[t.idx].score > this.teams[1 - t.idx].score) v += 0.5;
      list.push({ p, team: t.idx, v });
    }
    return list.sort((a, b) => b.v - a.v).slice(0, 3);
  }

  // ---------- Be A Player: key moments ----------
  momentReady() { const B = this.bap; return B && B.moments && !B.auto && !this.moment && this.phase === "play" && this.time - B.last > 9 && B.n < B.cap; }
  wantMoment(s, zx, press, opts, shorth) {
    if (!this.momentReady()) return false;
    const has = k => opts.some(o => o[0] === k);
    if (zx > RINK.blueX - 2) return press > 3.5 && (has("shoot") || has("pass"));
    if (zx > -14) return press > 7 && !shorth && has("carry") && rnd() < 0.8;
    return press < 12 && has("pass") && rnd() < 0.35;
  }
  // a short description of where a teammate is, for the pass buttons
  spotName(x, y, ti) {
    const d = this.dir(ti), zx = d * x, ay = Math.abs(y);
    if (zx > RINK.goalX) return "behind the net";
    if (zx > 72 && ay < 9) return "at the net";
    if (zx > 60 && ay < 14) return "in the slot";
    if (zx > RINK.blueX && zx < 40 && ay < 26) return "at the point";
    if (zx > 60 && ay >= 14) return ay > 28 ? "low on the wall" : "at the circle";
    if (zx > RINK.blueX) return ay > 28 ? "on the half-wall" : "in the high slot";
    if (zx > -RINK.blueX) return "in the neutral zone";
    return "in the defensive zone";
  }
  openMoment(s, kind, ctx) {
    const ti = s.team, d = this.dir(ti), zx = ctx.zx, ch = [];
    const ev = k => { const o = ctx.opts.find(x => x[0] === k); return o ? o[1] : null; };
    const pct = v => Math.round(Math.max(0, Math.min(0.99, v)) * 100) + "%";
    if (ev("shoot") != null) { const m = this.shotModel(s); ch.push({ key: "shoot", label: zx < 45 ? "Shoot from distance" : "Shoot", sub: "About " + pct(m.pGoal) + " to score" + (m.screen ? " · traffic in front for a tip" : "") + (m.pBlock > 0.25 ? " · lane is crowded" : ""), ev: ev("shoot") }); }
    const pc = ctx.passCands.slice().sort((a, b) => b.ev - a.ev).slice(0, 2);
    pc.forEach((c, i) => { const open = !this.skaters.some(o => o.team !== ti && o.state === "on" && dist(o.x, o.y, c.r.x, c.r.y) < 6); ch.push({ key: "pass" + i, label: "Pass to " + c.r.p.tag, sub: this.spotName(c.r.x, c.r.y, ti) + (open ? ", open" : ", covered") + (c.tag === "cycle" ? " · cycle it" : this.puck && c.tag === "ot" ? " · one-timer" : ""), ev: c.ev * 0.97, cand: c }); });
    if (ctx.dekeInfo) ch.push({ key: "deke", label: "Deke " + ctx.dekeInfo.o.p.tag, sub: "Try a " + ctx.dekeInfo.move + " · about " + pct(ctx.dekeInfo.pS) + " to beat her", ev: ev("deke") });
    if (ctx.gdekeInfo) ch.push({ key: "gdeke", label: "Deke the goalie", sub: ctx.gdekeInfo.move + " · about " + pct(ctx.gdekeInfo.p) + " to score", ev: ev("gdeke") });
    if (ctx.wrapInfo) ch.push({ key: "wrap", label: "Wraparound", sub: "About " + pct(ctx.wrapInfo) + " to score", ev: ev("wrap") });
    if (ev("carry") != null) {
      if (zx > 52) ch.push({ key: "drive", label: "Drive the net", sub: "Take it to the crease yourself", ev: ev("carry") * (ctx.press > 9 ? 1 : 0.85) });
      else ch.push({ key: "carry", label: zx > RINK.blueX - 2 ? "Hold it and look" : zx > -14 ? "Carry it in" : "Skate it up ice", sub: zx > RINK.blueX - 2 ? "Keep the puck, wait for something better" : zx > -14 ? "Skate it over the blue line" : "Carry it out of your zone yourself", ev: ev("carry") });
    }
    if (ev("dump") != null) ch.push({ key: "dump", label: "Dump it in", sub: "Chip it deep and go get it", ev: ev("dump") });
    if (ev("rim") != null) ch.push({ key: "rim", label: "Rim it", sub: "Around the boards to a teammate", ev: ev("rim") });
    if (ev("clear") != null) ch.push({ key: "clear", label: "Clear it", sub: "Get it out of the zone", ev: ev("clear") });
    if (ch.length < 2) { this.bap.last = this.time; return this.carrierThink(s); }
    const best = ch.reduce((a, b) => b.ev > a.ev ? b : a);
    const title = kind === "attack" ? (ch.some(c => c.key === "shoot" && /\d/.test(c.sub) && parseInt(c.sub.match(/\d+/)[0]) >= 12) ? "Scoring chance!" : "You have the puck in their zone") : kind === "entry" ? "Gaining the zone" : "Breaking out";
    this.moment = { id: this.time, kind, s, ctx, choices: ch.slice(0, 5), best: best.key, title };
  }
  openBreakaway(s, alone) {
    const ti = s.team, d = this.dir(ti), g = this.goalies[1 - ti], h = this.hands(s.p);
    let mate = null;
    for (const r of this.skaters) if (r.team === ti && r !== s && r.state === "on" && d * (r.x - s.x) > -4 && Math.abs(r.y - s.y) > 10 && !this.skaters.some(o => o.team !== ti && o.state === "on" && dist(o.x, o.y, r.x, r.y) < 8)) mate = r;
    const pShot = g ? clamp(0.2 + (this.r(s.p, "sht") - g.p.goal) / 130, 0.08, 0.45) : 0.85;
    const pDeke = g ? clamp((0.3 + (h - g.p.goal) / 100) * (g.p.style === "Butterfly" ? 1.08 : 1), 0.12, 0.6) : 0.8;
    const ch = [{ key: "bshot", label: "Shoot", sub: "Pick a corner from the top of the circle · about " + Math.round(pShot * 100) + "%", ev: pShot }, { key: "bdeke", label: "Deke", sub: "Go in close and make a move · about " + Math.round(pDeke * 100) + "%", ev: pDeke * 0.95 }];
    if (mate) ch.push({ key: "bpass", label: "Pass to " + mate.p.tag, sub: "Slide it across for the tap-in", ev: Math.min(0.6, this.xgAt(mate.x, mate.y, ti) * 2.2 + 0.1) * 0.9, mate });
    const best = ch.reduce((a, b) => b.ev > a.ev ? b : a);
    this.moment = { id: this.time, kind: "breakaway", s, ctx: { alone }, choices: ch, best: best.key, title: "Breakaway!" };
  }
  // defending: the carrier is coming at you
  bapDefCheck() {
    if (!this.momentReady()) return;
    const me = this.skaters.find(x => x.p.id === this.bap.me && x.state === "on"), c = this.puck.carrier;
    if (me && c && c.team === me.team && c !== me) return this.bapOffBall(me, c);
    if (!me || !c || c.team === me.team || me.stun > 0) return;
    const d = this.dir(me.team), cz = d * c.x;
    if (cz > 15 || dist(me.x, me.y, c.x, c.y) > 9 || dist(me.x, me.y, c.x, c.y) < 3.5) return;
    if (-d * c.vx < 2) return; // she's not coming at us
    const mates = this.skaters.filter(x => x.team === me.team && x.state === "on");
    if (mates.some(x => x !== me && dist(x.x, x.y, c.x, c.y) < dist(me.x, me.y, c.x, c.y) - 1)) return;
    if (rnd() > 0.5) return;
    const soH = this.r(me.p, "chk"), scH = this.r(c.p, "skt") * 0.5 + this.r(c.p, "chk") * 0.5, so = me.p.def, sc = this.hands(c.p) * 0.6 + this.r(c.p, "skt") * 0.4;
    const pHit = clamp(0.42 * (2 * soH / (soH + scH)), 0.1, 0.8), pPoke = clamp(0.3 * (2 * so / (so + sc)) * (1.25 - this.hands(c.p) / 200), 0.08, 0.7);
    const boards = Math.abs(c.y) > 30;
    const ch = [
      { key: "hit", label: "Throw the body", sub: (boards ? "Pin her on the boards" : "Step up and hit her") + " · about " + Math.round(pHit * 100) + "% · might draw a penalty", ev: pHit * 0.045 * (boards ? 1.25 : 0.85) - 0.006 },
      { key: "poke", label: "Poke check", sub: "Go for the puck · about " + Math.round(pPoke * 100) + "%", ev: pPoke * 0.05 - 0.004 },
      { key: "contain", label: "Stay between her and the net", sub: "Take away the middle, let her go wide", ev: 0.0105 + (cz < -40 ? 0.002 : 0) }];
    const best = ch.reduce((a, b) => b.ev > a.ev ? b : a);
    this.moment = { id: this.time, kind: "defense", s: me, ctx: { c }, choices: ch, best: best.key, title: c.p.name + " is coming at you" };
  }
  // a teammate has it in their zone: where do you go?
  bapOffBall(me, c) {
    const ti = me.team, d = this.dir(ti), gx = d * RINK.goalX;
    if (d * c.x < RINK.blueX + 4 || d * me.x < RINK.blueX || rnd() > SIM_DT * 0.35 || (me.bapRun && me.bapRun.until > this.time)) return;
    const cs = c.y >= 0 ? 1 : -1;
    const open = (x, y) => { let m = 12; for (const o of this.skaters) if (o.team !== ti && o.state === "on") m = Math.min(m, dist(o.x, o.y, x, y)); return m; };
    const spot = (x, y, w) => this.xgAt(x, y, ti) * Math.min(1, open(x, y) / 8) * w;
    const ch = [
      { key: "net", label: "Crash the net", sub: "Screen the goalie, look for a tip or a rebound", x: gx - d * 5.5, y: clamp(-cs * 2, -3, 3) },
      { key: "slot", label: "Slide into the slot", sub: "Find the soft spot between the defenders", x: gx - d * 18, y: -cs * 3 },
      { key: "weak", label: "Sneak to the back door", sub: "Get open on the far side for a one-timer", x: gx - d * 10, y: -cs * 13 },
      { key: "support", label: "Support the puck", sub: "Give her a short, safe outlet", x: c.x - d * 9, y: c.y * 0.6 }];
    for (const o of ch) o.ev = o.key === "support" ? 0.022 + (open(c.x, c.y) < 6 ? 0.012 : 0) : spot(o.x, o.y, o.key === "net" ? 0.55 : 1) + (o.key === "net" ? 0.012 : 0);
    const best = ch.reduce((a, b) => b.ev > a.ev ? b : a);
    this.moment = { id: this.time, kind: "offball", s: me, ctx: { c }, choices: ch, best: best.key, title: c.p.name + " has the puck: get open" };
  }
  resolveMoment(key, auto) {
    const M = this.moment; if (!M) return;
    this.moment = null; const B = this.bap; B.last = this.time; B.n++;
    const s = M.s, best = M.choices.find(c => c.key === M.best);
    const c = M.choices.find(x => x.key === key) || best;
    const diff = best.ev - c.ev, scale = Math.max(0.006, Math.abs(best.ev));
    const q = auto ? "auto" : diff <= scale * 0.06 + 0.001 ? "great" : diff <= scale * 0.3 + 0.003 ? "good" : "risky";
    if (!auto) B.log.push({ kind: M.kind, key: c.key, q, t: this.time });
    if (!auto && s.state === "on") this.addFx(s, q === "great" ? "Great read!" : q === "good" ? "Good call" : "Risky…");
    const P = this.puck, x = M.ctx;
    if (M.kind === "defense") { s.bapDef = { kind: c.key, until: this.time + 2.6 }; return; }
    if (M.kind === "offball") { s.bapRun = { x: c.x, y: c.y, until: this.time + 3.2 }; return; }
    if (P.carrier !== s) return; // she lost it while we waited (shouldn't happen, but be safe)
    switch (c.key) {
      case "shoot": this.takeShot(s); break;
      case "pass0": case "pass1": this.passTo(s, c.cand.r, { saucer: c.cand.saucer, tag: c.cand.tag === "cycle" ? null : c.cand.tag }); if (c.cand.tag === "cycle") { const d = this.dir(s.team); s.cycleGo = { until: this.time + 2.4, x: d * (RINK.goalX - 7), y: (s.y >= 0 ? 1 : -1) * 5 }; } break;
      case "deke": this.dekeDefender(s, x.dekeInfo); break;
      case "gdeke": this.startGoalieDeke(s, x.gdekeInfo); break;
      case "wrap": this.takeShot(s, { wrap: x.wrapInfo }); break;
      case "drive": s.bapDrive = this.time + 1.5; s.decideT = 0.9; break;
      case "carry": s.decideT = 1.0; break;
      case "dump": this.dumpIn(s); break;
      case "rim": this.rimPuck(s, x.rimInfo); break;
      case "clear": this.clearPuck(s, x.shorth); break;
      case "bshot": s.baPlan = "shot"; s.baRange = 16 + rnd() * 10; s.decideT = 0.05; break;
      case "bdeke": s.baPlan = "deke"; s.baRange = 10; s.decideT = 0.05; break;
      case "bpass": if (c.mate) { this.passTo(s, c.mate, { tag: "across" }); this.log("play", s.team, s.p.name + " slides it across to " + c.mate.p.name + "."); } break;
    }
  }
  skip(mode) {
    let guard = 0;
    if (this.phase === "intermission") this.nextPeriod();
    const startP = this.period;
    while (!this.final && guard++ < 400000) {
      if (this.holdInt && this.phase === "intermission") { if (mode === "period") break; this.holdInt = false; }
      this.step(SIM_DT * 2);
      if (mode === "period" && (this.period !== startP || this.phase === "intermission")) break;
    }
  }
}
