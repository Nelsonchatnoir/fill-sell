// ═══════════════════════════════════════════════════════════════════════════
// eBay — aspects manquants remplis par l'IA SOUS CONTRAINTE de la liste eBay
// (06/09/2026, lot 2 « aspects automatiques »). Partagé par generate-listing
// (mode resolve_aspects, voie formulaire) et ebay-api-worker (voie API) :
// UNE règle, deux appelants.
//
// Ce que la phase 0 a montré (relevé sur 15687/15689/11484/155183) :
//   · SELECTION_ONLY (Département, Type de taille, Vintage, Genre livre…) :
//     eBay REFUSE une valeur hors liste → la liste est imposée au modèle ET
//     contrôlée exactement au retour (texteComparable) ; hors liste = absent ;
//   · FREE_TEXT à liste courte (Couleur 17, Style 5-9, Type 1-2, Taille 33-59,
//     Matière 85…) : la liste est une SUGGESTION, le texte libre est accepté
//     mais réduit la visibilité → liste proposée, réponse recalée sur l'entrée
//     de la liste quand elle correspond, sinon gardée telle quelle ;
//   · Marque (13 000-19 000 valeurs) : JAMAIS de liste au modèle — il
//     choisirait une marque plausible au lieu de lire (doctrine marques
//     fantômes Vinted/Beebs) ; recalage après coup sur la liste complète ;
//   · MPN : défaut déterministe « Ne s'applique pas », pas d'IA.
// RÈGLE ABSOLUE transmise au modèle : ne jamais inventer — lisible ou
// strictement déductible du contexte, sinon null.
// ═══════════════════════════════════════════════════════════════════════════
import { valeurDeListeCorrespondante } from "./texte-comparable.ts";
// (18/10 nuit, point 5) La question passe par le cache quand il est allumé
// (coin_config ia_cache_aspects) — même texte rendu, mêmes contrôles ici.
import { questionClaude } from "./claude-cache.ts";
// (25/10, N5) La taille : la règle des tailles et la taille unique du vendeur.
import { tailleDeService, brancheDeTaille } from "./taille-de-service.js";
import { tailleUniqueDuVendeur, estTailleUniqueEcrite } from "./taille-du-texte.js";

// libre : true = 2e passe de la voie API (remplirAspects) ; "titre" = 2e passe
// de la voie formulaire (completerAspectsIA) : un aspect par appel, le mot
// recopié du texte, contrôlé ensuite (valeurLueDansLeContexte).
export interface AspectDemande { name: string; mode: string; allowedValues: string[]; libre?: boolean | "titre"; }
export interface ContexteArticle {
  titre?: string | null; description?: string | null; marque?: string | null; modele?: string | null;
  matiere?: string | null; couleur?: string | null; taille?: string | null; genre?: string | null;
  type?: string | null; attributs?: Record<string, unknown> | null;
}
export interface ResultatAspectsIA {
  aspects: Record<string, string>;
  refuses: Array<{ name: string; valeur: string; motif: string }>;
  demandes: number;
  appel_ia: boolean;
}

export const ASPECT_DEFAULTS: Record<string, string> = {
  "Numéro de pièce fabricant": "Ne s'applique pas",
};

const LISTE_COURTE_MAX = 60;   // FREE_TEXT : au-delà, on ne propose plus la liste
const LISTE_FERMEE_MAX = 120;  // SELECTION_ONLY : borne de sécurité du prompt
const VALEUR_MAX = 65;         // limite eBay d'une valeur d'aspect

