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
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla',
});
const ORDRE = ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla'];

const MESSAGE_CONNEXION_RE = /^(?:Re)?connexion (?:Vinted|Leboncoin|Beebs|eBay|Opla) requise|^En attente de ta connexion à /i;
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

/** L'annonce visée par un retrait : article (ou le job lui-même), plateforme, lien. */
function cleAnnonce(job) {
  const article = job.inventaire_id != null ? `a:${job.inventaire_id}` : `j:${job.id}`;
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
export function retraitsBloquesParConnexion({ jobs = [], fiches = null, maintenant = Date.now() } = {}) {
  // 1. Le dernier retrait de chaque annonce.
  const derniers = new Map();
  for (const j of jobs ?? []) {
    if (!j || j.action !== 'delete') continue;
    const c = cleAnnonce(j);
    const vu = derniers.get(c);
    if (!vu || ts(j.created_at) > ts(vu.created_at)) derniers.set(c, j);
  }
  // 2. Ceux qui attendent une reconnexion, groupés par plateforme.
  const groupes = new Map();
  const parArticle = new Map();
  for (const j of derniers.values()) {
    const mur = retraitBloqueParCompteVinted(j) ? 'compte_bloque' : (retraitBloqueParConnexion(j, maintenant) ? 'connexion' : null);
    if (!mur) continue;
    const fiche = lireFiche(fiches, j.inventaire_id);
    const titre = String(fiche?.title ?? fiche?.titre ?? j.title ?? '').trim() || null;
    const ligne = { job: j, titre, inventaireId: j.inventaire_id ?? null, vendu: fiche?.statut === 'vendu', fiche, mur };
    const cle = `${j.platform}|${mur}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(ligne);
    if (j.inventaire_id != null) {
      const k = String(j.inventaire_id);
      if (!parArticle.has(k)) parArticle.set(k, []);
      parArticle.get(k).push({ platform: j.platform, job: j, mur });
    }
  }
  const rang = (p) => { const i = ORDRE.indexOf(p); return i < 0 ? ORDRE.length : i; };
  const parPlateforme = [...groupes.entries()]
    .map(([cle, lignes]) => [cle.split('|')[0], cle.split('|')[1], lignes])
    .sort(([a, ma], [b, mb]) => rang(a) - rang(b) || String(a).localeCompare(String(b)) || String(ma).localeCompare(String(mb)))
    .map(([platform, mur, lignes]) => ({
      platform,
      mur,
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
export function ligneCarteRetraitBloque(platform, lang = 'fr', mur = 'connexion') {
  const nom = nomDe(platform);
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
  return {
    titre: fr ? (n > 1 ? 'Annonces encore en ligne à retirer' : 'Annonce encore en ligne à retirer') : (n > 1 ? 'Listings still live to remove' : 'Listing still live to remove'),
    detail: seulementCompteBloque
      ? (fr
        ? `« Compte bloqué » sur ${liste} : retire-${n > 1 ? 'les' : 'la'} depuis l'appli ${liste} — risque de double vente.`
        : `"Account blocked" on ${liste}: remove ${n > 1 ? 'them' : 'it'} from the ${liste} app — risk of selling twice.`)
      : fr
        ? `Reconnecte-toi à ${liste} pour que FillSell ${n > 1 ? 'les' : 'la'} retire — risque de double vente.`
        : `Sign back in to ${liste} so FillSell can remove ${n > 1 ? 'them' : 'it'} — risk of selling twice.`,
  };
}
