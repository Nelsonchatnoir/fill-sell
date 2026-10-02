// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « SORTIE D'OPLA » (02/10/2026, décisions de Nico, lots A6 + C)
// ═══════════════════════════════════════════════════════════════════════════
// Montré à TOUT LE MONDE, en haut du tableau de bord, jamais pendant
// l'inscription ni l'entrée (App.jsx). Deux variantes, textes EXACTS de Nico :
//   · 'relie'   — le dressing Opla du compte est synchronisé (règle unique :
//                 _shared/opla-sortie.js, oplaRelie) : ce qui continue, ce qui
//                 s'arrête le 10 octobre ;
//   · 'general' — tous les autres comptes, nouveaux inscrits compris.
// « J'ai compris » le fait disparaître POUR TOUJOURS : la trace est écrite
// côté serveur, par compte (usage_logs, feature 'opla_bandeau') — un autre
// téléphone, un autre navigateur ne le remontrent pas.
import { useId, useState } from 'react';
import { RefreshCw, ShieldCheck, Ban, Check, Sparkles } from 'lucide-react';
import { OPLA_SORTIE } from '../../supabase/functions/_shared/opla-sortie.js';
import { toucherLeger } from '../utils/retourHaptique';
import './CarteInfo.css';

const TEXTES_BANDEAU_OPLA = Object.freeze({
  relie: Object.freeze({
    pastille: 'Changement de plateforme',
    titre: 'Opla : on arrête la publication',
    texte: `Opla demande désormais une somme importante pour garder son accès. On a refusé : ce n'est pas à toi de payer pour ça. À partir du ${OPLA_SORTIE.DATE_TEXTE}, FillSell ne publie et ne republie plus sur Opla.`,
    lignes: [
      { ton: 'continue', icone: RefreshCw, texte: 'Tes annonces Opla restent synchronisées' },
      { ton: 'continue', icone: ShieldCheck, texte: 'Ventes détectées, copies retirées ailleurs' },
      { ton: 'arret', icone: Ban, texte: 'Plus de publication ni de remise en avant' },
    ],
    pied: 'Vinted, Leboncoin, eBay et Beebs continuent normalement.',
    bouton: "J'ai compris",
  }),
  general: Object.freeze({
    pastille: 'Changement de plateforme',
    titre: 'Opla quitte FillSell',
    texte: "Opla demande désormais une somme importante pour rester accessible depuis FillSell. On a refusé : ce n'est pas à toi de payer pour ça, et on ne fera pas grimper le prix de ton abonnement pour eux.",
    lignes: [
      { ton: 'continue', icone: Check, texte: 'Vinted, Leboncoin, eBay et Beebs continuent normalement' },
      { ton: 'continue', icone: Sparkles, texte: 'De nouvelles plateformes arrivent' },
    ],
    pied: null,
    bouton: "J'ai compris",
  }),
});

export default function BandeauSortieOpla({ variante = 'relie', onCompris }) {
  const idTitre = useId();
  const [sortie, setSortie] = useState(false);
  const T = TEXTES_BANDEAU_OPLA[variante] ?? TEXTES_BANDEAU_OPLA.general;
  const compris = () => {
    toucherLeger();
    setSortie(true);
    // Le fondu de sortie (200 ms) puis la disparition ; sans animation
    // (réduire les animations), la carte part tout de suite.
    const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    setTimeout(() => onCompris?.(), reduit ? 0 : 200);
  };
  return (
    <section className={`fsc${sortie ? ' fsc-sortie' : ''}`} aria-labelledby={idTitre} data-variante={variante}>
      <span className="fsc-pastille">{T.pastille}</span>
      <h2 id={idTitre} className="fsc-titre">{T.titre}</h2>
      <p className="fsc-texte">{T.texte}</p>
      <ul className="fsc-lignes">
        {T.lignes.map((l) => {
          const Icone = l.icone;
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
      {T.pied && <p className="fsc-pied">{T.pied}</p>}
      <div className="fsc-actions">
        <button type="button" className="fsc-btn fsc-btn-principal" onClick={compris} disabled={sortie}>
          {T.bouton}
        </button>
      </div>
    </section>
  );
}