// ═══════════════════════════════════════════════════════════════════════════
// UNE TAILLE EST UNE LISTE FERMÉE POUR L'IA (25/10, N5)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : 24 « Taille » fausses en 30 jours (usage_logs
// ebay_aspects_ia, du 11/10 au 24/10), toutes posées par la SECONDE passe (« le
// mot RECOPIÉ du titre ») : « Classic Fit », « Col rond », « Jupe courte »,
// « Veste de ski », « Parka », « Gants de ski enfant »… Un mot du titre, jamais
// une taille — et la seule garde (valeurLueDansLeContexte) les laissait passer :
// ils SONT dans le titre. Taxonomy déclare « Taille » en texte libre, mais eBay
// refuse le hors-liste (refus 25129 → question : jobs 98f71143, 1ff48d68,
// 8d831cf5, c65b3e36, 12854dbb — trois fois la fiche portait déjà la bonne
// taille) ; et quand il l'accepte, l'annonce est fausse (820227542038, job
// 9f678d8b : Taille « Gants de ski enfant », fiche M).
// LA RÈGLE, pour un aspect de taille (nom EXACT : « Taille », « Pointure »,
// « Pointure EU/UK/US/AU » — jamais « Type de taille », « Tour de taille »,
// « Taille d'écran ») :
//   · il ne passe JAMAIS par une seconde passe (completerAspectsIA, la question
//     groupée, remplirAspects d'ebay-publication.ts) ;
//   · il est demandé comme une LISTE FERMÉE, et seulement avec sa liste (sans
//     liste, rien ne permet de juger la réponse : il n'est pas demandé) ;
//   · une réponse n'est retenue que si la liste l'écrit (valeurDeListeCorrespondante,
//     le préfixe EU/FR que la liste n'écrit pas) ou que la règle des tailles l'y
//     place (tailleDeService) ; sinon elle est refusée, motif tracé, et la
//     question part, avec la liste ;
//   · « Taille unique » seulement si la fiche ou son texte le disent
//     (tailleUniqueDuVendeur) — jamais l'option « par défaut » d'une liste.
export const ASPECT_TAILLE_RE = /^(?:Taille|Pointure(?: EU| UK| US| AU)?)$/;
export function estAspectDeTaille(nom: unknown): boolean {
  return ASPECT_TAILLE_RE.test(String(nom ?? ""));
}
// ── TAILLE « EU 42 » / « FR 42 » : LE PRÉFIXE QUE LA LISTE eBay N'ÉCRIT PAS
// (2026-10-01, tessy.galy d07f4c9e, robe D&G, catégorie 63861) ─────────────
// La liste eBay.fr relevée écrit les tailles françaises SANS préfixe (« 32 » …
// « 62 ») et les autres pays AVEC (« IT 42 », « UK 10 », « US 8 ») : « EU 42 »
// a été refusée (25129), alors que « 42 » y est. Seuls EU et FR se retirent :
// c'est l'écriture nue de la liste. UK/US/IT ne se retirent JAMAIS (« UK 10 »
// sans préfixe deviendrait le 10 français : une autre taille) — ils passent
// déjà tels quels quand la liste les porte. Appelée seulement quand la valeur
// ne correspond PAS telle quelle : une taille acceptée aujourd'hui ne change pas.
// (25/10, N5) Déplacée ici depuis ebay-publication.ts (qui la réexporte, même
// corps) : la réponse de l'IA sur une taille passe par la même lecture.
const PREFIXE_EU_FR_RE = /^(?:EU|FR) ?(\d{1,3}(?:[.,]\d)?)$/i;
export function tailleSansPrefixeEuFr(nomAspect: string, brut: string, liste: string[]): string | null {
  if (!/taille|pointure/i.test(nomAspect)) return null;
  const m = PREFIXE_EU_FR_RE.exec(String(brut ?? "").replace(/\s+/g, " ").trim());
  return m ? valeurDeListeCorrespondante(m[1], liste) : null;
}
/**
 * (25/10, N5) Une valeur de taille qui n'est NI la réponse de la personne NI la
 * taille de la fiche (réponse de l'IA, aspect posé par l'app) : l'entrée de la
 * liste eBay qu'elle désigne, ou le motif du refus. `fiche` : la taille de la
 * fiche et ses textes (titre, description) — seuls juges d'une « Taille unique » —
 * et la branche (femme / homme / enfant) de la règle des tailles.
 */
export function tailleRetenueDansLaListe(
  nomAspect: string, valeur: unknown, liste: string[],
  fiche: { taille?: unknown; textes?: unknown[]; branche?: string | null } = {},
): { valeur: string } | { refus: string } {
  const s = String(valeur ?? "").trim();
  if (!s) return { refus: "réponse vide" };
  if (!liste.length) return { refus: "taille sans liste eBay" };
  const entree = valeurDeListeCorrespondante(s, liste)
    ?? tailleSansPrefixeEuFr(nomAspect, s, liste)
    ?? (tailleDeService(s, liste, { branche: fiche.branche ?? null })?.valeur ?? null);
  if (!entree) return { refus: "taille hors de la liste eBay" };
  if (estTailleUniqueEcrite(entree)) {
    const u = tailleUniqueDuVendeur({ valeur: String(fiche.taille ?? ""), textes: (fiche.textes ?? []).map((t) => String(t ?? "")), opts: liste });
    if (!u || !("valeur" in u) || u.valeur !== entree) return { refus: "« Taille unique » que la fiche ne dit pas" };
  }
  return { valeur: entree };
}

