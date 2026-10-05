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
const MUR_VINTED = /\[pas_connecte\]|cause403|aucune session vinted|session vinted.{0,40}401|refusé la lecture du compte/i;

// ── LA FIN D'UN RELEVÉ, DITE EN CLAIR (05/10, Marine) ───────────────────────
// Chaque relevé qui n'aboutit pas se résume à UNE situation, lue sur les
// marqueurs que NOS relevés écrivent (extension 0.6.99, handler-watch) — et
// sur les textes des versions précédentes, pour les lignes déjà en base. La
// phrase montrée est choisie ici ; le texte brut de `erreur` (codes HTTP,
// pages, minutes) reste en base pour nous, jamais à l'écran.
//   pas_connecte  la personne n'est pas connectée à la plateforme sur son
//                 ordinateur → « Connecte-toi à X sur ton ordinateur… »
//   autre_compte  Chrome est sur une autre boutique que celle suivie
//   anti_robot    la plateforme a bloqué la lecture un moment
//   arret         la lecture s'est arrêtée avant la fin (chien de garde)
//   pas_prise     l'ordinateur n'a jamais pris la demande (Chrome fermé)
//   echec         tout le reste
const RE_PAS_CONNECTE = /\[pas_connecte\]|aucune session vinted|session_absente|session vinted.{0,40}401|refusé la lecture du compte|page de connexion/i;
const RE_AUTRE_COMPTE = /\[boutique_a_confirmer\]|\[hors-compte-ebay\]/i;
const RE_ANTI_ROBOT = /\[anti_robot\]|anti-robot|\[retry403\]/i;
const RE_ARRET = /\[watchdog\]/i;
const RE_PAS_PRISE = /jamais réclamée|sans extension disponible/i;

export function situationFinReleve(run) {
  const e = String(run?.erreur ?? '');
  if (RE_PAS_CONNECTE.test(e) || MUR_OPLA.test(e)) return 'pas_connecte';
  if (RE_AUTRE_COMPTE.test(e)) return 'autre_compte';
  if (RE_ANTI_ROBOT.test(e)) return 'anti_robot';
  if (RE_ARRET.test(e)) return 'arret';
  if (RE_PAS_PRISE.test(e)) return 'pas_prise';
  return 'echec';
}

// La phrase d'une situation, pour une plateforme nommée. T = textesAnnonces(lang).
export function texteSituation(situation, nom, T) {
  if (situation === 'pas_connecte') return T.signalNonConnecte(nom);
  if (situation === 'autre_compte') return T.finAutreCompte(nom);
  if (situation === 'anti_robot') return T.finAntiRobot(nom);
  if (situation === 'arret') return T.finArret(nom);
  if (situation === 'pas_prise') return T.finPasPrise(nom);
  return T.finEchec(nom);
}

export function texteFinReleve(run, nom, T) {
  if (/acc[èe]s opla non accord/i.test(String(run?.erreur ?? ''))) return T.signalOpla;
  return texteSituation(situationFinReleve(run), nom, T);
}

// Marqueurs posés par le relevé eBay (extension 0.6.54) quand il a pu NOMMER
// le mur : reconnexion de sécurité, ou compte pas encore vendeur.
const MUR_EBAY_REAUTH = /\[mur:reauth\]/i;
const MUR_EBAY_UPGRADE = /\[mur:upgrade\]/i;

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
  // (27/09) Le serveur nomme aussi ces deux murs eBay (releve_ebay_mur_nomme) :
  // lus même quand le texte ne dit pas « page de connexion ».
  if (MUR_EBAY_UPGRADE.test(e)) return MOTIFS.VENDEUR_EBAY;
  if (MUR_EBAY_REAUTH.test(e)) return MOTIFS.REAUTH_EBAY;
  if (MUR_OPLA.test(e)) return MOTIFS.AUTORISER_OPLA;
  if (MUR_PAGE_CONNEXION.test(e)) {
    // ── eBAY : LE MUR EST NOMMÉ PAR L'EXTENSION (2026-09-22) ───────────────
    // Marqueur posé par le relevé lui-même (0.6.54) après avoir interrogé la
    // porte du Hub vendeur. Sans lui, on disait « connecte-toi » à quelqu'un
    // qui EST connecté et à qui eBay redemande seulement une preuve — le
    // bouton ouvrait eBay, la personne s'y voyait connectée, et rien ne
    // bougeait. Pas de marqueur (extension plus ancienne) → on retombe sur
    // « connexion », comme avant : on ne devine pas.
    if (MUR_EBAY_REAUTH.test(e)) return MOTIFS.REAUTH_EBAY;
    if (MUR_EBAY_UPGRADE.test(e)) return MOTIFS.VENDEUR_EBAY;
    return MOTIFS.CONNEXION;
  }
  if (platform === 'vinted' && MUR_VINTED.test(e)) return MOTIFS.CONNEXION;
  return null;
}

