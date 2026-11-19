// LA FLOTTE — plusieurs serveurs Hetzner, les places, la montée en charge (03/11/2026, points 1 et 5 de Nico).
//
//   · battre()  : chaque minute, ce serveur se déclare (cloud_serveur_battre) — capacité, navigateurs ouverts ;
//   · lireComptesDuServeur : ce que CE serveur sert (cloud_comptes_du_serveur ; repli sur cloud_comptes_a_servir tant
//     que la migration 20261103201000 n'est pas en base) ;
//   · capaciteServeur : sans NAVIGATEURS_MAX, la capacité THÉORIQUE vient de la mémoire de l'hôte et du plafond d'un
//     navigateur ; (07/11, décision 4 ; 19/11, décision de Nico : plus de plafond à 30) la capacité du moment vient des
//     MESURES RÉELLES (capaciteReelle, capaciteMesuree) : départ 15, puis des paliers de +5 jusqu'à la limite réelle
//     (conso réelle par navigateur, 20 % de mémoire toujours libre), bloquée au premier signe grave ; alerte à 80 % ;
//     jamais un serveur commandé seul ;
//   · tour()    : toutes les 10 min, la décision pure planFlotte. Sous le seuil de places libres, le serveur DOYEN
//     (le plus ancien nom vivant) prépare UN serveur neuf : corps exact de l'appel Hetzner, cloud-init (socle, .env,
//     paquet), DNS. ⛔ DOUBLE INTERRUPTEUR : rien n'est créé sans HETZNER_CREATION_AUTORISEE=1 (env) ET
//     coin_config cloud_serveurs_auto = 1 ; sinon le plan est seulement JOURNALISÉ (« à blanc »).
// Jamais un secret au journal : le user_data (qui porte le .env) n'y apparaît que par sa taille et son empreinte.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { socleAbsent } from './socle.js';
import { reglagesFilet, FILET_FILE_PCT, FILET_ARRET_PCT } from './filetCapacite.js';

// coin_config ne porte que des ENTIERS : le type et le lieu y sont des index de ces listes (0 = défaut).
// cx43 (le serveur actuel) était en rupture le 01/11 : cpx42 (même taille, 8 vCPU, 16 Go) par défaut.
export const TYPES_SERVEUR = Object.freeze(['cpx42', 'cx43', 'cpx32', 'cx53', 'cpx62', 'ccx33']);
export const LIEUX_SERVEUR = Object.freeze(['fsn1', 'nbg1', 'hel1']);
export const SOCLE_MO_MESURE = 700;              // orchestrateur + Caddy + système, relevé le 03/11 sur cloud-1
export const VIVANT_MS = 5 * 60_000;             // = cloud_places_libres
export const CREATION_EN_COURS_MS = 45 * 60_000; // un serveur neuf se déclare en ~10 min ; au-delà : bloqué, alerte
export const USER_DATA_MAX = 32 * 1024;          // limite Hetzner du user_data
const IMAGE_SERVEUR = 'ubuntu-24.04';

const code = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
export const typeDepuisCode = (v) => TYPES_SERVEUR[code(v)] ?? TYPES_SERVEUR[0];
export const lieuDepuisCode = (v) => LIEUX_SERVEUR[code(v)] ?? LIEUX_SERVEUR[0];

/** L'erreur dit-elle « fonction inconnue » ? (la migration n'est pas encore en base) */
export const fonctionAbsente = (e) => socleAbsent(e);

/**
 * La capacité du serveur (pure) : NAVIGATEURS_MAX s'il est réglé ; sinon ⌊(mémoire de l'hôte − socle) / plafond d'un
 * navigateur⌋ ; illisible → repli (l'ancien défaut).
 */
export function capaciteServeur({ totalMo, socleMo = SOCLE_MO_MESURE, plafondMo, reglage = null, repli = 8 }) {
  if (reglage != null && Number.isFinite(Number(reglage))) return Math.max(0, Math.floor(Number(reglage)));
  if (!(Number(totalMo) > 0) || !(Number(plafondMo) > 0)) return repli;
  return Math.max(0, Math.floor((Number(totalMo) - Math.max(0, Number(socleMo) || 0)) / Number(plafondMo)));
}

/** Ce que sert CE serveur. Repli sur l'ancien appel tant que la fonction n'existe pas (déploiement avant migration). */
export async function lireComptesDuServeur(base, serveur) {
  const r = await base.rpc('cloud_comptes_du_serveur', { p_serveur: serveur });
  if (!r.error && Array.isArray(r.data)) return { comptes: r.data, source: 'serveur' };
  if (r.error && !fonctionAbsente(r.error)) throw new Error(`cloud_comptes_du_serveur : ${r.error.message}`);
  const a = await base.rpc('cloud_comptes_a_servir');
  if (a.error) throw new Error(`cloud_comptes_a_servir : ${a.error.message}`);
  return { comptes: a.data ?? [], source: 'repli' };
}

const numeroServeur = (nom) => { const m = /^cloud-(\d+)$/.exec(String(nom ?? '')); return m ? Number(m[1]) : null; };
const ordreNoms = (a, b) => {
  const na = numeroServeur(a); const nb = numeroServeur(b);
  if (na != null && nb != null) return na - nb;
  if (na != null) return -1;
  if (nb != null) return 1;
  return String(a).localeCompare(String(b));
};
export const estVivant = (s, maintenant = Date.now()) => s?.etat === 'actif' && Number.isFinite(Date.parse(s?.vu_le ?? ''))
  && maintenant - Date.parse(s.vu_le) < VIVANT_MS;

/**
 * (06/11 soir, règle de Nico : « un compte ne doit JAMAIS être attribué à un serveur incapable de le servir ») CE QUE CE
 * SERVEUR PEUT SERVIR, déclaré à chaque battement (details.service) et lu par cloud_serveur_choisir (pure : testée) :
 *   · apte      : il peut RECEVOIR un compte — Chrome officiel, puce allumée, rendu réel LU dans un de ses navigateurs
 *                 (ou par la vérification hors réseau d'un serveur neuf : etat/rendu-serveur.json), jamais logiciel ;
 *   · incapable : il ne doit plus GARDER ses comptes — moteur sans Chrome officiel, puce coupée, rendu logiciel lu
 *                 (un rendu encore inconnu, juste après un démarrage, n'est PAS une incapacité) ;
 *   · comptes   : « tous », ou la liste COMPTES_AUTORISES (un compte hors liste ne lui est jamais attribué).
 */
export function serviceDuServeur({ config, rendu = null }) {
  const raisons = [];
  if (config?.moteurNavigateur !== 'chrome') raisons.push('moteur_sans_chrome_officiel');
  if (config?.navigateurGpu !== true) raisons.push('sans_puce');
  if (!rendu?.rendu) raisons.push('rendu_inconnu');
  else if (rendu.logiciel) raisons.push('rendu_logiciel');
  const liste = (config?.comptesAutorises ?? []).filter((u) => /^[0-9a-f-]{36}$/i.test(u));
  return {
    v: 1, apte: raisons.length === 0, incapable: raisons.some((r) => r !== 'rendu_inconnu'), raisons,
    moteur: config?.moteurNavigateur ?? null, puce: config?.navigateurGpu === true,
    rendu: rendu?.rendu ?? null, rendu_le: rendu?.le ?? null, rendu_source: rendu?.source ?? null,
    comptes: (config?.comptesAutorises ?? []).length ? liste : 'tous',
  };
}

/**
 * (06/11 soir, décision de Nico : « alerte vers support@ quand le serveur atteint 60 à 70 % de sa capacité réelle » ;
 * 07/11, décision 4 : à 80 %) L'ALERTE DE CAPACITÉ (pure : testée) — atteinte dès qu'UN taux dépasse le seuil
 * (coin_config cloud_capacite_alerte_pct, 80 par défaut) : comptes servis / capacité (la capacité ATTEIGNABLE mesurée en
 * capacité automatique, NAVIGATEURS_MAX sinon) ; et, par la dernière mesure de l'hôte (cloud_mesures, agent
 * fillsell-mesure, fraîche de moins de 15 min) : mémoire utilisée (hors cache récupérable), processeur et puce moyens
 * sur 5 min. Une mesure absente ou vieille ne déclenche rien (elle n'est que dite : mesure_fraiche = false).
 */
