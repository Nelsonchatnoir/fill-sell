import { esc } from '../../scripts/site/lib/html.mjs';
import { jaugesDeCarte } from '../../scripts/site/lib/grille.mjs';
import { CLES_EXPLIQUEES, explicationJauge, libellesExplication } from '../../src/utils/jaugesExplications.js';
import { TEXTES } from './textes.mjs';
import { habillage, prix, listeLisible, picture, capture, etiquettes, verdict, boutonInscription, attrsAutreLangue } from './composants.mjs';

// BLOCS composés par les gabarits (09/10/2026, docs/seo/FORMAT-CONTENU.md § 3) :
// tirés des DONNÉES (site/donnees/*.yml, site/medias/video/video.json), jamais
// d'un texte recopié. Les données arrivent préparées par le générateur.

/** lang="…" quand un texte (fait concurrent) n'est pas dans la langue de la page. */
const langSi = (langueTexte, lang) => (langueTexte && langueTexte !== lang ? ` lang="${esc(langueTexte)}"` : '');

const dateCourte = (iso, lang, locale) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ── Héros de l'accueil : la scène ──────────────────────────────────────────
/**
 * Un téléphone (cadre CSS) avec la capture, et autour, trois fiches posées
 * comme des étiquettes : l'annonce rédigée, les plateformes qui passent « en
 * ligne » une à une (le SEUL mouvement de la page, coupé par
 * prefers-reduced-motion), la vente qui retire les copies.
 */
export function scene(site, page) {
  const t = TEXTES[page.lang];
  const s = t.scene;
  const noms = site.plateformes.ouvertes.map((p) => p.nom);
  const vendue = noms[0];
  const lignes = noms.map((n, i) => `<li class="l${i}"><span>${esc(n)}</span><b>${esc(s.enLigne)}</b></li>`).join('');
  return `<div class="scene">` +
    `${capture(page.hero, { url: site.url, alt: page.hero_alt, principale: true, sizes: '(min-width: 1000px) 298px, (min-width: 453px) 272px, calc(64vw - 18px)' })}` +
    habillage(`<div class="fiche fiche-annonce" aria-hidden="true"><p class="fiche-titre">${esc(s.annonce)}</p><p>${esc(s.annonceTexte)}</p></div>` +
    `<div class="fiche fiche-plateformes" aria-hidden="true"><p class="fiche-titre">${esc(s.publication)}</p><ul>${lignes}</ul></div>` +
    `<div class="fiche fiche-vente" aria-hidden="true"><p class="fiche-titre">${esc(s.vendu(vendue))}</p><p>${esc(s.retire)}</p></div>`) +
    `</div>`;
}

/** Bandeau des plateformes, en texte (étiquettes neutres, aucun logo). */
export function bandeauPlateformes(site, page) {
  const t = TEXTES[page.lang];
  return `<section class="bandeau-plateformes" aria-label="${esc(t.plateformesBandeau)}"><div class="cadre">` +
    `<p>${habillage(esc(t.plateformesBandeau))}</p>${etiquettes(site.plateformes.ouvertes.map((p) => p.nom), { classe: 'etiquettes-grandes' })}</div></section>`;
}

// ── Fonctions (cartes de l'accueil) ────────────────────────────────────────
export function fonctions(site, page) {
  if (!page.fonctions?.length) return '';
  const t = TEXTES[page.lang];
  const cartes = page.fonctions.map((f, i) => {
    const media = f.image ? `<div class="fonction-media">${picture(f.image, { url: site.url, alt: f.alt, sizes: '(min-width: 1000px) 260px, 60vw' })}</div>` : '';
    return `<li class="carte fonction${i === 0 ? ' fonction-une' : ''}${f.image ? ' avec-media' : ''}"><div class="fonction-texte"><h3><a href="${esc(f.chemin)}"${f.hreflang ? ` hreflang="${esc(f.hreflang)}"` : ''}>${esc(f.titre)}</a></h3><p>${esc(f.texte)}</p>${habillage(`<span class="fonction-lien" aria-hidden="true">${esc(t.voirPage)}</span>`)}</div>${media}</li>`;
  }).join('');
  return `<section class="bloc-fonctions" aria-labelledby="fonctions-titre"><div class="cadre"><h2 id="fonctions-titre">${esc(t.fonctionsTitre)}</h2><ul class="fonctions">${cartes}</ul></div></section>`;
}

