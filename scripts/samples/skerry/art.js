// Flat, layered ferry illustrations for the fictional Skerry Line homepage.
// Everything is generated SVG so both versions share the same drawing and only
// the palette and composition change.

function wave(y, amp, len, w, h, phase = 0) {
  let d = `M0 ${h} L0 ${y}`;
  const steps = Math.ceil(w / (len / 2)) + 1;
  for (let i = 0; i <= steps; i++) {
    const x = i * (len / 2) + phase - len;
    const dir = i % 2 ? -1 : 1;
    d += ` Q${x + len / 4} ${y + dir * amp} ${x + len / 2} ${y}`;
  }
  return `${d} L${w} ${h} Z`;
}

function ferry(p, opts = {}) {
  const { windows = p.window, name = 'SKERRY LINE' } = opts;
  let lower = '';
  for (let i = 0; i < 27; i++) {
    lower += `<rect x="${78 + i * 15.6}" y="72" width="9" height="11" rx="1.5" fill="${windows}"/>`;
  }
  let upper = '';
  for (let i = 0; i < 15; i++) {
    upper += `<rect x="${126 + i * 19.4}" y="43" width="12" height="11" rx="1.5" fill="${windows}"/>`;
  }
  return `
  <g>
    <path d="M300 2 L300 -26" stroke="${p.hull}" stroke-width="3"/>
    <path d="M300 -22 L340 -16 M300 -14 L330 -9" stroke="${p.hull}" stroke-width="1.5"/>
    <path d="M222 34 L228 -6 L276 -6 L282 34 Z" fill="${p.funnel}"/>
    <rect x="226.5" y="4" width="51" height="10" fill="${p.white}"/>
    <rect x="228" y="-6" width="48" height="5" fill="${p.hull}"/>
    <rect x="356" y="8" width="104" height="26" rx="2" fill="${p.white}"/>
    <rect x="364" y="14" width="88" height="10" rx="1" fill="${windows}"/>
    <rect x="344" y="30" width="128" height="5" fill="${p.white}"/>
    <rect x="108" y="33" width="376" height="29" rx="2" fill="${p.white}"/>
    ${upper}
    <rect x="58" y="62" width="478" height="34" rx="2" fill="${p.white}"/>
    ${lower}
    <path d="M58 62 L536 62" stroke="${p.line}" stroke-width="1.5"/>
    <path d="M6 96 L596 96 Q616 96 632 72 L612 152 Q608 164 594 164 L48 164 Q30 164 24 150 Z" fill="${p.hull}"/>
    <path d="M20.5 142 L616.5 142 L612 152 Q608 164 594 164 L48 164 Q30 164 24 150 Z" fill="${p.boot}"/>
    <path d="M6 96 L596 96" stroke="${p.white}" stroke-width="2.5" opacity="0.85"/>
    <text x="120" y="128" font-family="Futura, 'Avenir Next', sans-serif" font-weight="500" font-size="20" letter-spacing="5" fill="${p.white}">${name}</text>
    <rect x="462" y="108" width="84" height="26" rx="1" fill="none" stroke="${p.white}" stroke-width="1.4" opacity="0.7"/>
    <path d="M504 108 V134" stroke="${p.white}" stroke-width="1.4" opacity="0.7"/>
  </g>`;
}

function gull(x, y, s, c) {
  return `<path d="M${x} ${y} q${6 * s} ${-6 * s} ${11 * s} 0 q${5 * s} ${-6 * s} ${11 * s} 0" fill="none" stroke="${c}" stroke-width="${1.6 * Math.max(s, 0.8)}" stroke-linecap="round"/>`;
}

