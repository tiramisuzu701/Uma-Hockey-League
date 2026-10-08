const fs=require('fs'),vm=require('vm');const c={console,Math,JSON,Date,process};vm.createContext(c);
vm.runInContext([__dirname+'/../src/data.js',__dirname+'/../src/logo.js',process.env.ENG||__dirname+'/../src/engine.js',__dirname+'/../src/fcore.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const lg=defaultLeague(); let N=+process.argv[2]||4, R={n:0,stall:0,shot:0,pass:0,lost:0,deep:0,dur:0}, ex=[];
for(let gi=0;gi<N;gi++){ const g=new Game(lg,lg.teams[gi%10].id,lg.teams[(gi+3)%10].id); let guard=0, ep=null, lastZx={};
 while(!g.final&&guard++<400000){ g.step(SIM_DT); if(g.phase==='intermission'&&g.phaseT>1) g.nextPeriod();
  const P=g.puck,C=P.carrier;
  if(ep){ if(C===ep.s&&g.phase==='play'){ ep.t+=SIM_DT; const sp=Math.hypot(C.vx,C.vy); if(sp<5){ep.run+=SIM_DT; if(ep.run>ep.maxRun) ep.maxRun=ep.run;} else ep.run=0; if(g.dir(C.team)*C.x>45) ep.deep=1; if(ep.t<4&&ep.samples.length<8&&ep.t>ep.samples.length*0.5) ep.samples.push((g.dir(C.team)*C.x).toFixed(0)+','+C.y.toFixed(0)+'@'+sp.toFixed(0)+'>'+(g.dir(C.team)*C.tx).toFixed(0)+','+C.ty.toFixed(0)+'p'+(g.nearestOpp(C)?g.nearestOpp(C).d.toFixed(0):'-')+(C.deke?'DK':'')+(C.protect?'PR':'')+(C.route?':'+C.route.kind:'')+(C.wd?':wd':'')); }
   else { R.n++; R.dur+=ep.t; if(ep.maxRun>0.7){R.stall++; if(ex.length<6) ex.push(ep.samples.join(' ')+' maxStill '+ep.maxRun.toFixed(1));} R.deep+=ep.deep; const att=g.stats[ep.s.p.id].att; if(att>ep.att)R.shot++; else if(P.pass&&P.pass.from===ep.s)R.pass++; else R.lost++; ep=null; } }
  if(!ep&&C&&C.g==='D'&&g.phase==='play'){ const zx=g.dir(C.team)*C.x; const prev=lastZx[C.p.id]; if(prev!=null&&prev<25&&zx>=25) ep={s:C,t:0,run:0,maxRun:0,deep:0,att:g.stats[C.p.id].att,samples:[]}; }
  if(C) lastZx[C.p.id]=g.dir(C.team)*C.x; else lastZx={};
 } }
console.log('D carry-in entries/game',(R.n/N).toFixed(1),'avg sec after entry',(R.dur/R.n).toFixed(2),'stalled >0.7s',(R.stall/R.n*100).toFixed(0)+'%','shot',(R.shot/R.n*100).toFixed(0)+'%','pass',(R.pass/R.n*100).toFixed(0)+'%','lost/other',(R.lost/R.n*100).toFixed(0)+'%','drove below circles',(R.deep/R.n*100).toFixed(0)+'%');
ex.forEach(e=>console.log(e));
`,c);
