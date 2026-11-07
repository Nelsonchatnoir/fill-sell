// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT VINTED DONT L'ANNONCE EST RETROUVÉE PAR LE RELEVÉ N'EST JAMAIS « FAILED » (07/11, Nico — tous les comptes)
// ═══════════════════════════════════════════════════════════════════════════
// Constat vérifié en lecture le 07/11 (doriane-henri « Veste gilet ONLY beige », Anne-Hélène « Pull zippé chaud bleu
// 12 ans », et XEWER « Dragon Ball Z: Kakarot PS4 ») : trois remises en vente Vinted du 05/11 (« Republier » d'une
// commande annulée, remises_en_vente_tick) RÉUSSIES — la nouvelle annonce est en ligne, la veste est même vendue — et
// restées « failed ». La chaîne, prouvée par les traces des jobs :
//   1. la personne a remis l'article en ligne elle-même sur Vinted (« Republier » de la conversation), puis appuyé sur
//      « Remettre en vente » et « Synchroniser » dans FillSell ;
//   2. la synchro du dressing a trouvé un numéro inconnu → fiche NEUVE (origine vinted_sync) + job de suivi
//      « sync-dressing » publié sur ce numéro (10:22:37 / 19:47:15), AVANT que la remise n'existe (10:25 / 19:50) ;
//   3. l'extension a fait la remise : « Republier » n'était plus proposé, une seule annonce récente portait les photos de
//      l'annonce annulée → rattachée (republier.nouvel_item, source « geste_du_vendeur »), « published » + son lien ;
//   4. le déclencheur cross_post_jobs_lien_jamais_croise a refusé le lien (« annonce_portee_par_un_autre_article » :
//      le job de suivi de la fiche neuve le porte) → job « published » SANS lien ni numéro (lien_refuse.id_propose) ;
//   5. le cron fail_publish_without_listing_url (03:30 UTC) : « Publication non confirmée … AVANT DE REPUBLIER … »
//      (listing_url_abandon) — alors que le numéro était connu.
//
// LA RÈGLE (ce module décide ; handler-watch écrit, une fois par heure, 30 jours, borné) :
//   PREUVE = le numéro que le DÉPÔT LUI-MÊME a lu sur Vinted : republier.nouvel_item.id (rattaché, pas un brouillon) et/ou
//   lien_refuse.id_propose (le numéro qu'il a voulu poser) — concordants ; la boutique du dépôt = celle de l'annonce.
//   Jamais un titre. Jamais une photo seule (les photos communes sont notées, pas exigées : le numéro décide).
//   La fiche qui porte ce numéro aujourd'hui (inventaire.vinted_item_id, non fondue) dit la suite :
//   · personne (le relevé ne l'a pas encore vue) → attendre ;
//   · une autre boutique → rien, jamais ;
//   · l'annonce est VENDUE : la vente enregistrée (ventes) → le dépôt se CLÔT (« cancelled », message vrai), jamais
//     « published » ni « sold » (ni retrait armé, ni seconde note de vente : la vente reste où elle est, UNE fois) ;
//     vente pas encore enregistrée → attendre ;
//   · la fiche du dépôt elle-même (après le « Oui » de la personne, ou une fusion) → le dépôt est RECOLLÉ : « published »,
//     lien, numéro ; le job de suivi « sync-dressing » de la même annonce sur la même fiche se clôt (le dépôt passe avant
//     un job de suivi d'un relevé, règle du 27/10) ;
//   · une fiche NEUVE née de la synchro APRÈS le dépôt et INTACTE (rien que l'annonce : ni vente, ni autre job, ni autre
//     annonce, ni saisie de la personne) → RATTACHER l'annonce à la fiche du dépôt — comme inventaire_reconcilie_jumelle_vinted
//     le fait à l'INSERT ; l'écriture atomique (public.depot_retrouve_rattacher) n'est pas écrite (0 cas sur 30 jours au
//     07/11) : tant qu'elle n'existe pas, handler-watch pose la question à la place (DEPOT_RETROUVE_RATTACHER_RPC) ;
//   · sinon (née AVANT le dépôt — la personne l'avait remise en ligne elle-même —, ou porteuse d'autres données) → la
//     QUESTION « Est-ce le même article ? » (releve_poser_question, motif depot_retrouve_par_le_releve), posée une fois par
//     paire, jamais quand le « Oui » ne pourrait pas réunir les fiches ; le dépôt quitte « failed » : « cancelled » avec le
//     message vrai (l'article EST en ligne, rien à republier) ; après le « Oui », il est recollé (ci-dessus).
//   Un dépôt que la PERSONNE a arrêté (cancelled sans notre marque) n'est jamais réécrit : la question seule.
// Pur (Deno + Node) : scripts/depot-retrouve-releve-selftest.mjs.

