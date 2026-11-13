// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — MÊME CODE POSTAL : LA COMMUNE DE LEBONCOIN EST ACCEPTÉE ; AUTRE CODE POSTAL : BLOQUÉ, EXPLIQUÉ
// (13/11, lot « zéro problème », étape 3, point 3d — décision de Nico du 12/11)
// ═══════════════════════════════════════════════════════════════════════════
// « Adresse Leboncoin : même code postal → la commune de Leboncoin est acceptée et dite une fois ; code postal
// différent → bloqué avec un message qui explique (CEDEX, 75000). Côté serveur (get-pending-jobs), pour toutes les
// versions d'extension, Réglages jamais réécrits. » Principe : par identifiants — le CODE POSTAL est l'identifiant,
// jamais une comparaison de noms de communes en français.
//
// LES CAS (30 jours, refus « aucune suggestion Leboncoin ne la couvre ») :
//   · a1e210f2, ville de l'annonce « seynod 74600 » (Seynod, commune déléguée d'Annecy depuis le 01/01/2017) :
//     Leboncoin ne propose que « Annecy (74600) » ; l'extension exige la ville tapée dans la proposition → 22 refus
//     « Nouvel essai automatique, rien à faire » (11 publications, 12/11 17:28 → 18:17), Réglages corrigés à la main ;
//   · 8ac5bbda, « PARIS 75000 » : 75000 n'est le code d'aucune commune (Paris : 75001 à 75020) → Leboncoin propose
//     Carquefou (44470), Villeneuve-Saint-Georges (94190)… : blocage JUSTE, message faux (« rien à faire ») ;
//   · 98b72757, « Cholet 49308 » : code CEDEX (Cholet = 49300) → Saint-Maur-des-Fossés (94100)… : blocage juste,
//     12 publications encore en file le 13/11 avec cette ville.
// LA RÈGLE (un job Leboncoin publication/republication, servi par get-pending-jobs, toutes versions d'extension) :
//   1. la commune que l'extension va taper est lue comme elle la lit (leboncoin.js : localisation d'origine d'une
//      republication — jamais touchée, elle vient de Leboncoin ; sinon la ville choisie pour l'annonce ; sinon
//      l'adresse de remise servie) ;
//   2. son code postal n'est PAS dans la base officielle des codes postaux de commune (codes-postaux-fr.js) →
//      BLOQUÉ avant tout essai, message qui explique (CEDEX, code général comme 75000) et cite les codes de commune
//      officiels qui commencent comme lui ;
//   3. Leboncoin a déjà refusé CETTE commune pour ce compte (ce job ou un autre job servi) — sa réponse est dans le
//      message de refus de l'extension, toutes versions (« Propositions affichées: [...] ») :
//        · ses propositions au MÊME code postal désignent UNE commune → elle est servie (ville de l'annonce, ou la
//          ville de l'adresse servie, rue gardée) : toutes les versions d'extension l'acceptent ; la trace
//          lbc_commune_meme_cp est posée sur la tâche, la phrase n'est dite qu'une fois par compte ;
//        · au même code postal, PLUSIEURS communes → bloqué (FillSell ne choisit pas : la question) ;
//        · aucune au même code postal → bloqué, message qui explique (jamais « rien à faire ») ;
//   4. ⛔ Réglages jamais réécrits : seul ce qui est SERVI change (la tâche garde sa trace).
// L'extension 0.6.187 applique la même règle au repli « code postal ville » (aucun essai perdu) ; les versions
// d'avant la reçoivent par le serveur après un refus.
// Pur (Deno + Node). Verrou : scripts/lbc-commune-meme-cp-selftest.mjs.

import { codesPostauxFrancais } from "./lbc-adresse-france.js";
import { communeComparable, textesErreurJob } from "./lbc-voie-des-reglages.js";

export const CLE_COMMUNE_MEME_CP = "lbc_commune_meme_cp";
export const SOURCE_BLOCAGE_COMMUNE = "lbc_commune_code_postal";
export const REGLE_COMMUNE_MEME_CP = "lbc_commune_meme_cp_1311";

