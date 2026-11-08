'use strict';
/* ════════════════════════════════════════════════════════════════
   Collection Switch 2 : catalogue, ma liste, prix en France
   Tout reste dans ce navigateur (localStorage). Aucun serveur.
   ════════════════════════════════════════════════════════════════ */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const DEFAULT_STORES = ['Amazon', 'Fnac', 'Micromania', 'Auchan', 'Leclerc', 'Boulanger', 'Carrefour', 'Cultura', 'Cdiscount', 'Darty'];

let M = Object.assign({ marks: {}, custom: [] }, store.get('collection-v1', {}));                    // ma liste
let P = Object.assign({ prices: {}, hist: {}, sightings: {} }, store.get('collection-prices-v1', {})); // prix
let S = Object.assign({ serperKey: '', stores: DEFAULT_STORES.join('\n'), hideNotice: false }, store.get('collection-settings-v1', {}));
const saveM = () => store.set('collection-v1', M);
const saveP = () => store.set('collection-prices-v1', P);
const saveS = () => store.set('collection-settings-v1', S);

let CAT = [];
let META = {};
const ui = { tab: 'catalogue', q: '', cfilter: 'tous', seg: 'owned', sort: 'price', scope: 'wish', busy: false, progress: 0, installEvt: null };
const games = () => [...CAT, ...M.custom];
const byId = id => games().find(g => g.id === id);
const markOf = id => M.marks[id]?.state || '';

/* ── Outils d'affichage ── */
const fmt = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
const STOP = new Set(['the', 'of', 'and', 'de', 'la', 'le', 'les', 'du', 'des', 'un', 'une', 'edition', 'switch', 'nintendo']);
const cleanTitle = t => String(t).replace(/\(.*?\)/g, ' ');
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function initials(t) {
  const w = cleanTitle(t).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(x => x && !STOP.has(x.toLowerCase()));
  return ((w[0]?.[0] || '?') + (w[1]?.[0] || '')).toUpperCase();
}
const cover = (g, cls = '') => `<div class="cover ${cls}" style="--h:${hue(g.titre)}"><b>${esc(initials(g.titre))}</b><i>SWITCH 2</i></div>`;
const SUPPORT = { cartouche_complete: ['Cartouche complète', 'ok'], game_key_card: ['Game-Key Card', 'warn'], inconnu: ['Support inconnu', ''] };
const EDITION = { standard: 'Standard', collector: 'Collector', autre: 'Édition spéciale' };
const CONF = { probable: 'probable', a_verifier: 'à vérifier', inconnu: '' };

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

/* ════════════════ PRIX ════════════════ */
function allOffers(id) {
  const p = P.prices[id];
  const online = (p?.offers || []).map(o => ({ ...o, at: p.at, magasin: false }));
  const shop = (P.sightings[id] || []).map(x => ({ store: x.store, price: x.price, at: x.at, magasin: true, url: '', note: x.note }));
  return [...online, ...shop].sort((a, b) => a.price - b.price);
}
const bestOffer = id => allOffers(id)[0] || null;
function refPrice(g) {
  if (g.prix_eur) return g.prix_eur;
  const h = P.hist[g.id] || [];
  return h.length > 1 ? Math.max(...h.map(x => x.price)) : null;
}
function discount(g, best) {
  const ref = refPrice(g);
  return ref && best && ref > best.price ? Math.round((1 - best.price / ref) * 100) : 0;
}
function targetHit(g, best) {
  const t = M.marks[g.id]?.target;
  return !!(t && best && best.price <= t);
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const collapse = s => norm(s).replace(/ /g, '');
function titleTokens(t) { return norm(cleanTitle(t)).split(' ').filter(w => w.length > 1 && !STOP.has(w)); }
const storeEntries = () => String(S.stores || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);

function parsePrice(v) {
  if (typeof v === 'number') return v >= 5 && v <= 400 ? v : null;
  const s = String(v || '').replace(/[ \s]/g, '');
  const m = s.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return n >= 5 && n <= 400 ? n : null;
}
const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };

