// ═══════════════════════════════════════════════════════════════════════════
// « Vendu, encore en ligne » — JAMAIS UN RETRAIT D'ARTICLE VENDU EN SILENCE (12/10, A6)
// ═══════════════════════════════════════════════════════════════════════════
// Ornella (11/10) : jupe vendue, retrait Vinted en attente sans un mot (annonce
// sur son autre boutique, Chrome ouvert sur la première). nerema75 : « nous
// n'arrivons pas encore à prouver… », sans nommer la boutique. Et sept comptes
// dont l'ordinateur ne tourne plus avaient des retraits d'articles vendus en
// file depuis des jours.
//
// En TÊTE de la zone des bandeaux, tous les onglets (risque de double vente :
// la priorité), pour les seuls articles VENDUS : une ligne par plateforme et
// par geste — la boutique à ouvrir, Chrome à ouvrir, la reconnexion, ou
// « compte bloqué ». Les mêmes règles que la ligne « À régler » du Stock
// (utils/retraitsBloques.js) ; le bandeau se LÈVE SEUL : il ne lit que les
// retraits encore en file (pending, processing, needs_user), relus avec le
// reste de l'app (fetchAll, retour sur l'onglet) — jamais en boucle.
// ⛔ ZÉRO RETRAIT BLOQUÉ ⇒ RIEN. Pas de bloc vide.
import { texteRetraitsBloques } from '../utils/retraitsBloques';

const P = {
  ink: '#10201B', paper: '#FBF3F1', rouge: '#B42318', rougeBord: '#F2C9C4', mute2: '#5C6560', card: '#FFFFFF',
};

export default function RetraitsVendusBloques({ lang = 'fr', retraits, onVoir }) {
  const groupes = (retraits?.parPlateforme ?? [])
    .map((g) => ({ ...g, lignes: g.lignes.filter((l) => l.vendu) }))
    .map((g) => ({ ...g, nVendus: g.lignes.length }))
    .filter((g) => g.lignes.length > 0);
  if (!groupes.length) return null;
  const fr = lang !== 'en';
  const n = groupes.reduce((t, g) => t + g.lignes.length, 0);
  return (
    <div role="alert" data-bandeau="retraits-vendus-bloques" style={{
      background: P.paper, border: `1px solid ${P.rougeBord}`, borderLeft: `4px solid ${P.rouge}`,
      borderRadius: 16, padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: P.rouge }}>
        {fr
          ? `${n > 1 ? `${n} articles vendus sont` : 'Un article vendu est'} encore en ligne`
          : `${n > 1 ? `${n} sold items are` : 'A sold item is'} still live`}
      </div>
      {groupes.map((g) => (
        <div key={`${g.platform}|${g.mur}|${g.boutique ?? ''}`} style={{ background: P.card, border: `1px solid ${P.rougeBord}`, borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13.5, color: P.ink, lineHeight: 1.5, fontWeight: 600 }}>{texteRetraitsBloques(g, lang)}</div>
          <div style={{ fontSize: 12.5, color: P.mute2, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
            {g.lignes.slice(0, 3).map((l) => `« ${l.titre ?? (fr ? 'Article' : 'Item')} »`).join(' · ')}
            {g.lignes.length > 3 ? (fr ? ` et ${g.lignes.length - 3} autre${g.lignes.length - 3 > 1 ? 's' : ''}` : ` and ${g.lignes.length - 3} more`) : ''}
          </div>
        </div>
      ))}
      {onVoir && (
        <button type="button" onClick={onVoir} style={{
          alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 999, border: `1px solid ${P.rougeBord}`,
          background: P.card, color: P.rouge, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {fr ? 'Voir dans le Stock' : 'See in Stock'}
        </button>
      )}
    </div>
  );
}
