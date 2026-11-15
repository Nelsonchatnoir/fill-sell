// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE RETIRÉE QUI ATTEND UNE CONNEXION : DITE, REMISE EN LIGNE TOUTE SEULE, SANS RIEN GELER (15/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (compte af37fa49, Pro + Cloud) : la republication Beebs 3382b821 « Bottines Nike enfant 25 noir » est arrêtée
// à l'étape 'deleted' depuis le 11/11 16:51 — l'ancienne annonce a été retirée par son PC (0.6.186), puis le compte est
// passé au Cloud, où Beebs n'est pas connecté (aucune ligne Beebs dans cloud_coffre : code Kiabi pas encore saisi).
//   · aucun poste ne pouvait la recréer : le poste Cloud ne reçoit que ses plateformes connectées, l'ordinateur ne
//     reçoit plus rien (cloud_voie) — et rien ne le disait : une plateforme absente du coffre est « inconnue », jamais
//     « à reconnecter » (sessionsQuiFontFoi), donc aucun message, aucune ligne « À régler » ; l'annonce est hors ligne
//     depuis 4 jours ;
//   · elle gelait la mise à jour de sa copie Cloud (0.6.189 → 0.6.191 différée : « 1 republication à l'étape
//     'deleted' ») ;
//   · elle retenait les republications Leboncoin et Vinted du MÊME article (règle 4 du 05/11, retenue-hors-ligne.js).
//
// LA RÈGLE (tous les comptes ; serveur seul, aucune extension à changer) :
//   1. (handler-watch) Une republication 'pending' à l'étape 'deleted' d'un compte au Cloud ACTIF, dont la plateforme
//      (Vinted, Leboncoin, Beebs, Depop) n'est PAS connectée au Cloud (aucune ligne `connecte` vraie dans le coffre),
//      retirée depuis DELAI_AVANT_GESTE_MS au moins, passe « à toi de jouer » : needs_user, source
//      SOURCE_RECREATION_ATTEND_CONNEXION, message ancré « Connexion X requise » (l'app le range dans « À régler » avec
//      le bouton « Me connecter » du Cloud — BoutonMeConnecter, MUR_CONNEXION_ANCRE), qui dit que l'annonce est HORS
//      LIGNE, depuis quand, et qu'elle reviendra toute seule. Coffre illisible : rien n'est posé (jamais sur un doute).
//   2. (handler-watch) Dès que la plateforme est connectée au Cloud (ligne `connecte` vraie), ou que le Cloud n'est plus
//      actif (l'ordinateur reprend), la republication repart en file à SON étape ('deleted' : la recréation, jamais un
//      nouveau retrait) — levée tracée. La reprise « après reconnexion » existante (même ancre) le fait aussi.
//   3. (get-pending-jobs, retenue-hors-ligne.js) Une annonce hors ligne qui ATTEND UNE CONNEXION (la source ci-dessus,
//      posée sur preuve) ne retient plus que SA plateforme (« une seule annonce hors ligne par plateforme » tient : à la
//      reconnexion, elle passe la première) ; le même article sur les AUTRES plateformes repart. Une remise en ligne EN
//      COURS (pending, même marquée d'une attente de session) garde la règle 4 : jamais le même article hors ligne deux
//      fois. Sur l'ordinateur, le mur confirmé (needs_user « Connexion X requise ») sort déjà de la file.
//   4. (get-pending-jobs) LA MISE À JOUR N'ATTEND JAMAIS INDÉFINIMENT : une republication 'pending' à 'deleted' que CE
//      poll ne sert pas à ce poste, ou retirée depuis plus de LIMITE_MAJ_DIFFEREE_MS (2 h), n'empêche plus la mise à
//      jour de son extension, PC ou Cloud (`retenues_deleted`, lu par toutes les extensions servies, ≥ 0.6.153) : rien
//      ne tourne pour elle, le rechargement se fait sous le verrou de flux, et la nouvelle version la reprend à son
//      étape depuis la base. Un job EN COURS ('processing') diffère toujours la mise à jour (la règle du 12/08).
// Pur (Deno + Node + Vite) : scripts/republication-attend-connexion-selftest.mjs.

