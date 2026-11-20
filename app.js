// Marvellous — page behaviour: preloader, smooth scroll, reveals, scene direction,
// HUD, menu, page transitions and the work-list preview.
import Lenis from 'lenis';
import { createScene, supportsWebGL, SHAPES } from './scene.js';
import { initBanners } from './banners.js';

const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const mobile = coarse || window.innerWidth < 760;
root.classList.add('js');
if (reduced) root.classList.add('reduced');

// ---------- Scene ----------
let scene = null;
const canvas = document.querySelector('.stage');
if (canvas && supportsWebGL()) {
  try {
    const shapes = new Set([...document.querySelectorAll('[data-shape]')].map((el) => el.dataset.shape));
    scene = createScene(canvas, { mobile, reduced, shapes });
  }
  catch (e) { console.warn('WebGL scene unavailable', e); }
}
if (!scene) root.classList.add('no-webgl');

// ---------- Animated case banners ----------
initBanners({ reduced });

// ---------- Split headings into masked lines of words ----------
document.querySelectorAll('[data-split]').forEach((el) => {
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('span');
          inner.textContent = part;
          inner.style.setProperty('--i', i++);
          w.append(inner);
          frag.append(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    });
  };
  walk(el);
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
});

// ---------- Reveals ----------
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
document.querySelectorAll('.reveal, [data-split]').forEach((el) => io.observe(el));

// Counters count up once seen.
const countIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target, end = parseFloat(el.dataset.count), suffix = el.dataset.suffix || '';
    if (reduced) { el.textContent = end + suffix; return; }
    const t0 = performance.now(), dur = 1600;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(end * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach((el) => countIO.observe(el));

// ---------- Smooth scroll ----------
let lenis = null;
if (!reduced && !coarse) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  const target = id.length > 1 && document.querySelector(id);
  if (!target) return;
  e.preventDefault();
  closeMenu();
  if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
  else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}));

// ---------- Scroll → scene, HUD ----------
const sections = [...document.querySelectorAll('[data-shape]')];
const hudChapter = document.querySelector('[data-hud-chapter]');
const hudProgress = document.querySelector('[data-hud-progress]');
const hudBar = document.querySelector('.hud-bar i');
const read = (el) => ({
  shape: SHAPES[el.dataset.shape] ?? 0,
  x: parseFloat(el.dataset.x || 0),
  dim: parseFloat(el.dataset.dim || 1),
  scale: parseFloat(el.dataset.scale || 1),
});
let lastY = window.scrollY, lastT = performance.now();
function onScroll() {
  const vh = window.innerHeight, mid = window.scrollY + vh / 2;
  const now = performance.now();
  const speed = Math.abs(window.scrollY - lastY) / Math.max(16, now - lastT) * 1000; // px per second
  lastY = window.scrollY; lastT = now;
  scene?.kick?.(speed / 900);
  const max = document.documentElement.scrollHeight - vh;
  const progress = max > 0 ? window.scrollY / max : 0;
  if (hudProgress) hudProgress.textContent = String(Math.round(progress * 100)).padStart(3, '0');
  if (hudBar) hudBar.style.transform = `scaleX(${progress})`;
  if (!sections.length) return;

  const centers = sections.map((s) => {
    const r = s.getBoundingClientRect();
    return window.scrollY + r.top + Math.min(r.height, vh) / 2;
  });
  let i = 0;
  while (i < sections.length - 1 && mid >= centers[i + 1]) i++;
  const a = read(sections[i]);
  const b = read(sections[Math.min(i + 1, sections.length - 1)]);
  let m = i < sections.length - 1 ? (mid - centers[i]) / (centers[i + 1] - centers[i]) : 0;
  m = Math.min(1, Math.max(0, (m - 0.2) / 0.6)); // hold each shape while its text is read
  const lerp = (p, q) => p + (q - p) * m;
  if (scene) {
    scene.set({
      from: a.shape, to: b.shape, mix: a.shape === b.shape ? 0 : m,
      x: lerp(a.x, b.x), dim: lerp(a.dim, b.dim), scale: lerp(a.scale, b.scale),
    });
  }
  const current = m > 0.5 ? sections[Math.min(i + 1, sections.length - 1)] : sections[i];
  if (hudChapter && current.dataset.chapter) hudChapter.textContent = current.dataset.chapter;
}
if (lenis) lenis.on('scroll', onScroll); else window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

// ---------- Yangon clock ----------
const clockEls = document.querySelectorAll('[data-clock]');
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const tick = () => clockEls.forEach((el) => { el.textContent = fmt.format(new Date()); });
if (clockEls.length) { tick(); setInterval(tick, 1000); }
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

// ---------- Menu ----------
const menuBtn = document.querySelector('.menu-toggle');
function closeMenu() {
  root.classList.remove('menu-open');
  menuBtn?.setAttribute('aria-expanded', 'false');
  if (menuBtn) menuBtn.textContent = 'Menu';
  lenis?.start();
}
menuBtn?.addEventListener('click', () => {
  const open = !root.classList.contains('menu-open');
  root.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.textContent = open ? 'Close' : 'Menu';
  if (open) lenis?.stop(); else lenis?.start();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// ---------- Page transitions ----------
document.querySelectorAll('a[href]').forEach((a) => {
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('href').startsWith('#')) return;
  if (url.pathname === location.pathname && url.hash) return;
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    root.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, reduced ? 0 : 520);
  });
});
window.addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('leaving'); });

// ---------- Magnetic buttons ----------
if (!coarse && !reduced) {
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

// ---------- Work list preview follows the pointer ----------
const preview = document.querySelector('.work-preview');
if (preview && !coarse) {
  let px = 0, py = 0, tx = 0, ty = 0;
  const label = preview.querySelector('[data-preview-label]');
  document.querySelectorAll('.work-row').forEach((row) => {
    row.addEventListener('pointerenter', () => {
      preview.dataset.art = row.dataset.art;
      if (label) label.textContent = row.dataset.label || '';
      preview.classList.add('on');
    });
    row.addEventListener('pointerleave', () => preview.classList.remove('on'));
  });
  window.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
  const follow = () => {
    px += (tx - px) * 0.14; py += (ty - py) * 0.14;
    preview.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) rotate(${(tx - px) * 0.03}deg)`;
    requestAnimationFrame(follow);
  };
  follow();
}

// ---------- Preloader ----------
const loader = document.querySelector('.loader');
const loaderNum = document.querySelector('[data-loader-num]');
let seen = false;
try { seen = sessionStorage.getItem('mv-seen') === '1'; sessionStorage.setItem('mv-seen', '1'); } catch { /* storage blocked */ }
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  root.classList.add('loaded');
  scene?.intro();
  setTimeout(() => loader?.remove(), 1200);
}
if (!loader || reduced || seen) {
  loader?.classList.add('skip');
  setTimeout(finish, 30);
} else {
  const t0 = performance.now(), minDur = 1500;
  let ready = false;
  document.fonts?.ready.then(() => { ready = true; });
  setTimeout(() => { ready = true; }, 3000);
  const step = (now) => {
    const time = Math.min(1, (now - t0) / minDur);
    const p = ready ? time : Math.min(time, 0.9);
    if (loaderNum) loaderNum.textContent = String(Math.round(p * 100)).padStart(3, '0');
    if (p < 1) requestAnimationFrame(step); else finish();
  };
  requestAnimationFrame(step);
  setTimeout(finish, 4500); // never trap a visitor behind the loader
}
