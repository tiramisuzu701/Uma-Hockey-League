// ---------- Default league data ----------
const LEAGUE_VERSION = 10;
// roster size every team dresses: 3 forward lines, 2 defense pairs, 2 goalies
const N_FLINES = 3, N_DPAIRS = 2;
// original sample league, still used to upgrade very old saves
const LEGACY_TEAMS = [
  { id: "SPC", name: "Spica Stars",      abbr: "SPC", color: "#2F67D8", color2: "#F5F7FF" },
  { id: "RGL", name: "Rigil Regents",    abbr: "RGL", color: "#6B33B8", color2: "#F2C14E" },
  { id: "KSM", name: "Kasamatsu Greys",  abbr: "KSM", color: "#5E6B7D", color2: "#F0B429" },
  { id: "CNP", name: "Canopus Comets",   abbr: "CNP", color: "#E86A1C", color2: "#1B2A4A" }
];

const STYLES = {
  F: ["Sniper", "Playmaker", "Power Forward", "Two-Way", "Grinder", "Speedster", "Enforcer"],
  D: ["Offensive", "Stay-at-Home", "Two-Way", "Enforcer"],
  G: ["Butterfly", "Hybrid", "Reflex"]
};
const STYLE_NOTES = {
  "Sniper": "Hunts shooting lanes and shoots first.",
  "Playmaker": "Holds the puck, finds open teammates, sets up one-timers.",
  "Power Forward": "Drives the net, wins puck battles, crashes for rebounds.",
  "Two-Way": "Reliable at both ends, strong backchecker.",
  "Grinder": "Forechecks hard, cycles along the boards, throws hits.",
  "Speedster": "Attacks with speed off the rush, gets behind defenses.",
  "Offensive": "Joins the rush, pinches, fires from the point.",
  "Stay-at-Home": "Holds the blue line, clears the crease, blocks shots.",
  "Enforcer": "Throws the biggest hits, sticks up for teammates and drops the gloves.",
  "Butterfly": "Strong on close shots, controls rebounds.",
  "Hybrid": "Balanced and steady.",
  "Reflex": "Robs one-timers and rebounds, but leaves more rebounds."
};

// [name, tag, no, team, pos, line, OFF, DEF, GOAL, SPD, STA, DIS, style, friends, circles]
const LEGACY_ROWS = [
  // Spica Stars
  ["Special Week","Spe",1,"SPC","C",1,84,68,10,82,86,82,"Two-Way","Silence Suzuka, Grass Wonder, El Condor Pasa, Seiun Sky, King Halo","Spica, Golden Gen"],
  ["Silence Suzuka","Suzuka",4,"SPC","LW",1,90,55,8,95,70,85,"Speedster","Special Week","Spica"],
  ["Tokai Teio","Teio",7,"SPC","RW",1,88,60,9,88,72,70,"Sniper","Mejiro McQueen, Symboli Rudolf, Twin Turbo, Nice Nature","Spica"],
  ["Daiwa Scarlet","Scarlet",11,"SPC","C",2,81,66,9,80,82,68,"Playmaker","Vodka","Spica"],
  ["Vodka","Vodka",12,"SPC","LW",2,80,58,8,84,74,62,"Sniper","Daiwa Scarlet","Spica"],
  ["Kitasan Black","Kitasan",17,"SPC","RW",2,82,72,10,78,92,88,"Power Forward","Satono Diamond","Spica, Kitasan Gen"],
  ["Mejiro Ryan","Ryan",13,"SPC","C",3,72,70,9,74,85,72,"Grinder","Mejiro McQueen, Mejiro Palmer","Mejiro"],
  ["Mejiro Ardan","Ardan",21,"SPC","LW",3,70,64,9,72,60,90,"Playmaker","Mejiro McQueen","Mejiro"],
  ["Satono Crown","Crown",18,"SPC","RW",3,74,68,9,76,80,80,"Two-Way","Satono Diamond","Satono, Kitasan Gen"],
  ["Mejiro McQueen","McQueen",5,"SPC","D",1,70,88,12,74,94,88,"Two-Way","Tokai Teio, Gold Ship, Mejiro Palmer, Mejiro Dober","Spica, Mejiro"],
  ["Satono Diamond","Dia",19,"SPC","D",1,72,80,10,76,84,86,"Offensive","Kitasan Black, Satono Crown","Spica, Satono"],
  ["Rice Shower","Rice",23,"SPC","D",2,66,84,11,72,92,90,"Stay-at-Home","Mihono Bourbon","Spica"],
  ["Mihono Bourbon","Bourbon",26,"SPC","D",2,64,86,12,78,90,92,"Stay-at-Home","Rice Shower","Spica"],
  ["Mejiro Bright","Bright",22,"SPC","D",3,60,78,10,60,80,94,"Stay-at-Home","","Mejiro"],
  ["Mejiro Dober","Dober",9,"SPC","D",3,70,79,11,74,78,85,"Two-Way","Mejiro McQueen","Mejiro"],
  ["Gold Ship","Golshi",31,"SPC","G",1,55,50,82,70,88,35,"Reflex","Mejiro McQueen","Spica"],
  ["Curren Chan","Curren",30,"SPC","G",2,50,52,74,72,70,80,"Hybrid","",""],

  // Rigil Regents
  ["Narita Brian","Brian",9,"RGL","C",1,89,72,9,88,88,55,"Power Forward","Biwa Hayahide","Rigil, Student Council"],
  ["Air Groove","Groove",8,"RGL","LW",1,78,80,10,82,82,90,"Two-Way","Symboli Rudolf","Rigil, Student Council"],
  ["Taiki Shuttle","Taiki",14,"RGL","RW",1,87,60,8,92,68,70,"Speedster","","Rigil"],
  ["El Condor Pasa","El",16,"RGL","C",2,83,64,9,82,80,72,"Sniper","Grass Wonder, Special Week","Rigil, Golden Gen"],
  ["Grass Wonder","Grass",18,"RGL","LW",2,78,76,10,76,86,84,"Two-Way","El Condor Pasa, Special Week","Rigil, Golden Gen"],
  ["Sakura Bakushin O","Bakushin",22,"RGL","RW",2,85,48,7,97,45,60,"Speedster","","Rigil, Sakura"],
  ["Sirius Symboli","Sirius",10,"RGL","C",3,76,70,9,80,76,66,"Power Forward","Symboli Rudolf","Symboli"],
  ["Symboli Kris S","Kris",15,"RGL","LW",3,78,66,9,74,84,78,"Sniper","","Symboli"],
  ["Fine Motion","Fine",20,"RGL","RW",3,72,70,9,76,76,88,"Playmaker","Air Shakur",""],
  ["Symboli Rudolf","Rudolf",2,"RGL","D",1,82,92,13,82,90,92,"Two-Way","Air Groove, Maruzensky, Tokai Teio, Sirius Symboli","Rigil, Student Council, Symboli"],
  ["Maruzensky","Maruzen",3,"RGL","D",1,80,82,11,92,78,76,"Offensive","Symboli Rudolf, Sakura Chiyono O","Rigil"],
  ["Hishi Amazon","Amazon",24,"RGL","D",2,70,83,11,76,84,58,"Stay-at-Home","","Rigil, Hishi"],
  ["Fuji Kiseki","Fuji",27,"RGL","D",2,68,80,12,80,78,86,"Two-Way","","Rigil"],
  ["Air Shakur","Shakur",6,"RGL","D",3,72,76,10,78,80,74,"Offensive","Fine Motion",""],
  ["Tosen Jordan","Jordan",44,"RGL","D",3,62,74,10,74,70,70,"Stay-at-Home","",""],
  ["Eishin Flash","Flash",35,"RGL","G",1,52,55,85,66,82,95,"Butterfly","","Rigil"],
  ["Yukino Bijin","Yukino",31,"RGL","G",2,48,52,72,66,86,84,"Hybrid","",""],

  // Kasamatsu Greys
  ["Oguri Cap","Oguri",6,"KSM","C",1,93,74,10,86,96,84,"Power Forward","Tamamo Cross, Super Creek, Inari One","Oguri Gen"],
  ["Tamamo Cross","Tamamo",10,"KSM","LW",1,88,66,9,88,78,66,"Sniper","Oguri Cap, Super Creek","Oguri Gen"],
  ["Super Creek","Creek",15,"KSM","RW",1,79,78,12,76,92,90,"Two-Way","Oguri Cap, Inari One, Tamamo Cross","Oguri Gen"],
  ["Inari One","Inari",13,"KSM","C",2,82,70,10,80,80,60,"Grinder","Oguri Cap, Super Creek","Oguri Gen"],
  ["Bamboo Memory","Bamboo",20,"KSM","LW",2,72,75,11,74,84,92,"Two-Way","","Oguri Gen"],
  ["Yaeno Muteki","Yaeno",21,"KSM","RW",2,76,74,10,76,82,74,"Grinder","","Oguri Gen"],
  ["Mayano Top Gun","TopGun",7,"KSM","C",3,82,66,9,84,80,72,"Playmaker","",""],
  ["Sakura Laurel","Laurel",17,"KSM","LW",3,74,66,9,76,80,84,"Two-Way","Sakura Chiyono O","Sakura"],
  ["Nakayama Festa","Festa",27,"KSM","RW",3,78,62,9,78,76,52,"Sniper","",""],
  ["Narita Taishin","Taishin",4,"KSM","D",1,74,80,11,80,74,64,"Offensive","Winning Ticket, Biwa Hayahide","BNW"],
  ["Winning Ticket","Ticket",44,"KSM","D",1,72,78,10,82,80,74,"Two-Way","Narita Taishin, Biwa Hayahide","BNW"],
  ["Sakura Chiyono O","Chiyono",28,"KSM","D",2,65,76,10,80,70,86,"Two-Way","Maruzensky, Sakura Laurel","Sakura"],
  ["Marvelous Sunday","Sunday",29,"KSM","D",2,63,77,11,70,82,80,"Stay-at-Home","","Oguri Gen"],
  ["Gold City","GoldCity",5,"KSM","D",3,70,78,10,76,80,68,"Offensive","",""],
  ["Kawakami Princess","Princess",2,"KSM","D",3,62,76,10,72,78,72,"Stay-at-Home","",""],
  ["Biwa Hayahide","Biwa",30,"KSM","G",1,50,58,88,64,86,94,"Butterfly","Narita Brian, Narita Taishin, Winning Ticket","BNW"],
  ["Matikanefukukitaru","Fuku",35,"KSM","G",2,45,52,74,66,74,80,"Reflex","Matikanetannhauser","Matikane"],

  // Canopus Comets
  ["Twin Turbo","Turbo",3,"CNP","C",1,80,40,7,90,35,62,"Speedster","Nice Nature, Ikuno Dictus, Matikanetannhauser, Tokai Teio","Canopus"],
  ["Nice Nature","Nature",5,"CNP","LW",1,72,74,11,74,84,88,"Two-Way","Twin Turbo, Ikuno Dictus, Matikanetannhauser, Tokai Teio","Canopus"],
  ["Matikanetannhauser","Mambo",25,"CNP","RW",1,66,68,10,72,82,84,"Grinder","Twin Turbo, Nice Nature, Ikuno Dictus","Canopus, Matikane"],
  ["Haru Urara","Urara",1,"CNP","C",2,55,60,9,66,88,92,"Grinder","",""],
  ["King Halo","King",8,"CNP","LW",2,74,62,9,76,72,76,"Playmaker","Seiun Sky, Special Week","Golden Gen"],
  ["Seiun Sky","Sky",33,"CNP","RW",2,83,65,10,84,76,70,"Sniper","King Halo, Nishino Flower, Special Week","Golden Gen"],
  ["Jungle Pocket","Pocket",11,"CNP","C",3,80,66,9,84,80,58,"Power Forward","Agnes Tachyon, Manhattan Cafe","2001 Gen"],
  ["Agnes Digital","Digital",14,"CNP","LW",3,76,70,10,78,78,82,"Playmaker","","Agnes"],
  ["Smart Falcon","Falcon",9,"CNP","RW",3,78,58,8,86,76,74,"Speedster","","Dirt"],
  ["Ikuno Dictus","Dictus",2,"CNP","D",1,70,82,12,70,80,94,"Stay-at-Home","Twin Turbo, Nice Nature, Matikanetannhauser","Canopus"],
  ["Agnes Tachyon","Tachyon",6,"CNP","D",1,78,72,11,86,60,48,"Offensive","Manhattan Cafe, Jungle Pocket","Agnes, 2001 Gen"],
  ["Mejiro Palmer","Palmer",7,"CNP","D",2,74,70,10,82,84,74,"Offensive","Daitaku Helios, Mejiro McQueen","Mejiro"],
  ["Daitaku Helios","Helios",77,"CNP","D",2,76,66,9,82,80,66,"Offensive","Mejiro Palmer",""],
  ["Nishino Flower","Flower",4,"CNP","D",3,60,72,10,74,70,96,"Two-Way","Seiun Sky",""],
  ["Meisho Doto","Doto",22,"CNP","D",3,66,84,12,68,90,84,"Stay-at-Home","T.M. Opera O","1999 Gen"],
  ["Manhattan Cafe","Cafe",39,"CNP","G",1,48,56,83,72,84,88,"Reflex","Agnes Tachyon, Jungle Pocket","2001 Gen"],
  ["Hishi Akebono","Akebono",30,"CNP","G",2,50,60,76,60,82,78,"Butterfly","","Hishi"],

  // Free agents
  ["T.M. Opera O","Opera",1,"FA","C",0,86,70,9,82,88,70,"Playmaker","Admire Vega, Narita Top Road, Meisho Doto","1999 Gen"],
  ["Admire Vega","Vega",2,"FA","RW",0,80,72,10,80,80,86,"Sniper","T.M. Opera O, Narita Top Road","1999 Gen"],
  ["Narita Top Road","TopRoad",3,"FA","LW",0,79,70,9,78,84,84,"Two-Way","T.M. Opera O, Admire Vega","1999 Gen"],
  ["Duramente","Duramente",4,"FA","C",0,85,66,9,86,78,60,"Power Forward","","Kitasan Gen"],
  ["Cheval Grand","Cheval",5,"FA","RW",0,78,70,9,76,88,80,"Two-Way","Vivlos","Kitasan Gen"],
  ["Vivlos","Vivlos",6,"FA","LW",0,74,64,9,80,72,78,"Playmaker","Cheval Grand",""],
  ["Copano Rickey","Rickey",7,"FA","C",0,72,70,9,74,80,64,"Grinder","","Dirt"],
  ["Hokko Tarumae","Taru",8,"FA","D",0,66,80,10,72,84,70,"Stay-at-Home","","Dirt"],
  ["Hishi Miracle","Miracle",9,"FA","D",0,64,78,10,70,82,74,"Two-Way","","Hishi"],
  ["Zenno Rob Roy","RobRoy",10,"FA","RW",0,74,68,9,72,82,88,"Playmaker","",""],
  ["Tap Dance City","TapDance",11,"FA","LW",0,76,60,8,80,78,66,"Speedster","",""],
  ["Daring Tact","Tact",12,"FA","D",0,70,76,10,78,76,82,"Offensive","",""]
];

