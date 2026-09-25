// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LA LOCALISATION D'UNE ANNONCE, TELLE QU'ON LA RETAPE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication Leboncoin retape la localisation de l'annonce d'origine
// dans le champ « Adresse » du dépôt. Quand l'annonce n'a pas de voie (cas de
// tous les particuliers), l'extension tape le LIBELLÉ tel quel.
//
// LE DÉFAUT (XEWER, Pro, 25/09 soir — 5fe3fb95 Payday 2, puis 04664706
// Hitman) : le libellé vient de `ad.location.city_label`, et Leboncoin y
// ajoute le LIEU-DIT ou le QUARTIER après le code postal :
//   « Saint-Yrieix-sur-Charente 16710 Les Rochers »
// L'autocomplete du dépôt, lui, ne propose que la commune :
//   « Saint-Yrieix-sur-Charente (16710) »
// Le contrôle de l'extension exige tous les mots tapés (« les », « rochers »
// manquent) → refus ; et le repli « code postal + ce qui suit » retapait
// « 16710 Les Rochers » — le lieu-dit à la place de la ville → refus encore.
// Annonce RETIRÉE, redépôt refusé. Relevé du parc le 25/09 : 225 captures sur
// 1 095 portent un lieu-dit ou un quartier (8 comptes : « Marseille 13006
// Lodi », « Paris 75012 12e Arrondissement », « Saint-Crépin-Ibouvillers
// 60149 Haillancourt »…).
//
// LA RÈGLE : ce qu'on retape, c'est la COMMUNE — « ville code_postal », lue
// dans les champs STRUCTURÉS de l'annonce (`city`, `zipcode`), jamais dans le
// libellé d'affichage. C'est la granularité que l'autocomplete accepte, celle
// qui a remis les deux annonces de XEWER en ligne le 25/09 (20:07, 20:54).
// Le lieu-dit est gardé à part (`lieu_dit`, `libelle_annonce`) : trace, jamais
// frappe.
// ⛔ Sans ville OU sans code postal, on ne recompose rien : le libellé reste
//    celui de la capture (on ne fabrique pas une commune à moitié).
// ⛔ La VOIE ne passe pas par ici : quand elle existe, l'extension tape
//    « voie code_postal ville », sans le libellé.
// ES module SANS import (Deno + Node).

const propre = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// Rend la localisation à servir (nouvel objet) et `change` = le libellé a été
// recomposé. Entrée : l'objet `localisation_origine` d'un job, ou la
// `capture.localisation` d'une annonce relevée.
export function localisationLbcATaper(loc) {
  if (!loc || typeof loc !== "object") return { loc: null, change: false };
  const ville = propre(loc.ville);
  const cp = propre(loc.code_postal);
  const libelle = propre(loc.libelle);
  if (!ville || !/^\d{5}$/.test(cp)) return { loc: { ...loc }, change: false };
  const commune = `${ville} ${cp}`;
  if (libelle === commune) return { loc: { ...loc }, change: false };
  // Le lieu-dit = ce que le libellé ajoute APRÈS « ville cp ». Si le libellé
  // n'a pas cette forme, on ne devine pas de lieu-dit : on garde juste le
  // libellé d'origine en trace.
  const suite = libelle.startsWith(commune) ? propre(libelle.slice(commune.length)) : "";
  const out = { ...loc, libelle: commune };
  if (libelle && !loc.libelle_annonce) out.libelle_annonce = libelle;
  if (suite && !loc.lieu_dit) out.lieu_dit = suite;
  return { loc: out, change: true };
}