const propre = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** { code_postal, ville } valide (cinq chiffres, ville non vide), sinon null — même règle que src/publication/villeLbc.js. */
function villeValide(v) {
  if (!v || typeof v !== "object") return null;
  const code_postal = propre(v.code_postal);
  const ville = propre(v.ville);
  return /^\d{5}$/.test(code_postal) && ville ? { code_postal, ville } : null;
}

// Même lecture que leboncoin.js (replierSurCpVille) : le code postal, puis ce qui le suit ; à défaut ce qui le
// précède, s'il n'est pas une voie.
const VOIE_RE = /(^|[^a-z])(rue|avenue|bd|boulevard|chemin|allee|allees|impasse|route|place|square|quai|cours|lotissement|residence|hameau|voie|passage|sentier|faubourg|esplanade|traverse|montee|villa|clos|parc)([^a-z]|$)/;
const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function cpVilleDeLAdresse(adresse) {
  const brut = propre(adresse);
  const m = brut.match(/\b\d{5}\b/);
  if (!m) return null;
  const cp = m[0];
  const net = (s) => s.replace(/[,;]/g, " ").replace(/\s+/g, " ").trim();
  const apres = net(brut.slice(m.index + cp.length));
  const avant = net(brut.slice(0, m.index));
  const ville = apres || (avant && !VOIE_RE.test(plier(avant)) ? avant : "");
  return ville ? { cp, ville, villeApres: Boolean(apres) } : null;
}

/**
 * La commune que l'extension va taper pour ce job (même ordre que leboncoin.js).
 * @returns {{ source: "origine" } | { source: "ville_choisie" | "adresse", cp: string, ville: string, tapee: string } | { source: null }}
 */
export function communeTapeeLbc(job) {
  const pf = obj(job?.platform_fields);
  const lo = pf.localisation_origine && typeof pf.localisation_origine === "object" ? pf.localisation_origine : null;
  const origine = lo && (propre(lo.voie) || propre(lo.ville) || propre(lo.libelle) || propre(lo.code_postal));
  if (pf.republish_step != null && origine) return { source: "origine" };
  const vc = villeValide(pf.ville_publication_lbc);
  if (vc) return { source: "ville_choisie", cp: vc.code_postal, ville: vc.ville, tapee: `${vc.ville} ${vc.code_postal}` };
  const a = cpVilleDeLAdresse(pf.adresse);
  if (a) return { source: "adresse", cp: a.cp, ville: a.ville, tapee: propre(pf.adresse) };
  return { source: null };
}

// ── LA RÉPONSE DE LEBONCOIN, DANS LE MESSAGE DE REFUS DE L'EXTENSION (toutes versions) ──────────────────────────
// « Adresse "seynod 74600" : aucune suggestion Leboncoin ne la couvre (…). Propositions affichées: ["Annecy (74600)",
// "Annecy (74600)"]. Le repli sur « 74600 seynod » … » — la liste est écrite en JSON par leboncoin.js (fillAddress).
const RE_REFUS_COUVRE = /Adresse "([^"]+)" : aucune suggestion Leboncoin ne la couvre/;
const MARQUE_PROPOSITIONS = "Propositions affichées: ";

/** Le refus d'adresse lu dans un texte d'erreur : { tapee, propositions } ou null. */
export function refusAdresseLbc(texte) {
  const t = String(texte ?? "");
  const m = t.match(RE_REFUS_COUVRE);
  if (!m) return null;
  const i = t.indexOf(MARQUE_PROPOSITIONS);
  let propositions = [];
  if (i >= 0) {
    const debut = i + MARQUE_PROPOSITIONS.length;
    // La liste JSON se ferme au premier « ] » qui donne un tableau lisible.
    for (let fin = t.indexOf("]", debut); fin >= 0; fin = t.indexOf("]", fin + 1)) {
      try {
        const v = JSON.parse(t.slice(debut, fin + 1));
        if (Array.isArray(v)) { propositions = v.map(propre).filter(Boolean); break; }
      } catch { /* pas encore la fin de la liste */ }
    }
  }
  return { tapee: propre(m[1]), propositions };
}

