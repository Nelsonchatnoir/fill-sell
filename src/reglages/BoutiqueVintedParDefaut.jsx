// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › MES PLATEFORMES › BOUTIQUE VINTED PAR DÉFAUT (15/10 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Seulement à partir de deux boutiques confirmées. Un article déjà lié à une
// boutique part toujours sur elle ; les autres partent sur la boutique choisie
// ici, ou — sans choix — sur celle ouverte dans le navigateur. Rien ne bloque :
// la file dit sur quelle boutique part chaque publication et permet d'en changer.
import { useState } from 'react';
import { useBoutiqueVintedParDefaut } from '../utils/boutiqueVintedParDefaut';
import { R } from './theme';
import { Groupe, Carte, Note } from './ReglagesUI';

export default function BoutiqueVintedParDefaut({ c }) {
  const en = c.lang === 'en';
  const reglage = useBoutiqueVintedParDefaut(c.user?.id);
  const [enCours, setEnCours] = useState(null);
  if (!reglage.lue || reglage.boutiques.length < 2) return null;
  const choisir = async (id) => {
    if (enCours) return;
    setEnCours(id ?? 'navigateur');
    const r = await reglage.enregistrer(id);
    setEnCours(null);
    c.toast?.(r.ok ? (en ? 'Saved' : 'Enregistré') : (en ? 'Could not save — try again' : 'Enregistrement impossible — réessaie'));
  };
  const options = [
    { id: null, libelle: en ? 'The shop open in my browser' : 'Celle ouverte dans mon navigateur' },
    ...reglage.boutiques.map((b) => ({ id: b.user_id, libelle: b.login ? `@${b.login}` : b.user_id })),
  ];
  return (
    <Groupe intitule={en ? 'Vinted shop for new listings' : 'Boutique Vinted des nouvelles annonces'}>
      <Carte>
        {options.map((o) => {
          const actif = (reglage.valeur ?? null) === (o.id ?? null);
          return (
            <button key={o.id ?? 'navigateur'} type="button" onClick={() => choisir(o.id)} aria-pressed={actif}
              className="rg-ligne"
              style={{ width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${R.ligneDouce}`, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', minHeight: 48, font: 'inherit' }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                border: `2px solid ${actif ? R.teal : R.texteSecondaire}`, display: 'grid', placeItems: 'center' }}>
                {actif && <span style={{ width: 8, height: 8, borderRadius: 999, background: R.teal }} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: R.ink }}>{o.libelle}</span>
              {enCours === (o.id ?? 'navigateur') && <span style={{ fontSize: 12, color: R.texteSecondaire }}>…</span>}
            </button>
          );
        })}
      </Carte>
      <Note>
        {en
          ? 'An item already linked to a shop always goes to that shop. The others go to the shop chosen here — you can still change it item by item in your queue. Never to a shop that is not on your FillSell account.'
          : 'Un article déjà lié à une boutique part toujours sur elle. Les autres partent sur la boutique choisie ici — tu peux toujours la changer article par article dans ta file. Jamais sur une boutique qui n’est pas sur ton compte FillSell.'}
      </Note>
    </Groupe>
  );
}
