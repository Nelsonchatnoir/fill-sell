// ═══════════════════════════════════════════════════════════════════════════
// « DÉJÀ VENDU ? » EN TÊTE DU STOCK — LE RISQUE DE DOUBLE VENTE SE VOIT (03/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas nicolas.menar, « Doudou Nala » : la fiche Vinted est VENDUE, l'annonce
// eBay au même titre (377453677328) est toujours en vente. Rien ne prouve que
// c'est le même objet (un titre n'est jamais une preuve) : la question « Déjà
// vendu ? » existe depuis le 01/10 (inventaire_doublons, homonyme_vendu)…
// mais elle ne vivait qu'au fond de la carte « Mes annonces en ligne », sur une
// ligne grise. Deux jours sans réponse, une annonce peut-être vendue deux fois.
// Désormais ces questions-là — et elles seules — s'affichent en tête du Stock,
// avec l'annonce encore en ligne nommée. Même écran, même RPC, même geste :
// « Oui » retire l'annonce montrée (preuve de vente, décision Nico du 30/09),
// « Non » : deux articles différents, plus jamais reproposé.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import EcranDoublons from './EcranDoublons';
import { lireDoublonsProposes, pairesAffichables, estQuestionDejaVendu, annonceARetirer, nomPlateforme } from '../utils/doublons';

export default function BandeauDejaVendu({ lang = 'fr', userId, items, onDecision }) {
  const fr = lang !== 'en';
  const [doublons, setDoublons] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const recharger = useCallback(() => {
    if (!userId) return;
    lireDoublonsProposes(userId).then((d) => setDoublons(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);
  useEffect(() => { recharger(); }, [recharger]);

  const questions = useMemo(
    () => pairesAffichables(doublons, items).filter(estQuestionDejaVendu),
    [doublons, items],
  );
  if (!questions.length) return null;
  const premiere = questions[0];
  const annonce = annonceARetirer(premiere);
  const titre = premiere?.a?.title || premiere?.b?.title || '';
  const plateforme = annonce?.plateforme ? nomPlateforme(annonce.plateforme) : null;

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          background: '#FEF3C7', border: '1px solid #F59E0B', color: '#78350F',
          borderRadius: 16, padding: '11px 12px', marginBottom: 10,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={15} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>
              {questions.length > 1
                ? (fr ? `${questions.length} articles vendus ont peut-être encore une annonce en ligne` : `${questions.length} sold items may still have a listing online`)
                : (fr ? 'Déjà vendu ? Une annonce est peut-être encore en ligne' : 'Already sold? A listing may still be online')}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, marginTop: 2, opacity: 0.9 }}>
              {fr
                ? `« ${titre.slice(0, 60)} » est vendu${plateforme ? `, et une annonce ${plateforme} au même nom est toujours en vente` : ''}. Réponds pour éviter de le vendre deux fois.`
                : `“${titre.slice(0, 60)}” is sold${plateforme ? `, and a ${plateforme} listing with the same name is still for sale` : ''}. Answer to avoid selling it twice.`}
            </span>
          </span>
          <ChevronRight size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
        </div>
      </button>
      {ouvert && (
        <EcranDoublons
          lang={lang} items={items} doublons={questions}
          onClose={() => { setOuvert(false); recharger(); }}
          onDecision={() => { recharger(); onDecision?.(); }}
        />
      )}
    </>
  );
}
