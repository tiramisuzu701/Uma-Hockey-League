# Tracen Ice League

A hockey simulator starring the Uma Musume cast. Ten clubs, a full game engine you can watch shift by shift, and three ways to play:

- **Quick Play**: pick two clubs and drop the puck. Watch live, skip ahead, see replays, box scores, shot maps and win probability.
- **Franchise**: draft a club from scratch, manage contracts under the salary cap, field trade offers, train players, build team chemistry with practices, coach from the bench (line changes at intermission, goalie pulls and changes), and chase the Tracen Cup.
- **Be A Player**: create your own player, play the draft combine, get drafted, and make the big decisions in key moments as your career unfolds.

It's a single static page: no server, no build tools, no dependencies.

## Put it on GitHub Pages

1. Create a new repository on GitHub (for example `tracen-ice-league`).
2. Upload everything in this folder, keeping the `art/` folder next to `index.html`. On github.com: **Add file → Upload files**, drag the contents in, and commit.
3. In the repository go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

To use your own domain, add it under **Settings → Pages → Custom domain** and point a CNAME record at `<your-username>.github.io`.

You can also just open `index.html` in a browser. Some browsers block the character art when a page is opened straight from disk; serving the folder fixes it (for example `python3 -m http.server` and then http://localhost:8000).

## Saving

Everything saves in the visitor's own browser (localStorage): Quick Play rosters and lines, franchises and Be A Player careers. Clearing site data erases them, so back up what matters:

- **Franchises and careers:** use **Download save** (in the club or career header, or on the saves screen) to get a `.json` file, and **Import save file** on the Franchise or Be A Player screen to load it back, on this device or another one.
- **Quick Play rosters:** Roster sheet → **Import / export**, as CSV or JSON.

Online leagues with friends would need a shared backend (for example Supabase) and aren't part of this build yet.

## Project layout

```
index.html        the built game (this is what GitHub Pages serves)
art/              character sprite sheets and the Be A Player portrait
src/              the source the page is built from
  page.css          styles
  body.html         page markup
  data.js           players, ratings, lineups, league upgrades
  logo.js           generated team crests
  chibi.js          character portraits from the sprite sheets
  engine.js         the hockey game engine
  fcore.js          franchise and Be A Player rules (draft, cap, trades, training, career)
  app.js            Quick Play screens, rink drawing, lines and roster editors
  franchise.js      franchise screens and in-game coaching
  bap.js            Be A Player screens
  boot.js           start-up
build.sh          rebuilds index.html from src/
tools/            command-line simulations for checking the engine (need Node.js)
```

## Making changes

Edit the files in `src/`, then rebuild:

```
bash build.sh
```

On Windows without bash, run it from Git Bash or WSL.

The tools in `tools/` run whole games and seasons without a browser, which is handy after engine changes:

```
node tools/test.js 20        # 20 games: goals, shots, penalties, hits per game
node tools/frtest.js         # a full franchise season and offseason
node tools/baptest.js        # a Be A Player career
node tools/gdraft.js 100     # 100 drafts: where the first goalie goes
node tools/dentry.js 6       # what defenders do after carrying the puck into the zone
```

## Credits

A fan project. Uma Musume: Pretty Derby and its characters belong to Cygames. Some players are named after real racehorses. This project isn't affiliated with or endorsed by Cygames or any rights holder.