export function contexteEnTexte(c: ContexteArticle): string {
  return [
    c.marque && `Marque: ${c.marque}`,
    c.titre && `Article: ${c.titre}`,
    c.modele && `Modèle: ${c.modele}`,
    c.matiere && `Matière: ${c.matiere}`,
    c.couleur && `Couleur: ${c.couleur}`,
    c.taille && `Taille: ${c.taille}`,
    c.genre && `Rayon: ${c.genre}`,
    c.type && `Type: ${c.type}`,
    c.description && `Description: ${String(c.description).slice(0, 1500)}`,
    c.attributs && typeof c.attributs === "object" && Object.keys(c.attributs).length &&
      `Attributs lus sur l'article (photos): ${JSON.stringify(c.attributs).slice(0, 800)}`,
  ].filter(Boolean).join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// LES LEVIERS DU CHANTIER « ZÉRO FRICTION » (18/10) — options, défaut INCHANGÉ
// ═══════════════════════════════════════════════════════════════════════════
// Sans option, resoudreAspectsIA pose EXACTEMENT la même question qu'avant
// (Haiku 4.5, texte seul, liste fermée bornée à 120). Les options ne servent
// qu'aux leviers mesurés sur le banc (scripts/bancs/zero-friction/) et branchés
// champ par champ par la bascule (ia_leviers_bascule, generate-listing) :
//   · modele        : "claude-haiku-5-5" / "claude-sonnet-5-5" (sans température,
//                     réflexion coupée, effort bas : une classification) ;
//   · images        : 1 à 2 photos de l'article (la valeur peut se LIRE dessus) ;
//   · listeFermeeMax: la liste fermée entière (200) — Bricolage Leboncoin a 147
//                     paires « Type › Produit » : les 27 dernières n'étaient
//                     jamais proposées au modèle (bornées à 120).
export const MODELE_ASPECTS_DEFAUT = "claude-haiku-4-5-20251001";
// deno-lint-ignore no-explicit-any
type SourceImageIA = any;
export function corpsModele(modele: string): Record<string, unknown> {
  if (/^claude-haiku-5-5$/.test(modele)) return { thinking: { type: "disabled" }, output_config: { effort: "low" } };
  if (/^claude-sonnet-5-5$/.test(modele)) return { thinking: { type: "between_tools" }, output_config: { effort: "low" } };
  return {};
}

function ligneDemande(a: AspectDemande, listeFermeeMax = LISTE_FERMEE_MAX): string {
  const liste = a.allowedValues ?? [];
  // (25/10, N5) Une taille : la liste fermée, quel que soit le mode Taxonomy, et
  // jamais un autre mot du titre (« Classic Fit », « Col rond », « Parka »).
  if (estAspectDeTaille(a.name)) {
    return `- "${a.name}" — LISTE FERMÉE (une TAILLE), réponds UNIQUEMENT par une de ces valeurs recopiée caractère pour caractère, et seulement si la taille de l'article est écrite dans le contexte ; jamais un autre mot du titre (coupe, col, modèle, type d'article : « Classic Fit », « Col rond », « Parka » ne sont pas des tailles), sinon null : ${liste.slice(0, listeFermeeMax).join(" | ")}`;
  }
  if (a.mode === "SELECTION_ONLY") {
    return `- "${a.name}" — LISTE FERMÉE, réponds UNIQUEMENT par une de ces valeurs recopiée caractère pour caractère (apostrophes, accents, espaces compris), sinon null : ${liste.slice(0, listeFermeeMax).join(" | ")}`;
  }
  if (a.name === "Marque") return `- "Marque" — texte libre : la marque telle qu'elle est écrite dans le contexte, sinon null (jamais une marque plausible)`;
  // (10/10, cas Manon) Seconde passe de la voie formulaire, UN aspect par appel :
  // demandés ensemble, « Type » et « Style » d'un « Pull polaire 1/4 zip »
  // revenaient avec Type seul (le modèle évite de répéter un mot du titre).
  if (a.libre === "titre") return `- "${a.name}" — texte libre court (1 à 4 mots), RECOPIÉ du titre ou de la description : le mot ou le groupe de mots qui dit ce « ${a.name} » de l'article (ex. pour un Style : « Polaire », « 1/4 zip », « Col roulé », « Oversize » ; pour un Type : « Pull polaire », « Sweat », « Robe longue »). Un mot déjà utilisé pour un autre aspect peut resservir. null seulement si le texte ne dit rien qui s'en approche`;
  // 2e passe (aspect FREE_TEXT resté vide après la liste) : eBay accepte le
  // texte libre — on demande le terme EXACT du contexte, sans liste.
  if (a.libre) return `- "${a.name}" — texte libre court (1 à 4 mots) : le terme EXACT qui décrit cet aspect dans le contexte (ex. le type ou le style d'article tel qu'écrit dans le titre : « Short de bain », « Sweat », « Robe longue ») ; null seulement si le contexte ne dit rien`;
  if (liste.length && liste.length <= LISTE_COURTE_MAX) {
    return `- "${a.name}" — valeurs eBay suggérées (préfère l'une d'elles, recopiée caractère pour caractère ; si AUCUNE ne correspond mais que le contexte le dit, réponds par le terme exact du contexte plutôt que null ; null seulement si rien n'est déductible) : ${liste.join(" | ")}`;
  }
  return `- "${a.name}" — texte libre, uniquement si lisible ou strictement déductible du contexte, sinon null`;
}

// (25/09) Les aspects qui portent une MESURE : une valeur n'y vaut que si ses
// nombres se lisent dans le contexte (cf. resoudreAspectsIA).
// (18/10, eBay ÷ 5) Sur le NOM EXACT, plus sur son début — même règle que
// estDimensionEbay (src/publication/moteur/regles.js) : « Longueur de la
// robe », « Longueur des manches », « Hauteur du talon », « Largeur de
// ceinture » sont des STYLES à liste de mots (Au genou / Midi, Plat, Skinny…),
// jamais des mesures. Le préfixe jetait la réponse de l'IA sur « Longueur de la
// robe » (« mesure absente du contexte ») : 19 refus en 30 jours, 9 articles,
// 4 comptes, autant de questions. Restent des mesures : les dimensions nues
// (avec un qualificatif entre parenthèses : « Hauteur (intérieur) »,
// « Dimensions (cm) »), Volume, Contenance, et les tours de taille, poitrine,
// hanches.
export const ASPECT_MESURE_RE = /^(?:hauteur|largeur|longueur|profondeur|diam[eè]tre|[ée]paisseur|dimensions?|volume|contenance|tour de (?:taille|poitrine|hanches?|cou|t[êe]te))(?:\s*\([^)]*\))?$/i;
export function mesureLueDansLeContexte(valeur: string, contexteTexte: string): boolean {
  const nombres = String(valeur ?? "").match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (!nombres.length) return false; // une mesure sans nombre n'est pas une mesure lue
  const texte = String(contexteTexte ?? "").replace(/(\d),(\d)/g, "$1.$2");
  return nombres.every((n) => {
    const motif = n.replace(",", ".").replace(/\./g, "\\.");
    return new RegExp(`(^|[^0-9.])${motif}([^0-9]|$)`).test(texte);
  });
}

