// ── UNE ANNONCE QUE NOUS RETIRONS N'EST PLUS « À RATTACHER » (2026-09-26) ──
// labouquinerie85, 25/09 : 4 annonces retirées par FillSell (retraits
// vérifiés) sont restées dans la file comme vivantes — la ligne relevée
// n'était datée qu'au relevé suivant. Elle en a rattaché deux à d'autres
// livres. Le serveur date désormais la ligne quand le retrait aboutit
// (migration 20260925223753) ; ici on écarte AUSSI ce dont le retrait est
// demandé ou en cours, et on couvre un serveur qui n'aurait pas la migration.
// Même règle que `public.listing_designe` : un identifiant de moins de 4
// caractères ne désigne rien.
export function listingDesigne(listingId, url, pid) {
  const l = String(listingId ?? '').trim();
  if (l.length < 4) return false;
  if (l === String(pid ?? '').trim()) return true;
  const u = String(url ?? '');
  if (/^\d+$/.test(l)) return new RegExp(`(^|[^0-9])${l}([^0-9]|$)`).test(u);
  return u.includes(l);
}

// Les retraits, indexés UNE fois par plateforme : un identifiant numérique se
// cherche parmi les suites de chiffres des liens (même frontière que
// `listingDesigne`), les autres par inclusion. Des milliers d'annonces sur un
// téléphone : pas de regex par paire.
export function indexerRetraits(retraits) {
  const idx = new Map();
  for (const d of retraits ?? []) {
    const ts = Date.parse(d?.created_at ?? '') || 0;
    let e = idx.get(d?.platform);
    if (!e) { e = { nums: new Map(), items: [] }; idx.set(d?.platform, e); }
    for (const m of `${d?.listing_url ?? ''} ${d?.platform_listing_id ?? ''}`.match(/\d+/g) ?? []) {
      if ((e.nums.get(m) ?? -1) < ts) e.nums.set(m, ts);
    }
    e.items.push({ url: String(d?.listing_url ?? ''), pid: String(d?.platform_listing_id ?? '').trim(), ts });
  }
  return idx;
}

// Un retrait demandé, en cours ou abouti APRÈS la dernière fois qu'un relevé
// a vu l'annonce la sort de la file. Revue depuis : le relevé a raison.
export function annonceRetiree(a, index) {
  const l = String(a?.listing_id ?? '').trim();
  const e = index?.get?.(a?.platform);
  if (l.length < 4 || !e) return false;
  const vu = Date.parse(a?.vu_le ?? '') || 0;
  if (/^\d+$/.test(l)) {
    const ts = e.nums.get(l);
    return ts !== undefined && ts >= vu;
  }
  return e.items.some((it) => it.ts >= vu && (it.pid === l || it.url.includes(l)));
}
