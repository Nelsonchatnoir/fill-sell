// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE BLOC LIVRAISON (2026-09-20, demande de Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Il serait intéressant de pouvoir choisir les transporteurs que l'on
//  souhaite. Par exemple, sur un adaptateur laitière, je choisis lettre
//  suivie, que je ne peux pas choisir pour un rangement. »
//
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS :
//   · il montre le FORMAT que Leboncoin retiendra — déduit de ce que la
//     personne a déjà dit, jamais redemandé (règle G3) ;
//   · il laisse CHOISIR les transporteurs, parce que ça, le vendeur seul le
//     sait — et il ne l'exige jamais : sans choix, Leboncoin garde son
//     réglage habituel, qui est juste.
//
// ⛔ ZÉRO FRICTION : le bloc est REPLIÉ. Qui ne l'ouvre pas ne tape rien, et
//    le compte de gestes ne bouge pas d'un pouce.
// ⛔ CE N'EST PAS UNE QUESTION DU STEPPER : aucun champ obligatoire, aucun
//    blocage du bouton Publier, aucune pastille rouge. C'est un réglage.

import { useState } from 'react';
import { Truck, Check } from 'lucide-react';
import { UI } from './ui';
import { LBC_TRANSPORTEURS, LBC_FORMATS, formatLbcDuJob, transporteursPlausibles } from '../utils/leboncoinColis';

const MOTS = {
  fr: {
    titre: 'LIVRAISON', ouvrir: 'Régler', fermer: 'Fermer',
    format: 'Format du colis',
    formatDeduit: (f) => `${f} — déduit de ce que tu as indiqué`,
    formatInconnu: 'Leboncoin estimera lui-même le format.',
    transporteurs: 'Transporteurs',
    tousParDefaut: 'Tous ceux que Leboncoin propose',
    nChoisis: (n) => `${n} choisi${n > 1 ? 's' : ''}`,
    aide: 'Décoche ceux que tu ne veux pas. Sans choix, Leboncoin garde son réglage habituel.',
    horsBornes: 'Trop lourd ou trop grand pour ce transporteur',
    remettreTout: 'Tout remettre',
  },
  en: {
    titre: 'DELIVERY', ouvrir: 'Set up', fermer: 'Close',
    format: 'Parcel size',
    formatDeduit: (f) => `${f} — from what you already told us`,
    formatInconnu: 'Leboncoin will estimate the size itself.',
    transporteurs: 'Carriers',
    tousParDefaut: 'All the ones Leboncoin offers',
    nChoisis: (n) => `${n} selected`,
    aide: 'Untick the ones you do not want. With no choice, Leboncoin keeps its usual setting.',
    horsBornes: 'Too heavy or too large for this carrier',
    remettreTout: 'Reset',
  },
};

export default function CarteLivraisonLeboncoin({ lang = 'fr', champs = {}, onChange }) {
  const T = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [ouvert, setOuvert] = useState(false);

  // UNE seule règle (24/09) : format_colis fait foi, lbcFormatColis n'est
  // qu'un repli des jobs d'avant — la même que l'extension (formatLbcDuJob).
  const format = formatLbcDuJob(champs);
  const plausibles = transporteursPlausibles(format);
  const choisis = Array.isArray(champs.lbcTransporteurs) ? champs.lbcTransporteurs : null;
  // Sans choix explicite, la coche suit ce que Leboncoin proposerait.
  const estCoche = (nom) => (choisis ? choisis.includes(nom) : true);

  const basculer = (nom) => {
    const base = choisis ?? LBC_TRANSPORTEURS.map((t) => t.nom);
    const suite = base.includes(nom) ? base.filter((n) => n !== nom) : [...base, nom];
    onChange?.('lbcTransporteurs', suite);
  };

  const st = {
    bloc: { border: `1px solid ${UI.border}`, borderRadius: 14, padding: 12, background: UI.paper, marginBottom: 12 },
    eyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: UI.mute2 },
    lien: { background: 'none', border: 'none', color: UI.tealDeep, fontWeight: 700, fontSize: 12.5,
            cursor: 'pointer', fontFamily: 'inherit', padding: '6px 2px', flexShrink: 0 },
    ligne: { display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left',
             padding: '9px 10px', borderRadius: 10, border: `1px solid ${UI.border}`, background: UI.card,
             cursor: 'pointer', fontFamily: 'inherit', marginTop: 6 },
    petit: { fontSize: 11, color: UI.mute2, lineHeight: 1.4 },
  };

  return (
    <div style={st.bloc}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={st.eyebrow}>{T.titre}</span>
        <button type="button" style={st.lien} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? T.fermer : T.ouvrir}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
        <Truck size={15} color={UI.tealDeep} style={{ flexShrink: 0, marginTop: 3 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: UI.ink, lineHeight: 1.3 }}>
            {format ? T.formatDeduit(format) : T.formatInconnu}
          </div>
          <div style={{ ...st.petit, marginTop: 2 }}>
            {choisis ? T.nChoisis(choisis.length) : T.tousParDefaut}
          </div>
        </div>
      </div>

      {ouvert && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...st.eyebrow, marginBottom: 2 }}>{T.format}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {LBC_FORMATS.map((f) => {
              const actif = format === f.valeur;
              return (
                <button key={f.valeur} type="button" title={f.aide}
                  onClick={() => {
                    // Le sélecteur « Format du colis » de la copie et ces puces
                    // écrivent désormais LA MÊME clé : ils ne peuvent plus se
                    // contredire (13 jobs de Louis « Petit » contre « Moyen »).
                    onChange?.('format_colis', actif ? '' : f.valeur);
                    onChange?.('lbcFormatColis', '');
                  }}
                  style={{ padding: '7px 11px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer',
                           fontWeight: actif ? 700 : 600,
                           border: `1px solid ${actif ? UI.tealDeep : UI.border}`,
                           background: actif ? '#E8F5F3' : UI.card, color: actif ? UI.tealDeep : UI.mute2 }}>
                  {f.valeur}
                </button>
              );
            })}
          </div>

          <div style={{ ...st.eyebrow, marginBottom: 2 }}>{T.transporteurs}</div>
          <div style={st.petit}>{T.aide}</div>
          {LBC_TRANSPORTEURS.map((t) => {
            const coche = estCoche(t.nom);
            const horsBornes = plausibles != null && !plausibles.includes(t.cle);
            return (
              <button key={t.cle} type="button" onClick={() => basculer(t.nom)} style={st.ligne}>
                <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, marginTop: 1,
                               border: `1.5px solid ${coche ? UI.tealDeep : UI.border}`,
                               background: coche ? UI.tealDeep : 'transparent',
                               display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {coche && <Check size={11} color="#fff" strokeWidth={3} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: UI.ink }}>{t.nom}</span>
                  <span style={{ ...st.petit, display: 'block', marginTop: 1 }}>
                    {`Jusqu’à ${t.kgMax} kg · ${t.remise} · ${t.contrainte}`}
                  </span>
                  {horsBornes && (
                    <span style={{ fontSize: 11, color: '#92400E', display: 'block', marginTop: 2 }}>{T.horsBornes}</span>
                  )}
                </span>
              </button>
            );
          })}
          {choisis && (
            <button type="button" onClick={() => onChange?.('lbcTransporteurs', null)}
              style={{ ...st.lien, marginTop: 6 }}>{T.remettreTout}</button>
          )}
        </div>
      )}
    </div>
  );
}
