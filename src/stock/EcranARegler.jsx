// ═══════════════════════════════════════════════════════════════════════════
// STOCK — « À RÉGLER » : CE QUI ATTEND UN GESTE DE TA PART
// ═══════════════════════════════════════════════════════════════════════════
// Le troisième geste du haut du Stock. Il réunit ce qui, avant la refonte,
// était dispersé : le bandeau « N annonces attendent une action de ta part »,
// le bandeau « Déjà vendu ? », et deux des trois portes de « À traiter »
// (prix d'achat manquants, brouillons à finir — la troisième, « À republier »,
// est devenue « Remonter »). Chaque ligne rouvre la porte qui EXISTAIT :
// la feuille d'attente, l'écran des doublons, le mode prix d'achat, le mode
// brouillons. Aucun chemin neuf.
import { ChevronRight, CircleAlert, BadgeEuro, Tag, PenLine } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S } from './jetons';
import { nombreFr } from './regles';

const ICONES = { attente: CircleAlert, ventes: BadgeEuro, prix: Tag, brouillons: PenLine };

export default function EcranARegler({ lang = 'fr', lignes = [], onFermer, actif = true }) {
  const fr = lang !== 'en';
  const total = lignes.reduce((t, l) => t + (l.n || 0), 0);
  // La phrase dit ce qu'il y a VRAIMENT, rien de plus.
  const present = (...cles) => lignes.some((l) => cles.includes(l.cle) && l.n > 0);
  const parts = [
    present('attente') && (fr ? 'des annonces qui attendent ton geste' : 'listings waiting on you'),
    present('ventes') && (fr ? 'des ventes à confirmer' : 'sales to confirm'),
    present('prix', 'brouillons') && (fr ? 'des infos à compléter' : 'info to complete'),
  ].filter(Boolean);
  const liste = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${parts[parts.length - 1]}` : (parts[0] ?? '');
  const phrase = `${liste.charAt(0).toUpperCase()}${liste.slice(1)}. ${fr ? 'Touche une ligne pour t’en occuper.' : 'Tap a line to deal with it.'}`;
  return (
    <EcranPlein lang={lang} titre={fr ? 'À régler' : 'To fix'} onFermer={onFermer} actif={actif}>
      <div style={{ marginTop: 16 }}>
        <div className="sk-chiffres" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
          {total
            ? (fr ? `${nombreFr(total, lang)} chose${total > 1 ? 's' : ''} à régler` : `${total} thing${total > 1 ? 's' : ''} to fix`)
            : (fr ? 'Rien à régler' : 'Nothing to fix')}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
          {total
            ? phrase
            : (fr ? 'Tout est en ordre : rien n’attend de geste de ta part.' : 'All good: nothing is waiting on you.')}
        </div>
      </div>
      {lignes.some((l) => l.n > 0) && (
        <div style={{ marginTop: 16, borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
          {lignes.filter((l) => l.n > 0).map((l) => {
            const I = ICONES[l.cle] ?? CircleAlert;
            return (
              <button key={l.cle} type="button" className="sk-btn sk-presse" onClick={l.onOuvrir}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '8px 16px', boxSizing: 'border-box', border: 'none', background: 'transparent', boxShadow: `inset 0 -1px 0 ${S.borderSoft}`, textAlign: 'left', color: S.ink }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
                  <I size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="sk-chiffres" style={{ minWidth: 32, flexShrink: 0, fontSize: 24, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.03em' }}>{nombreFr(l.n, lang)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700 }}>{l.titre}</span>
                  {l.detail && <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, marginTop: 2 }}>{l.detail}</span>}
                </span>
                <ChevronRight size={20} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}
    </EcranPlein>
  );
}
