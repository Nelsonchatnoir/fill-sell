// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT SANS NUMÉRO EST RATTACHÉ PAR LE RELEVÉ : LES PHOTOS DE NOTRE COPIE
// (15/10 soir, mission « clôture du rouge », points 1 et 2)
// ═══════════════════════════════════════════════════════════════════════════
// 88 dépôts Beebs du parc sont « publiés » sans numéro ni lien (dépôt confirmé
// par Beebs, numéro jamais rendu : extensions d'avant la 0.6.80, lecture
// « Mes annonces » ratée). Sans numéro, un article vendu ne peut pas être
// retiré (Joe0410, « T-shirt Nasa ») et l'annonce n'est rattachée à rien.
// La règle du 29/09 n'acceptait que l'identifiant ; la cascade de Nico du
// 15/10 (identifiants → photos → IA, question seulement si incertain) fait
// des PHOTOS la deuxième preuve.
//
// LA RÈGLE : une annonce du relevé du compte, rattachée à RIEN (ni job, ni
// fiche), vue pour la première fois après le dépôt, dont le numéro n'est pas
// « numéroté avant le dépôt » (retrait-introuvable.js), et dont les photos
// sont celles de NOTRE COPIE (les photos du job, ce que l'extension a
// envoyé) — même mesure que la cascade (trancherParPhotos : une seule
// candidate « même photo », toutes les autres sans photo approchante) — est
// l'annonce de ce dépôt. Appariement MUTUEL : une annonce désignée par deux
// dépôts n'est donnée à aucun (deux exemplaires aux mêmes photos).
// ⛔ Jamais le titre, jamais le prix, jamais la date seule.
// ⛔ Le doute ne rattache rien : le dépôt reste tel quel.
// Pur (Deno + Node) : scripts/depot-sans-numero-selftest.mjs.

import { trancherParPhotos } from "./annonce-partagee.js";
import { numeroteeAvantLeDepot } from "./retrait-introuvable.js";
import { urlsPhotos } from "./recreation-deja-partie.js";

const MARGE_MS = 10 * 60_000;
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** Les annonces qui peuvent être celles d'un dépôt (sans les photos). */
export function candidatesDuDepot(depot, lignes, platform = "beebs") {
  const t = ms(depot?.published_at ?? depot?.created_at);
  if (!Number.isFinite(t)) return [];
  return (Array.isArray(lignes) ? lignes : []).filter((a) => a && !a.job_id && a.inventaire_id == null
    && !a.disparu_le && !a.retiree_le
    && /^(en_ligne|en_verification)$/.test(String(a.statut_plateforme ?? ""))
    && ms(a.created_at) >= t - MARGE_MS
    && !numeroteeAvantLeDepot(platform, a, { lignes, depotLe: depot.published_at ?? depot.created_at }));
}

/** Les URL de photos d'une annonce relevée (capture d'abord, vignette ensuite). */
export function urlsAnnonce(a) {
  return [...new Set([...urlsPhotos(a?.capture?.photos, 4), ...urlsPhotos([a?.photo_url], 1)])];
}

/**
 * @param {{ depots: any[], lignes: any[], empreinte: (url: string) => any, platform?: string }} arg
 *   depots : jobs (id, user_id, photos, published_at, created_at) d'UN compte ;
 *   lignes : annonces_plateforme de CE compte et de la plateforme ;
 *   empreinte(url) : la ligne photo_empreintes de l'URL, ou undefined.
 * @returns {Map<string, { listing_id: string, statut: string, preuve: string, photos: any }>}
 */
