// JS NON VITAL du site vitrine (09/10/2026) — bundlé par le générateur
// (rolldown, minifié, nom à empreinte sous /assets/site/), chargé en `defer`.
//
// Tout ce qui est VITAL vit ailleurs, en ligne dans le <head>
// (aiguillage.js : confirmation, /app, captures d'acquisition et d'offre). Si
// ce fichier prend un 404 au déploiement (CDN, 01/10), la page reste lisible,
// les CTA restent de vrais liens ; on perd la mesure et le bandeau le temps
// d'un rechargement. Budget : 6 Ko gzip, vérifié au build. Aucun import
// dynamique (un morceau absent = du HTML en 200), aucun import de supabase-js
// (184 Ko, revue C M4). Plus aucun quota relu au chargement (décision de Nico
// du 09/10 : aucun chiffre de quota nulle part).
import { ACCEPTE, etatConsentement, poserConsentement } from '../../src/utils/consentement.js';
import { chargerPixel } from '../../src/utils/metaPixel.js';
import { TEXTES_CONSENTEMENT } from '../../src/utils/consentementTextes.js';
import { htmlBandeau } from './bandeau.js';
import { lireJeton } from './aiguillage.js';
import { LANGUES, LANGUE_RACINE, PRIORITE_X_DEFAULT } from '../langues.mjs';

const d = document;
const w = window;
// La langue de la page, telle que déclarée (site/langues.mjs) — jamais un
// « === 'en' » écrit ici (architecture § 2.7).
const LANGUE = LANGUES.find((l) => l.code === d.documentElement.lang) || LANGUES.find((l) => l.code === LANGUE_RACINE);
const lang = LANGUE.code;
const langueDe = (code) => LANGUES.find((l) => l.code === code);

/**
 * Insère un bandeau juste APRÈS le lien d'évitement : il reste le premier
 * arrêt du clavier. Sa feuille (module « bandeaux » de site/styles/site.css,
 * jamais en ligne dans la page : elle ne sert qu'aux visiteurs qui voient un
 * bandeau) est posée une fois, AVANT l'insertion — aucun éclair sans style.
 */
let bandeauxStyles = false;
function insererEnTete(el) {
  if (!bandeauxStyles) {
    bandeauxStyles = true;
    const s = d.createElement('style');
    s.textContent = __FS_CSS_BANDEAUX__;
    d.head.appendChild(s);
  }
  const evitement = d.querySelector('.evitement');
  if (evitement) evitement.after(el);
  else d.body.insertBefore(el, d.body.firstChild);
}
const meta = d.querySelector('meta[name="fillsell-page"]');
// « landing » sur « / » : la même série d'événements qu'avant le site statique
// (LandingPage.jsx), d'où viennent les conversions TikTok et Google Ads.
const page = location.pathname === '/' ? 'landing' : (meta && meta.content) || 'inconnue';

function pousser(evt) {
  (w.dataLayer = w.dataLayer || []).push(evt);
}

function ecrireLangue(code) {
  try { localStorage.setItem('fs_lang', code); } catch { /* mode privé */ }
}

// Navigation APRÈS l'envoi des balises : sur un vrai lien, la page meurt au
// clic et emporte la requête de mesure (revue A I6). GTM rappelle
// eventCallback quand ses balises sont parties, ou au bout d'eventTimeout ;
// la minuterie à nous couvre le cas où GTM ne tourne pas (bloqueur) — sans
// elle, le clic ne mènerait nulle part.
function partirApres(evt, lien, e) {
  const nouvelOnglet = lien.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
  if (nouvelOnglet || e.defaultPrevented) { pousser(evt); return; }
  e.preventDefault();
  let parti = false;
  const partir = () => {
    if (parti) return;
    parti = true;
    location.assign(lien.href);
  };
  pousser({ ...evt, eventCallback: partir, eventTimeout: 800 });
  setTimeout(partir, 800);
}

pousser({ event: 'page_view', page });

d.addEventListener('click', (e) => {
  const cible = e.target instanceof Element ? e.target : null;
  const cta = cible && cible.closest('a[data-cta]');
  if (cta) {
    // fs_lang n'est JAMAIS écrit au chargement (il ferait passer l'app d'un
    // visiteur anglophone en français, revue A M3) : seulement sur un choix
    // explicite, ou sur un CTA depuis une page dont la langue le demande
    // (langueApp de site/langues.mjs : « en » pour /en, rien pour la racine).
    if (LANGUE.langueApp) ecrireLangue(LANGUE.langueApp);
    partirApres({ event: 'cta_click', cta: cta.getAttribute('data-cta'), page }, cta, e);
    return;
  }
  const choix = cible && cible.closest('a[data-langue]');
  if (choix) {
    const code = choix.getAttribute('data-langue');
    const choisie = langueDe(code);
    // L'app ne connaît que fr et en : la langue choisie, ramenée à la sienne.
    ecrireLangue((choisie && choisie.langueApp) || code);
    partirApres({ event: 'change_language', language: code }, choix, e);
  }
});