function lighthouse(x, y, s, p) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-7 0 L-5 -44 L5 -44 L7 0 Z" fill="${p.white}"/>
    <path d="M-6.3 -14 L6.3 -14 L5.8 -24 L-5.8 -24 Z" fill="${p.boot}"/>
    <rect x="-6.5" y="-47" width="13" height="3" fill="${p.hull}"/>
    <rect x="-3.5" y="-55" width="7" height="8" fill="${p.sun}"/>
    <path d="M-5 -55 L0 -61 L5 -55 Z" fill="${p.hull}"/>
  </g>`;
}

/** The hero scene. `p` is the palette; `shift` slides the ferry horizontally. */
function harbour({ w = 1440, h = 680, p, ferryX = 660, ferryY = 330, ferryScale = 1 }) {
  const sea = Math.round(h * 0.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
    <rect width="${w}" height="${h}" fill="${p.sky}"/>
    <rect y="${sea - 150}" width="${w}" height="74" fill="${p.sky2}"/>
    <rect y="${sea - 76}" width="${w}" height="76" fill="${p.sky3}"/>
    <circle cx="${w * 0.74}" cy="${sea - 118}" r="86" fill="${p.sun}"/>
    <path d="M0 ${sea} L0 ${sea - 58} C120 ${sea - 92} 210 ${sea - 112} 330 ${sea - 74} C420 ${sea - 48} 500 ${sea - 40} 620 ${sea - 26} L760 ${sea} Z" fill="${p.far}"/>
    <path d="M${w} ${sea} L${w} ${sea - 96} C${w - 110} ${sea - 136} ${w - 210} ${sea - 96} ${w - 320} ${sea - 62} C${w - 430} ${sea - 32} ${w - 520} ${sea - 20} ${w - 600} ${sea} Z" fill="${p.far}"/>
    <path d="M0 ${sea} L0 ${sea - 26} C90 ${sea - 50} 170 ${sea - 40} 260 ${sea - 20} C330 ${sea - 8} 400 ${sea - 6} 470 ${sea} Z" fill="${p.mid}"/>
    <path d="M${w} ${sea} L${w} ${sea - 44} C${w - 70} ${sea - 66} ${w - 150} ${sea - 54} ${w - 230} ${sea - 26} C${w - 280} ${sea - 10} ${w - 330} ${sea - 4} ${w - 380} ${sea} Z" fill="${p.mid}"/>
    ${lighthouse(w - 150, sea - 53, 1.2, p)}
    <rect y="${sea}" width="${w}" height="${h - sea}" fill="${p.sea1}"/>
    <rect x="${w * 0.74 - 110}" y="${sea + 4}" width="220" height="3" fill="${p.sun}" opacity="0.55"/>
    <rect x="${w * 0.74 - 70}" y="${sea + 14}" width="140" height="3" fill="${p.sun}" opacity="0.4"/>
    <rect x="${w * 0.74 - 38}" y="${sea + 24}" width="76" height="3" fill="${p.sun}" opacity="0.28"/>
    <path d="${wave(sea + 36, 3, 150, w, h, 20)}" fill="${p.sea2}"/>
    <g transform="translate(${ferryX} ${ferryY}) scale(${ferryScale})">${ferry(p)}</g>
    <path d="${wave(ferryY + 158 * ferryScale, 5, 120, w, h, 44)}" fill="${p.sea3}"/>
    <path d="M${ferryX + 6 * ferryScale} ${ferryY + 160 * ferryScale} q-60 6 -170 3 q90 12 180 8 Z" fill="${p.white}" opacity="0.55"/>
    <path d="M${ferryX + 620 * ferryScale} ${ferryY + 158 * ferryScale} q22 4 34 -2 q-4 12 -36 12 Z" fill="${p.white}" opacity="0.7"/>
    <path d="${wave(h - 92, 7, 170, w, h, 12)}" fill="${p.sea4}"/>
    <path d="${wave(h - 44, 8, 210, w, h, 90)}" fill="${p.sea5}"/>
    ${gull(w * 0.59, sea - 192, 1.1, p.gull)}${gull(w * 0.63, sea - 214, 0.8, p.gull)}${gull(w * 0.86, sea - 228, 1, p.gull)}${gull(w * 0.56, sea - 160, 0.7, p.gull)}
  </svg>`;
}

