// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN RESTREINT L'ACCÈS : TOUT S'ARRÊTE SUR LE COMPTE, PUIS REPRISE PRUDENTE (30/10, urgence Louis)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : Louis (Business) a deux comptes FillSell sur le même PC et la même connexion — « Amiral »
// (louis@ttfamily.fr, Brave) et louis-seller@ttfamily.fr (machine virtuelle) — qui lisent la même boutique Leboncoin
// (409 annonces). Refus 403 de Leboncoin à la veille des commandes : Amiral le 28/10 à 21:31, la VM le 29/10 à 05:35,
// Amiral encore le 30/10 à 02:27 ; trois republications en « vérification anti-robot » dès 12:51 ; le 30/10 vers
// 19:12, Leboncoin affiche « Accès temporairement restreint — un robot est sur le même réseau ». Pendant ce temps,
// FillSell continuait : republications, relevés, veille des commandes, sur les DEUX comptes.
//
// LA RÈGLE, tout le parc :
//   1. au PREMIER signe (« Accès temporairement restreint », HTTP 403 de Leboncoin, page anti-robot DataDome) vu par
//      une action ou une lecture Leboncoin du compte, le blocage est posé sur le COMPTE
//      (platform_settings.leboncoin.blocage_acces, via platform_settings_fusionner) ;
//   2. tant qu'il tient, le serveur ne sert PLUS RIEN de Leboncoin à ce compte (publications, republications,
//      retraits, relevés) et le dit aux extensions (blocages.leboncoin) pour qu'elles coupent aussi leurs lectures
//      (veille des commandes, relevé des ventes, liens, lectures de fond) — aucune relance en boucle ;
//   3. l'utilisateur est prévenu en clair, avec le nom de SON navigateur, et la détection des ventes Leboncoin n'est
//      jamais muette : le message dit qu'elle est en pause et ce que ça implique ;
//   4. UN essai au bout de 24 h (ou plus tôt, à la demande de la personne : « Leboncoin remarche ») : une seule action
//      Leboncoin, la plus ancienne. Refusée → blocage prolongé de 24 h. Passée → levée, puis REPRISE PRUDENTE 6 h :
//      une action Leboncoin toutes les 10 min au plus, jamais de rafale ;
//   5. une machine virtuelle (rendu graphique logiciel) ne fait jamais Leboncoin (_shared/poste-virtuel.js).
// Pur (Deno + Node).

export const CHEMIN_BLOCAGE_LBC = ["leboncoin", "blocage_acces"];
export const ESSAI_APRES_MS = 24 * 3600_000;
export const REPRISE_PRUDENTE_MS = 6 * 3600_000;
export const ESPACEMENT_REPRISE_MS = 10 * 60_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

// Ce que nos lecteurs et nos dépôts écrivent quand Leboncoin refuse l'accès (jamais une page de connexion : celle-là
// est une session fermée, son propre mur).
/** @type {Array<{ re: RegExp, nom: string }>} */
const SIGNES = [
  { re: /acc[eè]s temporairement restreint/i, nom: "acces_temporairement_restreint" },
  { re: /un robot est sur le m[eê]me r[ée]seau/i, nom: "robot_meme_reseau" },
  { re: /\bhttp[_ ]?403\b|\bHTTP 403\b|\bstatus(?:Code)?\W{0,3}403\b|\b403 Forbidden\b/i, nom: "http_403" },
  { re: /captcha-delivery|datadome/i, nom: "datadome" },
  { re: /v[ée]rification anti-?robot|CHALLENGE DATADOME|r[ée]soudre la v[ée]rification/i, nom: "verification_antirobot" },
];

/** Le signe de blocage d'un texte (erreur d'un job, motif d'une lecture), ou null.
 * @param {unknown} texte
 * @returns {string | null} */
export function signeBlocageLbc(texte) {
  const t = String(texte ?? "");
  if (!t) return null;
  for (const s of SIGNES) if (s.re.test(t)) return s.nom;
  return null;
}

/** Le blocage posé sur le compte (platform_settings), ou null. */
export function blocageLbc(ps) {
  const lbc = objet(objet(ps)?.leboncoin);
  return objet(lbc?.blocage_acces);
}

/**
 * L'état Leboncoin du compte à cet instant :
 *   « libre » | « bloque » (rien ne part) | « essai » (une seule action peut partir) | « reprise » (une action toutes
 *   les 10 min au plus).
 */
