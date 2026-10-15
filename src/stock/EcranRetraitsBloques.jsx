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
// (12/10 soir, Nico) Un article VENDU dont la fiche existe a sa PROPRE ligne
// dans « À régler » (elle ouvre sa fiche) : cet écran garde le reste — les
// retraits d'articles en stock, ceux dont la fiche a été supprimée, et les
// annonces d'un article vendu sans fiche qui attendent ton accord (l'ancien
// bandeau « 🎉 Vendu : … — retirer ? »). La bonne boutique Vinted à ouvrir
// n'est jamais une alarme : ambre, pas rouge.
import { AlertTriangle, Store } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S, DEGRADE } from './jetons';
import { nombreFr } from './regles';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { texteRetraitsBloques } from '../utils/retraitsBloques';
// Les noms viennent de la configuration des plateformes, jamais d'une liste ici.
import { nomPlateforme } from '../utils/fileDesJobs';

export default function EcranRetraitsBloques({ lang = 'fr', retraits, userId, motifDe, onFermer, aRetirer = [], onRetirer = null, onPlusTard = null, onOplaFait = null }) {
  const fr = lang !== 'en';
  const total = (retraits?.total ?? 0) + aRetirer.reduce((t, g) => t + g.length, 0);
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
            ? 'FillSell les retire tout seul dès que le geste ci-dessous est fait, sur ton ordinateur. En attendant, un acheteur peut encore les payer.'
            : 'FillSell removes them on its own as soon as the step below is done, on your computer. Until then, a buyer can still pay for them.'}
        </div>
      </div>
      {(retraits?.parPlateforme ?? []).map((g) => {
        const ambre = g.mur === 'boutique';
        const Icone = ambre ? Store : AlertTriangle;
        return (
        <div key={`${g.platform}|${g.mur ?? 'connexion'}|${g.boutique ?? ''}`} style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ambre ? S.ambreFond : S.rougeFond, color: ambre ? S.ambreEncre : S.rouge }}>
              <Icone size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>{texteRetraitsBloques(g, lang)}</span>
          </div>
          {/* (15/10) Opla quittée : la personne retire elle-même, puis le dit. */}
          {g.mur === 'opla_sortie' && onOplaFait && (
            <button type="button" className="sk-btn sk-presse" onClick={() => onOplaFait(g.lignes.map((l) => l.job))}
              style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 14, fontWeight: 700, color: S.ink }}>
              {fr ? 'C’est fait : retirées d’Opla' : 'Done: removed from Opla'}
            </button>
          )}
          {userId && (g.mur ?? 'connexion') === 'connexion' && (
            <BoutonMeConnecter userId={userId} platform={g.platform} motif={motifDe(g.lignes[0]?.job)} lang={lang} variante="bouton" style={{ alignItems: 'flex-start' }} />
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${S.borderSoft}` }}>
            {g.lignes.map((l) => (
              <li key={l.job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, lineHeight: '18px', color: S.ink }}>
                <PlatformLogo platform={g.platform} size={16} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{l.titre ?? (fr ? 'Article' : 'Item')}</span>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: l.vendu && !ambre ? S.rouge : S.ink2 }}>
                  {l.vendu ? (fr ? 'Vendu' : 'Sold') : l.fiche ? (fr ? 'En stock' : 'In stock') : (fr ? 'Fiche supprimée' : 'Item deleted')}
                </span>
              </li>
            ))}
          </ul>
        </div>
        );
      })}
      {aRetirer.map((groupe) => {
        const noms = [...new Set(groupe.map((j) => nomPlateforme(j.platform)))];
        const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${noms[noms.length - 1]}` : noms[0];
        const titre = groupe[0]?.title || (fr ? 'Article' : 'Item');
        return (
          <div key={`a-retirer|${groupe[0]?.id}`} data-a-retirer="" style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
                <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink, overflowWrap: 'anywhere' }}>
                {fr
                  ? <>Vendu : « {titre} ». Encore en ligne sur {liste} — {groupe.length > 1 ? `retirer ces ${groupe.length} annonces` : 'retirer cette annonce'} ?</>
                  : <>Sold: “{titre}”. Still live on {liste} — remove {groupe.length > 1 ? `these ${groupe.length} listings` : 'this listing'}?</>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {onRetirer && (
                <button type="button" className="sk-btn sk-presse" onClick={() => onRetirer(groupe)}
                  style={{ height: 40, padding: '0 16px', border: 'none', borderRadius: 999, background: DEGRADE, color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>
                  {fr ? `Retirer (${groupe.length})` : `Remove (${groupe.length})`}
                </button>
              )}
              {onPlusTard && (
                <button type="button" className="sk-btn sk-presse" onClick={() => onPlusTard(groupe)}
                  style={{ height: 40, padding: '0 16px', border: 'none', borderRadius: 999, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink2, fontSize: 13, fontWeight: 700 }}>
                  {fr ? 'Plus tard' : 'Later'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </EcranPlein>
  );
}