// Un résultat correspond-il bien à ce jeu, à cette édition, sur Switch 2, dans une enseigne choisie ?
function matchOffer(item, g) {
  const title = ' ' + norm(item.title) + ' ';
  if (!/switch ?2/.test(title)) return null;
  if (/occasion|reconditionn|\bcode\b|dematerialis|carte cadeau|eshop|amiibo|figurine|manette|housse|etui/.test(title)) return null;
  const toks = titleTokens(g.titre);
  if (!toks.length) return null;
  const hits = toks.filter(w => title.includes(' ' + w + ' ')).length;
  if (hits < Math.ceil(toks.length * 0.75)) return null;
  const isCollector = /collector|steelbook/.test(title);
  if (g.edition === 'collector' && !/collector/.test(title)) return null;
  if (g.edition === 'standard' && isCollector) return null;
  const hay = collapse((item.source || '') + ' ' + hostOf(item.link));
  const entry = storeEntries().find(e => hay.includes(collapse(e)));
  if (!entry) return null;
  const price = parsePrice(item.price);
  if (!price) return null;
  return { store: item.source || entry, key: collapse(entry), price, url: /^https:\/\//.test(item.link || '') ? item.link : '', title: item.title };
}

async function fetchOffers(g) {
  const q = `${cleanTitle(g.titre).trim()} ${g.edition === 'collector' ? 'édition collector ' : ''}Nintendo Switch 2`;
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': S.serperKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'fr', hl: 'fr', num: 40 })
  });
  if (res.status === 401 || res.status === 403) throw new Error('Clé Serper refusée');
  if (res.status === 429) throw new Error('Quota Serper atteint');
  if (!res.ok) throw new Error('Serper : erreur ' + res.status);
  const d = await res.json();
  const items = d.shopping || d.shopping_results || [];
  const bestByStore = new Map();
  for (const it of items) {
    const o = matchOffer(it, g);
    if (o && (!bestByStore.has(o.key) || o.price < bestByStore.get(o.key).price)) bestByStore.set(o.key, o);
  }
  return [...bestByStore.values()].sort((a, b) => a.price - b.price).map(({ key, ...o }) => o);
}

async function refreshPrices(ids) {
  if (ui.busy) return;
  if (!S.serperKey) { toast('Ajoute ta clé Serper dans Réglages'); go('reglages'); return; }
  if (!ids.length) { toast("Marque d'abord des jeux dans « Je le veux »"); return; }
  if (!confirm(`Actualiser les prix de ${ids.length} jeu${ids.length > 1 ? 'x' : ''} ?\nCela utilise ${ids.length} crédit${ids.length > 1 ? 's' : ''} Serper (1 par jeu).`)) return;
  ui.busy = true; ui.progress = 0; render();
  let found = 0, failed = 0, lastErr = '';
  for (let i = 0; i < ids.length; i++) {
    const g = byId(ids[i]); if (!g) continue;
    try {
      const offers = await fetchOffers(g);
      P.prices[g.id] = { at: Date.now(), offers };
      if (offers.length) {
        found++;
        const h = (P.hist[g.id] = P.hist[g.id] || []);
        const last = h[h.length - 1];
        if (!last || last.price !== offers[0].price || Date.now() - last.at > 12 * 3600e3) h.push({ at: Date.now(), price: offers[0].price, store: offers[0].store });
        if (h.length > 120) h.splice(0, h.length - 120);
      }
    } catch (e) {
      failed++; lastErr = e.message;
      if (/refusée|Quota/.test(e.message)) break;
    }
    ui.progress = (i + 1) / ids.length; updateProgress();
  }
  saveP(); ui.busy = false; render();
  toast(failed ? `${lastErr}${found ? ` · ${found} jeu(x) mis à jour` : ''}` : `${found} jeu${found > 1 ? 'x' : ''} avec des prix sur ${ids.length}`);
}
function updateProgress() { const b = $('#bar'); if (b) b.style.width = Math.round(ui.progress * 100) + '%'; }

/* ════════════════ NAVIGATION ════════════════ */
const ICONS = {
  catalogue: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  liste: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  promos: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'
};
const TABS = [['catalogue', 'Catalogue'], ['liste', 'Ma liste'], ['promos', 'Promos'], ['reglages', 'Réglages']];

