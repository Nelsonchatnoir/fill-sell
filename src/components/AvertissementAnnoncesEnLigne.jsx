// ── « Encore en ligne » — UN avertissement pour LES DEUX chemins de vente ────
// (2026-08-11) Deux portes mènent à la même écriture de vente :
//   1. la modale « Marquer comme vendu » de la ligne de stock (App.jsx) ;
//   2. la carte de confirmation de l'intent vocal inventory_sell
//      (VoiceResultCard, « Confirmer la vente ? »).
// Aucune des deux ne retire quoi que ce soit des plateformes : ni confirmSell
// ni confirmSellDirect n'arment de job delete (vérifié). L'annonce reste donc
// achetable après la vente — d'où cet avertissement.
//
// CE FICHIER EST LE SEUL ENDROIT OÙ ÇA SE DIT. Une formulation, un calcul, deux
// points de montage : ne recopier ni le texte ni la liste dans un appelant. Le
// calcul lui-même vit dans utils/publicationState.js (annoncesEncoreEnLigne),
// avec le reste de l'état de publication.
//
// Rendu volontairement muet tant que la lecture des jobs n'a pas répondu : un
// avertissement qui clignote « rien » puis « 3 plateformes » se lit comme un
// bug. Il n'empêche jamais de confirmer — la vente est vraie, c'est le retrait
// des annonces qui reste à faire.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { annoncesEncoreEnLigne } from '../utils/publicationState';
import { PLATFORM_LABELS } from '../utils/shared';
import { V } from './voice/tokens';

// null tant que la lecture n'a pas abouti, puis [{ platform, url }].
// Non exportée : les deux appelants montent le composant, jamais le hook — et
// un fichier qui exporte autre chose que des composants casse le fast refresh.
function useAnnoncesEncoreEnLigne(item) {
  const invId = item?.id ?? null;
  // La lecture est mémorisée AVEC l'id qu'elle décrit : si l'article change
  // (carte vocale qui bascule d'un candidat à l'autre), l'ancienne réponse ne
  // vaut plus et le rendu repasse en « lecture en cours » sans setState de
  // remise à zéro — donc sans rendu en cascade.
  const [lu, setLu] = useState({ invId: null, jobs: [] });
  useEffect(() => {
    // Vente directe (article jamais entré en stock) : rien à lire, rien à dire.
    if (invId == null) return;
    let annule = false;
    (async () => {
      // ⛔ Colonnes vérifiées, identiques au poll du Stock : cross_post_jobs n'a
      // PAS d'updated_at, et un select PostgREST est tout ou rien — une colonne
      // inconnue ne dégrade pas, elle annule la requête entière.
      // Pas de filtre user_id : la RLS « Users manage own cross_post_jobs » le
      // fait déjà, et inventaire_id est propre à l'utilisateur.
      const { data, error } = await supabase
        .from('cross_post_jobs')
        .select('id, inventaire_id, platform, status, action, created_at, listing_url, platform_fields')
        .eq('inventaire_id', invId)
        .in('status', ['pending', 'processing', 'published', 'deleted']);
      if (annule) return;
      // Lecture en échec : on n'invente pas d'annonces en ligne. La vente n'est
      // jamais bloquée par un aléa réseau — on se tait, comme pour un article
      // jamais publié.
      if (error) console.error('[annoncesEncoreEnLigne]', error.message);
      setLu({ invId, jobs: error || !data ? [] : data });
    })();
    return () => { annule = true; };
  }, [invId]);
  if (invId == null) return [];
  if (lu.invId !== invId) return null; // lecture pas encore aboutie POUR CET article
  return annoncesEncoreEnLigne(item, lu.jobs);
}

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
        ⚠️ {fr ? `Encore en ligne sur ${enumerer(noms, fr)}` : `Still online on ${enumerer(noms, fr)}`}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: V.amberInk, opacity: 0.92, lineHeight: 1.45 }}>
        {fr
          ? "Enregistrer la vente ne retire pas l'annonce — retire-la toi-même, sinon elle peut être achetée une deuxième fois."
          : 'Recording the sale does not take the listing down — remove it yourself, or it can be bought a second time.'}
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
