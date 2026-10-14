#!/usr/bin/env bash
# Rebuilds index.html from the files in src/. Run from the repo root: bash build.sh
set -e
cd "$(dirname "$0")"
{
echo '<!doctype html>'
echo '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
echo '<title>Tracen Ice League</title>'
echo '<meta name="description" content="An Uma Musume hockey simulator: Quick Play, Franchise and Be A Player modes.">'
echo '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&family=Saira+Condensed:wght@500;600;700&display=swap">'
echo '<style>[hidden]{display:none!important}'; cat src/page.css; echo '</style>'
echo '</head><body>'
cat src/body.html
echo '<script>'; cat src/data.js src/logo.js src/chibi.js src/engine.js src/fcore.js src/app.js src/franchise.js src/bap.js src/sound.js src/live.js src/boot.js; echo '</script>'
echo '</body></html>'
} > index.html
echo "Built index.html ($(wc -c < index.html) bytes)"
