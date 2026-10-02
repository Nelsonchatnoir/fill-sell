// ── « Encore en ligne » — UN avertissement pour LES DEUX chemins de vente ────
// (2026-08-11) Deux portes mènent à la même écriture de vente :
//   1. la modale « Marquer comme vendu » de la ligne de stock (App.jsx) —
//      depuis le 02/10 soir, elle montre son propre verdict, plus précis
//      (ChoixVenteModale : plateforme choisie, exemplaires restants) ;
//   2. la carte de confirmation de l'intent vocal inventory_sell
//      (VoiceResultCard, « Confirmer la vente ? »).
// Ni confirmSell ni confirmSellDirect n'arment de job delete eux-mêmes — MAIS
// depuis le 26/09 (migration article_vendu_retire_ses_copies, dossier
// Joséphine) la BASE le fait : dès que la fiche passe en vendu, chaque annonce
// encore en ligne reçoit un retrait (sans délai pour les copies prouvées, 02/10). L'annonce de la
// plateforme choisie comme lieu de la vente n'est pas touchée (c'est elle qui
// est vendue). L'avertissement annonce donc ce qui VA se passer, et comment
// plus « retire-la toi-même ».
//
// Les PHRASES vivent dans utils/venteModale.js (texteAvertissementEnLigne,
// verdictVente), la LECTURE dans ./annoncesEnLigneArticle, le CALCUL dans
// utils/publicationState.js (annoncesEncoreEnLigne) : ne recopier ni le texte
// ni la liste dans un appelant.
//
// Rendu volontairement muet tant que la lecture des jobs n'a pas répondu : un
// avertissement qui clignote « rien » puis « 3 plateformes » se lit comme un
// bug. Il n'empêche jamais de confirmer — la vente est vraie, et le retrait des
// autres annonces suit tout seul.
import { useAnnoncesEncoreEnLigne } from './annoncesEnLigneArticle';
import { PLATFORM_LABELS } from '../utils/shared';
import { texteAvertissementEnLigne } from '../utils/venteModale';
import { V } from './voice/tokens';

// Énumération lisible : « Vinted », « Vinted et eBay », « Vinted, Beebs et eBay ».
function enumerer(noms, fr) {
  if (noms.length <= 1) return noms[0] || '';
  return `${noms.slice(0, -1).join(', ')}${fr ? ' et ' : ' and '}${noms[noms.length - 1]}`;
}

export default function AvertissementAnnoncesEnLigne({ item, lang = 'fr', style }) {
  const enLigne = useAnnoncesEncoreEnLigne(item);
  if (!enLigne?.length) return null;
  const fr = lang !== 'en';
  const noms = enLigne.map(a => PLATFORM_LABELS[a.platform] || a.platform);
  const liens = enLigne.filter(a => a.url);
  return (
    <div style={{
      background: V.amberSoft, border: '1px solid rgba(232,149,109,0.38)', borderRadius: 14,
      padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 6, ...style,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: V.amberInk, lineHeight: 1.35 }}>
        ⚠️ {fr ? `En ligne sur ${enumerer(noms, fr)}` : `Online on ${enumerer(noms, fr)}`}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: V.amberInk, opacity: 0.92, lineHeight: 1.45 }}>
        {/* (02/10 soir) Le texte vit dans utils/venteModale.js : la base arme
            le retrait des copies prouvées sans délai (plus « dans 10 minutes »). */}
        {texteAvertissementEnLigne(lang)}
      </div>
      {liens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {liens.map(a => (
            <a key={a.platform} href={a.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 11.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                background: '#fff', border: '1px solid rgba(232,149,109,0.38)', borderRadius: 99,
                padding: '4px 10px', color: V.amberInk,
              }}>
              {PLATFORM_LABELS[a.platform] || a.platform} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
