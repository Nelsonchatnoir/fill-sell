// ═══════════════════════════════════════════════════════════════════════════
// FILLSELL CLOUD — LE POOL D'ADRESSES IP FRANÇAISES — LES RÈGLES, PURES
// (conception du 04/10/2026 — RIEN N'EST BRANCHÉ, rien n'est acheté)
// ═══════════════════════════════════════════════════════════════════════════
// Le Cloud fait tourner notre extension dans un navigateur sur nos serveurs,
// sortie par une IP française dédiée (IPRoyal, « ISP / static residential »).
// Les IP viennent d'un POOL (décisions de Nico, 04/10) :
//   · essai non converti → l'IP retourne au pool, APRÈS quarantaine et purge
//     complète prouvée ; essai converti → l'IP reste au client ;
//   · toute IP signalée (blocage, captcha répété, compte restreint, liste
//     noire…) va au REBUT : jamais réattribuée, jamais renouvelée ;
//   · un seul essai par personne (compte, appareil, compte de plateforme).
//
// Conception : docs/cloud/pool-ip.md. Base : PROPOSITION non appliquée
// supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt.
// Aucun réseau ici : la future fonction du pool lit la base et IPRoyal, puis
// demande à ces règles quoi faire. Testé : scripts/cloud-pool-selftest.mjs
// (npm run selftest:cloud-pool).
//
// ⛔ Les valeurs qui existent AUSSI en SQL (défauts de cloud_param(...),
// durée d'essai, palier exigé, codes de preuve de purge) sont comparées au
// texte de la proposition par le selftest : on change les deux ensemble.

const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const r2 = (x) => Math.round(x * 100) / 100;
const borne01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));
const nonVide = (v) => typeof v === 'string' && v.trim() !== '';
// ceil sans le piège du flottant (5 × 21,4 = 107,00000000000001 → 108).
const plafond = (x) => Math.ceil(x - 1e-9);

// ── Le contrat avec l'app — MÊMES VALEURS que src/utils/palier.js ─────────
export const ESSAI_JOURS = 7;          // = CLOUD_ESSAI_JOURS
export const EXIGE_UN_PALIER = true;   // = CLOUD_EXIGE_UN_PALIER