// ── Comparaison (cellules) ─────────────────────────────────────────────────
/** Une cellule de comparaison : verdict + détail + source, ou étiquettes de plateformes. */
function cellule(c, lang, { court = false } = {}) {
  const t = TEXTES[lang];
  if (!c) return `<span class="verdict v-inconnu">—</span>`;
  if (c.plateformes) {
    return `<ul class="pf-liste">${c.plateformes.map((p) => `<li class="${p.oui ? 'pf-oui' : 'pf-non'}"><span class="sr">${esc(p.oui ? t.verdicts.oui : t.verdicts.non)} : </span>${esc(p.nom)}</li>`).join('')}</ul>`;
  }
  if (court) {
    // Version COURTE (accueil) : le verdict, ou la première proposition du
    // relevé quand il n'y en a pas (« manuelle et automatique »), ou le prix résumé.
    // « ; » avec ou sans espace avant : la valeur anglaise (`traductions`) n'en met pas ;
    // jamais de coupure dans une citation (« … » ou “ … ”), qui resterait ouverte.
    if (c.resume) return `<span class="bref">${esc(c.resume)}</span>`;
    if (c.verdict) return verdict(c.verdict, lang);
    const bref = String(c.valeur ?? '').split(/\s[—–]\s|\s?;\s|,(?![^(]*\))(?![^«]*»)(?![^“]*”)/)[0].trim();
    return `<span class="bref"${langSi(c.langue, lang)}>${esc(bref.length > 64 ? `${bref.slice(0, 62).trimEnd()}…` : bref)}</span>`;
  }
  const texte = c.verdict ? String(c.valeur ?? '').replace(/^(oui|non|partiel|yes|no|partial)\s*(—|–|-|,)\s*/i, '') : c.valeur;
  const detail = c.resume
    ? `<span class="detail">${esc(c.resume)}</span>`
    : (!texte ? '' : `<span class="detail"${langSi(c.langue, lang)}>${esc(texte.charAt(0).toUpperCase() + texte.slice(1))}</span>`);
  return `${c.resume || !c.verdict ? '' : verdict(c.verdict, lang)}${detail}`;
}

