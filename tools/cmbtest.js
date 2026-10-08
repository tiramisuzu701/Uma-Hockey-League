const fs=require('fs'),vm=require('vm');const c={console,Math,JSON,Date};vm.createContext(c);
vm.runInContext([__dirname+'/../src/data.js',__dirname+'/../src/logo.js',__dirname+'/../src/engine.js',__dirname+'/../src/fcore.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const lg=defaultLeague();
const F=bapNew(lg,{name:'Starlight Rhapsody',no:17,pos:'D',style:'Offensive',shoots:'L',sp:0},{games:14});
bapCombineSetup(F); console.log('proj',bapProjected(F).toFixed(1));
for(let i=0;i<3;i++){ bapCombineSim(F,i); const g=F.bap.combine.games[i]; console.log(JSON.stringify(g),'proj',bapProjected(F).toFixed(1),bapStockLabel(bapProjected(F))); }
const {L,home,away}=bapCombineLeague(F,0); const G=new Game(L,home,away,{bap:{me:F.me}}); console.log(G.teams.map(t=>t.team.name+' '+t.lineup.fLines.length+'/'+t.lineup.dPairs.length+'/'+t.lineup.goalies.filter(Boolean).length).join(' | '), 'me line', L.players.find(p=>p.id===F.me).line);
console.log(JSON.stringify(bapDraft(F)), F.S.days.length);
`,c);
