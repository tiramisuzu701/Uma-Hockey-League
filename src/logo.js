// ---------- generated team logos ----------
// Every team gets a crest built from its colors: a shape, an emblem, and its letters on a band.
const LOGO_SHAPES = ["shield", "roundel", "hexagon", "crest", "diamond"];
const LOGO_EMBLEMS = ["horseshoe", "horse", "star", "bolt", "crown", "wings", "laurel", "letters", "firefly", "storm"];
const LOGO_AUTO = ["horseshoe", "horse", "star", "bolt", "crown", "wings", "laurel"]; // defaults draw from the original set so older teams keep their crests
const LOGO_NAMES = { shield: "Shield", roundel: "Roundel", hexagon: "Hexagon", crest: "Crest", diamond: "Diamond",
  horseshoe: "Horseshoe", horse: "Horse", star: "Star", bolt: "Lightning", crown: "Crown", wings: "Wings", laurel: "Laurels", letters: "Letters", firefly: "Firefly", storm: "Thundercloud" };
function logoDefaults(t) {
  const h = nameHash(t.id + "|" + t.name, 31), h2 = nameHash(t.name + "|" + t.id, 57);
  return { shape: LOGO_SHAPES[Math.floor(h * LOGO_SHAPES.length)], emblem: LOGO_AUTO[Math.floor(h2 * LOGO_AUTO.length)] };
}
function normLogo(l, t) {
  const d = logoDefaults(t); l = l && typeof l === "object" ? l : {};
  return { shape: LOGO_SHAPES.includes(l.shape) ? l.shape : d.shape, emblem: LOGO_EMBLEMS.includes(l.emblem) ? l.emblem : d.emblem };
}
function teamInitials(t) {
  const words = String(t.name || t.abbr || "").split(/\s+/).filter(w => w && !/^(team|the|of|fc)$/i.test(w));
  const s = words.map(w => w[0]).join("").toUpperCase();
  return (s || String(t.abbr || "?")).slice(0, 3);
}
function logoEsc(v) { return String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function logoLum(hex) { const h = String(hex || "#888888").replace("#", ""); const v = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
function teamLogoSvg(t, size, extra) {
  const L = normLogo(t.logo, t), c1 = t.color || "#5E6B7D", c2 = t.color2 || "#FFFFFF";
  let c3 = t.color3 || c2; if (c3.toLowerCase() === c1.toLowerCase()) c3 = c2;
  const edge = logoLum(c1) > 0.55 ? "#1B2232" : "rgba(255,255,255,0.0)";
  const shapes = {
    shield: "M50 4 L91 15 V47 C91 73 72 89 50 97 C28 89 9 73 9 47 V15 Z",
    roundel: "M50 3 A47 47 0 1 1 49.99 3 Z",
    hexagon: "M50 3 L91 26 V74 L50 97 L9 74 V26 Z",
    crest: "M12 8 Q50 1 88 8 V55 C88 77 70 91 50 97 C30 91 12 77 12 55 Z",
    diamond: "M50 2 L96 50 L50 98 L4 50 Z"
  };
  const sp = shapes[L.shape];
  const inner = L.shape === "roundel" ? `<circle cx="50" cy="50" r="39" fill="none" stroke="${c3}" stroke-width="3"/>` : `<path d="${sp}" fill="none" stroke="${c3}" stroke-width="3.5" transform="translate(50 50) scale(0.86) translate(-50 -50)"/>`;
  const ey = L.shape === "diamond" ? 44 : 42, ini = logoEsc(teamInitials(t));
  const em = {
    horseshoe: `<path d="M33 ${ey - 16} C33 ${ey + 24} 67 ${ey + 24} 67 ${ey - 16}" fill="none" stroke="${c2}" stroke-width="10" stroke-linecap="round"/>` +
      [[35, ey - 4], [39, ey + 8], [50, ey + 13], [61, ey + 8], [65, ey - 4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="${c1}"/>`).join(""),
    horse: `<path d="M38 ${ey + 22} L39 ${ey + 4} L31 ${ey - 3} L33 ${ey - 13} L43 ${ey - 21} L46 ${ey - 29} L51 ${ey - 22} L61 ${ey - 17} L70 ${ey - 3} L66 ${ey + 3} L57 ${ey - 1} L55 ${ey + 9} L61 ${ey + 22} Z" fill="${c2}" stroke="${c3}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="51" cy="${ey - 12}" r="1.8" fill="${c1}"/>`,
    star: `<polygon points="${Array.from({ length: 10 }, (_, k) => { const r = k % 2 ? 9 : 22, a = -Math.PI / 2 + k * Math.PI / 5; return (50 + Math.cos(a) * r).toFixed(1) + "," + (ey + Math.sin(a) * r).toFixed(1); }).join(" ")}" fill="${c2}" stroke="${c3}" stroke-width="1.5" stroke-linejoin="round"/>`,
    bolt: `<polygon points="56,${ey - 24} 34,${ey + 3} 48,${ey + 3} 42,${ey + 24} 66,${ey - 6} 52,${ey - 6}" fill="${c2}" stroke="${c3}" stroke-width="1.5" stroke-linejoin="round"/>`,
    crown: `<path d="M30 ${ey + 12} L28 ${ey - 12} L40 ${ey} L50 ${ey - 18} L60 ${ey} L72 ${ey - 12} L70 ${ey + 12} Z" fill="${c2}" stroke="${c3}" stroke-width="1.5" stroke-linejoin="round"/><rect x="30" y="${ey + 14}" width="40" height="5" rx="1.5" fill="${c2}"/>`,
    wings: [-1, 1].map(sd => `<path d="M50 ${ey + 6} C${50 + sd * 8} ${ey - 10} ${50 + sd * 22} ${ey - 18} ${50 + sd * 30} ${ey - 16} C${50 + sd * 26} ${ey - 10} ${50 + sd * 24} ${ey - 6} ${50 + sd * 28} ${ey - 4} C${50 + sd * 22} ${ey} ${50 + sd * 20} ${ey + 2} ${50 + sd * 23} ${ey + 5} C${50 + sd * 14} ${ey + 8} ${50 + sd * 8} ${ey + 10} 50 ${ey + 6} Z" fill="${c2}" stroke="${c3}" stroke-width="1.2" stroke-linejoin="round"/>`).join("") + `<circle cx="50" cy="${ey + 4}" r="4" fill="${c3}"/>`,
    laurel: [-1, 1].map(sd => { let g = `<path d="M${50 + sd * 4} ${ey + 20} C${50 + sd * 22} ${ey + 12} ${50 + sd * 24} ${ey - 8} ${50 + sd * 14} ${ey - 22}" fill="none" stroke="${c2}" stroke-width="2.5"/>`; for (let k = 0; k < 5; k++) { const tt = k / 5, x = 50 + sd * (6 + 15 * Math.sin(tt * 2.6)), y = ey + 16 - tt * 36; g += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="2.4" fill="${c2}" transform="rotate(${sd * (-50 + tt * 60)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; } return g; }).join("") +
      `<text x="50" y="${ey + 6}" text-anchor="middle" font-family="Saira Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="${ini.length > 2 ? 15 : 19}" fill="${c2}">${ini}</text>`,
    firefly: `<circle cx="57" cy="${ey + 9}" r="17" fill="${c2}" opacity="0.18"/><circle cx="57" cy="${ey + 9}" r="11" fill="${c2}" opacity="0.3"/>` +
      `<ellipse cx="38" cy="${ey - 10}" rx="13" ry="6" transform="rotate(-35 38 ${ey - 10})" fill="${c3}" opacity="0.85"/><ellipse cx="56" cy="${ey - 15}" rx="12" ry="5.5" transform="rotate(-70 56 ${ey - 15})" fill="${c3}" opacity="0.85"/>` +
      `<ellipse cx="45" cy="${ey - 3}" rx="6.5" ry="8" transform="rotate(-40 45 ${ey - 3})" fill="${c1}" stroke="${c3}" stroke-width="2"/><circle cx="39" cy="${ey - 10}" r="4" fill="${c1}" stroke="${c3}" stroke-width="2"/>` +
      `<ellipse cx="55" cy="${ey + 7}" rx="8" ry="10.5" transform="rotate(-40 55 ${ey + 7})" fill="${c2}"/><path d="M36 ${ey - 13} Q31 ${ey - 22} 26 ${ey - 21} M39 ${ey - 14} Q38 ${ey - 24} 34 ${ey - 26}" fill="none" stroke="${c3}" stroke-width="1.6" stroke-linecap="round"/>`,
    storm: `<path d="M29 ${ey + 2} C21 ${ey + 2} 21 ${ey - 11} 30 ${ey - 11} C31 ${ey - 21} 45 ${ey - 24} 50 ${ey - 15} C54 ${ey - 22} 68 ${ey - 20} 68 ${ey - 9} C77 ${ey - 9} 77 ${ey + 2} 69 ${ey + 2} Z" fill="${c2}" stroke="${c3}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<polygon points="53,${ey - 1} 40,${ey + 14} 49,${ey + 14} 44,${ey + 27} 61,${ey + 9} 52,${ey + 9} 57,${ey - 1}" fill="${c3}" stroke="${c2}" stroke-width="1.5" stroke-linejoin="round"/>`,
    letters: `<text x="50" y="${ey + 12}" text-anchor="middle" font-family="Saira Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="${ini.length > 2 ? 30 : ini.length > 1 ? 36 : 44}" fill="${c2}" stroke="${c3}" stroke-width="1.2" paint-order="stroke">${ini}</text>`
  }[L.emblem];
  const ab = logoEsc(String(t.abbr || "").slice(0, 4));
  const band = L.shape === "diamond" ? `<rect x="24" y="64" width="52" height="13" rx="2" fill="${c3}"/><text x="50" y="74.5" text-anchor="middle" font-family="Saira Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="11" letter-spacing="1" fill="${logoLum(c3) > 0.5 ? "#141A26" : "#FFFFFF"}">${ab}</text>`
    : `<rect x="18" y="66" width="64" height="14" rx="2" fill="${c3}"/><text x="50" y="77" text-anchor="middle" font-family="Saira Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="12" letter-spacing="1.2" fill="${logoLum(c3) > 0.5 ? "#141A26" : "#FFFFFF"}">${ab}</text>`;
  return `<svg class="logo" viewBox="0 0 100 100" width="${size}" height="${size}" ${extra || ""} role="img" aria-label="${logoEsc(t.name)} logo"><path d="${sp}" fill="${c1}" stroke="${edge}" stroke-width="2"/>${inner}${em}${band}</svg>`;
}
