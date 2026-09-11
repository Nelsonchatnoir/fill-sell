// ═══════════════════════════════════════════════════════════════════════════
// TROP DE MAJUSCULES DANS LE TITRE — règle PARTAGÉE (extraite le 2026-09-11)
// ═══════════════════════════════════════════════════════════════════════════
// Née dans _shared/redaction-plateformes.ts le 2026-09-08 (refus Vinted) :
// Vinted a refusé « Jaz Réveil de voyage BOURSIC 319-91 vintage avec étui » —
// « Le titre contient trop de lettres majuscules » — un SEUL mot en capitales
// (7 lettres) suffit, à 25 % de majuscules sur l'ensemble. La règle s'applique
// à la GÉNÉRATION (toutes plateformes) et, depuis le 11/09, au titre SERVI par
// get-pending-jobs pour les publish Vinted créés avant le 08/09 (job f3a5dce8
// Ornella : relancer refaisait le 400). Extraite dans ce module SANS
// dépendance pour que get-pending-jobs ne tire pas tout le module de rédaction.
//
// Règle, PAR MOT : un mot entièrement en capitales de 5 lettres ou plus
// redescend en Capitalisé (« Boursic », « Gore-Tex »). Les acronymes et marques
// courts (IKEA, H&M, NIKE, LEGO, DVD) ont 4 lettres ou moins : jamais touchés.
// La marque de l'article, elle, est réécrite EXACTEMENT comme la fiche l'écrit
// (« Levi's » reste « Levi's »), jamais devinée. Un titre où les capitales
// resteraient majoritaires après ça (rafale de mots courts) redescend aussi ses
// mots de 3-4 lettres, sauf la marque. Les chiffres et la ponctuation ne
// comptent pas. Idempotent : un titre déjà tempéré ressort identique.
// ⚠️ CODE DÉPLACÉ AU CARACTÈRE PRÈS depuis redaction-plateformes.ts — aucune
// retouche de la règle.
const ACRONYMES_TOLERES = new Set(["IKEA", "NIKE", "LEGO", "ASOS", "DKNY", "HDMI", "USB", "GPS", "LED", "DVD", "VHS", "BMX", "SUV", "PS4", "PS5", "XL", "XXL", "XS", "XXS"]);
function capitaliser(mot: string): string {
  return mot.replace(/\p{L}+/gu, (seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase());
}
export function tempererMajuscules(titre: string, marque?: string | null): string {
  const t = String(titre ?? "");
  const marqueFiche = String(marque ?? "").trim();
  const estLaMarque = (mot: string) => marqueFiche && mot.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase() === marqueFiche.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const toutCapitales = (mot: string) => {
    const lettres = mot.replace(/[^\p{L}]/gu, "");
    return lettres.length > 0 && lettres === lettres.toUpperCase() && lettres !== lettres.toLowerCase();
  };
  const passe = (texte: string, minLettres: number) => texte.split(/(\s+)/).map((mot) => {
    if (/^\s+$/.test(mot) || !toutCapitales(mot)) return mot;
    const lettres = mot.replace(/[^\p{L}]/gu, "");
    if (lettres.length < minLettres) return mot;
    if (ACRONYMES_TOLERES.has(lettres)) return mot;
    if (estLaMarque(mot)) return mot.replace(/[\p{L}\p{N}'’&.-]+/u, () => marqueFiche);
    return capitaliser(mot);
  }).join("");
  let sortie = passe(t, 5);
  const lettres = sortie.replace(/[^\p{L}]/gu, "");
  const majuscules = (sortie.match(/\p{Lu}/gu) ?? []).length;
  if (lettres.length >= 8 && majuscules / lettres.length > 0.35) sortie = passe(sortie, 3);
  if (sortie !== t) console.log(`[redaction] titre tempéré (majuscules) : « ${t} » → « ${sortie} »`);
  return sortie;
}
