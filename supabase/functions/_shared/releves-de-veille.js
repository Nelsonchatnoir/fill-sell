// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉS DE VEILLE AU RETOUR DE LA CONNEXION (05/11, décision de Nico — A4)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis la règle du 05/10 (« aucun relevé d'import sans Synchroniser »), handler-watch ne reposait plus le relevé
// des annonces d'une plateforme quand sa session revenait après un mur de connexion (RELANCE_AUTOMATIQUE_RELEVE =
// false) : une vente faite pendant le mur n'était lue qu'au prochain clic « Synchroniser ».
// DÉCISION DE NICO (05/11) : rallumés pour Leboncoin, Beebs et Depop, en LECTURE SEULE — ventes et état des annonces,
// aucun import, aucune création d'article. La règle du 05/10 reste entière : 'reprise_connexion' est un relevé de
// VEILLE (releve_est_veille, migration 20261105110000), jamais un geste (releve_est_geste) — seul un geste ouvre
// l'import (rapprocher_releve, inventaire_ecarte_import_sync). eBay passe par son API (ebay-api-worker) : pas ici.
// Opla est quittée (10/10) : retirée. Le dressing Vinted (kind 'dressing') reste coupé : hors de la décision.
// Les gardes d'avant, inchangées (pas une visite de plus qu'avant le 05/10) : interrupteur serveur, extension vue,
// sonde de session fraîche ET postérieure au mur, aucun relevé de la plateforme en file ou en cours, 15 min après le
// dernier relevé réussi, 3 reprises au plus par épisode (depuis le dernier relevé réussi).
// NEUF : jamais pendant une pause Leboncoin (« Accès temporairement restreint ») : seule la visite de contrôle du
// serveur y lit, une à la fois (blocage-leboncoin.js) — l'extension refuserait de toute façon ce relevé.
//
// ⛔ (11/11) UNE GARDE DE CRON NE SE CALCULE JAMAIS SUR UNE LECTURE NON BORNÉE ; UN ÉTAT NON LU NE POSE RIEN.
// Du 09/11 14:09 au 11/11, handler-watch donnait à cette règle 30 jours de relevés de TOUS les comptes à mur, lus en
// une requête `.limit(2000)` sans tri ni pages : PostgREST n'en rend que 1 000, sans erreur, les plus anciennes. Les
// gardes « déjà reparti », « 15 min » et « 3 par épisode » ne voyaient plus les relevés récents : un relevé reposé à
// chaque passage du cron (plus de 1 500 en deux jours, 12 comptes). La RÈGLE n'a pas changé ; sa LECTURE, si :
//   1. candidatsReleveDeVeille (pur) : les gardes qui ne demandent pas l'historique — TOUS les candidats ;
//   2. trancheReleveDeVeille (pur) : ceux qu'on lit à ce passage — tous sous le plafond, sinon une tranche qui TOURNE
//      d'un passage à l'autre (jamais « les N premiers » : les suivants ne seraient jamais lus) ;
//   3. lireEtatReleveDeVeille : l'état EXACT d'un candidat, lu PAR CLÉ (compte, plateforme) — le dernier relevé réussi
//      d'abord (postérieur au mur : une seule lecture), sinon « en file » et les reprises de l'épisode ;
//   4. relevesDeVeilleAReposer (pur) : les gardes d'avant sur cet état — absent ou non lu, il ne pose rien.
// Rapport : docs/enquetes/reprise-connexion-boucle-1111/RAPPORT.md. Node + Deno ; verrou : `npm run
// selftest:releves-de-veille` (scripts/releves-de-veille-selftest.mjs, § 6 et suivants).
//
// (11/11, décision de Nico : « OUI : les murs Depop et Cloud doivent être reconnus — un relevé après une vraie
// reconnexion, comme ailleurs ») LES MURS SONT UNE LISTE FERMÉE DE TEXTES COMPLETS (MURS_CONNEXION_VEILLE). La règle ne
// lisait que « page de connexion » : le mur Depop de l'ordinateur et celui de la copie Cloud n'étaient pas reconnus, le
// relevé voulu après une vraie reconnexion ne partait jamais pour eux.
// (11/11 vers 15:25, décision de Nico : « Suivre l'exécutant ») LA PREUVE DE SESSION REVENUE SUIT L'EXÉCUTANT DU RELEVÉ,
// QUEL QUE SOIT LE TEXTE DU MUR (executantReleveDeVeille) : Cloud du compte actif (`profiles.cloud_voie`, lu par
// handler-watch avec les profils, par lots) → le relevé est servi au seul poste Cloud (get-pending-jobs,
// commandeLaisseeAuCloud), sa preuve est la connexion du coffre de l'orchestrateur (lirePreuveCloudVeille) ; sinon →
// l'ordinateur, sa sonde (inchangé). Jamais la sonde pour le Cloud : l'ordinateur et la copie Cloud écrivent la même
// colonne. Verrou : § 12 et § 13 bis du selftest.