export const SEUIL_CAPACITE_PCT = 80;
// (19/11, décision de Nico) Le mail à Nico quand on approche de la limite réelle (ou au premier signe grave) : UNE alerte
// nommée, clé = le serveur, un mail par incident (supabase/functions/_shared/alertes-nico.js, catégorie cloud_capacite).
export const ALERTE_CAPACITE = 'orchestrateur.capacite_limite';

/**
 * (19/11/2026, DÉCISION DE NICO — « plus de plafond fixe à 30 » ; remplace la règle du 07/11, décision 4, qui bornait à
 * CAPACITE_PLAFOND 30 et à comptes_max + 5 OUVERTS) LA CAPACITÉ RÉELLE ET SES PALIERS (pures : testées par
 * scripts/cloud-capacite-paliers-selftest.mjs). Mesure du 19/11 11:43 sur cloud-2 : 64 Go, 12 navigateurs = 17,8 % de
 * mémoire, processeur 1 % — environ 1,3 Go RÉEL par navigateur au pire moment (le « 2 Go » était le plafond du conteneur,
 * cache compris).
 *
 * capaciteReelle (la limite du serveur, « atteignable ») : `mesures` = cloud_capacite_mesures(serveur, 168) ; sur CHAQUE
 * fenêtre de 5 min de la semaine (le PIRE moment, jamais une moyenne ni un centile des fenêtres) :
 *   conso  = la plus grande de : 95e centile, sur les comptes, de la mémoire NON récupérable de chaque compte à son pire
 *            moment (conso_compte_pire_mo) ; mémoire utilisée de l'hôte par navigateur ouvert au pire moment, socle
 *            compris (conso_hote_pire_mo) ;
 *   mémoire    : ouverts + (total − réserve − mémoire utilisée) / conso, réserve = max(20 % du total, 6 Gio) : TOUJOURS
 *                au moins 20 % de mémoire libre (et jamais moins des 6 Gio de la règle chiffrée du 06/11) ;
 *   processeur : ouverts × 60 / processeur p95 de l'hôte (marge de 40 %, règle du 06/11) ;
 *   puce       : ouverts × 60 / puce p95 (idem) ;
 *   atteignable = min des trois sur toutes les fenêtres, sous la seule BORNE DE SÉCURITÉ 250 (le réseau des navigateurs
 *   172.31.0.0/24 : au-delà, un navigateur n'a plus d'adresse). Plus aucune borne à 30, plus aucune borne à 2 Go.
 *   Avant la migration 20261119170000 (pas de `detail`) : les anciennes clés (n_mem à 70 % sur la mémoire du conteneur,
 *   cache compris, au 5e centile) — une limite PRUDENTE (26 le 19/11), source « ancienne ».
 *
 * capaciteMesuree (la capacité VENDUE : cloud_serveurs.capacite → cloud_places_libres, et le plafond des navigateurs du
 * planificateur) — comparée aux comptes SERVIS (ceux qui prennent une place, essais en grâce compris), jamais aux seuls
 * ouverts :
 *   · signe grave (mémoire sous la réserve, processeur ou puce saturés ≥ 90 %, oom, restriction ou blocage d'une
 *     plateforme) dans les 24 dernières heures → BLOQUÉE : capacité = comptes servis, immédiatement (plus aucune place,
 *     plus aucune nouvelle ouverture) ; jamais en dessous : aucun client déjà servi n'est coupé ;
 *   · limite réelle sous la capacité → elle redescend tout de suite à max(limite, servis) ;
 *   · MONTÉE PAR PALIERS de +PALIER (CAPACITE_AVANCE, 5) : seulement quand le palier est ATTEINT (servis à 2 places ou
 *     moins de la capacité) et TENU (24 h de mesures SAINES, couvertes à 80 % au moins, depuis qu'il a été posé — au
 *     déploiement, les 24 h déjà mesurées saines comptent : décision de Nico du 19/11), jamais au-delà de la limite réelle.
 *     24 h : un cycle complet de la journée (créneaux de republication, relevés de nuit ; les pics de la puce du 13 au 18/11
 *     sont tombés à 13:38, 14:24, 20:24, 21:30, 23:58 et 02:06 — moins d'un jour pouvait en manquer un) ;
 *   · mesures insuffisantes (< 12 h, fonction absente) → la capacité du moment, rien ne monte (un signe grave bloque).
 */
export const FENETRES_MIN_CAPACITE = 144;
export const HEURES_CAPACITE = 168;              // la fenêtre de la limite réelle : une semaine (week-end compris)
export const RESERVE_MEMOIRE_PCT = 20;           // décision de Nico du 19/11 : toujours au moins 20 % de mémoire libre
export const RESERVE_MEMOIRE_MIN_MO = 6144;      // règle chiffrée du 06/11 : jamais moins de 6 Gio disponibles
export const PROCESSEUR_MAX_PCT = 60;            // règle chiffrée du 06/11
export const PUCE_MAX_PCT = 60;                  // règle chiffrée du 06/11
export const SATURE_PCT = 90;                    // processeur ou puce saturés sur une fenêtre : signe grave
export const PALIER_COMPTES = 5;                 // CAPACITE_AVANCE
export const PALIER_DUREE_MS = 24 * 3600_000;    // un palier se tient 24 h ; un signe grave bloque 24 h
export const PALIER_PLACES = 2;                  // le palier est atteint à 2 places libres ou moins
export const PALIER_COUVERTURE = 0.8;            // 80 % des fenêtres de 5 min des 24 h mesurées
export const BORNE_SECURITE = 250;               // réseau des navigateurs 172.31.0.0/24
const FENETRE_MS = 5 * 60_000;
const nombre = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const fini = (v) => (Number.isFinite(v) ? v : null);

/** La réserve de mémoire toujours libre (Mo, pure) : max(20 % du total, 6 Gio). */
export const reserveMemoireMo = (totalMo) => Math.max(Math.ceil((Number(totalMo) * RESERVE_MEMOIRE_PCT) / 100), RESERVE_MEMOIRE_MIN_MO);

/** Le détail des fenêtres (migration 20261119170000) ; null avant elle (pure). */
export function fenetresDetail(mesures) {
  if (!Array.isArray(mesures?.detail)) return null;
  return mesures.detail.filter(Array.isArray).map(([t, n, utilisee, cpu, puce, oom, graves]) => ({
    t: Number(t) * 1000, n: nombre(n), utilisee: nombre(utilisee), cpu: nombre(cpu), puce: nombre(puce),
    oom: Number(oom) || 0, graves: Number(graves) || 0 }));
}

/** Une ligne de cloud_mesures (le, hote, comptes) → une fenêtre du même modèle (pure). */
export function fenetreDeMesure(l) {
  const h = l?.hote ?? {};
  const total = nombre(h.mem_total_mo); const dispo = nombre(h.mem_dispo_min_mo);
  let oom = 0; let graves = 0;
  for (const v of Object.values(l?.comptes && typeof l.comptes === 'object' ? l.comptes : {})) {
    if (!v || typeof v !== 'object') continue;
    oom += Number(v.oom) || 0;
    graves += (Number(v.signes?.restriction) || 0) + (Number(v.signes?.blocage) || 0);
  }
  return { t: Date.parse(l?.le ?? ''), n: nombre(h.navigateurs_max), utilisee: total != null && dispo != null ? total - dispo : null,
    total, cpu: nombre(h.cpu_p95_pct), puce: nombre(h.puce_p95_pct), oom, graves };
}

