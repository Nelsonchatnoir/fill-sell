// ═══════════════════════════════════════════════════════════════════════════
// eBay (VOIE EXTENSION) : UN ASPECT OBLIGATOIRE VIDE AU DÉPÔT SE DÉDUIT AVANT
// D'ÊTRE DEMANDÉ (16/11/2026, lot du matin, point 1 — lizzaa, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ. lizzaa (d5531b8e), lot eBay du 15/11 23:07, voie
// extension : 7 jobs en « À compléter » pour « Type » (verres, cartouches),
// « Type, Couleur » (verres à shot) et « Département » (montre à gousset).
// L'IA des aspects (ebay_aspects_ia) avait tourné sur 37 articles du lot — pas
// sur ceux-là : la catégorie qui est PARTIE (259119, 16191, 3937) n'était pas
// celle que l'écran avait préparée. Au clic, la règle du 14/11 (A3, « jamais
// un clic mort ») les a « laissés au dépôt » (usage_logs champ_requis_bloquant
// issue laisse_au_depot, 23:08) : par l'API le serveur les remplit
// (ebay-api-worker → remplirAspects) ; par l'EXTENSION, personne — sa garde
// (ebay.js, « publication NON tentée ») les a demandés à la personne.
// Des valeurs que le titre donne pourtant : « Verre à shot », « Transparent ».
//
// LA RÈGLE (Nico) : on ne demande à la personne QUE ce qui est obligatoire ET
// impossible à déduire. Quand la garde de l'extension signale des aspects
// obligatoires vides (needs_user, cible ebayAspects), le serveur applique LA
// MÊME règle que la voie API — remplirAspects (_shared/ebay-publication.ts) :
// champs du job, genre → Département, texte de la personne, puis l'IA sous la
// contrainte de la liste eBay (jamais une valeur inventée : rien de déductible
// → rien). Tout est trouvé → le job repart seul (pending), la personne ne voit
// rien. Il en reste → la question ne porte plus QUE sur eux.
// ⛔ Une fois par job ET par rayon (platform_fields.ebay_aspects_depot) : jamais
//    de boucle. ⛔ Jamais par-dessus une valeur du job (personne, IA d'écran) :
//    seuls les aspects VIDES sont posés. ⛔ La Marque a sa règle (« sans
//    marque » de la liste, update-job-status) : jamais ici.
// Pur sauf `completerAspectsAuDepot` (l'IA, injectable pour les tests) —
// scripts/ebay-aspects-depot-selftest.ts.
import { remplirAspects, type AspectCatalogue, type PlatformFields } from "./ebay-publication.ts";
import type { ContexteArticle } from "./ebay-aspects-ia.ts";

export const MARQUE_ASPECTS_DEPOT = "ebay_aspects_depot";

const pfDe = (pf: unknown) => (pf && typeof pf === "object" ? pf as Record<string, unknown> : {});
const nettoyer = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Les aspects que l'extension dit vides sur le formulaire : le champ demandé
 * (needsUserField) et la liste du message (« sur le formulaire : A, B — »).
 * Sans doublon, dans l'ordre ; la Marque n'en fait jamais partie (sa règle).
 */
export function aspectsSignalesVides(brut: unknown, pf: unknown): string[] {
  const out: string[] = [];
  const ajouter = (n: unknown) => {
    const s = nettoyer(n);
    if (s && s.length <= 80 && s !== "Marque" && !out.includes(s)) out.push(s);
  };
  const nuf = pfDe(pfDe(pf).needsUserField);
  const cible = pfDe(nuf.target);
  if (String(nuf.platform ?? "") === "ebay" && (cible.root === "ebayAspects" || !nuf.target)) ajouter(nuf.field_key);
  const t = String(brut ?? "");
  const m = t.match(/aspect\(s\) obligatoire\(s\) eBay vide\(s\) sur le formulaire\s*:\s*([^—\n]+?)\s*(?:—|-\s|$)/i);
  if (m) for (const x of m[1].split(",")) ajouter(x);
  return out;
}

/**
 * Le job peut-il recevoir la règle ? Voie extension, eBay, aspect d'eBay
 * demandé, rayon connu, pas déjà fait pour CE rayon.
 * @returns le motif du refus, ou null quand la règle s'applique.
 */
