const fs=require('fs');const vm=require('vm');
const ctx={console,Math,Date,process};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/data.js','utf8')+fs.readFileSync(__dirname+'/../src/logo.js','utf8')+fs.readFileSync(__dirname+'/../src/engine.js','utf8')+fs.readFileSync(__dirname+'/../src/fcore.js','utf8')+"\nthis.Game=Game;this.buildLineup=buildLineup;this.defaultLeague=defaultLeague;this.periodName=periodName;this.fmtClock=fmtClock;",ctx);
const {Game,defaultLeague,periodName,fmtClock,buildLineup}=ctx;
const lg=defaultLeague();
const ids=lg.teams.map(t=>t.id).filter(id=>buildLineup(lg,id).ok);
let N=+process.argv[2]||20, tot={}, n=0, wins={};
const add=(k,v)=>tot[k]=(tot[k]||0)+v;
const t0=Date.now(); let toiSample=null;
for(let i=0;i<N;i++){const h=ids[i%ids.length],a=ids[(i+1+Math.floor(i/ids.length))%ids.length]; if(h===a)continue; n++;
 const g=new Game(lg,h,a); g.skip('game');
 const T=g.teams, S=Object.values(g.stats), ev=t=>g.events.filter(e=>e.type===t).length;
 add('goals',T[0].score+T[1].score); add('sog',T[0].sog+T[1].sog); add('att',S.reduce((s,x)=>s+x.att,0));
 add('pen',ev('penalty')); add('ppg',T[0].ppG+T[1].ppG); add('shg',T[0].shG+T[1].shG); add('offside',ev('offside')); add('icing',ev('icing'));
 add('hits',T[0].hits+T[1].hits); add('tk',T[0].tk+T[1].tk); add('blk',S.reduce((s,x)=>s+x.blk,0)); add('changes',ev('change'));
 add('stops',ev('stop')); add('pulls',g.events.filter(e=>e.type==='goalie'&&/extra/.test(e.text)).length); add('ENG',g.events.filter(e=>e.type==='goal'&&/empty/.test(e.text)).length);
 add('OT',g.decision==='OT'?1:0); add('SO',g.decision==='SO'?1:0);
 const w=T[0].score>T[1].score?h:a; wins[w]=(wins[w]||0)+1;
 if(i===0){ toiSample=T[0].lineup.roster.map(p=>[p.tag,p.pos,(g.stats[p.id].toi/60).toFixed(1),g.stats[p.id].shifts,Math.round(g.energy[p.id])].join(' ')).join(' | ');
   console.log(g.events.filter(e=>['goal','penalty','offside','icing','final','goalie'].includes(e.type)).map(e=>periodName(e.period)+' '+fmtClock(e.clock)+' '+e.text).join('\n'));}
}
console.log('games',n,Object.fromEntries(Object.entries(tot).map(([k,v])=>[k,(v/n).toFixed(2)])),'ms/game',(Date.now()-t0)/n);
console.log(wins); console.log(toiSample);
