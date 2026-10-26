// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › PRÉFÉRENCES — pseudo, langue, devise (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// DÉPLACEMENT PUR. Les trois réglages viennent de la pop-up, au geste près :
//   · pseudo   → UPDATE profiles.username, avec le `.select()` qui fait la
//     différence entre un enregistrement réel et un refus RLS silencieux
//     (sans lui, une policy UPDATE absente rend un faux « ✅ ») ;
//   · langue   → setLang + track('change_language'), comme avant ;
//   · devise   → saveCurrency(code), comme avant, avec son avertissement :
//     changer de devise ne convertit rien.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { track } from '../analytics/analytics';
import { SegmentedPills, Toggle } from '../components/ui';
import { R } from './theme';
import { Groupe, Carte, Champ, Bouton, Note } from './ReglagesUI';
import { fusionnerReglages } from '../utils/reglagesPlateformes';
import { CLE_REGLAGE_ALERTES } from '../utils/alertesCompte';
// (06/10) Notifications de ventes : ne rend RIEN sans le module natif.
import ReglageNotifications from '../notifications/ReglageNotifications';
// (18/10 nuit, point 1) Les réponses retenues par rayon : voir, oublier, vider.
import MemoireRayons from './MemoireRayons';
// (26/10, D3) Titre, description et prix : écrits par FillSell (défaut) ou à la demande (« Générer »).
import { useRedactionALaDemande } from '../utils/redactionALaDemande';

export default function SousPagePreferences({ c, T }) {
  const [pseudo, setPseudo] = useState(c.username ?? '');
  const [enregistrement, setEnregistrement] = useState(false);
  // (18/10, lot 4.2) Alertes de compte (session perdue, compte restreint) :
  // platform_settings.alertes_compte.desactivees — lu une fois, écrit par la
  // seule voie permise (platform_settings_fusionner). Actif par défaut.
  const [alertesActives, setAlertesActives] = useState(true);
  useEffect(() => {
    if (!c.user?.id) return undefined;
    let mort = false;
    supabase.from('profiles').select('platform_settings').eq('id', c.user.id).maybeSingle()
      .then(({ data }) => { if (!mort) setAlertesActives(data?.platform_settings?.[CLE_REGLAGE_ALERTES]?.desactivees !== true); })
      .catch(() => {});
    return () => { mort = true; };
  }, [c.user?.id]);
  const redaction = useRedactionALaDemande(c.user?.id ?? null);
  const basculerRedaction = async (on) => {
    const { ok } = await redaction.choisir(on);
    if (!ok) c.toast(T.erreurSauvegarde);
  };
  const basculerAlertes = async (on) => {
    setAlertesActives(on);
    const { error } = await fusionnerReglages([CLE_REGLAGE_ALERTES], { desactivees: !on });
    if (error) { setAlertesActives(!on); c.toast(T.erreurSauvegarde); }
  };

  const enregistrerPseudo = async () => {
    setEnregistrement(true);
    const val = pseudo.trim();
    // .select() : sans lui, un update filtré par RLS (0 ligne) ne renvoie PAS
    // d'erreur → faux « ✅ » (cas vécu : policy UPDATE absente).
    const { data, error } = await supabase.from('profiles').update({ username: val }).eq('id', c.user.id).select('username');
    setEnregistrement(false);
    if (error || !data?.length) { c.toast(T.erreurSauvegarde); return; }
    c.setUsername(val);
    c.toast(T.pseudoEnregistre);
  };

  return (
    <>
      <Groupe intitule={T.sProfil}>
        <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Champ
              label={T.pseudo}
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value.slice(0, 30))}
              placeholder={T.pseudoPlaceholder}
              autoComplete="nickname"
            />
            <Bouton onClick={enregistrerPseudo} enCours={enregistrement} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              {enregistrement ? '…' : T.enregistrer}
            </Bouton>
          </div>
          <div style={{ paddingTop: 14, borderTop: `1px solid ${R.ligneDouce}`, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{T.email}</span>
            <span style={{ fontSize: 15, color: R.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.user?.email}
            </span>
          </div>
        </Carte>
      </Groupe>

      <Groupe intitule={T.sAlertesCompte}>
        <Carte>
          <div className="rg-ligne" style={{ minHeight: 60, gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>{T.alertesCompte}</span>
              <span style={{ fontSize: 12, lineHeight: '17px', color: R.texteSecondaire }}>{T.alertesCompteNote}</span>
            </span>
            <Toggle checked={alertesActives} onChange={basculerAlertes} />
          </div>
        </Carte>
      </Groupe>

      <Groupe intitule={T.sRedaction}>
        <Carte>
          <div className="rg-ligne" style={{ minHeight: 60, gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>{T.redactionALaDemande}</span>
              <span style={{ fontSize: 12, lineHeight: '17px', color: R.texteSecondaire }}>{T.redactionALaDemandeNote}</span>
            </span>
            <Toggle checked={redaction.aLaDemande} onChange={basculerRedaction} />
          </div>
        </Carte>
      </Groupe>

      <Groupe intitule={T.sLangueDevise}>
        <Carte>
          <div className="rg-ligne" style={{ minHeight: 60 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: R.ink }}>{T.langue}</span>
            <SegmentedPills
              options={['fr', 'en']}
              value={c.lang}
              onChange={(l) => { track('change_language', { language: l }); c.setLang(l); }}
              labelFn={(l) => l.toUpperCase()}
              taille="lg"
            />
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label htmlFor="rg-devise" style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: R.ink }}>{T.devise}</label>
              <select
                id="rg-devise"
                value={c.currency}
                onChange={(e) => c.saveCurrency(e.target.value)}
                style={{
                  minHeight: 44, padding: '0 12px', borderRadius: 12, border: `1px solid ${R.border}`,
                  background: R.paper, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600,
                  color: R.ink, cursor: 'pointer', outline: 'none', maxWidth: '55%',
                }}
              >
                {['Europe', 'America', 'Africa', 'Asia/Pacific'].map((reg) => (
                  <optgroup
                    key={reg}
                    label={reg === 'America' && c.lang !== 'en' ? 'Amériques'
                      : reg === 'Africa' && c.lang !== 'en' ? 'Afrique'
                        : reg === 'Asia/Pacific' ? (c.lang === 'en' ? 'Asia & Pacific' : 'Asie & Pacifique') : reg}
                  >
                    {c.devises.filter((d) => d.reg === reg).map((d) => (
                      <option key={d.code} value={d.code}>{d.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </Carte>
        <Note>{T.deviseNote}</Note>
      </Groupe>

      <MemoireRayons c={c} T={T} />

      <ReglageNotifications lang={c.lang} />
    </>
  );
}