export function refusAspectsDepot(job: { platform?: unknown; voie?: unknown }, pf: unknown, signales: string[]): string | null {
  if (String(job.platform ?? "") !== "ebay") return "pas_ebay";
  if (String(job.voie ?? "") === "api") return "voie_api";
  if (!signales.length) return "aucun_aspect_signale";
  const p = pfDe(pf);
  const cat = nettoyer(p.ebayCategoryId);
  if (!/^\d{1,12}$/.test(cat)) return "rayon_inconnu";
  const deja = pfDe(p[MARQUE_ASPECTS_DEPOT]);
  if (nettoyer(deja.categorie) === cat) return "deja_fait_pour_ce_rayon";
  return null;
}

export interface ResultatAspectsDepot {
  poses: Record<string, string>;
  restants: string[];
  sources: Record<string, string>;
  demandes: string[];
}

/**
 * Applique la règle de la voie API aux aspects signalés vides. `remplir` est
 * remplirAspects (injectable pour les tests, sans réseau).
 */
export async function completerAspectsAuDepot(a: {
  pf: Record<string, unknown>;
  catalogue: AspectCatalogue[];
  signales: string[];
  contexte: ContexteArticle;
  apiKey: string;
  remplir?: typeof remplirAspects;
}): Promise<ResultatAspectsDepot> {
  const remplir = a.remplir ?? remplirAspects;
  const requis = a.catalogue.filter((c) => c && c.required && c.name);
  // Un aspect que le FORMULAIRE exige sans que le référentiel le dise obligatoire
  // (ou absent du référentiel) : demandé quand même, en texte libre — c'est le
  // formulaire réel qui fait foi.
  for (const n of a.signales) {
    if (requis.some((c) => c.name === n)) continue;
    const connu = a.catalogue.find((c) => c.name === n);
    requis.push(connu ? { ...connu, required: true } : { name: n, required: true, mode: "FREE_TEXT", allowedValues: [] });
  }
  // Les valeurs déjà sur le job (personne, IA d'écran) ne sont jamais recouvertes :
  // remplirAspects part de pf.ebayAspects et ne comble que les vides.
  const r = await remplir(a.pf as PlatformFields, requis, a.contexte, a.apiKey);
  const aspectsJob = pfDe(a.pf.ebayAspects);
  const poses: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const n of a.signales) {
    if (nettoyer(aspectsJob[n])) continue; // déjà une valeur sur le job : le formulaire l'a refusée, on n'insiste pas
    const v = nettoyer(r.aspects[n]?.[0]);
    if (!v || v.toLowerCase() === "null") continue;
    poses[n] = v.slice(0, 65);
    sources[n] = String(r.sources?.[n] ?? "ia");
  }
  return { poses, restants: a.signales.filter((n) => !poses[n]), sources, demandes: requis.map((c) => c.name) };
}

/** Le contexte de l'article, tel que la voie API le donne à l'IA. */
export function contexteDuJobDepot(job: { title?: unknown; description?: unknown }, pf: Record<string, unknown>): ContexteArticle {
  const txt = (v: unknown) => (nettoyer(v) || null);
  const colors = Array.isArray(pf.colors) ? pf.colors : [];
  return {
    titre: txt(job.title), description: txt(job.description), marque: txt(pf.marque), modele: txt(pf.modele),
    matiere: txt(pf.matiere), couleur: txt(colors[0] ?? pf.couleur), taille: txt(pf.taille), genre: txt(pf.genre),
    type: txt(pf.categorie_objet_ia), attributs: null,
  };
}

/** Le message de la question qui reste : ce qui manque VRAIMENT, et seulement ça. */
export function messageAspectsRestants(restants: string[], poses: Record<string, string>): string {
  const deduits = Object.entries(poses).map(([k, v]) => `${k} : « ${v} »`).join(", ");
  return `eBay exige ${restants.map((n) => `« ${n} »`).join(", ")} pour cette catégorie, et ton annonce ne permet pas ` +
    `de le déduire : complète ${restants.length > 1 ? "ces champs" : "ce champ"} dans l'app (badge « À compléter » du Stock) ; ` +
    `la publication repartira ensuite toute seule.` + (deduits ? ` (Déjà rempli par FillSell : ${deduits}.)` : "");
}
