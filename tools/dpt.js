const fs=require('fs');const vm=require('vm');const c={console,Math,Date,process};vm.createContext(c);
vm.runInContext([__dirname+'/../src/data.js',__dirname+'/../src/logo.js',process.env.ENG||__dirname+'/../src/engine.js',__dirname+'/../src/fcore.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const lg=defaultLeague(); const R={ep:0,dur:0,still:0,shot:0,pass:0,lost:0,other:0,deep:0,longest:0};
const N=+process.argv[2]||3;
for(let i=0;i<N;i++){ const g=new Game(lg,lg.teams[i%8].id,lg.teams[(i+5)%8].id); let guard=0, ep=null;
 while(!g.final&&guard++<400000){ g.step(SIM_DT); if(g.phase==='intermission'&&g.phaseT>1) g.nextPeriod();
  const P=g.puck,C=P.carrier;
  if(ep){ if(C===ep.s){ ep.t+=SIM_DT; if(Math.hypot(C.vx,C.vy)<4) ep.still+=SIM_DT; const zx=g.dir(C.team)*C.x; if(zx>45) ep.deep=1; }
    else { R.ep++; R.dur+=ep.t; R.still+=ep.still; R.deep+=ep.deep; R.longest=Math.max(R.longest,ep.t);
      const att=g.stats[ep.s.p.id].att; if(att>ep.att) R.shot++; else if(P.pass&&P.pass.from===ep.s) R.pass++; else if(C&&C.team!==ep.s.team) R.lost++; else if(!C&&P.lastTouchTeam!==ep.s.team) R.lost++; else R.other++; ep=null; } }
  if(!ep&&C&&C.g==='D'&&g.phase==='play'){ const zx=g.dir(C.team)*C.x; if(zx>25&&zx<45) ep={s:C,t:0,still:0,att:g.stats[C.p.id].att,deep:0}; }
 } }
console.log('D point possessions/game',(R.ep/N).toFixed(1),'avg sec',(R.dur/R.ep).toFixed(2),'still%',(R.still/R.dur*100).toFixed(0),'longest',R.longest.toFixed(1),'| shot',(R.shot/R.ep*100).toFixed(0)+'%','pass',(R.pass/R.ep*100).toFixed(0)+'%','lost',(R.lost/R.ep*100).toFixed(0)+'%','other',(R.other/R.ep*100).toFixed(0)+'%','walked in',(R.deep/R.ep*100).toFixed(0)+'%');
`,c);
