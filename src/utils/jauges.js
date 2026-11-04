// ═══════════════════════════════════════════════════════════════════════════
// LES 3 JAUGES — LA RÈGLE D'AFFICHAGE UNIQUE (04/11/2026, décisions de Nico du 03/11)
// ═══════════════════════════════════════════════════════════════════════════
// Annonces (rédaction IA ou scan Lens) · Publications (une mise en ligne, 1 par plateforme) · Remontées (une
// republication, 1 par plateforme). Imports, synchros, retraits et tâches annulées ne comptent jamais.
// Maquettes validées par Nico : https://claude.ai/artifact/D3HQXTLv9N8AcygCtSTgjW
//
// LE SERVEUR DÉCIDE (migration 20261104000000_trois_jauges_interrupteur) : quotas_etat() rend `grille`,
// `publications`, `annonces_mode` et `lens` SEULEMENT quand coin_config.grille_trois_jauges = 1. Tant que
// l'interrupteur est à 0, grilleActive() est faux partout et chaque écran affiche ce qu'il affichait.
// ⛔ Aucun chiffre en dur à l'écran : les volumes se lisent dans coin_config (clés jauge_*, 0 = illimité) ou dans
//    quotas_etat. GRILLE_REPLI ne sert qu'en cas d'échec réseau, comme COIN_CONFIG_FALLBACK.
// ⛔ « illimité » se dit avec le mot, jamais avec un faux chiffre ; les garde-fous par jour ne s'affichent jamais.

export const JAUGES = Object.freeze(['annonces', 'publications', 'remontees']);
export const PALIERS_GRILLE = Object.freeze(['free', 'premium', 'pro', 'business']);

// REPLI réseau seulement (valeurs posées en base le 04/11). Infinity = illimité.
export const GRILLE_REPLI = Object.freeze({
  free:     Object.freeze({ annonces: 5,        publications: 50,       remontees: 30,       retouches: 0,  lens: null }),
  premium:  Object.freeze({ annonces: 40,       publications: 400,      remontees: 1500,     retouches: 5,  lens: null }),
  pro:      Object.freeze({ annonces: 120,      publications: 1200,     remontees: Infinity, retouches: 20, lens: null }),
  business: Object.freeze({ annonces: Infinity, publications: Infinity, remontees: Infinity, retouches: 50, lens: 600 }),
});

const palierGrille = (p) => (p === 'gratuit' || p == null ? 'free' : PALIERS_GRILLE.includes(p) ? p : 'free');

/** L'interrupteur, vu de quotas_etat (la réponse du serveur pour CE compte). */
export function grilleActive(quotas) {
  return Boolean(quotas && !quotas.error && quotas.grille === 'trois_jauges');
}

/** L'interrupteur, vu de coin_config (les écrans qui lisent la config : feuille des offres, onboarding). */
export function grilleActiveConfig(K) {
  return Number(K?.grille_trois_jauges) === 1;
}

/** La grille d'un palier, lue dans coin_config (clés jauge_<jauge>_<palier>, 0 = illimité), repli sinon. */
export function grilleDuPalier(K, palier) {
  const p = palierGrille(palier);
  const repli = GRILLE_REPLI[p];
  const lu = (j) => {
    const v = Number(K?.[`jauge_${j}_${p}`]);
    if (!Number.isFinite(v)) return repli[j];
    return v === 0 ? Infinity : v;
  };
  const ret = Number(K?.[`quota_retouche_${p}`]);
  const lens = p === 'business' ? Number(K?.jauge_lens_business) : NaN;
  return {
    annonces: lu('annonces'),
    publications: lu('publications'),
    remontees: lu('remontees'),
    retouches: Number.isFinite(ret) ? ret : repli.retouches,
    lens: p === 'business' ? (Number.isFinite(lens) && lens > 0 ? lens : repli.lens) : null,
  };
}

/** Un nombre de jauge : « 1 500 » ou « illimité » (jamais un faux chiffre). */
export function nombre(n, lang = 'fr') {
  if (n === Infinity || n == null) return lang === 'en' ? 'unlimited' : 'illimité';
  return Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR');
}

