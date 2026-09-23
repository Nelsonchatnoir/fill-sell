// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UNE PLATEFORME POUR CET ARTICLE, ET LE GESTE QUI DÉBLOQUE
// (2026-09-23, capture de Louis 20:32 — « Déjà en ligne (ou en file) sur :
// Leboncoin, Opla. Retire d'abord cette annonce… ou décoche la plateforme. »)
// ═══════════════════════════════════════════════════════════════════════════
// Rien n'était en ligne : deux dépôts en ATTENTE — un champ (« Produit »),
// une autorisation (Opla). Le stepper ne lisait pas les jobs `needs_user`,
// la garde serveur les compte depuis le 23/09 : refus en bloc, message qui
// propose de retirer une annonce qui n'existe pas. Louis était coincé.
//
// Ici, une seule lecture des jobs de l'article rend, PAR PLATEFORME :
//   · en_ligne        → le dépôt est publié (verrou : « retire d'abord ») ;
//   · en_file         → pending / processing (verrou : on attend) ;
//   · attente_champ   → needs_user avec un champ nommé (verrou : « Compléter ») ;
//   · attente_autorisation → needs_user opla_acces (verrou : « Autoriser Opla ») ;
//   · attente_connexion    → needs_user connexion / eBay (verrou : « Me connecter ») ;
//   · attente         → autre needs_user (verrou : on dit qu'on attend) ;
//   · refusee         → le dernier dépôt est `failed` (PAS un verrou : on peut
//                       republier, et on le dit).
// `bloque` reflète exactement ce que refuse spend_coins_and_publish
// (migration 20260923000000) : pending, processing, needs_user, published.
// Les états « en_ligne » et « en_file » restent calculés par
// computeRemovalInfo (publicationState.js) — ce module ne juge que les
// attentes et les refus, pour ne rien changer à ce qui marchait.

const PUBLIE = new Set(["publish", "republish"]);
const CONNEXION_RE = /^Connexion\s+\S+\s+requise/i;
const REAUTH_RE = /^REAUTH VENTE eBay/i;

/** La nature d'un job needs_user, dans les mots de l'écran. */
export function natureAttente(job) {
  const pf = job?.platform_fields ?? {};
  const source = String(pf.needs_user_source ?? "");
  const err = String(job?.error ?? "");
  if (job?.platform === "opla" && source === "opla_acces") return { kind: "attente_autorisation", motif: "autoriser_opla" };
  if (source === "ebay_connexion_requise") return { kind: "attente_connexion", motif: "connexion" };
  if (job?.platform === "ebay" && REAUTH_RE.test(err)) return { kind: "attente_connexion", motif: "reauth_ebay" };
  if (source === "connexion" || CONNEXION_RE.test(err)) return { kind: "attente_connexion", motif: "connexion" };
  const champ = pf.needsUserField?.field_label
    || (Array.isArray(pf.needsUserFields) && pf.needsUserFields[0]?.field_label)
    || (Array.isArray(pf.champs_a_completer) && pf.champs_a_completer[0])
    || null;
  if (champ) return { kind: "attente_champ", champ: String(champ) };
  return { kind: "attente" };
}

/**
 * Les attentes et refus par plateforme, à partir des jobs de l'article.
 * Rend { [platform]: { kind, bloque, job, champ?, motif? } }.
 */
export function attentesParPlateforme(jobs) {
  const out = {};
  const parPf = new Map();
  for (const j of jobs ?? []) {
    if (!j || !PUBLIE.has(String(j.action ?? "publish"))) continue;
    if (!parPf.has(j.platform)) parPf.set(j.platform, []);
    parPf.get(j.platform).push(j);
  }
  for (const [platform, liste] of parPf) {
    const tri = [...liste].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    const attente = tri.find((j) => j.status === "needs_user");
    if (attente) {
      out[platform] = { ...natureAttente(attente), bloque: true, job: attente };
      continue;
    }
    const dernier = tri[0];
    if (dernier?.status === "failed") out[platform] = { kind: "refusee", bloque: false, job: dernier };
  }
  return out;
}

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla" };

/** La phrase d'état, courte, sous la rangée des plateformes. */
export function phraseEtat(platform, etat, lang = "fr") {
  const en = lang === "en";
  const nom = NOMS[platform] ?? platform;
  switch (etat?.kind) {
    case "attente_champ":
      return en ? `waiting for a field (${etat.champ})` : `en attente d'un champ (${etat.champ})`;
    case "attente_autorisation":
      return en ? "waiting for your Opla permission" : "en attente de ton autorisation Opla";
    case "attente_connexion":
      return en ? `waiting for you to sign in to ${nom}` : `en attente de ta connexion à ${nom}`;
    case "attente":
      return en ? "a publication is waiting" : "une publication est en attente";
    case "refusee":
      return en ? "last publication refused — you can publish again" : "dernière publication refusée — tu peux republier";
    default:
      return "";
  }
}

/**
 * Le message du refus serveur `already_published`, plateforme par plateforme,
 * avec le geste qui débloque — jamais « retire » ni « décoche » pour une
 * attente.
 */
export function messageRefusPublication(platforms, { publiees = new Set(), enFile = new Set(), attentes = {}, lang = "fr" } = {}) {
  const en = lang === "en";
  const lignes = [];
  for (const p of platforms) {
    const nom = NOMS[p] ?? p;
    const a = attentes[p];
    if (a?.bloque) {
      if (a.kind === "attente_champ") lignes.push(en ? `${nom}: a publication is waiting for “${a.champ}” — complete it from the item card, it will go out on its own.` : `${nom} : une publication attend « ${a.champ} » — complète-le depuis la carte de l'article, elle partira toute seule.`);
      else if (a.kind === "attente_autorisation") lignes.push(en ? `${nom}: a publication is waiting for your permission — tap “Autoriser Opla”, it will go out on its own.` : `${nom} : une publication attend ton autorisation — appuie sur « Autoriser Opla », elle partira toute seule.`);
      else if (a.kind === "attente_connexion") lignes.push(en ? `${nom}: a publication is waiting for you to sign in — tap “Sign in”, it will go out on its own.` : `${nom} : une publication attend ta connexion — appuie sur « Me connecter », elle partira toute seule.`);
      else lignes.push(en ? `${nom}: a publication is already waiting — nothing to redo.` : `${nom} : une publication est déjà en attente — rien à refaire.`);
    } else if (enFile.has(p)) {
      lignes.push(en ? `${nom}: a publication is already under way — nothing to redo.` : `${nom} : une publication est déjà en cours — rien à refaire.`);
    } else if (publiees.has(p)) {
      lignes.push(en ? `${nom}: already online — remove that listing first (tap the platform logo on the item card).` : `${nom} : déjà en ligne — retire d'abord cette annonce (tap sur le logo de la plateforme sur la carte de l'article).`);
    } else {
      lignes.push(en ? `${nom}: already online or queued.` : `${nom} : déjà en ligne ou en file.`);
    }
  }
  const suite = en ? "These platforms were left out; the others can be published." : "Ces plateformes sont laissées de côté ; les autres peuvent partir.";
  return `${lignes.join(" ")} ${suite}`;
}