// Hands: puck skill for dekes, dangles, saucer passes and protecting the puck
const HANDS = {
  "Tokai Teio": 92, "Seiun Sky": 90, "T.M. Opera O": 90, "El Condor Pasa": 88, "Tamamo Cross": 88, "Maruzensky": 87,
  "Oguri Cap": 86, "Silence Suzuka": 85, "Narita Brian": 85, "Agnes Tachyon": 84, "Taiki Shuttle": 84, "Mayano Top Gun": 84,
  "Symboli Rudolf": 84, "Duramente": 84, "Fine Motion": 83, "Nakayama Festa": 83, "Vodka": 82, "Agnes Digital": 82,
  "Sirius Symboli": 82, "Satono Diamond": 82, "Admire Vega": 82, "Jungle Pocket": 81, "Special Week": 80, "Daiwa Scarlet": 80,
  "Smart Falcon": 80, "Tap Dance City": 80, "Mejiro Ardan": 80, "Daitaku Helios": 79, "Air Groove": 78, "Kitasan Black": 76,
  "Twin Turbo": 74, "Nice Nature": 74, "Mejiro Palmer": 74, "Sakura Bakushin O": 70, "Matikanetannhauser": 64, "Haru Urara": 58
};
function deriveHands(p) {
  if (p.pos === "G") return 50;
  return Math.round(p.pos === "D" ? p.off * 0.75 + 10 : p.off * 0.85 + 6);
}
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
}
function splitList(s) {
  if (Array.isArray(s)) return s.map(x => String(x).trim()).filter(Boolean);
  return String(s || "").split(/[,;]/).map(x => x.trim()).filter(Boolean);
}
function rowToPlayer(r, id) {
  return { id, name: r[0], tag: r[1], no: r[2], team: r[3], pos: r[4], line: r[5],
    off: r[6], def: r[7], goal: r[8], spd: r[9], sta: r[10], dis: r[11], style: r[12],
    friends: splitList(r[13]), groups: splitList(r[14]), hnd: 0 };
}
// The base league: the teams built by the league's owners
const BASE_LEAGUE = {"players":[{"def":95,"dis":92,"friends":[],"goal":10,"groups":["Mejiro"],"hnd":73,"id":"p-muvxenvx","line":3,"name":"Mejiro Ramonu","no":1,"off":73,"pos":"D","spd":81,"sta":90,"style":"Stay-at-Home","tag":"Ramonu","team":"T3","side":"R"},{"def":91,"dis":82,"friends":[],"goal":10,"groups":["Gold Clan"],"hnd":71,"id":"p-muvxcrfi","line":1,"name":"Fenomeno","no":72,"off":72,"pos":"D","spd":79,"sta":87,"style":"Two-Way","tag":"Fenome","team":"T3","side":"L"},{"def":85,"dis":75,"friends":[],"goal":10,"groups":["Miracle"],"hnd":65,"id":"p-muvx422o","line":1,"name":"K.S. Miracle","no":65,"off":67,"pos":"D","spd":74,"sta":81,"style":"Two-Way","tag":"K.S. Mira","team":"T2","side":"R"},{"def":73,"dis":65,"friends":[],"goal":10,"groups":[],"hnd":79,"id":"p-muvx17yz","line":2,"name":"Buena Vista","no":53,"off":81,"pos":"LW","spd":85,"sta":79,"style":"Playmaker","tag":"Buena","team":"T2","side":""},{"def":62,"dis":70,"friends":[],"goal":10,"groups":[],"hnd":85,"id":"p-muvwzwmm","line":1,"name":"Calstone Light O","no":8,"off":84,"pos":"RW","spd":95,"sta":75,"style":"Speedster","tag":"Light O","team":"T2","side":""},{"def":73,"dis":82,"friends":["Symboli Rudolf","Maruzensky","Mr. C.B."],"goal":10,"groups":["Student Council"],"hnd":85,"id":"p-muvwj6id","line":1,"name":"Katsuragi Ace","no":1,"off":91,"pos":"RW","spd":87,"sta":90,"style":"Sniper","tag":"Ace","team":"T1"},{"def":84,"dis":82,"friends":["Silence Suzuka","Grass Wonder","El Condor Pasa","Seiun Sky","King Halo"],"goal":10,"groups":["Spica","Golden Gen"],"hnd":75,"id":"special-week","line":2,"name":"Special Week","no":2,"off":74,"pos":"D","spd":82,"sta":86,"style":"Two-Way","tag":"Spe","team":"T3","side":"R"},{"def":55,"dis":85,"friends":["Special Week"],"goal":8,"groups":["Spica"],"hnd":85,"id":"silence-suzuka","line":1,"name":"Silence Suzuka","no":4,"off":90,"pos":"C","spd":95,"sta":70,"style":"Speedster","tag":"Suzuka","team":"T4","side":""},{"def":60,"dis":70,"friends":["Mejiro McQueen","Symboli Rudolf","Twin Turbo","Nice Nature"],"goal":9,"groups":["Spica"],"hnd":92,"id":"tokai-teio","line":1,"name":"Tokai Teio","no":7,"off":88,"pos":"LW","spd":88,"sta":72,"style":"Sniper","tag":"Teio","team":"T1"},{"def":66,"dis":68,"friends":["Vodka"],"goal":9,"groups":["Spica"],"hnd":80,"id":"daiwa-scarlet","line":2,"name":"Daiwa Scarlet","no":11,"off":81,"pos":"D","spd":80,"sta":82,"style":"Two-Way","tag":"Scarlet","team":"T4","side":"L"},{"def":58,"dis":62,"friends":["Daiwa Scarlet"],"goal":8,"groups":["Spica"],"hnd":82,"id":"vodka","line":2,"name":"Vodka","no":12,"off":80,"pos":"D","spd":84,"sta":74,"style":"Two-Way","tag":"Vodka","team":"T4","side":"R"},{"def":72,"dis":88,"friends":["Satono Diamond"],"goal":10,"groups":["Spica","Kitasan Gen"],"hnd":76,"id":"kitasan-black","line":1,"name":"Kitasan Black","no":17,"off":82,"pos":"RW","spd":78,"sta":92,"style":"Power Forward","tag":"Kitasan","team":"T3","side":""},{"def":88,"dis":88,"friends":["Tokai Teio","Gold Ship","Mejiro Palmer","Mejiro Dober"],"goal":12,"groups":["Spica","Mejiro"],"hnd":63,"id":"mejiro-mcqueen","line":2,"name":"Mejiro McQueen","no":5,"off":70,"pos":"RW","spd":74,"sta":94,"style":"Two-Way","tag":"McQueen","team":"T2","side":""},{"def":80,"dis":86,"friends":["Kitasan Black","Satono Crown"],"goal":10,"groups":["Spica","Satono"],"hnd":82,"id":"satono-diamond","line":1,"name":"Satono Diamond","no":19,"off":72,"pos":"LW","spd":76,"sta":84,"style":"Two-Way","tag":"Dia","team":"T3","side":""},{"def":84,"dis":90,"friends":["Mihono Bourbon"],"goal":11,"groups":["Spica"],"hnd":60,"id":"rice-shower","line":0,"name":"Rice Shower","no":23,"off":66,"pos":"D","spd":72,"sta":92,"style":"Stay-at-Home","tag":"Rice","team":"T2","side":""},{"def":72,"dis":92,"friends":["Rice Shower"],"goal":12,"groups":["Spica"],"hnd":84,"id":"mihono-bourbon","line":1,"name":"Mihono Bourbon","no":26,"off":83,"pos":"C","spd":84,"sta":90,"style":"Power Forward","tag":"Bourbon","team":"T2","side":""},{"def":50,"dis":35,"friends":["Mejiro McQueen"],"goal":82,"groups":["Spica"],"hnd":50,"id":"gold-ship","line":1,"name":"Gold Ship","no":31,"off":55,"pos":"G","spd":70,"sta":88,"style":"Reflex","tag":"Golshi","team":"T4","side":""},{"def":72,"dis":55,"friends":["Biwa Hayahide"],"goal":9,"groups":["Rigil","Student Council"],"hnd":85,"id":"narita-brian","line":1,"name":"Narita Brian","no":9,"off":89,"pos":"C","spd":88,"sta":88,"style":"Power Forward","tag":"Brian","team":"T3","side":""},{"def":80,"dis":90,"friends":["Symboli Rudolf"],"goal":10,"groups":["Rigil","Student Council"],"hnd":78,"id":"air-groove","line":1,"name":"Air Groove","no":8,"off":78,"pos":"D","side":"L","spd":82,"sta":82,"style":"Two-Way","tag":"Groove","team":"T1"},{"def":81,"dis":70,"friends":[],"goal":8,"groups":["Rigil"],"hnd":84,"id":"taiki-shuttle","line":4,"name":"Taiki Shuttle","no":14,"off":79,"pos":"C","spd":92,"sta":68,"style":"Two-Way","tag":"Taiki","team":"T2","side":""},{"def":64,"dis":72,"friends":["Grass Wonder","Special Week"],"goal":9,"groups":["Rigil","Golden Gen"],"hnd":88,"id":"el-condor-pasa","line":2,"name":"El Condor Pasa","no":16,"off":83,"pos":"RW","spd":82,"sta":80,"style":"Sniper","tag":"El","team":"T4","side":""},{"def":76,"dis":84,"friends":["El Condor Pasa","Special Week"],"goal":10,"groups":["Rigil","Golden Gen"],"hnd":72,"id":"grass-wonder","line":2,"name":"Grass Wonder","no":18,"off":78,"pos":"D","spd":76,"sta":86,"style":"Two-Way","tag":"Grass","team":"T3","side":"L"},{"def":48,"dis":60,"friends":[],"goal":7,"groups":["Rigil","Sakura"],"hnd":70,"id":"sakura-bakushin-o","line":3,"name":"Sakura Bakushin O","no":22,"off":85,"pos":"C","spd":97,"sta":45,"style":"Speedster","tag":"Bakushin","team":"T4","side":""},{"def":92,"dis":92,"friends":["Air Groove","Maruzensky","Tokai Teio","Sirius Symboli"],"goal":13,"groups":["Rigil","Student Council","Symboli"],"hnd":84,"id":"symboli-rudolf","line":1,"name":"Symboli Rudolf","no":2,"off":82,"pos":"C","spd":82,"sta":90,"style":"Playmaker","tag":"Rudolf","team":"T1"},{"def":82,"dis":76,"friends":["Symboli Rudolf","Sakura Chiyono O"],"goal":11,"groups":["Rigil"],"hnd":87,"id":"maruzensky","line":1,"name":"Maruzensky","no":3,"off":80,"pos":"LW","spd":92,"sta":78,"style":"Speedster","tag":"Maruzen","team":"T2","side":""},{"def":83,"dis":58,"friends":[],"goal":11,"groups":["Rigil","Hishi"],"hnd":63,"id":"hishi-amazon","line":3,"name":"Hishi Amazon","no":24,"off":70,"pos":"D","side":"L","spd":76,"sta":84,"style":"Stay-at-Home","tag":"Amazon","team":"T1"},{"def":85,"dis":86,"friends":[],"goal":12,"groups":["Rigil"],"hnd":61,"id":"fuji-kiseki","line":3,"name":"Fuji Kiseki","no":27,"off":68,"pos":"D","side":"R","spd":80,"sta":78,"style":"Stay-at-Home","tag":"Fuji","team":"T1"},{"def":55,"dis":95,"friends":[],"goal":85,"groups":["Rigil"],"hnd":50,"id":"eishin-flash","line":0,"name":"Eishin Flash","no":35,"off":52,"pos":"G","spd":66,"sta":82,"style":"Butterfly","tag":"Flash","team":"FA"},{"def":74,"dis":84,"friends":["Tamamo Cross","Super Creek","Inari One"],"goal":10,"groups":["Oguri Gen"],"hnd":86,"id":"oguri-cap","line":3,"name":"Oguri Cap","no":6,"off":93,"pos":"LW","spd":86,"sta":96,"style":"Power Forward","tag":"Oguri","team":"T1"},{"def":66,"dis":66,"friends":["Oguri Cap","Super Creek"],"goal":9,"groups":["Oguri Gen"],"hnd":88,"id":"tamamo-cross","line":3,"name":"Tamamo Cross","no":10,"off":88,"pos":"C","spd":88,"sta":78,"style":"Sniper","tag":"Tamamo","team":"T2","side":""},{"def":78,"dis":90,"friends":["Oguri Cap","Inari One","Tamamo Cross"],"goal":12,"groups":["Oguri Gen"],"hnd":73,"id":"super-creek","line":3,"name":"Super Creek","no":15,"off":79,"pos":"C","spd":76,"sta":92,"style":"Two-Way","tag":"Creek","team":"T1"},{"def":70,"dis":60,"friends":["Oguri Cap","Super Creek"],"goal":10,"groups":["Oguri Gen"],"hnd":76,"id":"inari-one","line":4,"name":"Inari One","no":13,"off":82,"pos":"LW","spd":80,"sta":80,"style":"Grinder","tag":"Inari","team":"T1"},{"def":75,"dis":92,"friends":[],"goal":11,"groups":["Oguri Gen"],"hnd":67,"id":"bamboo-memory","line":4,"name":"Bamboo Memory","no":20,"off":72,"pos":"RW","spd":74,"sta":84,"style":"Two-Way","tag":"Bamboo","team":"T1"},{"def":74,"dis":74,"friends":[],"goal":10,"groups":["Oguri Gen"],"hnd":71,"id":"yaeno-muteki","line":4,"name":"Yaeno Muteki","no":18,"off":76,"pos":"C","spd":76,"sta":82,"style":"Grinder","tag":"Yaeno","team":"T1"},{"def":80,"dis":64,"friends":["Winning Ticket","Biwa Hayahide"],"goal":11,"groups":["BNW"],"hnd":66,"id":"narita-taishin","line":4,"name":"Narita Taishin","no":4,"off":74,"pos":"C","spd":80,"sta":74,"style":"Two-Way","tag":"Taishin","team":"T3","side":""},{"def":78,"dis":74,"friends":["Narita Taishin","Biwa Hayahide"],"goal":10,"groups":["BNW"],"hnd":64,"id":"winning-ticket","line":4,"name":"Winning Ticket","no":44,"off":72,"pos":"RW","spd":82,"sta":80,"style":"Two-Way","tag":"Ticket","team":"T3","side":""},{"def":76,"dis":86,"friends":["Maruzensky","Sakura Laurel"],"goal":10,"groups":["Sakura"],"hnd":59,"id":"sakura-chiyono-o","line":2,"name":"Sakura Chiyono O","no":28,"off":65,"pos":"D","spd":80,"sta":70,"style":"Two-Way","tag":"Chiyono","team":"T2","side":"L"},{"def":77,"dis":80,"friends":[],"goal":11,"groups":["Oguri Gen"],"hnd":57,"id":"marvelous-sunday","line":0,"name":"Marvelous Sunday","no":29,"off":63,"pos":"D","spd":70,"sta":82,"style":"Stay-at-Home","tag":"Sunday","team":"FA"},{"def":58,"dis":94,"friends":["Narita Brian","Narita Taishin","Winning Ticket"],"goal":88,"groups":["BNW"],"hnd":50,"id":"biwa-hayahide","line":1,"name":"Biwa Hayahide","no":30,"off":50,"pos":"G","spd":64,"sta":86,"style":"Butterfly","tag":"Biwa","team":"T2","side":""},{"def":40,"dis":62,"friends":["Nice Nature","Ikuno Dictus","Matikanetannhauser","Tokai Teio"],"goal":7,"groups":["Canopus"],"hnd":74,"id":"twin-turbo","line":2,"name":"Twin Turbo","no":2,"off":80,"pos":"C","spd":90,"sta":35,"style":"Speedster","tag":"Turbo","team":"T2","side":""},{"def":74,"dis":88,"friends":["Twin Turbo","Ikuno Dictus","Matikanetannhauser","Tokai Teio"],"goal":11,"groups":["Canopus"],"hnd":74,"id":"nice-nature","line":4,"name":"Nice Nature","no":5,"off":72,"pos":"RW","spd":74,"sta":84,"style":"Two-Way","tag":"Nature","team":"T4","side":""},{"def":68,"dis":84,"friends":["Twin Turbo","Nice Nature","Ikuno Dictus"],"goal":10,"groups":["Canopus","Matikane"],"hnd":64,"id":"matikanetannhauser","line":0,"name":"Matikanetannhauser","no":25,"off":66,"pos":"RW","spd":72,"sta":82,"style":"Grinder","tag":"Mambo","team":"FA"},{"def":60,"dis":92,"friends":[],"goal":9,"groups":["Canopus"],"hnd":58,"id":"haru-urara","line":0,"name":"Haru Urara","no":1,"off":55,"pos":"C","spd":66,"sta":88,"style":"Grinder","tag":"Urara","team":"T4","side":""},{"def":62,"dis":76,"friends":["Seiun Sky","Special Week"],"goal":9,"groups":["Golden Gen"],"hnd":69,"id":"king-halo","line":2,"name":"King Halo","no":8,"off":74,"pos":"RW","spd":76,"sta":72,"style":"Playmaker","tag":"King","team":"T1"},{"def":65,"dis":70,"friends":["King Halo","Nishino Flower","Special Week"],"goal":10,"groups":["Golden Gen"],"hnd":90,"id":"seiun-sky","line":0,"name":"Seiun Sky","no":33,"off":83,"pos":"D","spd":84,"sta":76,"style":"Offensive","tag":"Sky","team":"T1"},{"def":82,"dis":94,"friends":["Twin Turbo","Nice Nature","Matikanetannhauser"],"goal":12,"groups":["Canopus"],"hnd":63,"id":"ikuno-dictus","line":0,"name":"Ikuno Dictus","no":2,"off":70,"pos":"D","spd":70,"sta":80,"style":"Stay-at-Home","tag":"Dictus","team":"FA"},{"def":72,"dis":48,"friends":["Manhattan Cafe","Jungle Pocket"],"goal":11,"groups":["Canopus","Agnes","2001 Gen"],"hnd":84,"id":"agnes-tachyon","line":0,"name":"Agnes Tachyon","no":6,"off":78,"pos":"D","spd":86,"sta":60,"style":"Offensive","tag":"Tachyon","team":"T1"},{"def":70,"dis":74,"friends":["Daitaku Helios","Mejiro McQueen"],"goal":10,"groups":["Mejiro"],"hnd":74,"id":"mejiro-palmer","line":0,"name":"Mejiro Palmer","no":7,"off":74,"pos":"LW","spd":82,"sta":84,"style":"Two-Way","tag":"Palmer","team":"T3","side":""},{"def":66,"dis":66,"friends":["Mejiro Palmer"],"goal":9,"groups":["Canopus"],"hnd":79,"id":"daitaku-helios","line":0,"name":"Daitaku Helios","no":77,"off":76,"pos":"C","spd":82,"sta":80,"style":"Two-Way","tag":"Helios","team":"T3","side":""},{"def":56,"dis":88,"friends":["Agnes Tachyon","Jungle Pocket"],"goal":83,"groups":["Canopus","2001 Gen"],"hnd":50,"id":"manhattan-cafe","line":0,"name":"Manhattan Cafe","no":39,"off":48,"pos":"G","spd":72,"sta":84,"style":"Hybrid","tag":"Cafe","team":"T1"},{"def":70,"dis":70,"friends":["Admire Vega","Narita Top Road","Meisho Doto"],"goal":9,"groups":["1999 Gen"],"hnd":90,"id":"t-m-opera-o","line":2,"name":"T.M. Opera O","no":1,"off":86,"pos":"C","spd":82,"sta":88,"style":"Playmaker","tag":"Opera","team":"T1"},{"def":72,"dis":86,"friends":["T.M. Opera O","Narita Top Road"],"goal":10,"groups":["1999 Gen"],"hnd":82,"id":"admire-vega","line":2,"name":"Admire Vega","no":3,"off":80,"pos":"LW","spd":80,"sta":80,"style":"Sniper","tag":"Vega","team":"T3","side":""},{"def":70,"dis":84,"friends":["T.M. Opera O","Admire Vega"],"goal":9,"groups":["1999 Gen"],"hnd":73,"id":"narita-top-road","line":2,"name":"Narita Top Road","no":5,"off":79,"pos":"RW","spd":78,"sta":84,"style":"Two-Way","tag":"TopRoad","team":"T3","side":""},{"def":66,"dis":72,"friends":[],"goal":9,"groups":[],"hnd":84,"id":"mayano-top-gun","line":3,"name":"Mayano Top Gun","no":7,"off":82,"pos":"RW","spd":84,"sta":80,"style":"Playmaker","tag":"TopGun","team":"T2","side":""},{"def":70,"dis":82,"friends":[],"goal":10,"groups":["Agnes"],"hnd":82,"id":"agnes-digital","line":2,"name":"Agnes Digital","no":14,"off":76,"pos":"C","spd":78,"sta":78,"style":"Playmaker","tag":"Digital","team":"T3","side":""},{"def":58,"dis":74,"friends":[],"goal":8,"groups":["Dirt"],"hnd":80,"id":"smart-falcon","line":0,"name":"Smart Falcon","no":9,"off":78,"pos":"RW","spd":86,"sta":76,"style":"Speedster","tag":"Falcon","team":"FA"},{"def":72,"dis":96,"friends":["Seiun Sky"],"goal":10,"groups":[],"hnd":55,"id":"nishino-flower","line":0,"name":"Nishino Flower","no":2,"off":60,"pos":"D","spd":74,"sta":70,"style":"Two-Way","tag":"Flower","team":"T4","side":""},{"def":74,"dis":84,"friends":["T.M. Opera O"],"goal":12,"groups":["1999 Gen"],"hnd":72,"id":"meisho-doto","line":2,"name":"Meisho Doto","no":22,"off":86,"pos":"LW","spd":85,"sta":90,"style":"Two-Way","tag":"Doto","team":"T1"},{"def":79,"dis":85,"friends":["Mejiro McQueen"],"goal":11,"groups":["Mejiro"],"hnd":63,"id":"mejiro-dober","line":0,"name":"Mejiro Dober","no":9,"off":70,"pos":"D","spd":74,"sta":78,"style":"Two-Way","tag":"Dober","team":"FA"},{"def":52,"dis":80,"friends":["Matikanetannhauser"],"goal":74,"groups":["Matikane"],"hnd":50,"id":"matikanefukukitaru","line":0,"name":"Matikanefukukitaru","no":35,"off":45,"pos":"G","spd":66,"sta":74,"style":"Reflex","tag":"Fuku","team":"FA"},{"def":70,"dis":72,"friends":["Mejiro McQueen","Mejiro Palmer"],"goal":9,"groups":["Mejiro"],"hnd":67,"id":"mejiro-ryan","line":3,"name":"Mejiro Ryan","no":13,"off":72,"pos":"D","spd":74,"sta":85,"style":"Offensive","tag":"Ryan","team":"T3","side":"L"},{"def":64,"dis":90,"friends":["Mejiro McQueen"],"goal":9,"groups":["Mejiro"],"hnd":80,"id":"mejiro-ardan","line":3,"name":"Mejiro Ardan","no":21,"off":70,"pos":"RW","spd":72,"sta":60,"style":"Playmaker","tag":"Ardan","team":"T1"},{"def":68,"dis":80,"friends":["Satono Diamond"],"goal":9,"groups":["Satono","Kitasan Gen"],"hnd":69,"id":"satono-crown","line":0,"name":"Satono Crown","no":18,"off":74,"pos":"RW","spd":76,"sta":80,"style":"Two-Way","tag":"Crown","team":"FA"},{"def":62,"dis":94,"friends":[],"goal":10,"groups":["Mejiro"],"hnd":78,"id":"mejiro-bright","line":3,"name":"Mejiro Bright","no":22,"off":75,"pos":"LW","spd":75,"sta":80,"style":"Two-Way","tag":"Bright","team":"T2","side":""},{"def":52,"dis":80,"friends":[],"goal":74,"groups":[],"hnd":50,"id":"curren-chan","line":0,"name":"Curren Chan","no":30,"off":50,"pos":"G","spd":72,"sta":70,"style":"Hybrid","tag":"Curren","team":"FA"},{"def":70,"dis":66,"friends":["Symboli Rudolf"],"goal":9,"groups":["Symboli"],"hnd":82,"id":"sirius-symboli","line":1,"name":"Sirius Symboli","no":10,"off":76,"pos":"RW","spd":80,"sta":76,"style":"Power Forward","tag":"Sirius","team":"T4","side":""},{"def":66,"dis":78,"friends":[],"goal":9,"groups":["Symboli"],"hnd":72,"id":"symboli-kris-s","line":1,"name":"Symboli Kris S","no":15,"off":78,"pos":"D","spd":74,"sta":84,"style":"Two-Way","tag":"Kris","team":"T4","side":"R"},{"def":70,"dis":88,"friends":["Air Shakur"],"goal":9,"groups":[],"hnd":83,"id":"fine-motion","line":4,"name":"Fine Motion","no":20,"off":72,"pos":"C","spd":76,"sta":76,"style":"Playmaker","tag":"Fine","team":"T4","side":""},{"def":76,"dis":74,"friends":["Fine Motion"],"goal":10,"groups":[],"hnd":64,"id":"air-shakur","line":2,"name":"Air Shakur","no":6,"off":72,"pos":"LW","spd":78,"sta":80,"style":"Two-Way","tag":"Shakur","team":"T4","side":""},{"def":74,"dis":70,"friends":[],"goal":10,"groups":[],"hnd":57,"id":"tosen-jordan","line":0,"name":"Tosen Jordan","no":44,"off":62,"pos":"D","spd":74,"sta":70,"style":"Stay-at-Home","tag":"Jordan","team":"T2","side":""},{"def":52,"dis":84,"friends":[],"goal":72,"groups":[],"hnd":50,"id":"yukino-bijin","line":0,"name":"Yukino Bijin","no":31,"off":48,"pos":"G","spd":66,"sta":86,"style":"Hybrid","tag":"Yukino","team":"FA"},{"def":66,"dis":84,"friends":["Sakura Chiyono O"],"goal":9,"groups":["Sakura"],"hnd":69,"id":"sakura-laurel","line":0,"name":"Sakura Laurel","no":17,"off":74,"pos":"LW","spd":76,"sta":80,"style":"Two-Way","tag":"Laurel","team":"FA"},{"def":85,"dis":52,"friends":[],"goal":9,"groups":["Gold Clan"],"hnd":69,"id":"nakayama-festa","line":1,"name":"Nakayama Festa","no":27,"off":79,"pos":"D","spd":78,"sta":76,"style":"Offensive","tag":"Festa","team":"T3","side":"R"},{"def":78,"dis":68,"friends":[],"goal":10,"groups":[],"hnd":63,"id":"gold-city","line":1,"name":"Gold City","no":4,"off":70,"pos":"D","spd":76,"sta":80,"style":"Offensive","tag":"GoldCity","team":"T2","side":"L"},{"def":76,"dis":72,"friends":[],"goal":10,"groups":[],"hnd":57,"id":"kawakami-princess","line":4,"name":"Kawakami Princess","no":6,"off":62,"pos":"RW","spd":72,"sta":78,"style":"Two-Way","tag":"Princess","team":"T2","side":""},{"def":66,"dis":58,"friends":["Agnes Tachyon","Manhattan Cafe"],"goal":9,"groups":["2001 Gen"],"hnd":81,"id":"jungle-pocket","line":4,"name":"Jungle Pocket","no":11,"off":80,"pos":"LW","spd":84,"sta":80,"style":"Power Forward","tag":"Pocket","team":"T3","side":""},{"def":60,"dis":78,"friends":[],"goal":76,"groups":["Hishi"],"hnd":50,"id":"hishi-akebono","line":1,"name":"Hishi Akebono","no":30,"off":50,"pos":"G","spd":60,"sta":82,"style":"Butterfly","tag":"Akebono","team":"T1"},{"def":86,"dis":60,"friends":[],"goal":9,"groups":["Kitasan Gen"],"hnd":84,"id":"duramente","line":1,"name":"Duramente","no":4,"off":85,"pos":"D","side":"R","spd":86,"sta":78,"style":"Offensive","tag":"Duramente","team":"T1"},{"def":70,"dis":80,"friends":["Vivlos"],"goal":9,"groups":["Kitasan Gen"],"hnd":72,"id":"cheval-grand","line":3,"name":"Cheval Grand","no":3,"off":78,"pos":"LW","spd":76,"sta":88,"style":"Two-Way","tag":"Cheval","team":"T4","side":""},{"def":64,"dis":78,"friends":["Cheval Grand"],"goal":9,"groups":[],"hnd":69,"id":"vivlos","line":0,"name":"Vivlos","no":6,"off":74,"pos":"LW","spd":80,"sta":72,"style":"Playmaker","tag":"Vivlos","team":"FA"},{"def":70,"dis":64,"friends":[],"goal":9,"groups":["Dirt"],"hnd":67,"id":"copano-rickey","line":3,"name":"Copano Rickey","no":6,"off":72,"pos":"C","spd":74,"sta":80,"style":"Grinder","tag":"Rickey","team":"T3","side":""},{"def":55,"dis":70,"friends":[],"goal":10,"groups":["Dirt"],"hnd":79,"id":"hokko-tarumae","line":3,"name":"Hokko Tarumae","no":8,"off":81,"pos":"LW","spd":72,"sta":84,"style":"Two-Way","tag":"Taru","team":"T3","side":""},{"def":78,"dis":74,"friends":[],"goal":10,"groups":["Hishi","Miracle"],"hnd":58,"id":"hishi-miracle","line":0,"name":"Hishi Miracle","no":9,"off":64,"pos":"D","spd":70,"sta":82,"style":"Two-Way","tag":"Miracle","team":"FA"},{"def":68,"dis":88,"friends":[],"goal":9,"groups":[],"hnd":69,"id":"zenno-rob-roy","line":0,"name":"Zenno Rob Roy","no":10,"off":74,"pos":"RW","spd":72,"sta":82,"style":"Playmaker","tag":"RobRoy","team":"FA"},{"def":60,"dis":66,"friends":[],"goal":8,"groups":[],"hnd":80,"id":"tap-dance-city","line":0,"name":"Tap Dance City","no":11,"off":76,"pos":"LW","spd":80,"sta":78,"style":"Speedster","tag":"TapDance","team":"FA"},{"def":76,"dis":82,"friends":[],"goal":10,"groups":[],"hnd":63,"id":"daring-tact","line":0,"name":"Daring Tact","no":12,"off":70,"pos":"D","spd":78,"sta":76,"style":"Offensive","tag":"Tact","team":"FA"},{"def":82,"dis":84,"friends":[],"goal":10,"groups":[],"hnd":78,"id":"cesario","line":2,"name":"Cesario","no":55,"off":76,"pos":"D","side":"L","spd":82,"sta":80,"style":"Two-Way","tag":"Cesario","team":"T1"},{"def":84,"dis":88,"friends":[],"goal":10,"groups":[],"hnd":70,"id":"air-messiah","line":2,"name":"Air Messiah","no":44,"off":68,"pos":"D","side":"R","spd":80,"sta":82,"style":"Stay-at-Home","tag":"Messiah","team":"T1"},{"def":50,"dis":80,"friends":[],"goal":77,"groups":[],"hnd":50,"id":"blast-onepiece","line":2,"name":"Blast Onepiece","no":31,"off":45,"pos":"G","spd":64,"sta":84,"style":"Hybrid","tag":"Blast","team":"T1"},{"def":70,"dis":88,"friends":[],"goal":10,"groups":[],"hnd":86,"id":"almond-eye","line":0,"name":"Almond Eye","no":9,"off":90,"pos":"C","spd":90,"sta":84,"style":"Sniper","tag":"Almond","team":"T1"},{"id":"stay-gold","name":"Stay Gold","tag":"StayGold","no":9,"team":"T2","pos":"LW","line":4,"off":78,"hnd":76,"def":76,"spd":80,"sta":84,"dis":62,"goal":10,"style":"Two-Way","friends":[],"groups":[],"side":""},{"id":"sounds-of-earth","name":"Sounds of Earth","tag":"Sounds","no":11,"team":"T2","pos":"D","line":2,"off":76,"hnd":74,"def":80,"spd":80,"sta":82,"dis":82,"goal":10,"style":"Offensive","friends":[],"groups":[],"side":"R"},{"id":"win-variation","name":"Win Variation","tag":"WinVar","no":12,"team":"T2","pos":"D","line":3,"off":66,"hnd":66,"def":80,"spd":76,"sta":80,"dis":82,"goal":10,"style":"Stay-at-Home","friends":[],"groups":[],"side":"L"},{"id":"dream-journey","name":"Dream Journey","tag":"Journey","no":13,"team":"T2","pos":"D","line":3,"off":72,"hnd":76,"def":76,"spd":82,"sta":74,"dis":72,"goal":10,"style":"Two-Way","friends":[],"groups":[],"side":"R"},{"id":"furioso","name":"Furioso","tag":"Furioso","no":31,"team":"T2","pos":"G","line":2,"off":45,"hnd":50,"def":52,"spd":64,"sta":82,"dis":82,"goal":74,"style":"Hybrid","friends":[],"groups":[],"side":""},{"id":"believe","name":"Believe","tag":"Believe","no":15,"team":"T2","pos":"RW","line":0,"off":78,"hnd":74,"def":62,"spd":90,"sta":66,"dis":80,"goal":10,"style":"Speedster","friends":[],"groups":[],"side":""},{"id":"wonder-acute","name":"Wonder Acute","tag":"Acute","no":10,"team":"T3","pos":"RW","line":3,"off":76,"hnd":72,"def":70,"spd":78,"sta":84,"dis":80,"goal":10,"style":"Grinder","friends":[],"groups":[],"side":""},{"id":"gentildonna","name":"Gentildonna","tag":"Donna","no":30,"team":"T3","pos":"G","line":1,"off":48,"hnd":52,"def":58,"spd":68,"sta":86,"dis":84,"goal":86,"style":"Hybrid","friends":[],"groups":[],"side":""},{"id":"verxina","name":"Verxina","tag":"Verxina","no":31,"team":"T3","pos":"G","line":2,"off":45,"hnd":50,"def":52,"spd":66,"sta":80,"dis":84,"goal":76,"style":"Reflex","friends":[],"groups":[],"side":""},{"id":"durandal","name":"Durandal","tag":"Durandal","no":12,"team":"T3","pos":"RW","line":0,"off":80,"hnd":78,"def":58,"spd":90,"sta":66,"dis":76,"goal":10,"style":"Speedster","friends":[],"groups":[],"side":""},{"id":"tanino-gimlet","name":"Tanino Gimlet","tag":"Gimlet","no":15,"team":"T3","pos":"C","line":0,"off":78,"hnd":78,"def":66,"spd":80,"sta":74,"dis":76,"goal":10,"style":"Playmaker","friends":[],"groups":[],"side":""},{"id":"no-reason","name":"No Reason","tag":"NoReason","no":16,"team":"T3","pos":"LW","line":0,"off":70,"hnd":70,"def":66,"spd":76,"sta":76,"dis":74,"goal":10,"style":"Two-Way","friends":[],"groups":[],"side":""},{"id":"bubblegum-fellow","name":"Bubblegum Fellow","tag":"Bubblegum","no":20,"team":"T3","pos":"D","line":0,"off":68,"hnd":68,"def":80,"spd":78,"sta":80,"dis":80,"goal":10,"style":"Stay-at-Home","friends":[],"groups":[],"side":""},{"id":"dantsu-flame","name":"Dantsu Flame","tag":"Dantsu","no":7,"team":"T4","pos":"LW","line":1,"off":86,"hnd":82,"def":66,"spd":88,"sta":82,"dis":78,"goal":10,"style":"Sniper","friends":[],"groups":[],"side":""},{"id":"ines-fujin","name":"Ines Fujin","tag":"Fujin","no":8,"team":"T4","pos":"C","line":2,"off":82,"hnd":82,"def":70,"spd":82,"sta":84,"dis":84,"goal":10,"style":"Playmaker","friends":[],"groups":[],"side":""},{"id":"still-in-love","name":"Still In Love","tag":"StillLove","no":9,"team":"T4","pos":"RW","line":3,"off":80,"hnd":78,"def":70,"spd":80,"sta":80,"dis":86,"goal":10,"style":"Two-Way","friends":[],"groups":[],"side":""},{"id":"mr-c-b","name":"Mr. C.B.","tag":"C.B.","no":13,"team":"T4","pos":"LW","line":4,"off":84,"hnd":82,"def":72,"spd":84,"sta":86,"dis":84,"goal":10,"style":"Two-Way","friends":[],"groups":[],"side":""},{"id":"orfevre","name":"Orfevre","tag":"Orfevre","no":14,"team":"T4","pos":"D","line":1,"off":86,"hnd":84,"def":84,"spd":88,"sta":86,"dis":40,"goal":10,"style":"Offensive","friends":[],"groups":[],"side":"L"},{"id":"transcend","name":"Transcend","tag":"Transcend","no":17,"team":"T4","pos":"D","line":3,"off":66,"hnd":66,"def":82,"spd":74,"sta":86,"dis":84,"goal":10,"style":"Stay-at-Home","friends":[],"groups":[],"side":"L"},{"id":"loves-only-you","name":"Loves Only You","tag":"LOY","no":18,"team":"T4","pos":"D","line":3,"off":72,"hnd":74,"def":80,"spd":80,"sta":82,"dis":86,"goal":10,"style":"Two-Way","friends":[],"groups":[],"side":"R"},{"id":"seeking-the-pearl","name":"Seeking the Pearl","tag":"Pearl","no":30,"team":"T4","pos":"G","line":2,"off":45,"hnd":50,"def":52,"spd":70,"sta":80,"dis":80,"goal":76,"style":"Hybrid","friends":[],"groups":[],"side":""},{"id":"sweep-tosho","name":"Sweep Tosho","tag":"Sweep","no":19,"team":"T4","pos":"RW","line":0,"off":78,"hnd":76,"def":66,"spd":84,"sta":76,"dis":74,"goal":10,"style":"Speedster","friends":[],"groups":[],"side":""}],"teams":[{"abbr":"SNGU","color":"#A6192E","color2":"#FFFFFF","color3":"#111111","id":"T1","name":"Team Singularity","pk":[["oguri-cap","yaeno-muteki","air-groove","duramente"],["inari-one","bamboo-memory","hishi-amazon","fuji-kiseki"]],"pp":[["tokai-teio","symboli-rudolf","p-muvwj6id","oguri-cap","duramente"],["mejiro-ardan","t-m-opera-o","king-halo","air-groove","cesario"]]},{"abbr":"DAY","color":"#cdea39","color2":"#1B2410","id":"T2","name":"The Daycare","pk":[["p-muvwzwmm","tamamo-cross","stay-gold","sounds-of-earth"],["mejiro-mcqueen","mejiro-bright","dream-journey","p-muvx422o"]],"pp":[["maruzensky","p-muvwzwmm","tamamo-cross","taiki-shuttle","sounds-of-earth"],["p-muvx17yz","mihono-bourbon","twin-turbo","stay-gold","gold-city"]],"color3":"#1B2410"},{"abbr":"VVV","color":"#424343","color2":"#FFFFFF","id":"T3","name":"Veni Vidi Vici","pk":[["admire-vega","narita-top-road","mejiro-ryan","p-muvxenvx"],["kitasan-black","satono-diamond","p-muvxcrfi","bubblegum-fellow"]],"pp":[["kitasan-black","narita-brian","satono-diamond","narita-top-road","p-muvxenvx"],["mejiro-palmer","daitaku-helios","agnes-digital","admire-vega","mejiro-ryan"]],"color3":"#C9CACB"},{"abbr":"GOLD","color":"#b6992f","color2":"#1C1A12","id":"T4","name":"Team Goldleaf","pk":[["still-in-love","sakura-bakushin-o","loves-only-you","symboli-kris-s"],["mr-c-b","cheval-grand","daiwa-scarlet","vodka"]],"pp":[["dantsu-flame","silence-suzuka","sirius-symboli","symboli-kris-s","orfevre"],["air-shakur","ines-fujin","el-condor-pasa","fine-motion","vodka"]],"color3":"#1C1A12"}],"version":4};
function defaultLeague() { return upgradeLeague(JSON.parse(JSON.stringify(BASE_LEAGUE))); }
// Bring a version-1 league (2 lines, 3 stats) up to version 2 without undoing the user's edits
function upgradeLeague(L) {
  if (!L || (L.version || 1) >= LEAGUE_VERSION) return L;
  if ((L.version || 1) < 2) upgradeTo2(L);
  for (const p of L.players) if (p.hnd == null || p.hnd === "") p.hnd = HANDS[p.name] || deriveHands(p);
  if ((L.version || 1) < 6) addFreeAgents(L); // v6: new characters join as free agents
  if ((L.version || 1) < 7) shrinkRosters(L); // v7: rosters drop to 3 lines and 2 pairs
  if ((L.version || 1) < 5) for (const p of L.players) fillRatings(p); // v5: Offense splits into Shooting and Passing, plus Skating, Checking, Faceoffs, Clutch
  if ((L.version || 1) < 4) for (const t of L.teams || []) { // special-teams picks become slot lists
    if (t.pp && !Array.isArray(t.pp[0] || t.pp[1])) t.pp = t.pp.map(u => u && u.F ? [u.F[0], u.F[1], u.F[2], (u.D || [])[1], (u.D || [])[0]].map(v => v || null) : null);
    if (t.pk && !Array.isArray(t.pk[0] || t.pk[1])) t.pk = t.pk.map(u => u && u.F ? [u.F[0], u.F[1], (u.D || [])[0], (u.D || [])[1]].map(v => v || null) : null);
  }
  if ((L.version || 1) < 9) { // v8: eight new clubs; v9: ten clubs, new characters and a few position changes, rosters redrawn
    const keep = (L.version || 1) >= 8;
    for (const p of L.players) fillRatings(p);
    addV9(L); toClubs(L, keep);
  }
  if ((L.version || 1) < 10) resetClubIdentity(L); // v10: the clubs go back to their own names, colors and crests
  L.version = LEAGUE_VERSION;
  return L;
}
function resetClubIdentity(L) {
  for (const t of L.teams || []) { const b = FR_TEAMS.find(x => x.id === t.id); if (b) Object.assign(t, { name: b.name, abbr: b.abbr, color: b.color, color2: b.color2, color3: b.color3, logo: Object.assign({}, b.logo) }); }
}
// v7: the 4th forward line and 3rd defense pair on every team become free agents
function shrinkRosters(L) {
  const cut = new Set();
  for (const p of L.players) {
    if (p.team === "FA") continue;
    const g = posGroup(p);
    if ((g === "F" && p.line > N_FLINES) || (g === "D" && p.line > N_DPAIRS)) { p.team = "FA"; p.line = 0; p.side = p.pos === "D" ? p.side || "" : ""; cut.add(p.id); }
  }
  // special-teams picks that pointed at a released player go back to Auto
  for (const t of L.teams || []) for (const kind of ["pp", "pk"]) {
    if (!Array.isArray(t[kind])) continue;
    t[kind] = t[kind].map(u => Array.isArray(u) ? u.map(id => id && cut.has(id) ? null : id) : u).map(u => Array.isArray(u) && u.some(Boolean) ? u : null);
    if (!t[kind].some(Boolean)) t[kind] = null;
  }
  return cut.size;
}
function upgradeTo2(L) {
  const byName = new Map(L.players.map(p => [String(p.name).toLowerCase(), p]));
  const teamIds = new Set(L.teams.map(t => t.id));
  const used = new Set(L.players.map(p => p.id));
  for (const r of LEGACY_ROWS) {
    const ex = byName.get(r[0].toLowerCase());
    if (ex) {
      if (ex.spd == null) ex.spd = r[9];
      if (ex.sta == null) ex.sta = r[10];
      if (ex.dis == null) ex.dis = r[11];
      if (!ex.style) ex.style = r[12];
      if (ex.team === "FA" && r[3] !== "FA" && teamIds.has(r[3])) { ex.team = r[3]; ex.line = r[5]; ex.pos = r[4]; ex.no = r[2]; }
      for (const g of splitList(r[14])) if (!ex.groups.some(x => x.toLowerCase() === g.toLowerCase())) ex.groups.push(g);
      for (const f of splitList(r[13])) if (!ex.friends.some(x => x.toLowerCase() === f.toLowerCase())) ex.friends.push(f);
    } else {
      let id = slugify(r[0]); while (used.has(id)) id += "-x"; used.add(id);
      const p = rowToPlayer(r, id); p.hnd = HANDS[p.name] || deriveHands(p);
      if (p.team !== "FA" && !teamIds.has(p.team)) { p.team = "FA"; p.line = 0; }
      L.players.push(p);
    }
  }
  L.version = LEAGUE_VERSION;
  return L;
}

