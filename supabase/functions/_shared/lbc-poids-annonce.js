// ═══════════════════════════════════════════════════════════════════════════
// LE POIDS QU'UNE ANNONCE LEBONCOIN PORTE — EST-CE UN POIDS DE COLIS ? (15/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas du 15/10 (7 republications : Louis ×4, linda, Ornella, voirememe) : une
// annonce SANS livraison (main propre : shipping_type = face_to_face,
// shippable = false) porte `estimated_parcel_weight = 40000` (parfois 100000).
// Ce n'est pas un poids de colis : c'est la valeur que Leboncoin garde sur une
// annonce non livrable (0 cas sur ~5 000 annonces livrables, 104 sur les
// annonces en main propre). La republication la recopiait en « De 30 kg à
// 40 kg » : un rangement de Louis serait parti livrable à 40 kg, invendable.
//
// RÈGLE : le poids de l'annonce n'est repris QUE d'une annonce livrable. Sinon
// le poids reste celui de la fiche ou de la copie ; sans poids, Leboncoin estime
// (poids facultatif, 11/10). Rien d'autre ne change.

const sansLivraison = (attr) => {
  const shippable = String(attr('shippable')?.value ?? '').trim().toLowerCase();
  if (shippable === 'false') return true;
  const st = attr('shipping_type');
  const vals = Array.isArray(st?.values) ? st.values.map(String)
    : (st?.value != null ? String(st.value).split(',').map((s) => s.trim()) : []);
  return vals.length > 0 && vals.every((v) => v === 'face_to_face');
};

// `bruts` : capture.attributs_bruts (tableau de { key, value, values }).
// Rend des grammes (entier > 0) ou null, avec la raison.
export function poidsColisDeLAnnonceLbc(bruts) {
  const liste = Array.isArray(bruts) ? bruts : [];
  const attr = (k) => liste.find((b) => String(b?.key ?? '') === k) ?? null;
  const g = Number(attr('estimated_parcel_weight')?.value);
  if (!Number.isFinite(g) || g <= 0) return { grammes: null, raison: 'absent' };
  if (sansLivraison(attr)) return { grammes: null, raison: 'main_propre' };
  return { grammes: Math.round(g), raison: 'annonce_livrable' };
}
