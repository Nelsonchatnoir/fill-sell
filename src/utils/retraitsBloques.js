// ═══════════════════════════════════════════════════════════════════════════
// LES RETRAITS BLOQUÉS PAR UNE CONNEXION — RISQUE DE DOUBLE VENTE (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel (Joséphine, 05/10) : 8 retraits Opla après des ventes, en
// needs_user sur une session Opla fermée (needs_user_source='connexion',
// mur_geste.type='connexion', attente_session). Les annonces restaient EN
// LIGNE sur Opla et l'app n'en disait rien : « À régler » ne compte que les
// publications et republications, la carte d'un article vendu ne porte que
// « Vendu · date », et le logo Opla avait l'air normal. Un acheteur pouvait
// payer un article déjà parti.
//
// Ce module dit, à partir des jobs DÉJÀ chargés par le Stock (aucune lecture
// de plus, aucune relecture en boucle), quels retraits attendent une
// reconnexion, regroupés par plateforme, avec le titre de la fiche.
//
// Un retrait est « bloqué par une connexion » quand :
//   · action = 'delete' ;
//   · ET soit il attend une session ('pending' + platform_fields.
//     attente_session — l'extension a trouvé la session fermée et attend) ;
//   · soit il est en 'needs_user' sur un mur de connexion NOMMÉ par le
//     serveur : needs_user_source='connexion' (ou 'session_vinted'),
//     mur_geste.type='connexion', pas_de_rouge.motif='connexion', ou un
//     message ancré « Connexion X requise » / « Reconnexion X requise » /
//     « En attente de ta connexion à » (mêmes débuts de phrase que
//     relancer_jobs_connexion, handler-watch et _shared/mur-geste.js —
//     jamais un mot pris au milieu).
// ⛔ LE MÊME MUR QUE LE SERVEUR (règle de MUR_CONNEXION_ANCRE, StockTab) : on
//    n'offre pas « Me connecter » sur un job que personne ne relancera. Donc,
//    comme relancer_jobs_connexion : jamais un blocage anti-robot (le relancer,
//    c'est re-taper la porte), et un needs_user de plus de 30 jours n'entre
//    pas (le serveur ne le relance plus). Un 'pending' en attente de session,
//    lui, repart dès que l'extension revoit la session : pas de fenêtre.
// Un échec d'une autre nature (failed, needs_user sans mur de connexion) n'est
// PAS compté ici : il a ses propres chemins.
// Seul le DERNIER retrait qui vise une annonce compte (même article, même
// plateforme, même lien) : un retrait plus récent qui a abouti éteint l'ancien.
// Pur (Node + Vite) : scripts/retraits-bloques-connexion-selftest.mjs.

export const NOMS_PLATEFORME_RETRAIT = Object.freeze({
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla', depop: 'Depop',
});
const ORDRE = ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla', 'depop'];

const MESSAGE_CONNEXION_RE = /^(?:Re)?connexion (?:Vinted|Leboncoin|Beebs|eBay|Opla|Depop) requise|^En attente de ta connexion à /i;
const ANTIROBOT_RE = /anti-?robot|datadome/i;
/** La fenêtre de relance de relancer_jobs_connexion (created_at > now() − 30 j). */
export const FENETRE_RELANCE_MS = 30 * 24 * 3600 * 1000;

const nomDe = (p) => NOMS_PLATEFORME_RETRAIT[p] ?? String(p ?? '');
const ts = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };

/** Ce retrait attend-il une reconnexion à la plateforme ? */
export function retraitBloqueParConnexion(job, maintenant = Date.now()) {
  if (!job || job.action !== 'delete') return false;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  // (06/10, geronimo, wattelle, pironneau) Un retrait Vinted qui attend une
  // session Vinted dans Chrome (« Connecte-toi à Vinted sur ton ordinateur »,
  // attente_connexion ; ou session illisible avant le retrait,
  // verification_boutique_vinted session_inconnue) attend AUSSI la personne :
  // il n'apparaissait nulle part dans « À régler ».
  if (job.status === 'pending') {
    return !!pf.attente_session || !!pf.attente_connexion
      || pf.verification_boutique_vinted?.motif === 'session_inconnue';
  }
  if (job.status !== 'needs_user') return false;
  const err = String(job.error ?? '').trim();
  if (ANTIROBOT_RE.test(err) || pf.blocage_antirobot || pf.attente_antirobot_compte) return false;
  const ne = ts(job.created_at);
  if (ne && maintenant - ne > FENETRE_RELANCE_MS) return false;
  if (pf.needs_user_source === 'connexion' || pf.needs_user_source === 'session_vinted') return true;
  if (pf.mur_geste && typeof pf.mur_geste === 'object' && pf.mur_geste.type === 'connexion') return true;
  if (pf.pas_de_rouge && typeof pf.pas_de_rouge === 'object' && pf.pas_de_rouge.motif === 'connexion') return true;
  return MESSAGE_CONNEXION_RE.test(err);
}

/**
 * (06/10, DeadRoz, Sandra) Vinted affiche « compte bloqué » (/main/banned) à la
 * place de l'annonce : FillSell réessaie seul, mais rien ne garantit que Vinted
 * rende l'accès — la personne peut retirer l'annonce depuis l'appli Vinted.
 * Ce n'est PAS un mur de connexion : jamais « Me connecter » ici.
 */
export function retraitBloqueParCompteVinted(job) {
  if (!job || job.action !== 'delete' || job.platform !== 'vinted') return false;
  if (job.status !== 'pending' && job.status !== 'needs_user') return false;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  return pf.needs_user_source === 'compte_vinted_bloque' || !!pf.compte_vinted_bloque;
}

