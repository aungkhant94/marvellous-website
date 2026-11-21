// Marvellous — particle scene (GPU simulation).
// Sculptures (the M, the robot) are lit like solid objects and turn on a pedestal.
// Every particle has a position and a velocity, kept in float textures and updated on the
// GPU each frame. Forces: a spring toward a moving target shape, a curl-noise flow field,
// and a fluid-like swirl around the pointer. Pages pick the target shape through set().
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

// Shape indexes used by data-shape in the pages.
export const SHAPES = { galaxy: 0, code: 1, network: 2, neural: 3, globe: 4, mark: 5, bot: 6, loop: 7, chinthe: 8 };

const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  vec3 noise3(vec3 x) {
    return vec3(snoise(x), snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)), snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
  }
  vec3 curl(vec3 p) {
    const float e = 0.1;
    vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
    vec3 px0 = noise3(p - dx), px1 = noise3(p + dx);
    vec3 py0 = noise3(p - dy), py1 = noise3(p + dy);
    vec3 pz0 = noise3(p - dz), pz1 = noise3(p + dz);
    vec3 c = vec3(py1.z - py0.z - pz1.y + pz0.y, pz1.x - pz0.x - px1.z + px0.z, px1.y - px0.y - py1.x + py0.x);
    return c / (length(c) + 1e-4);
  }
