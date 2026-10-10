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

export interface AspectDemande { name: string; mode: string; allowedValues: string[]; libre?: boolean; }
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

function ligneDemande(a: AspectDemande): string {
  const liste = a.allowedValues ?? [];
  if (a.mode === "SELECTION_ONLY") {
    return `- "${a.name}" — LISTE FERMÉE, réponds UNIQUEMENT par une de ces valeurs recopiée caractère pour caractère (apostrophes, accents, espaces compris), sinon null : ${liste.slice(0, LISTE_FERMEE_MAX).join(" | ")}`;
  }
  if (a.name === "Marque") return `- "Marque" — texte libre : la marque telle qu'elle est écrite dans le contexte, sinon null (jamais une marque plausible)`;
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
export const ASPECT_MESURE_RE = /^(hauteur|largeur|longueur|profondeur|diam[eè]tre|[ée]paisseur|dimensions?|volume|contenance|tour de )/i;
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
  opts: { apiKey: string; onUsage?: (data: unknown) => void; maxTokens?: number },
): Promise<ResultatAspectsIA> {
  const out: Record<string, string> = {};
  const refuses: ResultatAspectsIA["refuses"] = [];
  const propres = demandes.filter((d) => d && typeof d.name === "string" && d.name.trim()).slice(0, 14);
  for (const d of propres) if (ASPECT_DEFAULTS[d.name]) out[d.name] = ASPECT_DEFAULTS[d.name];
  const aDemander = propres.filter((d) => !ASPECT_DEFAULTS[d.name]);
  const ctx = contexteEnTexte(contexte);
  if (!aDemander.length || !ctx || !opts.apiKey) return { aspects: out, refuses, demandes: propres.length, appel_ia: false };

  const lignes = aDemander.map(ligneDemande).join("\n");
  let texte = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: opts.maxTokens ?? 500,
        system:
          `Tu renseignes des caractéristiques produit eBay (« aspects ») pour une annonce d'occasion, à partir du contexte fourni. RÈGLE ABSOLUE : ne JAMAIS inventer — une valeur doit être lisible ou strictement déductible du contexte (titre, description, marque, attributs lus sur les photos), sinon null. ` +
          `Pour une LISTE FERMÉE, la réponse est une entrée de la liste recopiée à l'identique, ou null. Pour une liste suggérée, préfère une entrée de la liste quand elle correspond au contexte ; sinon un texte libre court, ou null. ` +
          `Cas particuliers : "Volume" au format eBay ("50 ml", jamais "50ml") ; dimensions (Hauteur/Largeur/Longueur/Dimensions) UNIQUEMENT si des mesures chiffrées figurent dans le contexte, avec l'unité ("80 cm") ; "Département" = le rayon (Femme/Homme/Fille/Garçon…) déduit du contexte ou du champ Rayon. ` +
          `Retourne UNIQUEMENT du JSON valide : {"aspects":{"<nom exact de l'aspect>":"valeur ou null"}}`,
        messages: [{ role: "user", content: `Aspects à renseigner :\n${lignes}\n\nContexte article :\n${ctx}` }],
      }),
    });
    if (!res.ok) {
      console.error("[ebay-aspects-ia] Anthropic :", res.status, (await res.text()).slice(0, 300));
      return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
    }
    const data = await res.json();
    opts.onUsage?.(data);
    texte = String(data.content?.[0]?.text ?? "");
  } catch (e) {
    console.error("[ebay-aspects-ia] exception :", (e as Error)?.message ?? e);
    return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
  }

  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return { aspects: out, refuses, demandes: propres.length, appel_ia: true };
  let brut: Record<string, unknown> = {};
  try { brut = (JSON.parse(m[0])?.aspects ?? {}) as Record<string, unknown>; } catch { brut = {}; }

  const parNom = new Map(aDemander.map((d) => [d.name, d]));
  for (const [nom, v] of Object.entries(brut)) {
    const d = parNom.get(nom);
    if (!d) continue; // jamais une clé non demandée
    const s = typeof v === "string" ? v.trim().slice(0, VALEUR_MAX) : "";
    if (!s || s.toLowerCase() === "null") continue;
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
  opts: { apiKey: string; onUsage?: (data: unknown) => void; maxTokens?: number },
): Promise<ResultatCompletion> {
  const premiere = await resoudreAspectsIA(demandes, contexte, opts);
  const restants = demandes.filter((d) =>
    d && typeof d.name === "string" && d.mode === "FREE_TEXT" && d.name !== "Marque"
    && !ASPECT_DEFAULTS[d.name] && !String(premiere.aspects[d.name] ?? "").trim());
  if (!restants.length || !premiere.appel_ia) return { ...premiere, seconde_passe: [] };
  const seconde = await resoudreAspectsIA(restants.map((d) => ({ ...d, libre: true })), contexte, opts);
  const ctx = contexteEnTexte(contexte);
  const aspects = { ...premiere.aspects };
  const refuses = [...premiere.refuses, ...seconde.refuses];
  const posees: string[] = [];
  for (const d of restants) {
    const v = String(seconde.aspects[d.name] ?? "").trim();
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
