// ═══════════════════════════════════════════════════════════════════════════
// FILLSELL CLOUD — LE POOL D'ADRESSES IP FRANÇAISES — LES RÈGLES, PURES
// (conception du 04/10/2026 — RIEN N'EST BRANCHÉ, rien n'est acheté)
// ═══════════════════════════════════════════════════════════════════════════
// Le Cloud fait tourner notre extension dans un navigateur sur nos serveurs,
// sortie par une IP française (IPRoyal, « ISP / static residential »).
// Décisions FINALES de Nico (04/10 soir) :
//   · PHASE 1 = ROTATION (`mode` rotation) : pas d'IP dédiée. Chaque IP sert
//     un petit groupe FIXE de comptes, À TOUR DE RÔLE, jamais deux en même
//     temps (bail, contrainte d'exclusion en base) ; un compte garde son IP
//     « maison » ; chaque compte actif a une session au moins toutes les
//     T_max minutes, et tout de suite s'il a un retrait en attente ou une
//     vente constatée ailleurs ; un bail n'est jamais coupé au milieu d'un job.
//     → section 9.
//   · PHASE 2 = IP DÉDIÉE (`mode` dediee) : la conception des sections 1 à 8
//     (pool, quarantaine, purge prouvée de l'IP, renouvellement), gardée.
//   · toute IP signalée (blocage, captcha répété, compte restreint, liste
//     noire…) va au REBUT : jamais réattribuée, jamais renouvelée ;
//   · un seul essai par personne : compte, appareil, compte de plateforme ET
//     carte (empreinte hachée, carte obligatoire pour l'essai).
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
export const EXIGE_UN_PALIER = false;  // = CLOUD_EXIGE_UN_PALIER (04/10 soir : l'option se prend seule sur Free)
export const PRIX_AFFICHE = '20 €';    // = CLOUD_PRIX_AFFICHE