`;

// ---------- Sculptures: surfaces sampled from signed distance fields on the CPU ----------
// Each sculpture is stored as two textures (position + gold flag, normal), one texel per
// particle, so the GPU can light it like a solid object and turn it on its pedestal.
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function sdRoundBox(px, py, pz, bx, by, bz, r) {
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r, qz = Math.abs(pz) - bz + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
function sdCapsule(px, py, pz, a, b, r) {
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
const sdSphere = (px, py, pz, c, r) => len(px - c[0], py - c[1], pz - c[2]) - r;
function sdCylX(px, py, pz, cx, cy, cz, r, h) { // cylinder along x
  const d1 = Math.hypot(py - cy, pz - cz) - r, d2 = Math.abs(px - cx) - h;
  return Math.min(Math.max(d1, d2), 0) + Math.hypot(Math.max(d1, 0), Math.max(d2, 0));
}

// The Marvellous M, extruded with rounded edges.
const M_PTS = [[-1.35, -1.55], [-1.35, 1.55], [0, -0.05], [1.35, 1.55], [1.35, -1.55]];
function sdMark(px, py, pz) {
  let d = 1e9;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = M_PTS[i], [bx, by] = M_PTS[i + 1];
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
    d = Math.min(d, Math.hypot(pax - bax * h, pay - bay * h));
  }
  const wx = d - 0.26, wy = Math.abs(pz) - 0.3;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - 0.07;
}
const markGold = () => 0;

// "Mav", an original Marvellous robot bust: rounded head, recessed visor, gold eyes,
// ear discs, antenna with a gold tip, neck and shoulders.
const EYE_L = v3(-0.36, 0.62, 0.66), EYE_R = v3(0.36, 0.62, 0.66), TIP = v3(0.32, 2.12, 0);
function sdBot(px, py, pz) {
  let head = sdRoundBox(px, py - 0.55, pz, 0.98, 0.82, 0.86, 0.42);
  const visor = sdRoundBox(px, py - 0.6, pz - 0.86, 0.72, 0.3, 0.22, 0.18);
  head = Math.max(head, -visor); // carve the visor
  let d = head;
  d = Math.min(d, sdSphere(px, py, pz, EYE_L, 0.13));
  d = Math.min(d, sdSphere(px, py, pz, EYE_R, 0.13));
  d = Math.min(d, sdCylX(px, py, pz, 1.02, 0.55, 0, 0.34, 0.1));
  d = Math.min(d, sdCylX(px, py, pz, -1.02, 0.55, 0, 0.34, 0.1));
  d = smin(d, sdCapsule(px, py, pz, v3(0, 1.3, 0), v3(0.28, 1.98, 0), 0.05), 0.12);
  d = Math.min(d, sdSphere(px, py, pz, TIP, 0.14));
  d = smin(d, sdCapsule(px, py, pz, v3(0, -0.2, 0), v3(0, -0.6, 0), 0.34), 0.2);
  let body = sdRoundBox(px, py + 1.2, pz, 1.25, 0.5, 0.68, 0.45);
  body = Math.max(body, -(py + 1.55)); // cut flat below the shoulders
  return smin(d, body, 0.25);
}
const botGold = (x, y, z) => (sdSphere(x, y, z, EYE_L, 0.15) < 0 || sdSphere(x, y, z, EYE_R, 0.15) < 0 || sdSphere(x, y, z, TIP, 0.16) < 0 ? 1 : 0);

// A Chinthe: Myanmar's seated temple guardian lion, our own stylised sculpture after the
// traditional form. Tall straight front legs with ornamental bands, a wide chest with a
// breastplate, body sloping to round haunches, stacked beaded collars, a square face with
// big eyes and a wide-open jaw with fangs, a pointed crown with flame plumes behind it,
// straps from the jaw to the chest, scroll curls on the hips and a tall leaf-shaped tail.
// The body is light; the ornaments are gold.
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = len(x, y, z), k1 = len(x / r[0], y / r[1], z / r[2]);
  return k1 ? (k0 * (k0 - 1)) / k1 : -1;
}
function sdRoundCone(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
const torusY = (px, py, pz, c, R, r) => Math.hypot(Math.hypot(px - c[0], pz - c[2]) - R, py - c[1]) - r;
const torusX = (px, py, pz, c, R, r) => Math.hypot(Math.hypot(py - c[1], pz - c[2]) - R, px - c[0]) - r;
// Flattened (blade-like) round cone for plumes and the tail leaf.
const blade = (px, py, pz, a, b, r1, r2, k) => sdRoundCone(px * k, py, pz, [a[0] * k, a[1], a[2]], [b[0] * k, b[1], b[2]], r1, r2) / k;

function chintheBody(px, py, pz) {
  const ax = Math.abs(px);
  let d = sdRoundBox(px, py + 1.72, pz - 0.05, 0.85, 0.1, 1.2, 0.04); // plinth
  d = smin(d, sdRoundCone(ax, py, pz, v3(0.34, 0.15, 0.62), v3(0.36, -1.45, 0.72), 0.26, 0.2), 0.08); // front legs
  d = smin(d, sdEllipsoid(ax, py, pz, v3(0.36, -1.53, 0.92), v3(0.24, 0.13, 0.32)), 0.06); // front paws
  for (const tx of [0.05, 0.14]) d = smin(d, sdSphere(ax, py, pz, v3(0.36 + (tx - 0.095) * 1.6, -1.57, 1.18), 0.07), 0.03); // toes
  for (const tx of [-0.05]) d = smin(d, sdSphere(ax, py, pz, v3(0.36 + tx * 2.6, -1.57, 1.16), 0.07), 0.03);
  d = smin(d, sdEllipsoid(px, py, pz, v3(0, 0.1, 0.42), v3(0.62, 0.72, 0.5)), 0.15); // chest
  d = smin(d, sdRoundCone(px, py, pz, v3(0, 0.0, 0.15), v3(0, -0.8, -0.55), 0.55, 0.58), 0.15); // body slopes back
  d = smin(d, sdEllipsoid(ax, py, pz, v3(0.38, -0.95, -0.65), v3(0.4, 0.52, 0.6)), 0.12); // haunches
  d = smin(d, sdEllipsoid(ax, py, pz, v3(0.42, -1.55, -0.18), v3(0.2, 0.11, 0.32)), 0.06); // rear paws
  d = smin(d, sdEllipsoid(px, py, pz, v3(0, 0.85, 0.45), v3(0.46, 0.55, 0.44)), 0.12); // neck
  d = smin(d, sdEllipsoid(px, py, pz, v3(0, 1.38, 0.72), v3(0.45, 0.4, 0.45)), 0.1); // head
  d = smin(d, sdRoundBox(px, py - 1.36, pz - 1.18, 0.27, 0.12, 0.26, 0.1), 0.06); // upper jaw
  d = smin(d, sdSphere(px, py, pz, v3(0, 1.43, 1.42), 0.1), 0.05); // nose
  d = smin(d, sdRoundBox(px, py - 0.98, pz - 1.14, 0.25, 0.07, 0.24, 0.06), 0.06); // lower jaw
  d = Math.max(d, -sdRoundBox(px, py - 1.16, pz - 1.27, 0.21, 0.08, 0.24, 0.03)); // open mouth
  d = smin(d, sdEllipsoid(ax, py, pz, v3(0.4, 1.66, 0.55), v3(0.1, 0.2, 0.12)), 0.04); // ears
  d = smin(d, sdRoundCone(px, py, pz, v3(0, -0.7, -1.05), v3(0, 0.0, -1.3), 0.12, 0.1), 0.1); // tail
  d = smin(d, sdRoundCone(px, py, pz, v3(0, 0.0, -1.3), v3(0, 0.5, -1.2), 0.1, 0.09), 0.05);
  return d;
}
function chintheGoldParts(px, py, pz) {
  const ax = Math.abs(px);
  let g = 1e9;
  for (const y of [-0.25, -0.8]) g = Math.min(g, torusY(ax, py, pz, v3(0.35, y, 0.66), 0.235, 0.045)); // leg bands
  g = Math.min(g, sdEllipsoid(px, py, pz, v3(0, 0.0, 0.84), v3(0.5, 0.38, 0.1))); // breastplate
  g = Math.min(g, sdSphere(px, py, pz, v3(0, 0.05, 0.93), 0.12)); // medallion
  g = Math.min(g, torusX(ax, py, pz, v3(0.77, -0.85, -0.6), 0.24, 0.045)); // hip scrolls
  for (const [y, R] of [[0.55, 0.47], [0.72, 0.45], [0.89, 0.42]]) g = Math.min(g, torusY(px, py, pz, v3(0, y, 0.45 + (y - 0.6) * 0.2), R, 0.07)); // collars
  g = Math.min(g, sdEllipsoid(ax, py, pz, v3(0.43, 1.3, 0.76), v3(0.14, 0.28, 0.2))); // cheek plates
  g = Math.min(g, sdSphere(ax, py, pz, v3(0.2, 1.5, 1.08), 0.11)); // eyes
  g = Math.min(g, sdCapsule(px, py, pz, v3(-0.32, 1.62, 0.98), v3(0.32, 1.62, 0.98), 0.07)); // brow
  g = Math.min(g, sdCapsule(ax, py, pz, v3(0.17, 1.25, 1.36), v3(0.17, 1.1, 1.38), 0.035)); // upper fangs
  g = Math.min(g, sdCapsule(ax, py, pz, v3(0.15, 1.04, 1.33), v3(0.15, 1.15, 1.34), 0.03)); // lower fangs
  g = Math.min(g, sdRoundCone(px, py, pz, v3(0, 1.72, 0.78), v3(0, 2.18, 0.72), 0.17, 0.02)); // crown
  g = Math.min(g, blade(px, py, pz, v3(0, 1.7, 0.45), v3(0, 2.32, 0.22), 0.15, 0.03, 1.8)); // plumes
  g = Math.min(g, blade(px, py, pz, v3(0, 1.64, 0.18), v3(0, 2.2, -0.08), 0.14, 0.03, 1.8));
  g = Math.min(g, blade(px, py, pz, v3(0, 1.52, -0.02), v3(0, 1.98, -0.28), 0.12, 0.03, 1.8));
  g = Math.min(g, sdRoundCone(ax, py, pz, v3(0.24, 1.0, 1.05), v3(0.3, 0.25, 0.85), 0.07, 0.05)); // jaw straps
  g = Math.min(g, blade(px, py, pz, v3(0, 0.45, -1.2), v3(0, 1.38, -0.9), 0.3, 0.04, 2.2)); // tail leaf
  return g;
}
const sdChinthe = (x, y, z) => smin(chintheBody(x, y, z), chintheGoldParts(x, y, z), 0.04);
const chintheGold = (x, y, z) => (chintheGoldParts(x, y, z) < chintheBody(x, y, z) + 0.02 ? 1 : 0);

// A Mobius loop: one endless surface — building and running as one cycle.
// Parametric ribbon with a little thickness, stood up and tilted.
function sampleLoop(count, rand) {
  const pos = new Float32Array(count * 4), nrm = new Float32Array(count * 4);
  const R = 1.3, W = 0.52, T = 0.06, tilt = 0.38;
  const P = (u, v) => {
    const c = R + v * Math.cos(u / 2);
    return [c * Math.cos(u), c * Math.sin(u), v * Math.sin(u / 2)];
  };
  const e = 1e-3, ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < count; i++) {
    const u = rand() * Math.PI * 2, v = (rand() * 2 - 1) * W;
    const p = P(u, v), pu = P(u + e, v), pv = P(u, v + e);
    const ax = pu[0] - p[0], ay = pu[1] - p[1], az = pu[2] - p[2];
    const bx = pv[0] - p[0], by = pv[1] - p[1], bz = pv[2] - p[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = len(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const side = rand() < 0.5 ? 1 : -1; // both faces of the ribbon
    nx *= side; ny *= side; nz *= side;
    let x = p[0] + nx * T, y = p[1] + ny * T, z = p[2] + nz * T;
    // stand it up: rotate about x
    const y2 = y * ct - z * st, z2 = y * st + z * ct;
    const ny2 = ny * ct - nz * st, nz2 = ny * st + nz * ct;
    const gold = Math.abs(v) > W * 0.965 ? 1 : 0; // fine gold edges
    pos.set([x, y2 + 0.05, z2, gold], i * 4);
    nrm.set([nx, ny2, nz2, 0], i * 4);
  }
  return { pos, nrm };
}

// The Marvellous logo (the M inside a graduation cap), extruded from logo.png.
// Faces are sampled from opaque pixels, side walls from edge pixels. The solid M stays
// light; the thin cap outline is gold. Writes straight into the given arrays.
function sampleLogo(img, pos, nrm, count, rand) {
  const W = 512, H = Math.round((512 * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const data = g.getImageData(0, 0, W, H).data;
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inside[i] = data[i * 4 + 3] > 120 ? 1 : 0;
  // Chamfer distance to the outside tells thick strokes (the M) from thin ones (the cap).
  const dist = (seed) => {
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = seed[i] ? 1e6 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - W] + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - W - 1] + 1.414);
      if (x < W - 1 && y > 0) d[i] = Math.min(d[i], d[i - W + 1] + 1.414);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < H - 1) d[i] = Math.min(d[i], d[i + W] + 1);
      if (x < W - 1 && y < H - 1) d[i] = Math.min(d[i], d[i + W + 1] + 1.414);
      if (x > 0 && y < H - 1) d[i] = Math.min(d[i], d[i + W - 1] + 1.414);
    }
    return d;
  };
  const dIn = dist(inside);
  const core = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) core[i] = dIn[i] >= 8 ? 0 : 1; // 0 marks the thick core
  const dCore = dist(core); // distance to the thick core
  const faces = [], edges = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!inside[i]) continue;
    faces.push(i);
    if (!inside[i - 1] || !inside[i + 1] || !inside[i - W] || !inside[i + W]) edges.push(i);
  }
  const S = 4.3 / W, D = 0.34; // world units per pixel, depth
  const faceArea = faces.length * 2, sideArea = edges.length * (D / S);
  const toWorld = (x, y) => [(x - W / 2) * S, (H / 2 - y) * S];
  for (let k = 0; k < count; k++) {
    let i, x, y, z, nx = 0, ny = 0, nz;
    if (rand() * (faceArea + sideArea) < faceArea) {
      i = faces[Math.floor(rand() * faces.length)];
      x = (i % W) + rand(); y = Math.floor(i / W) + rand();
      nz = rand() < 0.5 ? 1 : -1; z = (nz * D) / 2;
    } else {
      i = edges[Math.floor(rand() * edges.length)];
      x = (i % W) + 0.5; y = Math.floor(i / W) + 0.5; z = (rand() - 0.5) * D; nz = 0;
      nx = inside[i - 1] - inside[i + 1]; ny = inside[i + W] - inside[i - W]; // points outward, image y down
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    }
    const [wx, wy] = toWorld(x, y);
    const gold = dCore[i] > 2.5 ? 1 : 0; // thin cap outline → gold
    pos.set([wx, wy + 0.1, z, gold], k * 4);
    nrm.set([nx, ny, nz, 0], k * 4);
  }
}

function sampleSurface(sdf, gold, box, count, rand) {
  // Sample up to 12k true surface points (the slow part), then fill the rest with
  // copies nudged along the surface — visually identical, about 5x faster.
  const pos = new Float32Array(count * 4), nrm = new Float32Array(count * 4);
  const base = Math.min(count, 12000), eps = 0.03, h = 0.004;
  let n = 0, guard = 0;
  while (n < base && guard++ < 3e7) {
    const x = box[0] + rand() * (box[3] - box[0]), y = box[1] + rand() * (box[4] - box[1]), z = box[2] + rand() * (box[5] - box[2]);
    const d = sdf(x, y, z);
    if (Math.abs(d) > eps) continue;
    let gx = sdf(x + h, y, z) - sdf(x - h, y, z), gy = sdf(x, y + h, z) - sdf(x, y - h, z), gz = sdf(x, y, z + h) - sdf(x, y, z - h);
    const gl = len(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    const sx = x - gx * d, sy = y - gy * d, sz = z - gz * d;
    pos.set([sx, sy, sz, gold(sx, sy, sz)], n * 4);
    nrm.set([gx, gy, gz, 0], n * 4);
    n++;
  }
  for (let i = n; i < count; i++) {
    const j = Math.floor(rand() * n) * 4;
    const nx = nrm[j], ny = nrm[j + 1], nz = nrm[j + 2];
    let jx = rand() - 0.5, jy = rand() - 0.5, jz = rand() - 0.5;
    const dn = jx * nx + jy * ny + jz * nz; // keep the nudge in the surface plane
    jx = (jx - dn * nx) * 0.07; jy = (jy - dn * ny) * 0.07; jz = (jz - dn * nz) * 0.07;
    pos.set([pos[j] + jx, pos[j + 1] + jy, pos[j + 2] + jz, pos[j + 3]], i * 4);
    nrm.set([nx, ny, nz, 0], i * 4);
  }
  return { pos, nrm };
}

// ---------- Target shapes (GLSL) ----------
// s = four random numbers per particle, uv = its texel, t = time.
const SHAPES_GLSL = /* glsl */ `
  #define PI 3.14159265
  #define TAU 6.28318531
  uniform vec3 uCities[14];
  uniform vec3 uYangon;
  uniform float uGlobeYaw;
  uniform sampler2D uMarkPos, uMarkNrm, uBotPos, uBotNrm, uLoopPos, uLoopNrm, uChinPos, uChinNrm;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  vec3 sphereDir(float a, float b) { float th = a * TAU, ph = acos(2.0 * b - 1.0); return vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)); }

  vec3 galaxy(vec4 s, float t) {
    vec3 p;
    if (s.z > 0.86) {
      p = sphereDir(s.x, s.w) * pow(s.y, 2.0) * 0.6 * vec3(1.0, 0.5, 1.0);
      p = rotY(p, t * 0.8);
    } else {
      float r = 0.18 + pow(s.x, 0.9) * 2.45;
      float arm = floor(s.z / 0.86 * 3.0);
      float spread = (s.w - 0.5) * (s.w - 0.5) * sign(s.w - 0.5) * 2.4 / (r + 0.5);
      float th = arm * TAU / 3.0 + log(r) * 1.35 + spread - t * 0.5 / sqrt(r);
      p = vec3(cos(th) * r, (hash(s.y * 91.7) - 0.5) * 0.16 * (2.8 - r), sin(th) * r);
    }
    return rotZ(rotX(p, 1.12), 0.35);
  }
  vec3 helix(vec4 s, float t) {
    float y = s.x * 5.2 - 2.6;
    float a = y * 1.9 + t * 0.6;
    vec3 p;
    if (s.z < 0.78) {
      float strand = step(0.5, s.y);
      float rad = 0.9 + (s.w - 0.5) * 0.14;
      p = vec3(cos(a + strand * PI) * rad, y, sin(a + strand * PI) * rad);
    } else {
      float k = floor(s.x * 30.0) / 30.0 * 5.2 - 2.6;
      float ak = k * 1.9 + t * 0.6;
      vec3 A = vec3(cos(ak) * 0.9, k, sin(ak) * 0.9);
      p = mix(A, vec3(-A.x, k, -A.z), s.y) + (s.w - 0.5) * 0.03;
    }
    return rotZ(p, 0.95);
  }
  vec3 knot(vec4 s, float t) {
    float u = fract(s.x + t * 0.022) * TAU;
    float r = 2.0 + cos(3.0 * u);
    vec3 c = vec3(r * cos(2.0 * u), r * sin(2.0 * u), -sin(3.0 * u) * 1.3) * 0.6;
    vec3 o = sphereDir(s.y, s.w) * 0.24 * sqrt(s.z);
    return rotY(rotX(c + o, 0.55), t * 0.1);
  }
  vec3 orbits(vec4 s, float t) {
    if (s.z > 0.84) return rotY(sphereDir(s.x, s.y) * (0.42 + s.w * 0.12), t * 0.4);
    float ring = floor(s.x * 9.0);
    float n1 = hash(ring * 3.17 + 1.0), n2 = hash(ring * 7.71 + 2.0);
    float R = 1.2 + ring * 0.12;
    float dir = mod(ring, 2.0) * 2.0 - 1.0;
    float a = s.y * TAU + t * (0.3 + n1 * 0.5) * dir;
    vec3 p = vec3(cos(a) * R, (s.w - 0.5) * 0.05, sin(a) * R);
    return rotY(rotX(p, n1 * PI), n2 * TAU + t * 0.08);
  }
  vec3 globe(vec4 s, float t) {
    float R = 1.75;
    vec3 p;
    if (s.z < 0.55) {
      float y = (floor((s.x * 2.0 - 1.0) * 22.0) + 0.5) / 22.0;
      float lon = s.y * TAU;
      float rr = sqrt(max(0.0, 1.0 - y * y));
      p = vec3(cos(lon) * rr, y, sin(lon) * rr) * R;
    } else if (s.z < 0.64) {
      p = uYangon * 1.02 + (vec3(s.x, s.y, s.w) - 0.5) * 0.14;
    } else {
      vec3 c = uCities[int(floor(s.x * 13.99))];
      float k = abs(fract(s.y + t * 0.1) * 2.0 - 1.0);
      vec3 a = normalize(uYangon), b = normalize(c);
      float ang = acos(clamp(dot(a, b), -1.0, 1.0));
      p = normalize(mix(a, b, k) + 1e-4) * (R + sin(PI * k) * ang * 0.38) + (s.w - 0.5) * 0.015;
    }
    return rotX(rotY(p, uGlobeYaw + sin(t * 0.15) * 0.5), 0.25);
  }
  // Sculptures turn slowly on a pedestal of two glowing rings.
  float turn(float t) { return t * 0.42 + sin(t * 0.3) * 0.25; }
  // The flat logo sways instead of spinning, so it always faces the visitor.
  float sway(float t) { return sin(t * 0.45) * 0.7; }
  vec3 pedestal(vec4 s, float t, float y) {
    float ring = step(0.5, s.y);
    float R = mix(1.75, 2.25, ring);
    float a = s.x * TAU + t * mix(0.25, -0.15, ring);
    return vec3(cos(a) * R, y + (s.w - 0.5) * 0.03, sin(a) * R * 0.95);
  }
  vec3 sculpt(sampler2D tex, vec2 uv, vec4 s, float t, float base, float ang) {
    if (s.z > 0.9) return pedestal(s, t, base);
    return rotY(texture2D(tex, uv).xyz, ang);
  }
  vec3 shape(float id, vec4 s, vec2 uv, float t) {
    if (id < 0.5) return galaxy(s, t);
    if (id < 1.5) return helix(s, t);
    if (id < 2.5) return knot(s, t);
    if (id < 3.5) return orbits(s, t);
    if (id < 4.5) return globe(s, t);
    if (id < 5.5) return sculpt(uMarkPos, uv, s, t, -2.3, sway(t));
    if (id < 6.5) return sculpt(uBotPos, uv, s, t, -1.85, turn(t));
    if (id < 7.5) return sculpt(uLoopPos, uv, s, t, -2.05, turn(t));
    return sculpt(uChinPos, uv, s, t, -1.95, turn(t));
  }
  // Surface normal for lighting. Procedural shapes use a soft radial normal.
  vec4 shapeNormal(float id, vec4 s, vec2 uv, float t, vec3 p) {
    if (id > 4.5 && s.z <= 0.9) {
      vec3 n = id < 5.5 ? texture2D(uMarkNrm, uv).xyz : (id < 6.5 ? texture2D(uBotNrm, uv).xyz : (id < 7.5 ? texture2D(uLoopNrm, uv).xyz : texture2D(uChinNrm, uv).xyz));
      float g = id < 5.5 ? texture2D(uMarkPos, uv).w : (id < 6.5 ? texture2D(uBotPos, uv).w : (id < 7.5 ? texture2D(uLoopPos, uv).w : texture2D(uChinPos, uv).w));
      return vec4(rotY(n, id < 5.5 ? sway(t) : turn(t)), g);
    }
    return vec4(normalize(p + 1e-4), 0.0);
  }
