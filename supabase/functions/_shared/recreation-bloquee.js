// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE RETIRÉE QUI NE REVIENT PAS NE GÈLE PLUS LES AUTRES (12/10, A5)
// ═══════════════════════════════════════════════════════════════════════════
// L'invariant « une seule annonce hors ligne à la fois, par plateforme » (une
// republication ne retire rien tant qu'une AUTRE est à l'étape 'deleted', en
// pending/processing) vit dans l'extension (toutes versions), dans
// get-pending-jobs (retenue_hors_ligne) et dans le balayage de la
// republication automatique (republish_planifiee_sweep, étape 4). Il est juste
// tant que la remise en ligne est EN COURS. Il retenait SANS LIMITE : le
// Cendrier de jonathanrabany, retiré le 07/10 22:08, 28 remises en ligne
// ratées, gelait ses 8 autres republications Vinted depuis 4 jours ; 7 jobs à
// 'deleted' d'août en gelaient d'autres sur 4 comptes.
//
// LA RÈGLE :
//   · une remise en ligne qui a échoué au moins REPRISES_AVANT_SIGNAL fois et
//     dont l'annonce est retirée depuis plus de DELAI_AVANT_SIGNAL_MS sort de
//     la file : needs_user « recreation_bloquee », message clair (l'annonce
//     est hors ligne, rien n'est perdu, « Republier maintenant » la relance) —
//     les autres republications repartent, partout, sans nouvelle extension ;
//   · SAUF quand la cause est le COMPTE (Vinted restreint les mises en vente,
//     session fermée, compte bloqué) : retirer d'autres annonces les mettrait
//     hors ligne à leur tour, sans aucune chance de revenir — la retenue est
//     alors la protection, et le message le dit (même règle que le
//     disjoncteur, A4 : seul un échec du compte arrête le compte).
// Module PUR, importé par handler-watch.
// (11/11 soir) Une remise en file passe par remettreEnFile (_shared/remise-en-file.js) : budget d'essais entier.
import { remettreEnFile } from "./remise-en-file.js";

export const SOURCE_RECREATION_BLOQUEE = "recreation_bloquee";
export const REPRISES_AVANT_SIGNAL = 2;
export const DELAI_AVANT_SIGNAL_MS = 2 * 3600_000;

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop", ebay: "eBay", opla: "Opla" };

/** La cause DU COMPTE qui retient la remise en ligne, ou null (cause de l'article ou inconnue). */
export function causeCompte(pf = {}) {
  const texte = JSON.stringify([pf.error_technique ?? null, pf.last_diagnostic ?? null, pf.recreation_reprise?.brut ?? null]);
  if (pf.selling_restriction || /selling-restriction/.test(texte)) return "restriction";
  if (pf.attente_session || pf.attente_connexion || pf.verification_boutique_vinted?.motif === "session_inconnue") return "session";
  if (pf.compte_vinted_bloque || pf.needs_user_source === "compte_vinted_bloque") return "compte_bloque";
  if (pf.attente_antirobot_compte) return "anti_robot";
  return null;
}