// ── Les paramètres — chaque valeur est une PROPOSITION, nommée ────────────
// Les « mesures à remplir » (serveur, base) restent null : un coût partiel se
// signale (complet: false), il ne se devine jamais.
export const PARAMETRES = Object.freeze({
  // Phase (SQL : cloud_param('mode', 1) — 1 = rotation, 2 = dediee)
  mode: 'rotation',
  // ── ROTATION (phase 1) — SQL : cloud_param(...), mêmes défauts ──
  poolTaille: 5,               // IP en rotation (réglable) : 5 × 4 = 20 comptes à T_max 30 min
  tMaxMin: 30,                 // un compte actif n'attend jamais plus de 30 min sans session
  sessionMinMin: 5,            // une session utile dure au moins 5 min (démarrage ~1 min, 2 passages)
  battementMin: 1,             // l'IP reste muette 1 min entre deux comptes
  margePrioritairePct: 20,     // part de T_max gardée pour les sessions prioritaires et les prolongations
  groupeMax: 4,                // au plus 4 comptes par IP (un foyer, pas une ferme)
  comptesDistinctsMax: 8,      // usure : une IP a servi au plus 8 comptes différents
  prolongationPasMin: 5,       // un bail se prolonge par pas de 5 min…
  prolongationMaxMin: 30,      // …30 min au plus au-delà de sa fin prévue
  finDouceAvantMin: 2,         // plus aucun job pris 2 min avant la fin prévue
  pollMin: 2,                  // l'extension passe toutes les 2 min (prototype du 26/09)
  sessionConnexionMin: 15,     // 1re session d'un compte : le temps de se connecter aux plateformes
  sessionMaxMin: 60,           // garde-fou de la base : aucun bail demandé au-delà de 60 min
  essaisSimultanesMax: 0,      // plafond d'essais en cours (0 = aucun ; la taille du pool fait déjà la file)
  empreintesConservationMois: 12, // RGPD : empreintes gardées 12 mois après la fin de l'essai
  prioriteAttenteMaxMin: 10,   // une priorité qui attend plus → alerte
  reservePct: 10,              // IP de réserve (rebut, panne) en plus du besoin
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
  // Mesures et estimations du 04/10 soir (rotation : par NAVIGATEUR ALLUMÉ = par IP occupée)
  serveurEurMois: 15.99,       // ESTIMÉ : Hetzner CX43 HT (prix officiel depuis le 15/06/2026, non revérifié ici)
  navigateursParServeurMin: 15, // ESTIMÉ : 15 à 25 navigateurs par CX43 (non mesuré)
  navigateursParServeurMax: 25,
  baseCpuPctParPosteMin: 0.10, // MESURÉ (04/10 soir) : 0,1 à 0,25 % CPU d'une instance Small par poste allumé
  baseCpuPctParPosteMax: 0.25,
  baseInstanceUsdMois: 15,     // Supabase Small ≈ 15 $/mois (docs Supabase « compute-and-disk », 04/10)
  traficMoParMinActif: 2.0,    // MESURÉ (26/09, 13 sessions Steel) : 195 Mo pour 97 min
  traficMoParMinRepos: 0.4,    // MESURÉ : 0,3 à 0,5 Mo/min presque au repos
  traficPlafondGoMois: 100,    // IPRoyal : 100 Go par proxy et par 30 j (usage raisonnable)
  carteEurParEssai: 0,         // SetupIntent Stripe : aucun débit, donc aucune commission (Radar des SetupIntents coupé par défaut)
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
//   ROTATION (phase 1) : disponible ──mettre_en_rotation──▶ rotation (un groupe
//   de comptes, à tour de rôle) ; rotation ──signaler──▶ rebut ; une IP en
//   rotation qui a encore des membres n'expire jamais (renouvelée comme celle
//   d'un client) ; vide et en surplus, elle peut expirer.
export const ETATS = Object.freeze(['achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'quarantaine', 'rotation', 'rebut', 'expiree']);
export const ETATS_ATTRIBUES = Object.freeze(['attribuee_essai', 'attribuee_client']);

const TRANSITIONS = Object.freeze({
  achetee:          { controle_ok: 'disponible', signaler: 'rebut', expirer: 'expiree', renouveler: 'achetee' },
  disponible:       { attribuer_essai: 'attribuee_essai', attribuer_client: 'attribuee_client', mettre_en_rotation: 'rotation', signaler: 'rebut', expirer: 'expiree', renouveler: 'disponible' },
  rotation:         { signaler: 'rebut', expirer: 'expiree', renouveler: 'rotation' },
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
 * → { ok: true } (l'essai entre en file ; il démarre dès qu'une place est prête)
 *   | { ok: false, raison: 'compte_inconnu'|'deja_client'|'essai_deja_pris'|'palier_requis'
 *                         |'appareil_inconnu'|'appareil_deja_vu'|'carte_absente'|'carte_deja_vue'
 *                         |'compte_plateforme_deja_vu', plateforme? }
 * L'appareil est vérifié une première fois AVANT la carte (cloud_essai_preparer_moi :
 * personne ne saisit sa carte pour rien), puis tout est revérifié à l'ouverture
 * (cloud_essai_ouvrir, appelée par le flux de paiement avec l'empreinte de carte).
 */
export function verdictOuvertureEssai({ profil, essaiExistant = false, appareil, carte, comptes = [], empreintesVues = new Set(), hacher = (espace, v) => `${espace}:${String(v ?? '').trim().toLowerCase()}`, exigePalier = EXIGE_UN_PALIER }) {
  if (!profil) return { ok: false, raison: 'compte_inconnu' };
  if (profil.is_cloud === true) return { ok: false, raison: 'deja_client' };
  if (profil.cloud_essai_debut != null || essaiExistant) return { ok: false, raison: 'essai_deja_pris' };
  if (exigePalier && !palierPaye(profil)) return { ok: false, raison: 'palier_requis' };
  if (!nonVide(appareil)) return { ok: false, raison: 'appareil_inconnu' };
  if (empreintesVues.has(`appareil|${hacher('appareil', appareil)}`)) return { ok: false, raison: 'appareil_deja_vu' };
  if (!nonVide(carte)) return { ok: false, raison: 'carte_absente' };
  if (empreintesVues.has(`carte|${hacher('carte', carte)}`)) return { ok: false, raison: 'carte_deja_vue' };
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

// ═══════════════════════════════════════════════════════════════════════════
// 9. PHASE 1 — LA ROTATION (décisions de Nico, 04/10 soir)
// ═══════════════════════════════════════════════════════════════════════════
// LA RÈGLE, EN CINQ LIGNES
//   1. Une IP ne sert qu'UN compte à la fois : un BAIL (ip, compte, début, fin)
//      et deux contraintes d'exclusion en base (par IP, par compte).
//   2. Chaque IP a un petit groupe FIXE de comptes (sa « maison ») qu'elle sert
//      à tour de rôle ; un compte garde son IP d'une session à l'autre.
//   3. Chaque compte actif a une session au moins toutes les T_max minutes,
//      et TOUT DE SUITE (priorité) s'il a un retrait en attente, une
//      republication dont l'annonce est déjà retirée, ou une vente constatée ailleurs.
//   4. Un bail n'est jamais coupé au milieu d'un job : il se prolonge (borné),
//      et ne se termine qu'une fois sa réservation de job libérée ou finie.
//   5. Pool trop petit pour tenir T_max : alerte, et les nouveaux essais
//      attendent en file — jamais un trou silencieux.
// Mêmes calculs, en entiers, que cloud_groupe_effectif() / cloud_duree_session() (SQL).

/** La phase en vigueur : 'rotation' (1) ou 'dediee' (2) — SQL : cloud_mode(). */
export function modeCloud(valeur) {
  return Number(valeur) === 2 || valeur === 'dediee' ? 'dediee' : 'rotation';
}

/** Comptes par IP tenables à T_max : (g − 1)(session + battement) ≤ (1 − marge) T_max, au plus groupeMax. */
export function groupeEffectif(p = PARAMETRES) {
  const libre = Math.floor(((100 - p.margePrioritairePct) * p.tMaxMin) / (100 * (p.sessionMinMin + p.battementMin)));
  return Math.max(1, Math.min(p.groupeMax, 1 + libre));
}

/** Durée d'une session de tour (min) pour un groupe de g comptes ; null pour g = 1 (IP pour lui seul). */
export function dureeSession(g, p = PARAMETRES) {
  if (!(g > 1)) return null;
  return Math.floor(((100 - p.margePrioritairePct) * p.tMaxMin) / (100 * (g - 1))) - p.battementMin;
}

/**
 * Taille du pool en rotation pour N comptes actifs (essais en cours + payants).
 * IP = ⌈N / g⌉ + réserve (10 %, au moins 1). La taille plafonne aussi la charge
 * de la base : au plus UN poste allumé par IP à un instant donné.
 */
export function tailleRotation({ comptes, p = PARAMETRES }) {
  const g = groupeEffectif(p);
  const n = Math.max(0, Math.floor(Number(comptes) || 0));
  const ips = Math.ceil(n / g);
  const reserve = n > 0 ? Math.max(1, Math.ceil((ips * p.reservePct) / 100)) : 0;
  const total = ips + reserve;
  const coutIpUsdMois = r2(total * p.prixIpUsd30j * (30 / p.periodeIpJours));
  return {
    g, sessionMin: dureeSession(g, p), ips, reserve, total,
    postesSimultanesMax: total,
    cpuBasePct: [r2(total * p.baseCpuPctParPosteMin), r2(total * p.baseCpuPctParPosteMax)],
    serveurs: total ? [Math.ceil(total / p.navigateursParServeurMax), Math.ceil(total / p.navigateursParServeurMin)] : [0, 0],
    coutIpUsdMois, coutIpEurMois: r2(coutIpUsdMois * p.tauxUsdEur),
  };
}

/** Trafic d'une IP (Go décimaux / 30 j) selon sa part d'activité et son taux d'occupation. */
export function traficIpGoMois({ partActif = 1, occupation = 1, p = PARAMETRES }) {
  const a = borne01(partActif);
  const moMin = a * p.traficMoParMinActif + (1 - a) * p.traficMoParMinRepos;
  return r2((30 * 24 * 60 * borne01(occupation) * moMin) / 1000);
}

/**
 * Où un compte entre en rotation — miroir de cloud_rotation_rejoindre :
 *   0. déjà membre → la sienne ;
 *   1. son ancienne maison si elle a encore de la place ;
 *   2. l'IP en rotation la MOINS remplie (place, usure, échéance ≥ N j), la plus longue échéance à égalité ;
 *   3. sinon une IP disponible mise en rotation, tant que le pool n'a pas atteint poolTaille ;
 *   4. sinon null → l'essai attend en file (et l'alerte part).
 * membres : { [ip_id]: nombre de membres } ; maisons : [{ user_id, ip_id }] ; ancienne : ip_id | null.
 */
export function choisirIpRotation(ips, { userId, membres = {}, maisons = [], ancienne = null, maintenant = Date.now(), p = PARAMETRES } = {}) {
  const liste = Array.isArray(ips) ? ips : [];
  const deja = maisons.find((m) => m.user_id === userId);
  if (deja) return { ip: liste.find((i) => i.id === deja.ip_id) ?? null, promouvoir: false };
  const now = instant(maintenant);
  const g = groupeEffectif(p);
  const couvre = (ip) => instant(ip.expire_le) >= now + p.renouvellementAvantJours * JOUR_MS;
  const aDeLaPlace = (ip) => ip.etat === 'rotation' && couvre(ip) && (membres[ip.id] ?? 0) < g;
  if (ancienne != null) {
    // l'ancienne maison l'a déjà compté : pas d'usure de plus
    const a = liste.find((i) => i.id === ancienne);
    if (a && aDeLaPlace(a)) return { ip: a, promouvoir: false };
  }
  const enRotation = liste.filter((ip) => aDeLaPlace(ip) && (ip.attributions ?? 0) < p.comptesDistinctsMax)
    .sort((a, b) => (membres[a.id] ?? 0) - (membres[b.id] ?? 0)
      || instant(b.expire_le) - instant(a.expire_le) || Number(a.id) - Number(b.id));
  if (enRotation.length) return { ip: enRotation[0], promouvoir: false };
  const nbRotation = liste.filter((i) => i.etat === 'rotation').length;
  if (nbRotation >= p.poolTaille) return null;
  const dispo = liste.filter((i) => i.etat === 'disponible' && couvre(i) && (i.attributions ?? 0) < p.comptesDistinctsMax)
    .sort((a, b) => instant(b.expire_le) - instant(a.expire_le) || Number(a.id) - Number(b.id));
  return dispo.length ? { ip: dispo[0], promouvoir: true } : null;
}

/** Places libres dans la rotation (alerte, file d'attente). */
export function placesRotation({ ips, membres = {}, p = PARAMETRES }) {
  const g = groupeEffectif(p);
  const liste = Array.isArray(ips) ? ips : [];
  let places = 0;
  for (const ip of liste) {
    if (ip.etat !== 'rotation' || (ip.attributions ?? 0) >= p.comptesDistinctsMax) continue;
    places += Math.max(0, g - (membres[ip.id] ?? 0));
  }
  const promouvables = Math.min(
    Math.max(0, p.poolTaille - liste.filter((i) => i.etat === 'rotation').length),
    liste.filter((i) => i.etat === 'disponible').length,
  );
  return places + promouvables * g;
}

/**
 * Ce qui empêche un bail de finir — miroir de cloud_bail_bloquants (SQL) :
 *   'job_en_cours'         — une réservation COMMENCÉE de ce poste (jobs_reservations_extension.commence) ;
 *   'job_distribue'        — une réservation distribuée, pas commencée, non expirée, alors que la fin
 *                            douce a moins d'un passage (2 min) : l'extension peut encore la commencer ;
 *   'republication_en_vol' — une republication de ce compte à l'étape captured / deleted, tant que la
 *                            prolongation n'a pas atteint son plafond.
 */
export function bloquantsBail({ bail, reservations = [], republications = [], maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const b = bail ?? {};
  const memePoste = (r) => r.user_id === b.user_id && (b.poste == null || r.poste === b.poste);
  const out = [];
  if (reservations.some((r) => memePoste(r) && r.commence === true)) out.push('job_en_cours');
  const douce = instant(b.fin_douce_le);
  if (reservations.some((r) => memePoste(r) && r.commence !== true && instant(r.expire_le) > now)
      && (douce == null || douce > now - p.pollMin * 60_000)) out.push('job_distribue');
  if (republications.some((j) => j.user_id === b.user_id && ['pending', 'processing'].includes(j.status)
      && ['captured', 'deleted'].includes(j.republish_step)) && (b.prolonge_min ?? 0) < p.prolongationMaxMin) {
    out.push('republication_en_vol');
  }
  return out;
}

const MOTIFS_PRIORITE = Object.freeze({ retrait: 'priorite_retrait', vente: 'priorite_vente', republication: 'priorite_republication' });

/**
 * L'ordonnanceur (orchestrateur, chaque minute) : que faire MAINTENANT ?
 * ips     : [{ id, etat, libre_le }]   (libre_le = fin du battement du dernier bail)
 * membres : [{ user_id, ip_id, actif, rejoint_le, derniere_fin, priorite: null | { motif, le } }]
 * baux    : baux ACTIFS [{ id, ip_id, user_id, motif, fin_prevue, fin_douce_le, prolonge_min, bloquants: [] }]
 * → { finDouce: [bail], terminer: [bail], prolonger: [bail], ouvrir: [{ user_id, ip_id, motif, dureeMin }], alertes: [] }
 * La base garde le dernier mot : un bail qui chevaucherait est refusé (exclusion), un bail
 * bloqué n'est pas terminé (cloud_bail_terminer relit les bloquants).
 */
export function planifierRotation({ ips = [], membres = [], baux = [], maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const g = groupeEffectif(p);
  const s = dureeSession(g, p) ?? 60;
  const finDouce = [], terminer = [], prolonger = [], ouvrir = [], alertes = [];
  const parIp = new Map();
  for (const m of membres) { if (!parIp.has(m.ip_id)) parIp.set(m.ip_id, []); parIp.get(m.ip_id).push(m); }
  const bailDeIp = new Map(baux.map((b) => [b.ip_id, b]));
  const enSession = new Set(baux.map((b) => b.user_id));

  // 1. Les baux en cours : fin douce, fin, prolongation — jamais une coupure au milieu d'un job.
  for (const b of baux) {
    const fin = instant(b.fin_prevue);
    const prioritaire = String(b.motif ?? '').startsWith('priorite_');
    const prioAutre = !prioritaire && (parIp.get(b.ip_id) ?? []).some((m) => m.user_id !== b.user_id && m.actif && m.priorite);
    if (!b.fin_douce_le && (now >= fin - p.finDouceAvantMin * 60_000 || prioAutre)) finDouce.push(b.id);
    if (now < fin && !prioAutre) continue;
    const bl = Array.isArray(b.bloquants) ? b.bloquants : [];
    if (!bl.length) { terminer.push(b.id); continue; }
    if (now >= fin && (b.prolonge_min ?? 0) < p.prolongationMaxMin) prolonger.push(b.id);
    else if ((b.prolonge_min ?? 0) >= p.prolongationMaxMin) {
      alertes.push({ nature: bl.includes('job_en_cours') ? 'bail_bloque_job' : 'bail_bloque', bail: b.id, user_id: b.user_id, bloquants: bl });
    }
  }

  // 2. Les IP libres : le prochain du groupe — la priorité d'abord, puis celui qui attend depuis le plus longtemps.
  const ouverts = new Set();
  for (const ip of ips) {
    if (ip.etat !== 'rotation' || bailDeIp.has(ip.id)) continue;
    if (ip.libre_le && instant(ip.libre_le) > now) continue;          // battement entre deux comptes
    const cands = (parIp.get(ip.id) ?? []).filter((m) => m.actif && !enSession.has(m.user_id));
    if (!cands.length) continue;
    const attente = (m) => instant(m.derniere_fin) ?? instant(m.rejoint_le) ?? 0;
    cands.sort((a, b) => (a.priorite ? 0 : 1) - (b.priorite ? 0 : 1)
      || (a.priorite && b.priorite ? instant(a.priorite.le) - instant(b.priorite.le) : 0)
      || attente(a) - attente(b));
    const m = cands[0];
    const motif = m.priorite ? (MOTIFS_PRIORITE[m.priorite.motif] ?? 'priorite_retrait')
      : m.derniere_fin == null ? 'premiere_connexion' : 'tour';
    ouvrir.push({ user_id: m.user_id, ip_id: ip.id, motif, dureeMin: motif === 'premiere_connexion' ? p.sessionConnexionMin : s });
    ouverts.add(m.user_id);
  }

  // 3. Jamais un trou silencieux : T_max dépassé, priorité qui attend, groupe trop grand.
  for (const m of membres) {
    if (!m.actif || enSession.has(m.user_id) || ouverts.has(m.user_id)) continue;
    const depuis = instant(m.derniere_fin) ?? instant(m.rejoint_le);
    if (depuis != null && now - depuis > p.tMaxMin * 60_000) {
      alertes.push({ nature: 'tmax_depasse', user_id: m.user_id, minutes: Math.floor((now - depuis) / 60_000) });
    }
    if (m.priorite && now - instant(m.priorite.le) > p.prioriteAttenteMaxMin * 60_000) {
      alertes.push({ nature: 'priorite_en_attente', user_id: m.user_id, motif: m.priorite.motif });
    }
  }
  for (const [ipId, ms] of parIp) if (ms.length > g) alertes.push({ nature: 'groupe_trop_grand', ip_id: ipId, membres: ms.length, g });
  return { finDouce, terminer, prolonger, ouvrir, alertes };
}

/**
 * Renouveler, laisser expirer, commander — en ROTATION : garder poolTaille IP utilisables.
 *   · une IP en rotation qui a des membres est TOUJOURS renouvelée (comme celle d'un client) ;
 *   · rebut, usée (comptesDistinctsMax) et vide, reste de quarantaine : jamais renouvelée ;
 *   · une IP libre au-delà de poolTaille : laissée expirer ;
 *   · il manque des IP pour atteindre poolTaille : on commande (jamais au-delà : la taille est un réglage).
 */
export function planDuJourRotation({ ips, membres = {}, commandesEnCours = 0, maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const N = p.renouvellementAvantJours * JOUR_MS;
  const renouveler = [], laisserExpirer = [], attendre = [], candidats = [];
  let garde = 0;
  for (const ip of Array.isArray(ips) ? ips : []) {
    const ech = instant(ip.expire_le) - now;
    const n = membres[ip.id] ?? 0;
    if (ip.etat === 'expiree') continue;
    if (ip.etat === 'rebut') { if (ech <= N) laisserExpirer.push(ip.id); continue; }
    if (ETATS_ATTRIBUES.includes(ip.etat)) { (ech <= N ? renouveler : attendre).push(ip.id); continue; }
    if (ip.etat === 'rotation' && n > 0) { garde++; (ech <= N ? renouveler : attendre).push(ip.id); continue; }
    if (ip.etat === 'quarantaine') { (ech <= N ? laisserExpirer : attendre).push(ip.id); continue; }
    const usee = (ip.attributions ?? 0) >= p.comptesDistinctsMax;
    if (ech > N) { if (!usee) garde++; attendre.push(ip.id); continue; }
    if (usee) { laisserExpirer.push(ip.id); continue; }
    candidats.push(ip);
  }
  candidats.sort((a, b) => (a.attributions ?? 0) - (b.attributions ?? 0) || instant(a.expire_le) - instant(b.expire_le));
  for (const ip of candidats) { if (garde < p.poolTaille) { renouveler.push(ip.id); garde++; } else laisserExpirer.push(ip.id); }
  const aCommander = Math.max(0, p.poolTaille - garde - Math.max(0, Math.floor(Number(commandesEnCours) || 0)));
  return { renouveler, laisserExpirer, attendre, garde, aCommander };
}

// ── LA PURGE D'UN COMPTE QUI QUITTE LA ROTATION ──────────────────────────────
// L'IP continue de servir les autres ; c'est le COMPTE qui est effacé : son
// profil de navigateur détruit (aucun ne reste), son coffre vidé, sa session
// FillSell révoquée. Preuve (version 2), relue par la base
// (cloud_purge_compte_manques, mêmes codes, même ordre) :
//   { version: 2, faite_le, profil: { id, detruit: true }, profils_restants: 0,
//     coffre_restants: 0, session_fillsell_revoquee: true }
export const CODES_PURGE_COMPTE = Object.freeze([
  'version', 'faite_apres_depart', 'profil_detruit', 'profils_restants', 'coffre_restants', 'session_fillsell_revoquee',
]);

export function manquesPreuvePurgeCompte(preuve, quitteLe) {
  const m = [];
  const q = preuve && typeof preuve === 'object' ? preuve : {};
  const dep = instant(quitteLe);
  if (q.version !== 2) m.push('version');
  const faite = instant(q.faite_le);
  if (faite == null || dep == null || faite < dep) m.push('faite_apres_depart');
  const pr = q.profil && typeof q.profil === 'object' ? q.profil : {};
  if (!(nonVide(pr.id) && pr.detruit === true)) m.push('profil_detruit');
  if (q.profils_restants !== 0) m.push('profils_restants');
  if (q.coffre_restants !== 0) m.push('coffre_restants');
  if (q.session_fillsell_revoquee !== true) m.push('session_fillsell_revoquee');
  return m;
}

// ── LE COÛT RÉEL D'UN ESSAI EN ROTATION ──────────────────────────────────────
// Un navigateur ne tourne que pendant un bail : à tout instant, au plus UN
// navigateur et UN poste en base par IP. Un compte d'un groupe de g paie donc
// 1/g de l'IP, d'une place de serveur et d'un poste en base, pendant 7 jours.
// MESURÉ : IP (commande réelle), CPU base par poste (04/10 soir), trafic (26/09).
// ESTIMÉ : serveur (CX43, 15 à 25 navigateurs), prix de l'instance Small.
// À pool PLEIN : un pool à moitié vide coûte deux fois plus par essai.
export function coutEssaiRotation({ g, jours = ESSAI_JOURS, p = PARAMETRES }) {
  const gg = Math.max(1, Math.floor(Number(g) || 1));
  const ip = (jours * ipEurJour(p)) / gg;
  const placeJour = (n) => p.serveurEurMois / 30 / n;
  const serveurMin = (jours * placeJour(p.navigateursParServeurMax)) / gg;
  const serveurMax = (jours * placeJour(p.navigateursParServeurMin)) / gg;
  const baseJour = (pct) => ((p.baseInstanceUsdMois * p.tauxUsdEur) / 30) * (pct / 100);
  const baseMin = (jours * baseJour(p.baseCpuPctParPosteMin)) / gg;
  const baseMax = (jours * baseJour(p.baseCpuPctParPosteMax)) / gg;
  const carte = p.carteEurParEssai ?? 0;
  return {
    g: gg, jours,
    ipEur: r2(ip),
    serveurEur: [r2(serveurMin), r2(serveurMax)],
    baseEur: [Math.round(baseMin * 1000) / 1000, Math.round(baseMax * 1000) / 1000],
    carteEur: carte,
    totalEur: [r2(ip + serveurMin + baseMin + carte), r2(ip + serveurMax + baseMax + carte)],
  };
}

/** Le tableau du doc : groupes de 1 à 4 × T_max 15 / 30 / 60, coût d'un essai et par client gagné. */
export function tableauCoutsRotation({ groupes = [1, 2, 3, 4], tMax = [15, 30, 60], conversions = [0.10, 0.25, 0.40], p = PARAMETRES } = {}) {
  return groupes.map((g) => {
    const cout = coutEssaiRotation({ g, p });
    const parT = tMax.map((t) => {
      const q = { ...p, tMaxMin: t };
      return { tMax: t, possible: g <= groupeEffectif(q), sessionMin: dureeSession(g, q) };
    });
    const parClient = conversions.map((c) => ({ c, totalEur: [r2(cout.totalEur[0] / c), r2(cout.totalEur[1] / c)] }));
    return { g, cout, parT, parClient };
  });
}