/** Les signes GRAVES d'une fenêtre (pure) : [] = saine. */
export function signesGraves(f, totalMo = f?.total) {
  const r = [];
  if (!f) return r;
  const total = nombre(totalMo);
  if (total > 0 && f.utilisee != null && total - f.utilisee < reserveMemoireMo(total)) r.push('memoire_sous_reserve');
  if (f.cpu != null && f.cpu >= SATURE_PCT) r.push('processeur_sature');
  if (f.puce != null && f.puce >= SATURE_PCT) r.push('puce_saturee');
  if (f.oom > 0) r.push('oom');
  if (f.graves > 0) r.push('restriction_ou_blocage');
  return r;
}

/** LA LIMITE RÉELLE du serveur (pure) — voir plus haut. Rend { source, atteignable, n_mem, n_cpu, n_puce, conso_mo, reserve_mo }. */
export function capaciteReelle(mesures, { borne = BORNE_SECURITE } = {}) {
  const m = mesures ?? {};
  const fen = fenetresDetail(m);
  const total = nombre(m.mem_total_mo);
  const conso = Math.max(nombre(m.conso_compte_pire_mo) ?? 0, nombre(m.conso_hote_pire_mo) ?? 0);
  if (fen && total > 0 && conso > 0) {
    const reserve = reserveMemoireMo(total);
    let mem = Infinity; let cpu = Infinity; let puce = Infinity;
    for (const f of fen) {
      if (!(f.n >= 1)) continue;
      if (f.utilisee != null) mem = Math.min(mem, f.n + (total - reserve - f.utilisee) / conso);
      if (f.cpu > 0) cpu = Math.min(cpu, (f.n * PROCESSEUR_MAX_PCT) / f.cpu);
      if (f.puce > 0) puce = Math.min(puce, (f.n * PUCE_MAX_PCT) / f.puce);
    }
    if (Number.isFinite(mem)) {
      return { source: 'reelle', atteignable: Math.max(0, Math.floor(Math.min(mem, cpu, puce, borne))),
        n_mem: Math.floor(mem), n_cpu: fini(Math.floor(cpu)), n_puce: fini(Math.floor(puce)), conso_mo: Math.round(conso), reserve_mo: reserve };
    }
  }
  if (nombre(m.n_mem) != null && Number(m.mem_compte_p95_mo) > 0) {
    return { source: 'ancienne', atteignable: Math.max(0, Math.floor(Math.min(nombre(m.n_mem), nombre(m.n_cpu) ?? Infinity, nombre(m.n_puce) ?? Infinity, borne))),
      n_mem: nombre(m.n_mem), n_cpu: nombre(m.n_cpu), n_puce: nombre(m.n_puce), conso_mo: Math.round(Number(m.mem_compte_p95_mo)), reserve_mo: null };
  }
  return { source: null, atteignable: null };
}

/** LA CAPACITÉ VENDUE et ses paliers (pure) — voir plus haut. */
export function capaciteMesuree({ depart, theorique = null, palier = PALIER_COMPTES, actuelle = null, comptesServis = 0, mesures = null,
  palierLe = null, graveLe = null, maintenant = Date.now(), fenetresMin = FENETRES_MIN_CAPACITE, borne = BORNE_SECURITE }) {
  const now = Number(maintenant);
  const servis = Math.max(0, Math.floor(Number(comptesServis) || 0));
  const pas = Math.max(1, Math.floor(Number(palier) || PALIER_COMPTES));
  const m = mesures ?? {};
  const reelle = capaciteReelle(m, { borne });
  const fen = fenetresDetail(m);
  // Le dernier signe grave : celui gardé (vu au battement, relu au démarrage) ou une fenêtre du détail.
  let grave = nombre(graveLe);
  let raisonsGraves = [];
  for (const f of fen ?? []) {
    const s = signesGraves(f, m.mem_total_mo);
    if (s.length && Number.isFinite(f.t) && (grave == null || f.t >= grave)) { grave = f.t; raisonsGraves = s; }
  }
  const bloquee = grave != null && now - grave < PALIER_DUREE_MS;
  const dep = Math.max(1, Math.min(Math.floor(Number(depart) || 1), nombre(theorique) ?? Infinity, borne));
  const mesure = Number(m.fenetres) >= fenetresMin && reelle.atteignable != null;
  const A = mesure ? reelle.atteignable : null;
  const actuelleC = nombre(actuelle) != null ? Math.floor(nombre(actuelle)) : (A != null ? Math.min(dep, A) : dep);
  const base = { atteignable: Math.max(A ?? actuelleC, servis), projection: A, observe: nombre(m.comptes_max), reelle, servis,
    graveLe: grave, raisonsGraves, bloquee };
  if (bloquee) return { ...base, capacite: servis, raison: 'bloquee_signe_grave', palierLe: grave, retenue: true };
  if (A == null) return { ...base, capacite: Math.max(actuelleC, servis), raison: 'mesures_insuffisantes', palierLe: nombre(palierLe), retenue: false };
  if (A < actuelleC) return { ...base, capacite: Math.max(A, servis), raison: 'mesures_baisse', palierLe: now, retenue: false };
  // Le palier TENU : 24 h depuis qu'il est posé (inconnu = au déploiement : les mesures en décident), mesurées saines
  // (aucun signe grave : sinon, bloquée plus haut) et couvertes à 80 % ; avant la migration, aucun oom ni signe grave
  // sur la fenêtre des anciennes clés.
  const posee = nombre(palierLe);
  const couvertes = fen ? fen.filter((f) => Number.isFinite(f.t) && now - f.t < PALIER_DUREE_MS).length
    : Number(m.fenetres) || 0;
  const retenue = !fen && (Number(m.graves_7j) > 0 || Number(m.oom) > 0);
  const tenu = (posee == null || now - posee >= PALIER_DUREE_MS) && couvertes >= Math.floor((PALIER_COUVERTURE * PALIER_DUREE_MS) / FENETRE_MS) && !retenue;
  const atteint = servis >= actuelleC - PALIER_PLACES;
  if (atteint && tenu && A > actuelleC) {
    return { ...base, capacite: Math.max(Math.min(actuelleC + pas, A), servis), raison: 'palier', palierLe: now, retenue };
  }
  const raison = retenue ? 'retenue_signes' : A <= actuelleC ? 'limite_reelle' : !atteint ? 'palier_non_atteint' : 'palier_en_cours';
  return { ...base, capacite: Math.max(actuelleC, servis), raison, palierLe: posee, retenue };
}
export function alerteCapacite({ comptes, capacite, mesure = null, seuilPct = SEUIL_CAPACITE_PCT, maintenant = Date.now() }) {
  const taux = {};
  if (Number(capacite) > 0 && Number.isFinite(Number(comptes))) taux.comptes = Math.round((100 * Number(comptes)) / Number(capacite));
  const h = mesure && Date.parse(mesure.le) > maintenant - 15 * 60_000 ? mesure.hote ?? {} : null;
  if (h) {
    for (const [nom, cle] of [['memoire', 'mem_utilisee_max_pct'], ['processeur', 'cpu_moy_pct'], ['puce', 'puce_moy_pct']]) {
      if (h[cle] != null && Number.isFinite(Number(h[cle]))) taux[nom] = Number(h[cle]);
    }
  }
  const raisons = Object.entries(taux).filter(([, v]) => v >= seuilPct).map(([k, v]) => `${k} ${Math.round(v)} %`);
  return { atteint: raisons.length > 0, raisons, taux, seuilPct, mesure_fraiche: Boolean(h) };
}

/**
 * (06/11 soir, règle de Nico : « quand ces conditions sont réunies, l'alerte me le dit, et je décide ») Le texte de
 * l'alerte de passage à 30 comptes (pure : testée), d'après une ligne de la vue cloud_passage_30 ; null si les conditions
 * ne sont pas TOUTES réunies ou si le serveur a déjà 30 places.
 */