export function etatBlocageLbc(ps, maintenant = Date.now()) {
  const b = blocageLbc(ps);
  if (!b) return { etat: "libre", blocage: null };
  const leve = ms(b.leve_le);
  if (Number.isFinite(leve)) {
    if (maintenant - leve < REPRISE_PRUDENTE_MS) {
      const derniere = ms(b.derniere_action_reprise);
      const prete = !Number.isFinite(derniere) || maintenant - derniere >= ESPACEMENT_REPRISE_MS;
      return { etat: "reprise", blocage: b, prete };
    }
    return { etat: "libre", blocage: b };
  }
  const essai = objet(b.essai);
  if (essai && !essai.issue) {
    // Un essai déjà servi attend son résultat ; sans résultat au bout de 2 h, il compte pour un refus muet : le
    // prochain essai vient 24 h après lui.
    const le = ms(essai.le);
    if (Number.isFinite(le) && maintenant - le < 2 * 3600_000) return { etat: "bloque", blocage: b, essai_en_cours: true };
    const prochain = (Number.isFinite(le) ? le : maintenant) + ESSAI_APRES_MS;
    const demandeApres = ms(b.essai_demande_le);
    if (maintenant >= prochain || (Number.isFinite(demandeApres) && Number.isFinite(le) && demandeApres > le)) return { etat: "essai", blocage: b };
    return { etat: "bloque", blocage: b };
  }
  const essaiApres = ms(b.essai_apres) || (ms(b.depuis) + ESSAI_APRES_MS);
  const demande = ms(b.essai_demande_le);
  if ((Number.isFinite(essaiApres) && maintenant >= essaiApres) || (Number.isFinite(demande) && demande > (ms(b.derniere_preuve) || 0))) {
    return { etat: "essai", blocage: b };
  }
  return { etat: "bloque", blocage: b };
}

/** Le blocage après un signe vu (posé, ou prolongé de 24 h).
 * @param {any} ps
 * @param {{ signe: string, source: string, detail?: string | null, maintenant?: string }} o */
export function blocagePose(ps, { signe, source, detail = null, maintenant = new Date().toISOString() }) {
  const avant = blocageLbc(ps);
  const actif = avant && !avant.leve_le;
  return {
    depuis: actif ? avant.depuis : maintenant,
    derniere_preuve: maintenant,
    signe,
    source,
    ...(detail ? { detail: String(detail).slice(0, 240) } : {}),
    preuves: Math.min(99, (actif ? Number(avant.preuves) || 0 : 0) + 1),
    essai_apres: new Date(Date.parse(maintenant) + ESSAI_APRES_MS).toISOString(),
    ...(actif && avant.essais ? { essais: avant.essais } : {}),
  };
}

/** Le blocage après un essai réussi : levé, reprise prudente. */
export function blocageLeve(b, { par, maintenant = new Date().toISOString() }) {
  return { ...(objet(b) ?? {}), leve_le: maintenant, leve_par: par, essai: { ...(objet(b?.essai) ?? {}), issue: "passe", fin_le: maintenant } };
}

/** Le texte que voit la personne (job retenu, bandeau). `nav` : nom court sûr du navigateur, sinon null.
 * @param {string | null} [nav]
 * @param {string | null} [depuisIso] */
export function messageBlocageLbc(nav = null, depuisIso = null) {
  const dans = ["Chrome", "Brave", "Edge", "Opera"].includes(String(nav ?? "")) ? `dans ${nav}` : "dans ton navigateur";
  const t = ms(depuisIso);
  const quand = Number.isFinite(t)
    ? ` depuis le ${new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })} à ${new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}`
    : "";
  return `Leboncoin restreint l'accès depuis ta connexion${quand} (« Accès temporairement restreint ») : FillSell a mis en pause ` +
    "TOUTES ses actions Leboncoin sur ton compte — publications, republications, retraits, relevés et détection des ventes — " +
    "pour ne pas aggraver le blocage. Rien n'a été touché. Tant que la pause dure, une vente Leboncoin n'est pas vue par " +
    "FillSell et une annonce Leboncoin d'un article vendu ailleurs n'est pas retirée : fais-le toi-même sur Leboncoin. " +
    `Ouvre leboncoin.fr ${dans} : quand la page s'affiche normalement, appuie sur « Leboncoin remarche » dans FillSell ` +
    "(sinon FillSell fait lui-même un seul essai par jour), et la reprise se fera doucement.";
}

/** Le patch platform_settings d'un essai servi (une seule action). */
export function blocageAvecEssai(b, { jobId, maintenant = new Date().toISOString() }) {
  return { ...(objet(b) ?? {}), essai: { job_id: String(jobId), le: maintenant }, essais: Math.min(99, (Number(b?.essais) || 0) + 1) };
}

/** Le patch platform_settings d'un essai refusé : bloqué encore 24 h.
 * @param {any} b
 * @param {{ signe?: string | null, maintenant?: string }} o */
export function blocageEssaiRefuse(b, { signe, maintenant = new Date().toISOString() }) {
  return { ...(objet(b) ?? {}), derniere_preuve: maintenant, signe: signe ?? b?.signe ?? null,
    essai_apres: new Date(Date.parse(maintenant) + ESSAI_APRES_MS).toISOString(),
    essai: { ...(objet(b?.essai) ?? {}), issue: "refuse", fin_le: maintenant } };
}
