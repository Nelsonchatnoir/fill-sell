// ═══════════════════════════════════════════════════════════════════════════
// LA FENÊTRE « VENDRE » ENREGISTRE UNE VRAIE VENTE (02/10 soir, point 8)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de XEWER, portée par Nico : la fenêtre du bouton « Vendre » des
// cartes du Stock doit servir à enregistrer une VENTE — bien distincte d'une
// suppression :
//   · le choix de la plateforme où l'article a été vendu = ses plateformes
//     RÉELLES (ses annonces en ligne), plus « Ailleurs / en main propre » ; les
//     autres plateformes restent accessibles (annonce postée hors FillSell),
//     jamais mises en avant ;
//   · le prix de vente est PRÉ-REMPLI avec le prix affiché, modifiable ;
//   · ce qui va se passer est dit, et c'est VRAI : ce que fait la base
//     (enregistrer_vente_atomique + inventaire_vendu_retire_ses_copies) —
//       - stock à 0 : l'annonce de la plateforme vendue n'est jamais retirée,
//         les annonces des AUTRES plateformes sont retirées automatiquement,
//         tout de suite (plus de « dans 10 minutes », plus de « supprime la
//         vente avant » : le retrait prouvé est armé sans délai) ;
//       - il reste du stock (plusieurs exemplaires) : un exemplaire est
//         décompté, AUCUNE annonce n'est retirée.
// Tout ce qui se décide ici est pur et testé (scripts/vente-modale-selftest.mjs) ;
// la fenêtre (App.jsx) et l'avertissement de la carte vocale ne font qu'afficher.

export const CODES_VENTE = ["vinted", "leboncoin", "beebs", "ebay", "opla", "depop"];
export const LIBELLES_VENTE = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla", depop: "Depop" };

/**
 * Le CODE de plateforme envoyé à enregistrer_vente_atomique (contrat serveur du
 * 02/10 : 'vinted' | 'ebay' | 'leboncoin' | 'beebs' | 'opla' | 'ailleurs').
 * Les anciens libellés (« Vinted », « Ailleurs », « Le bon coin »…) sont
 * ramenés à leur code ; vide = 'ailleurs'. Un texte libre inconnu (vente
 * vocale « Vestiaire ») est rendu tel quel, nettoyé : le serveur le garde comme
 * libellé, il ne désigne aucune de nos plateformes.
 */
export function codePlateformeVente(valeur) {
  const brut = String(valeur ?? "").trim();
  if (!brut) return "ailleurs";
  const v = brut.toLowerCase();
  if (v.includes("vinted")) return "vinted";
  if (v.includes("leboncoin") || v === "lbc" || v === "le bon coin" || v === "le boncoin") return "leboncoin";
  if (v.includes("beebs")) return "beebs";
  if (v.includes("ebay")) return "ebay";
  if (v.includes("opla")) return "opla";
  if (v.startsWith("ailleurs") || v.includes("main propre") || v === "autre" || v === "elsewhere") return "ailleurs";
  return brut;
}

/** Libellé lisible d'un code (ou d'un libellé libre déjà lisible). */
export function libellePlateformeVente(code, lang = "fr") {
  if (code === "ailleurs") return lang === "en" ? "Elsewhere (in person…)" : "Ailleurs / en main propre";
  return LIBELLES_VENTE[code] ?? String(code ?? "");
}

/**
 * Le prix affiché de l'article, en texte pour le champ (« 12 », « 12.5 »).
 * Rien de connu (vide, 0, illisible) → champ vide : on n'invente pas un prix.
 */
export function prixPrerempli(item) {
  const brut = item?.sell ?? item?.prix_vente ?? null;
  if (brut == null || String(brut).trim() === "") return "";
  const n = Number(String(brut).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100);
}

/**
 * Les choix de la fenêtre.
 * @param {{ enLigne?: Array<{platform: string, url?: string|null}>|null, oplaVisible?: boolean, depopVisible?: boolean, plateformeActuelle?: string|null }} arg
 *   depopVisible (09/10) : Depop n'est proposée qu'aux comptes où elle est
 *   ouverte (défaut : non) — ou quand l'article y est en ligne.
 *   enLigne : annoncesEncoreEnLigne(item, jobs) — null tant que la lecture n'a pas répondu.
 * @returns {{ principales: Array<{code: string, enLigne: boolean, url: string|null}>, autres: string[], lu: boolean }}
 *   principales = plateformes où l'article est en ligne (dans l'ordre du Stock) ;
 *   autres = les plateformes restantes (repliées : annonce postée hors FillSell) ;
 *   « Ailleurs » est toujours proposé à part par l'appelant.
 */
