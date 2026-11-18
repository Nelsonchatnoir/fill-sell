// ══════════════════════════════════════════════════════════════════════════
// LEBONCOIN DEMANDE NOM ET PRÉNOM : UNE CARTE PAR COMPTE, UNE REPRISE SEULE
// (06/10 soir, feu vert de Nico)
// ══════════════════════════════════════════════════════════════════════════
// patrick giry : 35 dépôts Leboncoin arrêtés au même mur — l'aperçu de
// Leboncoin laisse vides escrow_lastname / escrow_firstname (compte vendeur
// sans nom ni prénom, obligatoires pour la Transaction sécurisée). L'app
// montrait 35 lignes identiques ; chacune demandait « relance la publication
// depuis la fiche ». C'est UN geste sur le COMPTE, pas 35 sur des articles.
//
// LA RÈGLE (une seule source, lue par l'app ET le serveur) :
//   · une tâche attend ce geste ⇔ Leboncoin, needs_user, et le motif posé par
//     l'extension est EXACTEMENT `lbc_escrow_identite` (leboncoin.js,
//     attenteMotif → platform_fields.last_diagnostic.quoi) — jamais un mot pris
//     dans le message : aucune autre cause Leboncoin (adresse, connexion,
//     refus de l'aperçu, dépôt incertain, champ à choisir) n'entre ici ;
//   · l'app les rassemble en UNE carte par compte (« À régler ») ;
//   · reprise SANS geste par article : UNE tâche « éclaireur » (la plus
//     ancienne) repart — sur le « C'est fait » de la carte, ou toute seule au
//     plus une fois toutes les 12 h (handler-watch, poste vu < 24 h) ; si
//     Leboncoin l'accepte, toutes les autres repartent (espacées de 45 s) ;
//     sinon elle revient au même mur et rien d'autre ne part.
// Pur (Deno + Node + Vite), sans import.

export const MOTIF_LBC_IDENTITE = "lbc_escrow_identite";
export const ECLAIREUR_INTERVALLE_MS = 12 * 3_600_000;
// (05/11 17:25, décision de Nico) Plus aucun espacement après la levée d'une pause : rythme normal (était 45 s par tâche).
export const ESPACEMENT_REPRISE_MS = 0;
export const FENETRE_IDENTITE_MS = 30 * 86_400_000;
export const URL_INFOS_LBC = "https://www.leboncoin.fr/account/private-details";

// ── (18/11/2026, ordre de Nico — point 4 du lot, compte d5531b8e : 88 publications au mur) FILLSELL DEMANDE UNE FOIS,
//    PUIS POSE LUI-MÊME LE NOM ET LE PRÉNOM ─────────────────────────────────────────────────────────────────────────
// Le compte Leboncoin neuf n'a ni nom ni prénom : l'aperçu les laisse vides (escrow_lastname / escrow_firstname) et
// Leboncoin refuse le Continuer final. FillSell n'avait nulle part ces deux valeurs. LA RÈGLE :
//   · la personne les donne UNE fois dans FillSell (carte « Leboncoin : ton nom et ton prénom ») ; ils sont rangés
//     dans profiles.platform_settings.leboncoin.identite_vendeur (platform_settings_fusionner, la seule voie) et
//     NULLE PART ailleurs : jamais dans une tâche, un journal, un avertissement ;
//   · l'extension (PC et copie Cloud) les lit au dépôt et les pose dans les cases VIDES de l'aperçu ; une case que
//     Leboncoin a remplie n'est jamais touchée ;
//   · jamais un nom inventé : sans valeur valide, la question (motif lbc_escrow_identite, la carte).
export const CLE_IDENTITE_VENDEUR = "identite_vendeur";
const nomPropre = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const NOM_PROPRE_RE = /^\p{L}[\p{L}\p{M}' .\-’]*$/u;
export const NOM_PROPRE_MAX = 50;
/** { nom, prenom } nettoyés (espaces), ou null : inconnu ou invalide → on DEMANDE. 1 à 50 caractères, lettres,
 *  apostrophe, trait d'union, point, espace ; jamais un chiffre. Même règle que le bloc ⟦identite-escrow⟧ de leboncoin.js. */
export function identiteVendeurValide(x) {
  if (!x || typeof x !== "object") return null;
  const nom = nomPropre(x.nom), prenom = nomPropre(x.prenom);
  const ok = (v) => v.length >= 1 && v.length <= NOM_PROPRE_MAX && NOM_PROPRE_RE.test(v);
  return ok(nom) && ok(prenom) ? { nom, prenom } : null;
}
/** L'identité rangée sur le compte (platform_settings entier), ou null. */
export function identiteVendeurDuProfil(platformSettings) {
  const lbc = platformSettings && typeof platformSettings === "object" ? platformSettings.leboncoin : null;
  return identiteVendeurValide(lbc && typeof lbc === "object" ? lbc[CLE_IDENTITE_VENDEUR] : null);
}
// Les textes du mur (copie EXACTE dans chrome-extension/content-scripts/leboncoin.js, contrôlée par
// selftest:lbc-identite-saisie). La tournure « nom et ton prénom sur ton compte vendeur » est celle que l'app reconnaît
// comme geste de la personne (ACTION_UTILISATEUR_RE, src/utils/shared.js) — ne pas la reformuler. Aucun mot
// « ordinateur / onglet / Chrome » : le même texte vaut pour un compte au Cloud.
export const MSG_LBC_ESCROW_IDENTITE =
  "Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : sans " +
  "eux, la publication ne peut pas être validée. Donne-les une seule fois dans FillSell (À régler, « Leboncoin : ton nom " +
  "et ton prénom ») : FillSell les posera lui-même à chaque dépôt. Rien n'a été envoyé à Leboncoin.";
export const MSG_LBC_ESCROW_IDENTITE_REFUSEE =
  "Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) et n'a " +
  "pas accepté ceux que FillSell a posés : vérifie-les dans À régler, « Leboncoin : ton nom et ton prénom ». Rien n'a " +
  "été envoyé à Leboncoin.";
/** Le texte d'une extension d'avant le 18/11 (« complète-les sur leboncoin.fr … relance depuis la fiche »), remplacé
 *  par update-job-status pour toutes les versions : la personne lit le geste qui marche aujourd'hui. */
export function ancienMessageIdentite(t) {
  return /^Leboncoin demande ton nom et ton prénom sur ton compte vendeur/.test(String(t ?? ""))
    && /Complète-les sur leboncoin\.fr/.test(String(t ?? ""));
}

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});