export const SOURCE_RECREATION_ATTEND_CONNEXION = "recreation_attend_connexion";
export const DELAI_AVANT_GESTE_MS = 30 * 60_000;
// Les plateformes que le Cloud exécute (même liste que _shared/cloud-voie.js, PLATEFORMES_CLOUD_VOIE — recopiée ici
// pour garder ce module sans import ; selftest:republication-attend-connexion vérifie l'égalité).
export const PLATEFORMES_CLOUD = Object.freeze(["vinted", "leboncoin", "beebs", "depop"]);
const NOM = Object.freeze({ vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop" });

const pfDe = (job) => (job?.platform_fields && typeof job.platform_fields === "object" && !Array.isArray(job.platform_fields) ? job.platform_fields : {});
const ts = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** Quand l'annonce a été retirée (preuve serveur d'abord), en ms, ou NaN. */
export function retireeLe(pf = {}) {
  for (const k of ["deleted_at_serveur", "deleted_at", "deleted_at_client"]) {
    const t = ts(pf?.[k]);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

/** La plateforme est-elle connectée au Cloud ? `coffre` : [{ plateforme, connecte }] du compte. null si illisible. */
export function connecteeAuCloud(coffre, platform) {
  if (!Array.isArray(coffre)) return null;
  return coffre.some((c) => String(c?.plateforme ?? "") === String(platform ?? "") && c?.connecte === true);
}

/**
 * Faut-il poser « à toi de jouer : connecte X » sur cette republication ? (pur)
 * @param {any} job  { action, status, platform, created_at, platform_fields }
 * @param {{ cloudVoie: boolean|null, coffre: Array<any>|null, maintenant?: number }} etat
 */
export function doitAttendreConnexion(job, { cloudVoie, coffre, maintenant = Date.now() } = {}) {
  if (job?.action !== "republish" || job?.status !== "pending") return false;
  const pf = pfDe(job);
  if (pf.republish_step !== "deleted") return false;
  if (cloudVoie !== true) return false;
  const platform = String(job?.platform ?? "");
  if (!PLATEFORMES_CLOUD.includes(platform)) return false;
  const connectee = connecteeAuCloud(coffre, platform);
  if (connectee !== false) return false;               // connectée, ou coffre illisible : rien
  const le = Number.isFinite(retireeLe(pf)) ? retireeLe(pf) : ts(job?.created_at);
  return Number.isFinite(le) && maintenant - le >= DELAI_AVANT_GESTE_MS;
}

const dateDeParis = (ms) => {
  try { return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }); } catch { return null; }
};
const titreCourt = (job) => String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);

/** Le message (pur). Ancre « Connexion X requise » : la même que l'app (bouton « Me connecter ») et handler-watch. */
export function texteAttendConnexion(job, lang = "fr") {
  const platform = String(job?.platform ?? "");
  const nom = NOM[platform] ?? platform;
  const titre = titreCourt(job);
  const le = retireeLe(pfDe(job));
  const date = Number.isFinite(le) ? dateDeParis(le) : null;
  if (lang === "en") {
    return `${nom} connection required: your listing${titre ? ` "${titre}"` : ""} has been offline on ${nom}${date ? ` since ${date}` : ""} `
      + `(removed to be relisted), and ${nom} is not connected to FillSell Cloud. Connect ${nom} in the app ("Connect"): `
      + "it will go back online on its own, with its photos, title and description. Nothing is lost.";
  }
  return `Connexion ${nom} requise : ton annonce${titre ? ` « ${titre} »` : ""} est hors ligne sur ${nom}${date ? ` depuis le ${date}` : ""} `
    + `(retirée pour être republiée), et ${nom} n'est pas connecté à FillSell Cloud. Connecte ${nom} dans l'app (« Me connecter ») : `
    + "elle sera remise en ligne toute seule, avec ses photos, son titre et sa description. Rien n'est perdu.";
}