`;

const VELOCITY = /* glsl */ `
  uniform sampler2D uSeed;
  uniform float uTime, uDt, uFrom, uTo, uMix, uSpring, uCurl, uDamp, uMouseOn;
  uniform vec3 uMouse, uMouseVel;
  ${NOISE}
  ${SHAPES_GLSL}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    vec4 s = texture2D(uSeed, uv);

    // Particles leave one after another, so a change of shape flows instead of jumping.
    float m = clamp((uMix - s.y * 0.35) / 0.65, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    vec3 target = mix(shape(uFrom, s, uv, uTime), shape(uTo, s, uv, uTime), m);

    // Idle life: at any moment a few particles break away, drift up and out, then return.
    float solidT = mix(step(4.5, uFrom), step(4.5, uTo), m);
    float ph = fract(s.w * 13.7 + s.x * 3.1 + uTime * 0.05);
    float shedFrac = mix(0.07, 0.04, solidT);
    float shed = ph < shedFrac ? sin(ph / shedFrac * PI) * mix(1.0, 0.75, solidT) : 0.0;
    target += (curl(target * 0.7 + uTime * 0.05) * 0.9 + vec3(0.0, 0.9, 0.0) + normalize(target + 1e-4) * 0.6) * shed;

    float dust = step(0.955, s.w);
    target = mix(target, (vec3(hash(s.x * 31.1), hash(s.y * 17.3), hash(s.z * 47.9)) - 0.5) * vec3(15.0, 10.0, 8.0), dust);

    vec3 f = (target - pos) * uSpring * (0.6 + s.x) * (1.0 - dust * 0.85);
    float flight = sin(PI * m);
    // Sculptures hold a crisp surface; the free shapes flow more.
    float solidW = mix(step(4.5, uFrom), step(4.5, uTo), m) * (1.0 - dust);
    f += curl(pos * 0.5 + vec3(0.0, uTime * 0.07, 0.0)) * ((uCurl * (1.0 - solidW * 0.8)) + flight * 3.5 + dust * 0.4);

    // Pointer: push out and swirl, like a hand moving through water.
    vec3 d = pos - uMouse;
    float fall = exp(-dot(d.xy, d.xy) * 1.6) * uMouseOn;
    f += (normalize(vec3(d.xy, d.z * 0.3) + 1e-4) * 5.0 + vec3(-d.y, d.x, 0.0) * 7.0) * fall;
    f += uMouseVel * fall * 2.5;

    vel = vel * pow(uDamp, uDt * 60.0) + f * uDt;
    gl_FragColor = vec4(vel, 1.0);
  }