import { etatBlocageLbc, lecturesExtensionEnPause } from "./blocage-leboncoin.js";

export const DECLENCHEUR_REPRISE_CONNEXION = "reprise_connexion";
export const PLATEFORMES_VEILLE_REPRISE = Object.freeze(["leboncoin", "beebs", "depop"]);
export const STATUTS_ARRET_RELEVE = Object.freeze(["absente", "failed", "expired"]);
export const CADENCE_REPRISE_MS = 15 * 60_000;
export const PLAFOND_REPRISES_PAR_EPISODE = 3;
export const FRAICHEUR_SONDE_VEILLE_MS = 3 * 60 * 60_000;
export const FENETRE_ARRETS_MS = 7 * 24 * 60 * 60_000;
/** Un épisode ne remonte jamais au-delà de 30 jours : la fenêtre de l'historique que la règle recevait avant le 11/11. */
export const FENETRE_EPISODE_MS = 30 * 24 * 60 * 60_000;
/** Candidats dont l'état est LU par passage du cron (une à trois lectures chacun ; une à quatre pour un compte au Cloud
 * actif, avec la ligne du coffre) : un plafond sur les lectures, jamais sur les candidats — au-delà, la tranche lue tourne
 * d'un passage à l'autre (trancheReleveDeVeille). */
export const PLAFOND_CANDIDATS_PAR_PASSAGE = 30;
/** La cadence du cron `handler-watch-3min` (toutes les 3 min, migration 20260716110000) : le numéro d'un passage se lit
 * sur l'heure, par pas de 3 min. Aucune mémoire d'un passage à l'autre (fonction edge sans état). ⛔ Si la cadence du
 * cron change, aucun candidat n'est oublié pour autant (pas premier avec n, trancheReleveDeVeille) ; seule l'attente
 * d'un candidat s'allonge. */
export const CADENCE_PASSAGES_MS = 3 * 60_000;

const pgcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/** Le pas de la tranche tournante : le plus grand entier ≤ plafond qui est PREMIER avec n. Avec un pas premier avec n,
 * les départs successifs parcourent tous les rangs : aucun candidat n'est oublié, même si des passages manquent
 * (cron plus lent, passage qui n'atteint pas le bloc) — pour k passages sautés, les départs restent des multiples de
 * pgcd(k, n) ≤ k, couverts par des tranches de `plafond` dès que k ≤ plafond. */
export function pasDeTranche(n, plafond = PLAFOND_CANDIDATS_PAR_PASSAGE) {
  for (let q = Math.min(plafond, n); q > 1; q--) if (pgcd(q, n) === 1) return q;
  return 1;
}

const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };

/** La clé d'un candidat et de son état : (compte, plateforme). */
export const cleReleveDeVeille = (c) => `${c?.user_id}|${c?.platform}`;

/** Déjà reparti : un relevé a réussi APRÈS le mur — il n'y a plus de mur. Une seule écriture, pour la lecture (qui
 * s'arrête là) et pour la règle. */
const dejaReparti = (reussi, arret) => reussi > 0 && reussi > arret;

/** Les deux exécutants d'un relevé : l'ORDINATEUR (l'extension du poste) et la copie CLOUD de l'extension. */
export const VOIE_POSTE = "poste";
export const VOIE_CLOUD = "cloud";
const EXECUTANTS = Object.freeze([VOIE_POSTE, VOIE_CLOUD]);