// ── Menu mobile ──────────────────────────────────────────────────────────────
const bouton = d.querySelector('[data-menu]');
const entete = d.querySelector('.entete');
if (bouton && entete) {
  const fermer = () => { entete.classList.remove('menu-ouvert'); bouton.setAttribute('aria-expanded', 'false'); };
  bouton.addEventListener('click', () => {
    const ouvert = entete.classList.toggle('menu-ouvert');
    bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    // Dans le panneau mobile, la liste des plateformes est dépliée d'emblée.
    if (ouvert) entete.querySelectorAll('details.sous-menu').forEach((m) => { m.open = true; });
  });
  // Échap ferme le menu ET rend le focus au bouton : sinon il tombait sur
  // <body> quand un lien du menu l'avait (revue de la fondation M-10).
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !entete.classList.contains('menu-ouvert')) return;
    fermer();
    bouton.focus();
  });
  // Le focus QUITTE l'en-tête (Tab après le dernier lien, lecteur d'écran qui
  // passe au contenu) : le panneau se ferme, sinon l'élément focalisé restait
  // caché dessous (revue technique C-1, WCAG 2.4.11). Le bouton est AVANT le
  // panneau dans le DOM (layout.mjs) : ouvert, le Tab suivant y entre.
  // relatedTarget nul (fenêtre quittée, clic dans le vide) : on ne touche à rien.
  entete.addEventListener('focusout', (e) => {
    const vers = e.relatedTarget;
    if (entete.classList.contains('menu-ouvert') && vers instanceof Element && !entete.contains(vers)) fermer();
  });
  const large = w.matchMedia('(min-width: 1080px)');
  if (large.addEventListener) large.addEventListener('change', (e) => { if (e.matches) fermer(); });
}

// ── « Ouvrir l'app » quand une session existe (revue A M1-4) ──────────────────
let stockage = null;
try { stockage = localStorage; } catch { /* stockage interdit */ }
if (lireJeton(stockage, __FS_CLE_JETON__)) {
  d.querySelectorAll('[data-si-jeton]').forEach((el) => { el.hidden = false; });
}

// ── « This page is available in English » ────────────────────────────────────
// Une suggestion, JAMAIS une redirection : Googlebot explore depuis les
// États-Unis, une redirection par langue lui cacherait les pages françaises
// (revue B M4). Sur les pages de la langue racine seulement (comme avant) :
// la version dans la langue du navigateur si elle existe, sinon la porte
// internationale (PRIORITE_X_DEFAULT) — dans SA langue, avec SON libellé.
const versions = [...d.querySelectorAll('link[rel="alternate"][hreflang]')]
  .map((l) => ({ l: LANGUES.find((x) => x.hreflang === l.getAttribute('hreflang')), href: l.href }))
  .filter((v) => v.l && v.l.code !== lang);
const navigateur = String(navigator.language || LANGUE_RACINE).toLowerCase();
let langueChoisie = null;
let bandeauFerme = false;
try { langueChoisie = localStorage.getItem('fs_lang'); } catch { /* rien */ }
try { bandeauFerme = sessionStorage.getItem('fs_bandeau_langue') === '1'; } catch { /* rien */ }
const suggeree = lang !== LANGUE_RACINE || navigateur.startsWith(lang) || langueChoisie === lang || bandeauFerme ? null
  : versions.find((v) => navigateur.startsWith(v.l.code)) ||
    PRIORITE_X_DEFAULT.map((c) => versions.find((v) => v.l.code === c)).find(Boolean);
if (suggeree) {
  const chemin = new URL(suggeree.href, location.href).pathname;
  const bandeau = d.createElement('div');
  bandeau.className = 'bandeau-langue';
  bandeau.lang = suggeree.l.code;
  bandeau.innerHTML = '<a href="' + chemin + '" hreflang="' + suggeree.l.hreflang + '" data-langue="' + suggeree.l.code + '"></a>' +
    '<button type="button">×</button>';
  bandeau.querySelector('a').textContent = suggeree.l.suggestion;
  bandeau.querySelector('button').setAttribute('aria-label', suggeree.l.fermer);
  bandeau.querySelector('button').addEventListener('click', () => {
    bandeau.remove();
    try { sessionStorage.setItem('fs_bandeau_langue', '1'); } catch { /* rien */ }
  });
  // APRÈS le lien d'évitement (il restait le premier arrêt du clavier) ; sous
  // l'en-tête à l'écran (site.css), il ne recouvre plus le logo (revue de la fondation M-10).
  insererEnTete(bandeau);
}