export function textePassage30(l, capacite) {
  if (!l?.conditions_reunies || !(Number(capacite) < 30)) return null;
  const pct = (a, b) => (Number(b) > 0 ? Math.round((100 * Number(a)) / Number(b)) : '?');
  return `Passage à 30 comptes possible sur ${l.serveur} (aujourd'hui ${capacite}) : toutes les conditions de la règle sont réunies sur 7 jours — `
    + `${l.comptes_p20} comptes ou plus sur 80 % des fenêtres (${l.fenetres}) ; mémoire projetée ${Math.round(Number(l.mem_proj_p95_mo) / 1024)} Go `
    + `(${pct(l.mem_proj_p95_mo, l.total)} %) ; processeur projeté ${l.cpu_proj_p95_pct} % ; puce projetée ${l.puce_proj_p95_pct} % ; `
    + `${l.jobs} jobs, ${pct(l.rates, l.jobs)} % ratés, p95 ${l.duree_p95_s} s ; bridage ${l.bride_med} (référence ${l.bride_med_reference}) ; `
    + `signes ${l.signes_par_compte_jour} par compte et par jour (référence ${l.signes_par_compte_jour_reference}), aucune restriction ni blocage. `
    + `Décision de Nico : NAVIGATEURS_MAX=30 (docs/cloud/REPRISE.md, « Passer de 15 à 30 »).`;
}

/** Le nom du prochain serveur (pure) : cloud-<plus grand numéro + 1>, au moins cloud-2. */
export function prochainNomServeur(serveurs) {
  const n = Math.max(1, ...(serveurs ?? []).map((s) => numeroServeur(s?.nom) ?? 0));
  return `cloud-${n + 1}`;
}
/** L'adresse d'un serveur neuf (pure) : cloud-2.fillsell.app… (cloud-1 garde cloud.fillsell.app). */
export const domaineDuServeur = (nom) => `${nom}.fillsell.app`;

/**
 * LA DÉCISION (pure : testée). places libres = cloud_places_libres (rendu par le battement) ou, à défaut, la somme
 * des places des serveurs vivants. Sous le seuil : UN serveur neuf, préparé par le seul DOYEN, jamais pendant une
 * création en cours ; une création bloquée (> 45 min) ne se relance pas seule : elle se dit.
 */
export function planFlotte({ serveurs = [], placesLibres = null, seuilPlacesLibres = 2, nomCourant = null, maintenant = Date.now() }) {
  const vivants = (serveurs ?? []).filter((s) => estVivant(s, maintenant));
  const calculees = vivants.reduce((n, s) => n + Math.max(0, (Number(s.capacite) || 0) - (Number(s.comptes) || 0)), 0);
  const libres = Number.isFinite(Number(placesLibres)) && placesLibres != null ? Number(placesLibres) : calculees;
  const seuil = Math.max(0, Number(seuilPlacesLibres) || 0);
  const doyen = vivants.map((s) => s.nom).sort(ordreNoms)[0] ?? null;
  const creations = (serveurs ?? []).filter((s) => s?.etat === 'en_creation');
  const enCours = creations.filter((s) => maintenant - Date.parse(s.cree_le ?? '') < CREATION_EN_COURS_MS);
  const bloquees = creations.filter((s) => !(maintenant - Date.parse(s.cree_le ?? '') < CREATION_EN_COURS_MS));
  const base = { placesLibres: libres, seuil, sousLeSeuil: libres < seuil, doyen, vivants: vivants.length };
  if (!base.sousLeSeuil) return { ...base, creer: 0, raison: 'places_suffisantes' };
  if (enCours.length) return { ...base, creer: 0, raison: 'creation_en_cours', enCreation: enCours.map((s) => s.nom) };
  if (bloquees.length) return { ...base, creer: 0, raison: 'creation_bloquee', enCreation: bloquees.map((s) => s.nom) };
  if (nomCourant && doyen && nomCourant !== doyen) return { ...base, creer: 0, raison: 'pas_le_doyen' };
  if (!doyen) return { ...base, creer: 0, raison: 'aucun_serveur_vivant' };
  return { ...base, creer: 1, raison: 'sous_le_seuil', nom: prochainNomServeur(serveurs), domaine: domaineDuServeur(prochainNomServeur(serveurs)) };
}

/** Le .env d'un serveur neuf (pure) : celui du serveur qui crée (même coffre, mêmes clés), nom et adresse propres. */
export function envPourNouveauServeur(texte, { nom, domaine }) {
  const remplacer = { SERVEUR_NOM: nom, DOMAINE: domaine, ENDURANCE: '0', NAVIGATEURS_MAX: '' };
  const vus = new Set();
  const lignes = String(texte ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => {
    const m = /^([A-Z0-9_]+)=/.exec(l);
    if (!m || !(m[1] in remplacer)) return l;
    vus.add(m[1]);
    return `${m[1]}=${remplacer[m[1]]}`;
  });
  for (const [k, v] of Object.entries(remplacer)) if (!vus.has(k)) lignes.push(`${k}=${v}`);
  return lignes.join('\n').replace(/\n*$/, '\n');
}