/** Le motif posé par l'extension sur cette tâche (last_diagnostic.quoi), ou null. */
export function motifDiagnostic(job) {
  const d = pfDe(job).last_diagnostic;
  return d && typeof d === "object" ? String(d.quoi ?? "") || null : null;
}

/** Cette tâche attend-elle que la personne complète nom et prénom sur Leboncoin ? */
export function attendIdentiteLbc(job) {
  if (!job || job.platform !== "leboncoin" || job.status !== "needs_user") return false;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return false;
  const pf = pfDe(job);
  if (pf.needsUserField || pf.needsUserFields) return false; // une vraie question de champ garde sa ligne
  return motifDiagnostic(job) === MOTIF_LBC_IDENTITE;
}

/** Les tâches d'un compte qui attendent ce geste, la plus ancienne d'abord. */
export function attentesIdentiteLbc(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter(attendIdentiteLbc)
    .sort((a, b) => (Date.parse(a.created_at ?? 0) || 0) - (Date.parse(b.created_at ?? 0) || 0));
}

/** L'éclaireur à relancer : la plus ancienne, sauf si un essai a eu lieu il y a moins de `intervalle`. */
export function eclaireurIdentiteLbc(jobs, maintenant = Date.now(), intervalle = ECLAIREUR_INTERVALLE_MS) {
  const l = attentesIdentiteLbc(jobs);
  if (!l.length) return null;
  const dernier = Math.max(0, ...l.map((j) => Date.parse(pfDe(j).identite_lbc?.eclaireur_le ?? "") || 0));
  if (dernier && maintenant - dernier < intervalle) return null;
  return l[0];
}

/** Les platform_fields de l'éclaireur relancé (geste de la carte ou passage serveur). */
export function champsEclaireur(pf, par, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
    "next_action_after", "processing_since"]) delete out[k];
  out.needsUserAttempts = 0;
  out.identite_lbc = { ...(out.identite_lbc ?? {}), eclaireur_le: maintenantIso, par, n: (Number(out.identite_lbc?.n) || 0) + 1 };
  return out;
}

/** Les platform_fields d'une tâche relâchée après le succès de l'éclaireur (rang k : 45 s × k). */
export function champsReprise(pf, k, maintenantMs) {
  const out = { ...(pf ?? {}) };
  for (const c of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "processing_since"]) delete out[c];
  out.needsUserAttempts = 0;
  out.next_action_after = new Date(maintenantMs + k * ESPACEMENT_REPRISE_MS).toISOString();
  out.identite_lbc = { ...(out.identite_lbc ?? {}), reprise_le: new Date(maintenantMs).toISOString(), par: "eclaireur_publie" };
  return out;
}