// ── Bandeau de consentement (mêmes textes et mêmes clés que l'app) ───────────
// En TÊTE du <body>, juste après le lien d'évitement : en fin de page, ce
// dialogue n'était atteint qu'en dernier au clavier. Toujours en position
// fixe en bas à l'écran (site.css) : aucun décalage de mise en page.
chargerPixel(); // choix déjà « accepte » : le pixel revient ; sinon, rien
if (etatConsentement() === null) {
  const gabarit = d.createElement('div');
  gabarit.innerHTML = htmlBandeau(TEXTES_CONSENTEMENT[lang] || TEXTES_CONSENTEMENT[LANGUE_RACINE]);
  const bandeau = gabarit.firstElementChild;
  insererEnTete(bandeau);
  // Tant qu'il est affiché, le bas de la fenêtre lui appartient : la marge de
  // défilement (scroll-padding-bottom) en tient compte, et un élément atteint au
  // clavier SOUS le bandeau remonte au-dessus — Chrome ne fait pas défiler ce
  // qu'il croit déjà visible (revue technique C-4, WCAG 2.4.11).
  const racineDoc = d.documentElement;
  const hauteur = () => { racineDoc.style.scrollPaddingBottom = bandeau.isConnected ? `${bandeau.offsetHeight + 12}px` : ''; };
  hauteur();
  w.addEventListener('resize', hauteur);
  const devoiler = (e) => {
    const el = e.target;
    if (!bandeau.isConnected || !(el instanceof Element) || bandeau.contains(el)) return;
    const haut = bandeau.getBoundingClientRect().top;
    const r = el.getBoundingClientRect();
    if (r.bottom > haut - 4) w.scrollBy(0, r.bottom - haut + 16);
  };
  d.addEventListener('focusin', devoiler);
  bandeau.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('button[data-consentement]');
    if (!b) return;
    const valeur = poserConsentement(b.getAttribute('data-consentement'));
    bandeau.remove();
    hauteur();
    w.removeEventListener('resize', hauteur);
    d.removeEventListener('focusin', devoiler);
    if (valeur === ACCEPTE) chargerPixel();
  });
}

// ── Sous-menu « Plateformes » (<details>) : un seul ouvert, fermé au clic
// ailleurs et par Échap — il marche sans JS, ceci n'est que du confort.
const sousMenus = [...d.querySelectorAll('details.sous-menu')];
const bureau = w.matchMedia('(min-width: 1080px)');
d.addEventListener('click', (e) => {
  if (!bureau.matches) return; // panneau mobile : la liste reste dépliée
  for (const m of sousMenus) if (m.open && !m.contains(e.target)) m.open = false;
});
for (const m of sousMenus) {
  // Quitté au clavier, il restait déplié par-dessus la page (revue technique M-6).
  m.addEventListener('focusout', (e) => {
    if (bureau.matches && m.open && e.relatedTarget instanceof Element && !m.contains(e.relatedTarget)) m.open = false;
  });
}
d.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const m of sousMenus) {
    if (!m.open) continue;
    m.open = false;
    m.querySelector('summary').focus();
  }
});

// ── Vidéo : lecture AU CLIC (preload none, affiche). Le bouton n'existe qu'avec
// JS ; sans lui, les contrôles natifs suffisent.
d.querySelectorAll('[data-video]').forEach((b) => {
  const v = b.parentElement.querySelector('video');
  if (!v) return;
  b.hidden = false;
  v.removeAttribute('controls');
  b.addEventListener('click', () => {
    b.hidden = true;
    v.setAttribute('controls', '');
    // Le bouton disparaît : le focus passe à la vidéo (et à ses contrôles),
    // sinon il tombait sur <body> (revue technique C-2).
    v.focus();
    v.play().catch(() => { /* lecture refusée : les contrôles restent */ });
    pousser({ event: 'video_play', page });
  });
});

// ── Blocs qui DÉFILENT (tableaux, étapes en carrousel, <pre>, transcription) ──
// Le HTML les rend focalisables (tabindex="0" + data-defile) : sans JS, un bloc
// qui déborde reste atteignable au clavier. Ici, on ne garde l'arrêt que si le
// bloc défile VRAIMENT à cette largeur — sinon, un arrêt de Tab qui ne sert à
// rien (étapes sur ordinateur, comparaisons en cartes sur mobile : revue
// technique M-5). Revu au redimensionnement et à l'ouverture d'un <details>.
const defilants = [...d.querySelectorAll('[data-defile]')];
if (defilants.length) {
  const majDefile = () => {
    for (const el of defilants) {
      const ouvert = !el.closest('details:not([open])');
      if (ouvert && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) el.setAttribute('tabindex', '0');
      else if (ouvert) el.removeAttribute('tabindex');
    }
  };
  let prevu = 0;
  const plusTard = () => { if (!prevu) prevu = requestAnimationFrame(() => { prevu = 0; majDefile(); }); };
  if (d.readyState === 'complete') majDefile(); else w.addEventListener('load', majDefile);
  w.addEventListener('resize', plusTard);
  d.addEventListener('toggle', plusTard, true);
}