/** Le code postal d'une proposition Leboncoin (« Annecy (74600) », « Rue de Rennes, Paris (75006) »), ou null. */
export function codePostalDeProposition(p) {
  const all = [...String(p ?? "").matchAll(/\((\d{5})\)/g)];
  return all.length ? all[all.length - 1][1] : null;
}
/** La commune d'une proposition : avant « (code postal) », après la dernière virgule. */
export function communeDeProposition(p) {
  const s = propre(p);
  const i = s.lastIndexOf("(");
  const tete = (i >= 0 ? s.slice(0, i) : s).trim();
  const j = tete.lastIndexOf(",");
  return propre(j >= 0 ? tete.slice(j + 1) : tete);
}

/**
 * Juge les propositions de Leboncoin pour un code postal — par le CODE POSTAL seul (identifiant) ; les noms ne sont
 * comparés qu'entre propositions de Leboncoin (sont-elles une seule commune ?), jamais avec le nôtre.
 * @returns {{ verdict: "meme_cp", cp: string, commune: string } | { verdict: "plusieurs_communes", cp: string, communes: string[] }
 *   | { verdict: "autre_cp", cp: string, autres: string[] } | { verdict: "aucune", cp: string }}
 */
export function jugerCommuneMemeCp({ cp, propositions }) {
  const lues = (Array.isArray(propositions) ? propositions : [])
    .map((p) => ({ cp: codePostalDeProposition(p), commune: communeDeProposition(p) }))
    .filter((x) => x.cp && x.commune);
  const memes = lues.filter((x) => x.cp === cp);
  if (memes.length) {
    const parCle = new Map(memes.map((x) => [communeComparable(x.commune), x.commune]));
    if (parCle.size === 1) return { verdict: "meme_cp", cp, commune: memes[0].commune };
    return { verdict: "plusieurs_communes", cp, communes: [...parCle.values()] };
  }
  if (lues.length) return { verdict: "autre_cp", cp, autres: [...new Set(lues.map((x) => `${x.commune} (${x.cp})`))] };
  return { verdict: "aucune", cp };
}

/** Ce code postal est-il celui d'une commune (base officielle) ? */
export function codePostalDeCommune(cp) {
  return /^\d{5}$/.test(String(cp ?? "")) && codesPostauxFrancais().has(String(cp));
}

/** Les codes de commune officiels qui commencent comme `cp` (texte court pour le message), ou "". */
export function codesProches(cp) {
  const c = String(cp ?? "");
  if (!/^\d{5}$/.test(c)) return "";
  const tous = [...codesPostauxFrancais()].sort();
  const p4 = tous.filter((x) => x.startsWith(c.slice(0, 4)) && x !== c);
  if (p4.length >= 1 && p4.length <= 3) return p4.join(", ");
  if (c.endsWith("000")) {
    const arr = tous.filter((x) => x.startsWith(c.slice(0, 3)) && Number(x.slice(3)) >= 1 && Number(x.slice(3)) <= 20);
    if (arr.length >= 2) return `${arr[0]} à ${arr[arr.length - 1]}`;
  }
  if (p4.length > 3) return `${p4[0]} à ${p4[p4.length - 1]}`;
  return "";
}

const OU = {
  ville_choisie: { fr: "Réglages › Leboncoin › « Ville de l'annonce »", en: "Settings › Leboncoin › “Listing town”" },
  adresse: { fr: "Réglages › « Adresse de remise Leboncoin »", en: "Settings › “Leboncoin pickup address”" },
};
const ouDe = (source, lang) => (OU[source] ?? OU.adresse)[lang === "en" ? "en" : "fr"];