const MOTS = {
  fr: { annonces: ['annonce', 'annonces'], publications: ['publication', 'publications'], remontees: ['remontée', 'remontées'] },
  en: { annonces: ['listing', 'listings'], publications: ['publication', 'publications'], remontees: ['bump', 'bumps'] },
};
/** Le mot d'une jauge, accordé : « 1 annonce », « 0 annonce », « 3 publications ». */
export function motJauge(cle, n, lang = 'fr') {
  const m = (MOTS[lang === 'en' ? 'en' : 'fr'])[cle] ?? [cle, cle];
  if (lang === 'en') return Number(n) === 1 ? m[0] : m[1];
  return Number(n) > 1 ? m[1] : m[0];
}
const compte = (cle, n, lang) => `${nombre(n, lang)} ${motJauge(cle, n, lang)}`;

/**
 * Les 3 jauges d'un compte, depuis quotas_etat (grille active seulement ; sinon null).
 * Chaque entrée : { cle, plafond (Infinity = illimité), consommes, restantes (Infinity = illimité), illimite }.
 */
export function jaugesDuCompte(quotas) {
  if (!grilleActive(quotas)) return null;
  const a = quotas.annonces ?? {};
  const p = quotas.publications ?? {};
  const r = quotas.republication ?? {};
  const une = (cle, plafond, consommes, illimite) => ({
    cle,
    illimite,
    plafond: illimite ? Infinity : plafond,
    consommes: Number.isFinite(Number(consommes)) ? Number(consommes) : 0,
    restantes: illimite ? Infinity : Math.max(0, Number(plafond) - (Number(consommes) || 0)),
  });
  const aInf = quotas.annonces_mode === 'illimite' || a.plafond == null;
  const pInf = p.mode === 'illimite' || p.plafond == null;
  const rInf = r.mode === 'illimite' || r.plafond == null;
  return {
    annonces: une('annonces', a.plafond, a.consommes, aInf),
    publications: une('publications', p.plafond, p.consommes, pInf),
    remontees: une('remontees', r.plafond, r.faites ?? r.consommes, rInf),
    lens: quotas.lens && quotas.lens.plafond != null
      ? { plafond: Number(quotas.lens.plafond), consommes: Number(quotas.lens.consommes) || 0, restantes: Math.max(0, Number(quotas.lens.restantes) || 0) }
      : null,
  };
}

/**
 * LE COÛT AVANT PUBLICATION (maquettes 4.1 / 4.2) : « Cette publication utilisera 1 annonce et 3 publications. »
 * puis « Il te restera 4 annonces et 47 publications ce mois-ci. » (« illimité » pour l'illimité).
 *   besoin : { annonces: rédactions par l'IA à faire (0 si le texte est déjà rédigé), publications: plateformes }
 *   lot : true → « Ce lot utilisera… ».
 * Rend aussi `suffit` et `bloque` (la jauge qui manque), pour le bouton et le mur.
 */
export function coutPublication(besoin, jauges, { lang = 'fr', lot = false } = {}) {
  const en = lang === 'en';
  const nA = Math.max(0, Number(besoin?.annonces) || 0);
  const nP = Math.max(0, Number(besoin?.publications) || 0);
  const parts = [];
  if (nA > 0) parts.push(compte('annonces', nA, lang));
  if (nP > 0) parts.push(compte('publications', nP, lang));
  const sujet = lot ? (en ? 'This batch will use' : 'Ce lot utilisera') : (en ? 'This publication will use' : 'Cette publication utilisera');
  const utilise = parts.length ? `${sujet} ${parts.join(en ? ' and ' : ' et ')}.` : null;
  if (!jauges) return { utilise, reste: null, suffit: true, bloque: null };
  const resteA = jauges.annonces.illimite ? Infinity : Math.max(0, jauges.annonces.restantes - nA);
  const resteP = jauges.publications.illimite ? Infinity : Math.max(0, jauges.publications.restantes - nP);
  const bloque = (!jauges.annonces.illimite && nA > jauges.annonces.restantes) ? 'annonces'
    : (!jauges.publications.illimite && nP > jauges.publications.restantes) ? 'publications' : null;
  let reste;
  const touche = [nA > 0 ? ['annonces', resteA] : null, nP > 0 ? ['publications', resteP] : null].filter(Boolean);
  if (touche.length && touche.every(([, v]) => v === Infinity)) reste = en ? 'You will have left: unlimited.' : 'Il te restera : illimité.';
  else if (touche.length) {
    reste = `${en ? 'You will have' : 'Il te restera'} ${touche.map(([c, v]) => (v === Infinity ? `${en ? 'unlimited' : 'illimité'} ${en ? `${motJauge(c, 2, lang)}` : `en ${motJauge(c, 2, lang)}`}` : compte(c, v, lang))).join(en ? ' and ' : ' et ')} ${en ? 'left this month.' : 'ce mois-ci.'}`;
  } else reste = null;
  return { utilise, reste, suffit: bloque == null, bloque, resteA, resteP };
}