/**
 * L'EXÉCUTANT du relevé de veille d'un compte (pur) — celui à qui get-pending-jobs le servira, et donc celui dont la
 * session doit être revenue (11/11 vers 15:25, décision de Nico : « Suivre l'exécutant ») : le Cloud si le Cloud du
 * compte est actif (`profiles.cloud_voie` vrai : un relevé « annonces » de Leboncoin, Beebs ou Depop n'est alors servi
 * qu'au poste Cloud, jamais à l'ordinateur — commandeLaisseeAuCloud, _shared/cloud-voie.js), sinon l'ordinateur (le
 * relevé part au poste qui le réclame, comme avant). Le texte du mur n'y entre pas.
 * @param {{ cloudVoie?: boolean } | null | undefined} profil  l'entrée de `profils` (candidatsReleveDeVeille)
 */
export function executantReleveDeVeille(profil) {
  return profil?.cloudVoie === true ? VOIE_CLOUD : VOIE_POSTE;
}

/**
 * LES MURS DE CONNEXION DE LA RÈGLE — une LISTE FERMÉE de textes que NOS relevés écrivent dans `vinted_sync_runs.erreur`
 * (jamais une heuristique sur un message de plateforme), chacun avec la voie qui ÉCRIT ce texte. ⛔ Cette voie ne
 * choisit PAS la preuve de session revenue : la preuve suit l'EXÉCUTANT (executantReleveDeVeille), quel que soit le texte
 * — un mur « page de connexion » vu par la copie Cloud, ou un mur du Cloud d'un compte dont le Cloud est arrêté, se
 * prouvent sur celui qui fera le relevé. Un mur = la session de la plateforme est FERMÉE, et la reconnexion la rouvre :
 *  - Cloud — « FillSell Cloud : <pf> demande une reconnexion (session fermée ou jeton non renouvelé), aucune visite » :
 *    le verrou de la copie Cloud (scripts/cloud/build-extension-cloud.mjs, refusVerrouCloud), relevé « failed » ;
 *  - ordinateur — « session <pf> : page de connexion … » : la page de connexion vue par le relevé (background.js) — le
 *    motif de l'écran (MUR_PAGE_CONNEXION, src/annonces/etatReleve.js) ;
 *  - ordinateur — « Connexion Depop requise : connecte-toi à Depop sur ton ordinateur. » : la session Depop fermée
 *    (content-scripts/depop.js, listerMesArticles), relevé « absente ». Le TEXTE COMPLET, jamais son début : les textes
 *    des TÂCHES Depop (« Connexion Depop requise : ta session Depop est fermée… », publication et retrait) commencent
 *    pareil.
 * PAS des murs (la reconnexion n'y change rien) : « accès Depop non accordé » (permission : « Autoriser Depop »),
 * « session Depop illisible », « [anti_robot] … », « « Mes annonces » n'a pas rendu sa liste (redirection du compte,
 * challenge ou page non peinte) », une demande expirée ou jamais réclamée, le chien de garde, un chargement, le réseau,
 * la reconnexion de sécurité eBay (eBay passe par son API). Le Cloud d'avant le 05/11 écrivait « … n'est pas connecté dans
 * ce navigateur » : plus écrit (dernier le 04/11), hors de la liste.
 * Le Cloud d'abord : son texte n'est écrit que par la copie Cloud. ⛔ Un texte neuf entre ici avec son cas au verrou
 * (§ 13 bis), jamais par un motif élargi.
 */
