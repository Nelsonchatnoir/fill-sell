// ═══════════════════════════════════════════════════════════════════════════
// « REMONTER MES ANNONCES » : LE CHOIX DE LA PLATEFORME ET DU TRI (03/11, demande d'un vendeur Pro)
// ═══════════════════════════════════════════════════════════════════════════
// Une rangée de pastilles (Toutes, puis chaque plateforme où une annonce est republiable maintenant, avec son nombre)
// et le tri par dernière publication ou republication. Les règles sont dans remonterParPlateforme.js.
import { S } from './jetons';

/**
 * @param {object} p
 *   p.choix [{id, nom, n}] — plateformesDuChoix(...) ; p.total — nombre d'annonces (vue « Toutes »)
 *   p.plateforme — l'id choisi (null = toutes) ; p.onPlateforme(id|null)
 *   p.tri — 'anciennes' | 'recentes' ; p.onTri(tri)
 */
export default function ChoixPlateformeRemonter({ lang = 'fr', choix = [], total = 0, plateforme = null, onPlateforme, tri = 'anciennes', onTri }) {
  const fr = lang !== 'en';
  const pastille = (id, libelle, n) => {
    const actif = plateforme === id;
    return (
      <button key={id ?? 'toutes'} type="button" className="sk-btn" aria-pressed={actif} data-remonter-plateforme={id ?? 'toutes'}
        onClick={() => onPlateforme?.(id)}
        style={{ flex: '0 0 auto', height: 36, padding: '0 12px', borderRadius: 18, border: actif ? 'none' : `1px solid ${S.border}`,
          background: actif ? S.tealDeep : '#FFFFFF', color: actif ? '#FFFFFF' : S.ink, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {libelle}<span style={{ marginLeft: 6, fontWeight: 600, opacity: 0.75 }}>{n}</span>
      </button>
    );
  };
  return (
    <div>
      <div role="group" aria-label={fr ? 'Plateforme affichée' : 'Platform shown'} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {pastille(null, fr ? 'Toutes' : 'All', total)}
        {choix.map((c) => pastille(c.id, c.nom, c.n))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: S.ink2 }}>{fr ? 'Dernière publication ou republication :' : 'Last listed or reposted:'}</span>
        {[['anciennes', fr ? 'plus anciennes d’abord' : 'oldest first'], ['recentes', fr ? 'plus récentes d’abord' : 'newest first']].map(([id, libelle]) => (
          <button key={id} type="button" className="sk-btn" aria-pressed={tri === id} data-remonter-tri={id} onClick={() => onTri?.(id)}
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: tri === id ? `1.5px solid ${S.tealDeep}` : `1px solid ${S.border}`,
              background: '#FFFFFF', color: tri === id ? S.tealDeep : S.ink2, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{libelle}</button>
        ))}
      </div>
    </div>
  );
}
