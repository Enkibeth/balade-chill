import type { Balade, Etape, Enigme, MedicalBonus } from '@/types'
import {
  bonusBadge,
  bonusCategoryDef,
  resolveBonusCategory,
} from '@/lib/ai/bonus'
import { buildBaladeItinerary } from '@/lib/ai/itinerary/fromBalade'
import type { ItineraryPlan } from '@/lib/ai/itinerary/types'

/** Escapes a string for safe insertion into HTML text/attribute context. */
function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapes then turns blank-line-separated text into <p> paragraphs. */
function paragraphs(value: string): string {
  return String(value ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const DIFFICULTY_LABEL: Record<string, string> = {
  facile: '✦ Facile',
  moyen: '◆ Moyen',
  difficile: '💀 Difficile',
  boss: '💀 Boss',
}

const POLYBE_ROWS = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O'],
  ['P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y/Z'],
]

function polybeGrid(): string {
  const head =
    '<tr><th></th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>'
  const body = POLYBE_ROWS.map(
    (row, i) =>
      `<tr><th>${i + 1}</th>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`,
  ).join('')
  return `<div class="polybe-grid"><table>${head}${body}</table></div>`
}

const MORSE_CHART: Array<[string, string]> = [
  ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'],
  ['F', '..-.'], ['G', '--.'], ['H', '....'], ['I', '..'], ['J', '.---'],
  ['K', '-.-'], ['L', '.-..'], ['M', '--'], ['N', '-.'], ['O', '---'],
  ['P', '.--.'], ['Q', '--.-'], ['R', '.-.'], ['S', '...'], ['T', '-'],
  ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'], ['Y', '-.--'],
  ['Z', '--..'],
]

function morseChart(): string {
  const cells = MORSE_CHART.map(
    ([letter, code]) =>
      `<span class="morse-cell"><b>${letter}</b> ${code}</span>`,
  ).join('')
  return `<div class="morse-chart">${cells}</div>`
}

function enigmeAid(type: Enigme['type']): string {
  if (type === 'polybe') return polybeGrid()
  if (type === 'morse') return morseChart()
  return ''
}

function renderEnigme(enigme: Enigme, order: number): string {
  const grid = enigmeAid(enigme.type)
  return `
      <div class="enigme-block">
        <div class="difficulty-tag">${esc(DIFFICULTY_LABEL[enigme.difficulty] ?? enigme.difficulty)}</div>
        <div class="enigme-title">🔐 Énigme ${order} · ${esc(enigme.title)}</div>
        <div class="enigme-text">${esc(enigme.instruction)}</div>
        ${grid}
        <div class="cipher-block">
          <span class="cipher-label">— message chiffré —</span>
          <div class="cipher-code">${esc(enigme.cipher_display)}</div>
        </div>
      </div>
      <div class="toggle-row">
        <button class="toggle-btn hint" onclick="go(this,'h${order}')">💡 Indice</button>
        <button class="toggle-btn answer" onclick="go(this,'a${order}')">✓ Réponse</button>
      </div>
      <div class="reveal-content hint-content" id="h${order}">${esc(enigme.hint)}</div>
      <div class="reveal-content answer-content" id="a${order}"><strong>${esc(enigme.answer)}</strong><br>${esc(enigme.answer_explanation)}</div>`
}

function renderMedical(bonus: MedicalBonus, order: number): string {
  const cat = bonusCategoryDef(resolveBonusCategory(bonus))
  const hint = bonus.hint?.trim()
    ? `<em>Indice : ${esc(bonus.hint)}</em><br>`
    : ''
  return `
      <div class="med-block">
        <div class="med-title">${cat.emoji} ${esc(cat.blockTitle)}</div>
        <span class="med-spec">${esc(bonusBadge(bonus))}</span>
        <p class="med-question">${esc(bonus.question)}</p>
      </div>
      <div class="toggle-row">
        <button class="toggle-btn med-answer" onclick="go(this,'m${order}')">Voir la réponse</button>
      </div>
      <div class="reveal-content med-content" id="m${order}">${hint}${esc(bonus.answer)}</div>`
}

function renderEtape(etape: Etape, total: number): string {
  const isLast = etape.order === total
  const mapsBtn = etape.maps_url
    ? `<a class="maps-btn" href="${esc(etape.maps_url)}" target="_blank" rel="noopener">🗺 Ouvrir dans Google Maps</a>`
    : ''
  return `
  <div class="etape" id="e${etape.order}">
    <div class="etape-header">
      <div class="etape-number">${ROMAN[etape.order] ?? etape.order}</div>
      <div class="etape-header-text">
        <div class="etape-label">Étape ${etape.order}${isLast ? ' · Finale' : ''} · ${etape.walk_minutes} min de marche</div>
        <div class="etape-location">${esc(etape.location_name)}</div>
      </div>
    </div>
    <div class="etape-body">
      <div class="story-excerpt">${paragraphs(etape.story_text)}</div>
      <div class="direction">
        <div class="direction-icon">🚶</div>
        <div class="direction-text">${esc(etape.direction_text)}<br>${mapsBtn}</div>
      </div>
      ${renderEnigme(etape.enigme, etape.order)}
      ${etape.medical_bonus ? renderMedical(etape.medical_bonus, etape.order) : ''}
      <div class="action-block">
        <span class="action-label">✦ Mission</span>
        ${esc(etape.action_mission)}
      </div>
    </div>
  </div>`
}

/**
 * Renders the "complete itinerary" call-to-action: one (or more) Google Maps
 * links that open the whole walk in order, with the real place names. Returns an
 * empty string when there aren't enough geolocated étapes to build a route.
 */
function renderItinerary(plan: ItineraryPlan | null): string {
  if (!plan) return ''
  const urls = plan.segments.flatMap((s) => s.googleMapsUrls)
  if (urls.length === 0) return ''
  const multi = urls.length > 1
  const links = urls
    .map(
      (url, i) =>
        `<a class="maps-btn itinerary-btn" href="${esc(url)}" target="_blank" rel="noopener">🗺 Suivre l'itinéraire${multi ? ` (partie ${i + 1})` : ''} dans Google Maps</a>`,
    )
    .join('')
  const meta = `Le parcours complet, dans l'ordre des étapes — <strong>~${plan.totalDistanceKm} km</strong>${plan.isLoop ? ' · boucle' : ''}`
  return `
  <div class="itinerary">
    <div class="itinerary-header">🧭 Itinéraire</div>
    <p class="itinerary-meta">${meta}</p>
    <div class="itinerary-btns">${links}</div>
  </div>`
}

/**
 * Renders a complete, self-contained, offline-ready HTML document for a balade,
 * styled in the "Le Secret d'Amalia" parchment aesthetic and themed with the
 * balade's own colour palette.
 */
export function renderBaladeHtml(balade: Balade): string {
  const t = balade.theme_color
  const etapes = [...balade.etapes].sort((a, b) => a.order - b.order)
  const total = etapes.length
  const medCount = etapes.filter((e) => e.medical_bonus).length
  const itineraryBlock = renderItinerary(buildBaladeItinerary(balade))
  const difficultyClass =
    balade.difficulty === 'difficile' || balade.difficulty === 'boss'
      ? 'hard'
      : ''

  const dots = etapes
    .map(
      (e, i) =>
        `<a class="step-dot${i === 0 ? ' active' : ''}" href="#e${e.order}">${e.order}</a>` +
        (i < total - 1 ? '<div class="step-line"></div>' : ''),
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(balade.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Lora:ital,wght@0,400;0,600;1,400&family=Dancing+Script:wght@600&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --cream: #f5efe0;
    --parchment: #e8dcc8;
    --ink: #2c1810;
    --burgundy: ${esc(t.primary)};
    --gold: ${esc(t.secondary)};
    --rose: ${esc(t.accent)};
    --faded: #8a7060;
    --teal: #1a6b6b;
    --cipher-bg: #1e1410;
    --cipher-green: #4ade80;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background-color: ${esc(t.bg)}; font-family: 'Lora', serif; color: var(--ink); min-height: 100vh; }
  body::before { content: ''; position: fixed; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E"); pointer-events: none; z-index: 1000; opacity: 0.3; }
  .container { max-width: 720px; margin: 0 auto; padding: 20px 16px 60px; }
  .cover { background: var(--cream); border: 2px solid var(--gold); padding: 48px 32px; text-align: center; position: relative; margin-bottom: 24px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.6), inset 0 0 80px rgba(0,0,0,0.05); }
  .cover::before { content: ''; position: absolute; inset: 8px; border: 1px solid rgba(0,0,0,0.18); pointer-events: none; }
  .cover-ornament { font-size: 28px; letter-spacing: 12px; color: var(--gold); opacity: 0.7; margin-bottom: 20px; }
  .cover-label { font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: var(--faded); margin-bottom: 16px; }
  .cover-title { font-family: 'Playfair Display', serif; font-size: clamp(32px, 8vw, 52px); font-style: italic; color: var(--burgundy); line-height: 1.1; margin-bottom: 8px; }
  .cover-subtitle { font-family: 'Dancing Script', cursive; font-size: 20px; color: var(--faded); margin-bottom: 28px; }
  .cover-divider { width: 60px; height: 1px; background: var(--gold); margin: 0 auto 24px; }
  .cover-meta { font-size: 13px; color: var(--faded); line-height: 1.8; }
  .cover-meta strong { color: var(--burgundy); font-style: italic; }
  .cover-badge { display: inline-flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; justify-content: center; }
  .badge { background: var(--parchment); border: 1px solid var(--gold); border-radius: 100px; padding: 4px 14px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--faded); }
  .badge.med { border-color: var(--teal); color: var(--teal); }
  .badge.hard { border-color: var(--burgundy); color: var(--burgundy); }
  .prologue { background: var(--cream); border-left: 3px solid var(--burgundy); padding: 24px 28px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
  .prologue-header { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: var(--burgundy); margin-bottom: 14px; }
  .prologue p { font-size: 14px; line-height: 1.85; font-style: italic; }
  .prologue p + p { margin-top: 12px; }
  .itinerary { background: var(--cream); border-left: 3px solid var(--gold); padding: 20px 28px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
  .itinerary-header { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 10px; }
  .itinerary-meta { font-size: 13px; color: var(--faded); line-height: 1.7; margin-bottom: 12px; }
  .itinerary-meta strong { color: var(--burgundy); font-style: italic; }
  .itinerary-btns { display: flex; flex-wrap: wrap; gap: 10px; }
  .itinerary-btn { margin-top: 0; }
  .progress-bar { background: var(--parchment); border: 1px solid rgba(0,0,0,0.2); padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
  .step-dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.25); background: var(--parchment); display: flex; align-items: center; justify-content: center; font-size: 11px; font-family: 'Playfair Display', serif; color: var(--faded); transition: all 0.3s; flex-shrink: 0; text-decoration: none; }
  .step-dot.active { background: var(--burgundy); border-color: var(--burgundy); color: var(--cream); }
  .step-dot.done { background: var(--gold); border-color: var(--gold); color: white; }
  .step-line { flex: 1; height: 1px; background: rgba(0,0,0,0.2); }
  .etape { background: var(--cream); margin-bottom: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.5); overflow: hidden; }
  .etape-header { background: var(--burgundy); padding: 18px 24px; display: flex; align-items: center; gap: 16px; }
  .etape-number { font-family: 'Playfair Display', serif; font-size: 32px; font-style: italic; color: rgba(245,239,224,0.3); line-height: 1; flex-shrink: 0; min-width: 32px; }
  .etape-label { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(245,239,224,0.55); margin-bottom: 2px; }
  .etape-location { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--cream); font-style: italic; }
  .etape-body { padding: 24px; }
  .story-excerpt { background: var(--parchment); border-left: 2px solid var(--rose); padding: 14px 18px 14px 34px; margin-bottom: 20px; font-size: 13.5px; font-style: italic; line-height: 1.8; color: #4a3020; position: relative; }
  .story-excerpt::before { content: '❝'; font-family: 'Playfair Display', serif; font-size: 32px; color: var(--rose); opacity: 0.4; position: absolute; top: 2px; left: 12px; }
  .direction { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 20px; background: #f0e8d8; padding: 12px 16px; border: 1px solid rgba(0,0,0,0.15); }
  .direction-icon { font-size: 18px; flex-shrink: 0; }
  .direction-text { font-size: 13px; color: var(--faded); line-height: 1.6; }
  .enigme-block { border: 1.5px solid var(--burgundy); padding: 20px; margin-bottom: 16px; position: relative; }
  .difficulty-tag { position: absolute; top: -1px; right: 16px; background: var(--burgundy); color: var(--cream); font-size: 9px; letter-spacing: 2px; text-transform: uppercase; padding: 3px 10px; }
  .enigme-title { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--burgundy); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .enigme-title::after { content: ''; flex: 1; height: 1px; background: rgba(0,0,0,0.15); }
  .enigme-text { font-size: 14px; line-height: 1.85; color: var(--ink); }
  .cipher-block { background: var(--cipher-bg); border: 1px solid rgba(74,222,128,0.25); padding: 16px 20px; margin: 14px 0; font-family: 'JetBrains Mono', monospace; color: var(--cipher-green); text-align: center; box-shadow: inset 0 0 20px rgba(74,222,128,0.05); }
  .cipher-block .cipher-label { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: rgba(74,222,128,0.4); display: block; margin-bottom: 8px; font-family: 'Lora', serif; }
  .cipher-block .cipher-code { font-size: 18px; font-weight: 700; word-break: break-word; line-height: 1.6; letter-spacing: 3px; }
  .polybe-grid { margin: 14px auto; max-width: 300px; }
  .polybe-grid table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 13px; background: var(--cipher-bg); }
  .polybe-grid th { background: rgba(74,222,128,0.15); color: var(--cipher-green); padding: 6px; text-align: center; border: 1px solid rgba(74,222,128,0.2); }
  .polybe-grid td { color: rgba(245,239,224,0.6); padding: 6px; text-align: center; border: 1px solid rgba(74,222,128,0.1); }
  .morse-chart { display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 2px 10px; margin: 14px auto; max-width: 340px; background: var(--cipher-bg); border: 1px solid rgba(74,222,128,0.2); padding: 12px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .morse-chart .morse-cell { color: rgba(245,239,224,0.6); white-space: nowrap; }
  .morse-chart .morse-cell b { color: var(--cipher-green); font-weight: 700; }
  .med-block { border: 1.5px solid var(--teal); padding: 20px; margin-bottom: 16px; background: rgba(26,107,107,0.04); }
  .med-title { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--teal); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .med-title::after { content: ''; flex: 1; height: 1px; background: rgba(26,107,107,0.2); }
  .med-question { font-size: 13.5px; line-height: 1.8; color: var(--ink); }
  .med-spec { display: inline-block; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; background: var(--teal); color: white; padding: 2px 8px; border-radius: 100px; margin-bottom: 10px; }
  .action-block { background: rgba(0,0,0,0.04); border: 1px dashed var(--rose); padding: 14px 18px; font-size: 13px; line-height: 1.7; }
  .action-label { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: var(--rose); display: block; margin-bottom: 6px; }
  .maps-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; background: #1a73e8; color: white !important; text-decoration: none; padding: 9px 16px; font-size: 12px; border-radius: 2px; }
  .toggle-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 4px; }
  .toggle-btn { background: transparent; border: 1.5px solid; padding: 7px 16px; font-family: 'Lora', serif; font-size: 12px; cursor: pointer; transition: all 0.25s; }
  .toggle-btn.hint { border-color: var(--gold); color: var(--gold); }
  .toggle-btn.hint.open { background: var(--gold); color: white; }
  .toggle-btn.answer { border-color: var(--burgundy); color: var(--burgundy); }
  .toggle-btn.answer.open { background: var(--burgundy); color: var(--cream); }
  .toggle-btn.med-answer { border-color: var(--teal); color: var(--teal); }
  .toggle-btn.med-answer.open { background: var(--teal); color: white; }
  .reveal-content { display: none; margin-top: 12px; padding: 12px 16px; font-size: 13px; line-height: 1.75; }
  .reveal-content.hint-content { background: rgba(0,0,0,0.05); border-left: 2px solid var(--gold); }
  .reveal-content.answer-content { background: rgba(0,0,0,0.05); border-left: 2px solid var(--burgundy); color: var(--burgundy); font-style: italic; }
  .reveal-content.med-content { background: rgba(26,107,107,0.07); border-left: 2px solid var(--teal); color: #0f4a4a; }
  .epilogue { background: var(--ink); color: var(--cream); padding: 40px 28px; text-align: center; box-shadow: 0 4px 30px rgba(0,0,0,0.6); }
  .epilogue-ornament { font-size: 24px; letter-spacing: 10px; color: var(--gold); opacity: 0.6; margin-bottom: 20px; }
  .epilogue h2 { font-family: 'Playfair Display', serif; font-size: 26px; font-style: italic; color: var(--cream); margin-bottom: 20px; }
  .epilogue p { font-size: 14px; line-height: 1.85; color: rgba(245,239,224,0.78); max-width: 480px; margin: 0 auto 16px; }
  .epilogue-divider { width: 40px; height: 1px; background: rgba(255,255,255,0.25); margin: 20px auto; }
</style>
</head>
<body>
<div class="container">
  <div class="cover">
    <div class="cover-ornament">✦ ✦ ✦</div>
    <div class="cover-label">Une aventure romantique à ${esc(balade.city)}</div>
    <h1 class="cover-title">${esc(balade.title)}</h1>
    <div class="cover-subtitle">${esc(balade.city)} · ${esc(balade.country)}</div>
    <div class="cover-divider"></div>
    <p class="cover-meta">Un parcours de <strong>~${Math.round(balade.estimated_duration_min / 60 * 10) / 10}h</strong> · <strong>${balade.distance_km} km</strong> · Chiffres, codes &amp; questions bonus</p>
    <div class="cover-badge">
      <span class="badge ${difficultyClass}">${esc(DIFFICULTY_LABEL[balade.difficulty] ?? balade.difficulty)}</span>
      <span class="badge">${total} étapes</span>
      ${medCount > 0 ? `<span class="badge med">✦ ${medCount} question${medCount > 1 ? 's' : ''} bonus</span>` : ''}
    </div>
  </div>
  <div class="progress-bar">${dots}</div>
  <div class="prologue">
    <div class="prologue-header">✦ Prologue</div>
    ${paragraphs(balade.prologue)}
  </div>
  ${itineraryBlock}
  ${etapes.map((e) => renderEtape(e, total)).join('')}
  <div class="epilogue">
    <div class="epilogue-ornament">✦</div>
    <h2>Fin de l'aventure</h2>
    ${paragraphs(balade.epilogue)}
    <div class="epilogue-divider"></div>
    <div class="epilogue-ornament" style="margin-top:8px;">✦ ✦ ✦</div>
  </div>
</div>
<script>
function go(btn, id) {
  var el = document.getElementById(id);
  if (!el) return;
  var open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  btn.classList.toggle('open', !open);
  var labels = btn.classList.contains('hint')
    ? ['💡 Indice', '💡 Masquer']
    : btn.classList.contains('answer')
      ? ['✓ Réponse', '✓ Masquer']
      : ['Voir la réponse', 'Masquer'];
  btn.textContent = open ? labels[0] : labels[1];
}
document.querySelectorAll('.step-dot').forEach(function (d) {
  d.addEventListener('click', function (e) {
    e.preventDefault();
    var target = document.querySelector(d.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
var etapes = document.querySelectorAll('.etape');
var dots = document.querySelectorAll('.step-dot');
etapes.forEach(function (el) {
  new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var i = [].indexOf.call(etapes, entry.target);
      dots.forEach(function (d, j) {
        d.classList.remove('active', 'done');
        if (j < i) d.classList.add('done');
        else if (j === i) d.classList.add('active');
      });
    });
  }, { threshold: 0.4 }).observe(el);
});
</script>
</body>
</html>`
}