// ── (12/10, A6) JAMAIS DE RETRAIT D'ARTICLE VENDU EN SILENCE ────────────────
// Ornella (11/10, 16:49) : la jupe H&M vendue, retraits Beebs et Leboncoin
// faits, retrait Vinted en attente SANS UN MOT — l'annonce est sur son autre
// boutique (472079), Chrome ouvert sur @luciatrendyshop : get-pending-jobs le
// retenait en silence. nerema75 (19:01) : « nous n'arrivons pas encore à
// prouver que cette annonce appartient à la boutique… » — la boutique n'était
// pas nommée, rien dans « À régler ». Et 7 comptes dont l'ordinateur ne
// tourne plus depuis des jours avaient des retraits d'articles vendus en file.
// Deux murs de plus, mêmes écrans, même levée (le dernier retrait de
// l'annonce seulement, qui disparaît dès qu'il aboutit) :
//   · 'boutique'   : la boutique Vinted de l'annonce n'est pas celle ouverte
//     dans Chrome, ou n'a pas pu être prouvée (marqueur du serveur
//     attente_boutique_retrait, boutique_etrangere, origine inconnue) ;
//   · 'ordinateur' : le retrait attend depuis plus de 15 min et l'extension
//     n'a pas été vue depuis 15 min (Chrome fermé, ordinateur éteint).
export const ATTENTE_ORDINATEUR_MS = 15 * 60_000;

/** La boutique Vinted que ce retrait attend, ou null (pas ce mur). { login, boutique } */
export function retraitBloqueParBoutique(job) {
  if (!job || job.action !== 'delete' || job.platform !== 'vinted') return null;
  if (job.status !== 'pending' && job.status !== 'needs_user') return null;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  const ab = pf.attente_boutique_retrait;
  if (ab && typeof ab === 'object') return { login: ab.login ?? null, boutique: ab.boutique ?? null };
  if (pf.needs_user_source === 'boutique_etrangere' || (job.status === 'needs_user' && pf.boutique_etrangere)) {
    const be = pf.boutique_etrangere && typeof pf.boutique_etrangere === 'object' ? pf.boutique_etrangere : {};
    return { login: be.login_article ?? null, boutique: be.article ?? pf.vinted_account_id ?? null };
  }
  if (job.status === 'pending' && pf.verification_boutique_vinted?.motif === 'origine_inconnue') {
    return { login: null, boutique: pf.vinted_account_id ?? null };
  }
  if (job.status === 'pending' && pf.retenue_serveur?.motif === 'boutique_origine_inconnue') {
    const b = Array.isArray(pf.retenue_serveur.boutiques) ? pf.retenue_serveur.boutiques : [];
    return { login: b.length === 1 ? String(b[0]).replace(/^@/, '') : null, boutique: null };
  }
  return null;
}

/** Ce retrait attend-il un ordinateur allumé (extension silencieuse) ? */
export function retraitBloqueParOrdinateur(job, extensionVueLe, maintenant = Date.now()) {
  if (!job || job.action !== 'delete' || (job.status !== 'pending' && job.status !== 'processing')) return false;
  const ne = ts(job.created_at);
  if (!ne || maintenant - ne < ATTENTE_ORDINATEUR_MS) return false;
  const vu = ts(extensionVueLe);
  return !vu || maintenant - vu > ATTENTE_ORDINATEUR_MS;
}

// ── (15/10, XEWER) OPLA QUITTÉE : UN RETRAIT CLOS N'EST PAS UN RETRAIT FAIT ──
// Depuis la sortie d'Opla (bascule du 10/10, mig 20261011130000), un retrait
// Opla armé après une vente est clos aussitôt (« cancelled ») par la garde
// garde_opla_sortie_jobs, avec la phrase de Nico (MESSAGE_RETRAIT_OPLA_SORTIE,
// _shared/opla-sortie.js) — et l'app n'en disait RIEN : un retrait « cancelled »
// ne s'affichait nulle part (XEWER : « Les Sims 2 Naufragés DS », « Viewtiful
// Joe GameCube » ; 14 comptes, 87 annonces Opla sur des fiches vendues).
// Mur 'opla_sortie' : la personne doit retirer l'annonce elle-même sur Opla,
// puis toucher « C'est fait » (platform_fields.opla_retire_par_la_personne,
// posé sur les retraits clos de cette fiche ; le statut ne change pas).
// (22/10, XEWER — OPLA : PLUS RIEN) Plus aucun retrait Opla ne naît (migration 20261022100000) : l'information
// est posée UNE fois par le serveur sur la COPIE Opla (job de publication « published »,
// platform_fields.opla_a_retirer). Une copie ainsi marquée vaut la même ligne que l'ancien retrait clos — une
// seule par annonce, même quand la fiche a été supprimée (cleAnnonce : le lien, plus le numéro du job).
const MESSAGE_OPLA_SORTIE_RE = /Opla n'est plus pris en charge par FillSell|peut-être encore en ligne sur Opla/i;
export function copieOplaARetirer(job) {
  if (!job || job.platform !== 'opla' || job.status !== 'published' || !['publish', 'republish'].includes(job.action ?? 'publish')) return false;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  return !!pf.opla_a_retirer && !pf.opla_retire_par_la_personne;
}
export function retraitOplaQuittee(job) {
  if (copieOplaARetirer(job)) return true;
  if (!job || job.action !== 'delete' || job.platform !== 'opla' || job.status !== 'cancelled') return false;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  if (pf.opla_retire_par_la_personne) return false;
  return !!pf.opla_sortie || MESSAGE_OPLA_SORTIE_RE.test(String(job.error ?? ''));
}

