// src/lib/ai/parcours/render-html.ts
// Rendu HTML autonome (hors-ligne) d'un parcours de visite. Même esprit
// « parchemin » que les balades, mais allégé : pas d'énigme, chaque arrêt
// affiche une anecdote, une question (réponse repliée) et son lien Google Maps.
// Le bloc « itinéraire complet » réutilise les liens nommés du moteur.

import type { GeneratedParcours } from './types'

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function paragraphs(value: string): string {
  return String(value ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function pointMapsUrl(name: string, lat: number, lng: number): string {
  const q = name?.trim() ? encodeURIComponent(name.trim()) : `${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

function renderItineraryBlock(parcours: GeneratedParcours): string {
  const urls = parcours.google_maps_urls
  if (!urls || urls.length === 0) return ''
  const multi = urls.length > 1
  const links = urls
    .map(
      (url, i) =>
        `<a class="maps-btn" href="${esc(url)}" target="_blank" rel="noopener">🗺 Suivre l'itinéraire${multi ? ` (partie ${i + 1})` : ''} dans Google Maps</a>`,
    )
    .join('')
  const meta = `Le parcours complet, dans l'ordre des arrêts — <strong>~${parcours.distance_km} km</strong>${parcours.is_loop ? ' · boucle' : ''}`
  return `
  <div class="itinerary">
    <div class="section-label">🧭 Itinéraire</div>
    <p class="itinerary-meta">${meta}</p>
    <div class="itinerary-btns">${links}</div>
  </div>`
}

function renderStop(
  stop: GeneratedParcours['stops'][number],
  order: number,
): string {
  const hasQuestion = Boolean(stop.question)
  return `
  <div class="stop" id="s${order}">
    <div class="stop-header">
      <div class="stop-number">${order}</div>
      <div class="stop-location">${esc(stop.name)}</div>
    </div>
    <div class="stop-body">
      ${stop.anecdote ? `<div class="anecdote">${paragraphs(stop.anecdote)}</div>` : ''}
      ${
        hasQuestion
          ? `<div class="quiz">
        <div class="section-label">✦ Question</div>
        <p class="quiz-question">${esc(stop.question)}</p>
        <button type="button" class="toggle-btn" onclick="toggleAnswer(this,'a${order}')">Voir la réponse</button>
        <div class="quiz-answer" id="a${order}">${paragraphs(stop.answer)}</div>
      </div>`
          : ''
      }
      <a class="maps-btn point-btn" href="${esc(pointMapsUrl(stop.name, stop.lat, stop.lng))}" target="_blank" rel="noopener">📍 Ouvrir ce lieu dans Google Maps</a>
    </div>
  </div>`
}

/** Rend un document HTML complet et autonome pour un parcours de visite. */
export function renderParcoursHtml(parcours: GeneratedParcours): string {
  const stops = parcours.stops
  const durationH = Math.round((parcours.estimated_duration_min / 60) * 10) / 10
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(parcours.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
  :root { --cream:#f5efe0; --parchment:#e8dcc8; --ink:#2c1810; --burgundy:#5a3e2b; --gold:#b8860b; --rose:#c4757a; --faded:#8a7060; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#1a0f08; font-family:'Lora',serif; color:var(--ink); min-height:100vh; }
  .container { max-width:720px; margin:0 auto; padding:20px 16px 60px; }
  .cover { background:var(--cream); border:2px solid var(--gold); padding:44px 32px; text-align:center; margin-bottom:24px; box-shadow:0 8px 40px rgba(0,0,0,0.6); }
  .cover-ornament { font-size:26px; letter-spacing:12px; color:var(--gold); opacity:0.7; margin-bottom:18px; }
  .cover-label { font-size:11px; letter-spacing:5px; text-transform:uppercase; color:var(--faded); margin-bottom:14px; }
  .cover-title { font-family:'Playfair Display',serif; font-size:clamp(30px,7vw,46px); font-style:italic; color:var(--burgundy); line-height:1.12; margin-bottom:8px; }
  .cover-subtitle { font-size:15px; color:var(--faded); margin-bottom:20px; }
  .cover-meta { font-size:13px; color:var(--faded); }
  .cover-meta strong { color:var(--burgundy); font-style:italic; }
  .intro { background:var(--cream); border-left:3px solid var(--burgundy); padding:22px 26px; margin-bottom:22px; box-shadow:0 4px 20px rgba(0,0,0,0.4); }
  .intro p { font-size:14px; line-height:1.85; font-style:italic; }
  .intro p + p { margin-top:10px; }
  .section-label { font-size:11px; letter-spacing:4px; text-transform:uppercase; color:var(--gold); margin-bottom:10px; }
  .itinerary { background:var(--cream); border-left:3px solid var(--gold); padding:20px 26px; margin-bottom:22px; box-shadow:0 4px 20px rgba(0,0,0,0.4); }
  .itinerary-meta { font-size:13px; color:var(--faded); line-height:1.7; margin-bottom:12px; }
  .itinerary-meta strong { color:var(--burgundy); font-style:italic; }
  .itinerary-btns { display:flex; flex-wrap:wrap; gap:10px; }
  .stop { background:var(--cream); margin-bottom:18px; box-shadow:0 4px 24px rgba(0,0,0,0.5); overflow:hidden; }
  .stop-header { background:var(--burgundy); padding:16px 22px; display:flex; align-items:center; gap:14px; }
  .stop-number { font-family:'Playfair Display',serif; font-size:26px; font-style:italic; color:rgba(245,239,224,0.35); min-width:26px; }
  .stop-location { font-family:'Playfair Display',serif; font-size:18px; color:var(--cream); font-style:italic; }
  .stop-body { padding:22px; }
  .anecdote { font-size:14px; line-height:1.85; color:#4a3020; margin-bottom:18px; }
  .quiz { background:#f0e8d8; border:1px solid rgba(0,0,0,0.12); padding:14px 18px; margin-bottom:16px; }
  .quiz-question { font-size:14px; line-height:1.7; color:var(--ink); margin-bottom:12px; }
  .quiz-answer { display:none; margin-top:12px; padding:12px 16px; background:rgba(0,0,0,0.05); border-left:2px solid var(--gold); font-size:13px; line-height:1.75; font-style:italic; color:var(--burgundy); }
  .toggle-btn { background:transparent; border:1.5px solid var(--gold); color:var(--gold); padding:7px 16px; font-family:'Lora',serif; font-size:12px; cursor:pointer; transition:all .25s; }
  .toggle-btn.open { background:var(--gold); color:#fff; }
  .maps-btn { display:inline-flex; align-items:center; gap:8px; background:#1a73e8; color:#fff!important; text-decoration:none; padding:9px 16px; font-size:12px; border-radius:2px; }
  .point-btn { margin-top:4px; background:#2c1810; }
</style>
</head>
<body>
<div class="container">
  <div class="cover">
    <div class="cover-ornament">✦ ✦ ✦</div>
    <div class="cover-label">Parcours de visite · ${esc(parcours.city)}</div>
    <h1 class="cover-title">${esc(parcours.title)}</h1>
    <div class="cover-subtitle">${esc(parcours.city)} · ${esc(parcours.country)}</div>
    <p class="cover-meta">Environ <strong>${durationH}h</strong> · <strong>${parcours.distance_km} km</strong> · <strong>${stops.length} arrêts</strong>${parcours.is_loop ? ' · boucle' : ''}</p>
  </div>
  ${parcours.intro ? `<div class="intro"><div class="section-label">✦ Introduction</div>${paragraphs(parcours.intro)}</div>` : ''}
  ${renderItineraryBlock(parcours)}
  ${stops.map((s, i) => renderStop(s, i + 1)).join('')}
</div>
<script>
function toggleAnswer(btn, id) {
  var el = document.getElementById(id);
  if (!el) return;
  var open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  btn.classList.toggle('open', !open);
  btn.textContent = open ? 'Voir la réponse' : 'Masquer la réponse';
}
</script>
</body>
</html>`
}
