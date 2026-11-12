// ═══════════════════════════════════════════════════════════════════════════
// LA CASE DES CONDITIONS D'UTILISATION DE FILLSELL CLOUD — à l'activation, AVANT toute carte (30/10, lot D)
// ═══════════════════════════════════════════════════════════════════════════
// Le texte en entier (déroulable), une case OBLIGATOIRE, « J'accepte et je continue » grisé tant qu'elle n'est pas
// cochée. L'acceptation est ENREGISTRÉE en base (rpc cloud_cgu_accepter_moi : version + date, écrites par le serveur
// seul) avant de rendre la main : un échec se dit, rien ne s'ouvre. Mobile d'abord, thème de l'app (cloud/theme.js).
// Monté par App derrière cloudOfferVisible() / le drapeau par compte : invisible pour tout autre compte.
import { useEffect, useRef, useState } from 'react';
// (01/11) Portail sur document.body, comme « Me connecter » : ouverte depuis Réglages (portail sur body, z-index 400),
// rendue dans `.app-root` elle restait DERRIÈRE sur iPhone (WKWebView) — « Essayer » aurait eu l'air mort.
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { conditionsCloud, versionConditionsMontree } from './conditionsCloud';
import { tracerCloud } from './traceCloud';
// (05/11 soir, phase 3) La langue de l'app (fs_lang, sinon celle du téléphone) : la traduction anglaise pour information.
import { languePage } from '../pages/languePage';
import { C, BLANC, DEGRADE_TEAL, POLICE } from './theme';

// (11/11, point C1 du méga lot de Nico) LA MESURE DE L'ÉTAPE, dans usage_logs par la porte tracerCloud :
// cloud_conditions_vues (l'écran monté, une fois par ouverture), cloud_conditions_cochees (premier passage de la case à
// cochée), cloud_conditions_annulees (« Annuler », avec `coche` : cochée ou non), cloud_conditions_acceptees (= « continué » :
// l'acceptation ENREGISTRÉE, juste avant de rendre la main), cloud_conditions_echec (l'enregistrement a échoué, `raison`).
// Chaque ligne porte la version montrée, la langue et la plateforme (web / ios / android). Jamais attendue : une trace
// lente ou en échec ne ralentit ni ne bloque l'écran. L'identifiant vient de supabase.auth.getSession(), qui peut
// rafraîchir le jeton par le réseau : c'est une raison de plus pour ne jamais l'attendre.
function plateformeApp() {
  try { return Capacitor.getPlatform(); } catch { return 'inconnue'; }
}
// (12/11/2026) `version` = la version MONTRÉE (Cloud seul, ou formules dans l'achat d'une formule : versionConditionsMontree).
function tracerEtape(feature, lang, extra = {}, version = versionConditionsMontree(false)) {
  const metadata = { version, lang, plateforme: plateformeApp(), ...extra };
  Promise.resolve()
    .then(() => supabase.auth.getSession())
    .then(({ data }) => tracerCloud(data?.session?.user?.id, feature, metadata))
    .catch(() => { /* une trace ne bloque jamais l'écran */ });
}

// (12/11/2026, offres Cloud) `formules` : true seulement quand la case est demandée par l'achat d'une FORMULE avec Cloud
// (App, achatFormules) — l'article 6 des formules et SA version ; sinon le texte et la version du Cloud seul, comme avant.
export default function ConditionsCloudModale({ onFini, formules = false }) {
  const lang = languePage();
  const version = versionConditionsMontree(formules === true);
  const T = conditionsCloud(lang, { formules: formules === true });
  const [coche, setCoche] = useState(false);
  const [etat, setEtat] = useState('lecture');   // lecture | envoi | echec
  const vues = useRef(false);
  const cochees = useRef(false);
  useEffect(() => {
    if (vues.current) return;
    vues.current = true;
    tracerEtape('cloud_conditions_vues', lang, {}, version);
  }, [lang]);
  function cocher(v) {
    setCoche(v);
    if (v && !cochees.current) { cochees.current = true; tracerEtape('cloud_conditions_cochees', lang, {}, version); }
  }
  function annuler() {
    tracerEtape('cloud_conditions_annulees', lang, { coche }, version);
    onFini(false);
  }
  async function accepter() {
    if (!coche || etat === 'envoi') return;
    setEtat('envoi');
    try {
      const { data, error } = await supabase.rpc('cloud_cgu_accepter_moi', { p_version: version });
      if (error || data?.ok !== true) tracerEtape('cloud_conditions_echec', lang, { raison: error ? `rpc: ${String(error.message ?? error).slice(0, 160)}` : String(data?.raison ?? 'ok_absent') }, version);
      if (error || data?.ok !== true) { setEtat('echec'); return; }
      tracerEtape('cloud_conditions_acceptees', lang, {}, version);
      onFini(true);
    } catch (e) {
      tracerEtape('cloud_conditions_echec', lang, { raison: `exception: ${String(e?.message ?? e).slice(0, 160)}` }, version);
      setEtat('echec');
    }
  }
  const couche = (
    <div role="dialog" aria-modal="true" aria-label={T.titre} style={{
      position: 'fixed', inset: 0, zIndex: 1250, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', fontFamily: POLICE,
    }}>
      <div style={{
        width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: C.canvas,
        borderRadius: '20px 20px 0 0', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -8px 30px rgba(15,23,42,0.18)',
      }}>
        <div style={{ padding: '18px 16px 8px' }}>
          <h2 style={{ margin: 0, fontSize: 19, color: C.ink, lineHeight: 1.3 }}>{T.titre}</h2>
          <div style={{ fontSize: 12.5, color: C.mute2, marginTop: 4 }}>{T.version}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 8px', WebkitOverflowScrolling: 'touch' }}>
          {T.articles.map((a) => (
            <section key={a.t} style={{ margin: '0 0 12px', padding: '12px 14px', background: BLANC, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14.5, color: C.ink }}>{a.t}</h3>
              {a.ps.map((p) => <p key={p.slice(0, 40)} style={{ margin: '0 0 6px', fontSize: 13.2, color: C.mute2, lineHeight: 1.55 }}>{p}</p>)}
            </section>
          ))}
        </div>
        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`, background: BLANC }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: C.ink, lineHeight: 1.45, cursor: 'pointer' }}>
            <input type="checkbox" checked={coche} onChange={(e) => cocher(e.target.checked)}
              style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0, accentColor: C.teal }} />
            <span>{T.case}</span>
          </label>
          {etat === 'echec' && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: C.amberInk }}>{T.echec}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={annuler} style={{
              flex: 1, minHeight: 48, borderRadius: 12, fontWeight: 700, fontSize: 15, border: `1px solid ${C.border}`, background: BLANC, color: C.ink,
            }}>{T.annuler}</button>
            <button type="button" onClick={accepter} disabled={!coche || etat === 'envoi'} aria-disabled={!coche || etat === 'envoi'} style={{
              flex: 2, minHeight: 48, borderRadius: 12, fontWeight: 800, fontSize: 15, border: 'none', color: BLANC,
              background: coche ? DEGRADE_TEAL : C.faint, opacity: etat === 'envoi' ? 0.7 : 1,
            }}>{etat === 'envoi' ? T.enregistrement : T.accepter}</button>
          </div>
        </div>
      </div>
    </div>
  );
  // Rendu serveur (autotests) : pas de document, la couche se rend telle quelle ; dans l'app, sur document.body.
  return typeof document === 'undefined' ? couche : createPortal(couche, document.body);
}