// ── (22/10, DeadRoz, XEWER, Tech-t) JAMAIS DE RETRAIT EN ATTENTE SANS FIN ─────
// Des retraits d'articles VENDUS restaient « pending » des jours (DeadRoz : 2 retraits Beebs depuis le 14/10, l'un
// en vérification chez Beebs, l'autre « l'essai n'a pas abouti » 23 fois ; XEWER : 2 Beebs en modération) sans
// AUCUNE ligne dans « À régler » : aucun mur nommé, donc rien à l'écran. Au-delà de 24 h, le retrait d'un article
// vendu qui n'a pas abouti devient une ligne qui dit exactement quoi faire (FillSell continue d'essayer : la règle
// du 04/10 — jamais d'arrêt sur un raté technique — tient). Un mur plus précis (connexion, boutique, ordinateur,
// compte bloqué, Opla) passe toujours avant.
export const RETRAIT_EN_RETARD_MS = 24 * 3600 * 1000;
const BEEBS_VERIFICATION_RE = /Beebs (?:vérifie|l'examine|examine)|en vérification|pas encore visible sur Beebs/i;
/** Beebs garde l'annonce en vérification / modération (elle n'est pas achetable). */
export function retraitBeebsEnVerification(job) {
  if (!job || job.platform !== 'beebs') return false;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  return !!pf.retrait_en_attente_verification || !!pf.beebs_en_moderation || BEEBS_VERIFICATION_RE.test(String(job.error ?? ''));
}
/** Ce retrait d'article vendu attend-il depuis plus de 24 h sans aboutir ? */
export function retraitEnRetard(job, fiche, maintenant = Date.now()) {
  if (!job || job.action !== 'delete' || !['pending', 'processing', 'needs_user'].includes(job.status)) return false;
  const ne = ts(job.created_at);
  if (!ne || maintenant - ne < RETRAIT_EN_RETARD_MS) return false;
  return retraitApresVente(job, fiche);
}
const joursDepuis = (v, maintenant = Date.now()) => Math.max(1, Math.floor((maintenant - ts(v)) / (24 * 3600 * 1000)));

/** Un retrait d'article VENDU : la fiche le dit, ou le serveur l'a armé après une vente. */
export function retraitApresVente(job, fiche) {
  if (fiche?.statut === 'vendu') return true;
  const ap = job?.platform_fields?.arme_par;
  return !!(ap && typeof ap === 'object' && /armer_retrait_job/.test(String(ap.pose_par ?? '')));
}

/** L'annonce visée par un retrait : article (ou, fiche supprimée, son lien — sinon le job lui-même), plateforme, lien. */
function cleAnnonce(job) {
  // (22/10, XEWER) Fiche supprimée : plusieurs retraits de la MÊME annonce (même lien) font UNE ligne, plus une
  // par job (9 lignes pour 3 annonces Opla chez XEWER le 22/10).
  const lien = String(job.listing_url ?? '').trim();
  const article = job.inventaire_id != null ? `a:${job.inventaire_id}` : (lien ? 'sans-fiche' : `j:${job.id}`);
  return `${article}|${job.platform ?? ''}|${job.listing_url ?? ''}`;
}

function lireFiche(fiches, id) {
  if (id == null || !fiches) return null;
  if (fiches instanceof Map) return fiches.get(String(id)) ?? fiches.get(id) ?? null;
  if (Array.isArray(fiches)) return fiches.find((f) => String(f?.id) === String(id)) ?? null;
  return null;
}

/**
 * @param {object} p
 * @param {object[]} p.jobs    tous les jobs chargés (toutes actions, tous statuts)
 * @param {Map|object[]} p.fiches  les fiches (vendues comprises), par id
 * @param {number} [p.maintenant]  horloge (tests)
 * @returns {{ total:number, parPlateforme: {platform, nom, lignes, nVendus}[], parArticle: Map<string, {platform, job}[]> }}
 *   lignes : { job, titre, inventaireId, vendu (fiche statut 'vendu'), fiche (null si supprimée) }
 */
export function retraitsBloquesParConnexion({ jobs = [], fiches = null, maintenant = Date.now(), extensionVueLe, loginsBoutiques = null } = {}) {
  // 1. Le dernier retrait de chaque annonce.
  const derniers = new Map();
  for (const j of jobs ?? []) {
    if (!j || j.action !== 'delete') continue;
    const c = cleAnnonce(j);
    const vu = derniers.get(c);
    if (!vu || ts(j.created_at) > ts(vu.created_at)) derniers.set(c, j);
  }
  // 1 bis. (22/10) Une copie Opla marquée par le serveur, sans retrait de la même annonce : sa ligne — seulement
  // si l'article est vendu ou si sa fiche n'existe plus (un article revenu au stock n'a rien à retirer).
  for (const j of jobs ?? []) {
    if (!copieOplaARetirer(j)) continue;
    const c = cleAnnonce(j);
    if (derniers.has(c)) continue;
    const fiche = lireFiche(fiches, j.inventaire_id);
    if (fiche && fiche.statut !== 'vendu') continue;
    derniers.set(c, j);
  }
  // 2. Ceux qui attendent une reconnexion, groupés par plateforme.
  const groupes = new Map();
  const parArticle = new Map();
  for (const j of derniers.values()) {
    // Ordre : le mur le plus précis d'abord. `extensionVueLe === undefined`
    // (appelant d'avant le 12/10) : le mur « ordinateur » n'est pas jugé.
    const boutique = retraitBloqueParBoutique(j);
    const fiche = lireFiche(fiches, j.inventaire_id);
    const mur = retraitOplaQuittee(j) ? 'opla_sortie'
      : retraitBloqueParCompteVinted(j) ? 'compte_bloque'
      : retraitBloqueParConnexion(j, maintenant) ? 'connexion'
        : boutique ? 'boutique'
          : (extensionVueLe !== undefined && retraitBloqueParOrdinateur(j, extensionVueLe, maintenant)) ? 'ordinateur'
            : retraitEnRetard(j, fiche, maintenant) ? 'en_retard'
              : null;
    if (!mur) continue;
    const titre = String(fiche?.title ?? fiche?.titre ?? j.title ?? '').trim() || null;
    const login = boutique ? (boutique.login || (boutique.boutique != null ? loginsBoutiques?.[String(boutique.boutique)] ?? null : null)) : null;
    const ligne = { job: j, titre, inventaireId: j.inventaire_id ?? null, vendu: retraitApresVente(j, fiche), fiche, mur, ...(boutique ? { boutique: login ? `@${String(login).replace(/^@/, '')}` : null } : {}),
      ...(mur === 'en_retard' ? { jours: joursDepuis(j.created_at, maintenant), verificationBeebs: retraitBeebsEnVerification(j) } : {}) };
    const cle = `${j.platform}|${mur}${mur === 'boutique' ? `|${ligne.boutique ?? ''}` : ''}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(ligne);
    if (j.inventaire_id != null) {
      const k = String(j.inventaire_id);
      if (!parArticle.has(k)) parArticle.set(k, []);
      parArticle.get(k).push({ platform: j.platform, job: j, mur, boutique: ligne.boutique ?? null });
    }
  }
  const rang = (p) => { const i = ORDRE.indexOf(p); return i < 0 ? ORDRE.length : i; };
  const parPlateforme = [...groupes.entries()]
    .map(([cle, lignes]) => [cle.split('|')[0], cle.split('|')[1], lignes])
    .sort(([a, ma], [b, mb]) => rang(a) - rang(b) || String(a).localeCompare(String(b)) || String(ma).localeCompare(String(mb)))
    .map(([platform, mur, lignes]) => ({
      platform,
      mur,
      ...(mur === 'boutique' ? { boutique: lignes[0]?.boutique ?? null } : {}),
      nom: nomDe(platform),
      // Le plus récent d'abord.
      lignes: lignes.sort((a, b) => ts(b.job.created_at) - ts(a.job.created_at)),
      nVendus: lignes.filter((l) => l.vendu).length,
    }));
  const total = parPlateforme.reduce((t, g) => t + g.lignes.length, 0);
  return { total, parPlateforme, parArticle };
}

/**
 * La phrase du bandeau, pour UNE plateforme. Tout vendu → « articles vendus » ;
 * sinon (fiche supprimée, retrait demandé d'un article en stock) on ne dit
 * pas « vendu » à tort : « annonces dont tu as demandé le retrait ».
 */
export function texteRetraitsBloques(groupe, lang = 'fr') {
  if (!groupe?.lignes?.length) return null;
  const fr = lang !== 'en';
  const n = groupe.lignes.length;
  const nom = groupe.nom ?? nomDe(groupe.platform);
  const nVendus = groupe.nVendus ?? groupe.lignes.filter((l) => l.vendu).length;
  const plus = n > 1;
  // (12/10, A6) La boutique Vinted de l'annonce n'est pas celle ouverte dans Chrome.
  // (12/10 soir, Nico) « En attente de la bonne boutique » : ni alarme, ni
  // « risque de double vente » — le geste, et c'est tout.
  if (groupe.mur === 'boutique') {
    const b = groupe.boutique;
    const quoi = nVendus === n
      ? (fr ? `${n} article${plus ? 's' : ''} vendu${plus ? 's' : ''} encore en ligne sur ${nom}` : `${n} sold item${plus ? 's' : ''} still live on ${nom}`)
      : (fr ? `${n} annonce${plus ? 's' : ''} à retirer encore en ligne sur ${nom}` : `${n} listing${plus ? 's' : ''} to remove still live on ${nom}`);
    return fr
      ? `${quoi} : ${plus ? 'elles sont' : 'elle est'} sur ${b ? `ta boutique ${b}` : 'une autre de tes boutiques Vinted'}. Ouvre ${b ? `ta boutique ${b}` : 'cette boutique'} sur vinted.fr dans Chrome, sur ton ordinateur : FillSell ${plus ? 'les' : 'la'} retirera aussitôt.`
      : `${quoi}: ${plus ? 'they are' : 'it is'} on ${b ? `your shop ${b}` : 'another of your Vinted shops'}. Open ${b ? `your shop ${b}` : 'that shop'} on vinted.fr in Chrome, on your computer: FillSell will remove ${plus ? 'them' : 'it'} right away.`;
  }
  // (12/10, A6) L'extension ne tourne pas : Chrome fermé ou ordinateur éteint.
  if (groupe.mur === 'ordinateur') {
    const risqueO = nVendus > 0 ? (fr ? ' — risque de double vente' : ' — risk of selling twice') : '';
    const quoiO = nVendus === n
      ? (fr ? `${n} article${plus ? 's' : ''} vendu${plus ? 's' : ''} encore en ligne sur ${nom}` : `${n} sold item${plus ? 's' : ''} still live on ${nom}`)
      : (fr ? `${n} annonce${plus ? 's' : ''} à retirer encore en ligne sur ${nom}` : `${n} listing${plus ? 's' : ''} to remove still live on ${nom}`);
    return fr
      ? `${quoiO} : ouvre Chrome sur ton ordinateur, FillSell ${plus ? 'les' : 'la'} retirera aussitôt${risqueO}.`
      : `${quoiO}: open Chrome on your computer, FillSell will remove ${plus ? 'them' : 'it'} right away${risqueO}.`;
  }
  if (groupe.mur === 'opla_sortie') {
    const quoiOp = nVendus === n
      ? (fr ? `${n} article${plus ? 's' : ''} vendu${plus ? 's' : ''} peut-être encore en ligne sur Opla` : `${n} sold item${plus ? 's' : ''} maybe still live on Opla`)
      : (fr ? `${n} annonce${plus ? 's' : ''} à retirer peut-être encore en ligne sur Opla` : `${n} listing${plus ? 's' : ''} to remove maybe still live on Opla`);
    return fr
      ? `${quoiOp} : FillSell ne gère plus Opla, retire-${plus ? 'les' : 'la'} toi-même sur Opla, puis touche « C'est fait » — risque de double vente.`
      : `${quoiOp}: FillSell no longer handles Opla, remove ${plus ? 'them' : 'it'} yourself on Opla, then tap "Done" — risk of selling twice.`;
  }
  // (22/10) En retard : la phrase dit le geste ; FillSell continue d'essayer.
  if (groupe.mur === 'en_retard') {
    const jours = Math.max(...groupe.lignes.map((l) => Number(l.jours) || 1));
    const depuis = fr ? `depuis ${jours} jour${jours > 1 ? 's' : ''}` : `for ${jours} day${jours > 1 ? 's' : ''}`;
    // Vu le 22/10 dans « Mes annonces › En cours de vérification » : la carte n'a AUCUN geste (ni Supprimer, ni
    // Modifier) et la page publique répond 404 (test du 03/10) — Beebs ne laisse supprimer une annonce qu'une fois en
    // ligne. Elle n'est pas achetable pendant ce temps : la phrase le dit, sans geste impossible.
    if (groupe.lignes.every((l) => l.verificationBeebs)) {
      return fr
        ? `${n} article${plus ? 's' : ''} vendu${plus ? 's' : ''} : Beebs garde ${plus ? 'leurs annonces' : 'son annonce'} en vérification ${depuis}. Pendant la vérification, ${plus ? 'elles ne sont' : 'elle n’est'} pas achetable${plus ? 's' : ''} et Beebs ne permet pas de ${plus ? 'les' : 'la'} supprimer : FillSell ${plus ? 'les' : 'la'} retirera dès que Beebs ${plus ? 'les' : 'la'} met en ligne. Pour ${plus ? 'les' : 'la'} faire disparaître avant, demande-le au support Beebs.`
        : `${n} sold item${plus ? 's' : ''}: Beebs has kept ${plus ? 'their listings' : 'its listing'} under review ${depuis}. While under review ${plus ? 'they cannot' : 'it cannot'} be bought and Beebs does not allow deleting ${plus ? 'them' : 'it'}: FillSell will remove ${plus ? 'them' : 'it'} as soon as Beebs puts ${plus ? 'them' : 'it'} online. To have ${plus ? 'them' : 'it'} removed sooner, ask Beebs support.`;
    }
    const quoiR = nVendus === n
      ? (fr ? `${n} article${plus ? 's' : ''} vendu${plus ? 's' : ''} encore en ligne sur ${nom}` : `${n} sold item${plus ? 's' : ''} still live on ${nom}`)
      : (fr ? `${n} annonce${plus ? 's' : ''} à retirer encore en ligne sur ${nom}` : `${n} listing${plus ? 's' : ''} to remove still live on ${nom}`);
    return fr
      ? `${quoiR} : le retrait n'a pas abouti ${depuis}. Retire-${plus ? 'les' : 'la'} toi-même sur ${nom} — risque de double vente. FillSell continue d'essayer et s'arrête dès que l'annonce n'y est plus.`
      : `${quoiR}: the removal has not gone through ${depuis}. Remove ${plus ? 'them' : 'it'} yourself on ${nom} — risk of selling twice. FillSell keeps trying and stops as soon as the listing is gone.`;
  }
  if (groupe.mur === 'compte_bloque') {
    const risqueCb = nVendus > 0 ? (fr ? ' — risque de double vente' : ' — risk of selling twice') : '';
    return fr
      ? `${n} annonce${plus ? 's' : ''} encore en ligne sur ${nom} : sur ton ordinateur, ${nom} affiche « compte bloqué » à la place de ${plus ? 'tes annonces' : 'ton annonce'}. FillSell réessaie tout seul ; retire-${plus ? 'les' : 'la'} toi-même depuis l'appli ${nom} si tu peux${risqueCb}.`
      : `${n} listing${plus ? 's' : ''} still live on ${nom}: on your computer, ${nom} shows "account blocked" instead of ${plus ? 'your listings' : 'your listing'}. FillSell keeps retrying; remove ${plus ? 'them' : 'it'} yourself from the ${nom} app if you can${risqueCb}.`;
  }
  if (nVendus === n) {
    return fr
      ? `${n} article${plus ? 's' : ''} vendu${plus ? 's' : ''} encore en ligne sur ${nom} : FillSell ne peut pas ${plus ? 'les' : 'le'} retirer tant que tu ne te reconnectes pas à ${nom} dans Chrome, sur ton ordinateur — risque de double vente.`
      : `${n} sold item${plus ? 's' : ''} still live on ${nom}: FillSell can't remove ${plus ? 'them' : 'it'} until you sign back in to ${nom} in Chrome, on your computer — risk of selling twice.`;
  }
  const risque = nVendus > 0
    ? (fr ? ` — dont ${nVendus} vendu${nVendus > 1 ? 's' : ''} : risque de double vente` : ` — ${nVendus} of them sold: risk of selling twice`)
    : '';
  return fr
    ? `${n} annonce${plus ? 's' : ''} encore en ligne sur ${nom} alors que tu as demandé ${plus ? 'leur' : 'son'} retrait : FillSell ne peut pas ${plus ? 'les' : 'la'} retirer tant que tu ne te reconnectes pas à ${nom} dans Chrome, sur ton ordinateur${risque}.`
    : `${n} listing${plus ? 's' : ''} still live on ${nom} although you asked to remove ${plus ? 'them' : 'it'}: FillSell can't remove ${plus ? 'them' : 'it'} until you sign back in to ${nom} in Chrome, on your computer${risque}.`;
}

/** La ligne de la carte d'un article vendu dont le retrait attend. */
export function ligneCarteRetraitBloque(platform, lang = 'fr', mur = 'connexion', boutique = null) {
  const nom = nomDe(platform);
  // (12/10 soir) Rattachée à une fiche déjà vendue : le retrait attend l'accord.
  if (mur === 'a_retirer') {
    return lang === 'en'
      ? `Still live on ${nom} — tap "Remove" so FillSell takes it down (risk of selling twice)`
      : `Encore en ligne sur ${nom} — touche « Retirer » pour que FillSell la retire (risque de double vente)`;
  }
  if (mur === 'boutique') {
    return lang === 'en'
      ? `Still live on ${nom} — open ${boutique ? `your shop ${boutique}` : 'the Vinted shop that holds it'} in Chrome to remove it`
      : `Encore en ligne sur ${nom} — ouvre ${boutique ? `ta boutique ${boutique}` : 'la boutique Vinted qui la porte'} dans Chrome pour la retirer`;
  }
  if (mur === 'ordinateur') {
    return lang === 'en'
      ? `Still live on ${nom} — open Chrome on your computer to remove it (risk of selling twice)`
      : `Encore en ligne sur ${nom} — ouvre Chrome sur ton ordinateur pour la retirer (risque de double vente)`;
  }
  if (mur === 'opla_sortie') {
    return lang === 'en'
      ? 'Maybe still live on Opla — FillSell no longer handles Opla: remove it yourself on Opla (risk of selling twice)'
      : 'Peut-être encore en ligne sur Opla — FillSell ne gère plus Opla : retire-la toi-même sur Opla (risque de double vente)';
  }
  if (mur === 'en_retard') {
    return lang === 'en'
      ? `Removal from ${nom} not done for over a day — remove it yourself on ${nom} (risk of selling twice)`
      : `Retrait ${nom} en échec depuis plus d'un jour — retire-la toi-même sur ${nom} (risque de double vente)`;
  }
  if (mur === 'compte_bloque') {
    return lang === 'en'
      ? `Still live on ${nom} — "account blocked" on your computer: remove it from the ${nom} app (risk of selling twice)`
      : `Encore en ligne sur ${nom} — « compte bloqué » sur ton ordinateur : retire-la depuis l'appli ${nom} (risque de double vente)`;
  }
  return lang === 'en'
    ? `Still live on ${nom} — sign back in to remove it (risk of selling twice)`
    : `Encore en ligne sur ${nom} — reconnecte-toi pour le retirer (risque de double vente)`;
}

/** Titre et détail de la ligne « À régler ». */
export function ligneARegler(bloques, lang = 'fr') {
  const fr = lang !== 'en';
  const n = bloques?.total ?? 0;
  const noms = (bloques?.parPlateforme ?? []).map((g) => g.nom);
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${noms[noms.length - 1]}` : (noms[0] ?? '');
  // (06/10) Seulement des « compte bloqué » chez Vinted : le geste est
  // l'appli Vinted, pas une reconnexion.
  const seulementCompteBloque = (bloques?.parPlateforme ?? []).length > 0
    && (bloques?.parPlateforme ?? []).every((g) => g.mur === 'compte_bloque');
  // (12/10, A6) Un seul geste quand un seul mur : la boutique à ouvrir, ou Chrome.
  const murs = new Set((bloques?.parPlateforme ?? []).map((g) => g.mur));
  if (murs.size === 1 && (murs.has('boutique') || murs.has('ordinateur'))) {
    const g0 = bloques.parPlateforme[0];
    const boutiques = [...new Set(bloques.parPlateforme.map((g) => g.boutique).filter(Boolean))];
    return {
      titre: fr ? (n > 1 ? 'Annonces encore en ligne à retirer' : 'Annonce encore en ligne à retirer') : (n > 1 ? 'Listings still live to remove' : 'Listing still live to remove'),
      detail: murs.has('ordinateur')
        ? (fr ? `Ouvre Chrome sur ton ordinateur pour que FillSell ${n > 1 ? 'les' : 'la'} retire — risque de double vente.` : `Open Chrome on your computer so FillSell can remove ${n > 1 ? 'them' : 'it'} — risk of selling twice.`)
        : (fr
          ? `Ouvre ${boutiques.length === 1 ? `ta boutique ${boutiques[0]}` : (g0?.boutique ? `tes boutiques ${boutiques.join(', ')}` : 'la boutique Vinted qui les porte')} dans Chrome pour que FillSell ${n > 1 ? 'les' : 'la'} retire.`
          : `Open ${boutiques.length === 1 ? `your shop ${boutiques[0]}` : (g0?.boutique ? `your shops ${boutiques.join(', ')}` : 'the Vinted shop that holds them')} in Chrome so FillSell can remove ${n > 1 ? 'them' : 'it'}.`),
    };
  }
  const titre = fr ? (n > 1 ? 'Annonces encore en ligne à retirer' : 'Annonce encore en ligne à retirer') : (n > 1 ? 'Listings still live to remove' : 'Listing still live to remove');
  if (seulementCompteBloque) {
    return {
      titre,
      detail: fr
        ? `« Compte bloqué » sur ${liste} : retire-${n > 1 ? 'les' : 'la'} depuis l'appli ${liste} — risque de double vente.`
        : `"Account blocked" on ${liste}: remove ${n > 1 ? 'them' : 'it'} from the ${liste} app — risk of selling twice.`,
    };
  }
  // (12/10, A6) Murs MÊLÉS : un geste par mur, jamais « Reconnecte-toi » pour
  // une boutique à ouvrir ou un ordinateur éteint (l'app n'offrirait aucun
  // geste qui marche). Que des reconnexions : la phrase d'avant, inchangée.
  const groupesDe = (m) => (bloques?.parPlateforme ?? []).filter((g) => (g.mur ?? 'connexion') === m);
  const lister = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${arr[arr.length - 1]}` : (arr[0] ?? ''));
  const gestes = [];
  if (groupesDe('boutique').length) {
    const b = [...new Set(groupesDe('boutique').map((g) => g.boutique).filter(Boolean))];
    gestes.push(fr
      ? `ouvre ${b.length === 1 ? `ta boutique ${b[0]}` : b.length ? `tes boutiques ${lister(b)}` : 'la boutique Vinted qui les porte'} dans Chrome`
      : `open ${b.length === 1 ? `your shop ${b[0]}` : b.length ? `your shops ${lister(b)}` : 'the Vinted shop that holds them'} in Chrome`);
  }
  if (groupesDe('ordinateur').length) gestes.push(fr ? 'ouvre Chrome sur ton ordinateur' : 'open Chrome on your computer');
  const cx = [...new Set(groupesDe('connexion').map((g) => g.nom))];
  if (cx.length) gestes.push(fr ? `reconnecte-toi à ${lister(cx)}` : `sign back in to ${lister(cx)}`);
  const cb = [...new Set(groupesDe('compte_bloque').map((g) => g.nom))];
  // (22/10) Retrait en retard : le geste à la main, sur la plateforme.
  const rt = [...new Set(groupesDe('en_retard').map((g) => g.nom))];
  const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const phrase = gestes.length
    ? (fr
      ? `${majuscule(lister(gestes))} pour que FillSell ${n > 1 ? 'les' : 'la'} retire`
      : `${majuscule(lister(gestes))} so FillSell can remove ${n > 1 ? 'them' : 'it'}`)
    : '';
  // (15/10) Opla quittée : la personne retire elle-même, FillSell ne fait rien.
  const op = groupesDe('opla_sortie').length > 0;
  const suiteOp = op
    ? (fr ? `${phrase || cb.length ? ' ; ' : ''}Opla : FillSell ne la gère plus, retire toi-même sur Opla ce qui y est encore, puis « C'est fait »` : `${phrase || cb.length ? '; ' : ''}Opla: FillSell no longer handles it, remove yourself on Opla what is still there, then "Done"`)
    : '';
  const suiteRt = rt.length
    ? (fr ? `${phrase || cb.length || op ? ' ; ' : ''}${lister(rt)} : le retrait n'a pas abouti depuis plus d'un jour, retire-${n > 1 ? 'les' : 'la'} toi-même (FillSell continue d'essayer)` : `${phrase || cb.length || op ? '; ' : ''}${lister(rt)}: the removal has not gone through for over a day, remove ${n > 1 ? 'them' : 'it'} yourself (FillSell keeps trying)`)
    : '';
  const suiteCb = cb.length
    ? (fr ? `${phrase ? ' ; ' : ''}« compte bloqué » sur ${lister(cb)} : retire-les depuis l'appli` : `${phrase ? '; ' : ''}"account blocked" on ${lister(cb)}: remove them from the app`)
    : '';
  // (12/10 soir) Le risque n'est dit que pour un mur qui n'est pas « boutique ».
  const risqueMele = (bloques?.parPlateforme ?? []).some((g) => (g.mur ?? 'connexion') !== 'boutique');
  return { titre, detail: `${majuscule(`${phrase}${suiteCb}${suiteOp}${suiteRt}`.replace(/^ ?; /, ''))}${risqueMele ? (fr ? ' — risque de double vente.' : ' — risk of selling twice.') : '.'}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// (12/10 soir, Nico) PLUS AUCUN BANDEAU — UN ARTICLE VENDU ENCORE EN LIGNE
// EST UNE LIGNE DE « À RÉGLER », ET NULLE PART AILLEURS
// ═══════════════════════════════════════════════════════════════════════════
// Le bandeau rouge « Un article vendu est encore en ligne » (A6) doublait
// « À régler » et sortait du dessin de l'app. Chaque article VENDU dont une
// annonce reste en ligne devient UNE ligne : son titre, la plateforme, le
// geste. Deux sources, déjà lues (aucune requête de plus) :
//   · un retrait en file qui attend la personne (les murs ci-dessus) ;
//   · une annonce rattachée à une fiche déjà vendue, dont le retrait attend
//     son accord (platform_fields.pending_removal, l'ancien bandeau
//     « 🎉 Vendu : … — retirer ? »).
// Seuls les articles dont la FICHE existe : la ligne ouvre la fiche. Le reste
// (fiche supprimée, article en stock) reste dans la ligne « retraits ».
// ⛔ Affichage seulement : aucun statut, aucun job, aucune surveillance touchés.

/**
 * Le geste pour un groupe de plateformes d'un article vendu encore en ligne
 * (même mur, même boutique) : { mur, boutique, noms[] }.
 */
function gesteVenduEnLigne(g, lang = 'fr') {
  const fr = lang !== 'en';
  const plus = (g.noms?.length ?? 0) > 1;
  const noms = listerNoms(g.noms ?? [], lang);
  const la = fr ? (plus ? 'les' : 'la') : (plus ? 'them' : 'it');
  switch (g.mur) {
    case 'boutique':
      return fr
        ? `ouvre ${g.boutique ? `ta boutique ${g.boutique}` : 'la boutique Vinted qui la porte'} sur vinted.fr dans Chrome, sur ton ordinateur : FillSell ${la} retirera aussitôt`
        : `open ${g.boutique ? `your shop ${g.boutique}` : 'the Vinted shop that holds it'} on vinted.fr in Chrome, on your computer: FillSell will remove ${la} right away`;
    case 'ordinateur':
      return fr
        ? `ouvre Chrome sur ton ordinateur : FillSell ${la} retirera aussitôt`
        : `open Chrome on your computer: FillSell will remove ${la} right away`;
    case 'compte_bloque':
      return fr
        ? `${noms} affiche « compte bloqué » sur ton ordinateur : retire-${la} depuis l'appli ${noms} si tu peux, FillSell réessaie tout seul`
        : `${noms} shows "account blocked" on your computer: remove ${la} from the ${noms} app if you can, FillSell keeps retrying`;
    case 'opla_sortie':
      return fr
        ? `FillSell ne gère plus Opla : retire-${la} toi-même sur Opla, puis touche « C'est fait » dans la fiche`
        : `FillSell no longer handles Opla: remove ${la} yourself on Opla, then tap "Done" on the item`;
    case 'en_retard':
      return fr
        ? `le retrait n'a pas abouti depuis plus d'un jour : retire-${la} toi-même sur ${noms} (FillSell continue d'essayer)`
        : `the removal has not gone through for over a day: remove ${la} yourself on ${noms} (FillSell keeps trying)`;
    case 'a_retirer':
      return fr
        ? `${plus ? 'elles attendent' : 'elle attend'} ton accord : touche « Retirer » dans la fiche, FillSell ${la} retire depuis ton ordinateur`
        : `${plus ? 'they are' : 'it is'} waiting for your go-ahead: tap "Remove" on the item, FillSell removes ${la} from your computer`;
    default: // 'connexion'
      return fr
        ? `reconnecte-toi à ${noms} dans Chrome, sur ton ordinateur : FillSell ${la} retirera aussitôt`
        : `sign back in to ${noms} in Chrome, on your computer: FillSell will remove ${la} right away`;
  }
}

