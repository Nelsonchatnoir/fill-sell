// ═══════════════════════════════════════════════════════════════════════════
// FICHE ARTICLE › LES TRANSPORTEURS LEBONCOIN DE L'ARTICLE (19/11/2026, Louis — décision de Nico, point b)
// ═══════════════════════════════════════════════════════════════════════════
// Sous le format du colis : les transporteurs que Leboncoin propose, cochés pour CET article (un adaptateur en Courrier
// suivi, un rangement sans). Écrit sur la fiche au geste (attributs.transporteurs_lbc, utils/transporteursLbcFiche.js) :
// la publication — en lot comme à l'unité — les prend avant le choix du compte, bornés au poids. « Comme le compte » :
// aucun choix pour l'article (le choix retenu du compte vaut, sinon ceux que Leboncoin propose).
import { useState } from 'react';
import { LBC_TRANSPORTEURS, transporteursPourPoids } from '../utils/leboncoinColis';
import { CLE_TRANSPORTEURS_LBC, transporteursDeLaFiche, choixTransporteursPourLaFiche, basculerTransporteur } from '../utils/transporteursLbcFiche';

export default function TransporteursLbcFiche({ item, supabase, userId, lang = 'fr', onRange = () => {} }) {
  const fr = lang !== 'en';
  const [etat, setEtat] = useState(null); // null | 'en_cours' | 'ok' | 'rate'
  if (!item || item.id == null) return null; // une fiche pas encore créée : rien à écrire, le choix vient ensuite
  const choisis = transporteursDeLaFiche(item.attributs ?? null);
  const g = Number(item.poids_g);
  const poids = Number.isFinite(g) && g > 0 ? g : null;
  const permis = transporteursPourPoids(poids);
  const ecrire = async (attributs) => {
    if (!attributs || !supabase || !userId || item.id == null) return;
    setEtat('en_cours');
    const { error } = await supabase.from('inventaire').update({ attributs }).eq('id', item.id).eq('user_id', userId).select('id');
    if (error) { setEtat('rate'); console.warn('[fiche] transporteurs Leboncoin non gardés :', error.message); return; }
    setEtat('ok');
    onRange(attributs);
  };
  const basculer = (nom) => {
    const suite = basculerTransporteur(choisis, nom);
    if (!suite.length) return; // au moins un transporteur
    ecrire(choixTransporteursPourLaFiche(suite));
  };
  // « auto » : plus aucun choix pour l'article (la fusion des attributs ne sait pas effacer une clé).
  const commeLeCompte = () => ecrire({ [CLE_TRANSPORTEURS_LBC]: { v: 'auto', source: 'manuel', at: new Date().toISOString() } });
  return (
    <div data-transporteurs-fiche="" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#5C6560', marginBottom: 4 }}>{fr ? 'Transporteurs (Leboncoin)' : 'Carriers (Leboncoin)'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {LBC_TRANSPORTEURS.map((t) => {
          const tropLourd = !permis.includes(t.nom);
          const on = (choisis ?? LBC_TRANSPORTEURS.map((x) => x.nom)).includes(t.nom) && !tropLourd;
          return (
            <button key={t.cle} type="button" onClick={() => basculer(t.nom)} aria-pressed={on} disabled={tropLourd || etat === 'en_cours'}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '8px 10px', borderRadius: 10, fontFamily: 'inherit', cursor: tropLourd ? 'default' : 'pointer',
                border: `1px solid ${on && choisis ? '#2F9E90' : '#E7E3D8'}`, background: on && choisis ? '#E7F3F0' : '#fff', opacity: tropLourd ? 0.55 : 1 }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: '#fff',
                background: on ? '#2F9E90' : '#fff', border: `1.5px solid ${on ? '#2F9E90' : '#C9C4B6'}` }}>{on ? '✓' : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#10201B' }}>{t.nom}</span>
                <span style={{ display: 'block', fontSize: 11, color: '#5C6560' }}>
                  {fr ? `Jusqu'à ${t.kgMax} kg · ${t.remise}` : `Up to ${t.kgMax} kg · ${t.remiseEn ?? t.remise}`}{tropLourd ? (fr ? ' · trop lourd pour cet article' : ' · too heavy for this item') : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4, color: '#8A8578' }}>
        {choisis
          ? (fr ? 'Choisis pour cet article : ils passent devant le choix de ton compte, en lot comme à l’unité. ' : 'Chosen for this item: they go before your account’s choice, in a batch or one by one. ')
          : (fr ? 'Comme ton compte (sinon ceux que Leboncoin propose). Coche ou décoche pour choisir pour cet article. ' : 'Same as your account (or those Leboncoin offers). Tick or untick to choose for this item. ')}
        {choisis ? <button type="button" onClick={commeLeCompte} disabled={etat === 'en_cours'} style={{ border: 'none', background: 'none', padding: 0, color: '#1B6E62', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>{fr ? 'Revenir au choix du compte' : 'Back to the account’s choice'}</button> : null}
        {etat === 'ok' ? <span style={{ color: '#1B6E62', fontWeight: 700 }}>{fr ? ' · Gardé sur la fiche.' : ' · Saved on the item.'}</span> : null}
        {etat === 'rate' ? <span style={{ color: '#9A3412', fontWeight: 700 }}>{fr ? ' · Pas enregistré — réessaie.' : ' · Not saved — try again.'}</span> : null}
      </div>
    </div>
  );
}
