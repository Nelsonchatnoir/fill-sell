// ═══════════════════════════════════════════════════════════════════════════
// FILLSELL CLOUD — LE POOL D'ADRESSES IP FRANÇAISES — LES RÈGLES, PURES
// (05/10/2026 : une IP DÉDIÉE par compte — la rotation du 04/10 est abandonnée)
// ═══════════════════════════════════════════════════════════════════════════
// Le Cloud fait tourner notre extension dans un navigateur sur nos serveurs
// (Hetzner), sortie par une IP française (IPRoyal, « ISP / static residential »).
// Décisions de Nico (05/10) :
//   · une IP française DÉDIÉE par compte, à lui seul, pendant l'essai puis
//     pendant l'abonnement ;
//   · essai non transformé ou option arrêtée : l'IP retourne au pool après un
//     REPOS (7 jours proposés), pour qu'aucune plateforme ne relie deux comptes ;
//     le même compte qui revient pendant le repos reprend SA propre IP ;
//   · pool vide : alerte, et le nouvel essai ATTEND (la préparation refuse
//     « pool_vide » : jamais un essai qui démarre sans IP) ;
//   · toute IP signalée (blocage, captcha répété, compte restreint, liste
//     noire…) va au REBUT : jamais réattribuée, jamais renouvelée ;
//   · un seul essai par personne : compte, appareil, compte de plateforme ET
//     carte (empreintes hachées) — engagés au début RÉEL de l'essai seulement.
//
// Base : supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql (même
// ordre, mêmes codes, mêmes défauts — le selftest relit le fichier et compare ;
// banc SQL : scripts/cloud/banc-sql-socle.mjs). Conception : docs/cloud/pool-ip.md.
// Aucun réseau ici : l'orchestrateur lit la base et IPRoyal, puis demande à
// ces règles quoi faire. Testé : npm run selftest:cloud-pool.

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
export const EXIGE_UN_PALIER = false;  // = CLOUD_EXIGE_UN_PALIER (l'option se prend seule sur Free)
export const PRIX_AFFICHE = '20 €';    // = CLOUD_PRIX_AFFICHE (TTC, partout)

