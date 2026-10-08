const fs=require('fs'),vm=require('vm');const c={console,Math,JSON,Date,performance:{now:()=>Date.now()}};vm.createContext(c);
vm.runInContext([__dirname+'/../src/data.js',__dirname+'/../src/logo.js',__dirname+'/../src/engine.js',__dirname+'/../src/fcore.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const lg=defaultLeague();
console.log('QP teams',lg.teams.map(t=>t.abbr+':'+lg.players.filter(p=>p.team===t.id).length).join(' '),'FA',lg.players.filter(p=>p.team==='FA').length);
for(const t of lg.teams){const L=buildLineup(lg,t.id);if(!L.ok||L.problems.length)console.log('PROBLEM',t.id,L.problems)}
const F=frNew(lg,{user:'FCH',name:'t'});
console.log('cap',F.cap,'order',F.draft.order.join(','));
draftAdvance(F,true);
console.log('phase',F.phase,'days',F.S.days.length);
for(const t of F.teams){const ps=F.players.filter(p=>p.team===t.id);const cc={F:0,D:0,G:0};ps.forEach(p=>cc[posGroup(p)]++);console.log(t.abbr,ps.length,JSON.stringify(cc),'pay',frPayroll(F,t.id),'ovr',Math.round(avg(ps.map(overall))),frRosterCheck(F,t.id).join(';'))}
let tot={g:0,sog:0,pen:0,ppg:0,ot:0,so:0,n:0,eng:0,inj:0};const t0=Date.now();
while(F.phase==='season'){for(const g of frTodayGames(F)){const r=frQuickSim(F,g,false);frApply(F,g,r);tot.n++;tot.g+=r.hs+r.as;tot.sog+=r.sog[0]+r.sog[1];tot.pen+=r.pims[0]/2+r.pims[1]/2;tot.ppg+=r.goals.filter(x=>x[6]==='PP').length;tot.eng+=r.goals.filter(x=>x[6]==='EN').length;tot.ot+=r.dec==='OT';tot.so+=r.dec==='SO';tot.inj+=r.inj.length} frEndDay(F);}
console.log('ms',Date.now()-t0);for(const k in tot)if(k!=='n')console.log(k,(tot[k]/tot.n).toFixed(2));
console.log(frStandings(F).map(r=>r.id+' '+r.w+'-'+r.l+'-'+r.otl+' '+r.pts+' '+r.gf+':'+r.ga).join(' | '));
const sk=Object.entries(F.S.stats).map(([id,s])=>({p:F.players.find(x=>x.id===id),s})).filter(x=>posGroup(x.p)!=='G').sort((a,b)=>(b.s.g+b.s.a)-(a.s.g+a.s.a));
console.log(sk.slice(0,8).map(x=>x.p.name+' '+x.s.g+'+'+x.s.a+' '+(x.s.toi/x.s.gp/60).toFixed(1)+'m pm'+x.s.pm).join(' | '));
const gs=Object.entries(F.S.stats).map(([id,s])=>({p:F.players.find(x=>x.id===id),s})).filter(x=>posGroup(x.p)==='G'&&x.s.gs>3).sort((a,b)=>b.s.sv/b.s.sa-a.s.sv/a.s.sa);
console.log(gs.map(x=>x.p.name+' '+x.s.gs+'gs '+(x.s.sv/x.s.sa).toFixed(3)+' '+x.s.w+'-'+x.s.l+'-'+x.s.otl+' so'+x.s.so).join(' | '));
console.log('news',F.news.slice(0,12).map(n=>n.txt).join('\\n'));
console.log('offers',F.news.filter(n=>/trade offer/.test(n.txt)).length,'trades',F.news.filter(n=>/^Trade:/.test(n.txt)).length);
let guard=0;while(F.phase==='playoffs'&&guard++<40)frSimDay(F);
console.log('phase',F.phase,JSON.stringify(F.S.po.series.map(s=>[s.hi,s.lo,s.w,s.winner])));
console.log(JSON.stringify(F.history[0].awards.map(a=>a.name+': '+a.who+' '+a.line)));
frStartOffseason(F);console.log('dev',F.off.dev.slice(0,5).map(d=>d.pid+' '+d.from+'>'+d.to).join(', '),'expiring mine',frExpiring(F).length, 'FA',F.players.filter(p=>p.team==='FA').length);
frOpenFA(F);for(let i=0;i<3;i++)frFADay(F);frNextSeason(F);
for(const t of F.teams){console.log(t.abbr,F.players.filter(p=>p.team===t.id).length,frPayroll(F,t.id),frRosterCheck(F,t.id).join(';'))}
console.log('season',F.season,F.phase,'size',JSON.stringify(F).length);
`,c);
