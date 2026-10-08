const fs=require('fs');const vm=require('vm');
const ctx={console,Math,Date,process};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/data.js','utf8')+fs.readFileSync(__dirname+'/../src/logo.js','utf8')+fs.readFileSync(__dirname+'/../src/engine.js','utf8')+fs.readFileSync(__dirname+'/../src/fcore.js','utf8')+"\nthis.defaultLeague=defaultLeague;this.frNew=frNew;this.draftAdvance=draftAdvance;this.posGroup=posGroup;this.overall=overall;",ctx);
const {defaultLeague,frNew,draftAdvance,posGroup}=ctx;
const L=defaultLeague(); const N=+process.argv[2]||200; const first=[], inTop8=[], gR1=[], gR2=[]; const names={};
for(let i=0;i<N;i++){ const F=frNew(L,{user:'ZZZ'}); draftAdvance(F,true);
  const n=F.teams.length, gp=F.draft.picks.filter(k=>posGroup(F.players.find(p=>p.id===k.pid))==='G');
  first.push(gp[0].i+1); gR1.push(gp.filter(k=>k.i<n).length); gR2.push(gp.filter(k=>k.i<2*n).length);
  const nm=F.players.find(p=>p.id===gp[0].pid).name; names[nm]=(names[nm]||0)+1; }
first.sort((a,b)=>a-b); const q=f=>first[Math.floor(f*(N-1))];
console.log('first G pick: min',first[0],'p10',q(.1),'median',q(.5),'p90',q(.9),'| top8 share',(first.filter(x=>x<=8).length/N).toFixed(2),'top10',(first.filter(x=>x<=10).length/N).toFixed(2));
console.log('avg G in R1',(gR1.reduce((a,b)=>a+b)/N).toFixed(2),'in R1-2',(gR2.reduce((a,b)=>a+b)/N).toFixed(2), names);