/** L'écriture qui pose le geste (pur) : needs_user, message, marqueur daté ; l'étape 'deleted' et la mémoire restent. */
export function patchAttendConnexion(job, { maintenant = Date.now() } = {}) {
  const pf = { ...pfDe(job) };
  for (const k of ["next_action_after", "processing_since", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]) delete pf[k];
  pf.needs_user_source = SOURCE_RECREATION_ATTEND_CONNEXION;
  pf[SOURCE_RECREATION_ATTEND_CONNEXION] = {
    depuis: new Date(maintenant).toISOString(), plateforme: String(job?.platform ?? ""), par: "handler-watch",
    retiree_le: Number.isFinite(retireeLe(pf)) ? new Date(retireeLe(pf)).toISOString() : null,
  };
  return { status: "needs_user", error: texteAttendConnexion(job), platform_fields: pf };
}

/** Faut-il lever le geste ? Connectée au Cloud, ou Cloud plus actif. Illisible : jamais (pur). */
export function leveeAttendConnexion(job, { cloudVoie, coffre } = {}) {
  if (job?.status !== "needs_user") return false;
  const pf = pfDe(job);
  if (pf.needs_user_source !== SOURCE_RECREATION_ATTEND_CONNEXION) return false;
  if (cloudVoie === false) return true;
  if (cloudVoie !== true) return false;
  return connecteeAuCloud(coffre, job?.platform) === true;
}

/** L'écriture de la levée (pur) : en file, à SON étape ('deleted' : la recréation), message effacé, trace gardée. */
export function patchLeveeAttendConnexion(job, { maintenant = Date.now(), motif = "connectee_au_cloud" } = {}) {
  const pf = { ...pfDe(job) };
  const pose = pf[SOURCE_RECREATION_ATTEND_CONNEXION] ?? null;
  delete pf[SOURCE_RECREATION_ATTEND_CONNEXION];
  delete pf.needs_user_source;
  delete pf.next_action_after;
  pf.recreation_attend_connexion_levee = { le: new Date(maintenant).toISOString(), motif, pose };
  return { status: "pending", error: null, platform_fields: pf };
}

/**
 * Cette annonce hors ligne attend-elle une CONNEXION (geste de la personne) plutôt qu'une remise en ligne en cours ?
 * (pur) Seulement la source posée ci-dessus, par le serveur, sur une preuve (coffre du Cloud). ⛔ Jamais une simple
 * marque `attente_session` d'une tâche 'pending' : elle peut traîner d'une attente passée (7cecc29c, 15/11 : marque du
 * 11/11, tâche en REPRISE après interruption — la croire « en attente de connexion » aurait mis le même article hors
 * ligne sur deux plateformes). Sur l'ordinateur, une session vraiment fermée devient le mur confirmé « Connexion X
 * requise » (needs_user, _shared/mur-geste.js), qui sort déjà de la file et ne retient plus rien.
 */
export function attendUneConnexion(h) {
  return pfDe(h).needs_user_source === SOURCE_RECREATION_ATTEND_CONNEXION;
}

// (règle 4) La LIMITE : au-delà, une remise en ligne à 'deleted' ne diffère plus jamais une mise à jour, même servie à
// ce poll. Le rechargement se fait sous le verrou de flux de l'extension (aucun job ne démarre entre la vérification et
// le rechargement) ; un job EN COURS ('processing') le diffère toujours, lui.
export const LIMITE_MAJ_DIFFEREE_MS = 2 * 3600_000;

/**
 * (règle 4) Les ids des republications 'pending' à 'deleted' qui ne doivent plus différer la mise à jour de l'extension
 * de CE poste (pur) : celles que ce poll ne lui sert pas (rien ne tourne pour elles), et celles retirées depuis plus de
 * LIMITE_MAJ_DIFFEREE_MS. `enAttente` : [{ id, status, platform_fields, created_at }] ; `servis` : ids servis.
 */
export function retenuesDeletedPourLaMiseAJour(enAttente, servis, maintenant = Date.now()) {
  const s = servis instanceof Set ? servis : new Set((Array.isArray(servis) ? servis : []).map(String));
  const out = [];
  for (const j of Array.isArray(enAttente) ? enAttente : []) {
    const pf = pfDe(j);
    if (j?.status !== "pending" || pf.republish_step !== "deleted") continue;
    const le = Number.isFinite(retireeLe(pf)) ? retireeLe(pf) : ts(j?.created_at);
    if (!s.has(String(j.id)) || (Number.isFinite(le) && maintenant - le >= LIMITE_MAJ_DIFFEREE_MS)) out.push(String(j.id));
  }
  return out;
}