/** Code postal hors de la base des communes (CEDEX, code général) : le message, avant tout essai. */
export function messageCodePostalNonCommune({ cp, ville, source }, lang = "fr") {
  const proches = codesProches(cp);
  if (lang === "en") {
    return `Leboncoin doesn't know the postcode ${cp} (“${ville}”): it isn't a town's postcode — it's a CEDEX code (business mail) `
      + `or a general code such as 75000. Leboncoin would place your listing in another town, so nothing was sent. `
      + `Enter your town's postcode${proches ? ` (town postcodes starting like it: ${proches})` : ""} in ${ouDe(source, "en")}, then retry. Nothing was published.`;
  }
  return `Leboncoin ne connaît pas le code postal ${cp} (« ${ville} ») : ce n'est pas le code d'une commune — c'est un code CEDEX `
    + `(courrier des entreprises) ou un code général comme 75000. Leboncoin placerait ton annonce dans une autre commune, alors rien n'est parti. `
    + `Mets le code postal de ta commune${proches ? ` (codes de commune qui commencent comme lui : ${proches})` : ""} dans ${ouDe(source, "fr")}, puis relance. Rien n'a été publié.`;
}

/** Leboncoin ne propose que des communes d'un AUTRE code postal. */
export function messageAutreCodePostal({ cp, ville, tapee, autres, source }, lang = "fr") {
  const liste = (autres ?? []).slice(0, 3).join(", ");
  if (lang === "en") {
    return `Leboncoin can't find “${tapee}”: it only offers towns with another postcode than ${cp} (${liste}). FillSell never places `
      + `your listing in another town, so nothing was sent. Check the postcode and town (“${ville}”) in ${ouDe(source, "en")}, then retry. Nothing was published.`;
  }
  return `Leboncoin ne trouve pas « ${tapee} » : il ne propose que des communes d'un autre code postal que ${cp} (${liste}). FillSell ne place `
    + `jamais ton annonce dans une autre commune, alors rien n'est parti. Vérifie le code postal et la ville (« ${ville} ») dans ${ouDe(source, "fr")}, puis relance. Rien n'a été publié.`;
}

/** Au même code postal, plusieurs communes : FillSell ne choisit pas. */
export function messagePlusieursCommunes({ cp, ville, communes, source }, lang = "fr") {
  const liste = (communes ?? []).slice(0, 4).join(", ");
  if (lang === "en") {
    return `Leboncoin doesn't know “${ville}” and offers several towns for the postcode ${cp} (${liste}): FillSell doesn't choose for you. `
      + `Enter your town in ${ouDe(source, "en")}, then retry. Nothing was published.`;
  }
  return `Leboncoin ne connaît pas « ${ville} » et propose plusieurs communes pour le code postal ${cp} (${liste}) : FillSell ne choisit pas à ta place. `
    + `Indique ta commune dans ${ouDe(source, "fr")}, puis relance. Rien n'a été publié.`;
}

/** La phrase dite UNE fois : Leboncoin place les annonces dans SA commune pour ce code postal. */
export function phraseCommuneLeboncoin({ cp, ville, commune }, lang = "fr") {
  if (lang === "en") return `Leboncoin doesn't know “${ville}”: for the postcode ${cp}, it places your listings in ${commune} (${cp}). Your settings don't change.`;
  return `Leboncoin ne connaît pas « ${ville} » : pour le code postal ${cp}, il place tes annonces à ${commune} (${cp}). Tes Réglages ne changent pas.`;
}

/** Le refus connu qui concerne CETTE commune tapée (même code postal dans l'adresse tapée, même ville). */
function refusDeLaCommune(t, textes) {
  const cle = communeComparable(t.ville);
  for (const x of textes) {
    const r = refusAdresseLbc(x);
    if (!r || !r.tapee.includes(t.cp)) continue;
    if (cle && communeComparable(r.tapee).includes(cle)) return r;
  }
  return null;
}

