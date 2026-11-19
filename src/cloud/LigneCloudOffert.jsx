// (19/11/2026, décision de Nico, point 5) LA LIGNE D'UN CLOUD OFFERT dans la fenêtre d'offres — à la place de toute offre du
// Cloud : « Ton Cloud offert revient avec ton abonnement Business. » (cloud/cloudOffert.js, phraseCloudOffert). Aucun bouton,
// aucun prix. Même allure que la ligne « déjà actif » (InterrupteurCloud.jsx, LigneCloudModale).
import { Cloud } from 'lucide-react';
import { C, MENTHE } from './theme';

export default function LigneCloudOffert({ phrase }) {
  if (!phrase) return null;
  return (
    <div data-cloud="offert" style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '10px 12px' }}>
      <span aria-hidden="true" style={{
        width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: MENTHE, border: '1px solid rgba(47,158,144,0.28)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Cloud size={16} color={C.tealDeep} strokeWidth={2.2} />
      </span>
      <span style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>{phrase}</span>
    </div>
  );
}