function renderTabs() {
  const wishN = games().filter(g => markOf(g.id) === 'wish').length;
  $('#tabs').innerHTML = TABS.map(([id, label]) => `
    <button class="tab ${ui.tab === id ? 'on' : ''}" data-tab="${id}" aria-label="${label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>
      ${label}${id === 'liste' && wishN ? `<span class="dot">${wishN}</span>` : ''}
    </button>`).join('');
}
function go(tab) {
  ui.tab = tab;
  try { history.replaceState(null, '', '#' + tab); } catch {}
  window.scrollTo(0, 0); render();
}

function render() {
  renderTabs();
  const titles = { catalogue: 'Catalogue', liste: 'Ma liste', promos: 'Promos', reglages: 'Réglages' };
  $('#title').textContent = titles[ui.tab];
  const owned = games().filter(g => markOf(g.id) === 'owned').length;
  const wish = games().filter(g => markOf(g.id) === 'wish').length;
  $('#subtitle').textContent = ui.tab === 'catalogue' ? `${games().length} jeux Switch 2 en boîte`
    : ui.tab === 'liste' ? `${owned} possédé${owned > 1 ? 's' : ''} · ${wish} souhait${wish > 1 ? 's' : ''}`
    : ui.tab === 'promos' ? 'Les meilleurs prix dans les enseignes françaises'
    : 'Clés, enseignes et données';
  $('#top-action').hidden = ui.tab !== 'promos';
  const v = $('#view');
  v.className = 'fade';
  v.innerHTML = ({ catalogue: viewCatalogue, liste: viewListe, promos: viewPromos, reglages: viewReglages })[ui.tab]();
  if (ui.tab === 'catalogue') renderGrid();
  if (ui.tab === 'promos') updateProgress();
}

/* ── Catalogue ── */
const CFILTERS = [['tous', 'Tous'], ['cartouche_complete', 'Cartouche complète'], ['game_key_card', 'Game-Key Card'], ['collector', 'Collector']];
function viewCatalogue() {
  return `
    ${META.avertissement && !S.hideNotice ? `<div class="notice"><span>⚠️</span><span>${esc(META.avertissement)}</span><button data-hide-notice aria-label="Fermer">✕</button></div>` : ''}
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="q" placeholder="Rechercher un jeu" value="${esc(ui.q)}" autocomplete="off">
    </div>
    <div class="chips">${CFILTERS.map(([k, l]) => `<button class="chip ${ui.cfilter === k ? 'on' : ''}" data-cfilter="${k}">${l}</button>`).join('')}</div>
    <div class="grid" id="grid"></div>
    <div class="btns"><button class="btn block" data-add-game>＋ Ajouter un jeu</button></div>`;
}
function renderGrid() {
  const q = norm(ui.q);
  const list = games().filter(g => {
    if (q && !norm(g.titre + ' ' + (g.editeur || '')).includes(q)) return false;
    if (ui.cfilter === 'cartouche_complete' || ui.cfilter === 'game_key_card') return g.support === ui.cfilter;
    if (ui.cfilter === 'collector') return g.edition === 'collector';
    return true;
  });
  $('#grid').innerHTML = list.length ? list.map(tile).join('') : `<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><b>Aucun jeu</b>Essaie un autre mot.</div>`;
}
function tile(g) {
  const m = markOf(g.id), best = bestOffer(g.id);
  const [supLabel, supCls] = SUPPORT[g.support] || SUPPORT.inconnu;
  return `<button class="tile" data-open="${esc(g.id)}">
    <div style="position:relative">${cover(g)}${m ? `<span class="badge-state ${m}">${m === 'owned' ? '✓' : '★'}</span>` : ''}</div>
    <div class="name">${esc(g.titre)}</div>
    <div class="sub">${esc(EDITION[g.edition] || 'Standard')}</div>
    <div class="pills" style="margin-top:6px"><span class="pill ${supCls}">${supLabel}</span></div>
    <div class="price ${best ? '' : 'none'}">${best ? `dès ${fmt(best.price)}` : 'Prix non relevé'}</div>
  </button>`;
}