// ---------- New characters (v6): free agents ----------
// [name, short, no, pos, style, OFF, DEF, HND, SPD, STA, DIS, GOAL, friends]
const NEW_FA = [
  ["Admire Groove", "Groove A", 17, "C", "Playmaker", 80, 70, 82, 78, 78, 80, 10, ""],
  ["Aston Machan", "Machan", 33, "LW", "Speedster", 74, 60, 76, 90, 72, 76, 10, ""],
  ["Biko Pegasus", "Pegasus", 35, "G", "Reflex", 40, 40, 50, 70, 80, 82, 78, ""],
  ["Chrono Genesis", "Chrono", 12, "C", "Two-Way", 82, 82, 80, 80, 88, 80, 10, ""],
  ["Curren Bouquetd'or", "Bouquet", 31, "G", "Butterfly", 40, 40, 50, 66, 82, 84, 80, ""],
  ["Daiichi Ruby", "Ruby", 4, "D", "Stay-at-Home", 62, 84, 64, 74, 82, 86, 10, ""],
  ["Daring Heart", "Heart", 19, "C", "Two-Way", 76, 76, 75, 78, 80, 80, 10, "Daring Tact"],
  ["Epiphaneia", "Epiph", 9, "RW", "Sniper", 88, 62, 82, 84, 76, 60, 10, ""],
  ["Espoir City", "Espoir", 26, "LW", "Grinder", 74, 74, 70, 78, 86, 70, 10, ""],
  ["Forever Young", "Forever", 23, "RW", "Power Forward", 80, 70, 76, 80, 82, 74, 10, ""],
  ["Fusaichi Pandora", "Pandora", 5, "D", "Offensive", 78, 76, 76, 82, 78, 76, 10, ""],
  ["Gran Alegria", "Alegria", 11, "LW", "Speedster", 86, 64, 84, 94, 70, 78, 10, ""],
  ["Kiseki", "Kiseki", 16, "RW", "Power Forward", 82, 70, 76, 84, 80, 58, 10, ""],
  ["Lucky Lilac", "Lilac", 14, "C", "Playmaker", 84, 72, 86, 80, 80, 82, 10, ""],
  ["Marche Lorraine", "Marche", 2, "D", "Offensive", 76, 78, 74, 78, 82, 78, 10, ""],
  ["Neo Universe", "Neo", 10, "C", "Two-Way", 84, 78, 82, 82, 82, 80, 10, ""],
  ["North Flight", "Flight", 6, "D", "Two-Way", 70, 82, 70, 80, 82, 84, 10, ""],
  ["Phalaenopsis", "Phalae", 30, "G", "Hybrid", 40, 40, 50, 68, 84, 86, 82, ""],
  ["Red Desire", "Desire", 27, "RW", "Sniper", 82, 62, 80, 82, 74, 76, 10, ""],
  ["Rhein Kraft", "Kraft", 28, "LW", "Speedster", 78, 64, 78, 90, 74, 80, 10, ""],
  ["Rose Kingdom", "Rose", 21, "RW", "Two-Way", 76, 76, 74, 78, 80, 82, 10, ""],
  ["Royce and Royce", "Royce", 3, "D", "Stay-at-Home", 60, 82, 62, 74, 86, 82, 10, ""],
  ["Rulership", "Rule", 7, "D", "Two-Way", 74, 80, 72, 80, 78, 80, 10, ""],
  ["Shinko Windy", "Windy", 44, "LW", "Enforcer", 64, 76, 60, 78, 84, 50, 10, ""],
  ["Tsurumaru Tsuyoshi", "Tsuyoshi", 29, "RW", "Grinder", 72, 74, 70, 80, 84, 72, 10, ""],
  ["Victoire Pisa", "Pisa", 15, "C", "Playmaker", 82, 70, 84, 80, 78, 84, 10, ""],
  ["Yamanin Zephyr", "Zephyr", 25, "C", "Two-Way", 76, 74, 76, 82, 78, 82, 10, ""]
];
// ---------- v9: ten clubs ----------
// new faces: characters from the games and manga, plus real racehorses who aren't Uma Musume (yet)
// [name, short, no, pos, style, OFF, DEF, HND, SPD, STA, DIS, GOAL, friends, circles]
const NEW_V9 = [
  ["Happy Meek", "Meek", 1, "C", "Two-Way", 82, 80, 82, 84, 88, 88, 10, "", ""],
  ["Little Coco", "Coco", 52, "LW", "Speedster", 76, 62, 78, 92, 74, 78, 10, "", ""],
  ["Bitter Glasse", "Glasse", 39, "G", "Butterfly", 40, 40, 50, 70, 84, 84, 79, "", ""],
  ["Fujimasa March", "March", 3, "RW", "Sniper", 82, 64, 80, 86, 78, 70, 10, "Oguri Cap", "Kasamatsu"],
  ["Belno Light", "Belno", 44, "D", "Two-Way", 64, 74, 64, 74, 80, 84, 10, "Oguri Cap, Norn Ace", "Kasamatsu"],
  ["Norn Ace", "Norn", 13, "LW", "Enforcer", 70, 70, 66, 78, 84, 58, 10, "Oguri Cap, Belno Light", "Kasamatsu"],
  ["Obey Your Master", "Master", 7, "C", "Playmaker", 80, 70, 82, 80, 80, 80, 10, "", ""],
  ["Deep Impact", "Deep", 7, "C", "Speedster", 89, 72, 88, 98, 86, 86, 10, "Contrail, Heart's Cry", ""],
  ["Equinox", "Equinox", 8, "C", "Two-Way", 86, 82, 86, 90, 88, 86, 10, "Do Deuce", ""],
  ["Lord Kanaloa", "Kanaloa", 17, "RW", "Speedster", 86, 62, 84, 98, 72, 82, 10, "", ""],
  ["Contrail", "Contrail", 19, "LW", "Sniper", 87, 66, 84, 90, 82, 84, 10, "Deep Impact", ""],
  ["Liberty Island", "Liberty", 24, "LW", "Playmaker", 84, 70, 86, 88, 82, 84, 10, "", ""],
  ["Just a Way", "Way", 28, "RW", "Sniper", 85, 64, 82, 86, 80, 76, 10, "", ""],
  ["Do Deuce", "Deuce", 6, "RW", "Power Forward", 82, 70, 78, 84, 84, 78, 10, "Equinox", ""],
  ["Efforia", "Efforia", 11, "C", "Playmaker", 82, 70, 84, 82, 80, 82, 10, "Titleholder", ""],
  ["Titleholder", "Holder", 14, "RW", "Two-Way", 78, 78, 76, 84, 92, 84, 10, "Efforia, Panthalassa", ""],
  ["Sodashi", "Sodashi", 18, "LW", "Speedster", 80, 62, 80, 92, 72, 74, 10, "", ""],
  ["Heart's Cry", "Cry", 21, "C", "Power Forward", 80, 72, 78, 82, 86, 76, 10, "Deep Impact", ""],
  ["Rey de Oro", "Oro", 22, "LW", "Two-Way", 78, 76, 78, 82, 84, 82, 10, "", ""],
  ["Lys Gracieux", "Lys", 27, "C", "Playmaker", 80, 68, 82, 82, 78, 84, 10, "", ""],
  ["Stars on Earth", "Stars", 32, "LW", "Two-Way", 78, 76, 78, 80, 84, 82, 10, "", ""],
  ["Panthalassa", "Panth", 34, "RW", "Speedster", 76, 60, 74, 94, 90, 70, 10, "Titleholder", ""],
  ["Fierement", "Fiere", 36, "RW", "Two-Way", 76, 74, 76, 80, 86, 82, 10, "", ""],
  ["Danon Premium", "Danon", 38, "C", "Playmaker", 78, 66, 80, 82, 74, 80, 10, "", ""],
  ["Indy Champ", "Indy", 40, "LW", "Two-Way", 76, 72, 76, 84, 78, 80, 10, "", ""],
  ["Geoglyph", "Geo", 41, "RW", "Grinder", 74, 72, 72, 80, 82, 76, 10, "", ""],
  ["King Kamehameha", "Kame", 4, "D", "Two-Way", 78, 84, 76, 84, 84, 84, 10, "", ""],
  ["Screen Hero", "Hero", 5, "D", "Stay-at-Home", 66, 84, 64, 78, 86, 84, 10, "", ""],
  ["Daiwa Major", "Major", 9, "D", "Offensive", 80, 74, 78, 82, 80, 76, 10, "Daiwa Scarlet", ""],
  ["Vermilion", "Vermi", 12, "D", "Stay-at-Home", 62, 80, 62, 76, 84, 82, 10, "", ""],
  ["Dance Partner", "Partner", 30, "G", "Hybrid", 40, 40, 50, 68, 82, 84, 75, "", ""]
];
// position changes so ten clubs can each dress two goalies: [name, from group, new pos, style, goal rating]
const V9_MOVES = [
  ["Air Shakur", "F", "G", "Reflex", 77], ["Zenno Rob Roy", "F", "G", "Butterfly", 74], ["Nice Nature", "F", "G", "Hybrid", 75],
  ["Matikanetannhauser", "F", "G", "Reflex", 71], ["Haru Urara", "F", "G", "Hybrid", 66],
  ["Mejiro McQueen", "F", "D", "Stay-at-Home", 0], ["Narita Taishin", "F", "D", "Two-Way", 0]
];
function addV9(L) {
  const byName = new Map(L.players.map(p => [String(p.name).toLowerCase(), p]));
  for (const [name, from, pos, style, goal] of V9_MOVES) {
    const p = byName.get(name.toLowerCase()); if (!p || posGroup(p) !== from) continue; // respect a user's own edits
    p.pos = pos; p.style = style; p.side = "";
    if (pos === "G") { p.goal = goal; p.clu = p.clu == null ? 60 : p.clu; }
  }
  const used = new Set(L.players.map(p => p.id));
  for (const r of NEW_V9) {
    if (byName.has(r[0].toLowerCase())) continue;
    let id = slugify(r[0]); while (used.has(id)) id += "-x"; used.add(id);
    L.players.push(fillRatings({ id, name: r[0], tag: r[1], no: r[2], team: "FA", pos: r[3], line: 0, style: r[4],
      off: r[5], def: r[6], hnd: r[7], spd: r[8], sta: r[9], dis: r[10], goal: r[11], friends: splitList(r[12]), groups: splitList(r[13]), side: "" }));
  }
  const oguri = byName.get("oguri cap"); if (oguri && !(oguri.groups || []).includes("Kasamatsu")) (oguri.groups = oguri.groups || []).push("Kasamatsu");
  return L;
}
function addFreeAgents(L) {
  const have = new Set(L.players.map(p => String(p.name).toLowerCase()));
  const used = new Set(L.players.map(p => p.id));
  for (const r of NEW_FA) {
    if (have.has(r[0].toLowerCase())) continue;
    let id = slugify(r[0]); while (used.has(id)) id += "-x"; used.add(id);
    L.players.push(fillRatings({ id, name: r[0], tag: r[1], no: r[2], team: "FA", pos: r[3], line: 0, style: r[4],
      off: r[5], def: r[6], hnd: r[7], spd: r[8], sta: r[9], dis: r[10], goal: r[11], friends: splitList(r[12]), groups: [], side: "" }));
  }
  return L;
}