/** The fleet section: a plan-style side elevation with dimension lines. */
function elevation(p, { w = 760, h = 310 } = {}) {
  const ink = p.dim;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
    <g transform="translate(52 66)">${ferry({ ...p, white: p.plan }, { name: 'MV KITTIWAKE' })}</g>
    <path d="M0 ${66 + 150} H${w}" stroke="${ink}" stroke-width="1" stroke-dasharray="6 5"/>
    <text x="4" y="${66 + 144}" font-family="'IBM Plex Mono', Menlo, monospace" font-size="11" fill="${ink}">WL</text>
    <g stroke="${ink}" stroke-width="1" fill="none">
      <path d="M58 256 V276 M684 256 V276 M58 268 H684"/>
      <path d="M58 268 l8 -4 v8 z M684 268 l-8 -4 v8 z" fill="${ink}"/>
    </g>
    <text x="371" y="292" text-anchor="middle" font-family="Menlo, monospace" font-size="12" fill="${ink}">72.4 m LOA</text>
  </svg>`;
}

function cliffs(p, w = 432, h = 270) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="display:block">
    <rect width="${w}" height="${h}" fill="${p.sky}"/>
    <rect y="96" width="${w}" height="40" fill="${p.sky2}"/>
    <circle cx="94" cy="66" r="32" fill="${p.sun}"/>
    <path d="M${w} 54 L290 40 L232 72 L204 118 L168 150 L148 208 L${w} 208 Z" fill="${p.far}"/>
    <path d="M${w} 102 L322 92 L288 132 L256 146 L238 208 L${w} 208 Z" fill="${p.mid}"/>
    <path d="M204 118 L232 72 L222 150 Z M256 146 L288 132 L272 192 Z" fill="${p.mid}" opacity="0.7"/>
    <rect y="196" width="${w}" height="74" fill="${p.sea2}"/>
    <path d="${wave(214, 3, 72, w, h)}" fill="${p.sea3}"/>
    <path d="${wave(240, 4, 96, w, h, 30)}" fill="${p.sea4}"/>
    ${gull(70, 134, 1, p.gull)}${gull(116, 112, 0.7, p.gull)}${gull(36, 110, 0.6, p.gull)}
  </svg>`;
}

