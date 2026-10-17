// ═══════════════════════════════════════════════════════════════════════════
// STOCK — « CONNEXION ET COMPTE » (18/10, lot 4.2) : la session d'une plateforme
// est perdue dans Chrome, ou Vinted a restreint le compte. UNE ligne dans
// « À régler », cet écran la détaille : une carte par plateforme, le geste
// (se connecter sur son ordinateur), « Masquer » par plateforme (le masque
// tombe quand la session revient), et le rappel du réglage global.
// Règle : src/utils/alertesCompte.js. Aucune écriture d'annonce, aucun job.
import { useState } from 'react';
import { LogIn, ShieldAlert } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S, DEGRADE, OMBRE } from './jetons';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { fusionnerReglages } from '../utils/reglagesPlateformes';
import { CLE_REGLAGE_ALERTES } from '../utils/alertesCompte';
import { NOMS_PLATEFORME, ADRESSE_CONNEXION } from '../utils/connexionPlateformes';

// Noms et adresses : la table de connexionPlateformes (UNE seule dans l'app — jamais une plateforme écrite en dur ici).

export default function EcranAlertesCompte({ lang = 'fr', alertes = [], onMasque, onFermer }) {
  const fr = lang !== 'en';
  const [enCours, setEnCours] = useState(null);
  const masquer = async (a) => {
    const cle = a.kind === 'restriction' ? 'vinted_restriction' : a.platform;
    const valeur = a.kind === 'restriction' ? (a.fin ? new Date(a.fin).toISOString() : true) : true;
    setEnCours(cle);
    try {
      const { data, error } = await fusionnerReglages([CLE_REGLAGE_ALERTES, 'masquees'], { [cle]: valeur });
      if (error) throw error;
      onMasque?.(data?.[CLE_REGLAGE_ALERTES] ?? null);
    } catch { /* relu au prochain passage */ }
    setEnCours(null);
  };
  return (
    <EcranPlein lang={lang} titre={fr ? 'Connexion et compte' : 'Sign-in and account'} onFermer={onFermer}>
      <div style={{ marginTop: 16 }}>
        <div className="sk-chiffres" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
          {fr ? `${alertes.length} chose${alertes.length > 1 ? 's' : ''} à regarder` : `${alertes.length} thing${alertes.length > 1 ? 's' : ''} to look at`}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
          {fr
            ? 'Tant qu’une connexion manque, FillSell ne voit ni tes ventes ni tes annonces sur cette plateforme. Rien n’a été touché.'
            : 'While a sign-in is missing, FillSell sees neither your sales nor your listings on that platform. Nothing was changed.'}
        </div>
      </div>
      {alertes.map((a) => {
        const cle = a.kind === 'restriction' ? 'vinted_restriction' : a.platform;
        const nom = NOMS_PLATEFORME[a.platform] ?? a.platform;
        return (
          <div key={cle} style={{ marginTop: 12, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
                {a.kind === 'restriction' ? <ShieldAlert size={20} strokeWidth={2} aria-hidden="true" /> : <LogIn size={20} strokeWidth={2} aria-hidden="true" />}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
                  <PlatformLogo platform={a.platform} size={16} />
                  {a.kind === 'restriction'
                    ? (fr ? `Vinted a restreint ton compte${a.jusquau ? ` jusqu'au ${a.jusquau}` : ''}` : `Vinted restricted your account${a.jusquau ? ` until ${a.jusquau}` : ''}`)
                    : (fr ? `${nom} : tu n’es plus connecté sur ton ordinateur` : `${nom}: you are no longer signed in on your computer`)}
                </span>
                <span style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
                  {a.kind === 'restriction'
                    ? (fr ? 'Aucune publication ni republication Vinted ne part d’ici là ; les retraits d’articles vendus continuent. Ça repart tout seul à la date indiquée.' : 'No Vinted publication or republication goes out until then; removals of sold items continue. It resumes on its own on that date.')
                    : (fr ? `Ouvre ${nom} dans le Chrome où l’extension est installée et connecte-toi. FillSell reprend tout seul, rien d’autre à faire.` : `Open ${nom} in the Chrome where the extension is installed and sign in. FillSell resumes on its own, nothing else to do.`)}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {a.kind !== 'restriction' && (
                <a href={ADRESSE_CONNEXION[a.platform] ?? '#'} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 12, padding: '0 16px', background: DEGRADE, color: '#FFFFFF', boxShadow: OMBRE.primaire, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  {fr ? `Ouvrir ${nom}` : `Open ${nom}`}
                </a>
              )}
              <button type="button" onClick={() => masquer(a)} disabled={enCours === cle}
                style={{ minHeight: 44, borderRadius: 12, padding: '0 16px', border: 'none', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink, fontSize: 14, fontWeight: 600, cursor: enCours === cle ? 'default' : 'pointer' }}>
                {enCours === cle ? (fr ? 'Un instant…' : 'One moment…') : (fr ? 'Masquer' : 'Hide')}
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 16, fontSize: 12, lineHeight: '18px', fontWeight: 500, color: S.ink2 }}>
        {fr
          ? 'Masquer ne touche à rien : l’alerte revient si la connexion est perdue de nouveau. Pour ne plus jamais être prévenu : Réglages › Préférences › Alertes de compte.'
          : 'Hide changes nothing: the alert comes back if the sign-in is lost again. To never be warned: Settings › Preferences › Account alerts.'}
      </div>
    </EcranPlein>
  );
}
