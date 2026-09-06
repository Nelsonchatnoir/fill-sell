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