export const MURS_CONNEXION_VEILLE = Object.freeze([
  Object.freeze({ voie: VOIE_CLOUD, motif: /FillSell Cloud : (?:leboncoin|beebs|depop) demande une reconnexion \(/ }),
  Object.freeze({ voie: VOIE_POSTE, motif: /page de connexion/i }),
  Object.freeze({ voie: VOIE_POSTE, motif: /Connexion Depop requise : connecte-toi à Depop sur ton ordinateur\./ }),
]);

/** La voie qui ÉCRIT le texte du mur d'un relevé (VOIE_POSTE, VOIE_CLOUD), ou null si ce n'est pas un mur de la règle.
 * ⛔ Elle ne choisit pas la preuve (executantReleveDeVeille). */
export function voieMurVeille(erreur) {
  const e = String(erreur ?? "");
  return MURS_CONNEXION_VEILLE.find((m) => m.motif.test(e))?.voie ?? null;
}

/** Le mur de connexion d'un relevé, sur les textes que NOS relevés écrivent (MURS_CONNEXION_VEILLE). */
export function murConnexionVeille(erreur) {
  return voieMurVeille(erreur) !== null;
}

/**
 * La connexion du Cloud est-elle REVENUE après le mur ? (pur) La plateforme est connectée au coffre de l'orchestrateur
 * (`cloud_coffre.connecte` : posé par une connexion VÉRIFIÉE — « Me connecter », compte lu par l'orchestrateur —,
 * rafraîchi à chaque sauvegarde du navigateur tant qu'elle tient, retombé à « à reconnecter » quand le verrou ne la
 * rouvre plus), d'une écriture POSTÉRIEURE au mur et de moins de 3 h — la même fraîcheur que la sonde de l'ordinateur.
 */
export function connexionCloudRevenue(cloud, murMs, maintenant = Date.now()) {
  const maj = t(cloud?.maj_le);
  return cloud?.connecte === true && Number.isFinite(murMs) && Number.isFinite(maj) && maj > murMs && maintenant - maj <= FRAICHEUR_SONDE_VEILLE_MS;
}

/**
 * LA PREUVE DU CLOUD d'un candidat dont l'exécutant est le Cloud (Cloud du compte actif), lue PAR CLÉ en UNE lecture
 * d'une ligne : le coffre de l'orchestrateur pour (compte, plateforme) — `connecte`, `maj_le` (connexionCloudRevenue).
 * Le Cloud du compte (`cloud_voie`) n'est pas relu ici : il arrive avec le profil (handler-watch, lecture par lots).
 * Rend { lu: true, cloud: { connecte, maj_le } }, ou { lu: false, motif } : une erreur, une réponse inattendue, une date
 * illisible ou une exception ne prouvent rien.
 * @param {any} supabase  client supabase-js (service_role : cloud_coffre est fermé aux clients)
 * @param {{ user_id: string, platform: string, mur_du: string }} candidat
 */
export async function lirePreuveCloudVeille(supabase, candidat) {
  const user_id = String(candidat?.user_id ?? ""), platform = String(candidat?.platform ?? ""), arret = t(candidat?.mur_du);
  if (!user_id || !PLATEFORMES_VEILLE_REPRISE.includes(platform) || !Number.isFinite(arret)) return { lu: false, motif: "candidat illisible" };
  try {
    const coffre = await supabase.from("cloud_coffre").select("connecte, maj_le").eq("user_id", user_id).eq("plateforme", platform).limit(1);
    if (coffre?.error || !Array.isArray(coffre?.data)) {
      return { lu: false, motif: `connexion Cloud : ${String(coffre?.error?.message ?? "réponse inattendue").slice(0, 120)}` };
    }
    const ligne = coffre.data[0] ?? null;
    if (ligne && ligne.maj_le != null && !Number.isFinite(t(ligne.maj_le))) return { lu: false, motif: "connexion Cloud : date illisible" };
    return { lu: true, cloud: { connecte: ligne?.connecte === true, maj_le: ligne?.maj_le == null ? null : String(ligne.maj_le) } };
  } catch (e) {
    return { lu: false, motif: `preuve Cloud interrompue : ${String(e?.message ?? e).slice(0, 120)}` };
  }
}

/**
 * 1. Les CANDIDATS (pur) : le plus récent arrêt de 7 jours de la plateforme est un mur de connexion, et rien de ce qui
 * se sait SANS l'historique ne s'y oppose — extension vue, pas de pause Leboncoin, et quand l'exécutant est
 * l'ORDINATEUR (Cloud du compte arrêté) : session connectée, sonde fraîche ET postérieure au mur. Quand l'exécutant est
 * le CLOUD (Cloud du compte actif), il n'y a pas de sonde à lire ici : sa preuve (le coffre de l'orchestrateur) se lit
 * par clé avec son état (lireEtatReleveDeVeille). Le texte du mur dit seulement que c'en est un. Entrées :
 *  - arrets : relevés `kind='annonces'` arrêtés (absente/failed/expired) des 7 derniers jours — TOUS ceux des comptes
 *    à mur (un arrêt plus récent qui n'est pas un mur l'emporte), dans n'importe quel ordre ;
 *  - profils : Map user_id → { sessions (extension_sessions), extVue (extension_last_seen_at), ps (platform_settings),
 *    cloudVoie (cloud_voie) }.
 * Rend [{ user_id, platform, mur_du, executant }] — TOUS les candidats, un au plus par (compte, plateforme), murs les plus
 * récents d'abord ; `executant` : executantReleveDeVeille. ⛔ Jamais coupés ici : un candidat reste candidat jusqu'à 7
 * jours après son mur (relevé « déjà reparti » compris) ; ce qui borne un passage, c'est trancheReleveDeVeille.
 * @param {{ arrets?: any[], profils?: Map<string, any>, maintenant?: number }} arg
 * @returns {Array<{ user_id: string, platform: string, mur_du: string, executant: string }>}
 */
export function candidatsReleveDeVeille({ arrets = [], profils = new Map(), maintenant = Date.now() }) {
  // Le PLUS RÉCENT arrêt par (compte, plateforme) fait foi : un arrêt plus récent qui n'est pas un mur l'emporte.
  const dernier = new Map();
  for (const r of arrets) {
    const platform = String(r?.platform ?? "");
    if (!PLATEFORMES_VEILLE_REPRISE.includes(platform)) continue;
    if (!STATUTS_ARRET_RELEVE.includes(String(r?.status ?? ""))) continue;
    const fin = t(r?.finished_at);
    if (!(maintenant - fin <= FENETRE_ARRETS_MS)) continue;
    const cle = `${r.user_id}|${platform}`;
    if (dernier.has(cle) && dernier.get(cle).fin >= fin) continue;
    dernier.set(cle, { user_id: String(r.user_id), platform, finished_at: String(r.finished_at), fin, mur: murConnexionVeille(r.erreur) });
  }
  const out = [];
  for (const c of dernier.values()) {
    if (!c.mur) continue;                                                  // pas un mur de connexion
    const prof = profils.get(c.user_id);
    if (!prof || !prof.extVue) continue;                                   // extension jamais vue (ni l'ordinateur ni le Cloud)
    const executant = executantReleveDeVeille(prof);                       // celui qui fera le relevé — jamais le texte du mur
    if (executant === VOIE_POSTE) {
      const s = prof.sessions ?? {};
      if (s[c.platform] !== true) continue;                                // pas connecté, ou inconnu
      const vu = t(s.checked_at_par_plateforme?.[c.platform] ?? s.checked_at);
      if (!Number.isFinite(vu) || maintenant - vu > FRAICHEUR_SONDE_VEILLE_MS) continue;   // sonde absente ou vieille
      if (vu <= c.fin) continue;                                           // rien de neuf depuis le mur
    }
    // VOIE_CLOUD : la sonde ne prouve rien (l'ordinateur et la copie Cloud écrivent la même colonne) — la preuve du Cloud
    // se lit avec l'état (lirePreuveCloudVeille), et elle seule ouvre la garde (gardeReleveDeVeille).
    if (c.platform === "leboncoin" && lecturesExtensionEnPause(etatBlocageLbc(prof.ps ?? {}, maintenant).etat)) continue;
    out.push({ user_id: c.user_id, platform: c.platform, mur_du: c.finished_at, executant, fin: c.fin });
  }
  return out.sort((a, b) => b.fin - a.fin).map(({ user_id, platform, mur_du, executant }) => ({ user_id, platform, mur_du, executant }));
}

/**
 * 2. Les candidats LUS à ce passage (pur) : tous, tant qu'ils tiennent sous le plafond ; au-delà, une TRANCHE de
 * `plafond` candidats consécutifs dont le départ avance d'un pas q à chaque passage du cron (q = pasDeTranche(n) :
 * le plus grand entier ≤ plafond premier avec n ; le numéro du passage se lit sur l'heure, par pas de 3 min).
 * À nombre de candidats CONSTANT et à la cadence du cron, chaque candidat est lu au moins une fois tous les
 * ceil(n / q) passages ; si des passages manquent, plus tard, mais jamais oublié. Si n change entre deux passages, la
 * tranche saute (aucune mémoire) : l'attente d'un candidat peut s'allonger d'un passage ou deux, sans l'oublier.
 * ⛔ Jamais « les N premiers » : ce tri est le même à chaque passage, les suivants ne seraient JAMAIS lus et le relevé
 * voulu après une vraie reconnexion ne partirait jamais pour eux.
 * @template T
 * @param {T[]} candidats
 * @param {{ maintenant?: number, plafond?: number }} [arg]
 * @returns {T[]}
 */
export function trancheReleveDeVeille(candidats = [], { maintenant = Date.now(), plafond = PLAFOND_CANDIDATS_PAR_PASSAGE } = {}) {
  const n = candidats.length;
  const p = Number.isInteger(plafond) && plafond > 0 ? plafond : PLAFOND_CANDIDATS_PAR_PASSAGE;
  if (n <= p) return [...candidats];
  const debut = (Math.floor(maintenant / CADENCE_PASSAGES_MS) * pasDeTranche(n, p)) % n;
  return Array.from({ length: p }, (_, k) => candidats[(debut + k) % n]);
}

/**
 * 3. L'ÉTAT EXACT d'un candidat, lu PAR CLÉ (compte, plateforme) en lectures BORNÉES de `vinted_sync_runs`
 * (`kind='annonces'`) — jamais l'historique en vrac, que PostgREST coupe à 1 000 lignes sans erreur :
 *  a. D'ABORD le DERNIER relevé réussi des 30 derniers jours : le plus récent par `finished_at`, une ligne. S'il est
 *     postérieur au mur, la décision est prise (déjà reparti) : RIEN d'autre n'est lu — `en_file` et `reprises`
 *     restent à null. C'est le cas de presque tous les candidats, jusqu'à 7 jours après leur mur ;
 *  a bis. un candidat dont l'exécutant est le CLOUD (candidat.executant) : sa preuve, lue par clé (lirePreuveCloudVeille :
 *     une ligne du coffre) — non revenue, la décision est prise : rien d'autre n'est lu ;
 *  b. sinon, en file ou en cours : une ligne au plus (index unique `vinted_sync_runs_un_seul_actif`) ;
 *  c. et les reprises de l'ÉPISODE : 'reprise_connexion' posées depuis ce relevé réussi (à défaut, depuis 30 jours),
 *     3 lignes au plus — au-delà le plafond est atteint, les compter ne sert à rien.
 * ⛔ `finished_at` non vide sur (a) : un tri décroissant met les valeurs vides en tête, une ligne réussie sans fin
 * masquerait le vrai dernier relevé réussi.
 * Les fenêtres sont celles de la lecture d'avant (30 jours sur `started_at`) : la règle décide comme avant, sur un
 * historique complet. Une erreur, une réponse inattendue, une date illisible ou une exception rendent { lu: false } :
 * la règle ne pose alors rien. Un candidat sans exécutant connu aussi (rien n'est lu).
 * Coût : 1 lecture (déjà reparti) ; sinon 3 (ordinateur) ; au Cloud actif, 2 (connexion non revenue) ou 4.
 * @param {any} supabase  client supabase-js (service_role)
 * @param {{ user_id: string, platform: string, mur_du: string, executant: string }} candidat
 * @param {number} [maintenant]
 * @returns {Promise<{ lu: true, reussi_le: string | null, en_file: boolean | null, reprises: number | null, cloud?: any } | { lu: false, motif: string }>}
 */
export async function lireEtatReleveDeVeille(supabase, candidat, maintenant = Date.now()) {
  const user_id = String(candidat?.user_id ?? ""), platform = String(candidat?.platform ?? ""), arret = t(candidat?.mur_du);
  if (!user_id || !PLATEFORMES_VEILLE_REPRISE.includes(platform) || !Number.isFinite(arret) || !EXECUTANTS.includes(candidat?.executant)) {
    return { lu: false, motif: "candidat illisible" };
  }
  const depuis = new Date(maintenant - FENETRE_EPISODE_MS).toISOString();
  const illisible = (quoi, r) => ({ lu: false, motif: `${quoi} : ${String(r?.error?.message ?? "réponse inattendue").slice(0, 120)}` });
  try {
    const reussi = await supabase.from("vinted_sync_runs").select("finished_at")
      .eq("user_id", user_id).eq("kind", "annonces").eq("platform", platform).eq("status", "done")
      .gte("started_at", depuis).not("finished_at", "is", null)
      .order("finished_at", { ascending: false }).limit(1);
    if (reussi?.error || !Array.isArray(reussi?.data)) return illisible("dernier relevé réussi", reussi);
    const reussi_le = reussi.data.length ? reussi.data[0]?.finished_at : null;
    if (reussi.data.length && !Number.isFinite(t(reussi_le))) return { lu: false, motif: "dernier relevé réussi : date illisible" };
    if (reussi_le != null && dejaReparti(t(reussi_le), arret)) return { lu: true, reussi_le: String(reussi_le), en_file: null, reprises: null };

    // L'exécutant est le Cloud : sa preuve de session revenue (le coffre de l'orchestrateur), jamais la sonde.
    let cloud = null;
    if (candidat.executant === VOIE_CLOUD) {
      const preuve = await lirePreuveCloudVeille(supabase, candidat);
      if (preuve.lu !== true) return preuve;
      cloud = preuve.cloud;
      if (!connexionCloudRevenue(cloud, arret, maintenant)) {
        return { lu: true, reussi_le: reussi_le == null ? null : String(reussi_le), en_file: null, reprises: null, cloud };
      }
    }

    const enFile = await supabase.from("vinted_sync_runs").select("id")
      .eq("user_id", user_id).eq("kind", "annonces").eq("platform", platform)
      .in("status", ["queued", "running"]).limit(1);
    if (enFile?.error || !Array.isArray(enFile?.data)) return illisible("relevé en file", enFile);

    let episode = supabase.from("vinted_sync_runs").select("queued_at")
      .eq("user_id", user_id).eq("kind", "annonces").eq("platform", platform).eq("declencheur", DECLENCHEUR_REPRISE_CONNEXION)
      .gte("started_at", depuis);
    if (reussi_le != null) episode = episode.gt("queued_at", String(reussi_le));
    const reprises = await episode.order("queued_at", { ascending: false }).limit(PLAFOND_REPRISES_PAR_EPISODE);
    if (reprises?.error || !Array.isArray(reprises?.data)) return illisible("reprises de l'épisode", reprises);

    return { lu: true, reussi_le: reussi_le == null ? null : String(reussi_le), en_file: enFile.data.length > 0, reprises: reprises.data.length, ...(cloud ? { cloud } : {}) };
  } catch (e) {
    return { lu: false, motif: `lecture interrompue : ${String(e?.message ?? e).slice(0, 120)}` };
  }
}

/**
 * La garde qui RETIENT un candidat d'après son état (pur), ou null si aucune ne le retient : les gardes d'avant le
 * 05/10, inchangées — déjà reparti, en file, 15 min après le dernier relevé réussi, 3 reprises par épisode. Quand
 * l'exécutant est le Cloud (11/11), sa preuve en plus : « session Cloud non revenue » (coffre pas connecté, écrit avant
 * le mur ou il y a plus de 3 h). Quand c'est l'ordinateur, sa sonde a été lue avec les candidats.
 * ⛔ Un état absent, non lu (`lu !== true`), incomplet ou illisible RETIENT (« état non lu ») — jamais une permission
 * par défaut : c'est une ligne ABSENTE de l'historique qui ouvrait les gardes pendant la boucle du 09/11. Un candidat
 * sans exécutant connu, ou au Cloud sans preuve lue (`cloud` absent), aussi.
 * @param {{ user_id: string, platform: string, mur_du: string, executant: string }} candidat
 * @param {any} etat  lireEtatReleveDeVeille
 * @param {number} [maintenant]
 * @returns {string | null}
 */
export function gardeReleveDeVeille(candidat, etat, maintenant = Date.now()) {
  if (!PLATEFORMES_VEILLE_REPRISE.includes(String(candidat?.platform ?? ""))) return "hors de la règle";
  if (!etat || etat.lu !== true) return "état non lu";
  if (!EXECUTANTS.includes(candidat?.executant)) return "état non lu";                   // exécutant inconnu : jamais l'ordinateur par défaut
  const arret = t(candidat?.mur_du);
  const reussi = etat.reussi_le == null ? 0 : t(etat.reussi_le);
  if (!Number.isFinite(arret) || !Number.isFinite(reussi)) return "état non lu";         // date illisible
  if (dejaReparti(reussi, arret)) return "déjà reparti";                                 // plus de mur
  if (candidat.executant === VOIE_CLOUD) {                                               // exécutant Cloud : sa preuve, et elle seule
    if (!etat.cloud || typeof etat.cloud !== "object") return "état non lu";
    if (!connexionCloudRevenue(etat.cloud, arret, maintenant)) return "session Cloud non revenue";
  }
  if (etat.en_file === true) return "en file";                                           // un relevé déjà en file ou en cours
  if (etat.en_file !== false) return "état non lu";
  if (reussi && maintenant - reussi < CADENCE_REPRISE_MS) return "cadence";              // 15 min après le dernier réussi
  if (!Number.isInteger(etat.reprises) || etat.reprises < 0) return "état non lu";
  if (etat.reprises >= PLAFOND_REPRISES_PAR_EPISODE) return "plafond de l'épisode";      // 3 par épisode
  return null;
}

/**
 * 4. Les relevés de veille À REPOSER (pur) : les candidats dont l'interrupteur serveur est ouvert et qu'aucune garde ne
 * retient (gardeReleveDeVeille). Entrées :
 *  - candidats : ceux du passage (trancheReleveDeVeille), chacun avec son exécutant ;
 *  - etats : Map cleReleveDeVeille(candidat) → lireEtatReleveDeVeille ;
 *  - ouverte : Map user_id → boolean (sync_multi_ouverte_pour) — absente = fermée.
 * Rend [{ user_id, platform, mur_du }] — un au plus par (compte, plateforme).
 * @param {{ candidats?: Array<{ user_id: string, platform: string, mur_du: string, executant: string }>, etats?: Map<string, any>, ouverte?: Map<string, boolean>, maintenant?: number }} arg
 * @returns {Array<{ user_id: string, platform: string, mur_du: string }>}
 */
export function relevesDeVeilleAReposer(arg = {}) {
  // Le contrat d'avant le 11/11 ({ arrets, historique, … }) rendrait [] en silence : il lève.
  if ("arrets" in arg || "historique" in arg || "profils" in arg) {
    throw new Error("relevesDeVeilleAReposer : contrat du 11/11 — { candidats, etats, ouverte, maintenant } (candidatsReleveDeVeille puis lireEtatReleveDeVeille)");
  }
  const { candidats = [], etats = new Map(), ouverte = new Map(), maintenant = Date.now() } = arg;
  const out = [], vues = new Set();
  for (const c of candidats) {
    const cle = cleReleveDeVeille(c);
    if (vues.has(cle)) continue;
    vues.add(cle);
    if (ouverte.get(c.user_id) !== true) continue;                         // interrupteur serveur
    if (gardeReleveDeVeille(c, etats.get(cle), maintenant) !== null) continue;
    out.push({ user_id: c.user_id, platform: c.platform, mur_du: c.mur_du });
  }
  return out;
}

/** La ligne à poser : un relevé de VEILLE (lecture seule) — jamais un geste. */
export function ligneReleveDeVeille({ user_id, platform }, maintenant = new Date().toISOString()) {
  return { user_id, kind: "annonces", platform, status: "queued", declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: maintenant };
}