const SUR = {
  sha: /^[0-9a-f]{7,40}$/, domaine: /^[a-z0-9][a-z0-9.-]{1,120}$/, image: /^ghcr\.io\/[a-z0-9./-]+@sha256:[0-9a-f]{64}$/,
  destinations: /^[0-9.:,]*$/, url: /^https:\/\/[^\s'"]+$/,
};
const verifier = (nom, v) => { if (!SUR[nom].test(String(v ?? ''))) throw new Error(`flotte : ${nom} refusé (${String(v).slice(0, 40)})`); return v; };

/**
 * Le script d'amorce d'un serveur neuf (pure) : le socle de outils/installer-serveur.sh, puis les gestes distants de
 * outils/deployer.sh (paquet téléchargé par URL signée au lieu de scp). ⚠️ Miroir de ces deux scripts : les garder
 * d'accord.
 */
export function amorcePour({ sha, domaine, imageSteel, urlPaquet, destinations = '' }) {
  verifier('sha', sha); verifier('domaine', domaine); verifier('image', imageSteel); verifier('destinations', destinations);
  verifier('url', urlPaquet);
  return `#!/bin/bash
# FillSell Cloud — amorce d'un serveur neuf (flotte.js). Journal : /var/log/fillsell-amorce.log
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
SHA='${sha}'; DOMAINE='${domaine}'; IMAGE_STEEL='${imageSteel}'; DESTINATIONS='${destinations}'
P="/srv/fillsell-cloud/paquets/$SHA"
apt-get update -qq
apt-get install -yq --no-install-recommends docker.io docker-compose-v2 iptables fail2ban unattended-upgrades rsync jq curl >/dev/null
mkdir -p /etc/ssh/sshd_config.d /etc/docker
printf 'PasswordAuthentication no\\nKbdInteractiveAuthentication no\\nPermitRootLogin prohibit-password\\n' > /etc/ssh/sshd_config.d/90-fillsell.conf
cat > /etc/systemd/system/fillsell-pare-feu.service <<'F'
[Unit]
Description=FillSell Cloud - les navigateurs ne sortent que par les proxys IPRoyal
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
[Install]
WantedBy=multi-user.target
F
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" }, "live-restore": true }' > /etc/docker/daemon.json
mkdir -p /srv/fillsell-cloud/profils /srv/fillsell-cloud/extension /srv/fillsell-cloud/deploiement /srv/fillsell-cloud/caddy/data /srv/fillsell-cloud/caddy/config /srv/fillsell-cloud/etat /srv/fillsell-cloud/paquets
chmod 700 /srv/fillsell-cloud
systemctl restart ssh
systemctl enable --now docker >/dev/null 2>&1
systemctl restart docker
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1
install -m 600 /root/fillsell-env /srv/fillsell-cloud/.env && rm -f /root/fillsell-env
curl -fsS --retry 5 --retry-delay 10 '${urlPaquet}' -o /root/paquet.tgz
rm -rf "$P" && mkdir -p "$P" && tar xzf /root/paquet.tgz -C "$P" && rm -f /root/paquet.tgz
docker pull -q "$IMAGE_STEEL" >/dev/null
docker build -q -t "fillsell-orchestrateur:$SHA" "$P" >/dev/null
LOC=/srv/fillsell-cloud/etat/chromium-locales
VCHR=$(docker run --rm --network none --entrypoint dpkg-query "$IMAGE_STEEL" -W -f '\${Version}' chromium 2>/dev/null || true)
if [ -n "$VCHR" ]; then
  mkdir -p "$LOC"
  docker run --rm --network bridge -u 0 -v "$LOC:/out" --entrypoint sh "$IMAGE_STEEL" -c \\
    "apt-get -qq update >/dev/null && cd /tmp && apt-get -qq download chromium-l10n=$VCHR && dpkg-deb -x chromium-l10n_*.deb x \\
     && cp x/usr/lib/chromium/locales/fr.pak /out/fr.pak && echo $VCHR > /out/VERSION" || echo "fr.pak non récupéré"
fi
rm -rf /srv/fillsell-cloud/extension && cp -r "$P/extension" /srv/fillsell-cloud/extension
cp -r "$P"/deploiement/. /srv/fillsell-cloud/deploiement/
# Les unités du pare-feu (deploiement/systemd/ : dont fillsell-pare-feu-maj.path, qui rejoue le pare-feu quand
# l'orchestrateur change etat/proxys-permis.txt) remplacent celle écrite plus haut.
for u in "$P"/deploiement/systemd/*.service "$P"/deploiement/systemd/*.path "$P"/deploiement/systemd/*.timer; do [ -f "$u" ] && cp "$u" /etc/systemd/system/; done
if [ -n "$DESTINATIONS" ]; then printf '%s\\n' "$DESTINATIONS" | tr ',' '\\n' > /srv/fillsell-cloud/deploiement/proxys-permis.txt; fi
printf 'VERSION_ORCHESTRATEUR=%s\\nDOMAINE=%s\\n' "$SHA" "$DOMAINE" > /srv/fillsell-cloud/deploiement/.env
docker network inspect fillsell-cloud >/dev/null 2>&1 || docker network create --driver bridge --subnet 172.31.0.0/24 -o com.docker.network.bridge.name=br-fillsell -o com.docker.network.bridge.enable_icc=false fillsell-cloud >/dev/null
systemctl daemon-reload
systemctl enable fillsell-pare-feu.service >/dev/null 2>&1
for u in "$P"/deploiement/systemd/*.path "$P"/deploiement/systemd/*.timer; do [ -f "$u" ] && systemctl enable --now "$(basename "$u")" >/dev/null 2>&1; done
sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
cd /srv/fillsell-cloud/deploiement
VERSION_ORCHESTRATEUR="$SHA" DOMAINE="$DOMAINE" docker compose up -d
echo "amorcé : $SHA sur $DOMAINE"
`;
}

/** Le cloud-init d'un serveur neuf (pure) : l'amorce et le .env en fichiers (base64), lancés une fois. */
export function cloudInitPour({ amorce, envTexte }) {
  const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  const texte = `#cloud-config
write_files:
  - path: /root/fillsell-amorce.sh
    permissions: '0700'
    encoding: b64
    content: ${b64(amorce)}
  - path: /root/fillsell-env
    permissions: '0600'
    encoding: b64
    content: ${b64(envTexte)}
runcmd:
  - [ bash, -c, "bash /root/fillsell-amorce.sh > /var/log/fillsell-amorce.log 2>&1" ]
`;
  if (Buffer.byteLength(texte, 'utf8') > USER_DATA_MAX) throw new Error(`flotte : user_data de ${Buffer.byteLength(texte)} octets (> ${USER_DATA_MAX})`);
  return texte;
}

/** Le corps EXACT de POST /v1/servers (pure). */
export function corpsCreationHetzner({ nom, type, lieu, userData, cleSsh = [], pareFeu = null }) {
  return {
    name: `fillsell-${nom}`, server_type: type, location: lieu, image: IMAGE_SERVEUR, start_after_create: true,
    user_data: userData, ssh_keys: cleSsh, ...(pareFeu ? { firewalls: [{ firewall: pareFeu }] } : {}),
    public_net: { enable_ipv4: true, enable_ipv6: true },
    labels: { fillsell: 'cloud', serveur: nom },
  };
}

/** Un résumé SANS secret du plan (le user_data n'y est que par sa taille et son empreinte). */
export function resumePlan(plan) {
  const ud = plan?.corps?.user_data;
  return {
    ...plan, corps: plan?.corps ? { ...plan.corps, user_data: ud ? `<${Buffer.byteLength(ud)} octets, sha256 ${createHash('sha256').update(ud).digest('hex').slice(0, 16)}>` : null } : null,
  };
}

/** Le client de l'API Hetzner Cloud (GET libres ; POST seulement par executer, derrière les deux interrupteurs). */
export function creerClientHetzner({ jeton, fetch: f = globalThis.fetch }) {
  const appel = async (methode, chemin, corps) => {
    if (!jeton) throw new Error('Hetzner : jeton absent (HCLOUD_TOKEN)');
    const r = await f(`https://api.hetzner.cloud/v1${chemin}`, {
      method: methode, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: corps == null ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Hetzner ${methode} ${chemin} → HTTP ${r.status} ${d?.error?.code ?? ''}`);
    return d;
  };
  return { disponible: Boolean(jeton), get: (c) => appel('GET', c), post: (c, b) => appel('POST', c, b) };
}

/** Le client Cloudflare (DNS du serveur neuf, nuage gris). */
export function creerClientCloudflare({ jeton, fetch: f = globalThis.fetch }) {
  const appel = async (methode, chemin, corps) => {
    const r = await f(`https://api.cloudflare.com/client/v4${chemin}`, {
      method: methode, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: corps == null ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.success === false) throw new Error(`Cloudflare ${methode} ${chemin} → HTTP ${r.status}`);
    return d;
  };
  return {
    disponible: Boolean(jeton),
    async poserA(domaine, ipv4) {
      const zone = (await appel('GET', '/zones?name=fillsell.app')).result?.[0]?.id;
      if (!zone) throw new Error('Cloudflare : zone fillsell.app introuvable');
      return appel('POST', `/zones/${zone}/dns_records`, { type: 'A', name: domaine, content: ipv4, ttl: 60, proxied: false });
    },
  };
}

/** Le paquet courant en tar.gz (pour le serveur neuf), lu sur le disque du serveur qui crée. */
function empaqueterDefaut(dossier) {
  return new Promise((ok, ko) => {
    const p = spawn('tar', ['czf', '-', '-C', dossier, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const morceaux = []; let err = '';
    p.stdout.on('data', (d) => morceaux.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', ko);
    p.on('close', (c) => (c === 0 ? ok(Buffer.concat(morceaux)) : ko(new Error(`tar : ${err.slice(0, 200)}`))));
  });
}

export function creerFlotte({ config, base, navigateurs, journal, alertes, hetzner = null, cloudflare = null,
  lireFichier = (p) => readFile(p, 'utf8'), empaqueter = empaqueterDefaut, maintenant = () => Date.now() }) {
  const hz = hetzner ?? creerClientHetzner({ jeton: config.hetznerJeton });
  const cf = cloudflare ?? creerClientCloudflare({ jeton: config.cloudflareJeton });
  let dernierBattement = null;
  let absente = false;
  let derniereAlerteSeuil = 0;
  let derniereAlerteCapacite = 0;
  let derniereLecturePassage = 0;
  let derniereAlertePassage = 0;
  let dernierPlanJournalise = '';
  // (07/11, décision 4) LA CAPACITÉ DU MOMENT : fixe (NAVIGATEURS_MAX) ou mesurée (capaciteMesuree, relue chaque heure).
  const auto = config.navigateursMaxAuto === true;
  let capaciteCourante = Math.max(0, Number(config.navigateursMax) || 0);
  let etatCapacite = { capacite: capaciteCourante, atteignable: capaciteCourante, raison: auto ? 'depart' : 'fixe' };
  let derniereEvaluation = 0;
  // (19/11, décision de Nico) Les PALIERS : l'instant où la capacité vendue a été posée et celui du dernier signe grave,
  // déclarés à chaque battement (details.capacite) et relus UNE fois au démarrage (un redémarrage ne remet aucun palier à
  // zéro). La dernière mesure de l'hôte est relue au plus toutes les 5 min (une fenêtre) pour bloquer au premier signe grave.
  let palierLe = null;
  let graveLe = null;
  let restaure = false;
  let derniereLectureSignes = 0;
  let derniereFenetreVue = null;
  let incidentCapacite = false;
  // (13/11) LE FILET DE CAPACITÉ (filetCapacite.js) : ses deux seuils, relus avec les autres réglages (tour(), 10 min).
  let seuilsFilet = { filePct: FILET_FILE_PCT, arretPct: FILET_ARRET_PCT };

  /**
   * (13/11) Ce que lit le filet à chaque tour du planificateur (rien de la base : la mémoire de ce tour-ci) — la capacité
   * RÉELLE (celle de l'alerte de capacité : atteignable mesurée en automatique, NAVIGATEURS_MAX sinon), les places libres
   * de la flotte rendues par le dernier battement (null = inconnues : jamais d'arrêt), les deux seuils.
   */
  function etatFilet() {
    return { capaciteReelle: auto ? etatCapacite.atteignable : capaciteCourante,
      placesLibres: dernierBattement?.places_libres ?? null, ...seuilsFilet };
  }

  /**
   * (19/11) Au démarrage, UNE lecture de la ligne de CE serveur (cloud_serveurs) : la capacité vendue et ses paliers
   * reprennent où ils étaient. Ligne absente (serveur neuf) : le départ. Lecture ratée : le palier part de maintenant
   * (jamais deux paliers en moins de 24 h à cause d'un redémarrage).
   */
  async function restaurer() {
    restaure = true;
    try {
      const { data, error } = await base.from('cloud_serveurs').select('nom, capacite, details').eq('nom', config.serveurNom).limit(1);
      if (error) throw new Error(error.message);
      const l = (Array.isArray(data) ? data : [data]).find((x) => x?.nom === config.serveurNom) ?? null;
      if (!l) return;
      const instant = (v) => { const t = Date.parse(v ?? ''); return Number.isFinite(t) ? t : null; };
      if (Number(l.capacite) > 0) capaciteCourante = Math.floor(Number(l.capacite));
      palierLe = instant(l.details?.capacite?.palier_le);
      graveLe = instant(l.details?.capacite?.grave_le);
    } catch { palierLe = maintenant(); }
  }

  /** Les comptes SERVIS par ce serveur : ceux du dernier battement, sinon la liste de la base. */
  async function comptesServis() {
    const c = dernierBattement?.comptes;
    if (Number.isFinite(Number(c)) && c != null) return Number(c);
    return (await lireComptesDuServeur(base, config.serveurNom).catch(() => null))?.comptes?.length ?? 0;
  }

  /**
   * (07/11, décision 4 ; 19/11, décision de Nico) La capacité réévaluée sur les MESURES (cloud_capacite_mesures, 7 jours :
   * capaciteMesuree, paliers) ; au démarrage (avant le premier tour du planificateur) puis une fois par heure. Un
   * changement est journalisé (cloud_pool_alertes, sans mail : le mail ne part qu'à l'approche de la limite, tour()).
   */
  async function evaluerCapacite() {
    if (!auto) return etatCapacite;
    if (!restaure) await restaurer();
    derniereEvaluation = maintenant();
    let mesures = null;
    try {
      const { data, error } = await base.rpc('cloud_capacite_mesures', { p_serveur: config.serveurNom, p_heures: HEURES_CAPACITE });
      mesures = error ? null : data;
    } catch { mesures = null; }
    const servis = await comptesServis();
    const r = capaciteMesuree({ depart: config.capaciteDepart ?? 15, theorique: config.capaciteTheorique ?? null, palier: config.capaciteAvance ?? PALIER_COMPTES,
      actuelle: capaciteCourante, comptesServis: servis, mesures, palierLe, graveLe, maintenant: maintenant() });
    const avant = capaciteCourante;
    capaciteCourante = r.capacite;
    palierLe = r.palierLe ?? palierLe;
    graveLe = r.graveLe ?? graveLe;
    const { reelle, ...reste } = r;
    etatCapacite = { ...reste, source: reelle?.source ?? null, conso_mo: reelle?.conso_mo ?? null, n_mem: reelle?.n_mem ?? null,
      n_cpu: reelle?.n_cpu ?? null, n_puce: reelle?.n_puce ?? null, comptes: servis, mesures_le: mesures?.derniere_le ?? null };
    if (r.capacite !== avant) {
      journal.alerte('capacite_changee', { serveur: config.serveurNom, avant, apres: r.capacite, ...etatCapacite });
      await alertes?.signaler('serveur', `Capacité de ${config.serveurNom} : ${avant} → ${r.capacite} comptes (${r.raison} ; limite réelle ${r.atteignable}, `
        + `${servis} comptes servis, ${reelle?.conso_mo ?? '?'} Mo par navigateur au pire moment ; source ${reelle?.source ?? 'aucune'}). Aucun geste à faire.`,
      { capacite: etatCapacite });
    }
    return etatCapacite;
  }

  /**
   * (19/11, décision de Nico : « redescente IMMÉDIATE et blocage des nouvelles ouvertures au premier signe grave ») À
   * chaque battement, la dernière fenêtre de l'hôte (cloud_mesures, relue au plus toutes les 5 min) : un signe grave →
   * capacité = comptes servis tout de suite (plus aucune place ; aucun client coupé), 24 h de blocage, mail à Nico (une
   * fois par incident).
   */
  async function surveillerSignes() {
    if (!auto || maintenant() - derniereLectureSignes < FENETRE_MS) return;
    derniereLectureSignes = maintenant();
    let ligne = null;
    try {
      const { data, error } = await base.from('cloud_mesures').select('le, hote, comptes').eq('serveur', config.serveurNom)
        .order('le', { ascending: false }).limit(1);
      ligne = error ? null : (Array.isArray(data) ? data[0] : null) ?? null;
    } catch { ligne = null; }
    const f = ligne ? fenetreDeMesure(ligne) : null;
    if (!f || !Number.isFinite(f.t) || maintenant() - f.t > 15 * 60_000 || f.t === derniereFenetreVue) return;
    derniereFenetreVue = f.t;
    const raisons = signesGraves(f);
    if (!raisons.length) return;
    graveLe = Math.max(graveLe ?? 0, f.t);
    palierLe = graveLe;
    const servis = await comptesServis();
    const avant = capaciteCourante;
    capaciteCourante = servis;
    etatCapacite = { ...etatCapacite, capacite: servis, raison: 'bloquee_signe_grave', bloquee: true, graveLe, palierLe, raisonsGraves: raisons, comptes: servis };
    journal.alerte('capacite_bloquee', { serveur: config.serveurNom, avant, apres: servis, raisons, fenetre: ligne.le });
    incidentCapacite = true;
    await alertes?.signaler('serveur', `Capacité de ${config.serveurNom} BLOQUÉE à ${servis} comptes (les comptes servis) : signe grave — ${raisons.join(', ')} `
      + `(fenêtre de ${new Date(f.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}). Ventes fermées sur ce serveur, aucun client coupé ; `
      + 'reprise par paliers 24 h après le dernier signe grave. Décider d\'un 2e serveur : docs/cloud/REPRISE.md, « Ajouter un serveur ».',
    { capacite: etatCapacite }, { alerte: ALERTE_CAPACITE, cle: config.serveurNom });
  }

  /** (06/11 soir) Le rendu connu : le dernier lu dans un navigateur, sinon etat/rendu-serveur.json (relu à chaque fois). */
  async function renduConnu() {
    const r = navigateurs.dernierRendu?.();
    if (r) return r;
    try { return JSON.parse(await lireFichier(`${config.dossierEtat}/rendu-serveur.json`)); } catch { return null; }
  }

  /** (06/11 soir) La dernière mesure de l'hôte (cloud_mesures) ; null tant que la migration 20261106210000 n'est pas en base. */
  async function derniereMesure() {
    try {
      const { data, error } = await base.from('cloud_mesures').select('le, hote').eq('serveur', config.serveurNom)
        .order('le', { ascending: false }).limit(1);
      return error ? null : (data?.[0] ?? null);
    } catch { return null; }
  }

  /** (06/11 soir) La ligne de CE serveur dans cloud_passage_30 ; null tant que la migration 20261106210000 n'est pas en base. */
  async function lirePassage30() {
    try {
      const { data, error } = await base.from('cloud_passage_30').select('*').eq('serveur', config.serveurNom).limit(1);
      return error ? null : (data?.[0] ?? null);
    } catch { return null; }
  }

  async function battre() {
    // (19/11) Un signe grave dans la dernière fenêtre : la capacité tombe aux comptes servis AVANT ce battement.
    if (auto) await surveillerSignes().catch((e) => journal.alerte('capacite_signes_echec', { erreur: e.message }));
    const service = serviceDuServeur({ config, rendu: await renduConnu() });
    const iso = (t) => (Number.isFinite(t) && t != null ? new Date(t).toISOString() : null);
    const appel = () => base.rpc('cloud_serveur_battre', {
      p_nom: config.serveurNom, p_domaine: config.domaine, p_ipv4: config.serveurIpv4 || null,
      p_capacite: capaciteCourante, p_ouverts: navigateurs.ouverts().length,
      p_details: { capacite_auto: auto, memoire_navigateur: config.memoireNavigateur, service,
        ...(auto ? { capacite: { raison: etatCapacite.raison, atteignable: etatCapacite.atteignable, depart: config.capaciteDepart ?? 15,
          palier: config.capaciteAvance ?? PALIER_COMPTES, palier_le: iso(palierLe), grave_le: iso(graveLe), bloquee: etatCapacite.bloquee === true,
          source: etatCapacite.source ?? null, conso_mo: etatCapacite.conso_mo ?? null, borne: BORNE_SECURITE } } : {}) },
    });
    let { data, error } = await appel();
    if (error) {
      if (fonctionAbsente(error)) { if (!absente) journal.info('flotte_absente', { raison: 'migration 20261103201000 pas encore en base' }); absente = true; return null; }
      throw new Error(`cloud_serveur_battre : ${error.message}`);
    }
    // (19/11) JAMAIS sous les comptes servis ; et, BLOQUÉE, jamais au-dessus non plus : un compte parti ne rouvre pas de
    // place à la vente (le battement est refait tout de suite avec la capacité juste).
    const servis = Number(data?.comptes);
    if (auto && Number.isFinite(servis) && data?.comptes != null) {
      const juste = etatCapacite.bloquee === true ? servis : Math.max(capaciteCourante, servis);
      if (juste !== capaciteCourante) {
        const refaire = juste < capaciteCourante;
        capaciteCourante = juste;
        if (refaire) ({ data, error } = await appel());
        if (error) throw new Error(`cloud_serveur_battre : ${error.message}`);
      }
    }
    absente = false;
    dernierBattement = { ...data, le: maintenant() };
    return data;
  }

  async function reglages() {
    const { data } = await base.from('coin_config').select('key, value')
      .in('key', ['cloud_places_seuil', 'cloud_serveurs_auto', 'cloud_serveur_type', 'cloud_serveur_lieu', 'cloud_capacite_alerte_pct',
        'cloud_filet_file_pct', 'cloud_filet_arret_pct']);
    const v = Object.fromEntries((data ?? []).map((l) => [l.key, Number(l.value)]));
    seuilsFilet = reglagesFilet(v);
    return {
      seuil: Number.isFinite(v.cloud_places_seuil) ? v.cloud_places_seuil : 2,
      capaciteAlertePct: v.cloud_capacite_alerte_pct >= 10 && v.cloud_capacite_alerte_pct <= 100 ? v.cloud_capacite_alerte_pct : SEUIL_CAPACITE_PCT,
      auto: v.cloud_serveurs_auto === 1,
      type: typeDepuisCode(v.cloud_serveur_type), lieu: lieuDepuisCode(v.cloud_serveur_lieu),
    };
  }

  /** Le plan complet d'un serveur neuf — sans rien créer (le corps porte une URL de paquet factice). */
  async function preparer(decision, r) {
    const manques = [];
    const dep = config.dossierDeploiement;
    const sha = /VERSION_ORCHESTRATEUR=([0-9a-f]+)/.exec(await lireFichier(`${dep}/.env`).catch(() => ''))?.[1] ?? null;
    if (!sha) manques.push('version déployée illisible (deploiement/.env)');
    const destinations = (await lireFichier(`${dep}/proxys-permis.txt`).catch(() => '')).split(/\s+/).filter(Boolean).join(',');
    const envSource = await lireFichier(config.fichierEnv).catch(() => '');
    if (!envSource) manques.push('.env illisible');
    let cleSsh = []; let pareFeu = null;
    if (hz.disponible) {
      cleSsh = ((await hz.get('/ssh_keys').catch(() => null))?.ssh_keys ?? []).map((k) => k.id);
      pareFeu = (await hz.get('/firewalls?name=fillsell-cloud').catch(() => null))?.firewalls?.[0]?.id ?? null;
      if (!cleSsh.length) manques.push('aucune clé SSH au projet Hetzner');
    } else manques.push('jeton Hetzner absent (HCLOUD_TOKEN)');
    if (!cf.disponible) manques.push(`DNS à poser à la main : ${decision.domaine} (CLOUDFLARE_API_TOKEN absent)`);
    const plan = { nom: decision.nom, domaine: decision.domaine, type: r.type, lieu: r.lieu, sha, cleSsh, pareFeu, manques,
      etapes: ['noter « en_creation »', `paquet ${sha ?? '?'} → stockage cloud-paquets (URL signée 2 h)`, `POST /v1/servers (${r.type}, ${r.lieu})`,
        cf.disponible ? `DNS A ${decision.domaine} (Cloudflare, nuage gris)` : 'DNS : à poser', 'battement du serveur neuf → actif'] };
    if (sha && envSource) {
      const amorce = amorcePour({ sha, domaine: decision.domaine, imageSteel: config.imageNavigateur, urlPaquet: 'https://a-blanc.invalid/paquet.tgz', destinations });
      plan.corps = corpsCreationHetzner({ nom: decision.nom, type: r.type, lieu: r.lieu, cleSsh, pareFeu,
        userData: cloudInitPour({ amorce, envTexte: envPourNouveauServeur(envSource, { nom: decision.nom, domaine: decision.domaine }) }) });
    }
    return { plan, envSource, destinations };
  }

  /** ⛔ Crée VRAIMENT le serveur. Appelé seulement derrière les deux interrupteurs. */
  async function executer(decision, r, { plan, envSource, destinations }) {
    if (plan.manques.some((m) => !m.startsWith('DNS'))) throw new Error(`flotte : création impossible (${plan.manques.join(' ; ')})`);
    await base.rpc('cloud_serveur_noter_creation', { p_nom: plan.nom, p_domaine: plan.domaine, p_hetzner_id: null, p_type: plan.type, p_ipv4: null, p_details: { etape: 'paquet' } });
    const tgz = await empaqueter(`${config.dossierPaquets}/${plan.sha}`);
    const chemin = `${plan.sha}.tgz`;
    const up = await base.storage.from('cloud-paquets').upload(chemin, tgz, { upsert: true, contentType: 'application/gzip' });
    if (up.error) throw new Error(`stockage : ${up.error.message}`);
    const sig = await base.storage.from('cloud-paquets').createSignedUrl(chemin, 7200);
    if (sig.error || !sig.data?.signedUrl) throw new Error(`URL signée : ${sig.error?.message ?? 'absente'}`);
    const amorce = amorcePour({ sha: plan.sha, domaine: plan.domaine, imageSteel: config.imageNavigateur, urlPaquet: sig.data.signedUrl, destinations });
    const corps = corpsCreationHetzner({ nom: plan.nom, type: plan.type, lieu: plan.lieu, cleSsh: plan.cleSsh, pareFeu: plan.pareFeu,
      userData: cloudInitPour({ amorce, envTexte: envPourNouveauServeur(envSource, { nom: plan.nom, domaine: plan.domaine }) }) });
    const cree = await hz.post('/servers', corps);
    const id = cree?.server?.id ?? null;
    const ipv4 = cree?.server?.public_net?.ipv4?.ip ?? null;
    await base.rpc('cloud_serveur_noter_creation', { p_nom: plan.nom, p_domaine: plan.domaine, p_hetzner_id: id, p_type: plan.type, p_ipv4: ipv4, p_details: { etape: 'cree' } });
    let dns = 'a_poser';
    if (cf.disponible && ipv4) dns = await cf.poserA(plan.domaine, ipv4).then(() => 'pose').catch((e) => `echec : ${e.message}`);
    journal.alerte('flotte_serveur_cree', { nom: plan.nom, hetzner_id: id, ipv4, type: plan.type, lieu: plan.lieu, dns });
    await alertes?.signaler('serveur', `Serveur Cloud ${plan.nom} créé (${plan.type}, ${plan.lieu}, ${ipv4 ?? '?'}) — DNS : ${dns}.`);
    return { cree: true, id, ipv4, dns };
  }

  /** Un tour de flotte (toutes les 10 min) : la décision, l'alerte de seuil, le plan à blanc ou la création. */
  async function tour() {
    if (absente) return { absente: true };
    const { data: serveurs, error } = await base.from('cloud_serveurs').select('nom, domaine, capacite, comptes, ouverts, etat, vu_le, cree_le');
    if (error) { if (fonctionAbsente(error) || /cloud_serveurs/.test(error.message)) return { absente: true }; throw new Error(`cloud_serveurs : ${error.message}`); }
    const r = await reglages();
    const decision = planFlotte({ serveurs, placesLibres: dernierBattement?.places_libres ?? null, seuilPlacesLibres: r.seuil,
      nomCourant: config.serveurNom, maintenant: maintenant() });
    if (decision.sousLeSeuil && maintenant() - derniereAlerteSeuil >= 6 * 3600_000 && (decision.creer || decision.raison !== 'pas_le_doyen')) {
      derniereAlerteSeuil = maintenant();
      await alertes?.signaler('serveur', `Places Cloud sous le seuil : ${decision.placesLibres} libre(s) pour un seuil de ${decision.seuil} (${decision.raison}).`, { flotte: decision });
    }
    if (decision.raison === 'creation_bloquee') {
      await alertes?.signaler('serveur', `Création de serveur Cloud bloquée depuis plus de 45 min : ${decision.enCreation.join(', ')}.`);
    }
    // (07/11, décision 4) La capacité mesurée, relue une fois par heure (la première fois : au démarrage, index.js).
    if (auto && maintenant() - derniereEvaluation >= 3600_000) await evaluerCapacite().catch((e) => journal.alerte('capacite_evaluation_echec', { erreur: e.message }));
    // (06/11 soir ; 07/11 : 80 %, sur la capacité ATTEIGNABLE) La capacité RÉELLE de ce serveur : une alerte, puis un
    // rappel au plus toutes les 6 h tant qu'elle tient. Aucun serveur n'est commandé par elle : Nico décide.
    // (19/11, décision de Nico) Le MAIL à Nico (pour décider d'un 2e serveur) : l'alerte nommée ALERTE_CAPACITE, clé = ce
    // serveur — UNE fois par incident (alertes-nico.js, monitor_state) ; l'incident se résout quand tout redescend 10 points
    // sous le seuil et qu'aucun signe grave ne bloque (un taux qui oscille autour du seuil ne renvoie pas de mail).
    const capaciteReelle = auto ? etatCapacite.atteignable : capaciteCourante;
    const mesure = await derniereMesure();
    const capacite = alerteCapacite({ comptes: dernierBattement?.comptes, capacite: capaciteReelle, mesure,
      seuilPct: r.capaciteAlertePct, maintenant: maintenant() });
    if (capacite.atteint && maintenant() - derniereAlerteCapacite >= 6 * 3600_000) {
      derniereAlerteCapacite = maintenant();
      incidentCapacite = true;
      journal.alerte('capacite_seuil', { serveur: config.serveurNom, ...capacite });
      await alertes?.signaler('serveur', `Capacité de ${config.serveurNom} : seuil de ${capacite.seuilPct} % atteint — ${capacite.raisons.join(', ')} `
        + `(${dernierBattement?.comptes ?? '?'} comptes ${auto ? `servis pour une limite réelle de ${capaciteReelle}, ${capaciteCourante} ouverts à la vente` : `pour ${capaciteReelle}`}). `
        + 'Décider d\'un 2e serveur : docs/cloud/REPRISE.md, « Ajouter un serveur » (aucun serveur n\'est commandé automatiquement).',
      { capacite }, { alerte: ALERTE_CAPACITE, cle: config.serveurNom });
    } else if (incidentCapacite && etatCapacite.bloquee !== true && !alerteCapacite({ comptes: dernierBattement?.comptes, capacite: capaciteReelle,
      mesure, seuilPct: Math.max(1, r.capaciteAlertePct - 10), maintenant: maintenant() }).atteint) {
      incidentCapacite = false;
      derniereAlerteCapacite = 0;
      journal.info('capacite_incident_resolu', { serveur: config.serveurNom, taux: capacite.taux });
      await alertes?.resoudre?.(ALERTE_CAPACITE, config.serveurNom);
    }
    // (06/11 soir) La règle de passage à 30 comptes (vue cloud_passage_30) : lue une fois par heure tant que ce serveur a
    // moins de 30 places ; une alerte quand TOUTES les conditions sont réunies, un rappel au plus par 24 h. Nico décide.
    // (07/11, décision 4) Seulement en capacité FIXE (NAVIGATEURS_MAX) : la capacité mesurée monte seule.
    if (!auto && capaciteCourante < 30 && maintenant() - derniereLecturePassage >= 3600_000) {
      derniereLecturePassage = maintenant();
      const ligne = await lirePassage30();
      const texte = textePassage30(ligne, capaciteCourante);
      if (texte && maintenant() - derniereAlertePassage >= 24 * 3600_000) {
        derniereAlertePassage = maintenant();
        journal.alerte('passage_30_possible', { serveur: config.serveurNom });
        await alertes?.signaler('serveur', texte, { passage_30: ligne });
      }
    }
    if (!decision.creer) return { decision };
    const prep = await preparer(decision, r);
    const autorise = config.hetznerCreationAutorisee === true && r.auto && hz.disponible;
    if (!autorise) {
      const resume = resumePlan(prep.plan);
      const cle = JSON.stringify({ n: resume.nom, t: resume.type, l: resume.lieu, s: resume.sha, m: resume.manques });
      if (cle !== dernierPlanJournalise) {
        dernierPlanJournalise = cle;
        journal.info('flotte_plan_a_blanc', { interrupteurs: { env: config.hetznerCreationAutorisee === true, coin_config: r.auto, jeton: hz.disponible }, plan: resume });
      }
      return { decision, plan: resumePlan(prep.plan), aBlanc: true };
    }
    const fait = await executer(decision, r, prep);
    return { decision, plan: resumePlan(prep.plan), fait };
  }

  return { battre, tour, preparer, evaluerCapacite, dernierBattement: () => dernierBattement,
    capacite: () => capaciteCourante, etatCapacite: () => etatCapacite, etatFilet };
}