function listerNoms(arr, lang = 'fr') {
  const fr = lang !== 'en';
  return arr.length > 1 ? `${arr.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${arr[arr.length - 1]}` : (arr[0] ?? '');
}

/** Les annonces à retirer avec l'accord de la personne (pending_removal), par article. */
export function retraitsEnAttenteParArticle(pendingRemovals = []) {
  const m = new Map();
  for (const j of pendingRemovals ?? []) {
    if (!j || j.inventaire_id == null) continue;
    const k = String(j.inventaire_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(j);
  }
  return m;
}

/**
 * Les articles VENDUS encore en ligne, un par article (fiche présente).
 * @returns {{ inventaireId, fiche, titre, plateformes: {platform, mur, boutique, jobs}[], aRetirer: object[], ton: 'regler'|'echec' }[]}
 *   aRetirer : les jobs pending_removal (le geste « Retirer » de la fiche) ;
 *   ton : 'regler' (ambre) quand rien n'est une alarme — la bonne boutique à
 *   ouvrir, un retrait qui attend ton accord ; sinon 'echec' (le rouge des
 *   retraits bloqués d'avant).
 */
export function articlesVendusEncoreEnLigne({ retraits = null, pendingRemovals = [], fiches = null } = {}) {
  const parArticle = new Map();
  const entree = (id, fiche) => {
    const k = String(id);
    if (!parArticle.has(k)) {
      parArticle.set(k, {
        inventaireId: fiche?.id ?? id, fiche,
        titre: String(fiche?.title ?? fiche?.titre ?? '').trim() || null,
        plateformes: [], aRetirer: [], recent: 0,
      });
    }
    return parArticle.get(k);
  };
  // 1. Les retraits en file qui attendent la personne (vendus, fiche présente).
  for (const g of retraits?.parPlateforme ?? []) {
    for (const l of g.lignes ?? []) {
      if (!l.vendu || !l.fiche || l.inventaireId == null) continue;
      const a = entree(l.inventaireId, l.fiche);
      if (!a.titre && l.titre) a.titre = l.titre;
      const mur = g.mur ?? 'connexion';
      const deja = a.plateformes.find((p) => p.platform === g.platform && p.mur === mur);
      if (deja) deja.jobs.push(l.job);
      else a.plateformes.push({ platform: g.platform, mur, boutique: l.boutique ?? null, jobs: [l.job] });
      a.recent = Math.max(a.recent, ts(l.job?.created_at));
    }
  }
  // 2. Les annonces d'un article vendu à retirer avec son accord. Une
  //    plateforme dont un retrait est déjà en file n'en reçoit pas un second.
  for (const [k, jobs] of retraitsEnAttenteParArticle(pendingRemovals)) {
    const fiche = lireFiche(fiches, k);
    if (!fiche) continue;
    const a = entree(k, fiche);
    if (!a.titre) a.titre = String(jobs[0]?.title ?? '').trim() || null;
    for (const j of jobs) {
      if (a.plateformes.some((p) => p.platform === j.platform && p.mur !== 'a_retirer')) continue;
      a.aRetirer.push(j);
      const deja = a.plateformes.find((p) => p.platform === j.platform && p.mur === 'a_retirer');
      if (deja) deja.jobs.push(j);
      else a.plateformes.push({ platform: j.platform, mur: 'a_retirer', boutique: null, jobs: [j] });
      a.recent = Math.max(a.recent, ts(j.created_at));
    }
  }
  const rang = (p) => { const i = ORDRE.indexOf(p); return i < 0 ? ORDRE.length : i; };
  return [...parArticle.values()]
    .filter((a) => a.plateformes.length > 0)
    .map((a) => ({
      ...a,
      plateformes: a.plateformes.sort((x, y) => rang(x.platform) - rang(y.platform)),
      ton: a.plateformes.every((p) => p.mur === 'boutique' || p.mur === 'a_retirer') ? 'regler' : 'echec',
    }))
    .sort((x, y) => y.recent - x.recent);
}

/** Le détail de la ligne « À régler » d'un article vendu encore en ligne. */
export function detailArticleVenduEnLigne(article, lang = 'fr') {
  const fr = lang !== 'en';
  const pfs = article?.plateformes ?? [];
  if (!pfs.length) return null;
  const noms = [...new Set(pfs.map((p) => nomDe(p.platform)))];
  const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // (15/10) Opla quittée : FillSell ne la lit plus — « peut-être », jamais une certitude.
  const peutEtre = pfs.every((p) => p.mur === 'opla_sortie');
  const tete = fr ? `Vendu, ${peutEtre ? 'peut-être ' : ''}encore en ligne sur ${listerNoms(noms, lang)}.` : `Sold, ${peutEtre ? 'maybe ' : ''}still live on ${listerNoms(noms, lang)}.`;
  // Un geste par mur (et par boutique), jamais le même geste répété.
  const groupes = new Map();
  for (const p of pfs) {
    const k = `${p.mur}|${p.boutique ?? ''}`;
    if (!groupes.has(k)) groupes.set(k, { mur: p.mur, boutique: p.boutique ?? null, noms: [] });
    const g = groupes.get(k);
    if (!g.noms.includes(nomDe(p.platform))) g.noms.push(nomDe(p.platform));
  }
  const liste = [...groupes.values()];
  const gestes = liste.length === 1
    ? majuscule(gesteVenduEnLigne(liste[0], lang))
    // Préfixe « Vinted : » seulement quand le geste ne nomme pas déjà la plateforme.
    : liste.map((g) => ((g.mur === 'connexion' || g.mur === 'compte_bloque')
      ? gesteVenduEnLigne(g, lang)
      : `${listerNoms(g.noms, lang)}${fr ? ' : ' : ': '}${gesteVenduEnLigne(g, lang)}`)).join(fr ? ' ; ' : '; ');
  // Le risque n'est dit que hors « boutique » (12/10 soir, Nico).
  const risque = pfs.some((p) => p.mur !== 'boutique');
  return `${tete} ${gestes}${risque ? (fr ? ' — risque de double vente.' : ' — risk of selling twice.') : '.'}`;
}

/**
 * Les retraits bloqués SANS les articles vendus qui ont déjà leur ligne
 * (fiche en stock, fiche supprimée) : la ligne « retraits » de « À régler ».
 */
export function retraitsHorsArticlesVendus(retraits, articles = []) {
  const ids = new Set((articles ?? []).map((a) => String(a.inventaireId)));
  const parPlateforme = (retraits?.parPlateforme ?? [])
    .map((g) => {
      const lignes = (g.lignes ?? []).filter((l) => !(l.inventaireId != null && ids.has(String(l.inventaireId)) && l.vendu && l.fiche));
      return { ...g, lignes, nVendus: lignes.filter((l) => l.vendu).length };
    })
    .filter((g) => g.lignes.length > 0);
  const parArticle = new Map([...(retraits?.parArticle ?? new Map())].filter(([k]) => !ids.has(String(k))));
  return { total: parPlateforme.reduce((t, g) => t + g.lignes.length, 0), parPlateforme, parArticle };
}
