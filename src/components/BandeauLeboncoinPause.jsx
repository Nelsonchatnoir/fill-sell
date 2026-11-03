// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « LEBONCOIN EST EN PAUSE » ET SON BOUTON « LEBONCOIN REMARCHE » (03/11, point 6)
// ═══════════════════════════════════════════════════════════════════════════
// Le message de pause Leboncoin promettait un bouton « Leboncoin remarche » qui n'existait pas : le voici. Montré
// seulement quand platform_settings.leboncoin.blocage_acces tient (posé, pas levé) — utils/pauseLeboncoin.js. Le geste
// relit la ligne JUSTE AVANT d'écrire, puis pose `essai_demande_le` par platform_settings_fusionner (la seule voie) :
// le serveur sert UNE action Leboncoin au prochain passage de l'ordinateur (etatBlocageLbc, « essai »).
// Lu à l'ouverture et au retour sur l'app (focus, onglet visible) — jamais en boucle.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from '../utils/reglagesPlateformes';
import { pauseLeboncoin, patchEssaiDemande, TEXTES_PAUSE_LBC } from '../utils/pauseLeboncoin';
import { C, BLANC, DEGRADE_TEAL, POLICE } from '../cloud/theme';

const quandParis = (iso, lang) => {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const jour = d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
  const heure = d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  return lang === 'en' ? `since ${jour} at ${heure}` : `depuis le ${jour} à ${heure}`;
};

/** @param {{ userId: string, lang?: string }} p */
export default function BandeauLeboncoinPause({ userId, lang = 'fr' }) {
  const T = TEXTES_PAUSE_LBC[lang === 'en' ? 'en' : 'fr'];
  const [pause, setPause] = useState(null);
  const [etat, setEtat] = useState(null);   // null | 'envoi' | 'demande' | 'finie' | 'erreur'
  const [masque, setMasque] = useState(false);

  const lirePause = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data?.platform_settings ?? null;
  }, [userId]);

  const relire = useCallback(async () => {
    if (!userId) return;
    try { setPause(pauseLeboncoin(await lirePause())); } catch { /* illisible : rien d'affiché, jamais un état deviné */ }
  }, [userId, lirePause]);

  useEffect(() => {
    const t = setTimeout(relire, 0);
    const auRetour = () => { if (document.visibilityState === 'visible') relire(); };
    window.addEventListener('focus', auRetour);
    document.addEventListener('visibilitychange', auRetour);
    return () => { clearTimeout(t); window.removeEventListener('focus', auRetour); document.removeEventListener('visibilitychange', auRetour); };
  }, [relire]);

  const demander = async () => {
    setEtat('envoi');
    try {
      // Relue juste avant : jamais une écriture dans une pause qui n'existe plus (elle créerait un blocage).
      const ps = await lirePause();
      const patch = patchEssaiDemande(ps);
      if (!patch) { setPause(null); setEtat('finie'); return; }
      const { data, error } = await fusionnerReglages(['leboncoin', 'blocage_acces'], patch);
      if (error) { setEtat('erreur'); return; }
      setPause(pauseLeboncoin(data ?? ps));
      setEtat('demande');
    } catch { setEtat('erreur'); }
  };

  if (masque || (!pause && etat !== 'finie')) return null;
  const phrase = etat === 'finie' ? T.finie : etat === 'demande' ? T.demande : etat === 'erreur' ? T.erreur : pause?.demande ? T.dejaDemande : null;
  return (
    <div role="status" aria-live="polite" data-lbc-pause="" style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 84px)', zIndex: 1049,
      maxWidth: 540, margin: '0 auto', padding: '12px 14px', borderRadius: 14, background: BLANC,
      border: `1px solid ${C.amber}`, boxShadow: '0 6px 24px rgba(16,32,27,.14)', fontFamily: POLICE,
    }}>
      {etat !== 'finie' && <div style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}>{T.titre}</div>}
      <div style={{ fontSize: 13, color: C.mute2, marginTop: 4, lineHeight: 1.4 }}>{phrase ?? T.texte(quandParis(pause?.depuis, lang))}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {pause && !pause.demande && etat !== 'demande' && (
          <button type="button" data-lbc-bouton="remarche" disabled={etat === 'envoi'} onClick={demander}
            style={{ flex: 1, minHeight: 40, borderRadius: 11, border: 'none', background: DEGRADE_TEAL, color: BLANC, fontWeight: 700, fontSize: 14, opacity: etat === 'envoi' ? 0.6 : 1 }}>{T.bouton}</button>
        )}
        <button type="button" onClick={() => setMasque(true)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 11, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600, fontSize: 14 }}>{T.plusTard}</button>
      </div>
    </div>
  );
}