/**
 * Combien d'articles d'un lot passent avec ce qu'il reste (le mur du lot, maquette 4.3).
 *   articles : [{ redaction: bool, plateformes: n }] dans l'ordre du lot.
 * Rend { maintenant, plusTard, bloque } : `bloque` nomme la jauge qui coupe le lot.
 */
export function partageDuLot(articles, jauges) {
  const liste = Array.isArray(articles) ? articles : [];
  if (!jauges) return { maintenant: liste.length, plusTard: 0, bloque: null };
  let restA = jauges.annonces.illimite ? Infinity : jauges.annonces.restantes;
  let restP = jauges.publications.illimite ? Infinity : jauges.publications.restantes;
  let maintenant = 0;
  let bloque = null;
  for (const a of liste) {
    const nA = a?.redaction ? 1 : 0;
    const nP = Math.max(0, Number(a?.plateformes) || 0);
    if (nA > restA) { bloque = bloque ?? 'annonces'; break; }
    if (nP > restP) { bloque = bloque ?? 'publications'; break; }
    restA -= nA; restP -= nP; maintenant++;
  }
  return { maintenant, plusTard: liste.length - maintenant, bloque };
}

/** La pastille de l'en-tête (maquette 3.3) : la jauge la plus proche de la fin, en part restante ; rien si tout est illimité. */
export function jaugeLaPlusProche(jauges) {
  if (!jauges) return null;
  const finies = JAUGES.map((c) => jauges[c]).filter((j) => j && !j.illimite && j.plafond > 0);
  if (!finies.length) return null;
  const j = finies.reduce((m, x) => (x.restantes / x.plafond < m.restantes / m.plafond ? x : m));
  return { cle: j.cle, restantes: j.restantes, plafond: j.plafond, basse: j.restantes / j.plafond < 0.2 };
}

/** Le palier qui débloque une jauge pleine : le plus proche, pas le plus cher (maquettes 5.x). Lens du Business : rien. */
export function palierQuiDebloque(cle, palier, K = null) {
  const ordre = ['free', 'premium', 'pro', 'business'];
  const i = ordre.indexOf(palierGrille(palier));
  if (cle === 'lens') return null;
  for (const p of ordre.slice(i + 1)) {
    if (grilleDuPalier(K, p)[cle] > grilleDuPalier(K, ordre[i])[cle]) return p;
  }
  return null;
}

/** Un refus du serveur → la jauge pleine (pour ouvrir le bon mur), ou null. */
export function jaugeDuRefus(r) {
  const code = r?.reason ?? r?.error ?? null;
  if (r?.garde_fou === true || code === 'garde_fou_jour') return { cle: r?.jauge ?? null, gardeFou: true };
  if (code === 'quota_publications_atteint') return { cle: 'publications', gardeFou: false };
  if (code === 'plafond_republication_free' || code === 'plafond_republication_mensuel') return { cle: 'remontees', gardeFou: false };
  if (code === 'quota_annonces_atteint') return { cle: 'annonces', gardeFou: false };
  if (code === 'quota_scan_atteint') return { cle: r?.jauge === 'lens' ? 'lens' : 'annonces', gardeFou: false };
  return null;
}
