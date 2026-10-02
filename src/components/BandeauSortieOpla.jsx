// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « SORTIE D'OPLA » (02/10/2026, décision de Nico, lots A6 + C)
// ═══════════════════════════════════════════════════════════════════════════
// Montré UNIQUEMENT aux comptes dont le dressing Opla est synchronisé (règle
// unique : _shared/opla-sortie.js, oplaRelie), en haut du tableau de bord.
// « J'ai compris » le fait disparaître POUR TOUJOURS : la trace est écrite
// côté serveur, par compte (usage_logs, feature 'opla_bandeau') — un autre
// téléphone, un autre navigateur ne le remontrent pas.
// Texte EXACT de Nico ; seule la date est celle du jour où le serveur a cessé
// de publier sur Opla (OPLA_SORTIE.DATE_TEXTE).
import { useId, useState } from 'react';
import { RefreshCw, ShieldCheck, Ban } from 'lucide-react';
import { OPLA_SORTIE } from '../../supabase/functions/_shared/opla-sortie.js';
import { toucherLeger } from '../utils/retourHaptique';
import './CarteInfo.css';

export const TEXTES_BANDEAU_OPLA = Object.freeze({
  pastille: 'Changement de plateforme',
  titre: 'Opla : on arrête la publication',
  texte: `Opla demande 1 000 € par mois pour garder son accès. On a refusé : ce n'est pas à toi de payer pour ça. À partir du ${OPLA_SORTIE.DATE_TEXTE}, FillSell ne publie et ne republie plus sur Opla.`,
  lignes: [
    { ton: 'continue', texte: 'Tes annonces Opla restent synchronisées' },
    { ton: 'continue', texte: 'Ventes détectées, copies retirées ailleurs' },
    { ton: 'arret', texte: 'Plus de publication ni de remise en avant' },
  ],
  pied: 'Vinted, Leboncoin, eBay et Beebs continuent normalement.',
  bouton: "J'ai compris",
});

const ICONES = [RefreshCw, ShieldCheck, Ban];

export default function BandeauSortieOpla({ onCompris }) {
  const idTitre = useId();
  const [sortie, setSortie] = useState(false);
  const T = TEXTES_BANDEAU_OPLA;
  const compris = () => {
    toucherLeger();
    setSortie(true);
    // Le fondu de sortie (200 ms) puis la disparition ; sans animation
    // (réduire les animations), la carte part tout de suite.
    const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    setTimeout(() => onCompris?.(), reduit ? 0 : 200);
  };
  return (
    <section className={`fsc${sortie ? ' fsc-sortie' : ''}`} aria-labelledby={idTitre}>
      <span className="fsc-pastille">{T.pastille}</span>
      <h2 id={idTitre} className="fsc-titre">{T.titre}</h2>
      <p className="fsc-texte">{T.texte}</p>
      <ul className="fsc-lignes">
        {T.lignes.map((l, i) => {
          const Icone = ICONES[i];
          return (
            <li key={l.texte} className="fsc-ligne">
              <span className={`fsc-ico ${l.ton === 'arret' ? 'fsc-ico-arret' : 'fsc-ico-continue'}`} aria-hidden="true">
                <Icone strokeWidth={2.2} />
              </span>
              <span>{l.texte}</span>
            </li>
          );
        })}
      </ul>
      <p className="fsc-pied">{T.pied}</p>
      <div className="fsc-actions">
        <button type="button" className="fsc-btn fsc-btn-principal" onClick={compris} disabled={sortie}>
          {T.bouton}
        </button>
      </div>
    </section>
  );
}