export function rattacherParPhotos({ depots, lignes, empreinte, platform = "beebs" }) {
  const choix = new Map();
  for (const d of Array.isArray(depots) ? depots : []) {
    const cands = candidatesDuDepot(d, lignes, platform);
    if (!cands.length) continue;
    const copie = urlsPhotos(d.photos).map((u) => empreinte(u)).filter(Boolean);
    if (!copie.length) continue;
    const parCand = new Map(cands.map((a) => [String(a.listing_id), urlsAnnonce(a).map((u) => empreinte(u)).filter(Boolean)]));
    const ph = trancherParPhotos(copie, parCand);
    if (!ph.fiche) continue;
    const a = cands.find((x) => String(x.listing_id) === String(ph.fiche));
    if (!a) continue;
    choix.set(String(d.id), { listing_id: String(a.listing_id), statut: String(a.statut_plateforme), preuve: "photos identiques à celles de notre copie", photos: ph.niveaux });
  }
  // Appariement mutuel : une annonce désignée par deux dépôts n'est à personne.
  const parAnnonce = new Map();
  for (const [jid, c] of choix) parAnnonce.set(c.listing_id, [...(parAnnonce.get(c.listing_id) ?? []), jid]);
  for (const [, jids] of parAnnonce) if (jids.length > 1) for (const jid of jids) choix.delete(jid);
  return choix;
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CYCLE SE TRANCHE EN ENTIER (25/10 nuit — Ciddjy, cycle du 20/10 16:47:04)
// ═══════════════════════════════════════════════════════════════════════════
// get-pending-jobs jugeait les dépôts suspects d'un compte UN PAR UN contre un
// relevé lu une fois : neuf pyjamas, quatre annonces apparues — celles de
// quatre de ces dépôts (photos à 0 bit) ; les quatre autres, jugés avant ou
// entre eux, voyaient encore ces annonces (« autre » partout → non concluant)
// et recevaient la question, avec en lien les annonces d'AUTRES fiches.
// Désormais : les photos désignent pour TOUS les dépôts du cycle ensemble
// (appariement mutuel), puis chaque autre dépôt est jugé contre les candidates
// qui restent — une annonce prouvée à un autre dépôt n'est plus candidate.
// Rien d'autre ne change : aucune candidate → redépôt autorisé ; doute → la
// question. Pur (Deno + Node).
/**
 * @param {{ depots: any[], lignes: any[], empreinte: (url: string) => any, platform?: string }} arg
 * @returns {{ rattaches: Map<string, any>, aucune: string[], question: Map<string, any[]>, prises: Set<string> }}
 */
export function jugerCycleDepots({ depots, lignes, empreinte, platform = "beebs" }) {
  const liste = Array.isArray(depots) ? depots : [];
  const rattaches = rattacherParPhotos({ depots: liste, lignes, empreinte, platform });
  const prises = new Set([...rattaches.values()].map((c) => String(c.listing_id)));
  const aucune = [];
  const question = new Map();
  for (const d of liste) {
    const id = String(d?.id ?? "");
    if (!id || rattaches.has(id)) continue;
    const cands = candidatesDuDepot(d, lignes, platform).filter((a) => !prises.has(String(a.listing_id)));
    if (cands.length) question.set(id, cands);
    else aucune.push(id);
  }
  return { rattaches, aucune, question, prises };
}

/** Toutes les annonces candidates d'un lot de dépôts (pour lire leurs empreintes en une fois). */
export function candidatesDesDepots(depots, lignes, platform = "beebs") {
  const vues = new Map();
  for (const d of Array.isArray(depots) ? depots : []) for (const a of candidatesDuDepot(d, lignes, platform)) vues.set(String(a.listing_id), a);
  return [...vues.values()];
}

// ═══════════════════════════════════════════════════════════════════════════
// JAMAIS UN DEUXIÈME DÉPÔT BEEBS À L'AVEUGLE (15/10 soir, point 1, Ciddjy)
// ═══════════════════════════════════════════════════════════════════════════
// Ciddjy (Pro, 0.6.110), lot du 14/10, « Jogging 18 mois » ×2 : des dépôts
// coupés en route (poste muet 15 à 42 min, « pas de réponse du content
// script ») puis remis en file. Rien ne relisait le compte avant de
// redéposer : si le clic « Publier » était parti, le redépôt créait une
// deuxième annonce. Le circuit existait pour les REMISES EN LIGNE
// (recreation-deja-partie.js) ; il manquait aux PUBLICATIONS.
//
// LE DERNIER ESSAI A-T-IL PU ENVOYER LE DÉPÔT ?
//   · « Dépôt Beebs non confirmé » AVEC une requête captée par la sonde : oui ;
//     SANS aucune capture (« la soumission n'est jamais partie ») : non — un
//     nouvel essai n'est pas à l'aveugle ;
//   · essai commencé (work_window_state.at_start) sans fin relevée depuis :
//     on ne sait pas où il s'est arrêté — oui ;
//   · essai terminé sur un canal muet (« pas de réponse du content script »,
//     canal fermé) : le script a pu cliquer avant de se taire — oui.
// Une vérification déjà faite APRÈS cet essai (`depot_verifie.apres`) le lève.
const CANAL_MUET_RE = /pas de réponse du content script|message channel closed|canal (?:coupé|indisponible)|Receiving end does not exist/i;
export function depotPublicationPeutEtrePartiDepuis(platform, pf) {
  if (platform !== "beebs" || !pf || typeof pf !== "object") return null;
  const wws = pf.work_window_state && typeof pf.work_window_state === "object" ? pf.work_window_state : {};
  const debut = ms(wws.at_start?.at);
  const fins = [...(Array.isArray(wws.fins) ? wws.fins : []), ...(wws.at_end ? [wws.at_end] : [])].map((f) => ms(f?.at)).filter(Number.isFinite);
  const derniereFin = fins.length ? Math.max(...fins) : NaN;
  let susp = null;
  if (Number.isFinite(debut) && !(derniereFin >= debut)) {
    susp = { t: debut, raison: "essai commencé sans fin relevée (poste muet ou onglet perdu)" };
  } else {
    const diag = typeof pf.last_diagnostic === "string" ? pf.last_diagnostic : JSON.stringify(pf.last_diagnostic ?? "");
    const brut = String(pf.error_technique?.brut ?? "");
    const tErr = ms(pf.error_technique?.at);
    const recent = Number.isFinite(tErr) && Number.isFinite(debut) && tErr >= debut;
    if (/dépôt non confirmé/i.test(diag) && /capture\(s\)/i.test(diag) && !/AUCUNE capture/i.test(diag)) {
      susp = { t: Number.isFinite(derniereFin) ? derniereFin : (Number.isFinite(debut) ? debut : Date.now()), raison: "dépôt non confirmé alors qu'une requête est partie vers Beebs" };
    } else if (recent && CANAL_MUET_RE.test(brut)) {
      susp = { t: Number.isFinite(derniereFin) ? derniereFin : tErr, raison: "essai terminé sans réponse du formulaire (le clic a pu partir)" };
    }
  }
  if (!susp) return null;
  const verifie = ms(pf.depot_verifie?.apres);
  if (Number.isFinite(verifie) && verifie >= susp.t) return null;
  // La question a été posée et la personne a relancé APRÈS elle : c'est sa
  // réponse (« ce n'est pas lui ») — jamais une boucle de questions.
  const question = ms(pf.depot_deja_parti?.le);
  const relance = ms(pf.derniere_relance_manuelle);
  if (Number.isFinite(question) && Number.isFinite(relance) && relance >= question) return null;
  return { at: new Date(susp.t).toISOString(), raison: susp.raison };
}
