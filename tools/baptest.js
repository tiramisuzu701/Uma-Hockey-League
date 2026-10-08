const fs=require('fs'),vm=require('vm');const c={console,Math,JSON,Date};vm.createContext(c);
vm.runInContext([__dirname+'/../src/data.js',__dirname+'/../src/logo.js',__dirname+'/../src/engine.js',__dirname+'/../src/fcore.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const lg=defaultLeague();
const F=bapNew(lg,{name:'Starlight Rhapsody',no:17,pos:'C',style:'Sniper',shoots:'L',sp:12},{games:28});
const me=bapMe(F);console.log('start ovr',overall(me),JSON.stringify(BAP_KEYS.map(k=>k+':'+me[k])));
for(let i=0;i<12;i++){ bapSpend(F,'skt'); bapSpend(F,'hnd'); }
console.log('after sp ovr',overall(me));
console.log('draft',JSON.stringify(bapDraft(F)),'role',bapRoleText(bapRole(F)));
let ivs=0; F.settings.stopOnOffer=false;
for(let d=0; d<28; d++){ frSimDay(F); if(F.bap.interview){ ivs++; bapAnswer(F, Math.floor(Math.random()*3)); } while(F.bap.sp>0 && !bapSpend(F,['sht','skt','hnd','pas'][d%4])); if(d===10) console.log('d10 role',bapRoleText(bapRole(F)),'trust',F.bap.trust.toFixed(1),'ovr',overall(me)); }
console.log('end reg: role',bapRoleText(bapRole(F)),'trust',F.bap.trust.toFixed(1),'hype',F.bap.hype.toFixed(1),'ovr',overall(me),'xp',F.bap.xp,'sp',F.bap.sp,'interviews',ivs);
const s=F.S.stats[F.me];console.log('stats',s&&JSON.stringify({gp:s.gp,g:s.g,a:s.a,pm:s.pm,toi:Math.round(s.toi/s.gp/60)}));
console.log('grades',F.bap.log.slice(0,15).map(e=>e.grade).join(' '));
console.log(F.news.filter(n=>n.k==='media').slice(0,6).map(n=>n.txt).join('\\n'));
let g=0;while(F.phase==='playoffs'&&g++<40)frSimDay(F);
frStartOffseason(F); console.log('career',JSON.stringify(F.bap.career[0]),'con',JSON.stringify(me.con),'offers',JSON.stringify(F.bap.offers));
console.log(bapRequestTrade(F)||'requested'); for(let i=0;i<15;i++){ bapTradeTick(F); } console.log('team now',me.team,F.user, F.news[0].txt);
console.log(bapNextSeason(F)||'next ok', F.season, F.phase, bapRoleText(bapRole(F)));
`,c);
