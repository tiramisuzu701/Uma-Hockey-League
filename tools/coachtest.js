const fs=require('fs');const vm=require('vm');
const ctx={console,Math,Date,process};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/data.js','utf8')+fs.readFileSync(__dirname+'/../src/logo.js','utf8')+fs.readFileSync(__dirname+'/../src/engine.js','utf8')+fs.readFileSync(__dirname+'/../src/fcore.js','utf8')+"\nthis.Game=Game;this.buildLineup=buildLineup;this.defaultLeague=defaultLeague;this.SIM_DT=SIM_DT;",ctx);
const {Game,defaultLeague,buildLineup,SIM_DT}=ctx;
const lg=JSON.parse(JSON.stringify(defaultLeague()));
const ids=lg.teams.map(t=>t.id).filter(id=>buildLineup(lg,id).ok);
const g=new Game(lg,ids[0],ids[1]); g.intHold=true; g.teams[0].manualPull=true; g.teams[0].manualSwap=true;
let k=0; while(!(g.phase==="intermission")&&k++<1e6) g.step(SIM_DT);
console.log('int after p',g.period,'hold',g.holdInt);
for(let i=0;i<2000;i++) g.step(SIM_DT);
console.log('still int?',g.phase,g.period);
// swap lines: move first line C to line 2
const L=g.league, tm=g.teams[0].team.id; const fw=L.players.filter(p=>p.team===tm&&p.line===1&&p.pos==='C')[0], f2=L.players.filter(p=>p.team===tm&&p.line===2&&p.pos==='C')[0];
fw.line=2; f2.line=1; g.teams[0].team.tactics={...g.teams[0].team.tactics,fc:'trap'};
g.refreshLineup(0); console.log('L1 C now',g.teams[0].lineup.fLines[0].map(p=>p.name).join(','),'tac',g.teams[0].tac.fc);
const bk=g.teams[0].lineup.goalies[1]; g.setGoalie(0,bk.id); g.nextPeriod();
console.log('goalie in net',g.goalies[0].p.name,'=',bk.name);
// pull now
for(let i=0;i<300;i++) g.step(SIM_DT);
g.coachPull(0); let pulledT=0; for(let i=0;i<4000;i++){ g.step(SIM_DT); if(g.teams[0].pulled) pulledT++; }
console.log('pulled frames',pulledT, 'onice',g.skaters.filter(s=>s.team===0&&s.state==='on').length);
g.coachPull(0,false); g.coachSwap(0); for(let i=0;i<6000;i++) g.step(SIM_DT);
console.log('net now',g.goalies[0]&&g.goalies[0].p.name,'pulled',g.teams[0].pulled, g.events.filter(e=>e.type==='goalie').slice(-4).map(e=>e.text));
g.skip('game'); console.log('final',g.final,g.teams.map(t=>t.score), 'p',g.period);
// stats sanity
console.log(Object.values(g.stats).filter(s=>s.sa).map(s=>s.sa+'/'+s.toi.toFixed(0)));