const estOpla = (run) => /opla/i.test(String(run?.erreur ?? ''));

// Ce que la PLATEFORME annonce pour un relevé : total_entries quand il dépasse
// le lu (extension 0.6.75 et suivantes), sinon « … sur N » dans le texte du
// run (toutes versions). null quand rien ne le dit — on n'invente pas.
export function totalAnnonceDuRun(run) {
  const lus = Number(run?.items_vus ?? NaN);
  const te = Number(run?.total_entries ?? NaN);
  if (Number.isFinite(te) && Number.isFinite(lus) && te > lus) return te;
  const m = String(run?.erreur ?? '').match(/vue\(s\) sur (\d+)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}
const ACTIF = new Set(['queued', 'running']);

// ── UN ARRÊT TECHNIQUE SE NOMME (2026-09-23) ────────────────────────────────
// Le Hub vendeur eBay qui ne rend pas son compteur (page pas peinte à temps),
// et la reprise technique que l'extension pose en remettant le run en file.
// Ce n'est ni un mur de connexion (qui a son bouton), ni un verdict sur les
// annonces : la carte dit ce qu'on fait, et le bouton « relever » reste là.
const ARRET_TECHNIQUE_RE = /n'a pas rendu son compteur|\[reprise-technique\]/i;

export function arretTechniqueReleve(run) {
  if (!run) return false;
  if (run.status !== 'failed' && run.status !== 'queued') return false;
  if (murConnexionReleve(run)) return false;
  return ARRET_TECHNIQUE_RE.test(String(run.erreur ?? ''));
}

const instant = (...iso) => {
  for (const v of iso) {
    const t = Date.parse(v ?? '');
    if (Number.isFinite(t)) return t;
  }
  return null;
};

// ── LE COMPTE eBAY DE CHROME N'EST PAS CELUI RELIÉ (2026-10-01) ─────────────
// Lu dans la note que le serveur pose sur le run (releve_ebay_noter_run) :
//   « [hors-compte-ebay] Chrome est connecté au compte eBay « X », pas au
//     compte relié « Y » … »            → { chrome: X, relie: Y }
//   « [hors-compte-ebay] compte eBay de Chrome non prouvé (…) au compte
//     relié « Y » … »                   → { chrome: null, relie: Y }
// null si le run ne porte pas cette note.
export function compteEbayHorsCompte(run) {
  const e = String(run?.erreur ?? '');
  const i = e.indexOf('[hors-compte-ebay]');
  if (run?.platform !== 'ebay' || i < 0) return null;
  const note = e.slice(i);
  const autre = note.match(/connecté au compte eBay « ([^»]+) », pas au compte relié « ([^»]+) »/);
  if (autre) return { chrome: autre[1].trim(), relie: autre[2].trim() };
  const nonProuve = note.match(/au compte relié « ([^»]+) »/);
  return { chrome: null, relie: nonProuve ? nonProuve[1].trim() : null };
}

// ── L'ÉTAT D'UNE TUILE ──────────────────────────────────────────────────────
// Trois choses, pas une de plus : combien d'annonces, l'état en UN mot, la
// couleur de la pastille. Le nombre affiché est celui du DERNIER RELEVÉ
// RÉUSSI — pas le stock, pas une estimation, et « — » quand il n'y en a pas.
export function etatTuile({ run, vinted = false, etatVinted = null, T, fr, pip }) {
  const enCours = vinted ? !!etatVinted?.enCours : !!(run && ACTIF.has(run.status));
  if (enCours) return { n: '·', mot: T.motEnCours, pip: pip.pipOk, phase: 'en_cours' };

  // ── VINTED : SA DERNIÈRE SYNCHRONISATION N'A PAS ABOUTI (05/10, Marine) ───
  // `run` (lireDernierRunVinted) ne rend que les relevés réussis : un échec
  // Vinted n'arrivait JAMAIS jusqu'à la tuile — Marine voyait « jamais »
  // pendant que son relevé échouait. VintedDressingSync remonte désormais la
  // fin de SA dernière synchronisation (`etatVinted.fin`), quand elle n'a pas
  // abouti ; la tuile la dit comme pour les autres plateformes.
  const finVinted = vinted ? etatVinted?.fin ?? null : null;
  if (finVinted) {
    const situation = finVinted.situation ?? 'echec';
    if (situation === 'pas_connecte') return { n: '—', mot: T.motAConnecter, pip: pip.pipWarn, phase: 'absente', situation };
    if (finVinted.status === 'incomplete') {
      const lus = Number(finVinted.items_vus ?? 0);
      const annonce = Number.isFinite(Number(finVinted.total_entries)) && Number(finVinted.total_entries) > lus ? Number(finVinted.total_entries) : null;
      return { n: annonce != null ? `${lus}/${annonce}` : lus, mot: T.motIncomplet ?? 'incomplet', pip: pip.pipWarn, phase: 'incomplet', lus, annonce, situation };
    }
    if (finVinted.status === 'expired' || finVinted.status === 'cancelled') return { n: '—', mot: T.motExpire, pip: pip.pipWarn, phase: 'expire', situation };
    return { n: '—', mot: T.motEchec, pip: pip.pipBad, phase: 'echec', situation };
  }

  // Vinted : `lireDernierRunVinted` ne rend que des runs finis, son
  // `finished_at` suffit. Les autres portent un `status`.
  const fini = vinted ? run?.finished_at : (run?.status === 'done' ? run.finished_at : null);
  // ── UN RELEVÉ INCOMPLET NE SE DIT JAMAIS « N ANNONCES » (27/09) ──────────
  // jocabroc8 : « 30 annonces », pastille verte, alors que le relevé avait lu
  // 30 annonces sur 176. On dit ce qui a été lu SUR ce que la plateforme
  // annonce, en ambre ; le serveur relance la lecture tout seul.
  // ── eBAY : CHROME SUR UN AUTRE COMPTE QUE CELUI RELIÉ (2026-10-01) ────────
  // Le serveur n'importe rien d'un autre compte et le note dans le run
  // (« [hors-compte-ebay] … »). La tuile ne dit donc pas « 36 annonces » :
  // elle dit l'écart, et la bande plus bas nomme le bon compte.
  const horsCompte = fini && !vinted ? compteEbayHorsCompte(run) : null;
  if (horsCompte) {
    return {
      n: '—',
      mot: T.motAutreCompte ?? 'autre compte',
      depuis: depuisCourt(fini, fr),
      pip: pip.pipWarn,
      phase: 'hors_compte',
      horsCompte,
    };
  }
  if (fini && !vinted && String(run.erreur ?? '').startsWith('[incomplet]')) {
    const lus = Number(run.items_vus ?? 0);
    const annonce = totalAnnonceDuRun(run);
    return {
      n: annonce != null && annonce > lus ? `${lus}/${annonce}` : (Number.isFinite(lus) ? lus : 0),
      mot: T.motIncomplet ?? 'incomplet',
      depuis: depuisCourt(fini, fr),
      pip: pip.pipWarn,
      phase: 'incomplet',
      lus: Number.isFinite(lus) ? lus : 0,
      annonce,
    };
  }
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
  if (run?.status === 'failed') return { n: '—', mot: T.motEchec, pip: pip.pipBad, phase: 'echec', situation: situationFinReleve(run) };
  if (run?.status === 'expired' || run?.status === 'cancelled') {
    return { n: '—', mot: T.motExpire, pip: pip.pipWarn, phase: 'expire', situation: situationFinReleve(run) };
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
      // (05/10) Vinted aussi peut ATTENDRE l'ordinateur : sa demande est en
      // file, rien ne tourne encore — on ne la dit pas « en cours ».
      if (p === 'vinted' && etatVinted?.enAttente) attente.push(p);
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

  const enCours = cibles.find((p) => (p === 'vinted' ? !!etatVinted?.enCours && !etatVinted?.enAttente : runs[p]?.status === 'running')) ?? null;
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
  // 'homonyme_en_stock' (26/09) : l'import a reconnu une fiche du même titre
  // qui a DÉJÀ son annonce sur cette plateforme (« 36 papas ») — deux
  // exemplaires, ou la même annonce en double : la personne tranche.
  if (m === 'homonyme_en_stock') return T.motifHomonymeEnStock;
  // 'depot_beebs_photo_proche' (01/10) : la photo de l'annonce ressemble à
  // celle d'un dépôt Beebs de l'article, sans être la même. Le numéro n'est
  // posé sur le dépôt que si la personne répond oui.
  if (m === 'depot_beebs_photo_proche') return T.motifDepotPhotoProche;
  // 'depot_beebs_a_confirmer' (01/10) : même titre, même place dans l'ordre
  // des dépôts Beebs, mais la photo ne permet pas de trancher.
  if (m === 'depot_beebs_a_confirmer') return T.motifDepotAConfirmer;
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
