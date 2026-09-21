// ═══════════════════════════════════════════════════════════════════════════
// LA MISE EN CONFORMITÉ D'UN TEXTE (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Règle produit de Nico, mot pour mot : « Chaque plateforme reçoit une version
// CONFORME du même texte : on n'applique que ce que la plateforme IMPOSE
// (longueur maximale, caractères ou émojis refusés, 5 hashtags max sur
// Leboncoin, suites de symboles refusées par Vinted). Mise en conformité =
// retirer ou raccourcir le strict nécessaire, JAMAIS reformuler, jamais
// ajouter une phrase. »
//
// ⛔ CE FICHIER NE REFORMULE RIEN, JAMAIS. Il coupe au dernier mot entier, il
//    retire, il compte. Aucune phrase n'est ajoutée, aucun mot n'est remplacé
//    par un autre. Si une règle demandait de réécrire, elle n'a pas sa place
//    ici.
// ⛔ IL NE DOUBLONNE PAS LE SERVEUR. Le retrait des mentions d'un autre site
//    et le plafond de 5 hashtags Leboncoin vivent dans
//    `_shared/description-leboncoin.ts` et s'appliquent au texte SERVI à
//    l'extension (get-pending-jobs), sur la liste fermée qui y est mesurée.
//    Ici on ne fait que le DIRE : `signale` liste ce que la plateforme
//    retirera au dépôt, pour que la carte l'affiche. Une seconde liste
//    divergerait au premier terme ajouté.
//
// Deux sorties, deux rôles :
//   · `texte`   — ce qui est réellement écrit dans la copie de la plateforme ;
//   · `notes`   — ce qui a été COUPÉ (la carte l'affiche en ambre) ;
//   · `signale` — ce que la plateforme retirera au dépôt, sans qu'on y touche.
// ═══════════════════════════════════════════════════════════════════════════

import { mentionsAutrePlateforme } from "./descriptionMentions.js";

// ── Les plafonds, recopiés de PLATFORM_LIMITS (_shared/redaction-plateformes)
// La provenance de chaque chiffre est documentée là-bas, ligne à ligne :
// Vinted 100/2000 vient de la doc Vinted Pro, eBay 80 est une limite dure
// refusée à la saisie, Leboncoin 200 est un relevé DOM réel, Beebs est une
// valeur PRUDENTE sans source.
// `opla` n'existe pas côté serveur (sa copie dérive de celle de Vinted) : elle
// hérite donc des bornes de Vinted, comme le reste de sa copie.
export const BORNES_TEXTE = Object.freeze({
  vinted:    { titre: 100, description: 2000 },
  opla:      { titre: 100, description: 2000 },
  beebs:     { titre: 100, description: 1500 },
  leboncoin: { titre: 200, description: 3000 },
  ebay:      { titre: 80,  description: 2000 },
  vestiaire: { titre: 100, description: 2000 },
});

/** Plafond Leboncoin, lu sur leur page de correction (cf. description-leboncoin.ts). */
export const LBC_HASHTAGS_MAX = 5;

// ── Coupe au dernier mot entier (même corps que clampToWord, serveur) ───────
// Jamais au milieu d'un mot, jamais au milieu d'un hashtag : on coupe sur une
// frontière d'espace, et seulement si elle tombe assez loin (60 %) — sinon on
// préfère couper net que de perdre la moitié du texte.
export function couperAuMot(s, max) {
  const v = String(s ?? "");
  if (v.length <= max) return v;
  const coupe = v.slice(0, max);
  const dernierEspace = coupe.lastIndexOf(" ");
  return (dernierEspace > max * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd();
}

// ── SUITES DE SYMBOLES (refus Vinted, 21/09) ───────────────────────────────
// Relevé du jour : « trois... » refusé à la saisie. La règle vise les SUITES
// du même signe de ponctuation, pas les lettres, pas les chiffres, pas les
// émojis (Vinted en accepte, ses propres annonces en sont pleines).
// On ramène la suite à UN seul signe : c'est « raccourcir le strict
// nécessaire ». Deux signes identiques passent (« !! » est courant et n'a
// jamais été refusé) — seules les suites de TROIS et plus sont ramenées.
const SIGNES_EN_SUITE = /([.!?\-_*~=+#/\\|·•])\1{2,}/g;
const PLATEFORMES_SANS_SUITES = new Set(["vinted", "opla"]);

export function reduireSuitesDeSymboles(texte) {
  const v = String(texte ?? "");
  const reduit = v.replace(SIGNES_EN_SUITE, "$1");
  return { texte: reduit, modifie: reduit !== v };
}

/**
 * La version conforme d'un texte pour une plateforme.
 *
 * @param {string} plateforme
 * @param {{titre?: string, description?: string}} texte
 * @returns {{titre: string, description: string, notes: string[], signale: string[]}}
 *   `notes` : ce qui a été coupé ICI (clés de messages, pas des phrases).
 *   `signale` : ce que la plateforme retirera au dépôt, non modifié ici.
 */
export function conformerTexte(plateforme, { titre = "", description = "" } = {}) {
  const bornes = BORNES_TEXTE[plateforme] ?? BORNES_TEXTE.vinted;
  const notes = [];
  const signale = [];

  let t = String(titre ?? "");
  let d = String(description ?? "");

  if (PLATEFORMES_SANS_SUITES.has(plateforme)) {
    const rt = reduireSuitesDeSymboles(t);
    const rd = reduireSuitesDeSymboles(d);
    t = rt.texte; d = rd.texte;
    if (rt.modifie || rd.modifie) notes.push("symboles");
  }

  if (t.length > bornes.titre) { t = couperAuMot(t, bornes.titre); notes.push("titreCoupe"); }
  if (d.length > bornes.description) { d = couperAuMot(d, bornes.description); notes.push("descriptionCoupee"); }

  if (plateforme === "leboncoin" && d) {
    // ⛔ ON NE RETIRE RIEN ICI : le nettoyage Leboncoin (mentions d'un autre
    //    site, plafond de 5 hashtags, marque tierce) est SERVEUR, au moment de
    //    servir le job — liste fermée mesurée, fail-safe compris. On le DIT,
    //    c'est tout, pour que la personne ne découvre pas l'écart en ligne.
    if (mentionsAutrePlateforme(d)) signale.push("lbcMentions");
    const hashtags = d.match(/(^|\s)#[^\s#]+/g) ?? [];
    if (hashtags.length > LBC_HASHTAGS_MAX) signale.push("lbcHashtags");
  }

  return { titre: t, description: d, notes, signale };
}