// ── Les réglages — chaque valeur est une PROPOSITION, nommée ──────────────
// En base : coin_config `cloud_<clé>` (cloud_param), mêmes défauts.
export const PARAMETRES = Object.freeze({
  // Cycle de l'IP — SQL : cloud_param(...)
  graceJours: 2,               // grace_jours : fin d'essai non payée → repos ; le temps que le 1er paiement passe
  reposJours: 7,               // repos_jours : = durée de vie mesurée des jetons Vinted (7 j, 26/09)
  margeExpirationJours: 1,     // marge_expiration_jours : une IP d'essai couvre essai + grâce + 1 j
  renouvellementAvantJours: 3, // renouvellement_avant_jours : décision de renouvellement d'une IP EN SERVICE
  attributionsMax: 6,          // attributions_max : usure — au-delà, une IP libre n'est plus attribuée
  reservationMin: 30,          // reservation_min : place gardée entre la préparation et le paiement
  empreintesConservationMois: 12, // empreintes_conservation_mois : RGPD
  // Le délai entre deux sessions (relecture des ventes) N'EST PAS TRANCHÉ
  // (étude en cours, 05/10) : coin_config cloud_delai_sessions_min ; absent = null
  // = navigateur en continu.
  delaiSessionsMin: null,
  // Achat (IPRoyal) — commande #83578416 du 26/09 : 1 IP France, 5,40 $ / 30 j
  periodeIpJours: 30,
  prixIpUsd30j: 5.40,          // MESURÉ (prix France, 1 IP) ; le « dès 2,70 $ » public n'est pas la France
  tauxUsdEur: 0.86,            // ⚠️ à relire le jour de l'achat
  delaiAchatJours: 1,          // L : NON VÉRIFIÉ chez IPRoyal (« in-progress » → « confirmed »)
  periodeDecisionJours: 1 / 24, // R : l'entretien passe toutes les heures
  z: 1.65,                     // marge de Poisson, ~95 %
  lambdaMin: 0.5,              // plancher du rythme d'essais mesuré (essais/jour)
  // Signalements (rebut)
  temoinsMin: 2,               // un blocage n'accuse l'IP que si ≥ 2 AUTRES IP passent la même plateforme (24 h)
  captchasMax: 3,              // 3 captchas sur la même plateforme en 24 h glissantes
  sortiesKoMax: 3,             // 3 contrôles de sortie ratés d'affilée
  controleFraicheurH: 24,      // un contrôle de sortie de repos vaut 24 h
  // Alertes (même esprit que veille-cpu)
  rappelVideMin: 60,
  rappelPresqueVideMin: 360,
  // Coûts — ESTIMÉS tant que le serveur n'a pas tourné (complet: false)
  serveurEurMois: 15.99,       // ESTIMÉ : Hetzner CX43 HT (à relire dans l'API Hetzner à la création)
  navigateursParServeur: 20,   // ESTIMÉ : 15 à 25 navigateurs Chromium + extension par CX43 (16 Go) — à MESURER
  serveurMesure: false,        // passe à true quand navigateursParServeur est mesuré sur le serveur
  baseCpuPctParPosteMax: 0.25, // MESURÉ (04/10 soir) : 0,1 à 0,25 % du CPU d'une Small par poste allumé
  baseInstanceUsdMois: 15,     // Supabase Small ≈ 15 $/mois
  traficPlafondGoMois: 100,    // IPRoyal : 100 Go par proxy et par 30 j
  // Revenus de l'option — 20 € TTC partout
  prixTtcEur: 20,
  tva: 0.20,
  stripePct: 0.015,            // cartes standard de l'EEE (stripe.com/fr/pricing, 04/10/2026)
  stripeFixeEur: 0.25,
  stripeBillingPct: 0.007,     // Stripe Billing
  commissionApple: 0.15,       // Small Business Program
  commissionGoogle: 0.15,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE CYCLE DE VIE D'UNE IP
// ═══════════════════════════════════════════════════════════════════════════
//   achetee ─controle_ok─▶ disponible ─attribuer_essai─▶ attribuee_essai ─convertir─▶ attribuee_client
//      │                     ▲   └──attribuer_client──────────────────────────────────▶│
//      │                     │ sortir (repos fini + purge prouvée + contrôle frais)  │ liberer
//      ▼                     └──────────────────── repos ◀───────────────────────────┘
//   signaler (tout état vivant) ──▶ rebut ──expirer──▶ expiree
//   repos ──reprendre──▶ attribuee_* (le MÊME compte revient)
//   ⛔ une IP ATTRIBUÉE n'expire jamais sous son titulaire : transition interdite.
export const ETATS = Object.freeze(['achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree']);
export const ETATS_ATTRIBUES = Object.freeze(['attribuee_essai', 'attribuee_client']);

const TRANSITIONS = Object.freeze({
  achetee:          { controle_ok: 'disponible', signaler: 'rebut', expirer: 'expiree', renouveler: 'achetee' },
  disponible:       { attribuer_essai: 'attribuee_essai', attribuer_client: 'attribuee_client', signaler: 'rebut', expirer: 'expiree', renouveler: 'disponible' },
  attribuee_essai:  { convertir: 'attribuee_client', liberer: 'repos', signaler: 'rebut', renouveler: 'attribuee_essai' },
  attribuee_client: { liberer: 'repos', signaler: 'rebut', renouveler: 'attribuee_client' },
  repos:            { purge_prouvee: 'repos', sortir: 'disponible', reprendre_essai: 'attribuee_essai', reprendre_client: 'attribuee_client', signaler: 'rebut', expirer: 'expiree', renouveler: 'repos' },
  rebut:            { signaler: 'rebut', expirer: 'expiree' },
  expiree:          {},
});

/** L'état suivant d'une IP, ou null si la transition est interdite. */
export function prochainEtat(etat, evenement) {
  return TRANSITIONS[etat]?.[evenement] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. RÉSERVATION ET ATTRIBUTION — miroir de cloud_ip_attribuable,
//    cloud_ip_reserver et cloud_ip_attribuer (SQL)
// ═══════════════════════════════════════════════════════════════════════════

/** Jusqu'où une IP doit rester payée pour être attribuée (ms epoch).
 *  essai  : maintenant + 7 j + grâce + marge (jamais une IP qui expire pendant l'essai) ;
 *  client : maintenant + N (le temps d'une décision de renouvellement). */
export function couvertureJusqua({ nature, maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  if (nature === 'essai') return now + (ESSAI_JOURS + p.graceJours + p.margeExpirationJours) * JOUR_MS;
  return now + p.renouvellementAvantJours * JOUR_MS;
}

/** Cette IP peut-elle être donnée à ce compte, maintenant ? (= cloud_ip_attribuable) */
export function ipAttribuable(ip, { nature = 'essai', userId = null, maintenant = Date.now(), p = PARAMETRES } = {}) {
  const exp = instant(ip?.expire_le);
  if (exp == null || exp < couvertureJusqua({ nature, maintenant, p })) return false;
  // Au repos : seulement à SON dernier titulaire (aucun autre compte ne l'a vue).
  if (ip.etat === 'repos') return userId != null && ip.dernier_user_id === userId;
  if (ip.etat !== 'disponible') return false;
  if ((ip.attributions ?? 0) >= p.attributionsMax) return false;
  const res = ip.reserve_pour ?? null;
  return res == null || res === userId || instant(ip.reserve_jusqu_au) < instant(maintenant);
}

/** L'IP que cloud_ip_attribuer prendrait — même ordre :
 *  0. le compte en tient déjà une → la même (idempotent) ;
 *  1. sa propre IP au repos (la plus récemment libérée) ;
 *  2. SA réservation, puis la disponible qui expire le plus tôt tout en couvrant
 *     (FEFO), la moins usée à égalité. */
export function choisirIp(ips, { nature = 'essai', userId = null, maintenant = Date.now(), p = PARAMETRES } = {}) {
  const liste = Array.isArray(ips) ? ips : [];
  if (userId != null) {
    const deja = liste.find((ip) => ip.user_id === userId && ETATS_ATTRIBUES.includes(ip.etat));
    if (deja) return deja;
  }
  const ctx = { nature, userId, maintenant, p };
  const siennes = liste.filter((ip) => ip.etat === 'repos' && ipAttribuable(ip, ctx))
    .sort((a, b) => instant(b.liberee_le) - instant(a.liberee_le));
  if (siennes.length) return siennes[0];
  const dispo = liste.filter((ip) => ip.etat === 'disponible' && ipAttribuable(ip, ctx))
    .sort((a, b) => Number(b.reserve_pour === userId && userId != null) - Number(a.reserve_pour === userId && userId != null)
      || instant(a.expire_le) - instant(b.expire_le)
      || (a.attributions ?? 0) - (b.attributions ?? 0)
      || Number(a.id) - Number(b.id));
  return dispo[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE COMPTE SUIT SON ÉTAT — miroir de cloud_compte_synchroniser
// ═══════════════════════════════════════════════════════════════════════════
// etat : cloudDuProfil / cloud_etat ({ etat, actif, essaiArrete, essaiFin }) ;
// ip : l'IP qu'il tient (ou null).
//   actif, sans IP          → 'attribuer' (nature essai | client) ;
//   payé sur une IP d'essai → 'convertir' ;
//   inactif, avec IP        → 'grace' (essai fini normalement, < grâce) ou 'repos' ;
//   sinon                   → 'rien'.
export function actionCompte({ etat, ip = null, maintenant = Date.now(), p = PARAMETRES }) {
  const e = etat ?? {};
  if (e.actif === true) {
    if (!ip) return { action: 'attribuer', nature: e.etat === 'paye' ? 'client' : 'essai' };
    if (e.etat === 'paye' && ip.etat === 'attribuee_essai') return { action: 'convertir' };
    return { action: 'rien' };
  }
  if (!ip) return { action: 'rien' };
  const fin = instant(e.essaiFin);
  if (e.etat === 'essai_termine' && e.essaiArrete !== true && fin != null && fin + p.graceJours * JOUR_MS > instant(maintenant)) {
    return { action: 'grace' };
  }
  return { action: 'repos' };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LA PURGE PROUVÉE ET LA SORTIE DU REPOS
// ═══════════════════════════════════════════════════════════════════════════
// La preuve est produite par l'orchestrateur APRÈS la libération ; la base la
// relit (cloud_purge_manques, même liste, même ordre). Forme (version 1) :
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

// Le contrôle d'entrée (et de sortie de repos) — fait depuis un profil NEUF, sans compte :
//   { fait_le, ip_sortie, pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok', leboncoin: 'ok', ebay: 'ok' } }
export const CODES_CONTROLE = Object.freeze(['controle_frais', 'ip_sortie', 'pays', 'listes_noires', 'plateformes']);

/** Ce qui manque à un contrôle ([] = bon). */
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

/** repos → disponible ? Miroir de cloud_ip_remettre_en_pool. (05/10 : l'IP d'un
 *  ancien client retourne AUSSI au pool, après le même repos.) */
export function peutRemettreEnPool(ip, controle, maintenant = Date.now(), p = PARAMETRES) {
  const m = [];
  const now = instant(maintenant);
  if (ip?.etat !== 'repos') m.push('pas_au_repos');
  const fin = instant(ip?.repos_fin);
  if (fin == null || now < fin) m.push('repos_en_cours');
  const prouvee = instant(ip?.purge_prouvee_le);
  const lib = instant(ip?.liberee_le);
  if (prouvee == null || lib == null || prouvee < lib || manquesPreuvePurge(ip?.purge_preuve, ip?.liberee_le).length) m.push('purge_non_prouvee');
  const exp = instant(ip?.expire_le);
  if (exp == null || exp <= now) m.push('expiree');
  m.push(...manquesControle(controle, ip, maintenant, p));
  return { ok: m.length === 0, manques: m };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE SIGNALEMENT — quand une observation envoie l'IP au rebut
// ═══════════════════════════════════════════════════════════════════════════
export const CRITERES_REBUT = Object.freeze([
  'blocage_anti_robot', 'captcha_repete', 'compte_restreint', 'liste_noire',
  'sortie_non_conforme', 'controle_entree', 'manuel',
]);

/**
 * observation : { nature: 'blocage'|'captcha'|'restriction'|'liste_noire'|'sortie_ko'|'controle_entree_ko', plateforme?, le }
 * historique  : observations précédentes de CETTE IP (24 h ; 'sortie_ok' remet à zéro
 *               le compte des sorties ratées d'affilée)
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
      const tries = [...recents].sort((a, b) => instant(b.le) - instant(a.le));
      let n = 1;
      for (const h of tries) { if (h.nature === 'sortie_ko') n++; else if (h.nature === 'sortie_ok') break; }
      return { critere: n >= p.sortiesKoMax ? 'sortie_non_conforme' : null };
    }
    default: return { critere: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA TAILLE DU POOL ET LES SEUILS — calculés, jamais en dur
// ═══════════════════════════════════════════════════════════════════════════
// IP DÉDIÉE : chaque compte actif tient UNE IP. Loi de Little, régime établi :
//   clients     = C (payants, une IP chacun, renouvelée tant qu'ils paient)
//   essais      = λ · T                         (en cours)
//   grâce       = λ · (1 − c) · G               (non convertis, en attente du 1er paiement)
//   repos       = (λ · (1 − c) + μ) · R         (départs d'essais et de clients, au repos)
//   sécurité    = λ·H + z·√(λ·H),  H = L + R'   (délai d'achat + période de décision)
//   cible       = C + ⌈essais + grâce + repos⌉ + ⌈sécurité⌉
// λ = essais/jour, c = conversion, μ = départs de clients/jour.

/** λ mesuré : essais démarrés sur 7 jours / 7, avec un plancher. */
export function lambdaMesure(essais7j, p = PARAMETRES) {
  return Math.max(p.lambdaMin, (Number(essais7j) || 0) / 7);
}

/** Les seuils, depuis λ : commande (point de réapprovisionnement) et alerte « presque vide ». */
export function seuils({ lambda, p = PARAMETRES }) {
  const l = Math.max(p.lambdaMin, Number(lambda) || 0);
  const h = p.delaiAchatJours + p.periodeDecisionJours;
  const commande = plafond(l * h + p.z * Math.sqrt(l * h));
  const alerte = plafond(l * p.delaiAchatJours + p.z * Math.sqrt(l * p.delaiAchatJours));
  return { commande, alerte };
}

/** La taille cible du pool (clients compris) et son coût mensuel. */
export function taillePoolCible({ lambda, conversion, clients = 0, departsClientsJour = 0, p = PARAMETRES }) {
  const l = Math.max(0, Number(lambda) || 0);
  const c = borne01(conversion);
  const mu = Math.max(0, Number(departsClientsJour) || 0);
  const C = Math.max(0, Math.floor(Number(clients) || 0));
  const essais = l * ESSAI_JOURS;
  const grace = l * (1 - c) * p.graceJours;
  const repos = (l * (1 - c) + mu) * p.reposJours;
  const enCycle = plafond(essais + grace + repos);
  const securite = seuils({ lambda: l, p }).commande;
  const total = C + enCycle + securite;
  const coutMensuelUsd = r2(total * p.prixIpUsd30j * (30 / p.periodeIpJours));
  return { clients: C, enCycle, securite, total, coutMensuelUsd, coutMensuelEur: r2(coutMensuelUsd * p.tauxUsdEur) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LE PLAN DE L'HEURE — renouveler, laisser expirer, commander
// ═══════════════════════════════════════════════════════════════════════════
//   · une IP ATTRIBUÉE (essai ou client) est TOUJOURS renouvelée (décision à N jours) ;
//   · une IP au rebut ou usée n'est JAMAIS renouvelée ;
//   · une IP au repos est renouvelée si elle sera prête dans l'horizon H et que
//     le pool en a besoin ; sinon elle expire (payer son repos pour rien) ;
//   · une IP libre en SURPLUS n'est pas renouvelée ;
//   · ce qui manque est COMMANDÉ — ⛔ jamais sans le GO de Nico (aCommander est
//     une proposition ; l'orchestrateur n'achète rien seul).
const PRETE = (ip, now, H) => ip.etat === 'achetee' || ip.etat === 'disponible'
  || (ip.etat === 'repos' && instant(ip.repos_fin) != null && instant(ip.repos_fin) <= now + H);

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
    // achetee / disponible / repos : le pool
    const usee = (ip.attributions ?? 0) >= p.attributionsMax;
    const prete = PRETE(ip, now, H);
    const couvre = echeance >= couvertureEssai;
    if (prete && couvre && !usee) { projete++; attendre.push(ip.id); continue; }
    if (echeance <= N || (prete && !couvre)) {
      if (usee || !prete) laisserExpirer.push(ip.id); else candidats.push(ip);
      continue;
    }
    attendre.push(ip.id);
  }
  candidats.sort((a, b) => (a.attributions ?? 0) - (b.attributions ?? 0) || instant(a.expire_le) - instant(b.expire_le));
  for (const ip of candidats) {
    if (projete < vise) { renouveler.push(ip.id); projete++; } else laisserExpirer.push(ip.id);
  }
  const aCommander = Math.max(0, vise - projete);
  const attribuables = (Array.isArray(ips) ? ips : []).filter((ip) => ip.etat === 'disponible' && ipAttribuable(ip, { nature: 'essai', maintenant: now, p })).length;
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
 * « vide » rappelle toutes les heures, « presque vide » toutes les 6 h ; passer de
 * « presque vide » à « vide » prévient tout de suite. `sansPlace` > 0 (un compte
 * actif — essai ou client — sans IP) : alerte IMMÉDIATE, à chaque passage.
 */
export function deciderAlerte({ niveau, derniereAlerte = null, dernierRetabli = null, attribuables = 0, seuilCommande, sansPlace = 0, maintenant = Date.now(), p = PARAMETRES }) {
  if ((Number(sansPlace) || 0) > 0) return { action: 'alerte', niveau: 'sans_place' };
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
// 8. UN SEUL ESSAI PAR PERSONNE — miroir de cloud_essai_preparer_moi et
//    cloud_essai_noter_carte (même ordre)
// ═══════════════════════════════════════════════════════════════════════════
// Les empreintes sont des HMAC-SHA256 calculés EN BASE (sel du vault) ; ici
// `hacher` est fourni par l'appelant (test : identité normalisée).
const hacherDefaut = (espace, v) => `${String(espace).trim().toLowerCase()}:${String(v ?? '').trim().toLowerCase()}`;

/**
 * La préparation (l'app, AVANT Stripe, l'App Store ou Google Play) :
 *   refus  : compte_inconnu · deja_client · pool_vide ;
 *   sinon  : { ok: true, essai, raison } — essai = false avec sa raison, dans cet
 *            ordre : essai_deja_pris · appareil_inconnu · appareil_deja_vu ·
 *            compte_plateforme_deja_vu. L'option reste possible, payée tout de suite.
 * `empreintesVues` : Set de « nature|empreinte » appartenant à d'AUTRES comptes.
 */
export function verdictPreparation({ profil, placeLibre, appareil, comptes = [], empreintesVues = new Set(), hacher = hacherDefaut }) {
  if (!profil) return { ok: false, raison: 'compte_inconnu' };
  if (profil.is_cloud === true) return { ok: false, raison: 'deja_client' };
  if (!placeLibre) return { ok: false, raison: 'pool_vide' };
  if (profil.cloud_essai_debut != null) return { ok: true, essai: false, raison: 'essai_deja_pris' };
  if (!nonVide(appareil)) return { ok: true, essai: false, raison: 'appareil_inconnu' };
  if (empreintesVues.has(`appareil|${hacher('appareil', appareil)}`)) return { ok: true, essai: false, raison: 'appareil_deja_vu' };
  for (const c of Array.isArray(comptes) ? comptes : []) {
    if (!nonVide(c?.plateforme) || !nonVide(c?.identifiant)) continue;
    if (empreintesVues.has(`compte_plateforme|${hacher(c.plateforme, c.identifiant)}`)) {
      return { ok: true, essai: false, raison: 'compte_plateforme_deja_vu' };
    }
  }
  return { ok: true, essai: true, raison: null };
}

/** La carte (4e verrou, stripe-webhook au début d'un essai Stripe). */
export function verdictCarte({ userId, carte, proprietaireEmpreinte = undefined }) {
  if (!nonVide(carte)) return { ok: false, raison: 'carte_absente' };
  if (proprietaireEmpreinte === undefined) return { ok: true };
  if (proprietaireEmpreinte === userId) return { ok: true, deja_note: true };
  return { ok: false, raison: 'carte_deja_vue' };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LES COÛTS — par essai, par client, marge sur 20 € TTC/mois
// ═══════════════════════════════════════════════════════════════════════════
const ipEurJour = (p) => (p.prixIpUsd30j / p.periodeIpJours) * p.tauxUsdEur;
const serveurEurJourParCompte = (p) => (p.serveurEurMois / 30) / p.navigateursParServeur;
const baseEurJourParCompte = (p) => (p.baseInstanceUsdMois * p.tauxUsdEur / 30) * (p.baseCpuPctParPosteMax / 100);

function poste(joursIp, joursNavigateur, p) {
  const ip = joursIp * ipEurJour(p);
  const srv = joursNavigateur * serveurEurJourParCompte(p);
  const bse = joursNavigateur * baseEurJourParCompte(p);
  return { joursIp, ipEur: r2(ip), serveurEur: r2(srv), baseEur: r2(bse), totalEur: r2(ip + srv + bse), _brut: ip + srv + bse };
}

/** Coût d'un essai : converti (l'IP part au client après T) ou non (T + G + R jours d'IP).
 *  Le navigateur ne tourne que pendant l'essai (T jours) : ni pendant la grâce, ni au repos. */
export function coutParEssai({ conversion, p = PARAMETRES }) {
  const c = borne01(conversion);
  const nonConverti = poste(ESSAI_JOURS + p.graceJours + p.reposJours, ESSAI_JOURS, p);
  const converti = poste(ESSAI_JOURS, ESSAI_JOURS, p);
  const moyen = c * converti._brut + (1 - c) * nonConverti._brut;
  delete nonConverti._brut; delete converti._brut;
  return {
    nonConverti,
    converti,
    moyenEur: r2(moyen),
    parClientAcquisEur: c > 0 ? r2(moyen / c) : null,
    serveurMesure: p.serveurMesure === true,
  };
}

function netBrut(canal, p) {
  const ttc = p.prixTtcEur;
  const ht = ttc / (1 + p.tva);
  let frais;
  if (canal === 'stripe') frais = ttc * (p.stripePct + p.stripeBillingPct) + p.stripeFixeEur;
  else if (canal === 'apple') frais = ht * p.commissionApple;
  else if (canal === 'google') frais = ht * p.commissionGoogle;
  else return null;
  return { ttc, ht, frais, net: ht - frais };
}

export function fraisPaiement({ canal, p = PARAMETRES }) {
  const b = netBrut(canal, p);
  if (!b) return null;
  return { canal, ttcEur: b.ttc, htEur: r2(b.ht), fraisEur: r2(b.frais), netEur: r2(b.net) };
}

/** Marge mensuelle d'un client Cloud payant : son IP dédiée, sa part de serveur et de base. */
export function margeParClient({ canal, p = PARAMETRES }) {
  const b = netBrut(canal, p);
  if (!b) return null;
  const f = fraisPaiement({ canal, p });
  const ip = 30 * ipEurJour(p);
  const srv = 30 * serveurEurJourParCompte(p);
  const bse = 30 * baseEurJourParCompte(p);
  return {
    canal, netEur: f.netEur, fraisEur: f.fraisEur,
    ipEur: r2(ip), serveurEur: r2(srv), baseEur: r2(bse),
    margeEur: r2(b.net - ip - srv - bse), serveurMesure: p.serveurMesure === true,
  };
}

/** Capacité : combien de comptes pour N serveurs, et le CPU de base ajouté (navigateurs en continu). */
export function capacite({ serveurs = 1, comptes = null, p = PARAMETRES }) {
  const max = Math.max(0, Math.floor(serveurs)) * p.navigateursParServeur;
  const n = comptes == null ? max : Math.max(0, Math.floor(comptes));
  return {
    comptesMax: max,
    serveursPour: n === 0 ? 0 : plafond(n / p.navigateursParServeur),
    cpuBasePctMax: r2(n * p.baseCpuPctParPosteMax),
    serveurMesure: p.serveurMesure === true,
  };
}