`;

const POSITION = /* glsl */ `
  uniform float uDt;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 p = texture2D(texturePosition, uv).xyz;
    vec3 v = texture2D(textureVelocity, uv).xyz;
    gl_FragColor = vec4(p + v * uDt, 1.0);
  }
`;

const RENDER_VERT = /* glsl */ `
  uniform sampler2D tPos, tVel, uSeed;
  uniform float uSize, uPixelRatio, uFocus, uTime, uFrom, uTo, uMix;
  attribute vec2 ref;
  varying float vSpeed, vGold, vAlpha, vLight, vRim;
  ${SHAPES_GLSL}
  void main() {
    vec3 p = texture2D(tPos, ref).xyz;
    vec3 v = texture2D(tVel, ref).xyz;
    vec4 s = texture2D(uSeed, ref);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vSpeed = smoothstep(0.5, 4.0, length(v));

    // Light the particle as part of a solid: key light, fill and a rim.
    float m = clamp((uMix - s.y * 0.35) / 0.65, 0.0, 1.0);
    vec4 nA = shapeNormal(uFrom, s, ref, uTime, p);
    vec4 nB = shapeNormal(uTo, s, ref, uTime, p);
    vec4 nn = mix(nA, nB, m);
    vec3 n = normalize(normalMatrix * nn.xyz + 1e-4);
    float solid = mix(step(4.5, uFrom), step(4.5, uTo), m) * step(s.z, 0.9);
    float key = max(dot(n, normalize(vec3(-0.55, 0.65, 0.55))), 0.0);
    float rim = pow(1.0 - abs(n.z), 2.5);
    float lit = 0.3 + key * 0.95 + rim * 0.5;
    vLight = mix(0.85 + key * 0.3, lit, solid);
    vRim = rim * solid;

    vGold = max(step(fract(s.x * 13.7 + s.w * 7.1), 0.06) * (1.0 - solid * 0.8), nn.w);
    float blur = min(abs(-mv.z - uFocus) * 0.25, 1.2);
    float dust = step(0.955, s.w);
    float twinkle = 0.8 + 0.2 * sin(uTime * 2.3 + s.x * 60.0);
    float isMark = mix(step(4.5, uFrom) * step(uFrom, 5.5), step(4.5, uTo) * step(uTo, 5.5), m);
    // The M: one even, slightly larger bead size. Other sculptures keep the varied sizes.
    float sculptBead = mix(0.62 + pow(s.y, 3.0) * 1.5 + step(0.985, s.x) * 0.9, 0.62, isMark); // the logo: even, fine beads so the cap lines read
    float bead = mix(0.35 + s.y * s.y * 1.3, sculptBead, solid);
    float solidAll = mix(step(4.5, uFrom), step(4.5, uTo), m);
    gl_PointSize = uSize * bead * (1.0 + blur * 1.4 * (1.0 - solidAll)) * (1.0 - dust * mix(0.3, 0.8, solidAll)) * uPixelRatio / -mv.z;
    vAlpha = (0.35 + 0.65 * s.z) / (1.0 + blur * blur * 6.0) * (1.0 - dust * 0.75) * twinkle;
  }