function dunes(p, w = 432, h = 270) {
  let huts = '';
  [
    [86, p.boot],
    [132, p.white],
    [178, p.funnel],
    [224, p.white],
    [270, p.boot]
  ].forEach(([x, c]) => {
    huts += `<g transform="translate(${x} 142)"><path d="M0 16 L18 2 L36 16 Z" fill="${p.hull}"/><rect x="3" y="16" width="30" height="28" fill="${c}"/><rect x="13" y="26" width="10" height="18" fill="${p.hull}" opacity="0.75"/></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="display:block">
    <rect width="${w}" height="${h}" fill="${p.sky}"/>
    <rect y="70" width="${w}" height="50" fill="${p.sky2}"/>
    <circle cx="340" cy="60" r="30" fill="${p.sun}"/>
    <rect y="120" width="${w}" height="34" fill="${p.sea2}"/>
    <path d="M0 158 C70 128 132 146 210 150 C296 154 360 128 ${w} 150 L${w} 200 L0 200 Z" fill="${p.sand2}"/>
    ${huts}
    <path d="M0 186 C110 168 230 190 ${w} 172 L${w} ${h} L0 ${h} Z" fill="${p.sand}"/>
    <g stroke="${p.mid}" stroke-width="1.6" fill="none" stroke-linecap="round">
      <path d="M36 210 q-6 -16 -12 -22 M40 210 q0 -18 2 -26 M44 210 q6 -14 12 -20"/>
      <path d="M372 226 q-6 -16 -12 -22 M376 226 q0 -18 2 -26 M380 226 q6 -14 12 -20"/>
      <path d="M322 240 q-4 -12 -9 -17 M325 240 q0 -14 2 -20 M328 240 q5 -11 9 -15"/>
    </g>
  </svg>`;
}

function light(p, w = 432, h = 270) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="display:block">
    <rect width="${w}" height="${h}" fill="${p.sky}"/>
    <rect y="104" width="${w}" height="42" fill="${p.sky2}"/>
    <path d="M216 62 L${w} 18 L${w} 66 Z" fill="${p.sun}" opacity="0.55"/>
    <path d="M216 62 L0 14 L0 60 Z" fill="${p.sun}" opacity="0.35"/>
    <path d="M86 202 C118 174 150 170 186 146 C214 128 246 128 276 146 C310 168 352 176 380 202 Z" fill="${p.mid}"/>
    ${lighthouse(226, 142, 2, p)}
    <rect x="248" y="124" width="28" height="18" fill="${p.white}"/>
    <path d="M244 124 L262 112 L280 124 Z" fill="${p.boot}"/>
    <rect y="196" width="${w}" height="74" fill="${p.sea2}"/>
    <path d="${wave(216, 3, 64, w, h, 8)}" fill="${p.sea3}"/>
    <path d="${wave(242, 4, 110, w, h, 40)}" fill="${p.sea4}"/>
  </svg>`;
}

const dawn = {
  sky: '#efe6d8',
  sky2: '#f2dfc9',
  sky3: '#f5d7bb',
  sun: '#f8c8a0',
  far: '#d3dcd8',
  mid: '#b9cbc9',
  sea1: '#c9dcdb',
  sea2: '#b7d0d2',
  sea3: '#a6c4c9',
  sea4: '#93b6bd',
  sea5: '#82a8b1',
  white: '#fbf8f2',
  hull: '#5d7f8c',
  boot: '#d98f76',
  funnel: '#d98f76',
  window: '#7f9fa9',
  line: '#c3cfcf',
  gull: '#8aa4ab',
  sand: '#ecd9bb',
  sand2: '#e4cca7',
  dim: '#8797a0',
  plan: '#e4e4da'
};

const dusk = {
  sky: '#0f2a42',
  sky2: '#16354f',
  sky3: '#214661',
  sun: '#f4a259',
  far: '#28546f',
  mid: '#1b4059',
  sea1: '#1a4560',
  sea2: '#143a54',
  sea3: '#0f3048',
  sea4: '#0b273c',
  sea5: '#081e30',
  white: '#fbf6ea',
  hull: '#0a1c2d',
  boot: '#e8553a',
  funnel: '#e8553a',
  window: '#203c55',
  line: '#c9d2d6',
  gull: '#cfdce0',
  sand: '#f1d9ad',
  sand2: '#e6c48c',
  dim: '#40566a',
  plan: '#e2dac2'
};

// A daylight variant of the same palette for V2's illustrated island cards,
// so the islands read clearly against the page.
const day = {
  sky: '#cfe3e4',
  sky2: '#dcebe6',
  sky3: '#e8efe2',
  sun: '#f4a259',
  far: '#2f6175',
  mid: '#1b4059',
  sea1: '#4c8c9c',
  sea2: '#3a7a8d',
  sea3: '#2a667b',
  sea4: '#1d5268',
  sea5: '#143f55',
  white: '#fbf6ea',
  hull: '#0a1c2d',
  boot: '#e8553a',
  funnel: '#e8553a',
  window: '#203c55',
  line: '#c9d2d6',
  gull: '#10293d',
  sand: '#f1d9ad',
  sand2: '#e6c48c',
  dim: '#40566a',
  plan: '#e2dac2'
};

window.SkerryArt = { harbour, elevation, cliffs, dunes, light, ferry, dawn, dusk, day };