export const REGLE_DEPOT_RETROUVE = "depot_retrouve_par_releve_0711";
export const MOTIF_QUESTION_DEPOT_RETROUVE = "depot_retrouve_par_le_releve";
export const POSE_PAR_DEPOT_RETROUVE = "handler-watch (dépôt retrouvé par le relevé)";
export const FENETRE_DEPOT_RETROUVE_MS = 30 * 86_400_000;
/** Motifs du déclencheur cross_post_jobs_lien_jamais_croise qui disent « ce numéro est porté par une autre fiche ». */
export const MOTIFS_LIEN_REFUSE_AUTRE_FICHE = ["annonce_portee_par_un_autre_article", "annonce_rattachee_a_un_autre_article"];
const STATUTS_EN_LIGNE = ["active", "reserved", "hidden"];
const SUIVI_RE = /·\s*sync-dressing\b|releve-annonces/i;

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const txt = (v) => String(v ?? "").trim();
const numero = (v) => (/^\d{6,}$/.test(txt(v)) ? txt(v) : null);

/** Le numéro Vinted d'un lien (/items/<n>…), ou null. */
export function numeroDuLien(url) {
  const m = /\/items\/(\d{6,})/.exec(String(url ?? ""));
  return m ? m[1] : null;
}

/** Un job porte-t-il ce numéro (colonne ou lien) ? */
export function jobPorte(j, n) {
  if (!n || !j) return false;
  return numero(j.platform_listing_id) === n || numeroDuLien(j.listing_url) === n;
}

/** Un job de suivi né d'un relevé (synchro du dressing, relevé d'annonces), jamais un dépôt de FillSell. */
export function estJobDeSuivi(j) {
  return SUIVI_RE.test(String(j?.handler_build ?? "")) || txt(j?.platform_fields?.source) === "releve";
}

/**
 * Le numéro que le DÉPÔT a lu lui-même sur Vinted. Rend { numero, sources[] } ou { numero: null, raison }.
 * Sources : « republier » (l'annonce née du geste « Republier », rattachée par le dépôt, jamais un brouillon) et
 * « lien_refuse » (le numéro que le dépôt a voulu poser, refusé parce qu'une AUTRE fiche le porte). Discordants → rien.
 */
export function numeroLuAuDepot(job) {
  const pf = job?.platform_fields ?? {};
  const sources = [];
  const nouvel = pf.republier?.nouvel_item;
  if (nouvel && nouvel.brouillon !== true && pf.republier?.rattache_le) {
    const n = numero(nouvel.id);
    if (n) sources.push({ source: "republier", numero: n, detail: txt(nouvel.source) || null });
  }
  const lr = pf.lien_refuse;
  if (lr && MOTIFS_LIEN_REFUSE_AUTRE_FICHE.includes(txt(lr.motif))) {
    const n = numero(lr.id_propose);
    if (n) sources.push({ source: "lien_refuse", numero: n, detail: txt(lr.motif) });
  }
  if (!sources.length) return { numero: null, raison: "sans_numero" };
  const distincts = [...new Set(sources.map((s) => s.numero))];
  if (distincts.length > 1) return { numero: null, raison: "numeros_discordants", sources };
  return { numero: distincts[0], sources };
}

/** La boutique Vinted du dépôt : celle lue au dépôt (vinted_account_proof), sinon celle du job. */
export function boutiqueDuDepot(job) {
  const pf = job?.platform_fields ?? {};
  return txt(pf.vinted_account_proof?.user_id) || txt(pf.vinted_account_id) || null;
}