/**
 * LA DÉCISION pour un job Leboncoin servi, avec la correction des Réglages : une ville de l'annonce BLOQUÉE sur la
 * tâche (copie faite à sa création) cède à la ville de l'annonce ACTUELLE des Réglages quand elle est différente et
 * que son code postal est celui d'une commune — c'est le geste que le message demande (« corrige dans Réglages, puis
 * relance ») ; sans lui, la relance retaperait la copie bloquée. Les Réglages sont lus, jamais écrits. Pur.
 * @param {{ job: any, reglagesLbc?: any, refusCompte?: string[], maintenant?: string }} arg
 * @returns {{ action: "tel_quel", motif?: string }
 *   | { action: "bloquer", motif: string, message: string, message_en: string, trace: Record<string, any> }
 *   | { action: "commune", platform_fields: Record<string, any>, trace: Record<string, any>, motif?: string }}
 */
export function decisionCommuneLbc({ job, reglagesLbc = null, refusCompte = [], maintenant = new Date().toISOString() }) {
  const d = decisionCommuneLbcSeule({ job, refusCompte, maintenant });
  if (d.action !== "bloquer" || d.trace?.source !== "ville_choisie") return d;
  const r = villeValide(obj(reglagesLbc).ville_publication);
  const pf = obj(job?.platform_fields);
  const tapee = villeValide(pf.ville_publication_lbc);
  if (!r || !tapee || !codePostalDeCommune(r.code_postal)) return d;
  if (r.code_postal === tapee.code_postal && communeComparable(r.ville) === communeComparable(tapee.ville)) return d;
  // La ville des Réglages a-t-elle elle-même été refusée par Leboncoin ? Alors on la juge comme l'autre.
  const essai = decisionCommuneLbcSeule({ job: { ...job, platform_fields: { ...pf, ville_publication_lbc: r } }, refusCompte, maintenant });
  if (essai.action === "bloquer") return essai;
  const pfN = essai.action === "commune" ? essai.platform_fields : { ...pf, ville_publication_lbc: r };
  const trace = { le: maintenant, code_postal: r.code_postal, ville_tapee: tapee.ville, code_postal_tape: tapee.code_postal, source: "ville_choisie",
    regle: REGLE_COMMUNE_MEME_CP, pose_par: "get-pending-jobs", servie: "ville_publication_lbc", reglages_corriges: { ...r }, bloquee: d.trace?.motif ?? null,
    ...(essai.action === "commune" ? { commune: essai.trace.commune } : {}) };
  return { action: "commune", platform_fields: { ...pfN, [CLE_COMMUNE_MEME_CP]: trace }, trace, motif: "reglages_corriges" };
}

/**
 * LA DÉCISION pour un job Leboncoin servi (sans les Réglages). Pur.
 * @param {{ job: any, refusCompte?: string[], maintenant?: string }} arg
 *   refusCompte : les textes d'erreur des AUTRES jobs Leboncoin servis du compte (textesErreurJob) — un refus de la
 *   même commune sur l'un d'eux vaut pour tous.
 * @returns {{ action: "tel_quel", motif?: string }
 *   | { action: "bloquer", motif: string, message: string, message_en: string, trace: Record<string, any> }
 *   | { action: "commune", platform_fields: Record<string, any>, trace: Record<string, any>, motif?: string }}
 */