/** Sources et date d'une cellule (petites, cliquables). */
function sourcesDe(c, lang, locale, nous, court = false) {
  const t = TEXTES[lang];
  if (!c) return '';
  if (court) return nous || !c.sources?.length ? '' : ` <a class="src" href="${esc(c.sources[0])}" target="_blank" rel="noopener nofollow">${esc(t.source)}</a>`;
  if (nous) return '';
  const liens = (c.sources ?? []).slice(0, 2).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(t.source)}${c.sources.length > 1 ? ` ${i + 1}` : ''}</a>`).join(' ');
  return `<span class="src">${liens}${liens ? ' · ' : ''}${esc(t.releveLe)} ${esc(dateCourte(c.date, lang, locale))}</span>`;
}

/**
 * Tableau comparatif : UN seul balisage, cartes empilées sur téléphone
 * (chaque critère devient une carte, chaque cellule nomme son outil), vrai
 * tableau sur ordinateur, colonne FillSell mise en valeur.
 */
export function tableauComparaison({ outils, criteres, lang, locale, court = false, legende }) {
  const t = TEXTES[lang];
  const entete = `<thead><tr><th scope="col">${esc(t.critere)}</th>${outils.map((o) => `<th scope="col" class="${o.notre_produit ? 'col-nous' : ''}">${esc(o.nom)}${o.notre_produit ? `<small>${esc(t.notreProduit)}</small>` : ''}</th>`).join('')}</tr></thead>`;
  const corps = criteres.map((cr) => `<tr><th scope="row">${esc(t.criteres[cr.id] ?? cr.id)}</th>${outils.map((o, i) =>
    `<td data-outil="${esc(o.nom)}"${o.notre_produit ? ' class="col-nous"' : ' data-tiers'}>${cellule(cr.cellules[i], lang, { court })}${sourcesDe(cr.cellules[i], lang, locale, o.notre_produit, court)}</td>`).join('')}</tr>`).join('');
  return `<div class="comparaison${court ? ' comparaison-courte' : ''}" role="region" tabindex="0" data-defile aria-label="${esc(legende)}"><table><caption class="sr">${esc(legende)}</caption>${entete}<tbody>${corps}</tbody></table></div>`;
}

/** La comparaison COURTE de l'accueil (habillage : la page de référence est le comparatif). */
export function comparaisonAccueil(site, page) {
  if (!page.comparaison) return '';
  const t = TEXTES[page.lang];
  const lien = page.comparaison.lien ? `<p class="lien-suite"><a href="${esc(page.comparaison.lien.chemin)}">${esc(t.comparaisonLien)}</a></p>` : '';
  return `<section class="bloc-comparaison" aria-labelledby="comparaison-titre"><div class="cadre">` +
    `<h2 id="comparaison-titre">${esc(t.comparaisonTitre)}</h2>` +
    habillage(`<p class="chapo-section">${esc(t.comparaisonChapo)}</p>${tableauComparaison({ ...page.comparaison, lang: page.lang, locale: site.locale(page.lang), court: true, legende: t.comparaisonTitre })}` +
    `<p class="note-demo">${esc(t.releveLe.charAt(0).toUpperCase() + t.releveLe.slice(1))} ${esc(site.dateLisible(page.comparaison.date, page.lang))}.</p>${lien}`) +
    `</div></section>`;
}

// ── Vidéo ──────────────────────────────────────────────────────────────────
/**
 * Lecteur : affiche en image paresseuse (jamais l’attribut poster, chargé même
 * hors écran), lecture au clic, AV1 / VP9 / MP4, preload none, dans un cadre
 * de téléphone.
 *
 * Tout le bloc est de l'HABILLAGE (hors empreinte des dates) : la vidéo a sa
 * propre date (VideoObject.uploadDate), et sa transcription, sa légende et ses
 * dimensions viennent de site/medias/video/video.json, tenu à part. Avant, une
 * vidéo refaite (video.json changé) « périmait » / et /en et faisait échouer
 * TOUT build local, natif et OTA compris (revue technique C-6). Le lexique,
 * lui, relit toujours la transcription (il lit tout le <main>).
 */
export function video(site, page) {
  const v = page.video;
  if (!v) return '';
  const t = TEXTES[page.lang];
  const sources = v.sources.map((s) => `<source src="${esc(s.url)}" type="${esc(s.type)}">`).join('');
  const transcription = v.transcription.length
    ? `<details class="carte transcription"><summary>${esc(t.videoTranscription)}</summary><ol tabindex="0" data-defile aria-label="${esc(t.videoTranscription)}">${v.transcription.map((l) => `<li><span class="tc">${esc(l.temps)}</span> ${l.titre ? `<strong>${esc(l.titre)}.</strong> ` : ''}${esc(l.texte)}</li>`).join('')}</ol></details>`
    : '';
  return habillage(`<section class="bloc-video" aria-labelledby="video-titre"><div class="cadre video-grille">` +
    `<div class="video-texte"><h2 id="video-titre">${esc(t.videoTitre)}</h2><p class="chapo-section">${esc(v.description)}</p>${habillage(`<p class="note-demo">${esc(t.videoChapo)}</p>`)}${transcription}</div>` +
    `<figure class="media media-telephone media-video"><div class="telephone"><img class="video-affiche" src="${esc(v.affiche)}" alt="" width="${v.largeur}" height="${v.hauteur}" loading="lazy" decoding="async"><video controls playsinline muted preload="none" width="${v.largeur}" height="${v.hauteur}" aria-label="${esc(v.aria)}">${sources}</video>` +
    `<button type="button" class="video-lire" data-video hidden><span class="sr">${esc(t.videoLire)}</span></button></div><figcaption>${esc(v.titre)}</figcaption></figure>` +
    `</div></section>`);
}

// ── Logos devant les noms (09/11, maquette « Landing — section Cloud + tarifs à 3 jauges » validée par Nico) ──
// L'icône de la plateforme (site.logos, site/medias/plateformes/) se pose DEVANT son nom, jamais à sa place : alt
// vide, le nom reste du texte (site:verifier le relit). « iPhone » porte l'icône de l'App Store, comme la maquette.
// Seulement là où la maquette les montre : section FillSell Cloud, option Cloud et « dans tous les forfaits » des
// tarifs, exemples des carrés.
const iconeApple = (site, classe) => (site.iconeAppStore ? `<img class="${classe}" src="${esc(site.iconeAppStore)}" alt="" width="18" height="18" loading="lazy" decoding="async">` : '');
const logoPf = (site, nom, classe = 'logo-pf', taille = 20) => (site.logos?.[nom]
  ? `<img class="${classe}" src="${esc(site.logos[nom])}" alt="" width="${taille}" height="${taille}" loading="lazy" decoding="async">` : '');
/** Un texte dont chaque nom de plateforme (et « iPhone ») porte son icône devant lui. */
export function avecLogos(site, texte) {
  const noms = [...Object.keys(site.logos ?? {}), 'iPhone'];
  const motif = new RegExp(`\\b(${noms.join('|')})\\b`);
  return String(texte).split(motif).map((m, i) => {
    if (i % 2 === 0) return esc(m);
    return `<span class="avec-logo">${m === 'iPhone' ? iconeApple(site, 'logo-pf') : logoPf(site, m)}${esc(m)}</span>`;
  }).join('');
}

// ── FillSell Cloud (section de l'accueil, maquette validée par Nico le 08/11) ─
// Fond sarcelle profond, halos, une scène : l'ordinateur éteint → FillSell Cloud → les plateformes où le Cloud agit
// (celles de l'extension : site.cloud.plateformes), dont l'état défile (publiée, remontée, retirée). Le défilement est
// du DÉCOR (aria-hidden) ; « moins d'animations » : la scène s'arrête sur « publiée ». Faits : FORMAT-CONTENU § 0 —
// prix et essai lus dans l'app (src/utils/palier.js) ; ⛔ jamais Android à côté de FillSell Cloud (REGLE_CLOUD_ANDROID).
const SVG_ORDI = '<svg class="ordi" width="76" height="62" viewBox="0 0 76 62" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="12" y="6" width="52" height="36" rx="4"/><path d="M4 50h68l-6 6H10z" stroke-linejoin="round"/></svg>';
const SVG_NUAGE = '<svg class="nuage" width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false"><circle cx="40" cy="40" r="36" fill="#1B6E62" stroke="#4ECDC4" stroke-width="2"/><path d="M26 47h28a8 8 0 0 0 0-16 12 12 0 0 0-23-3 8 8 0 0 0-5 19z" stroke="#F6F5F1" stroke-width="2.2" stroke-linejoin="round"/></svg>';
export function blocCloud(site, page) {
  if (!site.cloud?.plateformes?.length) return '';
  const c = TEXTES[page.lang].cloud;
  const montant = prix(site.cloud.prix, page.lang);
  const jours = site.cloud.essaiJours;
  const etats = habillage(`<span class="etat" aria-hidden="true">${c.etats.map((e, i) => `<span class="e${i + 1}">${esc(e)}</span>`).join('')}</span>`);
  const puces = site.cloud.plateformes.map((nom) => `<li class="puce"><span class="puce-nom">${logoPf(site, nom, 'logo-puce', 24)}${esc(nom)}</span>${etats}</li>`).join('');
  return `<section class="bloc-cloud sombre" aria-labelledby="cloud-titre"><div class="cadre">` +
    `<div class="cloud-tete apparait"><p class="cloud-surtitre">${esc(c.surtitre)}</p><h2 id="cloud-titre">${esc(c.titre)}</h2><p class="chapo-section">${esc(c.chapo)}</p></div>` +
    `<div class="cloud-scene apparait">` +
    `<div class="noeud noeud-ordi">${SVG_ORDI}<span>${esc(c.ordi)}</span>${habillage('<span class="zz" aria-hidden="true">z z</span>')}</div>` +
    `<div class="noeud-centre"><div class="noeud">${habillage('<span class="anneau" aria-hidden="true"></span><span class="anneau b" aria-hidden="true"></span>')}${SVG_NUAGE}<span class="noeud-nom">FillSell Cloud</span></div>` +
    `<div class="flux" aria-hidden="true"><span class="point"></span></div></div>` +
    `<ul class="puces" aria-label="${esc(c.plateformes)}">${puces}</ul></div>` +
    `<ul class="cloud-faits">${c.faits.map((f) => `<li class="apparait"><h3>${esc(f.titre)}</h3><p>${esc(f.texte)}</p></li>`).join('')}</ul>` +
    `<div class="cloud-bas"><div class="cloud-prix">` +
    `<p class="cloud-montant"><span class="cloud-chiffre">${esc(montant)}</span> <span>${esc(c.parMois)}</span></p>` +
    `<p class="cloud-essai">${esc(c.essai(jours))}</p><p class="cloud-detail">${esc(c.essaiDetail(montant, jours))}</p>` +
    `<a class="bouton bouton-premier" href="/login?mode=signup" data-cta="signup_cloud">${esc(c.cta)}</a></div>` +
    `<div class="cloud-infos"><ul class="cloud-ou"><li>${iconeApple(site, 'logo-store')}${esc(c.ou[0])}</li><li>${esc(c.ou[1])}</li><li class="cloud-places">${esc(c.places)}</li></ul>` +
    `<p>${avecLogos(site, c.ebay)}</p><p>${esc(c.extension)}</p></div></div>` +
    `</div></section>`;
}

// ── Les carrés des formules et leur explication (maquette validée par Nico le 08/11) ──
// Trois carrés par carte (annonces · publications · remontées), chiffres LUS EN BASE au build (page.tarifs.grille,
// scripts/site/lib/grille.mjs). Chaque carré ouvre l'explication de sa jauge (src/utils/jaugesExplications.js, la
// source de l'app) : une <dialog> par jauge, ouverte en boîte de dialogue MODALE par site.js (focus entré et rendu,
// Échap, fond cliquable) ; sans JS, la même boîte s'ouvre en popover natif (popovertarget). Carrés et boîtes sont de
// l'HABILLAGE (hors empreinte des dates) : un quota changé en base ne périme aucune page.
const ICONE_FERMER = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 4l10 10M14 4L4 14" stroke-linecap="round"/></svg>';
const carresDe = (j, t) => habillage(`<div class="carres">${j.carres.map((x) => `<button type="button" class="carre${x.illimite ? ' carre-illimite' : x.valeur.length > 3 ? ' carre-long' : ''}" popovertarget="explication-${esc(x.cle)}" aria-haspopup="dialog" aria-label="${esc(x.aria)}">` +
  `<span class="carre-valeur">${esc(x.valeur)}</span><span class="carre-mot">${esc(x.mot)}</span></button>`).join('')}</div><p class="carres-periode">${esc(t.carresPeriode)}</p>`);
function explications(site, lang) {
  const L = libellesExplication(lang);
  return habillage(CLES_EXPLIQUEES.map((cle) => {
    const x = explicationJauge(cle, lang);
    const id = `explication-${cle}`;
    return `<dialog class="explication" id="${id}" role="dialog" popover aria-labelledby="${id}-titre"><div class="explication-corps">` +
      `<div class="explication-tete"><h3 id="${id}-titre">${esc(x.titre)}</h3><button type="button" class="explication-fermer" data-fermer popovertarget="${id}" popovertargetaction="hide" aria-label="${esc(L.fermer)}">${ICONE_FERMER}</button></div>` +
      `<p class="explication-def">${esc(x.definition)}</p>` +
      `<div class="explication-exemple"><p class="explication-titre">${esc(L.exemple)}</p><p>${avecLogos(site, x.exemple)}</p></div>` +
      `<p class="explication-regle"><strong>${esc(L.compte)}</strong> ${esc(x.compte)}</p>` +
      `<p class="explication-regle"><strong>${esc(L.pas)}</strong> ${esc(x.pas)}</p></div></dialog>`;
  }).join(''));
}

// ── Tarifs ─────────────────────────────────────────────────────────────────
/** Cartes des paliers (site/donnees/tarifs.yml) : nom, prix par mois, ce qui est inclus — jamais un chiffre de quota. */
// ── Badges des paliers (10/10, Nico) ───────────────────────────────────────
// Les cartes de prix ont le dessin des cartes de palier de l'app (feuille des
// offres, src/components/ConversionModal.jsx) et les MÊMES badges que
// src/components/PlanBadge.jsx, taille « sm » comme dans ces cartes : mêmes
// icônes (tracés copiés), mêmes dégradés, même reflet (CSS du module tarifs).
// Le nom du palier reste le TEXTE du <h3> (aucun mot changé) ; le Gratuit porte
// la pastille de la carte Free de l'app. Copie côté site : l'app n'importe rien d'ici.
const ICONES_PALIER = {
  premium: '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="fs-gold-premium" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FCEBAE"/><stop offset="1" stop-color="#E3AE43"/></linearGradient></defs><path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.9l6.6-.9z" fill="url(#fs-gold-premium)" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/></svg>',
  pro: '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="fs-gold-pro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE9A6"/><stop offset="0.5" stop-color="#E7B84C"/><stop offset="1" stop-color="#C79433"/></linearGradient></defs><path d="M3 8l4.5 3L12 4l4.5 7L21 8l-1.8 10.5H4.8L3 8z" fill="url(#fs-gold-pro)" stroke="rgba(255,255,255,0.35)" stroke-width="0.4" stroke-linejoin="round"/><circle cx="12" cy="4" r="1.1" fill="url(#fs-gold-pro)"/><circle cx="3" cy="8" r="1.1" fill="url(#fs-gold-pro)"/><circle cx="21" cy="8" r="1.1" fill="url(#fs-gold-pro)"/></svg>',
  business: '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="fs-plat-business" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4FFFD"/><stop offset="0.5" stop-color="#9BE8DC"/><stop offset="1" stop-color="#F2C98A"/></linearGradient></defs><path d="M7 3h10l4 6-9 12L3 9l4-6z" fill="url(#fs-plat-business)" stroke="rgba(255,255,255,0.5)" stroke-width="0.5" stroke-linejoin="round"/><path d="M3 9h18M7 3l5 6 5-6M8 9l4 12 4-12" fill="none" stroke="rgba(10,20,17,0.35)" stroke-width="0.7" stroke-linejoin="round"/></svg>',
};
// Pro et Business : cartes sombres dans l'app (fond, coches or).
const PALIERS_SOMBRES = new Set(['pro', 'business']);
const badgePalier = (id, nom) => (ICONES_PALIER[id]
  ? `<span class="badge-palier badge-${id}"><span class="badge-reflet" aria-hidden="true"></span>${ICONES_PALIER[id]}<span class="badge-texte">${nom}</span></span>`
  : `<span class="pastille-palier">${nom}</span>`);

export function cartesTarifs(site, page, { titre = true } = {}) {
  const d = page.tarifs;
  if (!d) return '';
  const t = TEXTES[page.lang];
  const l = page.lang;
  // (09/11) Carrés et lignes chiffrées lus en base ; base illisible → la carte part sans eux (jamais un chiffre recopié).
  const jauges = d.paliers.map((p) => jaugesDeCarte(d.grille, p.id, l));
  const cartes = d.paliers.map((p, i) => `<li class="palier palier-${esc(p.id)}${PALIERS_SOMBRES.has(p.id) ? ' palier-sombre' : ''}${p.mis_en_avant ? ' palier-avant' : ''}">` +
    `${p.mis_en_avant ? habillage(`<p class="palier-badge">${esc(t.misEnAvant)}</p>`) : ''}` +
    `<h3 class="palier-nom">${badgePalier(p.id, esc(p.nom[l]))}</h3><p class="palier-pour">${esc(p.pour[l])}</p>` +
    `<p class="palier-prix"><span class="montant">${esc(prix(p.prix, l, d.devise))}</span> <span class="periode">${esc(t.parMois)}</span></p>` +
    `${jauges[i] ? carresDe(jauges[i], t) : ''}` +
    `<ul>${jauges[i] ? habillage(jauges[i].lignes.map((x) => `<li>${esc(x)}</li>`).join('')) : ''}${p.inclus[l].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` +
    `<a class="palier-bouton" href="${esc(d.inscription)}" data-cta="signup_tarifs_${esc(p.id)}">${esc(p.cta[l])}</a></li>`).join('');
  // L'option FillSell Cloud (bandeau sombre de la maquette), entre les cartes et « dans tous les forfaits ».
  const o = t.optionCloud;
  const option = site.cloud ? `<div class="option-cloud"><div><p class="option-titre">${esc(o.titre(prix(site.cloud.prix, l), site.cloud.essaiJours))}</p>` +
    `<p class="option-texte">${avecLogos(site, o.texte)}</p></div><a class="option-lien" href="${esc(d.lienCloud)}">${esc(o.lien)}</a></div>` : '';
  const communs = `<div class="carte communs"><h3>${esc(t.communsTitre)}</h3><ul>${d.communs[l].map((x) => `<li>${avecLogos(site, x)}</li>`).join('')}</ul></div>`;
  return `<section class="bloc-tarifs" aria-labelledby="tarifs-titre"><div class="cadre">` +
    (titre ? `<h2 id="tarifs-titre">${esc(t.tarifsTitre)}</h2><p class="chapo-section">${esc(t.tarifsChapo)}</p>` : `<h2 id="tarifs-titre" class="sr">${esc(t.tarifsTitre)}</h2>`) +
    `<ul class="paliers">${cartes}</ul>${option}${communs}<p class="mentions">${esc(d.mentions[l])}</p>` +
    `${d.lien ? `<p class="lien-suite"><a href="${esc(d.lien.chemin)}">${esc(t.tarifsLien)}</a></p>` : ''}` +
    `${jauges.some(Boolean) ? explications(site, l) : ''}</div></section>`;
}

// ── Plateforme ─────────────────────────────────────────────────────────────
/** Grille des capacités de FillSell sur une plateforme (tirée de plateformes.yml). eBay : jamais de ligne « republication ». */
export function capacites(page, plateforme) {
  const t = TEXTES[page.lang];
  const c = t.capacites;
  const cles = ['publication', 'synchronisation', plateforme.vente_enregistree_seule ? 'venteSeule' : 'venteGeste', 'retrait'];
  if (plateforme.republication_auto) cles.push('republication', 'remonter');
  cles.push(plateforme.mode === 'api' ? 'modeApi' : 'modeExtension');
  if (plateforme.autorisation) cles.push('autorisation');
  if (plateforme.mode === 'extension') cles.push('ordinateur');
  const domaines = plateforme.pays.filter((x) => x.ouvert).map((x) => x.domaine.replace(/^www\./, ''));
  return `<section class="bloc-capacites" aria-labelledby="capacites-titre"><h2 id="capacites-titre">${esc(t.capacitesTitre(plateforme.nom))}</h2>` +
    `<ul class="capacites">${cles.map((k) => `<li class="carte"><h3>${esc(c[k][0])}</h3>${habillage(`<p>${esc(c[k][1])}</p>`)}</li>`).join('')}` +
    `<li class="carte capacite-pays"><h3>${esc(t.paysTitre)}</h3><p>${esc(t.paysOuverts(listeLisible(domaines, page.lang)))}</p></li></ul></section>`;
}

/** Liste des trajets d'une plateforme. */
export function trajetsDe(page, plateforme) {
  if (!page.trajets?.length) return '';
  const t = TEXTES[page.lang];
  return `<section class="bloc-trajets" aria-labelledby="trajets-titre"><h2 id="trajets-titre">${esc(t.trajetsTitre(plateforme.nom))}</h2><ul class="cartes-liees">${page.trajets.map((x) =>
    `<li><a class="carte" href="${esc(x.chemin)}"${attrsAutreLangue(x.hreflang)}><strong>${esc(x.titre)}</strong><span>${esc(x.texte)}</span></a></li>`).join('')}</ul></section>`;
}

// ── Trajet ─────────────────────────────────────────────────────────────────
export function blocTrajet(page) {
  const { de, vers, pages } = page.trajetDonnees;
  const t = TEXTES[page.lang];
  const c = t.capacites;
  const lignes = [
    [c.publication[0], listeLisible([de.nom, vers.nom], page.lang)],
    [c.synchronisation[0], c.synchronisation[1]],
    [c.retrait[0], t.trajetVente(de.nom, vers.nom)],
  ];
  for (const p of [de, vers]) lignes.push([`${p.nom} : ${(p.vente_enregistree_seule ? c.venteSeule : c.venteGeste)[0].toLowerCase()}`, (p.vente_enregistree_seule ? c.venteSeule : c.venteGeste)[1]]);
  const auto = [de, vers].filter((p) => p.republication_auto).map((p) => p.nom);
  if (auto.length) lignes.push([c.republication[0], t.trajetRepublication(listeLisible(auto, page.lang))]);
  const liens = pages.length ? `<p class="lien-suite">${esc(t.trajetPlateformes)} : ${pages.map((x) => `<a href="${esc(x.chemin)}"${attrsAutreLangue(x.hreflang)}>${esc(x.titre)}</a>`).join(', ')}</p>` : '';
  return `<section class="bloc-capacites" aria-labelledby="trajet-titre"><h2 id="trajet-titre">${esc(t.trajetTitre(de.nom, vers.nom))}</h2>` +
    `<ul class="capacites">${lignes.map(([a, b]) => `<li class="carte"><h3>${esc(a)}</h3><p>${esc(b)}</p></li>`).join('')}</ul>${liens}</section>`;
}

// ── Comparatif ─────────────────────────────────────────────────────────────
export function avertissementProduit(page) {
  return habillage(`<p class="avertissement">${esc(TEXTES[page.lang].avertissementProduit)}</p>`);
}

export function choisir(page) {
  const t = TEXTES[page.lang];
  const nom = page.comparatif.concurrent.nom;
  return `<section class="choisir" aria-label="${esc(t.choisirFillsell)}"><div class="carte choisir-nous"><h2>${esc(t.choisirFillsell)}</h2><ul>${page.choisir_fillsell.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` +
    `<div class="carte choisir-autre"><h2>${esc(t.choisirAutre(nom))}</h2><ul>${page.choisir_concurrent.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section>`;
}

export function methode(site, page, date) {
  const t = TEXTES[page.lang];
  return habillage(`<aside class="methode" aria-labelledby="methode-titre"><h2 id="methode-titre">${esc(t.methodeTitre)}</h2><p>${esc(t.methodeTexte(site.dateLisible(date, page.lang)))}</p>` +
    `<p>${esc(t.signaler)} <a href="mailto:support@fillsell.app">support@fillsell.app</a>.</p></aside>`);
}

// ── Alternative ────────────────────────────────────────────────────────────
export function cartesAlternatives(site, page) {
  const t = TEXTES[page.lang];
  const a = page.alternativeDonnees;
  const cartes = a.liste.map((o) => `<li class="carte alt${o.notre_produit ? ' alt-nous"' : '" data-tiers'}><h3>${esc(o.nom)}${o.notre_produit ? ` <small>${esc(t.notreProduit)}</small>` : ''}</h3>` +
    `<p${langSi(o.categorieLangue, page.lang)}>${esc(o.categorie ?? '')}</p>` +
    `<dl><dt>${esc(t.alternativePlateformes)}</dt><dd>${o.plateformes.length ? esc(o.plateformes.join(', ')) : '—'}</dd><dt>${esc(t.alternativeEntree)}</dt><dd>${esc(o.prixEntree ?? '—')}</dd></dl>` +
    `${o.notre_produit ? boutonInscription(t, 'alternative') : `<p class="src">${(o.sources ?? []).slice(0, 1).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(t.source)}</a> · `).join('')}${esc(t.releveLe)} ${esc(dateCourte(o.date, page.lang, site.locale(page.lang)))}</p>`}</li>`).join('');
  return `<section class="bloc-alternatives" aria-labelledby="alt-titre"><h2 id="alt-titre">${esc(t.alternativesTitre(a.concurrent.nom))}</h2><ul class="alternatives">${cartes}</ul></section>`;
}

// ── Classement ─────────────────────────────────────────────────────────────
// Chaque comparatif REPLIÉ, déplié au toucher (10/10, Nico) : le titre dans le
// <summary>, le tableau dans le HTML (référencement), comme le corps de la page
// (markdown.mjs, étape « 1 bis »).
const replie = (titre) => `<details class="repli"><summary>${titre}</summary><div class="repli-corps">`;
export function blocClassement(site, page) {
  const c = page.classementDonnees;
  const t = TEXTES[page.lang];
  const l = (langueTexte) => langSi(langueTexte, page.lang);
  const grille = `<section class="bloc-grille" data-tiers aria-labelledby="grille-titre">${replie(`<h2 id="grille-titre">${esc(t.classementGrille)}</h2>`)}` +
    `<div class="comparaison" role="region" tabindex="0" data-defile aria-label="${esc(t.classementGrille)}"><table><thead><tr><th scope="col">${esc(t.critere)}</th><th scope="col">${esc(t.classementPoids)}</th></tr></thead><tbody>` +
    c.criteres.filter((x) => x.poids > 0).map((x) => `<tr><th scope="row"${l(x.nomLangue)}>${esc(x.nom)}<small${x.grilleLangue !== x.nomLangue ? l(x.grilleLangue) || ` lang="${esc(page.lang)}"` : ''}>${esc(x.grille)}</small></th><td data-outil="${esc(t.classementPoids)}">${x.poids}</td></tr>`).join('') +
    `</tbody></table></div></div></details></section>`;
  const ids = c.criteres.filter((x) => x.poids > 0).map((x) => x.id);
  const notes = `<section class="bloc-notes" aria-labelledby="notes-titre">${replie(`<h2 id="notes-titre">${esc(t.classementNotes)}</h2>`)}` +
    `<ol class="podium">${c.notes.map((n, i) => `<li class="${n.slug === 'fillsell' ? 'podium-nous' : ''}"><span class="rang" aria-hidden="true">${i + 1}</span><span class="podium-nom">${esc(c.nom(n.slug))}</span><span class="podium-total">${n.total}<small>/100</small></span><meter min="0" max="100" value="${n.total}" aria-hidden="true">${n.total}</meter></li>`).join('')}</ol>` +
    `<div class="comparaison" role="region" tabindex="0" data-defile aria-label="${esc(t.classementNotes)}"><table><thead><tr><th scope="col">${esc(t.classementOutil)}</th>${ids.map((id) => `<th scope="col">${esc(id)}</th>`).join('')}<th scope="col">${esc(t.classementTotal)}</th></tr></thead><tbody>` +
    c.notes.map((n) => `<tr class="${n.slug === 'fillsell' ? 'ligne-nous' : ''}"><th scope="row">${esc(c.nom(n.slug))}</th>${ids.map((id) => `<td data-outil="${esc(id)}">${n[id]}</td>`).join('')}<td data-outil="${esc(t.classementTotal)}"><strong>${n.total}</strong></td></tr>`).join('') +
    `</tbody></table></div></div></details></section>`;
  const variantes = `<section class="bloc-variantes" data-tiers aria-labelledby="var-titre">${replie(`<h2 id="var-titre">${esc(t.classementVariantes)}</h2>`)}<ul class="variantes">${c.variantes.map((v) => `<li class="carte"><h3${l(v.nomLangue)}>${esc(v.nom)}</h3><p${l(v.ordreLangue)}>${esc(v.ordre)}</p></li>`).join('')}</ul></div></details></section>`;
  const hors = c.hors.length ? `<section class="bloc-hors" data-tiers aria-labelledby="hors-titre">${replie(`<h2 id="hors-titre">${esc(t.classementHors)}</h2>`)}<ul class="hors">${c.hors.map((h) => `<li><strong>${esc(c.nom(h.slug))}</strong> <span${l(h.raisonLangue)}>${esc(h.raison)}</span></li>`).join('')}</ul></div></details></section>` : '';
  return `${notes}${grille}${variantes}${hors}`;
}

// ── Glossaire ──────────────────────────────────────────────────────────────
export function indexGlossaire(page) {
  const termes = page.corps?.termes ?? [];
  if (termes.length < 4) return '';
  const t = TEXTES[page.lang];
  return habillage(`<nav class="index-termes" aria-label="${esc(t.glossaireIndex)}"><ul>${termes.map((x) => `<li><a href="#${esc(x.id)}">${esc(x.terme)}</a></li>`).join('')}</ul></nav>`);
}
