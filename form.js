// Marvellous — enquiry form: address hints, word count, validation, bot checks, sending.
// Submissions go to a Google Apps Script web app that writes to Aung's Google Sheet
// (Marvellous Website/Services/contact-form.gs). The script URL and the Cloudflare Turnstile
// site key are public values set on the <form> as data-endpoint and data-turnstile-sitekey.

const form = document.getElementById('enquiry');
if (form) init(form);

function init(form) {
  const startedAt = Date.now();
  const status = document.getElementById('form-status');
  const say = (msg, bad = false) => { status.textContent = msg; status.classList.toggle('bad', bad); };

  // ---------- Business locations with address hints ----------
  // Photon (photon.komoot.io): free, worldwide, OpenStreetMap-based, built for type-ahead.
  const list = document.getElementById('locations');
  const MAX_LOC = 10;
  const label = (p) => {
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const parts = [p.name, street, p.district || p.locality, p.city || p.county, p.state, p.country];
    return [...new Set(parts.filter(Boolean))].join(', ');
  };
  function addLocation(focus = false) {
    if (list.children.length >= MAX_LOC) return;
    const row = document.createElement('div');
    row.className = 'loc';
    row.innerHTML = `
      <span class="loc-n">${String(list.children.length + 1).padStart(2, '0')}</span>
      <div class="loc-box">
        <input type="text" autocomplete="off" maxlength="300" placeholder="Address, city or landmark" aria-label="Business location" aria-autocomplete="list">
        <ul class="loc-hints" role="listbox" hidden></ul>
      </div>
      <button type="button" class="loc-x" aria-label="Remove this location">×</button>`;
    list.appendChild(row);
    const input = row.querySelector('input'), hints = row.querySelector('.loc-hints');
    let timer = 0, ctrl = null, items = [], active = -1;
    const close = () => { hints.hidden = true; active = -1; };
    const choose = (i) => {
      const f = items[i]; if (!f) return;
      input.value = label(f.properties);
      const [lon, lat] = f.geometry.coordinates;
      Object.assign(input.dataset, { lat: lat.toFixed(5), lon: lon.toFixed(5), country: f.properties.country || '' });
      close();
    };
    const render = () => {
      hints.innerHTML = items.map((f, i) => `<li role="option" data-i="${i}" class="${i === active ? 'on' : ''}">${escapeHtml(label(f.properties))}</li>`).join('');
      hints.hidden = !items.length;
    };
    input.addEventListener('input', () => {
      delete input.dataset.lat; delete input.dataset.lon; delete input.dataset.country;
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { items = []; close(); return; }
      timer = setTimeout(async () => {
        ctrl?.abort(); ctrl = new AbortController();
        try {
          const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`, { signal: ctrl.signal });
          const data = await r.json();
          const seen = new Set();
          items = (data.features || []).filter((f) => {
            if (!f.properties) return false;
            const k = label(f.properties); if (seen.has(k)) return false; seen.add(k); return true;
          });
          active = -1; render();
        } catch { /* typing on, or offline: keep the typed text */ }
      }, 320);
    });
    input.addEventListener('keydown', (e) => {
      if (hints.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { choose(active); e.preventDefault(); }
      else if (e.key === 'Escape') close();
    });
    hints.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) { choose(+li.dataset.i); e.preventDefault(); } });
    input.addEventListener('blur', () => setTimeout(close, 120));
    row.querySelector('.loc-x').addEventListener('click', () => {
      if (list.children.length === 1) { input.value = ''; return; }
      row.remove(); renumber();
    });
    if (focus) input.focus();
    toggleAdd();
  }
  const renumber = () => { [...list.children].forEach((r, i) => { r.querySelector('.loc-n').textContent = String(i + 1).padStart(2, '0'); }); toggleAdd(); };
  const addBtn = document.getElementById('add-location');
  const toggleAdd = () => { addBtn.hidden = list.children.length >= MAX_LOC; };
  addBtn.addEventListener('click', () => addLocation(true));
  addLocation();

  // ---------- Scenario word count ----------
  const area = form.elements.scenario, wc = document.getElementById('word-count');
  area.addEventListener('input', () => { wc.textContent = (area.value.trim().match(/\S+/g) || []).length; });

  // ---------- Readiness: show product choices only when relevant ----------
  const pick = document.getElementById('products-pick');
  form.querySelectorAll('input[name="readiness"]').forEach((r) => r.addEventListener('change', () => {
    pick.hidden = form.elements.readiness.value !== 'Interested in a product';
  }));

  // ---------- Cloudflare Turnstile (bot check), when a site key is set ----------
  let turnstileToken = '';
  const siteKey = form.dataset.turnstileSitekey;
  if (siteKey) {
    window.__mvTurnstile = () => window.turnstile.render('#turnstile', {
      sitekey: siteKey, theme: 'dark',
      callback: (t) => { turnstileToken = t; },
      'expired-callback': () => { turnstileToken = ''; },
    });
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__mvTurnstile';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  // ---------- Submit ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    const bad = [];
    for (const name of ['name', 'phone', 'email', 'scenario']) {
      const el = form.elements[name];
      if (!el.checkValidity()) { bad.push(el); el.closest('.field')?.classList.add('invalid'); }
    }
    if (!form.elements.readiness.value) bad.push(form.querySelector('input[name="readiness"]'));
    if (!form.elements.consent.checked) bad.push(form.elements.consent);
    if (bad.length) {
      say('Please complete the highlighted fields: name, phone, email, your scenario (at least a few sentences), where you are, and the consent box.', true);
      bad[0].focus?.();
      return;
    }
    if (siteKey && !turnstileToken) { say('Please wait for the security check to finish, then send again.', true); return; }

    const endpoint = form.dataset.endpoint;
    if (!endpoint) { say('The form is not connected yet. Please email info@marvellousmm.com for now.', true); return; }

    const v = (n) => (form.elements[n]?.value || '').trim();
    const payload = {
      name: v('name'), company: v('company'), phone: v('phone'), email: v('email'),
      locations: [...list.querySelectorAll('input')].map((i) => ({ text: i.value.trim(), lat: i.dataset.lat || '', lon: i.dataset.lon || '', country: i.dataset.country || '' })).filter((l) => l.text),
      scenario: v('scenario'),
      readiness: form.elements.readiness.value,
      products: [...form.querySelectorAll('input[name="products"]:checked')].map((i) => i.value),
      itInfra: form.elements.itInfra.value, itPeople: form.elements.itPeople.value, employees: form.elements.employees.value,
      consent: true,
      website: v('website'), // hidden trap: people leave it empty
      elapsedMs: Date.now() - startedAt,
      turnstileToken,
      page: location.href,
    };

    const btn = form.querySelector('.submit');
    btn.disabled = true; say('Sending…');
    try {
      // text/plain keeps this a simple request (no CORS preflight), which Apps Script accepts.
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      const res = await r.json();
      if (!res.ok) throw new Error(res.error || 'failed');
      form.classList.add('sent');
      document.getElementById('form-done').hidden = false;
      document.getElementById('form-done').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      const msg = String(err.message || '');
      say(msg === 'too-many'
        ? 'We already have your recent messages — we will be in touch. You can also email info@marvellousmm.com.'
        : 'Sorry, that did not go through. Please try again in a moment, or email info@marvellousmm.com.', true);
      btn.disabled = false;
      if (siteKey && window.turnstile) { window.turnstile.reset('#turnstile'); turnstileToken = ''; }
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