export async function resoudreAspectsIA(
  demandes: AspectDemande[],
  contexte: ContexteArticle,
  // deno-lint-ignore no-explicit-any
  opts: { apiKey: string; onUsage?: (data: unknown) => void; maxTokens?: number; admin?: any; fetchFn?: typeof fetch; forcerCache?: boolean;
    modele?: string; images?: SourceImageIA[]; listeFermeeMax?: number },
): Promise<ResultatAspectsIA> {
  const out: Record<string, string> = {};
  const refuses: ResultatAspectsIA["refuses"] = [];
  const propres = demandes.filter((d) => d && typeof d.name === "string" && d.name.trim()).slice(0, 14);
  for (const d of propres) if (ASPECT_DEFAULTS[d.name]) out[d.name] = ASPECT_DEFAULTS[d.name];
  // (25/10, N5) Une taille sans sa liste n'est pas demandée : rien ne jugerait la réponse.
  const aDemander = propres.filter((d) => !ASPECT_DEFAULTS[d.name] && !(estAspectDeTaille(d.name) && !(d.allowedValues ?? []).length));
  const ctx = contexteEnTexte(contexte);
  if (!aDemander.length || !ctx || !opts.apiKey) return { aspects: out, refuses, demandes: propres.length, appel_ia: false };

  const lignes = aDemander.map((a) => ligneDemande(a, opts.listeFermeeMax ?? LISTE_FERMEE_MAX)).join("\n");
  const modele = opts.modele ?? MODELE_ASPECTS_DEFAUT;
  const images = Array.isArray(opts.images) ? opts.images.slice(0, 2) : [];
  // (18/10, zéro friction) Les photos jointes : une valeur peut aussi se LIRE
  // dessus (objet, public, âge écrit sur la boîte) — jamais se deviner.
  const avecPhotos = images.length
    ? ` Les photos de l'article sont jointes : une valeur peut aussi se LIRE sur une photo (l'objet lui-même, une mention écrite, un âge indiqué sur la boîte) — jamais se deviner d'une impression.`
    : "";
  const question = `Aspects à renseigner :\n${lignes}\n\nContexte article :\n${ctx}`;
  let texte = "";
  try {
    const q = await questionClaude({
        model: modele,
        max_tokens: opts.maxTokens ?? 500,
        ...corpsModele(modele),
        system:
          `Tu renseignes des caractéristiques produit eBay (« aspects ») pour une annonce d'occasion, à partir du contexte fourni. RÈGLE ABSOLUE : ne JAMAIS inventer — une valeur doit être lisible ou strictement déductible du contexte (titre, description, marque, attributs lus sur les photos), sinon null. ` +
          `Pour une LISTE FERMÉE, la réponse est une entrée de la liste recopiée à l'identique, ou null. Pour une liste suggérée, préfère une entrée de la liste quand elle correspond au contexte ; sinon un texte libre court, ou null. ` +
          `Cas particuliers : "Volume" au format eBay ("50 ml", jamais "50ml") ; dimensions (Hauteur/Largeur/Longueur/Dimensions) UNIQUEMENT si des mesures chiffrées figurent dans le contexte, avec l'unité ("80 cm") ; "Département" = le rayon (Femme/Homme/Fille/Garçon…) déduit du contexte ou du champ Rayon. ` +
          `Retourne UNIQUEMENT du JSON valide : {"aspects":{"<nom exact de l'aspect>":"valeur ou null"}}` + avecPhotos,
        messages: [{ role: "user", content: images.length
          ? [...images.map((source) => ({ type: "image", source })), { type: "text", text: question }]
          : question }],
      }, { apiKey: opts.apiKey, admin: opts.admin, fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: opts.fetchFn, forcer: opts.forcerCache });
    if (!q.ok) {
      console.error("[ebay-aspects-ia] Anthropic :", q.statut, q.erreur ?? "");
      return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
    }
    // Une réponse relue du cache n'a rien coûté : aucun usage compté.
    if (q.data) opts.onUsage?.(q.data);
    texte = q.texte;
  } catch (e) {
    console.error("[ebay-aspects-ia] exception :", (e as Error)?.message ?? e);
    return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
  }

  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
  let brut: Record<string, unknown> = {};
  try { brut = (JSON.parse(m[0])?.aspects ?? {}) as Record<string, unknown>; } catch { brut = {}; }

  const parNom = new Map(aDemander.map((d) => [d.name, d]));
  const branche = brancheDeTaille(String(contexte.genre ?? ""), typeof brut["Département"] === "string" ? brut["Département"] : "");
  for (const [nom, v] of Object.entries(brut)) {
    const d = parNom.get(nom);
    if (!d) continue; // jamais une clé non demandée
    const s = typeof v === "string" ? v.trim().slice(0, VALEUR_MAX) : "";
    if (!s || s.toLowerCase() === "null") continue;
    // (25/10, N5) Une taille : l'entrée de la liste eBay, sinon refusée (tailleRetenueDansLaListe).
    if (estAspectDeTaille(nom)) {
      const t = tailleRetenueDansLaListe(nom, s, d.allowedValues ?? [], { taille: contexte.taille, textes: [contexte.titre, contexte.description], branche });
      if ("valeur" in t) out[nom] = t.valeur;
      else refuses.push({ name: nom, valeur: s, motif: t.refus });
      continue;
    }
    // ── UNE MESURE NE S'INVENTE PAS : LA GARDE, PAS SEULEMENT LA CONSIGNE ──
    // (25/09, audit du check de nuit) Voie API eBay, job 97807314 : Hauteur
    // « 9" », Largeur « 20 cm », Longueur « 15 cm » posées par l'IA — les
    // premières valeurs SUGGÉRÉES par eBay, aucune mesure dans le texte —
    // l'annonce est partie en ligne avec. La consigne le lui interdisait
    // déjà ; elle n'était pas une garde. Une mesure n'est retenue que si
    // CHACUN de ses nombres figure dans le contexte (titre, description,
    // attributs lus) ; sinon rien n'est posé et la question revient à la
    // personne — jamais une valeur inventée.
    if (ASPECT_MESURE_RE.test(nom) && !mesureLueDansLeContexte(s, ctx)) {
      refuses.push({ name: nom, valeur: s, motif: "mesure absente du contexte" });
      continue;
    }
    const liste = d.allowedValues ?? [];
    const recale = liste.length ? valeurDeListeCorrespondante(s, liste) : null;
    if (d.mode === "SELECTION_ONLY") {
      if (recale) out[nom] = recale;
      else refuses.push({ name: nom, valeur: s, motif: "hors liste fermée" });
    } else {
      out[nom] = recale ?? s;
    }
  }
  return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// LA SECONDE PASSE, AUSSI POUR LE FORMULAIRE (10/10/2026, cas Manon Simon)
// ═══════════════════════════════════════════════════════════════════════════
// Publication en lot de quatre vêtements importés de Vinted (polaires et gilet)
// vers eBay, catégorie 63862 « Manteaux, vestes » : « Style » demandé sur trois
// articles, « Type » sur un — tous FREE_TEXT, et aucune des 17 entrées de la
// liste eBay de « Style » (Anorak, Bombers, Caban, Parka, Trench…) ne décrit
// une polaire. La première passe, fidèle à « ne jamais inventer », a rendu
// null ; l'écran a posé la question ; la personne a quitté eBay.
// La voie API, elle, ne se serait pas arrêtée là : remplirAspects
// (ebay-publication.ts) relance depuis le 06/09 une SECONDE passe sur les
// aspects FREE_TEXT restés vides — « le terme exact du contexte ». La voie
// formulaire (stepper, lot : generate-listing resolve_aspects) ne l'avait pas.
// Même article, même catégorie : rempli par l'API, demandé par l'extension.
// UNE règle, deux appelants — c'est ce que dit l'en-tête de ce module.
//
// ⛔ LA PREMIÈRE PASSE NE CHANGE PAS : une valeur qu'elle rend aujourd'hui est
//    rendue demain, à l'identique. La seconde ne touche QUE ce qu'elle a
//    laissé vide — là où, sans elle, une question part chez la personne.
// ⛔ CE QUE LA SECONDE PASSE A LE DROIT DE POSER :
//    · une entrée de la liste eBay (recopiée telle quelle), toujours ;
//    · sinon, sur un aspect qu'eBay déclare FREE_TEXT (il accepte une valeur
//      hors de ses suggestions, le formulaire la valide par Entrée — doctrine
//      du 30/07 dans ebay.js), le mot LU dans le contexte : chaque mot de la
//      valeur figure dans le titre, la description ou les attributs lus.
//      Une valeur que le texte ne porte pas est refusée (motif tracé) — la
//      question part, avec la liste.
//    · JAMAIS sur un SELECTION_ONLY (liste imposée par eBay), jamais la
//      Marque (référentiel, doctrine des marques fantômes).
//    · (25/10, N5) JAMAIS sur une taille (estAspectDeTaille) : « le mot recopié
//      du titre » y a posé « Classic Fit », « Col rond », « Parka » — une taille
//      est une liste fermée (première passe seule, entrée de la liste).

// Petits mots qui ne portent rien : une valeur ne se juge pas sur eux.
const MOTS_VIDES_LECTURE = new Set([
  "a", "au", "aux", "de", "du", "des", "d", "la", "le", "les", "l", "en", "et", "ou",
  "pour", "avec", "sans", "un", "une", "sur", "par", "the", "of", "and", "for", "with",
]);

function motsLecture(s: unknown): string[] {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// Singulier / pluriel seulement (« polaires » = « polaire », « manteaux » =
// « manteau ») — jamais une racine plus courte : « pull » n'est pas « pullover ».
function formesLecture(mot: string): string[] {
  const f = [mot];
  if (mot.length > 3) {
    if (/eaux$/.test(mot)) f.push(mot.slice(0, -1));
    if (/aux$/.test(mot)) f.push(`${mot.slice(0, -3)}al`);
    if (/[sx]$/.test(mot)) f.push(mot.slice(0, -1));
  }
  return f;
}

/**
 * Chaque mot porteur de la valeur se lit-il dans le contexte ? (« Polaire »
 * dans « Veste polaire Champion | Full zip » : oui ; « Manteau basique » : non.)
 * Une valeur sans mot porteur n'est jamais « lue ».
 */
export function valeurLueDansLeContexte(valeur: unknown, contexteTexte: unknown): boolean {
  const porteurs = motsLecture(valeur).filter((m) => !MOTS_VIDES_LECTURE.has(m));
  if (!porteurs.length) return false;
  const lus = new Set<string>();
  for (const m of motsLecture(contexteTexte)) for (const f of formesLecture(m)) lus.add(f);
  return porteurs.every((m) => formesLecture(m).some((f) => lus.has(f)));
}

export interface ResultatCompletion extends ResultatAspectsIA {
  /** Les aspects posés par la SECONDE passe (absents de la première). */
  seconde_passe: string[];
}

/**
 * Première passe (inchangée), puis seconde passe sur les aspects FREE_TEXT
 * qu'elle a laissés vides — même règle que la voie API (remplirAspects).
 */
export async function completerAspectsIA(
  demandes: AspectDemande[],
  contexte: ContexteArticle,
  // deno-lint-ignore no-explicit-any
  opts: { apiKey: string; onUsage?: (data: unknown) => void; maxTokens?: number; admin?: any; fetchFn?: typeof fetch; forcerCache?: boolean;
    modele?: string; images?: SourceImageIA[]; listeFermeeMax?: number },
): Promise<ResultatCompletion> {
  const premiere = await resoudreAspectsIA(demandes, contexte, opts);
  const restants = demandes.filter((d) =>
    d && typeof d.name === "string" && d.mode === "FREE_TEXT" && d.name !== "Marque" && !estAspectDeTaille(d.name)
    && !ASPECT_DEFAULTS[d.name] && !String(premiere.aspects[d.name] ?? "").trim());
  if (!restants.length || !premiere.appel_ia) return { ...premiere, seconde_passe: [] };
  // Un appel PAR aspect, en parallèle (même durée qu'un seul appel).
  const secondes = await Promise.all(restants.map((d) => resoudreAspectsIA([{ ...d, libre: "titre" }], contexte, opts)));
  const ctx = contexteEnTexte(contexte);
  const aspects = { ...premiere.aspects };
  const refuses = [...premiere.refuses, ...secondes.flatMap((s) => s.refuses)];
  const posees: string[] = [];
  for (const [i, d] of restants.entries()) {
    const v = String(secondes[i].aspects[d.name] ?? "").trim();
    if (!v) continue;
    const dansLaListe = (d.allowedValues ?? []).length ? valeurDeListeCorrespondante(v, d.allowedValues) : null;
    if (dansLaListe) { aspects[d.name] = dansLaListe; posees.push(d.name); continue; }
    if (!valeurLueDansLeContexte(v, ctx)) {
      refuses.push({ name: d.name, valeur: v, motif: "hors liste et absent du texte" });
      continue;
    }
    aspects[d.name] = v;
    posees.push(d.name);
  }
  return { aspects, refuses, demandes: premiere.demandes, appel_ia: true, seconde_passe: posees };
}

// ═══════════════════════════════════════════════════════════════════════════
// UN SEUL APPEL PAR ARTICLE POUR TOUS SES ASPECTS (18/10 nuit, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// completerAspectsIA fait une première passe (tous les aspects), puis UN appel
// PAR aspect FREE_TEXT resté vide (mesuré sur 7 j : 248 appels pour 156
// demandes, 43 % avec seconde passe). Ici, les deux passes en UNE question :
// chaque aspect FREE_TEXT y porte À LA FOIS la liste suggérée et la consigne de
// la seconde passe (le mot RECOPIÉ du titre, un mot pouvant resservir — la
// leçon du cas Manon, 10/10 : demandés ensemble sans cette phrase, « Type » et
// « Style » d'un « Pull polaire 1/4 zip » revenaient avec Type seul).
// CONTRÔLES IDENTIQUES à l'ancien chemin, aspect par aspect :
//   · SELECTION_ONLY : entrée de la liste, sinon refusé ;
//   · mesure : chacun de ses nombres se lit dans le contexte, sinon refusée ;
//   · FREE_TEXT : entrée de la liste quand elle correspond ; sinon le mot doit
//     se LIRE dans le contexte (règle de la seconde passe), sinon refusé ;
//   · Marque : texte libre, jamais de liste ; défauts déterministes d'abord.
// Interrupteur coin_config ia_aspects_groupes (generate-listing) : éteint tant
// que la comparaison ancien / nouveau sur de vrais articles n'est pas faite.
function ligneDemandeGroupee(a: AspectDemande): string {
  const liste = a.allowedValues ?? [];
  // (25/10, N5) Une taille : la liste fermée, jamais « le mot recopié du titre ».
  if (a.mode === "SELECTION_ONLY" || a.name === "Marque" || estAspectDeTaille(a.name)) return ligneDemande(a);
  const recopie = `sinon le mot ou groupe de mots (1 à 4 mots) RECOPIÉ du titre ou de la description qui dit ce « ${a.name} » de l'article (ex. pour un Style : « Polaire », « 1/4 zip », « Col roulé » ; pour un Type : « Pull polaire », « Sweat », « Robe longue ») — un mot déjà utilisé pour un autre aspect peut resservir ; null seulement si le texte ne dit rien qui s'en approche`;
  if (liste.length && liste.length <= LISTE_COURTE_MAX) {
    return `- "${a.name}" — valeurs eBay suggérées (préfère l'une d'elles, recopiée caractère pour caractère, quand elle correspond au contexte) : ${liste.join(" | ")} ; ${recopie}`;
  }
  return `- "${a.name}" — texte libre court : ${recopie}`;
}

export async function completerAspectsIAGroupe(
  demandes: AspectDemande[],
  contexte: ContexteArticle,
  // deno-lint-ignore no-explicit-any
  opts: { apiKey: string; onUsage?: (data: unknown) => void; maxTokens?: number; admin?: any; fetchFn?: typeof fetch; forcerCache?: boolean },
): Promise<ResultatCompletion> {
  const out: Record<string, string> = {};
  const refuses: ResultatAspectsIA["refuses"] = [];
  const propres = demandes.filter((d) => d && typeof d.name === "string" && d.name.trim()).slice(0, 14);
  for (const d of propres) if (ASPECT_DEFAULTS[d.name]) out[d.name] = ASPECT_DEFAULTS[d.name];
  // (25/10, N5) Une taille sans sa liste n'est pas demandée (même règle que resoudreAspectsIA).
  const aDemander = propres.filter((d) => !ASPECT_DEFAULTS[d.name] && !(estAspectDeTaille(d.name) && !(d.allowedValues ?? []).length));
  const ctx = contexteEnTexte(contexte);
  if (!aDemander.length || !ctx || !opts.apiKey) return { aspects: out, refuses, demandes: propres.length, appel_ia: false, seconde_passe: [] };
  const lignes = aDemander.map(ligneDemandeGroupee).join("\n");
  let texte = "";
  try {
    const q = await questionClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: opts.maxTokens ?? 500,
      system:
        `Tu renseignes des caractéristiques produit eBay (« aspects ») pour une annonce d'occasion, à partir du contexte fourni. RÈGLE ABSOLUE : ne JAMAIS inventer — une valeur doit être lisible ou strictement déductible du contexte (titre, description, marque, attributs lus sur les photos), sinon null. ` +
        `Pour une LISTE FERMÉE, la réponse est une entrée de la liste recopiée à l'identique, ou null. Pour une liste suggérée, préfère une entrée de la liste quand elle correspond au contexte ; sinon le mot du texte qui dit cet aspect, recopié tel quel, ou null. ` +
        `Réponds à CHAQUE aspect demandé, indépendamment des autres : le même mot du titre peut servir à plusieurs aspects. ` +
        `Cas particuliers : "Volume" au format eBay ("50 ml", jamais "50ml") ; dimensions (Hauteur/Largeur/Longueur/Dimensions) UNIQUEMENT si des mesures chiffrées figurent dans le contexte, avec l'unité ("80 cm") ; "Département" = le rayon (Femme/Homme/Fille/Garçon…) déduit du contexte ou du champ Rayon. ` +
        `Retourne UNIQUEMENT du JSON valide : {"aspects":{"<nom exact de l'aspect>":"valeur ou null"}}`,
      messages: [{ role: "user", content: `Aspects à renseigner :\n${lignes}\n\nContexte article :\n${ctx}` }],
    }, { apiKey: opts.apiKey, admin: opts.admin, fonction: "aspects_ia_groupe", interrupteur: "ia_cache_aspects", fetchFn: opts.fetchFn, forcer: opts.forcerCache });
    if (!q.ok) {
      console.error("[ebay-aspects-ia] Anthropic (groupé) :", q.statut, q.erreur ?? "");
      return { aspects: out, refuses, demandes: propres.length, appel_ia: true, seconde_passe: [] };
    }
    if (q.data) opts.onUsage?.(q.data);
    texte = q.texte;
  } catch (e) {
    console.error("[ebay-aspects-ia] exception (groupé) :", (e as Error)?.message ?? e);
    return { aspects: out, refuses, demandes: propres.length, appel_ia: true, seconde_passe: [] };
  }
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return { aspects: out, refuses, demandes: propres.length, appel_ia: true, seconde_passe: [] };
  let brutIa: Record<string, unknown> = {};
  try { brutIa = (JSON.parse(m[0])?.aspects ?? {}) as Record<string, unknown>; } catch { brutIa = {}; }
  const parNom = new Map(aDemander.map((d) => [d.name, d]));
  const horsListeLus: string[] = [];
  const branche = brancheDeTaille(String(contexte.genre ?? ""), typeof brutIa["Département"] === "string" ? brutIa["Département"] : "");
  for (const [nom, v] of Object.entries(brutIa)) {
    const d = parNom.get(nom);
    if (!d) continue;
    const val = typeof v === "string" ? v.trim().slice(0, VALEUR_MAX) : "";
    if (!val || val.toLowerCase() === "null") continue;
    // (25/10, N5) Une taille : l'entrée de la liste eBay, jamais « lue dans le texte ».
    if (estAspectDeTaille(nom)) {
      const t = tailleRetenueDansLaListe(nom, val, d.allowedValues ?? [], { taille: contexte.taille, textes: [contexte.titre, contexte.description], branche });
      if ("valeur" in t) out[nom] = t.valeur;
      else refuses.push({ name: nom, valeur: val, motif: t.refus });
      continue;
    }
    if (ASPECT_MESURE_RE.test(nom) && !mesureLueDansLeContexte(val, ctx)) {
      refuses.push({ name: nom, valeur: val, motif: "mesure absente du contexte" });
      continue;
    }
    const liste = d.allowedValues ?? [];
    const recale = liste.length ? valeurDeListeCorrespondante(val, liste) : null;
    if (d.mode === "SELECTION_ONLY") {
      if (recale) out[nom] = recale;
      else refuses.push({ name: nom, valeur: val, motif: "hors liste fermée" });
      continue;
    }
    if (recale) { out[nom] = recale; continue; }
    if (nom === "Marque" || valeurLueDansLeContexte(val, ctx)) { out[nom] = val; if (nom !== "Marque") horsListeLus.push(nom); continue; }
    refuses.push({ name: nom, valeur: val, motif: "hors liste et absent du texte" });
  }
  return { aspects: out, refuses, demandes: propres.length, appel_ia: true, seconde_passe: horsListeLus };
}
