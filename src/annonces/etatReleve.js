// ═══════════════════════════════════════════════════════════════════════════
// MES ANNONCES EN LIGNE — CE QUE LES RUNS DISENT (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Des fonctions PURES, et rien d'autre : elles reçoivent ce que le hook a lu
// en base (vinted_sync_runs, l'état remonté par VintedDressingSync) et rendent
// ce qu'il faut afficher. Aucun appel, aucun état, aucune horloge propre.
//
// ⛔ LA RÈGLE DE TOUT CE FICHIER : ON N'INVENTE RIEN. Une plateforme sans run
//    exploitable est « en attente » — pas « en cours », pas « 0 annonce ».
//    L'avancement est un NOMBRE DE PLATEFORMES TERMINÉES sur un nombre visé,
//    jamais une durée, jamais une interpolation. Si on ne sait pas, on le dit.
//
// Le moteur de relevé n'est pas touché : ces fonctions LISENT, le hook
// (useReleveAnnonces) appelle, et les deux RPC restent celles d'avant.

import { MOTIFS } from '../utils/connexionPlateformes';

// Âge d'un relevé, en DEUX caractères : « 12 min », « 9 h », « 2 j ». La tuile
// d'une plateforme n'a pas la place de la phrase complète, et n'en a pas besoin.
export function depuisCourt(iso, fr) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return fr ? `${Math.round(h / 24)} j` : `${Math.round(h / 24)} d`;
}