/** Quand l'annonce a été retirée (preuve serveur d'abord), en ms, ou null. */
function retireeLe(pf) {
  for (const k of ["deleted_at_serveur", "deleted_at", "deleted_at_client"]) {
    const t = Date.parse(String(pf?.[k] ?? ""));
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** Le nombre d'essais de remise en ligne ratés, tel que les écrivains l'ont compté. */
// (11/11 soir) Jamais négatif : une remise en file garde recreation_tentee avec n = 0 (la garde du dressing reste).
// ⛔ Toute clé lue ici est remise à zéro par remettreEnFile (verrou selftest:remise-en-file).
export function essaisRates(pf = {}) {
  return Math.max(
    0,
    Number(pf.recreation_reprises) || 0,
    Number(pf.recreation_reprise?.n) || 0,
    (Number(pf.recreation_tentee?.n) || 0) - 1,
  );
}

/**
 * La décision pour UN job de republication :
 *   « signaler »  → sortir de la file (needs_user), les autres repartent ;
 *   « proteger »  → cause du compte : il reste en file et retient (voulu) ;
 *   null          → rien à faire (en cours normal, ou pas son cas).
 */
export function decisionRecreationBloquee(job, maintenant = Date.now()) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.action !== "republish" || pf.republish_step !== "deleted") return null;
  if (!["pending", "processing"].includes(job.status)) return null;
  const le = retireeLe(pf) ?? Date.parse(String(job.created_at ?? ""));
  if (!Number.isFinite(le) || maintenant - le < DELAI_AVANT_SIGNAL_MS) return null;
  if (essaisRates(pf) < REPRISES_AVANT_SIGNAL) return null;
  // Un job en cours d'exécution (processing frais) n'est jamais arraché à son poste.
  if (job.status === "processing") {
    const depuis = Date.parse(String(pf.processing_since ?? ""));
    if (!Number.isFinite(depuis) || maintenant - depuis < 30 * 60_000) return null;
  }
  return causeCompte(pf) ? "proteger" : "signaler";
}

/**
 * Le message du job qui RESTE en file parce que la cause est le compte
 * (« proteger ») : jamais « rien à faire de ton côté » — la personne apprend
 * ce qui retient l'annonce, que ses autres annonces sont gardées en ligne
 * exprès, et le seul geste utile (Cendrier de jonathanrabany, 12/10 :
 * « /selling-restriction » depuis 4 jours, message « on réessaie tout seuls »).
 */
export function messageRecreationRetenueCompte(job) {
  const pf = job?.platform_fields ?? {};
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  const le = retireeLe(pf);
  const date = le ? new Date(le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }) : null;
  const annonce = `Ton annonce${titre ? ` « ${titre} »` : ""} a été retirée de ${nom}${date ? ` le ${date}` : ""}`;
  const cause = causeCompte(pf);
  const pourquoi = cause === "restriction"
    ? `et ne peut pas revenir en ligne : ${nom} limite en ce moment les mises en vente de ton compte. Ouvre ${nom} sur ton ordinateur pour lire son message (ou écris à son support)`
    : cause === "session"
      ? `et attend ta connexion : connecte-toi à ${nom} ${["Chrome", "Brave", "Edge", "Opera"].includes(String(pf.navigateur_poste ?? "")) ? `dans ${pf.navigateur_poste}` : "dans ton navigateur"}, sur ton ordinateur`
      : cause === "compte_bloque"
        ? `et ne peut pas revenir en ligne : ${nom} affiche « compte bloqué » sur ton ordinateur. Ouvre ${nom} pour lire son message`
        : `et ne peut pas revenir en ligne : ${nom} vérifie ton compte (contrôle anti-robot). Ouvre ${nom} sur ton ordinateur et passe sa vérification`;
  return `${annonce} ${pourquoi}. FillSell réessaie tout seul dès que c'est levé, et ne retire aucune autre de tes annonces ${nom} d'ici là : elles restent en ligne. `
    + `Rien n'est perdu : titre, description, photos et champs sont gardés.`;
}

