// ═══════════════════════════════════════════════════════════════════════════
// LA DESCRIPTION PRÊTE, SANS JAMAIS RIEN OUVRIR (15/11/2026, point 3 de Nico — maquette validée)
// ═══════════════════════════════════════════════════════════════════════════
// Le 14/11 (point A, « lecture-origine-gardee ») : fermer l'écran d'attente pendant la lecture de la description
// d'origine GARDAIT la publication, et le formulaire se rouvrait TOUT SEUL dès que la description arrivait en base —
// même si la personne faisait autre chose. Règle de Nico : une fenêtre ne s'ouvre jamais pendant que l'utilisateur
// fait autre chose. Désormais, pour tous les comptes (Cloud ou extension) et toutes les plateformes :
//   · resté sur l'écran d'attente : la publication s'ouvre dès que la description arrive (inchangé, l'écran le fait) ;
//   · écran fermé ou autre écran : la fiche est SUIVIE ici, et seul son état change —
//       « Lecture… »  → « Prêt à publier » (+ un bandeau discret « Description prête · Publier », qui part seul)
//                     → au bout de 5 min sans description : « Description introuvable · Écrire la description » ;
//     plusieurs prêtes en même temps : UN bandeau (« 3 articles prêts · Voir ») ;
//   · un toucher (carte ou bandeau) ouvre la publication, déjà remplie : jamais sans description, jamais sans toucher.
// Ce module : l'état des fiches suivies (un petit magasin, hors de React, qui survit au changement d'onglet) et les
// règles pures (testées : scripts/description-prete-sans-ouverture-selftest.mjs). La relecture et le bandeau vivent
// dans SuiviDescriptions.jsx (monté une fois, par App) ; les cartes et l'ouverture, dans StockTab.
import { useSyncExternalStore } from "react";

/** Le bandeau reste à l'écran ce temps-là, puis part seul (sans ✕). */
export const BANDEAU_MS = 6_000;

/** L'état de la carte après une décision de reprise (attenteLectureRegles.decisionReprise), pure. */
export function etatApresDecision(decision) {
  if (decision === "ouvrir") return "prete";            // description RÉELLEMENT en base — rien ne s'ouvre pour autant
  if (decision === "attendre") return "lecture";
  return "introuvable";                                   // « conclue » (lue sans texte, annonce disparue) ou « expiree »
}

/** La pastille de la carte (ou de la ligne) d'une fiche suivie, pure. null = pas de pastille du suivi. */
export function pastilleSuivi(etat, lang = "fr") {
  const fr = lang !== "en";
  if (etat === "lecture") return { texte: fr ? "Lecture…" : "Reading…", ton: "neutre", pulse: true };
  if (etat === "prete") return { texte: fr ? "Prêt à publier" : "Ready to publish", ton: "ok", pulse: false };
  if (etat === "introuvable") return { texte: fr ? "Description introuvable" : "Description not found", ton: "regler", pulse: false };
  return null;
}

/**
 * Ce que dit le bandeau, pure : null (aucune fiche prête), une fiche (« Description prête · Publier ») ou un groupe
 * (« N articles prêts · Voir », trois vignettes au plus). Les fiches prêtes les plus récentes d'abord.
 */
export function contenuBandeau(suivis, lang = "fr") {
  const fr = lang !== "en";
  const pretes = (suivis ?? []).filter((s) => s?.etat === "prete").sort((a, b) => (b.pretLe ?? 0) - (a.pretLe ?? 0));
  if (!pretes.length) return null;
  if (pretes.length === 1) {
    const s = pretes[0];
    return { mode: "un", id: s.id, titre: fr ? "Description prête" : "Description ready", sousTitre: s.titre ?? "", action: fr ? "Publier" : "Publish", vignettes: [s.photo].filter(Boolean) };
  }
  return {
    mode: "groupe", ids: pretes.map((s) => s.id), n: pretes.length,
    titre: fr ? `${pretes.length} articles prêts` : `${pretes.length} items ready`,
    sousTitre: fr ? "Descriptions récupérées" : "Descriptions retrieved",
    action: fr ? "Voir" : "View", vignettes: pretes.slice(0, 3).map((s) => s.photo).filter(Boolean),
  };
}

/** Le bandeau peut-il paraître maintenant ? Jamais par-dessus un écran de publication ou une modale ouverte. */
export function bandeauPermis({ ecranPublication = false, modaleOuverte = false } = {}) {
  return !ecranPublication && !modaleOuverte;
}

// ── LE MAGASIN : les fiches suivies, une demande d'ouverture (venue d'un toucher), le signal du bandeau ───────────────
let suivis = new Map();          // id (texte) → { id, item, titre, photo, depuis, etat, pretLe }
let annonce = 0;                 // +1 à chaque fiche qui devient prête : le bandeau (re)paraît
let demande = null;              // { type: 'un', id } | { type: 'voir' } — posée par un TOUCHER, prise par le Stock
let ecranPublication = false;    // un stepper ou un écran d'attente est ouvert (le Stock le signale)
let instantane = null;
const abonnes = new Set();

function emettre() {
  instantane = null;
  for (const f of abonnes) { try { f(); } catch { /* un abonné ne casse jamais les autres */ } }
}
function lire() {
  if (!instantane) instantane = { suivis: [...suivis.values()], annonce, demande, ecranPublication };
  return instantane;
}
export function abonner(f) { abonnes.add(f); return () => abonnes.delete(f); }
/** L'état du suivi, pour React (une référence stable tant que rien ne change). */
export function useSuivis() { return useSyncExternalStore(abonner, lire, lire); }
export function lireSuivis() { return lire(); }

/** Fermé pendant la lecture : la fiche est suivie (« Lecture… »). */
export function suivre(item, { titre = null, photo = null, maintenant = Date.now() } = {}) {
  if (!item || item.id == null) return;
  const id = String(item.id);
  suivis = new Map(suivis);
  suivis.set(id, { id, item, titre: titre ?? item.title ?? item.titre ?? "", photo, depuis: maintenant, etat: "lecture", pretLe: null });
  emettre();
}

/** Le nouvel état d'une fiche suivie ; « prete » pour la première fois → le bandeau paraît. */
export function marquer(id, etat, { item = null, maintenant = Date.now() } = {}) {
  const cle = String(id);
  const s = suivis.get(cle);
  if (!s || s.etat === etat) return;
  suivis = new Map(suivis);
  suivis.set(cle, { ...s, etat, item: item ?? s.item, pretLe: etat === "prete" ? maintenant : s.pretLe });
  if (etat === "prete") annonce += 1;
  emettre();
}

/** La fiche n'est plus suivie (publication ouverte, « Publier » touché de nouveau, fiche disparue). */
export function oublier(id) {
  const cle = String(id);
  if (!suivis.has(cle)) return;
  suivis = new Map(suivis);
  suivis.delete(cle);
  emettre();
}

export function suiviDe(id) { return id == null ? null : (suivis.get(String(id)) ?? null); }

/** Un TOUCHER sur le bandeau : ouvrir une publication, ou voir les articles prêts. Le Stock la prend. */
export function demanderOuverture(d) { demande = d ?? null; emettre(); }
export function prendreDemande() { const d = demande; if (d) { demande = null; emettre(); } return d; }

export function signalerEcranPublication(ouvert) {
  const v = Boolean(ouvert);
  if (v === ecranPublication) return;
  ecranPublication = v;
  emettre();
}

/** Tout oublier (changement de compte, tests). */
export function viderSuivis() { suivis = new Map(); annonce = 0; demande = null; ecranPublication = false; emettre(); }
