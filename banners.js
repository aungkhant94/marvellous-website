// Marvellous — animated case-study banners (2D canvas).
// ERP: Finance, People and Operations stream into one ledger, which feeds a live chart.

const INK = '#0a0a0b', BONE = '237,234,227', GOLD = '212,162,76';

function erpBanner(el, { reduced }) {
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  el.classList.add('has-canvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  const lanes = [
    { name: 'FINANCE', color: GOLD, rate: 4.2, tag: 'INV-', count: 0 },
    { name: 'PEOPLE', color: BONE, rate: 3.0, tag: 'EMP-', count: 0 },
    { name: 'OPERATIONS', color: BONE, rate: 3.6, tag: 'PO-', count: 0 },
  ];
  let packets = [];
  let pulse = 0, records = 1284302, hover = -1;
  const chart = Array.from({ length: 90 }, (_, i) => 0.45 + Math.sin(i * 0.18) * 0.08 + Math.random() * 0.04);
  let chartTarget = chart[chart.length - 1], shift = 0;

  function layout() {
    const r = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  const narrow = () => W < 640;
  const laneY = (i) => H * (0.24 + i * 0.26);
  const startX = () => (narrow() ? W * 0.05 : W * 0.06) + (narrow() ? 0 : 118);
  const core = () => ({ x: narrow() ? W * 0.5 : W * 0.46, y: H * 0.5, r: Math.min(H * 0.16, 54) });

  function bez(i, t) {
    const x0 = startX(), y0 = laneY(i), c = core();
    const x1 = c.x - c.r * 0.9, y1 = c.y;
    const cx = x0 + (x1 - x0) * 0.55;
    const u = 1 - t;
    return {
      x: u * u * u * x0 + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * x1,
      y: u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1,
    };
  }

  function spawn(dt) {
    lanes.forEach((l, i) => {
      if (Math.random() < l.rate * dt * (hover === i ? 3 : 1)) packets.push({ lane: i, t: 0, v: 0.22 + Math.random() * 0.3, tag: Math.random() < 0.18 ? l.tag + (1000 + Math.floor(Math.random() * 9000)) : null });
    });
  }

  function update(dt) {
    spawn(dt);
    packets.forEach((p) => { p.t += p.v * dt; });
    const arrived = packets.filter((p) => p.t >= 1);
    packets = packets.filter((p) => p.t < 1);
    arrived.forEach((p) => {
      pulse = Math.min(1, pulse + 0.5);
      lanes[p.lane].count += 1;
      records += 1 + Math.floor(Math.random() * 40);
      chartTarget = Math.min(0.9, Math.max(0.15, chartTarget + (p.lane === 0 ? 0.035 : p.lane === 1 ? -0.012 : 0.018) + (Math.random() - 0.5) * 0.04));
    });
    pulse = Math.max(0, pulse - dt * 2.2);
    // Chart scrolls left continuously, easing toward the latest value.
    shift += dt * 14;
    while (shift >= 1) {
      shift -= 1;
      chart.shift();
      const last = chart[chart.length - 1];
      chart.push(last + (chartTarget - last) * 0.25 + (Math.random() - 0.5) * 0.015);
      chartTarget += (0.5 - chartTarget) * 0.01; // slow drift back
    }
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);

    // Grid.
    ctx.strokeStyle = `rgba(${BONE},0.05)`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 32) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y < H; y += 32) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();

    const c = core();
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    // Lanes: label, path, packets with trails.
    lanes.forEach((l, i) => {
      const y = laneY(i);
      if (!narrow()) {
        ctx.fillStyle = `rgba(${l.color},${hover === i ? 1 : 0.75})`;
        ctx.beginPath(); ctx.arc(W * 0.06 - 10, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${BONE},${hover === i ? 1 : 0.6})`;
        ctx.fillText(l.name, W * 0.06, y);
      }
      if (!narrow()) {
        ctx.fillStyle = `rgba(${GOLD},0.8)`;
        ctx.fillText('+' + l.count, W * 0.06, y + 16);
      }
      ctx.lineWidth = hover === i ? 1.6 : 1;
      ctx.strokeStyle = `rgba(${l.color},${hover === i ? 0.45 : 0.22})`;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const p = bez(i, k / 40); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.stroke();
    });
    packets.forEach((p) => {
      const col = lanes[p.lane].color;
      for (let k = 6; k >= 0; k--) {
        const q = bez(p.lane, Math.max(0, p.t - k * 0.012));
        ctx.fillStyle = `rgba(${col},${(1 - k / 7) * 0.9})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, k ? 1.6 : 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (p.tag && p.t < 0.85) {
        const q = bez(p.lane, p.t);
        ctx.fillStyle = `rgba(${col},${0.85 * Math.min(1, (0.85 - p.t) * 6)})`;
        ctx.fillText(p.tag, q.x + 7, q.y - 9);
      }
    });
    ctx.lineWidth = 1;

    // Ledger core: turning rings and a pulse on each arrival.
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * (1.8 + pulse));
    glow.addColorStop(0, `rgba(${GOLD},${0.28 + pulse * 0.3})`); glow.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(c.x, c.y, c.r * (1.8 + pulse), 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const rr = c.r * (0.55 + k * 0.22), a = time * (0.6 + k * 0.35) * (k % 2 ? -1 : 1);
      ctx.strokeStyle = `rgba(${k === 0 ? GOLD : BONE},${0.75 - k * 0.2})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, a, a + Math.PI * (1.1 + k * 0.25)); ctx.stroke();
    }
    ctx.fillStyle = `rgba(${GOLD},1)`; ctx.beginPath(); ctx.arc(c.x, c.y, 3 + pulse * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${BONE},0.6)`; ctx.textAlign = 'center';
    ctx.fillText('ONE LEDGER', c.x, c.y + c.r + 16);
    ctx.textAlign = 'left';

    // Live chart fed by the ledger.
    if (!narrow()) {
      const x0 = W * 0.58, x1 = W * 0.95, top = H * 0.2, bot = H * 0.82;
      ctx.strokeStyle = `rgba(${GOLD},0.35)`; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(c.x + c.r * 1.05, c.y); ctx.lineTo(x0 - 8, c.y); ctx.stroke(); ctx.setLineDash([]);
      const step = (x1 - x0) / (chart.length - 2);
      const pt = (i) => ({ x: x0 + (i - shift) * step, y: bot - chart[i] * (bot - top) });
      const fill = ctx.createLinearGradient(0, top, 0, bot);
      fill.addColorStop(0, `rgba(${GOLD},0.22)`); fill.addColorStop(1, `rgba(${GOLD},0)`);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, H); ctx.clip();
      // Volume bars under the line.
      chart.forEach((v, i) => {
        if (i % 2) return;
        const p = pt(i), hh = (0.25 + Math.abs(Math.sin(i * 1.7 + v * 9)) * 0.75) * (bot - top) * 0.18;
        ctx.fillStyle = `rgba(${BONE},0.08)`; ctx.fillRect(p.x - 1.5, bot - hh, 3, hh);
      });
      ctx.beginPath();
      chart.forEach((_, i) => { const p = pt(i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.lineTo(pt(chart.length - 1).x, bot); ctx.lineTo(pt(0).x, bot); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath();
      chart.forEach((_, i) => { const p = pt(i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = `rgba(${GOLD},0.95)`; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      const last = { x: x1, y: bot - chart[chart.length - 2] * (bot - top) };
      ctx.fillStyle = `rgba(${GOLD},1)`; ctx.beginPath(); ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${GOLD},${0.5 * (1 - (time % 1.2) / 1.2)})`;
      ctx.beginPath(); ctx.arc(last.x, last.y, 3.5 + ((time % 1.2) / 1.2) * 14, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${BONE},0.12)`; ctx.beginPath(); ctx.moveTo(x0, bot + 0.5); ctx.lineTo(x1, bot + 0.5); ctx.stroke();
      ctx.fillStyle = `rgba(${BONE},0.5)`; ctx.fillText('RECORDS IN SYNC', x0, top - 18);
      ctx.fillStyle = `rgba(${BONE},0.95)`; ctx.font = '500 20px "Clash Display", "Inter Tight", sans-serif';
      ctx.fillText(records.toLocaleString('en-US'), x0 + 150, top - 18);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(${BONE},0.5)`; ctx.textAlign = 'right';
      ctx.fillText('MONTH CLOSE · SAME DAY', x1, bot + 18); ctx.textAlign = 'left';
    }
  }

  // Hovering a lane speeds up its stream.
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect(), y = e.clientY - r.top;
    hover = -1;
    lanes.forEach((_, i) => { if (Math.abs(y - laneY(i)) < H * 0.12 && e.clientX - r.left < core().x) hover = i; });
  });
  el.addEventListener('pointerleave', () => { hover = -1; });

  layout();
  window.addEventListener('resize', layout);
  if (reduced) { for (let i = 0; i < 240; i++) update(1 / 60); draw(0); return; }

  let visible = false, last = performance.now(), t = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = performance.now(); requestAnimationFrame(loop); } }).observe(el);
  function loop(now) {
    if (!visible) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
    update(dt); draw(t);
    requestAnimationFrame(loop);
  }
  // Fill the scene before it is first seen.
  for (let i = 0; i < 300; i++) update(1 / 60);
  draw(0);
  if (location.hostname === '127.0.0.1') (window.__banners ||= []).push((n = 60) => { for (let i = 0; i < n; i++) { update(1 / 60); t += 1 / 60; } draw(t); });
}

// ---------- Shared mount: canvas, sizing, grid, visibility-driven loop ----------
function mount(el, reduced, make) {
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  el.classList.add('has-canvas');
  const ctx = canvas.getContext('2d');
  const S = { W: 0, H: 0, dpr: 1, narrow: false };
  const layout = () => {
    const r = el.getBoundingClientRect();
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.W = r.width; S.H = r.height; S.narrow = S.W < 640;
    canvas.width = Math.round(S.W * S.dpr); canvas.height = Math.round(S.H * S.dpr);
    canvas.style.width = S.W + 'px'; canvas.style.height = S.H + 'px';
  };
  layout();
  window.addEventListener('resize', layout);
  const b = make(ctx, S, el);
  const frame = (t) => {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, S.W, S.H);
    ctx.strokeStyle = `rgba(${BONE},0.05)`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < S.W; x += 32) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, S.H); }
    for (let y = 0; y < S.H; y += 32) { ctx.moveTo(0, y + 0.5); ctx.lineTo(S.W, y + 0.5); }
    ctx.stroke();
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineWidth = 1;
    b.draw(t);
  };
  let t = 0;
  for (let i = 0; i < 300; i++) { b.update(1 / 60, t); t += 1 / 60; }
  frame(t);
  if (location.hostname === '127.0.0.1') (window.__banners ||= []).push((n = 60) => { for (let i = 0; i < n; i++) { b.update(1 / 60, t); t += 1 / 60; } frame(t); });
  if (reduced) return;
  let visible = false, running = false, last = 0;
  const loop = (now) => {
    if (!visible) { running = false; return; }
    const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
    b.update(dt, t); frame(t);
    requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }).observe(el);
}
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// ---------- Video Streaming: live source → quality ladder → edge servers → screens ----------
function streamBanner(el, { reduced }) {
  mount(el, reduced, (ctx, S) => {
    const rungs = [['1080p', '6.0 Mbps'], ['720p', '3.2 Mbps'], ['480p', '1.4 Mbps'], ['360p', '0.7 Mbps']];
    const edges = ['SIN', 'BKK', 'TYO', 'LHR', 'NYC'];
    const devices = [{ y: 0.27, w: 74, h: 44, name: 'TV' }, { y: 0.56, w: 58, h: 36, name: 'LAPTOP' }, { y: 0.83, w: 20, h: 34, name: 'PHONE' }];
    let frames = [], viewers = 48213, wave = Array.from({ length: 22 }, () => Math.random()), waveT = 0, edgeHit = edges.map(() => 0), devHit = devices.map(() => 0);
    const src = () => ({ x: S.narrow ? S.W * 0.1 : S.W * 0.08, y: S.H * 0.52 });
    const rungY = (i) => S.H * (0.22 + i * 0.19);
    const rX0 = () => (S.narrow ? S.W * 0.28 : S.W * 0.22), rX1 = () => (S.narrow ? S.W * 0.58 : S.W * 0.46);
    const eX = () => (S.narrow ? S.W * 0.86 : S.W * 0.64), eY = (j) => S.H * (0.16 + j * 0.17);
    const dX = () => S.W * 0.87;
    const point = (f, k) => {
      const P = [src(), { x: rX0(), y: rungY(f.r) }, { x: rX1(), y: rungY(f.r) }, { x: eX(), y: eY(f.e) }];
      if (!S.narrow) P.push({ x: dX() - devices[f.d].w / 2 - 6, y: S.H * devices[f.d].y });
      const u = Math.min(k, P.length - 1.0001), i = Math.floor(u), q = u - i;
      return { x: lerp(P[i].x, P[i + 1].x, q), y: lerp(P[i].y, P[i + 1].y, ease(q)), end: P.length - 1 };
    };
    return {
      update(dt) {
        if (Math.random() < dt * 11) frames.push({ r: Math.floor(Math.random() * 4), e: Math.floor(Math.random() * 5), d: Math.floor(Math.random() * 3), u: 0, v: 0.9 + Math.random() * 0.5 });
        frames.forEach((f) => {
          const before = Math.floor(f.u);
          f.u += f.v * dt;
          if (Math.floor(f.u) === 3 && before === 2) edgeHit[f.e] = 1;
        });
        const end = S.narrow ? 3 : 4;
        frames = frames.filter((f) => { if (f.u >= end) { if (!S.narrow) devHit[f.d] = 1; return false; } return true; });
        edgeHit = edgeHit.map((h) => Math.max(0, h - dt * 3));
        devHit = devHit.map((h) => Math.max(0, h - dt * 2.5));
        viewers += Math.round((Math.random() - 0.35) * 40 * dt * 10);
        waveT += dt * 12;
        while (waveT >= 1) { waveT -= 1; wave.shift(); wave.push(0.2 + Math.random() * 0.8); }
      },
      draw(t) {
        const s = src();
        // Source: live dot and an audio-style waveform.
        ctx.fillStyle = `rgba(${GOLD},${0.6 + 0.4 * Math.sin(t * 5)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y - 34, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${BONE},0.85)`; ctx.fillText('LIVE', s.x + 10, s.y - 34);
        wave.forEach((v, i) => {
          const h = v * 28, x = s.x - 30 + i * 3.2;
          ctx.fillStyle = `rgba(${i > 18 ? GOLD : BONE},${0.25 + v * 0.5})`;
          ctx.fillRect(x, s.y - h / 2, 2, h);
        });
        ctx.fillStyle = `rgba(${BONE},0.5)`; ctx.fillText('SOURCE', s.x - 30, s.y + 32);
        // Quality ladder.
        rungs.forEach(([q, b], i) => {
          const y = rungY(i);
          ctx.strokeStyle = `rgba(${i === 0 ? GOLD : BONE},0.22)`;
          ctx.beginPath(); ctx.moveTo(rX0(), y); ctx.lineTo(rX1(), y); ctx.stroke();
          ctx.fillStyle = `rgba(${i === 0 ? GOLD : BONE},0.85)`; ctx.fillText(q, rX0(), y - 12);
          if (!S.narrow) { ctx.fillStyle = `rgba(${BONE},0.4)`; ctx.fillText(b, rX0() + 52, y - 12); }
        });
        // Faint routes: ladder → edges → screens.
        ctx.strokeStyle = `rgba(${BONE},0.07)`; ctx.beginPath();
        rungs.forEach((_, i) => edges.forEach((__, j) => {
          const a = { x: rX1(), y: rungY(i) }, b = { x: eX(), y: eY(j) };
          ctx.moveTo(a.x, a.y);
          for (let k = 1; k <= 16; k++) { const q = k / 16; ctx.lineTo(lerp(a.x, b.x, q), lerp(a.y, b.y, ease(q))); }
        }));
        if (!S.narrow) edges.forEach((_, j) => devices.forEach((d) => {
          const a = { x: eX(), y: eY(j) }, b = { x: dX() - d.w / 2 - 6, y: S.H * d.y };
          ctx.moveTo(a.x, a.y);
          for (let k = 1; k <= 16; k++) { const q = k / 16; ctx.lineTo(lerp(a.x, b.x, q), lerp(a.y, b.y, ease(q))); }
        }));
        rungs.forEach((_, i) => {
          const a = src(), b = { x: rX0(), y: rungY(i) };
          ctx.moveTo(a.x + 40, a.y);
          for (let k = 1; k <= 16; k++) { const q = k / 16; ctx.lineTo(lerp(a.x + 40, b.x, q), lerp(a.y, b.y, ease(q))); }
        });
        ctx.stroke();
        // Edge servers.
        edges.forEach((name, j) => {
          const x = eX(), y = eY(j), h = edgeHit[j];
          ctx.strokeStyle = `rgba(${GOLD},${0.35 + h * 0.65})`; ctx.strokeRect(x - 7, y - 7, 14, 14);
          ctx.fillStyle = `rgba(${GOLD},${0.15 + h * 0.6})`; ctx.fillRect(x - 4, y - 4, 8, 8);
          if (!S.narrow) { ctx.fillStyle = `rgba(${BONE},0.55)`; ctx.fillText(name, x + 14, y); }
        });
        if (!S.narrow) { ctx.fillStyle = `rgba(${BONE},0.45)`; ctx.fillText('EDGE', eX() - 14, eY(0) - 26); }
        // Screens.
        if (!S.narrow) devices.forEach((d, i) => {
          const x = dX() - d.w / 2, y = S.H * d.y - d.h / 2, h = devHit[i];
          ctx.strokeStyle = `rgba(${BONE},${0.45 + h * 0.5})`; ctx.strokeRect(x + 0.5, y + 0.5, d.w, d.h);
          const g = ctx.createLinearGradient(x, 0, x + d.w, 0);
          const p = (t * 0.6 + i * 0.3) % 1;
          g.addColorStop(0, `rgba(${GOLD},0.05)`); g.addColorStop(p, `rgba(${GOLD},${0.35 + h * 0.4})`); g.addColorStop(1, `rgba(${GOLD},0.05)`);
          ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, d.w - 6, d.h - 6);
          if (d.name === 'LAPTOP') { ctx.strokeStyle = `rgba(${BONE},0.45)`; ctx.beginPath(); ctx.moveTo(x - 6, y + d.h + 4); ctx.lineTo(x + d.w + 6, y + d.h + 4); ctx.stroke(); }
          ctx.fillStyle = `rgba(${BONE},0.45)`; ctx.fillText(d.name, x + d.w + 12, S.H * d.y);
        });
        // Frames in flight.
        frames.forEach((f) => {
          const p = point(f, f.u);
          ctx.fillStyle = `rgba(${f.r === 0 ? GOLD : BONE},0.9)`;
          const w = 10 - f.r * 1.6;
          ctx.fillRect(p.x - w / 2, p.y - 3, w, 6);
        });
        // Counters.
        if (!S.narrow) {
          const x = S.W * 0.5;
          ctx.fillStyle = `rgba(${BONE},0.5)`; ctx.fillText('VIEWERS', x, S.H * 0.07);
          ctx.fillText('STARTUP', x + 190, S.H * 0.07);
          ctx.fillText('REBUFFER', x + 320, S.H * 0.07);
          ctx.font = '500 18px "Clash Display", "Inter Tight", sans-serif'; ctx.fillStyle = `rgba(${BONE},0.95)`;
          ctx.fillText(viewers.toLocaleString('en-US'), x + 66, S.H * 0.07);
          ctx.fillText('0.8 s', x + 254, S.H * 0.07);
          ctx.fillStyle = `rgba(${GOLD},1)`; ctx.fillText('0.0%', x + 392, S.H * 0.07);
          ctx.font = '11px "JetBrains Mono", monospace';
        }
      },
    };
  });
}

// ---------- Customized Platforms: interface panels rearrange into each client's layout ----------
function platformsBanner(el, { reduced }) {
  mount(el, reduced, (ctx, S) => {
    const layouts = [
      { name: 'SCHOOL PORTAL', tiles: [[0, 0, 2, 1, 'ADMISSIONS', 'list'], [2, 0, 1, 2, 'TIMETABLE', 'grid'], [0, 1, 1, 1, 'FEES', 'chart'], [1, 1, 1, 1, 'ATTENDANCE', 'ring'], [3, 0, 1, 1, 'REPORTS', 'bars'], [3, 1, 1, 1, 'PARENTS', 'list']] },
      { name: 'RETAIL BACK OFFICE', tiles: [[0, 0, 1, 2, 'STOCK', 'bars'], [1, 0, 2, 1, 'SALES', 'chart'], [3, 0, 1, 1, 'ORDERS', 'list'], [1, 1, 1, 1, 'STORES', 'ring'], [2, 1, 1, 1, 'STAFF', 'list'], [3, 1, 1, 1, 'SHIFTS', 'grid']] },
      { name: 'LOGISTICS CONSOLE', tiles: [[0, 0, 2, 2, 'FLEET', 'map'], [2, 0, 1, 1, 'SHIPMENTS', 'chart'], [3, 0, 1, 1, 'ON TIME', 'ring'], [2, 1, 1, 1, 'WAREHOUSE', 'bars'], [3, 1, 1, 0.5, 'ALERTS', 'list'], [3, 1.5, 1, 0.5, 'DRIVERS', 'list']] },
    ];
    const HOLD = 3.4, MOVE = 1.1;
    let clock = 0;
    const area = () => ({ x: S.W * (S.narrow ? 0.04 : 0.05), y: S.H * 0.17, w: S.W * (S.narrow ? 0.92 : 0.9), h: S.H * 0.76 });
    const rect = (tile) => {
      const a = area(), g = 10, cw = (a.w - g * 3) / 4, ch = (a.h - g) / 2;
      return { x: a.x + tile[0] * (cw + g), y: a.y + tile[1] * (ch + g), w: tile[2] * cw + (tile[2] - 1) * g, h: tile[3] * ch + Math.max(0, tile[3] - 1) * g };
    };
    function content(type, r, t, hot) {
      const pad = 12, x = r.x + pad, y = r.y + 30, w = r.w - pad * 2, h = r.h - 42;
      if (w < 20 || h < 10) return;
      const c = hot ? GOLD : BONE;
      if (type === 'list') {
        const n = Math.max(1, Math.floor(h / 16));
        for (let i = 0; i < n; i++) {
          const active = Math.floor(t * 1.2) % n === i;
          ctx.fillStyle = `rgba(${active ? GOLD : BONE},${active ? 0.8 : 0.18})`;
          ctx.fillRect(x, y + i * 16, w * (0.45 + ((i * 37) % 50) / 100), 5);
        }
      } else if (type === 'chart') {
        ctx.strokeStyle = `rgba(${GOLD},0.9)`; ctx.beginPath();
        for (let i = 0; i <= 40; i++) { const px = x + (w * i) / 40, py = y + h * (0.55 - 0.3 * Math.sin(i * 0.35 + t * 1.5) * Math.cos(i * 0.12)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      } else if (type === 'bars') {
        const n = 7, bw = w / n - 4;
        for (let i = 0; i < n; i++) { const bh = h * (0.3 + 0.6 * Math.abs(Math.sin(t * 0.9 + i * 1.3))); ctx.fillStyle = `rgba(${i === 3 ? GOLD : BONE},${i === 3 ? 0.85 : 0.3})`; ctx.fillRect(x + i * (bw + 4), y + h - bh, bw, bh); }
      } else if (type === 'ring') {
        const rr = Math.min(w, h) * 0.42, cx = x + w / 2, cy = y + h / 2, p = 0.62 + 0.3 * Math.sin(t * 0.7);
        ctx.strokeStyle = `rgba(${BONE},0.15)`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(${GOLD},0.9)`; ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
        ctx.fillStyle = `rgba(${BONE},0.9)`; ctx.textAlign = 'center'; ctx.fillText(Math.round(p * 100) + '%', cx, cy); ctx.textAlign = 'left';
      } else if (type === 'grid') {
        const cols = 5, rows = Math.max(2, Math.floor(h / 18)), cw = w / cols, chh = h / rows;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const on = (i * 7 + j * 3 + Math.floor(t * 1.5)) % 9 === 0;
          ctx.fillStyle = `rgba(${on ? GOLD : BONE},${on ? 0.75 : 0.08})`; ctx.fillRect(x + i * cw + 1, y + j * chh + 1, cw - 3, chh - 3);
        }
      } else if (type === 'map') {
        const pts = [[0.1, 0.7], [0.3, 0.3], [0.55, 0.55], [0.8, 0.2], [0.9, 0.75]].map(([u, v]) => ({ x: x + u * w, y: y + v * h }));
        ctx.strokeStyle = `rgba(${BONE},0.25)`; ctx.setLineDash([4, 5]); ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]);
        pts.forEach((p) => { ctx.fillStyle = `rgba(${BONE},0.6)`; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
        for (let k = 0; k < 3; k++) {
          const u = ((t * 0.12 + k / 3) % 1) * (pts.length - 1), i = Math.floor(u), q = u - i;
          ctx.fillStyle = `rgba(${GOLD},1)`; ctx.beginPath(); ctx.arc(lerp(pts[i].x, pts[i + 1].x, q), lerp(pts[i].y, pts[i + 1].y, q), 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      void c;
    }
    return {
      update(dt) { clock += dt; },
      draw(t) {
        const cycle = HOLD + MOVE, n = Math.floor(clock / cycle), local = clock - n * cycle;
        const from = layouts[n % 3], to = layouts[(n + 1) % 3];
        const moving = local > HOLD;
        const k = moving ? (local - HOLD) / MOVE : 0;
        const name = moving && k > 0.5 ? to.name : from.name;
        ctx.fillStyle = `rgba(${BONE},0.5)`; ctx.fillText('LAYOUT', area().x, S.H * 0.08);
        ctx.font = '500 18px "Clash Display", "Inter Tight", sans-serif'; ctx.fillStyle = `rgba(${BONE},0.95)`;
        ctx.fillText(name, area().x + 66, S.H * 0.08);
        ctx.font = '11px "JetBrains Mono", monospace';
        if (!S.narrow) { ctx.fillStyle = `rgba(${GOLD},0.85)`; ctx.textAlign = 'right'; ctx.fillText('SAME CORE · DIFFERENT SHAPE', area().x + area().w, S.H * 0.08); ctx.textAlign = 'left'; }
        let hotIdx = -1, hotDist = 0;
        from.tiles.forEach((ft, i) => {
          const a = rect(ft), b = rect(to.tiles[i]);
          const d = Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.w - b.w);
          if (d > hotDist) { hotDist = d; hotIdx = i; }
        });
        from.tiles.forEach((ft, i) => {
          const a = rect(ft), b = rect(to.tiles[i]);
          const kk = ease(clamp01((k - i * 0.06) / 0.7));
          const r = { x: lerp(a.x, b.x, kk), y: lerp(a.y, b.y, kk), w: lerp(a.w, b.w, kk), h: lerp(a.h, b.h, kk) };
          const hot = moving && i === hotIdx;
          ctx.fillStyle = `rgba(${BONE},0.03)`; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = `rgba(${hot ? GOLD : BONE},${hot ? 0.9 : 0.2})`; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
          const tile = kk > 0.5 ? to.tiles[i] : ft;
          ctx.fillStyle = `rgba(${BONE},0.55)`; ctx.fillText(tile[4], r.x + 12, r.y + 15);
          const fade = moving ? Math.abs(kk - 0.5) * 2 : 1;
          ctx.globalAlpha = fade;
          content(tile[5], r, t, hot);
          ctx.globalAlpha = 1;
          if (hot) { // a cursor carrying the panel into place
            const cx = r.x + r.w * 0.6, cy = r.y + r.h * 0.6;
            ctx.fillStyle = `rgba(${BONE},1)`; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 12, cy + 5); ctx.lineTo(cx + 5, cy + 7); ctx.lineTo(cx + 3, cy + 14); ctx.closePath(); ctx.fill();
          }
        });
      },
    };
  });
}

// ---------- Advanced Tech Solutions: a service graph read by an on-premise AI agent ----------
function advancedBanner(el, { reduced }) {
  mount(el, reduced, (ctx, S) => {
    let seed = 41;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const centers = [[0.18, 0.35], [0.4, 0.25], [0.3, 0.7], [0.55, 0.62], [0.12, 0.72]];
    const nodes = [];
    centers.forEach(([cx, cy], c) => {
      for (let i = 0; i < 14; i++) nodes.push({ u: cx + (rnd() - 0.5) * 0.17, v: cy + (rnd() - 0.5) * 0.3, c, lit: 0, hub: i === 0 });
    });
    const edges = [];
    nodes.forEach((a, i) => {
      nodes.map((b, j) => [Math.hypot(a.u - b.u, (a.v - b.v) * 0.5), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]).slice(0, 2).forEach(([, j]) => edges.push([i, j]));
    });
    nodes.forEach((a, i) => { if (a.hub) nodes.forEach((b, j) => { if (b.hub && j > i) edges.push([i, j]); }); });
    let pulses = [];
    const script = ['> trace order-service p99 latency', '  scanning 214 services...', '  3 callers · 1 slow query found', '> propose fix', '  add index on orders(customer_id)', '  tests passed ✓  canary 5%', '> watch', '  p99 412 ms → 96 ms ✓'];
    let typed = 0, pause = 0;
    const gx = (n) => (S.narrow ? 0.04 + n.u * 1.45 : 0.03 + n.u * 0.93) * S.W;
    const gy = (n) => (0.14 + n.v * 0.78) * S.H;
    return {
      update(dt) {
        if (Math.random() < dt * 14) pulses.push({ e: Math.floor(Math.random() * edges.length), t: 0, v: 0.6 + Math.random() * 0.8 });
        pulses.forEach((p) => { p.t += p.v * dt; });
        pulses = pulses.filter((p) => p.t < 1);
        nodes.forEach((n) => { n.lit = Math.max(0, n.lit - dt * 1.2); });
        // Agent typing.
        const total = script.join('\n').length;
        if (pause > 0) { pause -= dt; if (pause <= 0) typed = 0; }
        else { typed += dt * 26; if (typed >= total) { typed = total; pause = 2.2; } }
      },
      draw(t) {
        // Scan beam sweeping across the graph.
        const span = S.narrow ? S.W : S.W * 0.62;
        const bx = ((t * 0.22) % 1.2) * span;
        const beam = ctx.createLinearGradient(bx - 80, 0, bx, 0);
        beam.addColorStop(0, `rgba(${GOLD},0)`); beam.addColorStop(1, `rgba(${GOLD},0.16)`);
        ctx.fillStyle = beam; ctx.fillRect(bx - 80, S.H * 0.1, 80, S.H * 0.84);
        ctx.strokeStyle = `rgba(${GOLD},0.6)`; ctx.beginPath(); ctx.moveTo(bx, S.H * 0.1); ctx.lineTo(bx, S.H * 0.94); ctx.stroke();
        nodes.forEach((n) => { if (Math.abs(gx(n) - bx) < 3) n.lit = 1; });
        ctx.strokeStyle = `rgba(${BONE},0.17)`; ctx.beginPath();
        edges.forEach(([i, j]) => { ctx.moveTo(gx(nodes[i]), gy(nodes[i])); ctx.lineTo(gx(nodes[j]), gy(nodes[j])); });
        ctx.stroke();
        pulses.forEach((p) => {
          const [i, j] = edges[p.e], a = nodes[i], b = nodes[j];
          ctx.fillStyle = `rgba(${BONE},${0.9 * Math.sin(Math.PI * p.t)})`;
          ctx.beginPath(); ctx.arc(lerp(gx(a), gx(b), p.t), lerp(gy(a), gy(b), p.t), 2.4, 0, Math.PI * 2); ctx.fill();
        });
        nodes.forEach((n) => {
          const r = n.hub ? 4.5 : 2.6;
          ctx.fillStyle = `rgba(${n.lit > 0.05 ? GOLD : BONE},${0.6 + n.lit * 0.4})`;
          ctx.beginPath(); ctx.arc(gx(n), gy(n), r + n.lit * 2, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = `rgba(${BONE},0.5)`; ctx.fillText('SERVICES', S.W * 0.03, S.H * 0.07);
        ctx.fillText('HEALTHY', S.W * 0.03 + 130, S.H * 0.07);
        ctx.fillStyle = `rgba(${GOLD},0.95)`; ctx.fillText('214', S.W * 0.03 + 74, S.H * 0.07); ctx.fillText('214', S.W * 0.03 + 196, S.H * 0.07);
        // Agent terminal.
        if (!S.narrow) {
          const x = S.W * 0.66, y = S.H * 0.12, w = S.W * 0.3, h = S.H * 0.78;
          ctx.fillStyle = 'rgba(16,16,18,0.92)'; ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = `rgba(${BONE},0.18)`; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
          ctx.fillStyle = `rgba(${GOLD},0.9)`; ctx.fillText('AGENT · ON-PREM MODEL', x + 14, y + 18);
          ctx.strokeStyle = `rgba(${BONE},0.1)`; ctx.beginPath(); ctx.moveTo(x, y + 34); ctx.lineTo(x + w, y + 34); ctx.stroke();
          let left = Math.floor(typed), line = 0, lastX = x + 14, lastY = y + 54;
          for (const s of script) {
            if (left <= 0) break;
            const shown = s.slice(0, left); left -= s.length + 1;
            const ly = y + 54 + line * 20;
            ctx.fillStyle = s.startsWith('>') ? `rgba(${BONE},0.95)` : (s.includes('✓') ? `rgba(${GOLD},0.95)` : `rgba(${BONE},0.55)`);
            ctx.fillText(shown, x + 14, ly);
            lastX = x + 14 + ctx.measureText(shown).width; lastY = ly; line++;
          }
          if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = `rgba(${GOLD},0.9)`; ctx.fillRect(lastX + 3, lastY - 6, 7, 12); }
        }
      },
    };
  });
}

export function initBanners({ reduced = false } = {}) {
  const make = { erp: erpBanner, stream: streamBanner, school: platformsBanner, ai: advancedBanner };
  document.querySelectorAll('.case-art[data-art]').forEach((el) => make[el.dataset.art]?.(el, { reduced }));
}