/* ── Ma liste ── */
function viewListe() {
  const list = games().filter(g => markOf(g.id) === ui.seg);
  const seg = `<div class="seg"><button data-seg="owned" class="${ui.seg === 'owned' ? 'on' : ''}">✅ Possédés</button><button data-seg="wish" class="${ui.seg === 'wish' ? 'on' : ''}">⭐ Souhaits</button></div>`;
  if (!list.length) return seg + `<div class="empty"><div class="big">${ui.seg === 'owned' ? '📦' : '⭐'}</div><b>${ui.seg === 'owned' ? 'Rien dans ta collection' : 'Aucun souhait'}</b>Ouvre un jeu du catalogue et choisis « ${ui.seg === 'owned' ? "Je l'ai" : 'Je le veux'} ».</div>`;
  return seg + list.map(g => {
    const best = bestOffer(g.id), t = M.marks[g.id]?.target, hit = targetHit(g, best);
    return `<button class="row" data-open="${esc(g.id)}">
      ${cover(g, 'mini')}
      <div class="mid"><div class="name">${esc(g.titre)}</div>
        <div class="sub">${esc(EDITION[g.edition] || '')}${ui.seg === 'wish' && t ? ` · cible ${fmt(t)}` : ''}</div>
        ${hit ? '<div class="pills" style="margin-top:6px"><span class="pill ok">🎯 Prix cible atteint</span></div>' : ''}</div>
      <div class="right">${best ? `<div class="big ${hit ? '' : 'over'}">${fmt(best.price)}</div><div class="small">${esc(best.store)}</div>` : '<div class="small">Pas de prix</div>'}</div>
    </button>`;
  }).join('');
}

/* ── Promos ── */
function viewPromos() {
  const scopeIds = games().filter(g => ui.scope === 'all' || markOf(g.id) === 'wish');
  const priced = scopeIds.filter(g => bestOffer(g.id));
  const unpriced = scopeIds.length - priced.length;
  const stamps = Object.values(P.prices).map(p => p.at);
  const last = stamps.length ? Math.max(...stamps) : 0;
  const rows = priced.map(g => ({ g, best: bestOffer(g.id) }));
  rows.sort((a, b) => ui.sort === 'price' ? a.best.price - b.best.price
    : ui.sort === 'drop' ? discount(b.g, b.best) - discount(a.g, a.best)
    : b.best.at - a.best.at);
  const n = scopeIds.length;
  return `
    <div class="card">
      <h3>Prix en France</h3>
      <p>${last ? `Dernière actualisation ${ago(last)}.` : 'Aucun prix relevé pour l\'instant.'} Les prix viennent d'un comparateur et peuvent changer : ils sont indicatifs.</p>
      <div class="btns">
        <button class="btn primary block" data-refresh ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Actualisation…' : `🔄 Actualiser ${n} jeu${n > 1 ? 'x' : ''}`}</button>
      </div>
      ${ui.busy ? '<div class="progress"><i id="bar"></i></div>' : ''}
    </div>
    <div class="seg">
      <button data-scope="wish" class="${ui.scope === 'wish' ? 'on' : ''}">Mes souhaits</button>
      <button data-scope="all" class="${ui.scope === 'all' ? 'on' : ''}">Tout le catalogue</button>
    </div>
    <div class="chips">${[['price', 'Prix le plus bas'], ['drop', 'Plus forte baisse'], ['recent', 'Plus récents']].map(([k, l]) => `<button class="chip ${ui.sort === k ? 'on' : ''}" data-sort="${k}">${l}</button>`).join('')}</div>
    ${rows.length ? rows.map(({ g, best }) => {
      const d = discount(g, best), hit = targetHit(g, best), others = allOffers(g.id).length - 1;
      return `<button class="row" data-open="${esc(g.id)}">
        ${cover(g, 'mini')}
        <div class="mid"><div class="name">${esc(g.titre)}</div>
          <div class="sub">${esc(best.store)}${best.magasin ? ' (en magasin)' : ''} · ${ago(best.at)}${others > 0 ? ` · +${others} offre${others > 1 ? 's' : ''}` : ''}</div>
          <div class="pills" style="margin-top:6px">${EDITION[g.edition] === 'Collector' ? '<span class="pill">Collector</span>' : ''}${d ? `<span class="pill accent">−${d} %</span>` : ''}${hit ? '<span class="pill ok">🎯 Cible atteinte</span>' : ''}</div></div>
        <div class="right"><div class="big ${hit || d ? '' : 'over'}">${fmt(best.price)}</div></div>
      </button>`;
    }).join('') : `<div class="empty"><div class="big">🏷️</div><b>Pas encore de prix</b>${n ? 'Appuie sur « Actualiser » pour chercher les prix dans les enseignes.' : 'Marque des jeux dans « Je le veux » ou choisis « Tout le catalogue ».'}</div>`}
    ${unpriced > 0 && rows.length ? `<p class="hint" style="font-size:12px;color:var(--text3);text-align:center;margin-top:6px">${unpriced} jeu${unpriced > 1 ? 'x' : ''} sans prix trouvé dans cette sélection.</p>` : ''}`;
}