// ---------- Ratings ----------
// detailed ratings (v5). Offense is kept as the average of Shooting and Passing.
const NEW_STATS = ["sht", "pas", "skt", "chk", "fo", "clu"];
function nameHash(name, salt) { let h = 2166136261 ^ salt; for (const ch of String(name)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
// starting values for a player who doesn't have the detailed ratings yet, read from their old ones and playstyle
function deriveRatings(p) {
  const off = Number(p.off) || 60, def = Number(p.def) || 60, spd = Number(p.spd) || 70, hnd = Number(p.hnd) || off, st = p.style, g = posGroup(p);
  const j = k => Math.round((nameHash(p.name, k) - 0.5) * 8); // a little personality so two 80s aren't identical
  const c = v => Math.max(1, Math.min(99, Math.round(v)));
  if (g === "G") return { sht: c(25 + j(1)), pas: c(45 + j(2)), skt: c(55 + j(3)), chk: c(20 + j(4)), fo: 10, clu: c(62 + (nameHash(p.name, 9) - 0.5) * 30) };
  const shAdj = { Sniper: 7, Playmaker: -5, "Power Forward": 3, Speedster: 1, Grinder: -3, Enforcer: -6, Offensive: 1, "Stay-at-Home": -6 }[st] || 0;
  const paAdj = { Sniper: -5, Playmaker: 7, "Two-Way": 2, Grinder: -2, Enforcer: -6, Offensive: 3, "Stay-at-Home": -2 }[st] || 0;
  const ckAdj = { Grinder: 12, "Power Forward": 10, Enforcer: 18, "Stay-at-Home": 8, Sniper: -8, Playmaker: -8, Speedster: -6, Offensive: -3 }[st] || 0;
  // shooting and passing lean with the playstyle but still average out to the old Offense
  const a = shAdj + j(1), b = paAdj + j(2), mid = (a + b) / 2;
  return {
    sht: c(off + a - mid),
    pas: c(off + b - mid),
    skt: c(spd * 0.55 + hnd * 0.3 + 12 + j(3)),
    chk: c(def * 0.7 + 18 + ckAdj + j(4)),
    fo: p.pos === "C" ? c(off * 0.42 + def * 0.42 + 12 + (st === "Two-Way" ? 5 : 0) + j(5)) : g === "D" ? c(28 + j(5)) : c(off * 0.3 + def * 0.3 + 10 + j(5)),
    clu: c(55 + (off - 70) * 0.35 + (nameHash(p.name, 9) - 0.5) * 30)
  };
}
function fillRatings(p) {
  const d = deriveRatings(p);
  for (const k of NEW_STATS) if (p[k] == null || p[k] === "" || isNaN(Number(p[k]))) p[k] = d[k];
  syncOffense(p);
  return p;
}
function syncOffense(p) { if (posGroup(p) !== "G" || p.sht != null) p.off = Math.round((Number(p.sht) + Number(p.pas)) / 2) || p.off; }
const POSITIONS = ["C", "LW", "RW", "D", "G"];
function clampStat(v) { v = Math.round(Number(v)); return isFinite(v) ? Math.max(1, Math.min(99, v)) : 50; }
function posGroup(p) { return p.pos === "G" ? "G" : p.pos === "D" ? "D" : "F"; }
function deriveStyle(p) {
  const g = posGroup(p);
  if (g === "G") return "Hybrid";
  if (g === "D") return p.off - p.def > 0 ? "Offensive" : p.def - p.off > 14 ? "Stay-at-Home" : "Two-Way";
  if ((p.spd || 0) >= 88) return "Speedster";
  if (p.off - p.def > 20) return "Sniper";
  if (p.def >= p.off - 6) return "Two-Way";
  return "Playmaker";
}
function validStyle(p, s) { return STYLES[posGroup(p)].includes(s) ? s : deriveStyle(p); }
function overall(p) {
  const h = p.hnd == null ? p.off : p.hnd, v = k => p[k] == null ? (k === "sht" || k === "pas" ? p.off : k === "chk" ? p.def : k === "skt" ? p.spd : 50) : Number(p[k]);
  if (p.pos === "G") return Math.round(p.goal * 0.88 + p.sta * 0.08 + v("clu") * 0.04);
  if (p.pos === "D") return Math.round(v("sht") * 0.08 + v("pas") * 0.12 + h * 0.04 + p.def * 0.45 + v("chk") * 0.08 + p.spd * 0.1 + v("skt") * 0.1 + v("clu") * 0.03);
  const fo = p.pos === "C" ? v("fo") * 0.05 : 0;
  return Math.round(v("sht") * 0.25 + v("pas") * 0.22 + h * 0.1 + p.def * (p.pos === "C" ? 0.16 : 0.21) + v("chk") * 0.03 + p.spd * 0.08 + v("skt") * 0.08 + v("clu") * 0.03 + fo);
}
// Uma-style letter grades
// which way a player shoots: the D side they play, otherwise about 60/40 left
function shootsOf(p) { if (p.shoots === "L" || p.shoots === "R") return p.shoots; if (p.side === "L" || p.side === "R") return p.side; return nameHash(p.name, 77) < 0.6 ? "L" : "R"; }
function grade(v) {
  if (v >= 97) return "SS"; if (v >= 90) return "S"; if (v >= 80) return "A"; if (v >= 70) return "B";
  if (v >= 60) return "C"; if (v >= 50) return "D"; if (v >= 35) return "E"; if (v >= 20) return "F"; return "G";
}

// ---------- Chemistry ----------
const CHEM_BASE = 40, CHEM_FRIEND = 6, CHEM_GROUP = 2;
function areFriends(a, b) {
  const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
  return a.friends.some(f => f.toLowerCase() === bn) || b.friends.some(f => f.toLowerCase() === an);
}
function sharedGroup(a, b) {
  const g = new Set(a.groups.map(x => x.toLowerCase()));
  return b.groups.find(x => g.has(x.toLowerCase())) || null;
}
function pairChem(a, b) { return areFriends(a, b) ? CHEM_FRIEND : sharedGroup(a, b) ? CHEM_GROUP : 0; }
function unitChemistry(players) {
  let c = CHEM_BASE; const links = [];
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const v = pairChem(players[i], players[j]);
    if (v) { c += v; links.push({ a: players[i], b: players[j], kind: v === CHEM_FRIEND ? "friend" : "group", group: v === CHEM_GROUP ? sharedGroup(players[i], players[j]) : null }); }
  }
  return { value: Math.max(0, Math.min(100, c)), links };
}
function chemLabel(v) {
  if (v >= 85) return "Inseparable"; if (v >= 70) return "In sync"; if (v >= 55) return "Familiar"; return "Strangers";
}

// ---------- Lineups ----------
// fLines: up to 3 x [C, LW, RW]; dPairs: up to 2 x [D, D]; goalies [starter, backup]; pp/pk special-teams units
const PP_SLOTS = ["LW", "C", "RW", "Wild Card", "D"], PK_SLOTS = ["Winger", "Center", "LD", "RD"];
// players kept first when a unit has to drop skaters (5-on-3 penalty kill, 4-on-3 power play)
const PP_KEEP = [4, 1, 0, 2, 3], PK_KEEP = [2, 3, 1, 0];
function buildLineup(league, teamId) {
  const roster = league.players.filter(p => p.team === teamId);
  const problems = [];
  const fwd = roster.filter(p => posGroup(p) === "F");
  const dmen = roster.filter(p => posGroup(p) === "D");
  const gs = roster.filter(p => posGroup(p) === "G").sort((a, b) => (a.line || 9) - (b.line || 9) || b.goal - a.goal);
  const used = new Set();
  const take = (list, pred) => {
    const c = list.filter(p => !used.has(p.id) && pred(p)).sort((a, b) => overall(b) - overall(a))[0];
    if (c) used.add(c.id); return c || null;
  };
  const dressedLine = x => x.line >= 1 && x.line <= (posGroup(x) === "D" ? N_DPAIRS : N_FLINES);
  const goalies = [gs[0] || null, gs[1] || null];
  if (!goalies[0]) {
    const g = roster.filter(p => posGroup(p) !== "G").sort((a, b) => b.goal - a.goal)[0];
    if (g) { goalies[0] = g; problems.push("No goalie listed, so " + g.name + " is in net."); }
  }
  goalies.forEach(g => g && used.add(g.id));
  const fLines = [], dPairs = [];
  for (let L = 1; L <= N_FLINES; L++) {
    const F = ["C", "LW", "RW"].map(pos => take(fwd, x => x.line === L && x.pos === pos) || take(fwd, x => x.line === L) || take(fwd, x => !dressedLine(x)) || (L === 1 ? take(fwd, () => true) : null));
    if (F.every(Boolean)) fLines.push(F); else { F.forEach(p => p && used.delete(p.id)); problems.push("Forward line " + L + " is short a player."); }
  }
  for (let L = 1; L <= N_DPAIRS; L++) {
    const D = [0, 1].map(() => take(dmen, x => x.line === L) || take(dmen, x => !dressedLine(x)) || (L === 1 ? take(dmen, () => true) : null));
    if (D.every(Boolean)) dPairs.push(D.sort((a, b) => (a.side === "R" ? 1 : 0) - (b.side === "R" ? 1 : 0) || (b.side === "L" ? 1 : 0) - (a.side === "L" ? 1 : 0))); else { D.forEach(p => p && used.delete(p.id)); problems.push("Defense pair " + L + " is short a player."); }
  }
  // short a forward line: fill it with whoever is left, an extra defender playing wing included
  if (fLines.length && fLines.length < N_FLINES) {
    const left = roster.filter(p => posGroup(p) !== "G" && !used.has(p.id)).sort((a, b) => (posGroup(a) === "F" ? 0 : 1) - (posGroup(b) === "F" ? 0 : 1) || overall(b) - overall(a));
    if (left.length >= 3) { const F = left.slice(0, 3); F.forEach(p => used.add(p.id)); fLines.push(F); for (let i = problems.length - 1; i >= 0; i--) if (/^Forward line/.test(problems[i])) { problems[i] = "Forward line " + fLines.length + " is filled with an extra: " + F.filter(p => posGroup(p) !== "F").map(p => p.name).join(", ") || ""; if (!F.some(p => posGroup(p) !== "F")) problems.splice(i, 1); break; } }
  }
  // borrow forwards/defenders if a team can't ice a full first unit
  if (!fLines.length) { const F = []; for (let k = 0; k < 3; k++) { const p = take(roster, x => posGroup(x) !== "G"); if (p) F.push(p); } if (F.length === 3) fLines.push(F); }
  if (!dPairs.length) { const D = []; for (let k = 0; k < 2; k++) { const p = take(roster, x => posGroup(x) !== "G"); if (p) D.push(p); } if (D.length === 2) dPairs.push(D); }
  const dressedF = fLines.flat(), dressedD = dPairs.flat();
  const st = p => p.style;
  const ppF = dressedF.slice().sort((a, b) => (b.off + (["Sniper", "Playmaker"].includes(st(b)) ? 6 : st(b) === "Power Forward" ? 3 : 0)) - (a.off + (["Sniper", "Playmaker"].includes(st(a)) ? 6 : st(a) === "Power Forward" ? 3 : 0)));
  const ppD = dressedD.slice().sort((a, b) => (b.off + (st(b) === "Offensive" ? 6 : 0)) - (a.off + (st(a) === "Offensive" ? 6 : 0)));
  const pkF = dressedF.slice().sort((a, b) => (b.def + b.spd * 0.15 + (st(b) === "Two-Way" ? 6 : st(b) === "Grinder" ? 4 : 0)) - (a.def + a.spd * 0.15 + (st(a) === "Two-Way" ? 6 : st(a) === "Grinder" ? 4 : 0)));
  const pkD = dressedD.slice().sort((a, b) => (b.def + (st(b) === "Stay-at-Home" ? 6 : 0)) - (a.def + (st(a) === "Stay-at-Home" ? 6 : 0)));
  // special teams are slot lists: PP = LW, C, RW, Wild Card, D; PK = Winger, Center, LD, RD
  const team = (league.teams || []).find(t => t.id === teamId) || {};
  const byId = new Map(roster.filter(p => posGroup(p) !== "G").map(p => [p.id, p]));
  const ppScore = p => posGroup(p) === "D" ? p.off + (st(p) === "Offensive" ? 6 : 0) - 4 : p.off + (["Sniper", "Playmaker"].includes(st(p)) ? 6 : st(p) === "Power Forward" ? 3 : 0);
  const autoUnit = (kind, u) => {
    const used = new Set(), get = (arr, i) => { const p = arr.filter(x => !used.has(x.id))[i] || null; if (p) used.add(p.id); return p; };
    if (kind === "pp") {
      const F = [get(ppF, u * 3), get(ppF, u * 3), get(ppF, u * 3)];
      const D = get(ppD, u);
      const wild = [ppF.filter(x => !used.has(x.id))[u], ppD.filter(x => !used.has(x.id))[u]].filter(Boolean).sort((a, b) => ppScore(b) - ppScore(a))[0] || null;
      if (wild) used.add(wild.id);
      return [F[0], F[1], F[2], wild, D];
    }
    return [get(pkF, u * 2), get(pkF, u * 2), get(pkD, u * 2), get(pkD, u * 2)];
  };
  const unitFor = (kind, u) => {
    const auto = autoUnit(kind, u), spec = team[kind] && Array.isArray(team[kind][u]) ? team[kind][u] : null;
    const slots = [], custom = [], used = new Set();
    auto.forEach((a, k) => { const want = spec && spec[k] ? byId.get(spec[k]) : null; if (want && !used.has(want.id)) { slots[k] = want; custom[k] = true; used.add(want.id); } });
    const pools = kind === "pp" ? ppF.concat(ppD) : pkF.concat(pkD);
    auto.forEach((a, k) => { if (slots[k]) return; const f = [a, ...(k >= (kind === "pp" ? 4 : 2) ? (kind === "pp" ? ppD : pkD) : pools)].find(x => x && !used.has(x.id)) || null; slots[k] = f; custom[k] = false; if (f) used.add(f.id); });
    const ps = slots.filter(Boolean);
    return { slots, custom, F: ps.filter(p => posGroup(p) !== "D"), D: ps.filter(p => posGroup(p) === "D") };
  };
  const pp = dressedF.length && dressedD.length ? [0, 1].map(u => unitFor("pp", u)) : [];
  const pk = dressedF.length && dressedD.length ? [0, 1].map(u => unitFor("pk", u)) : [];
  const ok = !!goalies[0] && fLines.length >= 1 && dPairs.length >= 1;
  if (!roster.length) problems.push("Team has no players.");
  else if (!ok) problems.push("Needs at least 3 forwards, 2 defenders and a goalie.");
  return { fLines, dPairs, goalies, goalie: goalies[0], pp, pk, ok, problems, roster };
}