// ── Les paramètres — chaque valeur est une PROPOSITION, nommée ────────────
// Les « mesures à remplir » (serveur, base) restent null : un coût partiel se
// signale (complet: false), il ne se devine jamais.
export const PARAMETRES = Object.freeze({
  // Cycle de l'IP (SQL : cloud_param(...) — mêmes défauts)
  graceJours: 2,               // fin d'essai → libération : le temps de payer sans tout reconnecter
  quarantaineJours: 14,        // 2 × la durée mesurée des jetons Vinted (7 j, 26/09)
  margeExpirationJours: 1,     // une IP attribuée couvre essai + grâce + 1 j
  renouvellementAvantJours: 3, // N : décision de renouvellement d'une IP EN SERVICE
  attributionsMax: 6,          // usure : au-delà, une IP libre n'est plus prolongée
  recyclerIpClient: false,     // l'IP d'un ancien client payant ne passe jamais à un autre compte
  // Achat (IPRoyal) — commande #83578416 du 26/09 : 1 IP France, 5,40 $ / 30 j
  periodeIpJours: 30,
  prixIpUsd30j: 5.40,          // MESURÉ (prix France, 1 IP) ; le « dès 2,70 $ » public n'est pas la France
  tauxUsdEur: 0.86,            // ⚠️ à relire le jour de l'achat
  delaiAchatJours: 1,          // L : NON VÉRIFIÉ chez IPRoyal (statut « in-progress » → « confirmed »)
  periodeDecisionJours: 1 / 24, // R : la fonction du pool passe toutes les heures
  z: 1.65,                     // marge de Poisson, ~95 %
  lambdaMin: 0.5,              // plancher du rythme d'essais mesuré (essais/jour)
  // Signalements (rebut)
  temoinsMin: 2,               // un blocage n'accuse l'IP que si ≥ 2 AUTRES IP passent la même plateforme (24 h)
  captchasMax: 3,              // 3 captchas sur la même plateforme en 24 h glissantes
  sortiesKoMax: 3,             // 3 contrôles de sortie ratés d'affilée
  controleFraicheurH: 24,      // un contrôle de sortie de quarantaine vaut 24 h
  // Alertes (même esprit que veille-cpu)
  rappelVideMin: 60,
  rappelPresqueVideMin: 360,
  // Coûts — À REMPLIR avec les mesures (null = inconnu, jamais 0)
  coutServeurEurJour: null,    // part du serveur navigateur (Hetzner) pour UN compte, par jour de navigateur actif
  coutBaseEurJour: null,       // part de la base / des fonctions pour UN compte Cloud, par jour
  // Revenus de l'option
  prixTtcEur: 20,
  tva: 0.20,                   // ⚠️ 0 si FillSell est en franchise de TVA (question à Nico)
  stripePct: 0.015,            // cartes standard de l'EEE (stripe.com/fr/pricing, 04/10/2026)
  stripeFixeEur: 0.25,
  stripeBillingPct: 0.007,     // Stripe Billing, paiement à l'usage (stripe.com/fr/billing/pricing)
  commissionApple: 0.15,       // Small Business Program (30 % hors programme, 1re année)
  commissionGoogle: 0.15,      // 10 % + 5 % de frais de facturation, abonnements, 1er M$
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE CYCLE DE VIE D'UNE IP
// ═══════════════════════════════════════════════════════════════════════════
//   achetee ──controle_ok──▶ disponible ──attribuer_essai──▶ attribuee_essai
//                               │  ▲                              │   │
//                 attribuer_client│  sortir (purge prouvée,       │   convertir
//                               ▼  │  quarantaine finie)          │   ▼
//                      attribuee_client ◀──────────────────── attribuee_client
//                               │ liberer          liberer │
//                               ▼                          ▼
//                          quarantaine ◀───────────────────┘
//   signaler (tout état vivant) ──▶ rebut ──expirer──▶ expiree
//   expirer (achetee, disponible, quarantaine) ──▶ expiree   (fin de période non renouvelée)
//   ⛔ une IP ATTRIBUÉE n'expire jamais sous son titulaire : transition interdite.
export const ETATS = Object.freeze(['achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'quarantaine', 'rebut', 'expiree']);
export const ETATS_ATTRIBUES = Object.freeze(['attribuee_essai', 'attribuee_client']);

const TRANSITIONS = Object.freeze({
  achetee:          { controle_ok: 'disponible', signaler: 'rebut', expirer: 'expiree', renouveler: 'achetee' },
  disponible:       { attribuer_essai: 'attribuee_essai', attribuer_client: 'attribuee_client', signaler: 'rebut', expirer: 'expiree', renouveler: 'disponible' },
  attribuee_essai:  { convertir: 'attribuee_client', liberer: 'quarantaine', signaler: 'rebut', renouveler: 'attribuee_essai' },
  attribuee_client: { liberer: 'quarantaine', signaler: 'rebut', renouveler: 'attribuee_client' },
  quarantaine:      { purge_prouvee: 'quarantaine', sortir: 'disponible', reprendre: 'attribuee_client', signaler: 'rebut', expirer: 'expiree', renouveler: 'quarantaine' },
  rebut:            { signaler: 'rebut', expirer: 'expiree' },
  expiree:          {},
});

/** L'état suivant d'une IP, ou null si la transition est interdite. */
export function prochainEtat(etat, evenement) {
  return TRANSITIONS[etat]?.[evenement] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. L'ATTRIBUTION — miroir de cloud_ip_attribuer (SQL, for update skip locked)
// ═══════════════════════════════════════════════════════════════════════════

/** Jusqu'où une IP doit rester payée pour être attribuée (ms epoch).
 *  essai  : maintenant + 7 j + grâce + marge (jamais une IP qui expire pendant l'essai) ;
 *  client : maintenant + N (le temps d'une décision de renouvellement) ;
 *  jusqua : remplacement en cours d'essai → fin d'essai + grâce, + marge. */
export function couvertureJusqua({ nature, maintenant = Date.now(), jusqua = null, p = PARAMETRES }) {
  const now = instant(maintenant);
  const marge = p.margeExpirationJours * JOUR_MS;
  if (jusqua != null) return instant(jusqua) + marge;
  if (nature === 'essai') return now + (ESSAI_JOURS + p.graceJours) * JOUR_MS + marge;
  return now + p.renouvellementAvantJours * JOUR_MS;
}

/** Cette IP peut-elle être donnée à ce compte, maintenant ? */
export function ipAttribuable(ip, { nature = 'essai', userId = null, maintenant = Date.now(), jusqua = null, p = PARAMETRES } = {}) {
  const exp = instant(ip?.expire_le);
  if (exp == null || exp < couvertureJusqua({ nature, maintenant, jusqua, p })) return false;
  // Le même compte reprend SA propre IP en quarantaine (aucun autre compte ne l'a vue).
  if (ip.etat === 'quarantaine') return userId != null && ip.dernier_user_id === userId;
  if (ip.etat !== 'disponible') return false;
  return (ip.attributions ?? 0) < p.attributionsMax;
}

/** L'IP que cloud_ip_attribuer prendrait — même ordre :
 *  0. le compte en tient déjà une → la même (idempotent) ;
 *  1. sa propre IP en quarantaine (la plus récemment libérée) ;
 *  2. sinon la disponible qui expire le plus tôt tout en couvrant (FEFO), la moins usée à égalité. */
export function choisirIp(ips, { nature = 'essai', userId = null, maintenant = Date.now(), jusqua = null, p = PARAMETRES } = {}) {
  const liste = Array.isArray(ips) ? ips : [];
  if (userId != null) {
    const deja = liste.find((ip) => ip.user_id === userId && ETATS_ATTRIBUES.includes(ip.etat));
    if (deja) return deja;
  }
  const ctx = { nature, userId, maintenant, jusqua, p };
  const siennes = liste.filter((ip) => ip.etat === 'quarantaine' && ipAttribuable(ip, ctx))
    .sort((a, b) => instant(b.liberee_le) - instant(a.liberee_le));
  if (siennes.length) return siennes[0];
  const dispo = liste.filter((ip) => ip.etat === 'disponible' && ipAttribuable(ip, ctx))
    .sort((a, b) => instant(a.expire_le) - instant(b.expire_le)
      || (a.attributions ?? 0) - (b.attributions ?? 0)
      || Number(a.id) - Number(b.id));
  return dispo[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA PURGE PROUVÉE ET LA SORTIE DE QUARANTAINE
// ═══════════════════════════════════════════════════════════════════════════
// La preuve est produite par l'orchestrateur des navigateurs APRÈS la
// libération ; la base la relit (cloud_purge_manques, même liste, même ordre).
// Forme (version 1) :
//   { version: 1, faite_le,
//     profil: { ancien, nouveau, ancien_detruit: true, nouveau_cree_le },
//     cookies_restants: 0, stockages_restants: 0, coffre_restants: 0,
//     session_fillsell_revoquee: true,
//     empreinte: { ancienne, nouvelle },
//     identifiants_proxy_renouveles: true }
export const CODES_PURGE = Object.freeze([
  'version', 'faite_apres_liberation', 'profil_recree', 'profil_ancien_detruit',
  'profil_neuf_apres_liberation', 'cookies_restants', 'stockages_restants',
  'coffre_restants', 'session_fillsell_revoquee', 'empreinte_nouvelle',
  'identifiants_proxy_renouveles',
]);

/** Ce qui manque à une preuve de purge ([] = complète). */
export function manquesPreuvePurge(preuve, libereeLe) {
  const m = [];
  const q = preuve && typeof preuve === 'object' ? preuve : {};
  const lib = instant(libereeLe);
  if (q.version !== 1) m.push('version');
  const faite = instant(q.faite_le);
  if (faite == null || lib == null || faite < lib) m.push('faite_apres_liberation');
  const pr = q.profil && typeof q.profil === 'object' ? q.profil : {};
  if (!(nonVide(pr.ancien) && nonVide(pr.nouveau) && pr.ancien !== pr.nouveau)) m.push('profil_recree');
  if (pr.ancien_detruit !== true) m.push('profil_ancien_detruit');
  const cree = instant(pr.nouveau_cree_le);
  if (cree == null || lib == null || cree < lib) m.push('profil_neuf_apres_liberation');
  if (q.cookies_restants !== 0) m.push('cookies_restants');
  if (q.stockages_restants !== 0) m.push('stockages_restants');
  if (q.coffre_restants !== 0) m.push('coffre_restants');
  if (q.session_fillsell_revoquee !== true) m.push('session_fillsell_revoquee');
  const e = q.empreinte && typeof q.empreinte === 'object' ? q.empreinte : {};
  if (!(nonVide(e.ancienne) && nonVide(e.nouvelle) && e.ancienne !== e.nouvelle)) m.push('empreinte_nouvelle');
  if (q.identifiants_proxy_renouveles !== true) m.push('identifiants_proxy_renouveles');
  return m;
}

// Le contrôle de sortie (et d'entrée) — fait depuis un profil NEUF, sans compte :
//   { fait_le, ip_sortie, pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok', leboncoin: 'ok', ebay: 'ok' } }
export const CODES_CONTROLE = Object.freeze(['controle_frais', 'ip_sortie', 'pays', 'listes_noires', 'plateformes']);

/** Ce qui manque à un contrôle de sortie ([] = bon). */
export function manquesControle(controle, ip, maintenant = Date.now(), p = PARAMETRES) {
  const m = [];
  const c = controle && typeof controle === 'object' ? controle : {};
  const now = instant(maintenant);
  const fait = instant(c.fait_le);
  if (fait == null || fait > now + 5 * 60_000 || now - fait > p.controleFraicheurH * HEURE_MS) m.push('controle_frais');
  if (String(c.ip_sortie ?? '') !== String(ip?.ip ?? '')) m.push('ip_sortie');
  if (c.pays !== 'FR') m.push('pays');
  if (!Array.isArray(c.listes_noires) || c.listes_noires.length > 0) m.push('listes_noires');
  const pl = c.plateformes;
  if (!pl || typeof pl !== 'object' || Array.isArray(pl) || !Object.keys(pl).length
      || Object.values(pl).some((v) => v === 'bloque')) m.push('plateformes');
  return m;
}

/** quarantaine → disponible ? Miroir de cloud_ip_remettre_en_pool. */
export function peutRemettreEnPool(ip, controle, maintenant = Date.now(), p = PARAMETRES) {
  const m = [];
  const now = instant(maintenant);
  if (ip?.etat !== 'quarantaine') m.push('pas_en_quarantaine');
  const fin = instant(ip?.quarantaine_fin);
  if (fin == null || now < fin) m.push('quarantaine_en_cours');
  const prouvee = instant(ip?.purge_prouvee_le);
  const lib = instant(ip?.liberee_le);
  if (prouvee == null || lib == null || prouvee < lib || manquesPreuvePurge(ip?.purge_preuve, ip?.liberee_le).length) m.push('purge_non_prouvee');
  if (ip?.derniere_origine === 'client' && !p.recyclerIpClient) m.push('ancien_client');
  const exp = instant(ip?.expire_le);
  if (exp == null || exp <= now) m.push('expiree');
  m.push(...manquesControle(controle, ip, maintenant, p));
  return { ok: m.length === 0, manques: m };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LE SIGNALEMENT — quand une observation envoie l'IP au rebut
// ═══════════════════════════════════════════════════════════════════════════
export const CRITERES_REBUT = Object.freeze([
  'blocage_anti_robot', 'captcha_repete', 'compte_restreint', 'liste_noire',
  'sortie_non_conforme', 'controle_entree', 'manuel',
]);

/**
 * observation : { nature: 'blocage'|'captcha'|'restriction'|'liste_noire'|'sortie_ko'|'controle_entree_ko', plateforme?, le }
 * historique  : observations précédentes de CETTE IP (on ne garde que 24 h ; 'sortie_ok' remet
 *               à zéro le compte des sorties ratées d'affilée)
 * temoins     : { [plateforme]: nombre d'AUTRES IP du pool qui ont passé cette plateforme dans les 24 h }
 * → { critere } (rebut) | { critere: null, environnement: true } (la plateforme ferme le Cloud
 *   entier — Beebs/DataDome au 26/09 — aucune IP jetée) | { critere: null }
 */
export function qualifierSignalement({ observation, historique = [], temoins = {}, maintenant = Date.now(), p = PARAMETRES }) {
  const o = observation ?? {};
  const now = instant(maintenant);
  const recents = (Array.isArray(historique) ? historique : [])
    .filter((h) => { const t = instant(h?.le); return t != null && now - t <= 24 * HEURE_MS && t <= now; });
  switch (o.nature) {
    case 'blocage':
      if ((temoins?.[o.plateforme] ?? 0) >= p.temoinsMin) return { critere: 'blocage_anti_robot' };
      return { critere: null, environnement: true };
    case 'captcha': {
      const n = 1 + recents.filter((h) => h.nature === 'captcha' && h.plateforme === o.plateforme).length;
      return { critere: n >= p.captchasMax ? 'captcha_repete' : null };
    }
    case 'restriction': return { critere: 'compte_restreint' };
    case 'liste_noire': return { critere: 'liste_noire' };
    case 'controle_entree_ko': return { critere: 'controle_entree' };
    case 'sortie_ko': {
      // « d'affilée » : les échecs depuis le dernier contrôle réussi
      const tries = [...recents].sort((a, b) => instant(b.le) - instant(a.le));
      let n = 1;
      for (const h of tries) { if (h.nature === 'sortie_ko') n++; else if (h.nature === 'sortie_ok') break; }
      return { critere: n >= p.sortiesKoMax ? 'sortie_non_conforme' : null };
    }
    default: return { critere: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA TAILLE DU POOL ET LES SEUILS — calculés, jamais en dur
// ═══════════════════════════════════════════════════════════════════════════
// λ = essais demandés par jour (mesuré sur 7 j), c = taux de conversion.
// Une IP d'essai NON converti est occupée T + G + Q jours (essai, grâce,
// quarantaine) ; convertie, elle quitte le pool après T jours (elle devient
// celle du client, payée par lui). Loi de Little :
//   en cycle   = λ · (T + (1 − c)(G + Q))
//   sécurité   = λ·H + z·√(λ·H),  H = L + R  (achat, période de décision)
//   cible      = ⌈en cycle⌉ + ⌈sécurité⌉

/** λ mesuré : demandes d'essai des 7 derniers jours / 7, avec un plancher. */
export function lambdaMesure(demandes7j, p = PARAMETRES) {
  return Math.max(p.lambdaMin, (Number(demandes7j) || 0) / 7);
}

/** Les seuils, depuis λ : commande (point de réapprovisionnement) et alerte « presque vide ». */
export function seuils({ lambda, p = PARAMETRES }) {
  const l = Math.max(p.lambdaMin, Number(lambda) || 0);
  const h = p.delaiAchatJours + p.periodeDecisionJours;
  const commande = plafond(l * h + p.z * Math.sqrt(l * h));
  const alerte = plafond(l * p.delaiAchatJours + p.z * Math.sqrt(l * p.delaiAchatJours));
  return { commande, alerte };
}

/** La taille cible du pool en régime établi (hors IP des clients payants) et son coût. */
export function taillePoolCible({ lambda, conversion, p = PARAMETRES }) {
  const l = Math.max(0, Number(lambda) || 0);
  const c = borne01(conversion);
  const joursParEssai = ESSAI_JOURS + (1 - c) * (p.graceJours + p.quarantaineJours);
  const enCycle = plafond(l * joursParEssai);
  const securite = seuils({ lambda: l, p }).commande;
  const total = enCycle + securite;
  const coutMensuelUsd = r2(total * p.prixIpUsd30j * (30 / p.periodeIpJours));
  return { joursParEssai: r2(joursParEssai), enCycle, securite, total, coutMensuelUsd, coutMensuelEur: r2(coutMensuelUsd * p.tauxUsdEur) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE PLAN DE L'HEURE — renouveler, laisser expirer, commander
// ═══════════════════════════════════════════════════════════════════════════
// Règles (Nico, 04/10 + proposition) :
//   · une IP de client payant est TOUJOURS renouvelée (décision à N jours) ;
//   · une IP en service d'essai n'expire jamais sous son titulaire (même règle) ;
//   · une IP au rebut, usée, ou d'ancien client n'est JAMAIS renouvelée ;
//   · une IP libre en SURPLUS n'est pas renouvelée. Pour elle, la décision
//     tombe dès qu'elle ne couvre plus un essai entier (échéance < T+G+marge) :
//     après, elle ne peut plus servir à un essai sans être prolongée (une
//     prolongation IPRoyal s'ajoute au temps restant, rien n'est perdu) ;
//   · une IP en quarantaine qui ne sera pas prête dans l'horizon H n'est pas
//     prolongée (payer sa quarantaine pour rien) : elle expire.

const PRETE = (ip, now, H) => ip.etat === 'achetee' || ip.etat === 'disponible'
  || (ip.etat === 'quarantaine' && instant(ip.quarantaine_fin) != null && instant(ip.quarantaine_fin) <= now + H);

/**
 * ips : lignes cloud_ips ; lambda : essais/jour ; enAttente : essais en file ;
 * commandesEnCours : IP commandées non livrées.
 * → { seuils, vise, projete, renouveler[], laisserExpirer[], attendre[], aCommander, attribuables, niveau }
 */
export function planDuJour({ ips, lambda, enAttente = 0, commandesEnCours = 0, maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const s = seuils({ lambda, p });
  const H = (p.delaiAchatJours + p.periodeDecisionJours) * JOUR_MS;
  const N = p.renouvellementAvantJours * JOUR_MS;
  const couvertureEssai = (ESSAI_JOURS + p.graceJours + p.margeExpirationJours) * JOUR_MS;
  const vise = s.commande + Math.max(0, Math.floor(Number(enAttente) || 0));
  let projete = Math.max(0, Math.floor(Number(commandesEnCours) || 0));
  const renouveler = [], laisserExpirer = [], attendre = [], candidats = [];
  for (const ip of Array.isArray(ips) ? ips : []) {
    const echeance = instant(ip.expire_le) - now;
    if (ip.etat === 'expiree') continue;
    if (ip.etat === 'rebut') { if (echeance <= N) laisserExpirer.push(ip.id); continue; }
    if (ETATS_ATTRIBUES.includes(ip.etat)) { (echeance <= N ? renouveler : attendre).push(ip.id); continue; }
    // achetee / disponible / quarantaine : le pool
    const usee = (ip.attributions ?? 0) >= p.attributionsMax;
    const exClient = ip.derniere_origine === 'client' && !p.recyclerIpClient;
    const prete = PRETE(ip, now, H);
    const couvre = echeance >= couvertureEssai;
    if (prete && couvre && !usee && !exClient) { projete++; attendre.push(ip.id); continue; }
    if (echeance <= N || (prete && !couvre)) {
      if (usee || exClient || !prete) laisserExpirer.push(ip.id); else candidats.push(ip);
      continue;
    }
    attendre.push(ip.id);
  }
  // Les plus propres d'abord (moins d'anciens titulaires), puis celles qui expirent le plus tôt.
  candidats.sort((a, b) => (a.attributions ?? 0) - (b.attributions ?? 0) || instant(a.expire_le) - instant(b.expire_le));
  for (const ip of candidats) {
    if (projete < vise) { renouveler.push(ip.id); projete++; } else laisserExpirer.push(ip.id);
  }
  const aCommander = Math.max(0, vise - projete);
  const attribuables = (Array.isArray(ips) ? ips : []).filter((ip) => ipAttribuable(ip, { nature: 'essai', maintenant: now, p })).length;
  const niveau = niveauPool({ attribuables, arrivantes: commandesEnCours, seuilAlerte: s.alerte });
  return { seuils: s, vise, projete, renouveler, laisserExpirer, attendre, aCommander, attribuables, niveau };
}

/** 'vide' (aucune IP attribuable à un essai) | 'presque_vide' | null. */
export function niveauPool({ attribuables, arrivantes = 0, seuilAlerte }) {
  const a = Math.max(0, Number(attribuables) || 0);
  if (a === 0) return 'vide';
  if (a + Math.max(0, Number(arrivantes) || 0) < seuilAlerte) return 'presque_vide';
  return null;
}

/**
 * Faut-il prévenir ? (modèle veille-cpu : une alerte, des rappels espacés, un « rétabli »)
 * derniereAlerte : { le, niveau } | null ; dernierRetabli : ISO | null.
 * « vide » rappelle toutes les heures, « presque vide » toutes les 6 h ; passer
 * de « presque vide » à « vide » prévient tout de suite.
 */
export function deciderAlerte({ niveau, derniereAlerte = null, dernierRetabli = null, attribuables = 0, seuilCommande, maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const aLe = instant(derniereAlerte?.le);
  const enAlerte = aLe != null && (dernierRetabli == null || instant(dernierRetabli) < aLe);
  if (niveau) {
    const rappel = (niveau === 'vide' ? p.rappelVideMin : p.rappelPresqueVideMin) * 60_000;
    const aggravation = niveau === 'vide' && enAlerte && derniereAlerte?.niveau !== 'vide';
    if (!enAlerte || aggravation || now - aLe >= rappel) return { action: 'alerte', niveau };
    return { action: null, niveau };
  }
  if (enAlerte && attribuables >= seuilCommande) return { action: 'retabli', niveau: null };
  return { action: null, niveau: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. UN SEUL ESSAI PAR PERSONNE — miroir de cloud_essai_ouvrir (même ordre)
// ═══════════════════════════════════════════════════════════════════════════
// Les empreintes sont des HMAC-SHA256 calculés EN BASE avec un sel du vault
// (cloud_hacher) ; ici `hacher` est fourni par l'appelant (test : identité).

const palierPaye = (pr) => pr?.is_business === true || pr?.is_pro === true || pr?.is_premium === true || pr?.is_comped === true;

/**
 * → { ok: true } (l'essai entre en file ; il démarre dès qu'une IP est prête)
 *   | { ok: false, raison: 'compte_inconnu'|'deja_client'|'essai_deja_pris'|'palier_requis'
 *                         |'appareil_inconnu'|'appareil_deja_vu'|'compte_plateforme_deja_vu', plateforme? }
 */
export function verdictOuvertureEssai({ profil, essaiExistant = false, appareil, comptes = [], empreintesVues = new Set(), hacher = (espace, v) => `${espace}:${String(v ?? '').trim().toLowerCase()}`, exigePalier = EXIGE_UN_PALIER }) {
  if (!profil) return { ok: false, raison: 'compte_inconnu' };
  if (profil.is_cloud === true) return { ok: false, raison: 'deja_client' };
  if (profil.cloud_essai_debut != null || essaiExistant) return { ok: false, raison: 'essai_deja_pris' };
  if (exigePalier && !palierPaye(profil)) return { ok: false, raison: 'palier_requis' };
  if (!nonVide(appareil)) return { ok: false, raison: 'appareil_inconnu' };
  if (empreintesVues.has(`appareil|${hacher('appareil', appareil)}`)) return { ok: false, raison: 'appareil_deja_vu' };
  for (const c of Array.isArray(comptes) ? comptes : []) {
    if (!nonVide(c?.plateforme) || !nonVide(c?.identifiant)) continue;
    if (empreintesVues.has(`compte_plateforme|${hacher(c.plateforme, c.identifiant)}`)) {
      return { ok: false, raison: 'compte_plateforme_deja_vu', plateforme: c.plateforme };
    }
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LES COÛTS — par essai, par client, marge sur 20 €/mois
// ═══════════════════════════════════════════════════════════════════════════
const ipEurJour = (p) => (p.prixIpUsd30j / p.periodeIpJours) * p.tauxUsdEur;

function poste(joursIp, joursNavigateur, p) {
  const ip = joursIp * ipEurJour(p);
  const srv = p.coutServeurEurJour == null ? null : joursNavigateur * p.coutServeurEurJour;
  const bse = p.coutBaseEurJour == null ? null : joursNavigateur * p.coutBaseEurJour;
  return {
    joursIp,
    ipEur: r2(ip),
    serveurEur: srv == null ? null : r2(srv),
    baseEur: bse == null ? null : r2(bse),
    totalEur: r2(ip + (srv ?? 0) + (bse ?? 0)),
    complet: srv != null && bse != null,
    _brut: ip + (srv ?? 0) + (bse ?? 0),
  };
}

/** Coût d'un essai : converti (l'IP part au client après T) ou non (T + G + Q jours d'IP).
 *  Le navigateur ne tourne que pendant l'essai (T jours) : ni pendant la grâce, ni en quarantaine. */
export function coutParEssai({ conversion, p = PARAMETRES }) {
  const c = borne01(conversion);
  const nonConverti = poste(ESSAI_JOURS + p.graceJours + p.quarantaineJours, ESSAI_JOURS, p);
  const converti = poste(ESSAI_JOURS, ESSAI_JOURS, p);
  const moyen = c * converti._brut + (1 - c) * nonConverti._brut;
  delete nonConverti._brut; delete converti._brut;
  return {
    nonConverti,
    converti,
    moyenEur: r2(moyen),
    // ce que coûtent les essais pour UN client gagné
    parClientAcquisEur: c > 0 ? r2(moyen / c) : null,
    // pour mémoire : une IP neuve achetée pour chaque essai puis abandonnée
    ipNeuveParEssaiEur: r2(p.periodeIpJours * ipEurJour(p)),
    complet: nonConverti.complet,
  };
}

/** Ce qui reste de 20 € TTC selon le canal. `memeFacture` : l'option est une ligne
 *  de l'abonnement du palier (Stripe) → pas de second 0,25 € fixe. */
function netBrut(canal, memeFacture, p) {
  const ttc = p.prixTtcEur;
  const ht = ttc / (1 + p.tva);
  let frais;
  if (canal === 'stripe') frais = ttc * (p.stripePct + p.stripeBillingPct) + (memeFacture ? 0 : p.stripeFixeEur);
  else if (canal === 'apple') frais = ht * p.commissionApple;      // commission sur le prix hors TVA
  else if (canal === 'google') frais = ht * p.commissionGoogle;
  else return null;
  return { ttc, ht, frais, net: ht - frais };
}

export function fraisPaiement({ canal, memeFacture = false, p = PARAMETRES }) {
  const b = netBrut(canal, memeFacture, p);
  if (!b) return null;
  return { canal, ttcEur: b.ttc, htEur: r2(b.ht), fraisEur: r2(b.frais), netEur: r2(b.net) };
}

/** Marge mensuelle d'un client Cloud payant (avant amortissement des essais). */
export function margeParClient({ canal, memeFacture = false, p = PARAMETRES }) {
  const b = netBrut(canal, memeFacture, p);
  if (!b) return null;
  const f = fraisPaiement({ canal, memeFacture, p });
  const ip = 30 * ipEurJour(p);
  const srv = p.coutServeurEurJour == null ? null : 30 * p.coutServeurEurJour;
  const bse = p.coutBaseEurJour == null ? null : 30 * p.coutBaseEurJour;
  const marge = b.net - ip - (srv ?? 0) - (bse ?? 0);
  return {
    canal, netEur: f.netEur, fraisEur: f.fraisEur,
    ipEur: r2(ip), serveurEur: srv == null ? null : r2(srv), baseEur: bse == null ? null : r2(bse),
    margeEur: r2(marge), complet: srv != null && bse != null,
  };
}