export function decisionCommuneLbcSeule({ job, refusCompte = [], maintenant = new Date().toISOString() }) {
  if (String(job?.platform ?? "") !== "leboncoin") return { action: "tel_quel" };
  const action = String(job?.action ?? "publish") || "publish";
  if (action !== "publish" && action !== "republish") return { action: "tel_quel" };
  const pf = obj(job.platform_fields);
  const t = communeTapeeLbc(job);
  if (t.source !== "ville_choisie" && t.source !== "adresse") return { action: "tel_quel", motif: t.source === "origine" ? "localisation_origine" : "commune_illisible" };
  const base = { le: maintenant, code_postal: t.cp, ville_tapee: t.ville, source: t.source, regle: REGLE_COMMUNE_MEME_CP, pose_par: "get-pending-jobs" };
  // 2. Un code postal qui n'est celui d'aucune commune : jamais tapé (Leboncoin proposerait une autre commune).
  if (!codePostalDeCommune(t.cp)) {
    return { action: "bloquer", motif: "cp_non_commune", message: messageCodePostalNonCommune(t, "fr"), message_en: messageCodePostalNonCommune(t, "en"),
      trace: { ...base, motif: "cp_non_commune", codes_proches: codesProches(t.cp) || null } };
  }
  // 3. La réponse de Leboncoin à cette commune, si elle est connue (ce job d'abord, puis le compte).
  const r = refusDeLaCommune(t, textesErreurJob(job)) ?? refusDeLaCommune(t, Array.isArray(refusCompte) ? refusCompte : []);
  if (!r) return { action: "tel_quel", motif: "aucun_refus_connu" };
  const j = jugerCommuneMemeCp({ cp: t.cp, propositions: r.propositions });
  if (j.verdict === "meme_cp") {
    if (communeComparable(j.commune) === communeComparable(t.ville)) return { action: "tel_quel", motif: "meme_commune" };
    const pfN = { ...pf };
    let servie;
    const a = t.source === "adresse" ? cpVilleDeLAdresse(pf.adresse) : null;
    if (t.source === "adresse" && a?.villeApres) {
      // La rue est gardée : seule la commune après le code postal change (forme composée par l'app : rue cp ville).
      const s = propre(pf.adresse);
      const i = s.search(new RegExp(`\\b${t.cp}\\b`));
      pfN.adresse = `${s.slice(0, i + t.cp.length)} ${j.commune}`.replace(/\s+/g, " ").trim();
      servie = "adresse";
    } else {
      pfN.ville_publication_lbc = { code_postal: t.cp, ville: j.commune };
      servie = "ville_publication_lbc";
    }
    const trace = { ...base, commune: j.commune, servie, preuve: { tapee: r.tapee, propositions: r.propositions.slice(0, 5) } };
    pfN[CLE_COMMUNE_MEME_CP] = trace;
    return { action: "commune", platform_fields: pfN, trace };
  }
  if (j.verdict === "plusieurs_communes") {
    const d = { ...t, communes: j.communes };
    return { action: "bloquer", motif: "plusieurs_communes", message: messagePlusieursCommunes(d, "fr"), message_en: messagePlusieursCommunes(d, "en"),
      trace: { ...base, motif: "plusieurs_communes", communes: j.communes, preuve: { tapee: r.tapee, propositions: r.propositions.slice(0, 5) } } };
  }
  if (j.verdict === "autre_cp") {
    const d = { ...t, tapee: r.tapee, autres: j.autres };
    return { action: "bloquer", motif: "autre_cp", message: messageAutreCodePostal(d, "fr"), message_en: messageAutreCodePostal(d, "en"),
      trace: { ...base, motif: "autre_cp", autres: j.autres.slice(0, 5), preuve: { tapee: r.tapee } } };
  }
  return { action: "tel_quel", motif: "aucune_proposition" };
}

/** La trace d'une commune déjà servie pour ce compte (même code postal, même ville tapée) a-t-elle été dite ? */
export function phraseDejaDite(traces, { code_postal, ville_tapee, commune }) {
  return (Array.isArray(traces) ? traces : []).some((x) => x && x.dite === true && String(x.code_postal) === String(code_postal)
    && communeComparable(x.ville_tapee) === communeComparable(ville_tapee) && communeComparable(x.commune) === communeComparable(commune));
}

/** Le patch d'un blocage (needs_user, état « à toi de jouer », jamais une relance automatique). Pur. */
export function patchBlocageCommune(job, d) {
  const pf = { ...obj(job?.platform_fields) };
  pf.needs_user_source = SOURCE_BLOCAGE_COMMUNE;
  pf[CLE_COMMUNE_MEME_CP] = d.trace;
  delete pf.next_action_after;
  delete pf.processing_since;
  return { status: "needs_user", error: d.message, platform_fields: pf };
}