// ── (02/11, XEWER) LE MESSAGE NOMME LA VRAIE CAUSE ──────────────────────────────────────────────────────────────────
// Sept lots de livres Barbie : « Ouvre Vinted … pour vérifier ton compte » alors que Vinted refusait l'envoi sur
// « Sélectionne une langue pour continuer » (language_book) — et le compte n'est JAMAIS en cause ici (une cause du
// compte retient le job, « proteger », avec son propre message). Le refus de la plateforme (server_required_fields,
// relevé au 400) est nommé ; une valeur que la tâche connaissait déjà est un défaut de NOTRE envoi, jamais un geste
// demandé à la personne.
const LIBELLES_CHAMPS_VINTED = Object.freeze({
  language_book: "Langue du livre", isbn: "ISBN", photos: "Photos", package_size: "Format du colis", model: "Modèle",
  internal_memory_capacity: "Espace de stockage", sim_lock: "Simlockage", brand: "Marque", size: "Taille", color: "Couleur",
  condition: "État", material: "Matière", title: "Titre", description: "Description", price: "Prix",
  video_game_platform: "Plateforme", video_game_rating: "Classement du contenu",
});
/** Les champs que la plateforme a exigés au dernier refus : [{ code, libelle, message }] (vide si inconnu). */
export function champsExigesAuRefus(pf = {}) {
  const srf = Array.isArray(pf.server_required_fields) ? pf.server_required_fields : [];
  const vus = new Set();
  const out = [];
  for (const f of srf) {
    const code = String(f?.key ?? "").trim();
    if (!code || vus.has(code)) continue;
    vus.add(code);
    const label = String(f?.label ?? "").trim();
    out.push({ code, libelle: LIBELLES_CHAMPS_VINTED[code] ?? (label && label !== code ? label : code), message: String(f?.message ?? "").trim() || null });
  }
  return out;
}
/** Les champs exigés dont la tâche connaissait DÉJÀ la valeur (vintedAspects) : un défaut de notre envoi. */
export function champsExigesConnus(pf = {}) {
  const va = pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {};
  return champsExigesAuRefus(pf).filter((c) => String(va[c.code] ?? "").trim());
}
/**
 * (07/11, point 7 — Marta MELE, page Vinted en italien) La COULEUR exigée au refus (« Compila il campo "colore" ») alors
 * que la capture de l'annonce d'origine la porte (republish_snapshot.color1_id) : un défaut de notre envoi, jamais un
 * geste de la personne. Lue à part de champsExigesConnus (vintedAspects), pour ne pas relancer par la cause du 02/11 sur
 * un build qui échoue encore.
 */
export function couleurExigeeConnue(pf = {}) {
  if (!champsExigesAuRefus(pf).some((c) => c.code === "color")) return false;
  const ids = [pf?.republish_snapshot?.color1_id, ...(Array.isArray(pf?.vinted_ids?.color_ids) ? pf.vinted_ids.color_ids : [])];
  return ids.some((v) => Number.isFinite(Number(v)) && Number(v) > 0);
}

/**
 * Le message du job sorti de la file.
 * @param {any} job
 * @param {{ causeEnAttente?: { code: string } | null }} [opts] une cause corrigée par une extension que le poste n'a pas encore
 */
