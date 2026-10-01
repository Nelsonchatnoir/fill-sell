// ═══════════════════════════════════════════════════════════════════════════
// BEEBS RESTE SUR LE FORMULAIRE : CE QUE L'ESSAI A LAISSÉ (2026-10-01, Marie)
// ═══════════════════════════════════════════════════════════════════════════
// mariecreativedigital, « Chemise Overshirt à carreaux Homme Hilfiger Denim »
// (job 0f457c57) : six essais, six fois « Taille 8XL » sur le formulaire et
// « Dépôt Beebs non confirmé », rien soumis (la sonde réseau n'a vu partir
// aucune requête). L'avertissement de l'essai disait tout :
//   adresse: "9 Rue du 8 Mai 1945 08000 Villers-Semeuse" → suggestion Beebs "8XL"
// Le sélecteur d'adresse de l'extension (≤ 0.6.82) prenait n'importe quel
// bouton de la page contenant un jeton de l'adresse, chiffres isolés compris :
// « 8 » ⊂ « 8XL », l'option de TAILLE. L'adresse n'a jamais été validée, et la
// taille est passée de M à 8XL.
//
// Lu ici, pour le serveur (classement pas-de-rouge, correctif d'extension) :
//   · adresseSurAutreChose : le texte cliqué quand ce n'est pas une adresse
//     (il ne porte pas le code postal de l'adresse saisie) ;
//   · tailleAffichee / tailleVoulue : la taille que montrait le formulaire et
//     celle de la fiche.
// ES module sans import (Deno + Node).

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const jetons = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** « M » et « 38 / M », « 42 » et « EU 42 » sont compatibles ; « 8XL » et « M » non. */
export function taillesCompatibles(affichee, voulue) {
  const a = norm(affichee);
  const v = norm(voulue);
  if (!a || !v) return true; // rien à comparer : pas de verdict
  return a === v || jetons(a).includes(v) || jetons(v).includes(a);
}

/**
 * @param {Record<string, unknown>|null|undefined} pf platform_fields de l'essai
 * @param {string} brut l'erreur brute (« … le formulaire affiche : … »)
 */
export function lectureRefusBeebs(pf, brut = "") {
  const p = (pf && typeof pf === "object") ? pf : {};
  const warnings = Array.isArray(p.warnings) ? p.warnings : [];
  const textes = warnings.map((w) => (typeof w === "string" ? w : String(w?.message ?? ""))).filter(Boolean);
  let adresseSurAutreChose = null;
  for (const m of textes) {
    const r = /^adresse:\s*"(.+?)"\s*→\s*suggestion Beebs\s*"(.+)"\s*$/.exec(m.trim());
    if (!r) continue;
    const cp = /(?:^|\D)(\d{5})(?:\D|$)/.exec(r[1])?.[1];
    if (cp && !r[2].includes(cp)) { adresseSurAutreChose = r[2].trim().slice(0, 40); break; }
  }
  const affiche = String(brut).split(/le formulaire affiche\s*:/i)[1] ?? "";
  const morceaux = affiche.split("|").map((x) => x.trim());
  let tailleAffichee = null;
  for (const m of morceaux) {
    const r = /^(?:Taille|Pointure)(?!\s*\()\s*(.+?)(?:\.\s.*)?$/.exec(m);
    if (r && r[1] && !/^s[ée]lectionner/i.test(r[1])) { tailleAffichee = r[1].trim(); break; }
  }
  const tailleVoulue = String(p.taille ?? "").trim() || null;
  return { adresseSurAutreChose, tailleAffichee, tailleVoulue };
}
