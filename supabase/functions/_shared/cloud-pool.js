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
//     ⛔ (14/11, règle de Nico : « On ne jette JAMAIS une IP payée ») plus AUCUN rebut automatique : un contrôle sans
//     réponse se retente, une IP douteuse va en QUARANTAINE et se recontrôle (section 4 bis) ; le rebut ne vient plus
//     que d'un geste de Nico (cloud_ip_signaler, à la main) ;
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
export const PRIX_AFFICHE = '24,99 €'; // = CLOUD_PRIX_AFFICHE (TTC, partout — décision de Nico du 03/11)

// ── Les réglages — chaque valeur est une PROPOSITION, nommée ──────────────
// En base : coin_config `cloud_<clé>` (cloud_param), mêmes défauts.
export const PARAMETRES = Object.freeze({
  // Cycle de l'IP — SQL : cloud_param(...)
  graceJours: 2,               // grace_jours : fin d'essai non payée → repos ; le temps que le 1er paiement passe
  // (19/11/2026, demande de Nico : « aucune IP payée en trop ») La grâce ne vaut que si un 1er paiement peut encore arriver :
  // AUCUNE pour un essai arrêté ou au renouvellement coupé, ni pour un compte payé puis arrêté (IP convertie) ; un essai
  // Stripe jamais converti (Stripe convertit à la fin même de l'essai : non converti = annulé) n'a que grace_stripe_heures,
  // le temps d'un message en retard. SQL :
  // cloud_compte_synchroniser_pool (migration 20261119190000) ; JS : actionCompte.
  graceStripeHeures: 2,        // grace_stripe_heures
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
  // Revenus de l'option — 24,99 € TTC partout (décision de Nico du 03/11 ; = PRIX_AFFICHE)
  prixTtcEur: 24.99,
  tva: 0.20,
  stripePct: 0.015,            // cartes standard de l'EEE (stripe.com/fr/pricing, 04/10/2026)
  stripeFixeEur: 0.25,
  stripeBillingPct: 0.007,     // Stripe Billing
  commissionApple: 0.15,       // Small Business Program
  commissionGoogle: 0.15,
  // (03/11, point 2 de Nico) L'approvisionnement — SQL : cloud_param(...), coin_config cloud_<clé>
  // (07/11, décisions 1 et 2 de Nico) « IP toujours d'avance » : la MARGE remplace le stock minimum (cloud_ip_stock_min,
  // plus lu par l'orchestrateur) ; « plus de plafond en dollars » : cloud_ip_budget_mensuel_usd n'est plus lu — la seule
  // garde de l'achat est le NOMBRE (gardeNombre = cloud_ip_garde_nombre en base).
  ipMarge: 3,                  // ip_marge : IP d'avance sur les comptes Cloud (attribuables à un nouveau compte), réglable en base
  ipAchatMax: 10,              // ip_achat_max : au plus N IP par commande automatique
  ipProlongationEspacementJours: 15, // ip_prolongation_espacement_jours : une commande n'est jamais prolongée deux fois en N jours (anti-boucle)
  ipRebutsEntreeMax: 3,        // (07/11) N IP refusées au contrôle d'ENTRÉE en 24 h : l'achat automatique se suspend (la garde du nombre ne compte pas le rebut)
  soldeHorizonJours: 14,       // (07/11, décision 3) le solde IPRoyal doit couvrir les dépenses prévues sur N jours
  refusRevisiteJours: 14,      // refus_revisite_jours : un refus PROUVÉ est revisité après N jours
  // (07/11 soir, ordres 3 et 4 de Nico) LA SANTÉ DES IP LIBRES — contrôle périodique (serveur-cloud/src/sante.js,
  // entretien.controlerSante ; coin_config cloud_ip_sante_controle) et règle « saines d'abord » du renouvellement
  // (planDuJour, coin_config cloud_ip_renouveler_saines_seulement). Colonne cloud_ips.sante (migration 20261107190000).
  santeIntervalleH: 20,        // une IP libre est recontrôlée au plus tard N h après son dernier contrôle (au moins une fois par 24 h)
  santeValiditeH: 36,          // un verdict « saine » vaut N h ; au-delà, la santé est INCONNUE (jamais comptée saine)
  santeConfirmationMin: 30,    // l'échec qui grille une IP est RELU par un 2e contrôle, au moins N min après le 1er (jamais un incident passager)
  santeRelanceMin: 120,        // un contrôle sans conclusion (page muette, sortie illisible) est refait après N min
  santeDecisionJours: 2,       // « saines d'abord » : sans preuve de santé à J-N, une IP libre n'est pas renouvelée
  santeChargeMax: 0.7,         // aucun contrôle quand la charge (1 min) dépasse 70 % des processeurs de l'hôte (pointe)
  santeAlerteRappelH: 6,       // « IP saines libres sous la marge » : un rappel au plus toutes les N h
  // (14/11, règle de Nico : « On ne jette JAMAIS une IP payée. Un contrôle sans réponse se retente (attente puis nouveaux
  // essais) ; une IP douteuse va en quarantaine et se recontrôle, jamais au rebut automatique ; si une IP reste vraiment
  // inutilisable, on le signale à Nico avec la preuve. ») LE CONTRÔLE D'ENTRÉE ET LA QUARANTAINE — section 4 bis.
  //   Le 04/11 (IP 42, 18 s après la livraison) et le 13/11 (IP 77, 4 min 46 après) : la page d'écho n'a rien rendu, l'IP
  //   est partie au rebut ; relues ensuite, les deux passaient (sortie = l'IP, FR).
  controleEntreeDelaiMin: 2,   // aucun contrôle d'entrée avant N min après la livraison (proxy pas encore actif : ~1 min, 04/11)
  controleLecturesMax: 3,      // un contrôle qui ne lit RIEN (écho vide) relit l'écho, jusqu'à N lectures en tout…
  controleLecturePauseS: 20,   // … à N s d'intervalle, dans le même navigateur (≤ 1 min de plus par contrôle)
  // Les recontrôles d'une IP en quarantaine, comptés depuis le dernier échec : 15 min (la livraison qui traîne), 1 h (un
  // incident passager du fournisseur ou de l'écho), 4 h, puis toutes les 12 h. Chaque recontrôle = UN navigateur jetable
  // (≈ 30 s), au plus 2 contrôles par entretien horaire : la charge reste bornée.
  quarantaineEspacementsMin: Object.freeze([15, 60, 240, 720]),
  quarantaineSignalEchecs: 4,  // signalée à Nico (support@, avec la preuve) après N contrôles ratés…
  quarantaineSignalH: 24,      // … étalés sur au moins N h (jamais sur un incident d'une nuit)
  quarantaineApresSignalH: 24, // signalée : encore un recontrôle par jour jusqu'à l'échéance (elle peut revenir) — jamais jetée
  quarantainePreuvesMax: 8,    // la preuve garde les N derniers contrôles (date, manques, sortie lue, pays)
  // (19/11/2026 ~14:00, décisions de Nico — achatSurDemande, remplacementADemander) : un achat seulement pour un client
  // qui attend VRAIMENT (inscrit sur la liste, ou essai de prendre l'option depuis moins de N heures) ; une IP refusée au
  // contrôle d'entrée N fois (≈ 1 h 15 : 15 min puis 1 h) fait demander son remplacement à IPRoyal.
  attenteVraieH: 24,
  remplacementEchecsEntree: 3,
  // (19/11/2026 soir, décision de Nico — migration 20261119230000) LE CONTRÔLE AVANT ATTRIBUTION : une IP n'est donnée à un
  // compte que contrôlée « saine » depuis moins de N minutes (coin_config cloud_controle_attribution_min), après sa dernière
  // libération et sa dernière livraison ; une IP TENUE n'est renouvelée qu'avec un contrôle de SORTIE (sans aucune page de
  // plateforme) fait dans les N jours avant son échéance, sans échec.
  controleAttributionMin: 60,
  renouvellementControleJours: 4,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE CYCLE DE VIE D'UNE IP
// ═══════════════════════════════════════════════════════════════════════════
//   achetee ─controle_ok─▶ disponible ─attribuer_essai─▶ attribuee_essai ─convertir─▶ attribuee_client
//      │                     ▲   └──attribuer_client──────────────────────────────────▶│
//      │                     │ sortir (repos fini + purge prouvée + contrôle frais)  │ liberer
//      ▼                     └──────────────────── repos ◀───────────────────────────┘
//   signaler (tout état vivant, à la main seulement depuis le 14/11) ──▶ rebut ──expirer──▶ expiree
//   repos ──reprendre──▶ attribuee_* (le MÊME compte revient)
//   (14/11) achetee ─controle_ko─▶ quarantaine ─controle_ok─▶ disponible ; quarantaine ─controle_ko─▶ quarantaine
//           (recontrôlée, jamais renouvelée, jamais attribuée ; elle expire à son terme si elle ne revient pas)
//   ⛔ une IP ATTRIBUÉE n'expire jamais sous son titulaire : transition interdite.
export const ETATS = Object.freeze(['achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'quarantaine', 'rebut', 'expiree']);
export const ETATS_ATTRIBUES = Object.freeze(['attribuee_essai', 'attribuee_client']);

const TRANSITIONS = Object.freeze({
  achetee:          { controle_ok: 'disponible', controle_ko: 'quarantaine', signaler: 'rebut', expirer: 'expiree', renouveler: 'achetee' },
  quarantaine:      { controle_ok: 'disponible', controle_ko: 'quarantaine', signaler: 'rebut', expirer: 'expiree' },
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

/** (14/11/2026, complément 3 de Nico) Les plateformes que le contrôle de santé regarde : celles qui passent RÉELLEMENT par
 *  l'IP du poste Cloud (= serveur-cloud/src/sante.js PLATEFORMES_SANTE). eBay n'y est plus : sa connexion se fait dans le
 *  navigateur du téléphone du client, ses publications et retraits par l'API eBay côté serveur, jamais par l'IP. */
export const PLATEFORMES_SANTE_CONTROLEES = Object.freeze(['vinted', 'leboncoin', 'beebs', 'depop']);
/** Un code d'échec (ou d'inconnu) de santé qui compte : la sortie (« sortie », « sortie:… ») ou une plateforme contrôlée. */
export const codeSanteCompte = (code) => { const c = String(code ?? ''); return c === 'sortie' || c.startsWith('sortie:') || PLATEFORMES_SANTE_CONTROLEES.includes(c.split(':')[0]); };

/** (07/11 soir, ordre 4 de Nico) Une IP GRILLÉE au contrôle de santé (un échec relu une 2e fois) : jamais donnée à un
 *  compte, jamais renouvelée, jamais comptée dans la marge ni dans la garde du nombre (= cloud_ips.sante ->> 'verdict').
 *  (14/11/2026, complément 3 de Nico) Plus définitive : elle est recontrôlée (quarantaineEspacementsMin : 15 min, 1 h, 4 h
 *  puis toutes les 12 h — choisirIpASonder) et revient au pool dès qu'un contrôle passe (santeSuivante). */
export function grillee(ip) {
  return ip?.sante != null && typeof ip.sante === 'object' && ip.sante.verdict === 'grillee';
}

/** (19/11/2026 soir, décision de Nico : « refuser hébergeur / proxy / autre pays que la France » ; « les IP 80, 81, 82, 88,
 *  89 ne sont jamais attribuées ni renouvelées ») Une IP GRILLÉE SUR SA SORTIE — l'échec relu porte un code de la sortie
 *  (hébergeur, proxy, pays : une propriété de l'adresse, pas un incident passager) — ne revient JAMAIS au pool : un contrôle
 *  qui passe ensuite ne la rend pas saine (santeSuivante). Elle n'est ni attribuée ni renouvelée : elle expire. Une IP
 *  grillée sur une PLATEFORME seulement (anti-robot) garde la règle du 14/11 (recontrôlée, elle revient dès qu'un contrôle
 *  passe). */
export const CODES_SORTIE_DEFINITIFS = Object.freeze(['sortie:hebergeur', 'sortie:proxy', 'sortie:pays']);
export function grilleeSurSortie(sante) {
  return sante != null && typeof sante === 'object' && sante.verdict === 'grillee'
    && (Array.isArray(sante.echecs) ? sante.echecs : []).some((c) => CODES_SORTIE_DEFINITIFS.includes(String(c)));
}

/**
 * (19/11/2026 soir, décision de Nico, migration 20261119230000) CONTRÔLÉE JUSTE AVANT L'ATTRIBUTION (pure, miroir de
 * cloud_ip_controlee_avant_attribution) : verdict « saine » dont le contrôle réussi (saine_le) date de moins de
 * controleAttributionMin minutes, et POSTÉRIEUR à la dernière libération (retour du repos) et à la dernière livraison
 * (achat neuf, adresse remplacée). Sans elle, aucune IP n'est donnée : le compte attend « une place se prépare » et
 * l'orchestrateur contrôle l'IP suivante (entretien.controlerAvantAttribution).
 */
export function controleeAvantAttribution(ip, maintenant = Date.now(), p = PARAMETRES) {
  const s = ip?.sante;
  if (!s || typeof s !== 'object' || s.verdict !== 'saine') return false;
  const sl = instant(s.saine_le);
  const now = instant(maintenant);
  if (sl == null || sl > now + 5 * 60_000 || sl < now - p.controleAttributionMin * 60_000) return false;
  const apres = Math.max(instant(ip.liberee_le) ?? -Infinity, instant(ip.livree_le) ?? -Infinity);
  return sl > apres;
}

/**
 * (07/11 soir, borne de Nico : « la 3 est donnée en dernier ») LE RANG DE L'OPÉRATEUR DE SORTIE (= cloud_ip_rang_operateur) :
 * 0 = AS enregistré en France, 1 = ailleurs en Europe (RIPE NCC), 2 = hors d'Europe — relevé par le contrôle de santé
 * (serveur-cloud/src/operateur.js) dans sante.operateur.rang ; inconnu = 1 (au milieu). Plus le rang est haut, plus l'IP
 * passe tard : à l'attribution (choisirIp) et parmi les saines gardées pour la marge (planDuJour, règle « saines »).
 */
export function rangOperateur(ip) {
  const r = ip?.sante?.operateur?.rang;
  return Number.isInteger(r) && r >= 0 && r <= 2 ? r : 1;
}
/** (07/11 soir) Une IP « atypique » : sortie connue, par un opérateur qui n'est pas français (rang 1 ou 2). Saine et attribuable, en dernier. */
export const operateurAtypique = (ip) => Number.isInteger(ip?.sante?.operateur?.rang) && ip.sante.operateur.rang > 0;

/** Cette IP peut-elle être donnée à ce compte, maintenant ? (= cloud_ip_attribuable) */
export function ipAttribuable(ip, { nature = 'essai', userId = null, maintenant = Date.now(), p = PARAMETRES } = {}) {
  const exp = instant(ip?.expire_le);
  if (exp == null || exp < couvertureJusqua({ nature, maintenant, p })) return false;
  if (grillee(ip)) return false;   // (07/11 soir) même au repos, même pour son dernier titulaire
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
 *     (FEFO), la moins usée à égalité.
 *  (07/11 soir) Au rang 2 : le refus PROUVÉ en dernier recours (inchangé), puis l'opérateur de sortie (rangOperateur :
 *  français, européen, hors d'Europe — l'IP atypique en dernier), puis sans refus d'abord. */
// (19/11/2026 soir, 20261119230000) `controleAvant: true` = cloud_ip_attribuer après la migration : seulement une IP
// contrôlée juste avant (controleeAvantAttribution), la sienne au repos comme une disponible ; sinon null.
export function choisirIp(ips, { nature = 'essai', userId = null, maintenant = Date.now(), p = PARAMETRES, controleAvant = false } = {}) {
  const liste0 = Array.isArray(ips) ? ips : [];
  if (userId != null) {
    const deja = liste0.find((ip) => ip.user_id === userId && ETATS_ATTRIBUES.includes(ip.etat));
    if (deja) return deja;
  }
  const liste = controleAvant ? liste0.filter((ip) => controleeAvantAttribution(ip, maintenant, p)) : liste0;
  const ctx = { nature, userId, maintenant, p };
  const siennes = liste.filter((ip) => ip.etat === 'repos' && ipAttribuable(ip, ctx))
    .sort((a, b) => instant(b.liberee_le) - instant(a.liberee_le));
  if (siennes.length) return siennes[0];
  // (03/11) Puis sans refus de plateforme d'abord, un refus non prouvé ensuite, un refus prouvé en dernier recours.
  // (07/11 soir) Entre les deux : l'opérateur de sortie — une IP atypique passe après toutes celles d'un opérateur
  // français (même ordre qu'avant pour le refus : prouvé en dernier, puis sans refus d'abord).
  const sansRefus = (ip) => !ip.refus || typeof ip.refus !== 'object' || Object.keys(ip.refus).length === 0;
  const dispo = liste.filter((ip) => ip.etat === 'disponible' && ipAttribuable(ip, ctx))
    .sort((a, b) => Number(b.reserve_pour === userId && userId != null) - Number(a.reserve_pour === userId && userId != null)
      || Number(refusProuve(a.refus)) - Number(refusProuve(b.refus))
      || rangOperateur(a) - rangOperateur(b)
      || Number(sansRefus(b)) - Number(sansRefus(a))
      || instant(a.expire_le) - instant(b.expire_le)
      || (a.attributions ?? 0) - (b.attributions ?? 0)
      || Number(a.id) - Number(b.id));
  return dispo[0] ?? null;
}

/**
 * (19/11/2026 soir, décision de Nico, 20261119230000) L'IP À CONTRÔLER POUR UN COMPTE QUI ATTEND (pure). `attendus` =
 * cloud_ip_attendus() ({ user_id, nature, reserve_ip }), payés et offerts d'abord. Pour le premier compte servable :
 *   · une IP déjà contrôlée juste avant lui irait → { raison: 'deja_controlee' } (l'orchestrateur le sert tout de suite) ;
 *   · sinon, dans l'ordre de cloud_ip_attribuer : SON IP au repos, SA réservation, puis les disponibles (refus prouvé en
 *     dernier, opérateur, sans refus, échéance, usure) — la première qui n'a pas été contrôlée depuis santeConfirmationMin
 *     sans réussir (« la 1re qui échoue → la suivante »), ni en usage, ni fermée par le pare-feu, ni grillée.
 * Rend { user_id, nature, ip, raison } ou null.
 */
export function ipAControlerAvantAttribution(ips, attendus, { maintenant = Date.now(), permise = () => true, enUsage = [], p = PARAMETRES } = {}) {
  const now = instant(maintenant);
  const liste = Array.isArray(ips) ? ips : [];
  const occupees = new Set((enUsage ?? []).map(Number));
  const tenteeSansSucces = (ip) => {
    const le = instant(ip?.sante?.le);
    return le != null && now - le < p.santeConfirmationMin * 60_000 && !controleeAvantAttribution(ip, now, p);
  };
  const controlable = (ip) => !occupees.has(Number(ip.id)) && permise(ip) && !grillee(ip) && !tenteeSansSucces(ip)
    && instant(ip.expire_le) - now >= HEURE_MS;
  for (const a of Array.isArray(attendus) ? attendus : []) {
    const userId = a?.user_id ?? null;
    if (!userId) continue;
    const nature = a.nature === 'client' ? 'client' : 'essai';
    const ctx = { nature, userId, maintenant: now, p };
    const prete = choisirIp(liste.filter((ip) => !ETATS_ATTRIBUES.includes(ip.etat)), { ...ctx, controleAvant: true });
    if (prete) return { user_id: userId, nature, ip: prete, raison: 'deja_controlee' };
    const siennes = liste.filter((ip) => ip.etat === 'repos' && ipAttribuable(ip, ctx))
      .sort((x, y) => instant(y.liberee_le) - instant(x.liberee_le));
    const sienne = siennes.find(controlable);
    if (sienne) return { user_id: userId, nature, ip: sienne, raison: 'son_ip_au_repos' };
    let reste = liste.filter((ip) => ip.etat === 'disponible' && ipAttribuable(ip, ctx));
    const res = a.reserve_ip != null ? reste.find((ip) => Number(ip.id) === Number(a.reserve_ip)) : null;
    if (res && controlable(res)) return { user_id: userId, nature, ip: res, raison: 'sa_reservation' };
    while (reste.length) {
      const x = choisirIp(reste, ctx);
      if (!x) break;
      if (controlable(x)) return { user_id: userId, nature, ip: x, raison: 'disponible' };
      reste = reste.filter((ip) => ip !== x);
    }
  }
  return null;
}

/**
 * (19/11/2026 soir, réponse de Nico : « avant de renouveler l'IP d'un client : contrôle seulement sa sortie (hébergeur,
 * proxy, pays) et les refus déjà prouvés, sans visiter les plateformes sur son IP ») LE CONTRÔLE DE RENOUVELLEMENT d'une
 * IP TENUE (pure). cloud_ips.controle_renouvellement = { fait_le, echecs: [codes « sortie:… »], inconnus: [« sortie »],
 * resume, premier_echec_le, confirme, controles } (cloud_ip_controle_renouvellement_noter).
 *   · valable : fait dans les renouvellementControleJours jours avant l'échéance, et depuis l'attribution ;
 *   · un échec ne compte qu'une fois RELU au moins santeConfirmationMin plus tard (jamais un incident passager d'ip-api :
 *     l'IP d'un client ne se perd pas sur une lecture).
 */
export function controleRenouvellementValable(ip, p = PARAMETRES) {
  const c = ip?.controle_renouvellement;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const fait = instant(c.fait_le);
  const exp = instant(ip.expire_le);
  if (fait == null || exp == null) return false;
  return fait >= exp - p.renouvellementControleJours * JOUR_MS && fait >= (instant(ip.attribuee_le) ?? -Infinity);
}
const codesSortie = (l) => [...new Set((Array.isArray(l) ? l : []).map(String).filter((c) => c === 'sortie' || c.startsWith('sortie:')))].sort();
/** Le contrôle à écrire après une lecture de sortie (pure) : `controle` = { fait_le, echecs, inconnus, resume } (sante.verifierSortie). */
export function controleRenouvellementSuivant(ip, controle, { p = PARAMETRES } = {}) {
  const a = controleRenouvellementValable(ip, p) ? ip.controle_renouvellement : null;
  const echecs = codesSortie(controle?.echecs).filter((c) => c !== 'sortie');
  const inconnus = codesSortie(controle?.inconnus);
  const t = instant(controle?.fait_le);
  let premier = null, confirme = false;
  if (echecs.length) {
    const communs = a ? echecs.filter((e) => codesSortie(a.echecs).includes(e)) : [];
    premier = communs.length ? (a.premier_echec_le ?? a.fait_le) : (controle?.fait_le ?? null);
    confirme = communs.length > 0 && (a.confirme === true || (t != null && instant(premier) != null && t - instant(premier) >= p.santeConfirmationMin * 60_000));
  } else if (inconnus.length && a && codesSortie(a.echecs).length) {
    // sans conclusion : l'échec d'avant reste à relire
    return { ...a, fait_le: controle?.fait_le ?? a.fait_le, inconnus, controles: (Number(a.controles) || 0) + 1 };
  }
  return { fait_le: controle?.fait_le ?? null, echecs, inconnus, resume: controle?.resume ?? null, premier_echec_le: premier, confirme,
    controles: (Number(a?.controles) || 0) + 1 };
}
/** Le verdict du renouvellement d'une IP tenue (pure) : 'refus_prouve', 'echec' (sortie relue en échec), 'ok', 'inconnu'
 *  (pas de contrôle valable, échec pas encore relu, sortie illisible : renouvelée comme avant — jamais couper un client sur
 *  un doute). */
export function verdictRenouvellement(ip, p = PARAMETRES) {
  if (refusProuve(ip?.refus)) return 'refus_prouve';
  if (!controleRenouvellementValable(ip, p)) return 'inconnu';
  const c = ip.controle_renouvellement;
  if (codesSortie(c.echecs).length && c.confirme === true) return 'echec';
  if (codesSortie(c.echecs).length || codesSortie(c.inconnus).length) return 'inconnu';
  return 'ok';
}
/** L'IP tenue dont le contrôle de sortie est dû (pure) : échéance dans renouvellementControleJours jours ; sans contrôle
 *  valable, ou un échec à relire (après santeConfirmationMin), ou une sortie illisible (après santeRelanceMin) ; l'échéance
 *  la plus proche d'abord. Rend { ip, raison } ou null. */
export function choisirSortieAControler(ips, { maintenant = Date.now(), permise = () => true, p = PARAMETRES } = {}) {
  const now = instant(maintenant);
  const dus = [];
  for (const ip of Array.isArray(ips) ? ips : []) {
    if (!ETATS_ATTRIBUES.includes(ip?.etat)) continue;
    const exp = instant(ip.expire_le);
    if (exp == null || exp <= now || exp - now > p.renouvellementControleJours * JOUR_MS || !permise(ip)) continue;
    let raison = null;
    if (!controleRenouvellementValable(ip, p)) raison = 'a_faire';
    else {
      const c = ip.controle_renouvellement;
      const depuis = now - instant(c.fait_le);
      if (codesSortie(c.echecs).length && c.confirme !== true && depuis >= p.santeConfirmationMin * 60_000) raison = 'echec_a_relire';
      else if (!codesSortie(c.echecs).length && codesSortie(c.inconnus).length && depuis >= p.santeRelanceMin * 60_000) raison = 'sans_conclusion';
    }
    if (raison) dus.push({ ip, raison });
  }
  dus.sort((a, b) => instant(a.ip.expire_le) - instant(b.ip.expire_le) || Number(a.ip.id) - Number(b.ip.id));
  return dus[0] ?? null;
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
// (19/11/2026) `profil` : { arretFinPeriode (profiles.cloud_arret_fin_periode), canal (profiles.cloud_canal) } — la grâce
// selon graceDeFinEssai (miroir de cloud_compte_synchroniser_pool, migration 20261119190000).
export function actionCompte({ etat, ip = null, profil = null, maintenant = Date.now(), p = PARAMETRES }) {
  const e = etat ?? {};
  if (e.actif === true) {
    if (!ip) return { action: 'attribuer', nature: e.etat === 'paye' ? 'client' : 'essai' };
    if (e.etat === 'paye' && ip.etat === 'attribuee_essai') return { action: 'convertir' };
    return { action: 'rien' };
  }
  if (!ip) return { action: 'rien' };
  const fin = instant(e.essaiFin);
  const grace = e.etat === 'essai_termine' && e.essaiArrete !== true ? graceDeFinEssai({ ip, profil, p }) : null;
  if (grace != null && fin != null && fin + grace > instant(maintenant)) return { action: 'grace' };
  return { action: 'repos' };
}

/**
 * (19/11/2026, demande de Nico) LA GRÂCE d'un essai fini, en ms (pure ; null = aucune) — un 1er paiement peut-il encore
 * arriver ? Renouvellement coupé (Apple, Google : gardé après l'expiration ; Stripe tant que l'abonnement vit) : non →
 * aucune. IP convertie (« attribuee_client ») : le compte a payé puis s'est arrêté (résilié, remboursé, impayé — règle du
 * 03/11) → aucune (décision de Nico du 19/11 : « pas de grâce pour un compte payé puis résilié »). Stripe, IP jamais
 * convertie : Stripe convertit à la fin même de l'essai (abonnement « active ») ; non converti = annulé (Stripe remet l'arrêt
 * programmé à faux en le terminant), sauf message en retard → graceStripeHeures. Sinon (essai Apple ou Google non coupé qui
 * attend son 1er paiement) → graceJours.
 */
export function graceDeFinEssai({ ip, profil = null, p = PARAMETRES }) {
  if (profil?.arretFinPeriode === true) return null;
  if (ip?.etat === 'attribuee_client') return null;
  if (profil?.canal === 'stripe') return p.graceStripeHeures * HEURE_MS;
  return p.graceJours * JOUR_MS;
}

/**
 * (19/11/2026, remplacement gratuit par IPRoyal des IP 80, 81, 82) LES ADRESSES REMPLACÉES d'une commande IPRoyal (pure) :
 * `ips` = nos lignes de CETTE commande, `proxies` = proxiesLivres(commande relue chez IPRoyal). Une adresse à nous absente
 * de la commande + une adresse de la commande absente chez nous = un remplacement, appariés dans l'ordre (id ; adresse).
 * Commande lue sans aucune adresse (lecture ratée) : rien. Rend { remplacer: [{ id, etat, nouvelle, port }], parties: [id],
 * neuves: [adresse] } — `parties` / `neuves` : le surplus non apparié (dit, jamais deviné).
 */
export function remplacementsDeCommande({ ips, proxies }) {
  const adr = (x) => String(x ?? '').replace(/\/32$/, '');
  const nos = (Array.isArray(ips) ? ips : []).filter((i) => i?.ip && !['expiree', 'rebut'].includes(i.etat));
  const livrees = (Array.isArray(proxies) ? proxies : []).filter((x) => x?.ip);
  if (!livrees.length) return { remplacer: [], parties: [], neuves: [] };
  const chezIproyal = new Set(livrees.map((x) => adr(x.ip)));
  const chezNous = new Set(nos.map((i) => adr(i.ip)));
  const parties = nos.filter((i) => !chezIproyal.has(adr(i.ip))).sort((a, b) => Number(a.id) - Number(b.id));
  const neuves = livrees.filter((x) => !chezNous.has(adr(x.ip))).sort((a, b) => adr(a.ip).localeCompare(adr(b.ip)));
  const n = Math.min(parties.length, neuves.length);
  return { remplacer: parties.slice(0, n).map((i, k) => ({ id: i.id, etat: i.etat, nouvelle: adr(neuves[k].ip), port: neuves[k].port ?? null })),
    parties: parties.slice(n).map((i) => i.id), neuves: neuves.slice(n).map((x) => adr(x.ip)) };
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

// ═══════════════════════════════════════════════════════════════════════════
// 4 bis. (14/11, règle de Nico) LE CONTRÔLE D'ENTRÉE QUI SE RETENTE ET LA QUARANTAINE — jamais le rebut automatique
// ═══════════════════════════════════════════════════════════════════════════
//   « On ne jette JAMAIS une IP payée. Un contrôle sans réponse se retente (attente puis nouveaux essais) ; une IP
//   douteuse va en quarantaine et se recontrôle, jamais au rebut automatique ; si une IP reste vraiment inutilisable, on
//   le signale à Nico avec la preuve. »
//   · ATTENTE : aucun contrôle d'entrée avant controleEntreeDelaiMin après la livraison (entreeControlable) ;
//   · NOUVEAUX ESSAIS : un contrôle qui ne lit rien relit l'écho (controleLecturesMax, controle.js) ;
//   · QUARANTAINE (état « quarantaine », colonne cloud_ips.quarantaine, migration 20261114090000) : une IP dont le contrôle
//     reste douteux (sortie illisible ou autre, pays, liste noire) n'est ni attribuée, ni renouvelée, ni jetée ; elle est
//     recontrôlée (quarantaineSuivante : 15 min, 1 h, 4 h, puis 12 h) et rejoint le pool dès qu'un contrôle passe ;
//   · SIGNALEMENT : après quarantaineSignalEchecs contrôles ratés étalés sur quarantaineSignalH heures, UNE alerte à Nico
//     (support@) avec la preuve (quarantaineASignaler, texteSignalementQuarantaine) ; elle reste en quarantaine, recontrôlée
//     une fois par jour jusqu'à son échéance.

/** Le contrôle n'a RIEN lu (pure) : ni IP de sortie, ni pays — l'écho n'a pas répondu (proxy pas encore actif, coupure). */
export const controleSansReponse = (c) => !c || typeof c !== 'object' || (!nonVide(c.ip_sortie) && !nonVide(c.pays));

/** (pure) Une IP achetée peut-elle passer son contrôle d'entrée ? Pas avant controleEntreeDelaiMin après sa livraison. */
export function entreeControlable(ip, maintenant = Date.now(), p = PARAMETRES) {
  if (ip?.etat !== 'achetee') return false;
  const livree = instant(ip.livree_le ?? ip.cree_le);
  return livree == null || instant(maintenant) - livree >= p.controleEntreeDelaiMin * 60_000;
}

/** (pure) Le prochain recontrôle après le n-ième échec (n ≥ 1) : 15 min, 1 h, 4 h, puis toutes les 12 h ; 24 h une fois signalée. */
export function quarantaineEspacementMs(n, { signalee = false, p = PARAMETRES } = {}) {
  if (signalee) return p.quarantaineApresSignalH * HEURE_MS;
  const e = p.quarantaineEspacementsMin;
  return e[Math.min(Math.max(1, Math.floor(Number(n) || 1)), e.length) - 1] * 60_000;
}

/**
 * (pure) LA QUARANTAINE APRÈS UN CONTRÔLE RATÉ — écrite par cloud_ip_quarantaine_noter. `avant` : la quarantaine
 * d'avant (null à l'entrée) ; `controle` : le relevé (controle.js) ; `manques` : les codes de manquesControle.
 * { version, origine, depuis, essais, premier_echec_le, dernier: { le, manques, ip_sortie, pays, listes_noires, lectures },
 *   preuves: [les quarantainePreuvesMax derniers], prochain_le, signalee_le }
 */
export function quarantaineSuivante(avant, controle, { manques = [], origine = 'controle_entree', maintenant = Date.now(), p = PARAMETRES } = {}) {
  const a = avant && typeof avant === 'object' && !Array.isArray(avant) ? avant : null;
  const now = instant(maintenant);
  const le = new Date(instant(controle?.fait_le) ?? now).toISOString();
  const essais = (Number(a?.essais) || 0) + 1;
  const preuve = { le, manques: [...new Set((manques ?? []).map(String))],
    ip_sortie: controle?.ip_sortie ?? null, pays: controle?.pays ?? null,
    listes_noires: Array.isArray(controle?.listes_noires) ? controle.listes_noires : null,
    ...(Number.isFinite(Number(controle?.lectures)) ? { lectures: Number(controle.lectures) } : {}) };
  const preuves = [...(Array.isArray(a?.preuves) ? a.preuves : []), preuve].slice(-p.quarantainePreuvesMax);
  const signaleeLe = a?.signalee_le ?? null;
  return { version: 1, origine: a?.origine ?? origine, depuis: a?.depuis ?? le, essais,
    premier_echec_le: a?.premier_echec_le ?? le, dernier: preuve, preuves,
    prochain_le: new Date(now + quarantaineEspacementMs(essais, { signalee: Boolean(signaleeLe), p })).toISOString(),
    signalee_le: signaleeLe };
}

/** (pure) Faut-il signaler à Nico ? N contrôles ratés étalés sur au moins N heures, jamais deux fois. */
export function quarantaineASignaler(q, p = PARAMETRES) {
  if (!q || typeof q !== 'object' || q.signalee_le) return false;
  const debut = instant(q.premier_echec_le), fin = instant(q.dernier?.le);
  return (Number(q.essais) || 0) >= p.quarantaineSignalEchecs && debut != null && fin != null
    && fin - debut >= p.quarantaineSignalH * HEURE_MS;
}

/** (pure) Une IP en quarantaine déjà signalée à Nico (elle ne compte plus « en route » pour le stock). */
export const quarantaineSignalee = (ip) => ip?.etat === 'quarantaine' && Boolean(ip?.quarantaine?.signalee_le);

/**
 * (pure) L'IP EN QUARANTAINE À RECONTRÔLER MAINTENANT, ou null : recontrôle dû (prochain_le passé ; illisible = dû), sortie
 * ouverte par le pare-feu (`permise`), échéance à plus d'une heure. La plus en retard d'abord.
 */
export function choisirQuarantaineARecontroler(ips, { maintenant = Date.now(), permise = () => true } = {}) {
  const now = instant(maintenant);
  const dues = (Array.isArray(ips) ? ips : []).filter((ip) => ip?.etat === 'quarantaine' && ip.user_id == null
    && instant(ip.expire_le) != null && instant(ip.expire_le) - now >= HEURE_MS && permise(ip)
    && (instant(ip.quarantaine?.prochain_le) ?? -Infinity) <= now);
  dues.sort((a, b) => (instant(a.quarantaine?.prochain_le) ?? -Infinity) - (instant(b.quarantaine?.prochain_le) ?? -Infinity)
    || Number(a.id) - Number(b.id));
  return dues[0] ?? null;
}

/** (pure) L'heure de Paris d'un instant, pour les textes à Nico (« 13/11/2026 13:22 »). */
const heureParis = (t) => (instant(t) == null ? '?' : new Date(instant(t)).toLocaleString('fr-FR', { timeZone: 'Europe/Paris',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));

/** (pure) Le texte du signalement à Nico : l'IP, sa commande, son échéance payée, et la PREUVE (chaque contrôle raté). */
export function texteSignalementQuarantaine(ip, q) {
  const lignes = (q?.preuves ?? []).map((x) => `${heureParis(x.le)} : ${x.manques?.length ? x.manques.join(', ') : '?'}`
    + ` (sortie lue ${x.ip_sortie ?? 'aucune'}, pays ${x.pays ?? 'aucun'}${x.lectures ? `, ${x.lectures} lecture(s)` : ''})`);
  return `IP ${ip?.id} (${ip?.ip}, commande IPRoyal ${ip?.commande ?? '?'}, payée jusqu'au ${heureParis(ip?.expire_le)}) TOUJOURS INUTILISABLE : `
    + `${q?.essais ?? '?'} contrôles ratés du ${heureParis(q?.premier_echec_le)} au ${heureParis(q?.dernier?.le)} (heure de Paris). `
    + `Preuve — ${lignes.join(' ; ')}. Elle reste en QUARANTAINE (jamais jetée) : ni attribuée ni renouvelée, recontrôlée une fois par jour `
    + `jusqu'à son échéance ; elle rejoint le pool d'elle-même si un contrôle passe. À voir avec IPRoyal (remplacement de l'IP).`;
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
// (03/11, point 2 de Nico) Ces deux critères visent UNE plateforme : cloud_ip_signaler note un REFUS sur elle (non
// prouvé, levé ou prouvé par une visite de contrôle), jamais le rebut. Les autres restent des rebuts globaux.
export const CRITERES_PAR_PLATEFORME = Object.freeze(['blocage_anti_robot', 'captcha_repete']);
export const effetSignalement = (critere) => (CRITERES_PAR_PLATEFORME.includes(critere) ? 'refus_plateforme' : 'rebut');

/**
 * (03/11, point 2 de Nico ; 07/11, décision 2 : plus de plafond en dollars) UNE DÉPENSE IPRoyal (achat ou prolongation)
 * PART-ELLE ? (pure — miroir de cloud_ip_depense_ouvrir, plus la garde du serveur et le solde). Dans cet ordre :
 *   prix_illisible · achats_coupes_serveur (IPROYAL_ACHATS_AUTORISES) · interrupteur_coupe (coin_config) ·
 *   garde_illisible / garde_nombre (ACHAT seulement : `garde` = gardeNombre ; une prolongation ne passe jamais `garde`) ·
 *   prolongation_recente (PROLONGATION seulement : `dejaProlongee` vrai, voir prolongationRecente) ·
 *   solde_insuffisant · ok.
 * (10/11 soir, ordre de Nico) Les IP se paient par le SOLDE IPRoyal, JAMAIS par carte (la banque refuse IPRoyal) : le
 * solde borne TOUTE dépense (l'ancien argument `paiement: 'carte'` n'est plus lu).
 */
export function deciderDepense({ montantUsd, envAutorise = false, interrupteur = false, garde = undefined, dejaProlongee = false,
  rebutsEntree = 0, soldeUsd = null, p = PARAMETRES }) {
  const m = Number(montantUsd);
  if (!Number.isFinite(m) || m <= 0) return { faire: false, raison: 'prix_illisible' };
  if (envAutorise !== true) return { faire: false, raison: 'achats_coupes_serveur' };
  if (interrupteur !== true) return { faire: false, raison: 'interrupteur_coupe' };
  if (garde !== undefined) {
    if (!garde || !Number.isFinite(Number(garde.comptees)) || !Number.isFinite(Number(garde.borne))) return { faire: false, raison: 'garde_illisible' };
    if (garde.ok !== true) return { faire: false, raison: 'garde_nombre' };
    // (07/11) Le rebut n'entre pas dans la garde : une série d'IP livrées puis refusées au contrôle d'entrée (achat →
    // rebut → rachat) la contournerait. Au-delà de ipRebutsEntreeMax en 24 h, l'achat automatique se suspend (dit).
    if ((Number(rebutsEntree) || 0) >= p.ipRebutsEntreeMax) return { faire: false, raison: 'rebuts_controle' };
  }
  if (dejaProlongee === true) return { faire: false, raison: 'prolongation_recente' };
  if (!Number.isFinite(Number(soldeUsd)) || Number(soldeUsd) + 1e-9 < m) return { faire: false, raison: 'solde_insuffisant' };
  return { faire: true, raison: 'ok' };
}

/**
 * (07/11, décision 2 de Nico) LA GARDE DU NOMBRE — la seule garde de l'achat (pure ; miroir EXACT de
 * cloud_ip_garde_nombre, appelée par cloud_ip_depense_ouvrir sous le verrou de la dépense) :
 *   comptées = IP attribuées (essai, client)
 *            + IP du pool (achetee, disponible) qui COUVRENT un essai (≥ 7 + grâce + marge d'expiration jours de vie),
 *              non usées (attributions < attributions_max), sans refus PROUVÉ, (07/11 soir) jamais GRILLÉES
 *            + IP en commande (achats « demandee » / « en_cours ») + IP demandées ;
 *   borne    = comptes Cloud (actifs, ou titulaires d'une IP — la grâce) + marge + personnes en attente.
 * Elle compte un SOUS-ENSEMBLE de ce que compte planDuJour (jamais le repos, jamais une IP qui expire bientôt) : un achat
 * que le plan demande (vise = marge + attente) passe toujours ; seule une boucle (IP ou commandes qui s'empilent) bute.
 * Jamais sur une prolongation (une IP gardée n'ajoute rien). `comptesSansPlace` = cloud_pool_etat.comptes_sans_place
 * (comptes actifs sans IP) : comptes = titulaires distincts + comptes sans place.
 */
export function gardeNombre({ ips, comptesSansPlace, enAttente = 0, enCommande = 0, quantite = 0, marge = PARAMETRES.ipMarge,
  maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const liste = Array.isArray(ips) ? ips : [];
  const couverture = (ESSAI_JOURS + p.graceJours + p.margeExpirationJours) * JOUR_MS;
  const entier = (v) => Math.max(0, Math.floor(Number(v) || 0));
  // (16/11, 20261116220000) Une IP libre ne compte que si elle est en route (« achetee ») ou ATTRIBUABLE à un nouveau
  // compte (ipAttribuable, = cloud_ip_attribuable(i, NULL, 'essai')) : une IP réservée à quelqu'un d'autre ne compte plus
  // (la 3 et la 39 le 16/11 : « Complet » affiché, rachat refusé par cette garde).
  const vivantes = liste.filter((ip) => ETATS_ATTRIBUES.includes(ip.etat)
    || (ip.etat === 'achetee' && instant(ip.expire_le) != null && instant(ip.expire_le) - now >= couverture
      && (ip.attributions ?? 0) < p.attributionsMax && !refusProuve(ip.refus) && !grillee(ip))
    || (ip.etat === 'disponible' && ipAttribuable(ip, { nature: 'essai', userId: null, maintenant: now, p }) && !refusProuve(ip.refus))).length;
  const titulaires = new Set(liste.filter((ip) => ip.user_id != null && ETATS_ATTRIBUES.includes(ip.etat)).map((ip) => String(ip.user_id))).size;
  const sansPlace = comptesSansPlace == null || comptesSansPlace === '' ? NaN : Number(comptesSansPlace);
  if (!Number.isFinite(sansPlace) || sansPlace < 0) return null;   // illisible : l'achat est refusé (garde_illisible)
  const r = { vivantes, en_commande: entier(enCommande), comptes: titulaires + Math.floor(sansPlace), marge: entier(marge), attente: entier(enAttente) };
  return gardePour(r, quantite);
}
/** (07/11) Les IP envoyées au rebut par le CONTRÔLE D'ENTRÉE dans les `heures` dernières heures (pure).
 *  (14/11) Plus de rebut automatique : ce sont désormais les IP mises en QUARANTAINE au contrôle d'entrée dans ces heures
 *  (toujours en quarantaine) — la même garde contre la boucle achat → refus → rachat ; un ancien rebut d'entrée compte encore. */
export function rebutsEntreeRecents(ips, maintenant = Date.now(), heures = 24) {
  const now = instant(maintenant);
  const recent = (t) => instant(t) != null && now - instant(t) <= heures * HEURE_MS;
  return (Array.isArray(ips) ? ips : []).filter((ip) => (ip?.rebut_critere === 'controle_entree' && recent(ip.rebut_le))
    || (ip?.etat === 'quarantaine' && ip.quarantaine?.origine === 'controle_entree' && recent(ip.quarantaine?.depuis))).length;
}

/** La même garde pour `quantite` IP demandées (pure) : comptées, borne, ok. */
export function gardePour(g, quantite) {
  if (!g) return null;
  const demandees = Math.max(0, Math.floor(Number(quantite) || 0));
  const comptees = g.vivantes + g.en_commande + demandees;
  const borne = g.comptes + g.marge + g.attente;
  return { ...g, demandees, comptees, borne, ok: comptees <= borne };
}

/**
 * (07/11) ANTI-BOUCLE DES PROLONGATIONS (pure ; miroir de cloud_ip_depense_ouvrir) : la même commande IPRoyal (ou la même
 * IP) déjà prolongée — dépense non échouée — depuis moins de `jours` jours. Une prolongation ajoute 30 jours et la
 * suivante se décide au plus tôt 10 jours avant l'échéance : jamais deux en 15 jours, sauf une boucle.
 */
export function prolongationRecente({ registre, commande, ip = null, maintenant = Date.now(), jours = PARAMETRES.ipProlongationEspacementJours }) {
  const now = instant(maintenant);
  return (Array.isArray(registre) ? registre : []).some((d) => d?.nature === 'prolongation' && !['echec', 'remboursee'].includes(d.statut)
    && instant(d.demandee_le) != null && instant(d.demandee_le) > now - jours * JOUR_MS
    && ((commande != null && String(d.details?.commande ?? '') === String(commande)) || (ip != null && Number(d.ip_id) === Number(ip))));
}

/**
 * (07/11, décision 3 de Nico) LE SEUIL DU SOLDE IPRoyal = la dépense prévue sur `horizon` jours au rythme réel (pure) :
 *   renouvellements : les IP attribuées qui échoient dans l'horizon + les IP du stock renouvelables qui échoient dans
 *                     l'horizon, au plus (marge + attente) — le plan ne renouvelle le stock que jusqu'à sa cible ;
 *   achats          : le rythme des 30 derniers jours (IP achetées, dépenses non échouées) ramené à l'horizon, jamais moins
 *                     que la marge ;
 *   seuil = (renouvellements + achats) × prix d'une IP. `registre` = lignes de cloud_ip_commandes.
 */
// (19/11/2026, demande de Nico) `titulaires` (cloud_ip_titulaires, comme planDuJour) : une IP attribuée dont le compte
// finit avant son échéance n'est pas renouvelée, donc pas comptée (le 19/11 : « 3 IP de client(s) … 12.00 $ » pour UNE due —
// les 2 autres étaient des essais finis) ; sans eux (lecture ratée), toutes comptent, comme avant. `achatsRythme` : les IP
// neuves au rythme réel des 30 derniers jours, sans le plancher de la marge — les nouveaux clients que le solde doit couvrir
// (alertes-nico.js, couvertureSolde : clients refusés, montant à recharger).
export function seuilSoldeProjete({ ips, registre = [], marge = PARAMETRES.ipMarge, enAttente = 0, prixIpUsd, maintenant = Date.now(),
  horizonJours = PARAMETRES.soldeHorizonJours, titulaires = null, p = PARAMETRES }) {
  const now = instant(maintenant);
  const limite = now + horizonJours * JOUR_MS;
  const liste = Array.isArray(ips) ? ips : [];
  const echoit = (ip) => instant(ip.expire_le) != null && instant(ip.expire_le) > now && instant(ip.expire_le) <= limite;
  const attribuees = liste.filter((ip) => ETATS_ATTRIBUES.includes(ip.etat) && echoit(ip)
    && !titulaireFiniAvant(titulaireDe(titulaires, ip), ip.expire_le)).length;
  const stock = liste.filter((ip) => ['achetee', 'disponible', 'repos'].includes(ip.etat) && echoit(ip)
    && (ip.attributions ?? 0) < p.attributionsMax && !refusProuve(ip.refus) && !grillee(ip) && !refusee(ip.refus)).length;
  const cible = Math.max(0, Math.floor(Number(marge) || 0)) + Math.max(0, Math.floor(Number(enAttente) || 0));
  const renouvellements = attribuees + Math.min(stock, cible);
  const achetees30 = (Array.isArray(registre) ? registre : []).filter((d) => d?.nature === 'achat' && !['echec', 'remboursee'].includes(d.statut)
    && instant(d.demandee_le) != null && instant(d.demandee_le) > now - 30 * JOUR_MS).reduce((n, d) => n + (Number(d.quantite) || 0), 0);
  const achatsRythme = plafond((achetees30 * horizonJours) / 30);
  const achats = Math.max(achatsRythme, Math.max(0, Math.floor(Number(marge) || 0)));
  const prix = Number(prixIpUsd) > 0 ? Number(prixIpUsd) : p.prixIpUsd30j;
  // (14/11, complément 3 point 2 de Nico) attribuees : les IP de CLIENTS qui échoient dans l'horizon — le seul solde dont le
  // manque fait partir un mail (_shared/alertes-nico.js, alerteSolde).
  return { seuilUsd: r2((renouvellements + achats) * prix), renouvellements, achats, achatsRythme, prixIpUsd: prix, horizonJours, attribuees };
}

// ═══════════════════════════════════════════════════════════════════════════
// (19/11/2026 ~14:00, décisions de Nico après la coupure du rachat à 13:17) L'ACHAT SUR DEMANDE ET LE REMPLACEMENT
// ═══════════════════════════════════════════════════════════════════════════
//   (1) une IP refusée au contrôle d'entrée, ou grillée / suspecte hébergeur-proxy-pays, fait demander SEULE son
//       remplacement à IPRoyal — l'API n'a AUCUN point de remplacement (docs ISP lues le 19/11 : orders, extend,
//       toggle-auto-extend, calculate-pricing, change-credentials, availability) : un mail à Nico avec le texte prêt pour
//       le support ; (2) JAMAIS un rachat pour remplacer une IP mauvaise ; (3) au plus UN achat à la fois : le suivant
//       attend le contrôle d'entrée du précédent ; (4) un achat ne part que si un client attend VRAIMENT une place sans IP
//       saine libre — plus aucune marge achetée d'avance (cloud_ip_marge ne reste que le jeu de la garde du nombre).

/**
 * LA VRAIE ATTENTE (pure) : les lignes de cloud_attente d'une personne qui attend VRAIMENT une place — inscrite sur la
 * liste, ou qui a essayé de prendre l'option depuis moins de attenteVraieH heures — sauf une place offerte il y a plus de
 * 24 h sans retour (elle ne l'a pas prise). Lignes : { inscrit_le, notifie_le, derniere_le, demande_le }.
 */
export function attenteVraie(lignes, maintenant = Date.now(), p = PARAMETRES) {
  const now = instant(maintenant);
  return (Array.isArray(lignes) ? lignes : []).filter((a) => {
    const derniere = instant(a?.derniere_le ?? a?.demande_le);
    const notifie = instant(a?.notifie_le);
    if (notifie != null && now - notifie > 24 * HEURE_MS && (derniere == null || derniere <= notifie)) return false;
    return a?.inscrit_le != null || (derniere != null && now - derniere <= p.attenteVraieH * HEURE_MS);
  }).length;
}

/** (pure) Une IP jamais contrôlée par la santé (livrée, entrée passée, pas encore jugée) : elle sera jugée dans les minutes. */
const jamaisJugee = (ip) => !ip?.sante || typeof ip.sante !== 'object' || ip.sante.le == null;

/**
 * L'ACHAT SUR DEMANDE (pure) — règles (2), (3), (4) :
 *   demande = vraie attente (attenteVraie) + comptes Cloud actifs sans IP ;
 *   offre   = IP « disponible » attribuables à un nouveau compte, sans refus prouvé, SAINES ou pas encore jugées (une IP
 *             livrée qui vient de passer l'entrée : jamais un 2e achat avant son verdict) ;
 *   enRoute = commandes en cours + IP achetées (contrôle d'entrée à venir).
 * aCommander : 1 si demande > offre et rien n'est en route ; sinon 0 (raison dite). Une IP grillée, suspecte ou en
 * quarantaine n'est ni de l'offre ni une demande : elle ne fait jamais racheter (son remplacement se demande à IPRoyal).
 */
export function achatSurDemande({ ips, attente = 0, comptesSansPlace = 0, commandesEnCours = 0, maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const entier = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const liste = Array.isArray(ips) ? ips : [];
  const demande = entier(attente) + entier(comptesSansPlace);
  const offre = liste.filter((ip) => ip.etat === 'disponible' && ipAttribuable(ip, { nature: 'essai', userId: null, maintenant: now, p })
    && !refusProuve(ip.refus) && (santeConnue(ip, now, p) === 'saine' || jamaisJugee(ip))).length;
  const enRoute = entier(commandesEnCours) + liste.filter((ip) => ip.etat === 'achetee').length;
  const r = { demande, offre, enRoute };
  if (demande <= offre) return { aCommander: 0, raison: demande ? 'offre_suffisante' : 'aucune_demande', ...r };
  if (enRoute > 0) return { aCommander: 0, raison: 'achat_en_route', ...r };
  return { aCommander: 1, raison: 'client_sans_ip_saine', ...r };
}

/** (19/11/2026) Les échecs de sortie qui font demander un remplacement : l'IP n'est pas une IP française d'opérateur. */
export const CODES_REMPLACEMENT = Object.freeze(['sortie:hebergeur', 'sortie:proxy', 'sortie:pays']);

/**
 * (19/11/2026, règle (1) de Nico) CETTE IP EST-ELLE DÉFECTUEUSE (à remplacer) ? (pure) null, ou
 * { motif, codes, cle } : motif 'sortie' (santé suspecte ou grillée sur un code de CODES_REMPLACEMENT : hébergeur, proxy,
 * pays — des classements de la sortie, pas un incident passager), ou 'controle_entree' (quarantaine née au contrôle
 * d'entrée, au moins remplacementEchecsEntree contrôles ratés). `cle` : une par adresse et par défaut (notée une fois au
 * journal ; une adresse neuve mauvaise à son tour est notée à nouveau). (19/11/2026 soir, décision de Nico) Plus aucun mail
 * « texte à coller au support » : l'IP reste hors du pool, sans intervention humaine.
 */
export function remplacementADemander(ip, p = PARAMETRES) {
  if (!ip || ip.user_id != null || ['attribuee_essai', 'attribuee_client', 'expiree', 'rebut'].includes(ip.etat)) return null;
  const s = ip.sante && typeof ip.sante === 'object' ? ip.sante : null;
  const codes = [...new Set([...(Array.isArray(s?.echecs) ? s.echecs : []), ...(Array.isArray(s?.dernier?.echecs) ? s.dernier.echecs : [])])]
    .filter((c) => CODES_REMPLACEMENT.includes(c)).sort();
  if (s && ['suspecte', 'grillee'].includes(s.verdict) && codes.length) {
    return { motif: 'sortie', codes, cle: `${ip.id}:${s.suspecte_le ?? s.grillee_le ?? s.le ?? '?'}` };
  }
  const q = ip.quarantaine && typeof ip.quarantaine === 'object' ? ip.quarantaine : null;
  if (ip.etat === 'quarantaine' && q?.origine === 'controle_entree' && (Number(q.essais) || 0) >= p.remplacementEchecsEntree) {
    return { motif: 'controle_entree', codes: [], cle: `${ip.id}:q:${q.depuis ?? '?'}` };
  }
  return null;
}

/** (19/11/2026) Le titulaire d'une IP dans `titulaires` (Map ou objet, clé = id de l'IP) : { actif, fin } ou null (pure). */
export function titulaireDe(titulaires, ip) {
  if (!titulaires || ip?.id == null) return null;
  const t = typeof titulaires.get === 'function' ? (titulaires.get(Number(ip.id)) ?? titulaires.get(String(ip.id))) : titulaires[ip.id];
  return t && typeof t === 'object' ? t : null;
}

/**
 * (19/11/2026, demande de Nico : « une IP n'est renouvelée que si elle sert à un client actif ou à un essai en cours à sa
 * date d'échéance ») Le compte titulaire est-il FINI à l'échéance `expireLe` ? (pure) Oui : inactif (résilié, essai fini,
 * supprimé), ou une fin connue (arrêt programmé, essai au renouvellement coupé) au plus tard à l'échéance. Titulaire
 * inconnu (lecture ratée) ou sans fin connue : non — dans le doute, l'IP d'un client se renouvelle.
 */
export function titulaireFiniAvant(t, expireLe) {
  if (!t || typeof t !== 'object') return false;
  if (t.actif === false) return true;
  const fin = instant(t.fin ?? t.fin_connue ?? null);
  const exp = instant(expireLe);
  return fin != null && exp != null && fin <= exp;
}

/** (07/11) Le prix d'UNE IP pour 30 jours lu au registre (la dernière dépense non échouée, prix / quantité), ou null. */
export function prixIpDuRegistre(registre) {
  const l = (Array.isArray(registre) ? registre : []).filter((d) => !['echec', 'remboursee'].includes(d?.statut) && Number(d?.prix_usd) > 0 && Number(d?.quantite) > 0)
    .sort((a, b) => (instant(b.demandee_le) ?? 0) - (instant(a.demandee_le) ?? 0))[0];
  return l ? r2(Number(l.prix_usd) / Number(l.quantite)) : null;
}

/** Le solde couvre-t-il la prochaine dépense ? (pure ; solde illisible = non) */
export const soldeCouvre = (soldeUsd, montantUsd) => Number.isFinite(Number(soldeUsd)) && Number.isFinite(Number(montantUsd))
  && Number(soldeUsd) + 1e-9 >= Number(montantUsd);

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
//   · ce qui manque est COMMANDÉ — ⛔ jamais sans le GO de Nico : (03/11) l'orchestrateur
//     n'achète et ne prolonge que sous ses gardes (IPROYAL_ACHATS_AUTORISES=1 sur le serveur,
//     coin_config cloud_ip_achats_auto / cloud_ip_renouvellement_auto = 1 ; (07/11) la garde du
//     NOMBRE pour un achat, l'anti-boucle pour une prolongation — deciderDepense) ; sinon
//     aCommander reste une proposition ;
//   · (07/11, décision 1) le stock visé = la MARGE (cloud_ip_marge) + les personnes en attente ;
//     une IP au refus PROUVÉ ne compte pas dans le stock.
//   · (04/11 soir, décision de Nico) une IP du pool au refus de plateforme NON prouvé sert encore
//     tant qu'elle vit, mais n'est plus jamais renouvelée ((19/11/2026) plus d'exception pour une IP
//     réservée : la 39 pendant l'essai GPU). Une IP attribuée reste renouvelée tant que son compte
//     vit à l'échéance (titulaireFiniAvant).
const PRETE = (ip, now, H) => ip.etat === 'achetee' || ip.etat === 'disponible'
  || (ip.etat === 'repos' && instant(ip.repos_fin) != null && instant(ip.repos_fin) <= now + H);

/** (03/11) Un refus PROUVÉ sur au moins une plateforme (= cloud_ip_refus_prouve) : l'IP n'est plus du stock sain. */
export function refusProuve(refus) {
  if (!refus || typeof refus !== 'object' || Array.isArray(refus)) return false;
  return Object.values(refus).some((r) => r?.prouvee === true);
}

/** (04/11 soir) Un refus d'au moins une plateforme, prouvé ou non (pure). */
export function refusee(refus) {
  return Boolean(refus) && typeof refus === 'object' && !Array.isArray(refus) && Object.keys(refus).length > 0;
}
/** (04/11 soir) Une IP réservée à un compte, réservation en cours (= cloud_ip_attribuable) (pure). */
export const reservee = (ip, now) => Boolean(ip?.reserve_pour)
  && (ip.reserve_jusqu_au == null || !(instant(ip.reserve_jusqu_au) < now));

/**
 * (07/11, décision 1 de Nico : « IP toujours d'avance ») Le stock visé = la MARGE (coin_config cloud_ip_marge, 3 au
 * départ) — des IP attribuables d'avance sur les comptes Cloud, chacun tenant déjà la sienne — plus une IP par personne
 * qui attend une place (un futur compte). Le seuil λ (seuils) ne fixe plus la cible d'achat : le réapprovisionnement
 * rapide (toutes les quelques minutes) remplace la sécurité d'un jour de délai ; il ne sert plus qu'à l'alerte
 * « presque vide ». Même cible que la borne de la garde du nombre (gardeNombre) : jamais un achat que la garde refuse.
 */
export function stockVise({ marge = PARAMETRES.ipMarge, enAttente = 0 } = {}) {
  return Math.max(0, Math.floor(Number(marge) || 0)) + Math.max(0, Math.floor(Number(enAttente) || 0));
}

/**
 * (07/11 soir, ordre 4 de Nico) LA SANTÉ CONNUE d'une IP (pure) : 'saine' (dernier contrôle complet passé depuis moins de
 * santeValiditeH heures), 'suspecte' (un échec vu, pas encore relu), 'grillee' (échec relu ; recontrôlée, revient dès qu'un
 * contrôle passe — 14/11), 'inconnue'
 * (jamais contrôlée, contrôle sans conclusion, ou « saine » trop ancienne).
 */
export function santeConnue(ip, maintenant = Date.now(), p = PARAMETRES) {
  const s = ip?.sante;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'inconnue';
  if (s.verdict === 'grillee') return 'grillee';
  if (s.verdict === 'suspecte') return 'suspecte';
  const sl = instant(s.saine_le);
  if (s.verdict === 'saine' && sl != null && sl <= instant(maintenant) + 5 * 60_000 && instant(maintenant) - sl <= p.santeValiditeH * HEURE_MS) return 'saine';
  return 'inconnue';
}

/** (07/11 soir) Un refus NON prouvé que la santé n'a pas encore contredit : noté APRÈS le dernier contrôle sain (pure). */
export function refusApresSante(ip) {
  const sl = instant(ip?.sante?.saine_le);
  if (!refusee(ip?.refus)) return false;
  return Object.values(ip.refus).some((r) => r?.prouvee !== true && (sl == null || instant(r?.le) == null || instant(r.le) > sl));
}

/**
 * `marge` : coin_config cloud_ip_marge ; `comptesSansPlace` : cloud_pool_etat.comptes_sans_place — avec lui, le plan
 * porte sa garde du nombre (`garde`, pour aCommander IP) ; sans lui, garde = null (l'achat automatique est alors refusé).
 *
 * (07/11 soir, ordre 3 de Nico : « IP en trop : ne renouvelle que jusqu'à (clients + marge), en gardant les SAINES en
 * priorité ») `sainesSeulement` (coin_config cloud_ip_renouveler_saines_seulement = 1, ET contrôle de santé allumé —
 * entretien.js) :
 *   · IP attribuées (essai, client) : renouvelées avant leur échéance — (19/11/2026, demande de Nico) SEULEMENT si leur
 *     compte vit encore à l'échéance (`titulaires`, cloud_ip_titulaires : titulaireFiniAvant) ; titulaires illisibles :
 *     renouvelées, comme avant (jamais couper un client sur un doute) ;
 *   · (19/11/2026) une IP RÉSERVÉE n'a plus de passe-droit (avant : « TOUJOURS renouvelée », pour la 39 gardée à Nico
 *     pendant l'essai GPU du 04/11) — une réservation dure 30 min ; elle suit la règle des IP libres ;
 *   · IP libres : seules les SAINES (santeConnue) sont renouvelées, les meilleures d'abord ((07/11 soir) l'opérateur de
 *     sortie — français, européen, hors d'Europe : une saine ATYPIQUE en dernier —, puis les moins usées, puis
 *     l'échéance la plus proche), jusqu'à ce que les libres saines vivantes = la marge + l'attente (le même stock visé
 *     que l'achat) ; une SAINE au refus non prouvé n'est renouvelée que si le contrôle sain est POSTÉRIEUR au refus ;
 *   · santé INCONNUE ou SUSPECTE : jamais comptée saine ; contrôlée en priorité (`aControler`) ; sans preuve de santé
 *     à J-santeDecisionJours (2), pas renouvelée — elle expire à son terme ;
 *   · une IP GRILLÉE n'est JAMAIS renouvelée (aussi hors de la règle) et ne compte jamais dans la marge.
 * L'ACHAT (aCommander) suit le même stock visé, compté comme la garde du nombre (toute IP libre vivante non grillée,
 * réservée comprise) : un achat que le plan demande passe toujours la garde — la marge se reconstitue seule quand
 * cloud_ip_achats_auto = 1. Sans `sainesSeulement`, le plan d'avant, à une ligne près : une IP grillée jamais renouvelée.
 * `santeDe(ip)` : la santé à juger (défaut santeConnue maintenant ; la projection la fige). `raisons` : id → la raison.
 * `titulaires` (19/11/2026) : Map id de l'IP → { actif, fin } (cloud_ip_titulaires, migration 20261119190000) ; absent =
 * toute IP attribuée se renouvelle, comme avant.
 */
export function planDuJour({ ips, lambda, enAttente = 0, commandesEnCours = 0, marge = PARAMETRES.ipMarge, comptesSansPlace = null,
  sainesSeulement = false, santeDe = null, titulaires = null, maintenant = Date.now(), p = PARAMETRES }) {
  const now = instant(maintenant);
  const s = seuils({ lambda, p });
  const H = (p.delaiAchatJours + p.periodeDecisionJours) * JOUR_MS;
  const N = p.renouvellementAvantJours * JOUR_MS;
  const couvertureEssai = (ESSAI_JOURS + p.graceJours + p.margeExpirationJours) * JOUR_MS;
  const vise = stockVise({ marge, enAttente });
  const regle = sainesSeulement === true;
  const sante = typeof santeDe === 'function' ? santeDe : (ip) => santeConnue(ip, now, p);
  let projete = Math.max(0, Math.floor(Number(commandesEnCours) || 0));
  let projeteSaines = projete;   // (règle « saines ») les IP en commande arrivent neuves : comptées
  let enQuarantaine = 0;         // (14/11) IP en quarantaine pas encore signalées : « en route » pour l'ACHAT seulement
  // (16/11, ordre URGENT de Nico) Les IP comptées vivantes (renouvellement) qui ne sont PAS attribuables à un nouveau compte
  // (réservées à quelqu'un d'autre, au repos) : elles ne comptent pas pour l'ACHAT — « Complet ne doit plus jamais
  // s'afficher tant qu'une IP peut être achetée ».
  let horsAchat = 0;
  const pourAchat = (ip) => ip.etat === 'achetee' || (ip.etat === 'disponible' && ipAttribuable(ip, { nature: 'essai', userId: null, maintenant: now, p }));
  const renouveler = [], laisserExpirer = [], attendre = [], candidats = [], aControler = [];
  const raisons = {};
  const dire = (liste, id, raison) => { liste.push(id); raisons[id] = raison; };
  for (const ip of Array.isArray(ips) ? ips : []) {
    const echeance = instant(ip.expire_le) - now;
    if (ip.etat === 'expiree') continue;
    if (ip.etat === 'rebut') { if (echeance <= N) dire(laisserExpirer, ip.id, 'rebut'); else raisons[ip.id] = 'rebut'; continue; }
    // (14/11, règle de Nico) Une IP en QUARANTAINE n'est jamais renouvelée (elle n'est pas utile tant qu'elle ne passe pas
    // son contrôle) ; tant qu'elle n'est pas signalée à Nico, elle est attendue au pool (recontrôlée) : elle compte « en
    // route » pour l'achat — jamais une IP rachetée dans la minute pour remplacer une IP payée qui va revenir (le 13/11,
    // l'IP 77 au rebut à 13:22:57, une autre achetée à 13:23:00). Elle ne compte JAMAIS pour renouveler une saine.
    if (ip.etat === 'quarantaine') {
      if (!quarantaineSignalee(ip) && echeance >= couvertureEssai && (ip.attributions ?? 0) < p.attributionsMax) enQuarantaine++;
      dire(echeance <= N ? laisserExpirer : attendre, ip.id, 'quarantaine');
      continue;
    }
    if (ETATS_ATTRIBUES.includes(ip.etat)) {
      // (19/11/2026, demande de Nico) Renouvelée seulement si son compte vit encore à l'échéance (titulaireFiniAvant) :
      // jamais pour un compte résilié, un essai fini (en grâce) ou un essai au renouvellement coupé qui finit avant. L'IP
      // reste à son titulaire jusqu'à sa libération (cloud_compte_synchroniser_pool), puis repos et stock.
      if (echeance <= N && titulaireFiniAvant(titulaireDe(titulaires, ip), ip.expire_le)) dire(laisserExpirer, ip.id, 'titulaire_fini');
      else if (echeance <= N && ['echec', 'refus_prouve'].includes(verdictRenouvellement(ip, p))) {
        // (19/11/2026 soir, réponse de Nico, 20261119230000) Avant le renouvellement d'une IP tenue : sa SORTIE seule
        // (relue en échec : hébergeur, proxy, pays, autre sortie) et ses refus PROUVÉS. Un échec : pas renouvelée — elle
        // expire et le client reçoit l'IP saine suivante, contrôlée juste avant (cloud_ip_attribuer).
        dire(laisserExpirer, ip.id, verdictRenouvellement(ip, p) === 'echec' ? 'sortie_echouee' : 'refus_prouve_titulaire');
      } else dire(echeance <= N ? renouveler : attendre, ip.id, 'attribuee');
      continue;
    }
    // achetee / disponible / repos : le pool
    const usee = (ip.attributions ?? 0) >= p.attributionsMax;
    const prete = PRETE(ip, now, H);
    const couvre = echeance >= couvertureEssai;
    // (03/11) Une IP au refus PROUVÉ (dernier recours) ne compte pas dans le stock ; elle n'est pas renouvelée pour lui.
    if (refusProuve(ip.refus)) { dire(echeance <= N ? laisserExpirer : attendre, ip.id, 'refus_prouve'); continue; }
    const grille = grillee(ip);
    if (regle) {
      // (07/11 soir) La règle « saines d'abord ». (19/11/2026) Une IP RÉSERVÉE n'a plus de passe-droit : elle suit la règle
      // des IP libres (une réservation dure 30 min ; la 39, réservée au compte de Nico jusqu'à son échéance alors qu'il tient
      // la 42, aurait été repayée le 30/11 — décision de Nico : une seule IP par compte).
      const res = reservee(ip, now);
      if (grille) { dire(echeance <= N ? laisserExpirer : attendre, ip.id, 'grillee'); continue; }
      const etatSante = sante(ip);
      if (prete && couvre && !usee) {
        projete++;
        if (!pourAchat(ip)) horsAchat++;
        if (!res && (etatSante === 'saine' || (ip.etat === 'achetee' && etatSante === 'inconnue'))) projeteSaines++;
        dire(attendre, ip.id, res ? 'reservee' : etatSante === 'saine' ? 'saine_vivante' : `${etatSante}_vivante`);
        if (!res && etatSante !== 'saine' && ip.etat !== 'achetee') aControler.push(ip.id);
        continue;
      }
      if (echeance <= N || (prete && !couvre)) {
        if (usee) { dire(laisserExpirer, ip.id, 'usee'); continue; }
        if (!prete) { dire(laisserExpirer, ip.id, 'pas_prete'); continue; }
        if (etatSante !== 'saine') {
          if (echeance > p.santeDecisionJours * JOUR_MS) { dire(attendre, ip.id, `${etatSante}_a_controler`); aControler.push(ip.id); }
          else dire(laisserExpirer, ip.id, `${etatSante}_sans_preuve`);
          continue;
        }
        if (refusApresSante(ip)) { dire(laisserExpirer, ip.id, 'refus_non_prouve'); continue; }
        candidats.push(ip);
        continue;
      }
      dire(attendre, ip.id, 'pas_encore');
      continue;
    }
    // (04/11 soir, décision de Nico) Un refus NON prouvé : l'IP sert encore tant qu'elle vit (stock), mais elle n'est
    // JAMAIS renouvelée. (07/11 soir) Une IP GRILLÉE : jamais renouvelée. (19/11/2026) Plus d'exception pour une IP RÉSERVÉE
    // (avant : « sauf réservée à un compte, l'IP de son retour » — la 39 de Nico) : une IP par compte.
    const sansRenouvellement = refusee(ip.refus);
    if (prete && couvre && !usee) { projete++; if (!pourAchat(ip)) horsAchat++; dire(attendre, ip.id, 'vivante'); continue; }
    if (echeance <= N || (prete && !couvre)) {
      if (usee || !prete || sansRenouvellement || grille) {
        dire(laisserExpirer, ip.id, usee ? 'usee' : !prete ? 'pas_prete' : grille ? 'grillee' : 'refus_non_prouve');
      } else candidats.push(ip);
      continue;
    }
    dire(attendre, ip.id, 'pas_encore');
  }
  // (07/11 soir) Règle « saines » : l'opérateur de sortie d'abord (une saine atypique est gardée en dernier), puis l'usure,
  // puis l'échéance. Règle coupée : l'ordre d'avant.
  candidats.sort((a, b) => (regle ? rangOperateur(a) - rangOperateur(b) : 0)
    || (a.attributions ?? 0) - (b.attributions ?? 0) || instant(a.expire_le) - instant(b.expire_le));
  for (const ip of candidats) {
    const manque = regle ? projeteSaines < vise : projete < vise;
    if (manque) { dire(renouveler, ip.id, regle ? 'saine_pour_la_marge' : 'pour_le_stock'); projete++; projeteSaines++; }
    else dire(laisserExpirer, ip.id, regle ? 'saine_en_surplus' : 'en_surplus');
  }
  const aCommander = Math.max(0, vise - (projete - horsAchat) - enQuarantaine);
  const attribuables = (Array.isArray(ips) ? ips : []).filter((ip) => ip.etat === 'disponible' && !refusProuve(ip.refus)
    && ipAttribuable(ip, { nature: 'essai', maintenant: now, p })).length;
  const niveau = niveauPool({ attribuables, arrivantes: commandesEnCours, seuilAlerte: s.alerte });
  const garde = comptesSansPlace == null ? null
    : gardeNombre({ ips, comptesSansPlace, enAttente, enCommande: commandesEnCours, quantite: aCommander, marge, maintenant: now, p });
  return { seuils: s, vise, projete, enQuarantaine, renouveler, laisserExpirer, attendre, aCommander, attribuables, niveau, garde,
    rebutsEntree24h: rebutsEntreeRecents(ips, now), sainesSeulement: regle, ...(regle ? { projeteSaines, aControler } : {}), raisons };
}

/**
 * (07/11 soir, ordre 4 de Nico) LE BILAN DE SANTÉ DES IP LIBRES (pure) — l'alerte « saines sous la marge » : IP libres
 * (disponible, achetee, repos fini et purgé ; ni attribuée, ni réservée) qui vivent au-delà de la fenêtre de
 * renouvellement, comptées par santé. `sousMarge` : saines < marge, une fois toutes contrôlées (sinon : même si toutes les
 * inconnues étaient saines, la marge ne serait pas atteinte).
 */
export function bilanSante(ips, { marge = PARAMETRES.ipMarge, maintenant = Date.now(), p = PARAMETRES } = {}) {
  const now = instant(maintenant);
  const N = p.renouvellementAvantJours * JOUR_MS;
  const r = { libres: 0, saines: 0, suspectes: 0, grillees: 0, inconnues: 0, marge: Math.max(0, Math.floor(Number(marge) || 0)) };
  for (const ip of Array.isArray(ips) ? ips : []) {
    if (!ipLibre(ip, now) || reservee(ip, now)) continue;
    const exp = instant(ip.expire_le);
    if (exp == null || exp - now <= N) continue;
    r.libres++;
    const s = santeConnue(ip, now, p);
    if (s === 'saine') r.saines++; else if (s === 'suspecte') r.suspectes++; else if (s === 'grillee') r.grillees++; else r.inconnues++;
  }
  r.sousMarge = r.inconnues === 0 ? r.saines < r.marge : r.saines + r.inconnues < r.marge;
  return r;
}

/** (07/11 soir) Une IP LIBRE (pure) : disponible, achetee, ou au repos fini et purgé ; jamais tenue par un compte. */
export function ipLibre(ip, maintenant = Date.now()) {
  if (!ip || ip.user_id != null) return false;
  if (ip.etat === 'disponible' || ip.etat === 'achetee') return true;
  return ip.etat === 'repos' && instant(ip.repos_fin) != null && instant(ip.repos_fin) <= instant(maintenant) && Boolean(ip.purge_prouvee_le);
}

/**
 * (07/11 soir, ordre 4 de Nico : « ce contrôle de santé doit tourner seul, régulièrement, sur toutes les IP libres »)
 * L'IP À CONTRÔLER MAINTENANT (pure), ou null — une seule à la fois. Libres seulement (ipLibre), jamais une IP réservée
 * (l'IP gardée d'un compte, son secours), jamais en usage par un navigateur, jamais une IP qui expire dans l'heure ; sa
 * sortie ouverte par le pare-feu (`permise`). Dans l'ordre :
 *   0. une SUSPECTE dont le dernier contrôle a au moins santeConfirmationMin (la 2e lecture qui prouve ou lève) ;
 *   1. une IP jamais contrôlée ;
 *   2. un contrôle sans conclusion vieux d'au moins santeRelanceMin, ou un refus de plateforme noté après le contrôle ;
 *   3. un contrôle vieux d'au moins santeIntervalleH ;
 *   4. (14/11/2026, complément 3 de Nico : « aucune IP payée ne doit être gaspillée ») une GRILLÉE dont le recontrôle est dû
 *      (quarantaineEspacementsMin après le contrôle précédent : 15 min, 1 h, 4 h, puis toutes les 12 h) ;
 * à rang égal, l'échéance la plus proche (la décision de renouvellement d'abord), puis le contrôle le plus ancien.
 */
export function choisirIpASonder(ips, { maintenant = Date.now(), permise = () => true, enUsage = [], p = PARAMETRES } = {}) {
  const now = instant(maintenant);
  const occupees = new Set((enUsage ?? []).map(Number));
  const dus = [];
  for (const ip of Array.isArray(ips) ? ips : []) {
    if (!ipLibre(ip, now) || reservee(ip, now) || occupees.has(Number(ip.id))) continue;
    const exp = instant(ip.expire_le);
    if (exp == null || exp - now < HEURE_MS || !permise(ip)) continue;
    const s = ip.sante && typeof ip.sante === 'object' ? ip.sante : {};
    const le = instant(s.le);
    const depuis = le == null ? Infinity : now - le;
    const refusRecent = refusee(ip.refus) && Object.values(ip.refus).some((r) => r?.prouvee !== true && instant(r?.le) != null && (le == null || instant(r.le) > le));
    let rang = null, raison = null;
    if (grilleeSurSortie(ip.sante)) continue;   // (19/11/2026 soir) définitive : plus aucune visite de contrôle
    if (grillee(ip)) {
      const esp = p.quarantaineEspacementsMin ?? [15, 60, 240, 720];
      const n = Math.max(0, Math.floor(Number(s.recontroles) || 0));
      if (depuis >= esp[Math.min(n, esp.length - 1)] * 60_000) { rang = 4; raison = 'grillee_recontrole'; }
    } else if (s.verdict === 'suspecte' && depuis >= p.santeConfirmationMin * 60_000) { rang = 0; raison = 'confirmation'; }
    else if (le == null) { rang = 1; raison = 'jamais_controlee'; }
    else if ((Array.isArray(s.dernier?.inconnus) && s.dernier.inconnus.length && depuis >= p.santeRelanceMin * 60_000)
      || (refusRecent && depuis >= p.santeConfirmationMin * 60_000)) { rang = 2; raison = refusRecent ? 'refus_apres_controle' : 'sans_conclusion'; }
    else if (depuis >= p.santeIntervalleH * HEURE_MS) { rang = 3; raison = 'periodique'; }
    if (rang != null) dus.push({ ip, rang, raison, le: le ?? -Infinity });
  }
  dus.sort((a, b) => a.rang - b.rang || instant(a.ip.expire_le) - instant(b.ip.expire_le) || a.le - b.le || Number(a.ip.id) - Number(b.ip.id));
  return dus[0] ? { ip: dus[0].ip, raison: dus[0].raison, dues: dus.length } : null;
}

/**
 * (07/11 soir, ordre 4 de Nico : « grillée = au moins un échec PROUVÉ, relu une 2e fois avant de conclure ») LA SANTÉ
 * APRÈS UN CONTRÔLE (pure ; écrite par cloud_ip_sante_noter). `controle` = { fait_le, echecs: [codes], inconnus: [codes],
 * resume } (sante.js, bilanControle) ; un code d'échec = une plateforme (« ebay ») ou la sortie (« sortie:hebergeur »…),
 * un code inconnu = une plateforme ou « sortie ».
 *   · aucun échec, rien d'inconnu → « saine » (saine_le = ce contrôle) ;
 *   · un échec → « suspecte » ; le même échec relu par un contrôle au moins santeConfirmationMin plus tard → « grillee » ;
 *   · (14/11/2026, complément 3 de Nico) une « grillee » n'est plus définitive : recontrôlée, elle redevient « saine » dès
 *     qu'un contrôle passe (aucun échec, rien d'inconnu ; sortie_grillee_le + la trace d'avant), reste grillée sinon
 *     (recontroles + 1 : le calendrier de choisirIpASonder). Seuls comptent les codes des plateformes contrôlées et de la
 *     sortie (codeSanteCompte) : un échec « ebay » d'avant le 14/11 ne compte plus ;
 *   · sans conclusion : une suspecte dont l'échec n'a pas été relu le reste ; sinon la santé d'avant (saine_le inchangé,
 *     elle vieillit) ou « inconnue ».
 */
export function santeSuivante(avant, controle, { p = PARAMETRES } = {}) {
  const a = avant && typeof avant === 'object' && !Array.isArray(avant) ? avant : {};
  const uniques = (l) => [...new Set((Array.isArray(l) ? l : []).map(String).filter(Boolean))].sort();
  const le = controle?.fait_le ?? null;
  const t = instant(le);
  const echecs = uniques(controle?.echecs).filter(codeSanteCompte);
  const inconnus = uniques(controle?.inconnus).filter(codeSanteCompte);
  // (07/11 soir) L'opérateur de sortie relevé (rangOperateur) : celui de ce contrôle s'il est lisible, sinon celui d'avant.
  const op = controle?.operateur && Number.isInteger(controle.operateur.rang) ? controle.operateur : (a.operateur ?? controle?.operateur ?? null);
  const base = { version: 1, le, controles: (Number(a.controles) || 0) + 1, saine_le: a.saine_le ?? null,
    dernier: { le, echecs, inconnus, ...(controle?.resume ? { resume: controle.resume } : {}) },
    precedent: a.dernier ? { le: a.dernier.le ?? null, echecs: a.dernier.echecs ?? [], inconnus: a.dernier.inconnus ?? [] } : null,
    ...(op ? { operateur: op } : {}) };
  if (a.verdict === 'grillee') {
    const recontroles = (Math.floor(Number(a.recontroles) || 0)) + 1;
    const garder = { ...base, verdict: 'grillee', grillee_le: a.grillee_le ?? null, suspecte_le: a.suspecte_le ?? null, recontroles };
    // (19/11/2026 soir, décision de Nico) Grillée sur sa SORTIE (hébergeur, proxy, pays) : définitive — un contrôle qui passe
    // ne la rend pas saine, ses codes de sortie restent (grilleeSurSortie).
    if (grilleeSurSortie(a)) {
      return { ...garder, definitive: true, echecs: uniques([...uniques(a.echecs).filter((c) => CODES_SORTIE_DEFINITIFS.includes(c)), ...echecs]) };
    }
    if (echecs.length) return { ...garder, echecs };
    if (!inconnus.length) {
      return { ...base, verdict: 'saine', saine_le: le, suspecte_le: null, echecs: [], sortie_grillee_le: le,
        grillee_avant: { grillee_le: a.grillee_le ?? null, echecs: uniques(a.echecs), recontroles } };
    }
    return { ...garder, echecs: uniques(a.echecs) };
  }
  const avantEchecs = a.verdict === 'suspecte' ? uniques(a.echecs).filter(codeSanteCompte) : [];
  if (echecs.length) {
    const communs = echecs.filter((e) => avantEchecs.includes(e));
    const depuis = instant(a.suspecte_le);
    if (communs.length && depuis != null && t != null && t - depuis >= p.santeConfirmationMin * 60_000) {
      return { ...base, verdict: 'grillee', grillee_le: le, suspecte_le: a.suspecte_le, echecs: communs, recontroles: 0 };
    }
    if (communs.length) return { ...base, verdict: 'suspecte', suspecte_le: a.suspecte_le, echecs };
    return { ...base, verdict: 'suspecte', suspecte_le: le, echecs };
  }
  if (!inconnus.length) return { ...base, verdict: 'saine', saine_le: le, suspecte_le: null, echecs: [] };
  const nonRelus = avantEchecs.filter((e) => inconnus.includes(e.split(':')[0]));
  if (nonRelus.length) return { ...base, verdict: 'suspecte', suspecte_le: a.suspecte_le ?? null, echecs: avantEchecs };
  return { ...base, verdict: base.saine_le ? 'saine' : 'inconnue', suspecte_le: null, echecs: [] };
}

/**
 * (07/11 soir, ordre 3 de Nico : « montre-moi la liste des IP qui vont expirer avant d'activer la règle ») LA PROJECTION
 * (pure) : le plan rejoué heure par heure (pasH) sur `jours` jours, la santé FIGÉE (`santeFigee` : id → verdict ; défaut
 * santeConnue maintenant), sans nouveau compte, sans achat : une IP renouvelée prend periodeIpJours de plus (toute sa
 * commande IPRoyal avec elle), une IP non renouvelée à son échéance expire. Rend, par IP, le premier événement :
 * { id, evenement: 'renouvelee' | 'expire' | 'aucun', le, nouvelle_echeance, raison, avec_sa_commande }.
 */
export function projeterEcheances({ ips, marge = PARAMETRES.ipMarge, enAttente = 0, commandesEnCours = 0, sainesSeulement = false,
  santeFigee = null, maintenant = Date.now(), jours = 45, pasH = 1, p = PARAMETRES }) {
  const t0 = instant(maintenant);
  const pool = (Array.isArray(ips) ? ips : []).map((ip) => ({ ...ip }));
  const figee = new Map(pool.map((ip) => [ip.id, santeFigee?.get?.(ip.id) ?? santeFigee?.[ip.id] ?? santeConnue(ip, t0, p)]));
  const santeDe = (ip) => figee.get(ip.id) ?? 'inconnue';
  const evenements = new Map();
  const derniereRaison = new Map();
  for (let t = t0; t <= t0 + jours * JOUR_MS; t += pasH * HEURE_MS) {
    for (const ip of pool) {
      // ⛔ Une IP attribuée n'expire jamais sous son titulaire (le plan la renouvelle à J-3) : seul le pool expire ici.
      if (ip.etat === 'expiree' || ETATS_ATTRIBUES.includes(ip.etat) || instant(ip.expire_le) > t) continue;
      ip.etat = 'expiree';
      if (!evenements.has(ip.id)) evenements.set(ip.id, { id: ip.id, evenement: 'expire', le: new Date(instant(ip.expire_le)).toISOString(), raison: derniereRaison.get(ip.id) ?? null });
    }
    const plan = planDuJour({ ips: pool, lambda: p.lambdaMin, enAttente, commandesEnCours, marge, sainesSeulement, santeDe, maintenant: t, p });
    for (const [id, r] of Object.entries(plan.raisons)) derniereRaison.set(Number(id), r);
    for (const id of plan.renouveler) {
      const ip = pool.find((x) => Number(x.id) === Number(id));
      if (!ip) continue;
      const freres = ip.commande ? pool.filter((x) => x.commande === ip.commande && x.etat !== 'expiree') : [ip];
      for (const x of freres) {
        const fin = instant(x.expire_le) + p.periodeIpJours * JOUR_MS;
        if (!evenements.has(x.id)) {
          evenements.set(x.id, { id: x.id, evenement: 'renouvelee', le: new Date(t).toISOString(), nouvelle_echeance: new Date(fin).toISOString(),
            raison: plan.raisons[x.id] ?? plan.raisons[id] ?? null, avec_sa_commande: Number(x.id) !== Number(id) });
        }
        x.expire_le = new Date(fin).toISOString();
      }
    }
  }
  return (Array.isArray(ips) ? ips : []).map((ip) => evenements.get(ip.id)
    ?? { id: ip.id, evenement: ip.etat === 'expiree' ? 'deja_expiree' : 'aucun', le: null, raison: derniereRaison.get(ip.id) ?? null });
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
// 9. LES COÛTS — par essai, par client, marge sur 24,99 € TTC/mois (prixTtcEur)
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