/** Jetons de photos Vinted (« 02_00759_Ysp…/a50eef3a ») : la même photo hébergée par Vinted, quelle que soit la signature. */
export function jetonsPhotos(photos) {
  const out = new Set();
  for (const p of Array.isArray(photos) ? photos : []) {
    const url = typeof p === "string" ? p : String(p?.url ?? p?.original ?? "");
    const m = /vinted\.net\/tc\/([^/?#]+\/[^/?#.]+)/i.exec(url);
    if (m) out.add(m[1].toLowerCase());
  }
  return out;
}
export function photosCommunes(a, b) {
  const ja = jetonsPhotos(a); let n = 0;
  for (const t of jetonsPhotos(b)) if (ja.has(t)) n++;
  return n;
}

/** Un dépôt de la règle : Vinted, publication d'une fiche, dans la fenêtre, état où il n'est pas recollé. */
export function estDepotAJuger(job, maintenant = Date.now()) {
  if (!job || job.platform !== "vinted" || String(job.action ?? "publish") !== "publish" || job.inventaire_id == null) return false;
  if (estJobDeSuivi(job)) return false;
  const cree = ms(job.created_at);
  if (!Number.isFinite(cree) || maintenant - cree > FENETRE_DEPOT_RETROUVE_MS) return false;
  if (job.status === "published") return !txt(job.listing_url) && !txt(job.platform_listing_id);
  return job.status === "failed" || job.status === "cancelled";
}

/** Une fiche née de la synchro et qui ne porte RIEN d'autre que l'annonce (aucune donnée perdue en la fondant). */
export function raisonsPasIntacte(fiche, ficheDepot, o = {}) {
  const r = [];
  if (!fiche) return ["fiche_absente"];
  if (txt(fiche.origine) !== "vinted_sync") r.push("pas_nee_de_la_synchro");
  if (fiche.statut !== "stock") r.push("statut_" + (fiche.statut ?? "inconnu"));
  if (fiche.fusionne_dans != null) r.push("deja_fondue");
  if (Number(fiche.quantite ?? 1) > 1) r.push("quantite");
  // Le prix d'achat : absent, ou le même que celui de la fiche du dépôt (rien à perdre).
  const pa = fiche.prix_achat == null ? null : Number(fiche.prix_achat);
  const paD = ficheDepot?.prix_achat == null ? null : Number(ficheDepot.prix_achat);
  if (pa != null && pa !== paD) r.push("prix_achat");
  if (fiche.prix_achat == null && fiche.prix_achat_inconnu === true && ficheDepot?.prix_achat_inconnu !== true) r.push("prix_achat_inconnu");
  if (fiche.prix_vente_change_par === "app" && fiche.prix_vente_change_le !== fiche.created_at) r.push("prix_vente_saisi");
  if (fiche.poids_change_par === "app" && fiche.poids_change_le !== fiche.created_at) r.push("poids_saisi");
  const attr = fiche.attributs && typeof fiche.attributs === "object" ? fiche.attributs : {};
  if (Object.values(attr).some((v) => v && typeof v === "object" && v.source === "manuel")) r.push("saisie_manuelle");
  if ((o.ventes ?? []).length) r.push("vente");
  if ((o.autresJobs ?? []).length) r.push("autre_job");
  if (o.annoncesPlateforme) r.push("autre_annonce");
  if (o.pushVentes) r.push("notification_de_vente");
  if (o.remisesEnVente) r.push("remise_en_vente");
  if (o.ficheAnnonce) r.push("fiche_annonce");
  return r;
}

/**
 * Le juge. Rend { decision, raison, numero, ... } :
 *   hors_regle | sans_numero | attendre | rien | vendue | recoller | rattacher | question | question_deja_posee
 * @param {{ job: any, ficheDepot: any, porteuse: any|null, jobsPorteuse?: any[], ventesAnnonce?: any[],
 *           donneesPorteuse?: { annoncesPlateforme?: number, pushVentes?: number, remisesEnVente?: number, ficheAnnonce?: number },
 *           jobsEngages?: any[], question?: { statut: string }|null, unionPossible?: boolean, maintenant?: number }} c
 */
export function jugerDepotRetrouve(c) {
  const { job, ficheDepot, porteuse } = c;
  const maintenant = c.maintenant ?? Date.now();
  if (!estDepotAJuger(job, maintenant)) return { decision: "hors_regle", raison: "pas_un_depot_a_juger" };
  const pf = job.platform_fields ?? {};
  const lu = numeroLuAuDepot(job);
  if (!lu.numero) return { decision: "sans_numero", raison: lu.raison };
  const n = lu.numero;
  // Un dépôt arrêté par la PERSONNE (ou clos par une autre règle) n'est jamais réécrit : la question seule.
  const marque = pf.depot_retrouve?.regle === REGLE_DEPOT_RETROUVE;
  const questionSeule = job.status === "cancelled" && !marque;
  const base = { numero: n, sources: lu.sources, questionSeule };
  if (!ficheDepot || ficheDepot.fusionne_dans != null) return { ...base, decision: "attendre", raison: "fiche_du_depot_fondue" };
  if (!porteuse) return { ...base, decision: "attendre", raison: "annonce_pas_encore_relevee" };
  const boutique = boutiqueDuDepot(job);
  if (!boutique) return { ...base, decision: "rien", raison: "boutique_du_depot_inconnue" };
  if (txt(porteuse.vinted_account_id) && txt(porteuse.vinted_account_id) !== boutique) {
    return { ...base, decision: "rien", raison: "autre_boutique" };
  }
  const photos = photosCommunes(job.photos, porteuse.photos);
  const memeFiche = String(porteuse.id) === String(ficheDepot.id);
  const jobsPorteuse = (c.jobsPorteuse ?? []).filter((j) => String(j.id) !== String(job.id));
  const ventes = c.ventesAnnonce ?? [];
  const jobVendu = jobsPorteuse.some((j) => j.platform === "vinted" && j.status === "sold" && jobPorte(j, n));
  const vendue = txt(porteuse.vinted_status) === "sold" || porteuse.statut === "vendu" || ventes.length > 0 || jobVendu;
  const ctx = { ...base, porteuse: porteuse.id, fiche_depot: ficheDepot.id, meme_fiche: memeFiche, photos_communes: photos, boutique };

  // ── L'annonce est vendue : la vente reste où elle est, une fois ; le dépôt se clôt, jamais « published » ni « sold ».
  if (vendue) {
    if (!ventes.length) return { ...ctx, decision: "attendre", raison: "vente_pas_encore_enregistree" };
    if (questionSeule) return { ...ctx, decision: "rien", raison: "arrete_par_la_personne" };
    return { ...ctx, decision: "vendue", raison: "annonce_vendue_vente_enregistree", vente: ventes[0] };
  }
  // ── Une republication engagée sur l'une des deux fiches : on n'y touche pas.
  if ((c.jobsEngages ?? []).length) return { ...ctx, decision: "attendre", raison: "republication_ou_depot_en_cours" };
  const enLigne = STATUTS_EN_LIGNE.includes(txt(porteuse.vinted_status)) && !porteuse.disparu_le;

  // ── La fiche du dépôt porte l'annonce (après le « Oui », ou une fusion) : recoller.
  if (memeFiche) {
    if (questionSeule) return { ...ctx, decision: "rien", raison: "arrete_par_la_personne" };
    if (!enLigne) return { ...ctx, decision: "attendre", raison: "annonce_pas_en_ligne" };
    if (ficheDepot.statut === "vendu") return { ...ctx, decision: "rien", raison: "fiche_du_depot_vendue" };
    const porteurs = jobsPorteuse.filter((j) => j.platform === "vinted" && ["publish", "republish"].includes(String(j.action ?? "publish"))
      && j.status === "published" && jobPorte(j, n));
    // Un autre DÉPÔT de FillSell porte déjà ce numéro sur la fiche : deux dépôts, une annonce — le doute, rien.
    if (porteurs.some((j) => !estJobDeSuivi(j))) return { ...ctx, decision: "rien", raison: "un_autre_depot_porte_l_annonce" };
    const lien = porteurs.map((j) => txt(j.listing_url)).find((u) => numeroDuLien(u) === n) || `https://www.vinted.fr/items/${n}`;
    return { ...ctx, decision: "recoller", raison: "fiche_du_depot_porte_l_annonce", jumeaux: porteurs.map((j) => j.id), lien };
  }

  // ── Une autre fiche porte l'annonce.
  const nee = ms(porteuse.created_at);
  const vue = ms(porteuse.first_seen_at);
  const depuis = ms(job.created_at);
  const neeApres = txt(porteuse.origine) === "vinted_sync" && Number.isFinite(nee) && nee >= depuis
    && (!Number.isFinite(vue) || vue >= depuis);
  const suivis = jobsPorteuse.filter((j) => j.platform === "vinted" && estJobDeSuivi(j) && jobPorte(j, n));
  const autresJobs = jobsPorteuse.filter((j) => !suivis.includes(j));
  const pasIntacte = raisonsPasIntacte(porteuse, ficheDepot, {
    ventes, autresJobs, annoncesPlateforme: c.donneesPorteuse?.annoncesPlateforme, pushVentes: c.donneesPorteuse?.pushVentes,
    remisesEnVente: c.donneesPorteuse?.remisesEnVente, ficheAnnonce: c.donneesPorteuse?.ficheAnnonce,
  });
  const ctx2 = { ...ctx, nee_apres_le_depot: neeApres, porteuse_nee_le: porteuse.created_at ?? null, depot_cree_le: job.created_at,
    pas_intacte: pasIntacte, suivis: suivis.map((j) => j.id) };
  // (la réunion doit être possible : la fiche du dépôt ne porte pas une AUTRE annonce Vinted vivante, hors remise prouvée)
  if (neeApres && !pasIntacte.length && !questionSeule && enLigne && ficheDepot.statut !== "vendu" && c.unionPossible === true) {
    return { ...ctx2, decision: "rattacher", raison: "fiche_neuve_nee_apres_le_depot_intacte" };
  }
  const q = c.question ?? null;
  if (q) {
    if (q.statut === "proposee") return { ...ctx2, decision: "question_deja_posee", raison: "question_en_attente" };
    if (q.statut === "fusionnee") return { ...ctx2, decision: "attendre", raison: "fusion_en_cours" };
    return { ...ctx2, decision: "rien", raison: `question_tranchee_${q.statut}` };
  }
  if (c.unionPossible !== true) return { ...ctx2, decision: "rien", raison: "oui_impossible_question_jamais_posee" };
  if (porteuse.statut !== "stock" || porteuse.fusionne_dans != null) return { ...ctx2, decision: "rien", raison: "porteuse_hors_stock" };
  return { ...ctx2, decision: "question", raison: neeApres ? "fiche_neuve_pas_intacte" : "fiche_neuve_nee_avant_le_depot" };
}

// ── Les écritures (handler-watch les envoie, compare-and-set sur le statut lu) ─────────────────────────────────────

const parisJour = (iso) => {
  const t = ms(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(new Date(t));
};
const remise = (job) => Boolean(job?.platform_fields?.remise_par_republier) || numeroLuAuDepot(job).sources?.some((s) => s.source === "republier");

export function messageQuestion(job, n) {
  const debut = remise(job)
    ? `Ton article a bien été remis en ligne sur Vinted : c'est l'annonce ${n} (FillSell l'a retrouvée par la conversation de la commande annulée — même boutique, mêmes photos).`
    : `Ta publication a bien été faite : ton article est en ligne sur Vinted sous l'annonce ${n} (numéro lu par FillSell au dépôt).`;
  return `${debut} Ta synchro du dressing l'avait déjà rangée sous une autre fiche de ton stock : réponds à « Est-ce le même article ? » ` +
    "dans Doublons, et FillSell réunira les deux fiches et rattachera l'annonce à cette publication. Rien à republier.";
}
export function messageVendue(job, n, vente) {
  const le = parisJour(vente?.vendu_le ?? vente?.date ?? null);
  const debut = remise(job) ? `Ton article a bien été remis en ligne sur Vinted (annonce ${n})` : `Ta publication a bien été faite sur Vinted (annonce ${n})`;
  return `${debut}, puis VENDU${le ? ` le ${le}` : ""} : la vente est enregistrée dans FillSell, sur la fiche que ta synchro du dressing ` +
    "avait créée pour cette annonce. Rien à republier, rien n'est compté deux fois.";
}

function marque(job, v, etape, maintenant, extra = {}) {
  const avant = job.platform_fields?.depot_retrouve;
  return {
    regle: REGLE_DEPOT_RETROUVE, etape, le: new Date(maintenant).toISOString(), numero: v.numero,
    sources: (v.sources ?? []).map((s) => s.source + (s.detail ? `:${s.detail}` : "")),
    fiche_porteuse: v.porteuse ?? null, photos_communes: v.photos_communes ?? 0, boutique: v.boutique ?? null,
    // Le premier état d'avant la règle reste (statut, message, constat du cron) : jamais écrasé par une étape suivante.
    statut_avant: avant?.statut_avant ?? job.status,
    erreur_avant: avant ? avant.erreur_avant ?? null : (job.error ? String(job.error).slice(0, 300) : null),
    listing_url_abandon: avant ? avant.listing_url_abandon ?? null : job.platform_fields?.listing_url_abandon ?? null,
    etapes: [...(Array.isArray(avant?.etapes) ? avant.etapes : avant ? [{ etape: avant.etape, le: avant.le }] : []), { etape, le: new Date(maintenant).toISOString() }].slice(-6),
    pose_par: POSE_PAR_DEPOT_RETROUVE,
    ...extra,
  };
}
// Le constat « jamais retrouvée en ligne » du cron (listing_url_abandon) est FAUX dès que le numéro est retrouvé : il quitte
// les champs (gardé dans depot_retrouve) — l'app n'invite plus à « vérifier avant de republier », et la garde des retraits
// de get-pending-jobs ne prend plus ce dépôt pour un dépôt abandonné.
const sansAbandon = (pf) => { const p = { ...(pf ?? {}) }; delete p.listing_url_abandon; return p; };

/** Le dépôt quitte « failed » : « cancelled », message vrai (question posée ou déjà en attente). null = rien à réécrire. */
export function patchDepotEnQuestion(job, v, maintenant = Date.now()) {
  const pf = job.platform_fields ?? {};
  const deja = pf.depot_retrouve;
  if (job.status === "cancelled" && deja?.regle === REGLE_DEPOT_RETROUVE && deja.etape === "question" && deja.numero === v.numero) return null;
  const error = messageQuestion(job, v.numero);
  return {
    status: "cancelled", error,
    platform_fields: { ...sansAbandon(pf), depot_retrouve: marque(job, v, "question", maintenant, { question: v.decision === "question" ? "posee" : "deja_posee",
      nee_apres_le_depot: v.nee_apres_le_depot ?? null }) },
  };
}

/** L'annonce est vendue : le dépôt se clôt (« cancelled »), jamais « sold » (la vente est déjà notée ailleurs). */
export function patchDepotVendu(job, v, maintenant = Date.now()) {
  const pf = job.platform_fields ?? {};
  const deja = pf.depot_retrouve;
  if (job.status === "cancelled" && deja?.regle === REGLE_DEPOT_RETROUVE && deja.etape === "vendue" && deja.numero === v.numero) return null;
  return {
    status: "cancelled", error: messageVendue(job, v.numero, v.vente),
    platform_fields: { ...sansAbandon(pf), depot_retrouve: marque(job, v, "vendue", maintenant, { vente: v.vente?.id ?? null, vendue_le: v.vente?.vendu_le ?? null }) },
  };
}

/** Le dépôt recollé : « published », lien, numéro (le déclencheur du lien croisé le laisse passer : même fiche). */
export function patchRecollage(job, v, maintenant = Date.now()) {
  return {
    status: "published", error: null, listing_url: v.lien, platform_listing_id: v.numero,
    platform_fields: { ...sansAbandon(job.platform_fields), vinted_item_id: v.numero,
      depot_retrouve: marque(job, v, "recolle", maintenant, { jumeaux_clos: v.jumeaux ?? [] }) },
  };
}

/** Le job de suivi « sync-dressing » de la même annonce, sur la même fiche : clos et détaché (règle du 27/10). */
export function patchJumeauClos(jumeau, v, depotId, maintenant = Date.now()) {
  const le = new Date(maintenant).toISOString();
  return {
    status: "cancelled",
    error: `Doublon d'un dépôt FillSell (même annonce ${v.numero}) : l'annonce est suivie par le dépôt de cette fiche.`,
    platform_fields: { ...(jumeau.platform_fields ?? {}), detache_le: le,
      doublon_identifiant: { le, depot: depotId, numero: v.numero, regle: REGLE_DEPOT_RETROUVE } },
  };
}

/** Les preuves de la question (inventaire_doublons.preuves). */
export function preuvesQuestion(job, v) {
  return {
    regle: REGLE_DEPOT_RETROUVE, motif: v.raison, job: job.id, numero: v.numero,
    sources: (v.sources ?? []).map((s) => s.source + (s.detail ? `:${s.detail}` : "")),
    boutique: v.boutique ?? null, photos_communes: v.photos_communes ?? 0,
    depot_cree_le: v.depot_cree_le ?? job.created_at, porteuse_nee_le: v.porteuse_nee_le ?? null,
    nee_apres_le_depot: v.nee_apres_le_depot ?? null, pas_intacte: v.pas_intacte ?? [],
  };
}
