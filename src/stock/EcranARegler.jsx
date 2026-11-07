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
// ⛔ (12/10 soir, Nico) PLUS AUCUN BANDEAU : TOUS les problèmes vivent ICI, et
//    nulle part ailleurs — un article vendu encore en ligne est UNE ligne
//    (son titre, la plateforme, le geste ; le tap ouvre sa fiche), les annonces
//    « plus en ligne — vendue ? » une ligne qui ouvre leurs questions. Même
//    ligne, mêmes polices, mêmes couleurs : jamais un bloc coloré.
// (18/10) Une ligne peut porter son GESTE (`action`, un élément : le bouton
//    « Se reconnecter » d'une boutique qui n'est plus surveillée) : elle n'ouvre
//    alors aucun écran — le texte dit le risque, le bouton est le seul geste.
//    Même ligne, mêmes polices ; pas de chevron, pas de nombre.
// (07/11, Nico) Une ligne peut se RETIRER DE LA LISTE (`onRetirer`, promesse { ok, message? }, et `phraseRetrait`) :
//    un lien discret sous la ligne, puis la phrase qui dit ce que le geste ne fait pas et « Oui, retirer » /
//    « Non, garder ». Jamais un bouton dans un bouton : la ligne et son geste sont deux blocs frères. La mémoire et la
//    règle du fait nouveau vivent ailleurs (utils/retraitARegler, StockTab) : l'écran ne fait que proposer.
import { useState } from 'react';
import { ChevronRight, CircleAlert, BadgeEuro, Tag, PenLine, AlertTriangle, UserRound, Store, EyeOff, Wallet, LogIn, Unplug } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S } from './jetons';
import { nombreFr } from './regles';

const ICONES = { non_surveillee: Unplug, retraits: AlertTriangle, lbc_identite: UserRound, vendeur_plateforme: Wallet, compte_plateforme: LogIn, attente: CircleAlert, ventes: BadgeEuro, prix: Tag, brouillons: PenLine, plus_en_ligne: EyeOff };
// (05/10) Une annonce vendue encore en ligne (retrait bloqué par une
// connexion) : rouge — un risque de double vente, pas une information à
// compléter. (12/10 soir) Une ligne peut dire son ton elle-même (`ton`) :
// la bonne boutique Vinted à ouvrir n'est jamais une alarme (ambre).
const ROUGES = new Set(['retraits']);