// ── (08/11, point 6 de Nico — Rosa Metra) TANT QUE LE MUR TIENT, SEUL L'ÉCLAIREUR PART ─────────────────────────────
// Rosa : 22 publications au mur « nom et prénom » ; chaque nouvelle publication Leboncoin (11 créées après le 31/10),
// et chaque tâche remise en file, rouvrait le formulaire de dépôt et revenait au même mur — des visites inutiles sur
// Leboncoin (anti-robot), aucune chance de passer. Règle (get-pending-jobs, jumelle de la porte « forfait » du 17/10) :
// tant que le compte a un mur d'identité VU depuis moins de 30 j et qu'aucune publication Leboncoin n'est passée
// depuis, ses publications (et ses republications pas encore retirées) ne partent plus : elles rejoignent la carte du
// compte (needs_user, motif du mur, « retenue avant essai »), aucune visite. Seul l'éclaireur (identite_lbc.eclaireur_le
// posé APRÈS le dernier mur : « C'est fait » de la carte, ou handler-watch toutes les 12 h) est servi, un à la fois ;
// s'il passe, handler-watch relâche toutes les autres (champsReprise).
// (18/11) Le geste est dans FillSell : la personne donne nom et prénom une fois, FillSell les pose lui-même.
export const MSG_LBC_IDENTITE_RETENUE =
  "Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : " +
  "tant qu'ils manquent, aucune publication Leboncoin ne peut être validée. Donne-les une seule fois dans FillSell " +
  "(À régler, « Leboncoin : ton nom et ton prénom ») : FillSell les posera lui-même, et cette publication partira " +
  "toute seule ensuite. Rien n'a été envoyé à Leboncoin.";

/** L'instant du dernier mur VU PAR LEBONCOIN (ms), ou null. Une retenue avant essai (posée ici) n'est pas un mur vu :
 *  sinon chaque retenue repousserait le mur au-delà de l'éclaireur, qui ne partirait plus jamais. */
export function dernierMurIdentite(murs) {
  const t = (Array.isArray(murs) ? murs : []).map((m) => {
    const d = pfDe(m).last_diagnostic;
    if (d && typeof d === "object" && d.retenue_avant_essai) return 0;
    return Date.parse(String((d && typeof d === "object" ? d.at : null) ?? "")) || Date.parse(String(m?.created_at ?? "")) || 0;
  }).filter((x) => x > 0);
  return t.length ? Math.max(...t) : null;
}

/** Une tâche Leboncoin que le mur concerne : publication, ou republication dont rien n'est encore retiré. */
export function candidatRetenueIdentite(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const a = String(job.action ?? "publish");
  if (a === "publish") return true;
  if (a !== "republish") return false;
  const pf = pfDe(job);
  return !["deleted", "recreated"].includes(String(pf.republish_step ?? "")) && !pf.deleted_at && !pf.republish_suppression_envoyee;
}

// ── (18/11, point 4 — d5531b8e) UNE RELANCE DE L'APP EST UN VRAI ESSAI ─────────────────────────────────────────────
// Relance depuis l'app le 17/11 à 20:11:06.740Z, retenue par get-pending-jobs à 20:11:10.201Z (« 1 tâche(s) retenue(s)
// avant essai ») : seule la marque identite_lbc.eclaireur_le (« C'est fait », handler-watch) était servie, et la
// relance ne pose que derniere_relance_manuelle. Comme Depop (estEclaireurFrais) et eBay (vendeur-ebay.js,
// ebay-refus-compte.js) : une relance faite par la personne APRÈS le dernier mur part tout de suite, en éclaireur (UN
// à la fois) ; get-pending-jobs lui pose la marque d'éclaireur (champsEclaireur, par « relance_app ») pour handler-watch
// (12 h, reprise de tout le compte si elle passe). Si elle bute encore, le nouveau mur la remet dans la retenue.
/** La tâche a-t-elle été relancée APRÈS le dernier mur (marque d'éclaireur, ou relance de la personne depuis l'app) ? */
export function relanceeApresMur(job, dernierMurMs) {
  const pf = pfDe(job);
  const t = Math.max(Date.parse(String(pf.identite_lbc?.eclaireur_le ?? "")) || 0, Date.parse(String(pf.derniere_relance_manuelle ?? "")) || 0);
  return t > (dernierMurMs ?? 0);
}
/** L'éclaireur servi porte-t-il déjà sa marque posée après le dernier mur (carte, handler-watch, ou relance déjà marquée) ? */
export function eclaireurMarqueApresMur(job, dernierMurMs) {
  return (Date.parse(String(pfDe(job).identite_lbc?.eclaireur_le ?? "")) || 0) > (dernierMurMs ?? 0);
}

/** { servis: [l'éclaireur relancé après le dernier mur, un au plus], retenus: [les autres] }. */
export function partagerCandidatsIdentite(candidats, dernierMurMs) {
  const l = (Array.isArray(candidats) ? candidats : []).filter(candidatRetenueIdentite);
  const eclaireurs = l.filter((j) => relanceeApresMur(j, dernierMurMs));
  const servis = eclaireurs.slice(0, 1);
  const ids = new Set(servis.map((j) => String(j.id)));
  return { servis, retenus: l.filter((j) => !ids.has(String(j.id))) };
}

/** Les platform_fields d'une tâche retenue avant tout essai (elle rejoint la carte du compte). */
export function champsRetenueIdentite(pf, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["processing_since", "next_action_after"]) delete out[k];
  out.needs_user_source = "lbc_identite";
  out.last_diagnostic = { quoi: MOTIF_LBC_IDENTITE, at: maintenantIso, retenue_avant_essai: true, detail: MSG_LBC_IDENTITE_RETENUE };
  out.identite_lbc = { ...(out.identite_lbc ?? {}), retenue_le: maintenantIso };
  return out;
}