`;

const RENDER_FRAG = /* glsl */ `
  uniform vec3 uBone, uGold;
  uniform float uDim, uSolid;
  varying float vSpeed, vGold, vAlpha, vLight, vRim;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    vec3 col = mix(uBone, uGold, max(vGold, vSpeed * 0.9));
    if (uSolid > 0.5) {
      // Opaque lit beads: each particle is a tiny sphere, so the figure reads as solid.
      if (r2 > 1.0) discard;
      vec3 sn = vec3(c.x, -c.y, sqrt(1.0 - r2));
      float ball = 0.45 + 0.55 * max(dot(sn, normalize(vec3(-0.45, 0.6, 0.65))), 0.0);
      vec3 base = mix(uBone * 0.92, uGold, max(vGold, vSpeed * 0.8));
      vec3 lit = base * vLight * ball + uGold * vRim * 0.55;
      gl_FragColor = vec4(lit * uDim * (0.85 + vGold * 0.15), 1.0);
      return;
    }
    float a = 1.0 - smoothstep(0.0, 1.0, sqrt(r2));
    a *= a;
    gl_FragColor = vec4(col * a * vAlpha * uDim * vLight * (0.75 + vSpeed * 1.4 + vGold * 0.8), 1.0);
  }
`;

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
}

export function createScene(canvas, { mobile = false, reduced = false, shapes = null } = {}) {
  // Build only the sculptures this page shows (they cost time at load); others reuse the M.
  const need = (name) => !shapes || shapes.has(name);
  const SIZE = mobile ? 128 : 256; // 16k or 65k particles
  const N = SIZE * SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 8);
  const TAN = Math.tan(THREE.MathUtils.degToRad(19));

  let r = 2018;
  const rand = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const floatTex = (data) => {
    const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
  };
  const seedData = new Float32Array(N * 4);
  for (let i = 0; i < seedData.length; i++) seedData[i] = rand();
  const seedTex = floatTex(seedData);

  // Sculptures.
  const mark = sampleSurface(sdMark, markGold, [-1.75, -1.95, -0.45, 1.75, 1.95, 0.45], N, rand);
  const bot = need('bot') ? sampleSurface(sdBot, botGold, [-1.4, -1.75, -1.0, 1.4, 2.3, 1.15], N, rand) : mark;
  const loop = need('loop') ? sampleLoop(N, rand) : mark;
  const chin = need('chinthe') ? sampleSurface(sdChinthe, chintheGold, [-1.0, -1.86, -1.62, 1.0, 2.42, 1.62], N, rand) : mark;
  const markPos = floatTex(mark.pos), markNrm = floatTex(mark.nrm), botPos = floatTex(bot.pos), botNrm = floatTex(bot.nrm);
  // Swap the plain M for the full logo (M with the cap) as soon as logo.png is ready.
  if (need('mark')) {
    const logo = new Image();
    logo.onload = () => {
      try {
        sampleLogo(logo, markPos.image.data, markNrm.image.data, N, rand);
        markPos.needsUpdate = true; markNrm.needsUpdate = true;
      } catch (e) { console.warn('logo sculpture unavailable', e); }
    };
    logo.src = 'logo.png';
  }
  const loopPos = floatTex(loop.pos), loopNrm = floatTex(loop.nrm), chinPos = floatTex(chin.pos), chinNrm = floatTex(chin.nrm);

  // Globe data: Yangon and the cities its arcs reach.
  const toVec = (lat, lon, rad = 1.75) => {
    const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon + 180);
    return new THREE.Vector3(-rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th));
  };
  const yangon = toVec(16.84, 96.17);
  const cities = [[1.35, 103.82], [13.75, 100.5], [35.68, 139.69], [37.57, 126.98], [22.32, 114.17], [-6.2, 106.85],
    [19.08, 72.88], [25.2, 55.27], [51.51, -0.13], [50.11, 8.68], [40.71, -74.0], [37.77, -122.42], [-33.87, 151.21], [31.23, 121.47]]
    .map(([la, lo]) => toVec(la, lo));
  const globeYaw = -Math.atan2(yangon.x, yangon.z);

  // Uniforms shared by the simulation and the renderer.
  const shared = {
    uSeed: { value: seedTex }, uTime: { value: 0 }, uFrom: { value: 0 }, uTo: { value: 0 }, uMix: { value: 0 },
    uCities: { value: cities }, uYangon: { value: yangon }, uGlobeYaw: { value: globeYaw },
    uMarkPos: { value: markPos }, uMarkNrm: { value: markNrm }, uBotPos: { value: botPos }, uBotNrm: { value: botNrm }, uLoopPos: { value: loopPos }, uLoopNrm: { value: loopNrm }, uChinPos: { value: chinPos }, uChinNrm: { value: chinNrm },
  };

  // Simulation.
  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
  if (mobile) gpu.setDataType(THREE.HalfFloatType);
  const pos0 = gpu.createTexture(), vel0 = gpu.createTexture();
  for (let i = 0; i < N; i++) {
    const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(6 + rand() * 6);
    pos0.image.data.set([d.x, d.y, d.z, 1], i * 4);
  }
  const velVar = gpu.addVariable('textureVelocity', VELOCITY, vel0);
  const posVar = gpu.addVariable('texturePosition', POSITION, pos0);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  const sim = {
    ...shared, uDt: { value: 1 / 60 },
    uSpring: { value: 0 }, uCurl: { value: 0.6 }, uDamp: { value: 0.9 }, uMouseOn: { value: 0 },
    uMouse: { value: new THREE.Vector3(99, 99, 0) }, uMouseVel: { value: new THREE.Vector3() },
  };
  Object.assign(velVar.material.uniforms, sim);
  posVar.material.uniforms.uDt = sim.uDt;
  const err = gpu.init();
  if (err) throw new Error(err);

  // Points that read their place from the simulation.
  const geo = new THREE.BufferGeometry();
  const refs = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { refs[i * 2] = ((i % SIZE) + 0.5) / SIZE; refs[i * 2 + 1] = (Math.floor(i / SIZE) + 0.5) / SIZE; }
  geo.setAttribute('ref', new THREE.BufferAttribute(refs, 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const uniforms = {
    ...shared, tPos: { value: null }, tVel: { value: null },
    uSize: { value: 40 }, uPixelRatio: { value: dpr }, uFocus: { value: 8 },
    uBone: { value: new THREE.Color('#EDEAE3') }, uGold: { value: new THREE.Color('#D4A24C') }, uDim: { value: 1 }, uSolid: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: RENDER_VERT, fragmentShader: RENDER_FRAG, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  const target = { from: 0, to: 0, mix: 0, x: 0, dim: 1, scale: 1 };
  const cur = { x: 0, dim: 1, scale: 1, rx: 0, ry: 0, energy: 0, timeScale: 1, slow: 1 };
  const mouse = { ndc: new THREE.Vector2(), on: 0, local: new THREE.Vector3(), last: new THREE.Vector3(), vel: new THREE.Vector3() };
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.8 ? 11.5 : 8;
    camera.updateProjectionMatrix();
    uniforms.uFocus.value = camera.position.z;
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduced) return;
    mouse.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    mouse.on = 1;
  });
  document.addEventListener('pointerleave', () => { mouse.on = 0; });
  // Press and hold anywhere outside links and buttons: time slows down.
  window.addEventListener('pointerdown', (e) => {
    if (reduced || e.button !== 0 || (e.target instanceof Element && e.target.closest('a, button, input, textarea'))) return;
    cur.slow = 0.08;
  });
  const release = () => { cur.slow = 1; };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  let introStart = null, simTime = 0, running = true;
  const clock = new THREE.Clock();
  if (location.hostname === '127.0.0.1') window.__mv = { sim, uniforms, group, camera, renderer, cur };

  function step(realDt) {
    const k = 1 - Math.pow(0.0025, realDt);
    // Slow motion eases in and out over about half a second.
    cur.timeScale += (cur.slow - cur.timeScale) * (1 - Math.pow(0.004, realDt));
    const dt = realDt * cur.timeScale;
    simTime += dt;
    const t = simTime;

    if (introStart !== null) sim.uSpring.value = Math.min(7, ((t - introStart) / 1.6) * 7);
    cur.energy *= Math.pow(0.04, realDt);
    shared.uTime.value = reduced ? 0 : t;
    sim.uDt.value = dt;
    sim.uCurl.value = reduced ? 0 : 0.8 + Math.min(cur.energy, 5);
    shared.uFrom.value = target.from;
    shared.uTo.value = target.to;
    shared.uMix.value += (target.mix - shared.uMix.value) * (reduced ? 1 : Math.min(1, k * 1.6));

    cur.x += (target.x - cur.x) * k;
    cur.dim += (target.dim - cur.dim) * k;
    cur.scale += (target.scale - cur.scale) * k;
    uniforms.uDim.value = cur.dim;

    const narrow = camera.aspect < 0.8;
    const halfW = TAN * camera.position.z * camera.aspect;
    const side = narrow ? 0 : Math.min(1, Math.abs(cur.x) * 2);
    const fit = Math.min(1, (halfW * 0.5) / 2.1);
    group.position.x = narrow ? 0 : cur.x * halfW;
    group.position.y = narrow ? TAN * camera.position.z * 0.5 : 0;
    group.scale.setScalar(cur.scale * (narrow ? 0.78 : 1 + (fit - 1) * side));
    if (!reduced) {
      cur.ry += ((mouse.on ? mouse.ndc.x * 0.25 : 0) - cur.ry) * k * 0.5;
      cur.rx += ((mouse.on ? -mouse.ndc.y * 0.15 : 0) - cur.rx) * k * 0.5;
      group.rotation.y = Math.sin(t * 0.1) * 0.12 + cur.ry;
      group.rotation.x = Math.sin(t * 0.08) * 0.06 + cur.rx + 0.08;
    }
    group.updateMatrixWorld();

    sim.uMouseOn.value += (mouse.on - sim.uMouseOn.value) * k;
    ray.setFromCamera(mouse.ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      group.worldToLocal(mouse.local.copy(hit));
      mouse.vel.subVectors(mouse.local, mouse.last).divideScalar(Math.max(realDt, 1e-3)).clampLength(0, 6);
      mouse.last.copy(mouse.local);
      sim.uMouse.value.copy(mouse.local);
      sim.uMouseVel.value.lerp(mouse.vel, 0.3);
    }

    // Sculptures render as opaque beads; everything else glows.
    const sculptW = (target.from >= 5 ? 1 - shared.uMix.value : 0) + (target.to >= 5 ? shared.uMix.value : 0);
    const solid = sculptW > 0.5 ? 1 : 0;
    if (solid !== uniforms.uSolid.value) {
      uniforms.uSolid.value = solid;
      mat.blending = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.depthWrite = !!solid;
      mat.transparent = !solid;
      mat.needsUpdate = true;
    }

    gpu.compute();
    uniforms.tPos.value = gpu.getCurrentRenderTarget(posVar).texture;
    uniforms.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
    renderer.render(scene, camera);
  }
  function frame() {
    if (!running) return;
    step(Math.min(clock.getDelta(), 1 / 30));
    requestAnimationFrame(frame);
  }
  if (reduced) { // settle into the first shape without showing the motion
    introStart = -10; sim.uDamp.value = 0.6;
    for (let i = 0; i < 240; i++) step(1 / 60);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
  });
  if (window.__mv) window.__mv.step = (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt); };

  return {
    intro() { if (introStart === null) introStart = simTime; },
    kick(v) { cur.energy = Math.max(cur.energy, Math.min(5, v)); },
    set(state) {
      if (state.from !== target.from || state.to !== target.to) {
        if (state.from === target.to && state.to !== target.from) shared.uMix.value = 0;
        else if (state.to === target.from && state.from !== target.to) shared.uMix.value = 1;
        else shared.uMix.value = state.mix;
      }
      Object.assign(target, state);
    },
  };
}