/* ── Réglages ── */
function viewReglages() {
  return `
    <div class="card">
      <h3>🔎 Recherche des prix</h3>
      <p>Les prix sont relevés via <b>Serper</b> (Google Shopping, version France). Colle ta clé : elle reste sur ce téléphone. Chaque jeu actualisé coûte 1 crédit.</p>
      <label class="lbl" for="serper">Clé Serper</label>
      <input type="password" id="serper" placeholder="Colle ta clé" autocomplete="off" value="${esc(S.serperKey)}">
      <div class="btns">
        <button class="btn primary" data-save-key>Enregistrer</button>
        <button class="btn" data-import-hub>Importer depuis mon Hub</button>
      </div>
    </div>
    <div class="card">
      <h3>🏬 Enseignes prises en compte</h3>
      <p>Seules ces enseignes apparaissent dans les prix. Un nom par ligne.</p>
      <label class="lbl" for="stores">Enseignes</label>
      <textarea id="stores">${esc(S.stores)}</textarea>
      <div class="btns"><button class="btn primary" data-save-stores>Enregistrer</button><button class="btn" data-reset-stores>Valeurs par défaut</button></div>
    </div>
    <div class="card">
      <h3>📋 Mes données</h3>
      <p>Ta liste et tes prix restent dans ce navigateur.</p>
      <div class="btns">
        <button class="btn" data-copy-list>Copier ma liste</button>
        <button class="btn" data-clear-prices>Effacer les prix</button>
        ${ui.installEvt ? '<button class="btn primary" data-install>Installer l\'application</button>' : ''}
      </div>
    </div>
    <div class="card">
      <h3>ℹ️ À savoir</h3>
      <p>• Les prix en ligne viennent d'un comparateur : ils peuvent être périmés ou concerner un vendeur tiers. <b>Vérifie sur le site de l'enseigne avant d'acheter.</b><br>
      • Les prix <b>en magasin</b> n'existent sur aucun site : note-les à la main dans la fiche d'un jeu, avec l'enseigne.<br>
      • Les dates de fin de promotion ne sont presque jamais publiées : l'application affiche la date du relevé.<br>
      • Pour l'installer : menu ⋮ du navigateur, puis « Ajouter à l'écran d'accueil » ou « Installer l'application ».</p>
    </div>`;
}