export function choixPlateformesVente({ enLigne = null, oplaVisible = true, depopVisible = false, plateformeActuelle = null } = {}) {
  const lu = Array.isArray(enLigne);
  const vues = new Set();
  const principales = [];
  for (const a of (lu ? enLigne : [])) {
    const code = codePlateformeVente(a?.platform);
    if (!CODES_VENTE.includes(code) || vues.has(code)) continue;
    vues.add(code);
    principales.push({ code, enLigne: true, url: a?.url ?? null });
  }
  const autres = CODES_VENTE.filter((c) => !vues.has(c)
    && (c !== "opla" || oplaVisible || plateformeActuelle === "opla")
    && (c !== "depop" || depopVisible || plateformeActuelle === "depop"));
  return { principales, autres, lu };
}

function enumerer(noms, fr) {
  if (noms.length <= 1) return noms[0] || "";
  return `${noms.slice(0, -1).join(", ")}${fr ? " et " : " and "}${noms[noms.length - 1]}`;
}

/**
 * Ce qui va se passer, en clair. Vrai par construction : mêmes règles que la base.
 * @param {{ plateforme?: string|null, enLigne?: Array<{platform: string}>|null, quantiteStock?: number, quantiteVendue?: number, lang?: string }} arg
 * @returns {{ ton: 'neutre'|'retrait', lignes: string[] }}
 */
export function verdictVente({ plateforme = null, enLigne = null, quantiteStock = 1, quantiteVendue = 1, lang = "fr" } = {}) {
  const fr = lang !== "en";
  const code = plateforme ? codePlateformeVente(plateforme) : null;
  const stock = Math.max(1, Number(quantiteStock) || 1);
  const vendus = Math.max(1, Math.min(Number(quantiteVendue) || 1, stock));
  const restant = stock - vendus;
  const lignes = [];
  if (!code) {
    lignes.push(fr ? "Choisis où l'article a été vendu." : "Pick where the item sold.");
    return { ton: "neutre", lignes };
  }
  const codesEnLigne = [...new Set((Array.isArray(enLigne) ? enLigne : []).map((a) => codePlateformeVente(a?.platform)))]
    .filter((c) => CODES_VENTE.includes(c));
  if (restant > 0) {
    lignes.push(fr
      ? `Il restera ${restant} exemplaire${restant > 1 ? "s" : ""} en stock : aucune annonce n'est retirée.`
      : `${restant} unit${restant > 1 ? "s" : ""} will remain in stock: no listing is taken down.`);
    return { ton: "neutre", lignes };
  }
  const vendueEnLigne = codesEnLigne.includes(code);
  const aRetirer = codesEnLigne.filter((c) => c !== code);
  if (vendueEnLigne) {
    lignes.push(fr
      ? `Ton annonce ${LIBELLES_VENTE[code]} est marquée vendue — elle n'est jamais retirée.`
      : `Your ${LIBELLES_VENTE[code]} listing is marked as sold — it is never taken down.`);
  }
  if (aRetirer.length) {
    const noms = aRetirer.map((c) => LIBELLES_VENTE[c]);
    lignes.push(fr
      ? `${aRetirer.length > 1 ? "Les annonces" : "L'annonce"} sur ${enumerer(noms, fr)} ${aRetirer.length > 1 ? "seront retirées" : "sera retirée"} automatiquement, tout de suite.`
      : `The listing${aRetirer.length > 1 ? "s" : ""} on ${enumerer(noms, fr)} will be taken down automatically, right away.`);
    return { ton: "retrait", lignes };
  }
  if (Array.isArray(enLigne) && !vendueEnLigne) {
    lignes.push(fr ? "Aucune annonce en ligne ailleurs : rien à retirer." : "No other live listing: nothing to take down.");
  } else if (Array.isArray(enLigne)) {
    lignes.push(fr ? "Aucune autre annonce en ligne : rien à retirer." : "No other live listing: nothing to take down.");
  }
  return { ton: "neutre", lignes };
}

/** Le texte de l'avertissement « encore en ligne » de la carte vocale (même vérité). */
export function texteAvertissementEnLigne(lang = "fr") {
  return lang !== "en"
    ? "En enregistrant la vente, ces annonces seront retirées automatiquement, tout de suite — sauf celle de la plateforme où tu l'as vendu. S'il reste des exemplaires en stock, rien n'est retiré."
    : "Once the sale is recorded, these listings are taken down automatically, right away — except the one on the platform where you sold it. If units remain in stock, nothing is removed.";
}
