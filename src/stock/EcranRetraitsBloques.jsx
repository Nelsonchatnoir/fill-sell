// ═══════════════════════════════════════════════════════════════════════════
// STOCK — « ANNONCES ENCORE EN LIGNE À RETIRER » (05/10, Joséphine)
// ═══════════════════════════════════════════════════════════════════════════
// Ouvert depuis la première ligne de « À régler » — jamais un bandeau empilé
// en haut du Stock (refonte du 03/10 : le haut porte la synchro et les trois
// gestes, rien d'autre ; décision de Nico le 05/10). Un retrait après vente
// attend que la personne se reconnecte à une plateforme : tant que ce n'est
// pas fait, l'annonce d'un article vendu reste en ligne (risque de double
// vente). Une carte par plateforme : la phrase, LE bouton « Me connecter » (le
// même composant que partout), puis les articles concernés. Données : les jobs
// déjà chargés par le Stock (utils/retraitsBloques), aucune lecture de plus.
import { AlertTriangle } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S } from './jetons';
import { nombreFr } from './regles';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { texteRetraitsBloques } from '../utils/retraitsBloques';

export default function EcranRetraitsBloques({ lang = 'fr', retraits, userId, motifDe, onFermer }) {
  const fr = lang !== 'en';
  const total = retraits?.total ?? 0;
  return (
    <EcranPlein lang={lang} titre={fr ? 'Annonces à retirer' : 'Listings to remove'} onFermer={onFermer}>
      <div style={{ marginTop: 16 }}>
        <div className="sk-chiffres" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
          {fr
            ? `${nombreFr(total, lang)} annonce${total > 1 ? 's' : ''} encore en ligne`
            : `${total} listing${total > 1 ? 's' : ''} still live`}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
          {fr
            ? 'FillSell les retire tout seul dès que tu te reconnectes à la plateforme dans Chrome, sur ton ordinateur. En attendant, un acheteur peut encore les payer.'
            : 'FillSell removes them on its own as soon as you sign back in to the platform in Chrome, on your computer. Until then, a buyer can still pay for them.'}
        </div>
      </div>
      {(retraits?.parPlateforme ?? []).map((g) => (
        <div key={`${g.platform}|${g.mur ?? 'connexion'}`} style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.rougeFond, color: S.rouge }}>
              <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>{texteRetraitsBloques(g, lang)}</span>
          </div>
          {userId && g.mur !== 'compte_bloque' && (
            <BoutonMeConnecter userId={userId} platform={g.platform} motif={motifDe(g.lignes[0]?.job)} lang={lang} variante="bouton" style={{ alignItems: 'flex-start' }} />
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${S.borderSoft}` }}>
            {g.lignes.map((l) => (
              <li key={l.job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, lineHeight: '18px', color: S.ink }}>
                <PlatformLogo platform={g.platform} size={16} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{l.titre ?? (fr ? 'Article' : 'Item')}</span>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: l.vendu ? S.rouge : S.ink2 }}>
                  {l.vendu ? (fr ? 'Vendu' : 'Sold') : l.fiche ? (fr ? 'En stock' : 'In stock') : (fr ? 'Fiche supprimée' : 'Item deleted')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </EcranPlein>
  );
}