/* ════════════════ FICHE D'UN JEU ════════════════ */
let openId = null;
function openSheet(id) {
  openId = id;
  const root = $('#sheet-root');
  root.innerHTML = '<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true"></div>';
  fillSheet();
  requestAnimationFrame(() => { $('.scrim', root).classList.add('on'); $('.sheet', root).classList.add('on'); });
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  const root = $('#sheet-root');
  $('.scrim', root)?.classList.remove('on'); $('.sheet', root)?.classList.remove('on');
  document.body.style.overflow = '';
  setTimeout(() => { if (!openId) root.innerHTML = ''; }, 300);
  openId = null; render();
}
function fillSheet() {
  const g = byId(openId); if (!g) return closeSheet();
  const m = M.marks[g.id] || {};
  const [supLabel, supCls] = SUPPORT[g.support] || SUPPORT.inconnu;
  const conf = CONF[g.confiance] || '';
  const offers = allOffers(g.id);
  const best = offers[0];
  const checked = P.prices[g.id];
  const sources = (g.sources || []).filter(s => /^https:\/\//.test(s.url)).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join('');
  const sights = P.sightings[g.id] || [];
  $('.sheet').innerHTML = `
    <div class="grab" data-close></div>
    <div class="head">
      ${cover(g, 'hero')}
      <div style="min-width:0">
        <h2>${esc(g.titre)}</h2>
        <div class="sub" style="color:var(--text2);font-size:13px;margin-top:4px">${esc(g.editeur || 'Éditeur à compléter')}</div>
        <div class="pills"><span class="pill">${esc(EDITION[g.edition] || 'Standard')}</span><span class="pill ${supCls}">${supLabel}${conf ? ' · ' + conf : ''}</span></div>
      </div>
    </div>
    <div class="toggle-row">
      <button class="owned ${m.state === 'owned' ? 'on' : ''}" data-mark="owned">${m.state === 'owned' ? '✓ ' : ''}Je l'ai</button>
      <button class="wish ${m.state === 'wish' ? 'on' : ''}" data-mark="wish">${m.state === 'wish' ? '★ ' : ''}Je le veux</button>
    </div>
    ${m.state === 'wish' ? `<label class="lbl" for="target">Prix cible (€)</label><input type="text" inputmode="decimal" id="target" placeholder="ex. 45" value="${m.target != null ? String(m.target).replace('.', ',') : ''}">` : ''}

    <div class="section">Prix en France</div>
    ${offers.length ? offers.map((o, i) => `
      <div class="offer">
        <div class="st">${esc(o.store)}${o.magasin ? ' · en magasin' : ''}<small>${o.magasin ? 'relevé ' : ''}${ago(o.at)}${o.note ? ' · ' + esc(o.note) : ''}</small></div>
        <div class="pr ${i === 0 ? 'best' : ''}">${fmt(o.price)}</div>
        ${o.url ? `<a class="go" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Voir</a>` : ''}
        ${o.magasin ? `<button class="del-sight" data-del-sight="${P.sightings[g.id].findIndex(x => x.at === o.at && x.price === o.price)}" aria-label="Supprimer" style="color:var(--text3)">✕</button>` : ''}
      </div>`).join('')
      : `<p class="note" style="margin-top:0">${checked ? "Aucune offre trouvée dans les enseignes lors du dernier relevé." : 'Aucun prix relevé pour ce jeu.'}</p>`}
    ${g.prix_note || g.prix_eur ? `<p class="note">Repère de la fiche : ${g.prix_eur ? fmt(g.prix_eur) + ' — ' : ''}${esc(g.prix_note || '')}</p>` : ''}
    <div class="btns"><button class="btn" data-refresh-one ${ui.busy ? 'disabled' : ''}>🔄 Actualiser ce jeu</button></div>

    <div class="section">J'ai vu ce jeu en magasin</div>
    <div class="inline">
      <input type="text" id="s-store" list="stores-list" placeholder="Enseigne (ex. Auchan)" style="flex:2">
      <input type="text" id="s-price" inputmode="decimal" placeholder="Prix €" style="flex:1">
    </div>
    <datalist id="stores-list">${storeEntries().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="btns"><button class="btn primary" data-add-sight>Ajouter ce relevé</button></div>

    ${g.note ? `<div class="note">${esc(g.note)}</div>` : ''}
    ${sources ? `<div class="section">Sources</div><div class="src">${sources}</div>` : ''}
    ${g.custom ? '<div class="btns"><button class="btn" data-del-game style="color:var(--accent)">Supprimer ce jeu</button></div>' : ''}`;
}

/* ════════════════ ÉVÉNEMENTS ════════════════ */
document.addEventListener('click', async e => {
  const t = e.target.closest('button, a, [data-close]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) return go(d.tab);
  if (d.open) return openSheet(d.open);
  if (d.close !== undefined) return closeSheet();
  if (d.cfilter) { ui.cfilter = d.cfilter; return render(); }
  if (d.seg) { ui.seg = d.seg; return render(); }
  if (d.scope) { ui.scope = d.scope; return render(); }
  if (d.sort) { ui.sort = d.sort; return render(); }
  if (d.hideNotice !== undefined) { S.hideNotice = true; saveS(); return render(); }
  if (d.refresh !== undefined) return refreshPrices(games().filter(g => ui.scope === 'all' || markOf(g.id) === 'wish').map(g => g.id));
  if (d.refreshOne !== undefined) { await refreshPrices([openId]); return openId && fillSheet(); }
  if (d.mark) {
    const cur = markOf(openId);
    if (cur === d.mark) delete M.marks[openId]; else M.marks[openId] = { ...(M.marks[openId] || {}), state: d.mark };
    saveM(); return fillSheet();
  }
  if (d.addSight !== undefined) {
    const store = $('#s-store').value.trim(), price = parseFloat($('#s-price').value.replace(/\s/g, '').replace(',', '.'));
    if (!store || !isFinite(price) || price <= 0 || price > 500) return toast("Indique l'enseigne et un prix valide");
    (P.sightings[openId] = P.sightings[openId] || []).push({ store, price, at: Date.now(), note: '' });
    saveP(); toast('Relevé ajouté'); return fillSheet();
  }
  if (d.delSight !== undefined) { P.sightings[openId]?.splice(+d.delSight, 1); saveP(); return fillSheet(); }
  if (d.delGame !== undefined) {
    if (!confirm('Supprimer ce jeu ?')) return;
    M.custom = M.custom.filter(g => g.id !== openId); delete M.marks[openId]; saveM(); return closeSheet();
  }
  if (d.addGame !== undefined) {
    const titre = (prompt('Titre du jeu ?') || '').trim(); if (!titre) return;
    const ed = /collector/i.test(prompt('Édition ? Tape « collector » pour une collector, sinon laisse vide.') || '') ? 'collector' : 'standard';
    M.custom.push({ id: 'perso-' + Date.now(), titre, editeur: '', type: 'natif', edition: ed, support: 'inconnu', confiance: 'inconnu', prix_eur: null, prix_note: '', note: '', sources: [], custom: true });
    saveM(); toast('Jeu ajouté'); return render();
  }
  if (d.saveKey !== undefined) { S.serperKey = $('#serper').value.trim(); saveS(); return toast(S.serperKey ? 'Clé enregistrée' : 'Clé effacée'); }
  if (d.importHub !== undefined) {
    let hub = null; try { hub = JSON.parse(localStorage.getItem('hub-ia-config') || 'null'); } catch {}
    if (!hub?.serperKey) return toast('Aucune clé Serper trouvée dans ton Hub (ouvre-le une fois dans ce navigateur)');
    S.serperKey = hub.serperKey; saveS(); render(); return toast('Clé importée depuis ton Hub');
  }
  if (d.saveStores !== undefined) { S.stores = $('#stores').value.trim() || DEFAULT_STORES.join('\n'); saveS(); return toast('Enseignes enregistrées'); }
  if (d.resetStores !== undefined) { S.stores = DEFAULT_STORES.join('\n'); saveS(); render(); return toast('Enseignes remises par défaut'); }
  if (d.clearPrices !== undefined) { if (confirm('Effacer tous les prix relevés ?')) { P = { prices: {}, hist: {}, sightings: P.sightings }; saveP(); render(); toast('Prix effacés'); } return; }
  if (d.copyList !== undefined) {
    const lines = [];
    for (const [label, key] of [['Je les ai', 'owned'], ['Je les veux', 'wish']]) {
      const items = games().filter(g => markOf(g.id) === key); if (!items.length) continue;
      lines.push(label + ' :'); items.forEach(g => lines.push(`- ${g.titre}${g.edition !== 'standard' ? ' (' + EDITION[g.edition] + ')' : ''}${key === 'wish' && M.marks[g.id].target ? ' — prix cible ' + M.marks[g.id].target + ' €' : ''}`)); lines.push('');
    }
    try { await navigator.clipboard.writeText(lines.join('\n') || 'Liste vide'); toast('Liste copiée'); } catch { toast('Copie impossible'); }
    return;
  }
  if (d.install !== undefined && ui.installEvt) { ui.installEvt.prompt(); ui.installEvt = null; render(); }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; renderGrid(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'target' && openId) {
    const v = parseFloat(String(e.target.value).replace(/\s/g, '').replace(',', '.'));
    if (M.marks[openId]) { M.marks[openId].target = isFinite(v) && v > 0 ? v : null; saveM(); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) closeSheet(); });
$('#top-action').addEventListener('click', () => $('[data-refresh]')?.click());
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installEvt = e; if (ui.tab === 'reglages') render(); });

/* ════════════════ DÉMARRAGE ════════════════ */
const hash = location.hash.slice(1);
if (TABS.some(([id]) => id === hash)) ui.tab = hash;
render();
fetch('catalogue.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => { CAT = d.jeux || []; META = d; render(); })
  .catch(() => { $('#view').innerHTML = '<div class="empty"><div class="big">📡</div><b>Catalogue indisponible</b>Vérifie ta connexion et recharge la page.</div>'; });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