export default function EcranARegler({ lang = 'fr', lignes = [], onFermer, actif = true, pied = null }) {
  const fr = lang !== 'en';
  const total = lignes.reduce((t, l) => t + (l.n || 0), 0);
  // (07/11) « Retirer de la liste » : la ligne armée (sa clé), le geste en cours, le message d'un échec.
  const [retraitArme, setRetraitArme] = useState(null);
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [retraitMsg, setRetraitMsg] = useState(null);
  const retirer = async (l) => {
    setRetraitEnCours(true); setRetraitMsg(null);
    let r = null;
    try { r = await l.onRetirer(); } catch { r = null; }
    setRetraitEnCours(false);
    if (r?.ok) { setRetraitArme(null); return; }
    setRetraitMsg(r?.message ?? (fr ? 'Retrait de la liste impossible — réessaie.' : 'Could not remove it from the list — try again.'));
  };
  const blocRetrait = (l) => {
    if (typeof l.onRetirer !== 'function') return null;
    if (retraitArme !== l.cle) {
      return (
        <button type="button" className="sk-btn" data-retirer={l.cle} onClick={() => { setRetraitArme(l.cle); setRetraitMsg(null); }}
          style={{ display: 'inline-block', minHeight: 32, padding: '6px 0', border: 'none', background: 'transparent', color: S.ink2, fontSize: 12, lineHeight: '16px', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, textAlign: 'left' }}>
          {fr ? 'Retirer de la liste' : 'Remove from the list'}
        </button>
      );
    }
    return (
      <div data-retirer-arme={l.cle} style={{ marginTop: 4, padding: 12, borderRadius: 12, background: S.paper, boxShadow: `inset 0 0 0 1px ${S.border}` }}>
        {l.phraseRetrait && <div style={{ fontSize: 12, lineHeight: '18px', fontWeight: 500, color: S.ink, overflowWrap: 'anywhere' }}>{l.phraseRetrait}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="sk-btn" disabled={retraitEnCours} onClick={() => retirer(l)}
            style={{ flex: 1, minHeight: 40, borderRadius: 999, border: `1px solid ${S.tealDeep}`, background: '#FFFFFF', color: S.tealDeep, fontSize: 13, fontWeight: 700 }}>
            {retraitEnCours ? '…' : (fr ? 'Oui, retirer' : 'Yes, remove')}
          </button>
          <button type="button" className="sk-btn" disabled={retraitEnCours} onClick={() => { setRetraitArme(null); setRetraitMsg(null); }}
            style={{ flex: 1, minHeight: 40, borderRadius: 999, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink2, fontSize: 13, fontWeight: 600 }}>
            {fr ? 'Non, garder' : 'No, keep it'}
          </button>
        </div>
        {retraitMsg && <div style={{ marginTop: 8, fontSize: 12, lineHeight: '16px', fontWeight: 600, color: S.rouge }}>{retraitMsg}</div>}
      </div>
    );
  };
  // La phrase dit ce qu'il y a VRAIMENT, rien de plus.
  const present = (...cles) => lignes.some((l) => cles.includes(l.groupe ?? l.cle) && l.n > 0);
  const nbNonSurveillees = lignes.filter((l) => (l.groupe ?? l.cle) === 'non_surveillee' && l.n > 0).length;
  const parts = [
    nbNonSurveillees > 0 && (fr
      ? (nbNonSurveillees > 1 ? 'des boutiques qui ne sont plus surveillées' : 'une boutique qui n’est plus surveillée')
      : (nbNonSurveillees > 1 ? 'shops that are no longer watched' : 'a shop that is no longer watched')),
    present('vendus', 'retraits') && (fr ? 'des annonces encore en ligne à retirer' : 'live listings to remove'),
    present('lbc_identite') && (fr ? 'ton compte Leboncoin à compléter' : 'your Leboncoin account to complete'),
    present('vendeur_plateforme') && (fr ? 'ta configuration de vendeur à terminer' : 'your seller setup to finish'),
    present('compte_plateforme') && (fr ? 'une connexion ou un compte à regarder' : 'a sign-in or account to look at'),
    present('attente') && (fr ? 'des annonces qui attendent ton geste' : 'listings waiting on you'),
    present('a_verifier') && (fr ? 'des annonces à vérifier' : 'listings to check'),
    present('ventes', 'plus_en_ligne') && (fr ? 'des ventes à confirmer' : 'sales to confirm'),
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
            // Une ligne d'ARTICLE (vendu, encore en ligne) : son titre, sa
            // plateforme et le geste — pas de nombre (c'est UN article).
            const I = l.icone ?? (l.groupe === 'vendus' ? (l.ton === 'regler' ? Store : AlertTriangle) : (ICONES[l.cle] ?? ICONES[l.groupe] ?? CircleAlert));
            const rouge = l.ton ? l.ton === 'echec' : ROUGES.has(l.cle);
            const pastille = (
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rouge ? S.rougeFond : S.ambreFond, color: rouge ? S.rouge : S.ambreEncre }}>
                <I size={20} strokeWidth={2} aria-hidden="true" />
              </span>
            );
            // (18/10) Une ligne qui porte son geste : un bloc (pas un bouton —
            // jamais un bouton dans un bouton), le texte puis le geste.
            if (l.action) {
              return (
                <div key={l.cle} role="group" aria-label={l.titre} data-ligne={l.groupe ?? l.cle}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', minHeight: 64, padding: '12px 16px', boxSizing: 'border-box', boxShadow: `inset 0 -1px 0 ${S.borderSoft}`, color: S.ink }}>
                  {pastille}
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span>
                      <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700, overflowWrap: 'anywhere' }}>{l.titre}</span>
                      {l.detail && <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, marginTop: 2, overflowWrap: 'anywhere' }}>{l.detail}</span>}
                    </span>
                    {l.action}
                    {blocRetrait(l)}
                  </span>
                </div>
              );
            }
            // (07/11) Une ligne qui peut se retirer : la ligne (même bouton qu'avant), puis son geste dessous, dans un
            // bloc qui porte le séparateur.
            const retrait = blocRetrait(l);
            const ligne = (
              <button key={retrait ? undefined : l.cle} type="button" className="sk-btn sk-presse" onClick={l.onOuvrir} data-ligne={l.groupe ?? l.cle}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '8px 16px', boxSizing: 'border-box', border: 'none', background: 'transparent', boxShadow: retrait ? 'none' : `inset 0 -1px 0 ${S.borderSoft}`, textAlign: 'left', color: S.ink }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rouge ? S.rougeFond : S.ambreFond, color: rouge ? S.rouge : S.ambreEncre }}>
                  <I size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                {!l.article && (
                  <span className="sk-chiffres" style={{ minWidth: 32, flexShrink: 0, fontSize: 24, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.03em' }}>{nombreFr(l.n, lang)}</span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700, overflowWrap: 'anywhere' }}>{l.titre}</span>
                  {l.detail && <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, marginTop: 2, overflowWrap: 'anywhere' }}>{l.detail}</span>}
                </span>
                <ChevronRight size={20} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />
              </button>
            );
            if (!retrait) return ligne;
            return (
              <div key={l.cle} data-ligne-bloc={l.groupe ?? l.cle} style={{ boxShadow: `inset 0 -1px 0 ${S.borderSoft}` }}>
                {ligne}
                <div style={{ padding: '0 16px 10px 68px' }}>{retrait}</div>
              </div>
            );
          })}
        </div>
      )}
      {pied}
    </EcranPlein>
  );
}