export function messageRecreationBloquee(job, { causeEnAttente = null } = {}) {
  const pf = job?.platform_fields ?? {};
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  const le = retireeLe(pf);
  const date = le ? new Date(le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }) : null;
  const debut = `Ton annonce${titre ? ` « ${titre} »` : ""} a été retirée de ${nom}${date ? ` le ${date}` : ""} et FillSell n'a pas réussi à la remettre en ligne `
    + `(${essaisRates(pf)} essais)`;
  const garde = "Rien n'est perdu : titre, description, photos et champs sont gardés.";
  const autres = "Tes autres republications, elles, continuent.";
  const champs = champsExigesAuRefus(pf);
  const connus = new Set(champsExigesConnus(pf).map((c) => c.code));
  if (couleurExigeeConnue(pf)) connus.add("color"); // (07/11, point 7) la couleur de la capture : notre envoi
  const nomme = (c) => `« ${c.libelle} »${c.message ? ` (« ${c.message} »)` : ""}`;
  if (champs.length && connus.size) {
    const notre = champs.filter((c) => connus.has(c.code));
    return `${debut} : ${nom} a refusé l'envoi, il exige ${notre.map(nomme).join(" et ")}, que FillSell connaissait mais n'a pas mis dans l'envoi — `
      + (causeEnAttente
        ? `un défaut de notre côté, corrigé : elle repartira toute seule dès que l'extension FillSell de ton ordinateur sera à jour (c'est automatique). ${garde} Rien à faire. ${autres}`
        : `un défaut de notre côté. ${garde} ${autres}`);
  }
  if (champs.length) {
    return `${debut} : ${nom} a refusé l'envoi, il exige ${champs.map(nomme).join(" et ")}. ${garde} `
      + `Appuie sur « Republier maintenant » : elle repartira. ${autres}`;
  }
  return `${debut}. ${garde} Appuie sur « Republier maintenant » : elle repartira. ${autres}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNE REMISE EN LIGNE BLOQUÉE REPART SEULE DÈS QUE LA CAUSE EST LEVÉE (15/10 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : ana0115, Beebs, « Tee shirt femme » (6ce123e7) — annonce
// retirée le 15/10 à 15:02, cinq redépôts refusés par le formulaire Beebs
// (« Ajouter au moins 5 caractères » : la copie n'avait aucune description),
// sortie de la file à 17:03 (needs_user « recreation_bloquee »). La cause
// était DE NOTRE CÔTÉ ; une fois corrigée (get-pending-jobs sert la
// description de la fiche), rien ne la faisait repartir : l'article restait
// hors ligne jusqu'à un geste de la personne.
//
// LA RÈGLE : une remise en ligne sortie de la file pour une cause que le
// serveur corrige désormais (signature PRÉCISE dans la trace de l'échec,
// plateforme visée) repart toute seule — UNE fois par cause et par job
// (`recreation_relancee[code]`). Si elle rate encore, elle ressort de la file
// par la porte ordinaire (2 échecs, 2 h) et n'est plus relancée pour cette
// cause : le nouveau diagnostic est la mesure qui manquait.
// Les essais déjà ratés sont mis de côté (`recreation_essais_avant_relance`),
// sinon la sortie de file la reprendrait au passage suivant, avant tout essai.
// (29/10) Premier build qui remet au POST le modèle et les attributs capturés (0.6.153) : tout build construit après
// cette heure le porte (le 0.6.152 servi date du 28/10 21:51:44Z ; le poste de Nico est rechargé après).
export const BUILD_ATTRIBUTS_ORIGINE = "2026-10-29T13:30:00Z";
// (02/11, XEWER) Premier build qui met dans l'envoi Vinted tout attribut exigé et connu (0.6.166) : l'horodatage du
// commit de l'extension qui le porte (EXTENSION_LAST_COMMIT) — tout build construit depuis le porte.
export const BUILD_ATTRIBUTS_CONNUS = "2026-11-02T08:48:22Z"; // d2ed09b (0.6.166)
// (07/11, point 3) Premier build qui lit la borne de remplissage du job (fill_borne_ms), ne retire plus après un pré-vol
// trop lent et n'envoie plus après la borne (0.6.177) : le 0.6.176 servi date du 06/11 20:36:04Z, la copie Cloud
// 0.6.176.44695 du 07/11 10:18 (Paris) ; tout build construit après cette heure est un 0.6.177.
export const BUILD_BORNE_ADAPTATIVE = "2026-11-07T10:30:00Z";

export const CAUSES_LEVEES_PAR_LE_SERVEUR = [
  {
    code: "description_beebs_trop_courte",
    plateformes: ["beebs"],
    signature: /Ajouter au moins 5 caract/i,
    // « Ajouter au moins 5 caractères » vaut aussi pour un TITRE trop court :
    // la cause n'est la nôtre que si la copie n'a pas de description.
    condition: (job) => String(job?.description ?? "").trim().length < 5,
    // get-pending-jobs v251 : toute remise en ligne Beebs part avec au moins
    // 5 caractères (annonce → fiche → faits du job).
    correctif: "get-pending-jobs sert la description de la fiche (ou des faits du job) à toute remise en ligne Beebs",
  },
  {
    // (28/10 soir, Nico — point 15, thibault.andrieux dca41766 « Samsung player start 2 ») Retirée de Vinted le 25/10,
    // remise en ligne ratée le 28/10 sur « COULEUR INTROUVABLE : la couleur ["Noir"] existe bien chez Vinted mais n'a
    // pas pu être posée » : la relecture `.value` des menus « bloom » de Vinted (la couleur était posée, lue vide) — même
    // défaut que la marque et l'État. La 0.6.150 relit le span affiché. La cause n'est levée que pour un POSTE qui a ce
    // build (buildMin, lu par handler-watch) : sur une 0.6.149, le même mur.
    code: "vinted_menus_bloom",
    plateformes: ["vinted"],
    signature: /existe bien chez Vinted mais n'a pas pu être posée|#brand porte «  »|#brand est resté vide|n'a pas accepté État|État \(accepte\s*:/i,
    buildMin: "2026-10-28T20:15:00Z",
    correctif: "extension 0.6.150+ : les menus « bloom » de Vinted relus dans le span affiché (valeurChampVinted)",
  },
  {
    // (29/10, lot A point 2 — thibault.andrieux dca41766) La recréation repartait sans « Modèle » ni « Espace de
    // stockage » : la capture les portait (model collection 2, internal_memory_capacity 1292, sim_lock 1313), mais la
    // relecture de leurs libellés sur les menus « bloom » ne rendait rien → 400 de Vinted, puis la QUESTION « Vinted
    // exige … » (champ_a_choisir). Ce sont les champs de l'annonce d'origine : notre copie, jamais la personne. Le
    // build qui les remet par leurs identifiants au POST (forme prouvée en réel le 29/10, annonce de test 10582889236)
    // relance la remise en ligne UNE fois — question comprise (champ `sources`).
    code: "vinted_attributs_origine",
    plateformes: ["vinted"],
    sources: [SOURCE_RECREATION_BLOQUEE, "champ_a_choisir"],
    signature: /Vinted exige[^.]*(?:« Modèle »|« Espace de stockage »|« Simlockage »)|model.{0,40}internal_memory_capacity|Sélectionne le modèle/i,
    buildMin: BUILD_ATTRIBUTS_ORIGINE,
    correctif: "extension 0.6.153+ : la recréation Vinted remet au POST le modèle et les attributs de l'annonce d'origine par leurs identifiants",
  },
  {
    // (02/11, XEWER — sept lots de livres Barbie retirés le 01/11, règle de Nico) Vinted refusait la remise en ligne
    // sur un champ EXIGÉ dont la tâche portait déjà la valeur (vintedAspects : « Français » pour language_book) : elle
    // ne partait que par le formulaire, et le champ n'y apparaît pas (ISBN d'origine de treize zéros). La 0.6.166 met
    // tout attribut exigé et connu dans l'envoi, par son identifiant (langue du livre comprise). Relancée UNE fois, au
    // build qui corrige ; si elle rate encore, elle ressort par la porte ordinaire avec le nouveau diagnostic.
    code: "vinted_attribut_connu_non_pose",
    plateformes: ["vinted"],
    signature: /validation_error|champs exigés|Vinted exige/i,
    condition: (job) => champsExigesConnus(job?.platform_fields ?? {}).length > 0,
    buildMin: BUILD_ATTRIBUTS_CONNUS,
    correctif: "extension 0.6.166+ : un attribut exigé et connu part dans l'envoi Vinted par son identifiant (langue du livre comprise)",
  },
  {
    // (07/11, point 7 — Marta MELE, 3 republications Vinted retirées les 02-03/11, page en italien) Vinted refuse l'envoi
    // sur la couleur (400 {"field":"color","Compila il campo \"colore\""}) alors que la capture la porte (color1_id) :
    // le chemin « par identifiants » la laisse vide sans le voir, et `color` n'entre pas au POST. La 0.6.177 la met dans
    // l'envoi et arrête AVANT le retrait une couleur vide que la copie porte. Relancée une fois, puis une fois au build.
    code: "vinted_couleur_connue_non_posee",
    plateformes: ["vinted"],
    sources: [SOURCE_RECREATION_BLOQUEE, "champ_a_choisir"],
    signature: /validation_error|colore|couleur|color/i,
    condition: (job) => couleurExigeeConnue(job?.platform_fields ?? {}),
    buildMin: BUILD_BORNE_ADAPTATIVE,
    correctif: "extension 0.6.177+ : la couleur connue par la capture part dans l'envoi Vinted, et une couleur vide arrête AVANT le retrait",
  },
  {
    // (07/11, point 3 — Ciddjy, Beebs 49342549 « Lot 4 pantalons garçon 18 mois ») Retirée à 06:27, quatre redépôts
    // arrêtés chacun à la BORNE de 10 min du remplissage (« Timeout: pas de réponse du content script (borne 10 min
    // dépassée…) ») : le poste était devenu lent (pré-vol de 602 s), notre borne est fixe — NOTRE faute, l'annonce restait
    // hors ligne jusqu'à un geste. Relancée UNE fois tout de suite (puis une fois de plus au build qui lit la borne), avec
    // une borne élargie à 20 min (fill_borne_ms, lue par l'extension ≥ 0.6.177) et TOUJOURS après une relecture complète
    // des annonces du compte (recreation_depot_parti : get-pending-jobs relit avant tout redépôt — un remplissage arrêté
    // à la borne a pu cliquer « Mettre en vente » ; ayoub, 04/11). Jamais quand la cause est le compte.
    code: "remplissage_borne_depassee",
    plateformes: ["beebs", "leboncoin"],
    signature: /pas de réponse du content script|borne \d+ min dépassée/i,
    champs: (_pf, maintenant) => ({
      fill_borne_ms: 20 * 60_000,
      recreation_depot_parti: { at: maintenant, raison: "remise en ligne arrêtée à la borne du remplissage : annonces relues avant tout redépôt" },
    }),
    buildMin: BUILD_BORNE_ADAPTATIVE,
    correctif: "relance avec une borne de remplissage élargie (20 min, extension 0.6.177+), après relecture des annonces du compte",
  },
];

/** (28/10) Le poste a-t-il le build qu'exige une cause (`buildMin`) ? Préfixe horodaté du BUILD_ID ; absent : non. */
export function posteAuBuildDeLaCause(cause, extensionBuild) {
  if (!cause?.buildMin) return true;
  const m = String(extensionBuild ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  return Boolean(m) && Date.parse(m[1]) >= Date.parse(cause.buildMin);
}

/** Les textes où vit le motif d'un échec de remise en ligne. */
function textesEchec(job) {
  const pf = job?.platform_fields ?? {};
  return [
    String(job?.error ?? ""),
    String(pf.error_technique?.brut ?? ""),
    String(pf.recreation_reprise?.brut ?? ""),
    typeof pf.last_diagnostic === "string" ? pf.last_diagnostic : JSON.stringify(pf.last_diagnostic ?? ""),
    ...(Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees.map((e) => String(e?.erreur ?? "")) : []),
  ].join(" \n ");
}

/** La cause levée qui permet de relancer ce job, ou null. */
/**
 * @param {any} job
 * @param {string | null} [extensionBuild] le BUILD_ID du poste (causes qui exigent un build d'extension)
 */
export function causeLeveePourRelance(job, extensionBuild = undefined, { ignorerBuild = false } = {}) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.action !== "republish" || job?.status !== "needs_user") return null;
  // (29/10) Une cause peut viser aussi la question posée sur une remise en ligne (champ `sources`) ; par défaut, l'arrêt seul.
  const sourcesVisees = new Set(CAUSES_LEVEES_PAR_LE_SERVEUR.flatMap((c) => c.sources ?? [SOURCE_RECREATION_BLOQUEE]));
  if (!sourcesVisees.has(String(pf.needs_user_source ?? "")) || pf.republish_step !== "deleted") return null;
  if (causeCompte(pf)) return null; // la cause est le compte : jamais relancé d'office
  const textes = textesEchec(job);
  for (const c of CAUSES_LEVEES_PAR_LE_SERVEUR) {
    if (!c.plateformes.includes(job.platform)) continue;
    if (!(c.sources ?? [SOURCE_RECREATION_BLOQUEE]).includes(String(pf.needs_user_source ?? ""))) continue;
    // (06/11, Nico : version minimum abandonnée) La relance ne dépend plus du build du poste : une fois par cause,
    // tout de suite. Une cause corrigée par l'EXTENSION (buildMin) relancée sur un poste SOUS ce build (sous_build)
    // garde UNE relance de plus, quand le poste a le build (reprise_au_build) — `ignorerBuild` (02/11) : la cause qui
    // attend encore ce poste (le message le dit).
    const deja = pf.recreation_relancee ? pf.recreation_relancee[c.code] : null;
    if (deja && !(c.buildMin && deja.sous_build === true && !deja.reprise_au_build
      && (ignorerBuild || posteAuBuildDeLaCause(c, extensionBuild)))) continue;
    if (c.signature.test(textes) && (!c.condition || c.condition(job))) return c;
  }
  return null;
}

/**
 * Le platform_fields du job remis en file pour cette cause (pur).
 * @param {any} [pf0]
 * @param {any} cause
 * @param {string} [maintenant]
 * @param {{ extensionBuild?: string | null }} [opts] le build du poste du compte (06/11 : trace « sous_build »)
 */
export function champsRelanceCauseLevee(pf0 = {}, cause, maintenant = new Date().toISOString(), { extensionBuild = undefined } = {}) {
  // (11/11 soir) TOUS les compteurs d'essais remis à zéro (recreation_retries compris, oublié ici jusqu'au 11/11) ;
  // recreation_tentee garde son heure (la garde du dressing), son n repart de 0. Archive : recreation_essais_avant_relance.
  const pf = remettreEnFile(pf0, { par: "handler-watch (cause levée)", motif: cause?.code ?? null, maintenant });
  delete pf.needs_user_source; delete pf.pas_de_rouge; delete pf.error_technique;
  const deja = pf.recreation_relancee ? pf.recreation_relancee[cause.code] : null;
  pf.recreation_relancee = { ...(pf.recreation_relancee ?? {}), [cause.code]: deja
    // (06/11) La relance de plus, au build : tracée, jamais une troisième.
    ? { ...deja, reprise_au_build: { le: maintenant, build: String(extensionBuild ?? "").slice(0, 48) || null } }
    : { le: maintenant, par: "handler-watch", correctif: cause.correctif,
      ...(cause.buildMin ? { sous_build: !posteAuBuildDeLaCause(cause, extensionBuild) } : {}) } };
  // (29/10 soir, lot A point 7 — thibault.andrieux, deux postes : 0.6.152 et un vieux 0.6.149) Une cause corrigée par
  // l'EXTENSION n'est levée que sur le build du poste du compte (profiles.extension_build) ; le job relancé doit alors
  // n'être servi qu'à un poste qui a ce build (garde `build_min_requis` de get-pending-jobs) — sinon le vieux poste
  // le reprend, retombe sur le même mur, et la relance unique est perdue. Jamais abaissé.
  // (06/11, Nico : version minimum abandonnée) `build_min_requis` n'est plus qu'une trace (aucun filtre ne le lit) :
  // une relance faite sous le build en garde une seconde, au build (causeLeveePourRelance).
  if (cause.buildMin && !(msBuild(pf.build_min_requis) >= Date.parse(cause.buildMin))) pf.build_min_requis = cause.buildMin;
  // (07/11, point 3) Les champs propres à la cause (borne élargie, relecture des annonces avant redépôt).
  if (typeof cause.champs === "function") Object.assign(pf, cause.champs(pf, maintenant) ?? {});
  return pf;
}

/** Le préfixe horodaté d'un BUILD_ID (ou une date ISO seule) en millisecondes ; illisible : NaN. */
function msBuild(b) {
  const m = String(b ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
  return m ? Date.parse(m[1]) : NaN;
}

/** Le message de la remise en file : vrai, sans durée promise. */
export function messageRelanceCauseLevee(job) {
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  return `Ton annonce${titre ? ` « ${titre} »` : ""} est hors ligne sur ${nom} : sa remise en ligne avait échoué à cause d'un défaut de notre côté, `
    + `maintenant corrigé. FillSell la remet en ligne tout seul, rien à faire de ton côté. Titre, description, photos et champs sont gardés.`;
}