export function ilYA(iso, fr) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return fr ? 'à l’instant' : 'just now';
  if (min < 60) return fr ? `il y a ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return fr ? `il y a ${h} h` : `${h} h ago`;
  const j = Math.round(h / 24);
  return fr ? `il y a ${j} j` : `${j} d ago`;
}

// ── UNE PLATEFORME ABSENTE N'EST PAS UN RELEVÉ RATÉ (2026-09-18) ────────────
// Constat Nico : Leo-paul Hug a pris QUATRE runs `failed` en une matinée —
// « accès Opla non accordé », « session ebay : page de connexion », idem
// Beebs — alors qu'il n'a de compte sur AUCUNE des trois. Son journal était
// plein d'échecs qui n'en étaient pas.
//
// DEUX PORTES, et c'est délibéré :
//   · `status === 'absente'` — ce que l'extension écrit à partir de la 0.6.43 ;
//   · à défaut, la SIGNATURE de l'échec sur un run `failed` sans une seule
//     annonce vue. C'est ce qui éteint le bruit pour tout le parc et pour les
//     runs DÉJÀ enregistrés, sans réécrire une ligne en base.
// ⛔ La condition `items_vus === 0` n'est pas décorative : un mur de connexion
//    rencontré en page 3 d'un relevé qui marchait reste un vrai incident.
// ⛔ LES DEUX SEULES SIGNATURES, ÉCRITES UNE FOIS. `absenceDePlateforme` et
//    `murConnexionReleve` lisent les MÊMES expressions : deux copies auraient
//    fini par diverger, et l'écran aurait alors dit « à connecter » sans
//    proposer le bouton, ou l'inverse. Ce sont des textes que NOS handlers
//    écrivent (« session beebs : page de connexion », « accès Opla non
//    accordé ») — jamais une heuristique sur un message de plateforme.
const MUR_PAGE_CONNEXION = /page de connexion/i;
const MUR_OPLA = /acc[èe]s opla non accord/i;

// Le relevé Vinted (kind 'dressing') n'écrit pas comme les quatre autres : sa
// sonde pose « [cause403] session_absente », « aucune session Vinted » ou un
// 401. C'est le MÊME mur vu de l'utilisateur, et il mérite le même bouton.
const MUR_VINTED = /cause403|aucune session vinted|session vinted.{0,40}401/i;

export function absenceDePlateforme(run) {
  if (!run) return false;
  if (run.status === 'absente') return true;
  if (run.status !== 'failed' || (run.items_vus ?? 0) > 0) return false;
  const e = String(run.erreur ?? '');
  return MUR_OPLA.test(e) || MUR_PAGE_CONNEXION.test(e);
}

// ── « ME CONNECTER » SUR LE RELEVÉ (2026-09-22) ─────────────────────────────
// Rend le motif MOTIFS.* quand le relevé a buté sur un mur de connexion, sinon
// null. C'est ce motif qu'attend `BoutonMeConnecter` — le même composant que
// les cartes d'articles bloqués, le stepper et les Réglages.
//
// ⛔ ON N'AFFIRME QUE CE QU'ON A LU. Pas de run, pas d'erreur, ou une erreur
//    qui ne nomme pas le mur → `null`, et l'écran ne propose RIEN. « Jamais
//    vérifié » n'est pas « pas connecté » : poser le bouton sur un doute
//    reviendrait à dire à quelqu'un de connecté qu'il ne l'est pas.
// ⛔ INDÉPENDANT DE `items_vus`, et c'est voulu : un mur rencontré en page 3
//    reste un relevé INCOMPLET (la phase de la tuile ne bouge pas), mais la
//    personne a quand même besoin du geste. L'état et le geste sont deux
//    questions distinctes.
export function murConnexionReleve(run, platform = null) {
  const e = String(run?.erreur ?? '');
  if (!e) return null;
  if (MUR_OPLA.test(e)) return MOTIFS.AUTORISER_OPLA;
  if (MUR_PAGE_CONNEXION.test(e)) return MOTIFS.CONNEXION;
  if (platform === 'vinted' && MUR_VINTED.test(e)) return MOTIFS.CONNEXION;
  return null;
}

const estOpla = (run) => /opla/i.test(String(run?.erreur ?? ''));
const ACTIF = new Set(['queued', 'running']);

const instant = (...iso) => {
  for (const v of iso) {
    const t = Date.parse(v ?? '');
    if (Number.isFinite(t)) return t;
  }
  return null;
};

// ── L'ÉTAT D'UNE TUILE ──────────────────────────────────────────────────────
// Trois choses, pas une de plus : combien d'annonces, l'état en UN mot, la
// couleur de la pastille. Le nombre affiché est celui du DERNIER RELEVÉ
// RÉUSSI — pas le stock, pas une estimation, et « — » quand il n'y en a pas.
export function etatTuile({ run, vinted = false, etatVinted = null, T, fr, pip }) {
  const enCours = vinted ? !!etatVinted?.enCours : !!(run && ACTIF.has(run.status));
  if (enCours) return { n: '·', mot: T.motEnCours, pip: pip.pipOk, phase: 'en_cours' };

  // Vinted : `lireDernierRunVinted` ne rend que des runs finis, son
  // `finished_at` suffit. Les autres portent un `status`.
  const fini = vinted ? run?.finished_at : (run?.status === 'done' ? run.finished_at : null);
  if (fini) {
    const n = Number(run.items_vus ?? 0);
    return {
      n: Number.isFinite(n) ? n : 0,
      mot: T.motAnnonces,
      depuis: depuisCourt(fini, fr),
      pip: pip.pipOk,
      phase: 'fait',
    };
  }

  // Pas de session chez la plateforme : ce n'est PAS un échec. La tuile le dit
  // en un mot, sans pastille rouge et sans compter d'annonces.
  if (!vinted && absenceDePlateforme(run)) {
    return {
      n: '—',
      mot: estOpla(run) ? T.motAAutoriser : T.motAConnecter,
      pip: pip.pipWarn,
      phase: 'absente',
      opla: estOpla(run),
    };
  }
  if (run?.status === 'failed') return { n: '—', mot: T.motEchec, pip: pip.pipBad, phase: 'echec' };
  if (run?.status === 'expired' || run?.status === 'cancelled') {
    return { n: '—', mot: T.motExpire, pip: pip.pipWarn, phase: 'expire' };
  }
  return { n: '—', mot: T.motJamais, pip: pip.pipMute, phase: 'jamais' };
}

// ── LA VAGUE EN COURS ───────────────────────────────────────────────────────
// « Tout relever » ne crée aucun objet en base : il met N demandes en file,
// une par plateforme. La vague est donc DÉDUITE des runs, jamais stockée —
// c'est ce qui la fait survivre à la fermeture de l'app : on rouvre, on relit
// les runs, et l'écran retrouve exactement où il en était. Aucun risque non
// plus de relancer un second relevé : le bouton est inactif tant que la vague
// tourne, et le serveur refuse de toute façon (`deja_en_attente`).
//
//   active   au moins une plateforme visée est `queued` ou `running`
//   ancre    le plus ancien `queued_at` parmi les runs ENCORE actifs
//   membres  les plateformes DE CETTE VAGUE, et elles seules : une plateforme
//            qu'on n'a pas demandée n'est pas « en attente », elle n'est nulle
//            part. C'est ce qui fait que « 2 plateformes sur 5 » dit 5 quand
//            on en a demandé 5, et 2 quand on en a demandé 2.
//   faites   membre, plus active, et son dernier run est terminé
//   enCours  celle qui est vraiment `running`. Plusieurs en file mais aucune
//            démarrée → null : on affiche « en attente de ton ordinateur »,
//            pas un nom de plateforme choisi au hasard.
//
// ⛔ L'ANCRE SE LIT SUR `queued_at`, PAS SUR L'HORLOGE. « Tout relever » met
//    les demandes en file en quelques secondes : leurs `queued_at` tiennent
//    dans la même poignée de secondes, et la fenêtre ci-dessous les rattrape
//    toutes. Une borne prise sur `Date.now()` bougerait à chaque rendu et
//    ferait disparaître les plateformes déjà terminées sous les yeux.
const FENETRE_VAGUE_MS = 120_000;

export function lireVague({ plateformes, runs, runVinted, etatVinted }) {
  const cibles = plateformes;
  const actives = cibles.filter((p) => (p === 'vinted' ? !!etatVinted?.enCours : ACTIF.has(runs[p]?.status)));
  if (!actives.length) {
    return { active: false, ancre: null, membres: [], faites: [], enCours: null, attente: [], avancement: 0, total: 0 };
  }

  const departs = actives
    .filter((p) => p !== 'vinted')
    .map((p) => instant(runs[p]?.queued_at, runs[p]?.started_at))
    .filter((t) => Number.isFinite(t));
  // Vinted n'a pas de run lisible tant qu'elle tourne (son relevé s'écrit en
  // `kind='dressing'` et `lireDernierRunVinted` ne rend que les runs finis) :
  // elle est membre par son état vivant, jamais par un horodatage.
  const ancre = departs.length ? Math.min(...departs) - FENETRE_VAGUE_MS : null;

  const membres = [];
  const faites = [];
  const attente = [];
  for (const p of cibles) {
    if (actives.includes(p)) {
      membres.push(p);
      if (p !== 'vinted' && runs[p]?.status === 'queued') attente.push(p);
      continue;
    }
    const run = p === 'vinted' ? runVinted : runs[p];
    const debutRun = p === 'vinted' ? instant(run?.finished_at) : instant(run?.queued_at, run?.started_at);
    // ⛔ Pas « a un finished_at » : un relevé d'hier n'est pas une plateforme
    //    terminée dans la vague d'aujourd'hui.
    if (ancre == null || !Number.isFinite(debutRun) || debutRun < ancre) continue;
    if (!Number.isFinite(instant(run?.finished_at))) continue;
    membres.push(p);
    faites.push(p);
  }

  const enCours = cibles.find((p) => (p === 'vinted' ? !!etatVinted?.enCours : runs[p]?.status === 'running')) ?? null;
  return {
    active: true,
    ancre,
    membres,
    faites,
    enCours,
    attente,
    avancement: membres.length ? faites.length / membres.length : 0,
    total: membres.length,
  };
}

// ── LA LIGNE D'ÉTAT AU REPOS ────────────────────────────────────────────────
// Le « dernier relevé », c'est le PLUS RÉCENT des relevés réussis (Vinted
// comprise) ; le nombre, c'est la SOMME de ce que chaque dernier relevé réussi
// a vu. Une plateforme jamais relevée n'ajoute rien et ne retire rien.
export function lireBilan({ plateformes, runs, runVinted }) {
  const reussis = [];
  if (runVinted?.finished_at && plateformes.includes('vinted')) {
    reussis.push({ fini: Date.parse(runVinted.finished_at), vus: Number(runVinted.items_vus ?? 0) });
  }
  for (const p of plateformes) {
    if (p === 'vinted') continue;
    const r = runs[p];
    if (r?.status !== 'done' || !r.finished_at) continue;
    reussis.push({ fini: Date.parse(r.finished_at), vus: Number(r.items_vus ?? 0) });
  }
  const valides = reussis.filter((r) => Number.isFinite(r.fini));
  return {
    dernierFini: valides.length ? Math.max(...valides.map((r) => r.fini)) : null,
    total: valides.reduce((t, r) => t + (Number.isFinite(r.vus) ? r.vus : 0), 0),
  };
}

// ── POURQUOI LE MOTEUR HÉSITE, en une demi-phrase ───────────────────────────
// `faisceau` (2026-09-18) : le titre exact n'a rien donné, et la proposition
// vient du SECOND TOUR — recouvrement des mots du titre, marque, prix, taille
// (rapprocher_classer, migration 20260918091000). Elle n'est JAMAIS un
// rattachement automatique : c'est une présomption, l'utilisateur tranche.
// On nomme les signaux qui ont vraiment joué, pas le score : « 0,73 » ne dit
// rien à personne, « le prix et la marque correspondent » se vérifie d'un œil.
export function motifProposition(prop, T, fr) {
  const m = prop?.motif;
  if (m === 'prix_inconnu') return T.motifPrixInconnu;
  if (m === 'prix_different') return T.motifPrixDifferent;
  if (m === 'homonymes') return T.motifHomonymes;
  if (m === 'plusieurs_candidats') return T.motifPlusieurs;
  // 'homonymes_tranches' (18/09, A3) : N articles STRICTEMENT identiques
  // (même titre, même prix). Le choix est arbitraire de toute façon — le
  // moteur en prend un selon une règle explicite et on le DIT, plutôt que de
  // poser une question dont aucune réponse ne serait plus juste qu'une autre.
  if (m === 'homonymes_tranches') {
    return T.motifHomonymesTranches(Number(prop.choix_arbitraire?.total ?? prop.candidats_total ?? 0));
  }
  // 'titre_inclus' (20/09, 4-e) : un titre est contenu dans l'autre, aux
  // frontières de mots — préfixes de référence (« FIG001 - ») et compléments
  // (« tome 3 » / « tome 3 l'invité fantôme »).
  if (m === 'titre_inclus') return T.motifTitreInclus;
  if (m !== 'faisceau') return '';
  const s = prop.signaux && typeof prop.signaux === 'object' ? prop.signaux : {};
  const preuves = [];
  if (s.prix === 'exact') preuves.push(T.preuvePrixExact);
  else if (s.prix === 'proche') preuves.push(T.preuvePrixProche);
  if (s.marque) preuves.push(T.preuveMarque);
  if (s.taille) preuves.push(T.preuveTaille);
  if (!preuves.length) return T.motifFaisceauBase;
  return T.motifFaisceauAvec(preuves.join(fr ? ' et ' : ' and '));
}
