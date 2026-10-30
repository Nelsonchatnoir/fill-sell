// ═══════════════════════════════════════════════════════════════════════════
// /conditions-cloud — LES CONDITIONS D'UTILISATION DE FILLSELL CLOUD (30/10, lot D)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ NON PUBLIÉE tant que Nico n'a pas validé le texte : la page exige d'être connecté ET d'être un compte témoin
// du Cloud (drapeau par compte, profiles.beta_flags.cloud) — tout autre visiteur est renvoyé vers l'app, la page
// n'est jamais indexée. À l'ouverture du Cloud, elle se rend à tous (CLOUD_OFFER_ENABLED, config/cloudOffer.js).
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CLOUD_OFFER_ENABLED, chargerTemoinCloud } from '../config/cloudOffer';
import { conditionsCloud } from '../cloud/conditionsCloud';
import { C, BLANC, POLICE } from '../cloud/theme';

export default function ConditionsCloud() {
  const [acces, setAcces] = useState(CLOUD_OFFER_ENABLED ? 'oui' : 'lecture');
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = "Conditions d'utilisation de FillSell Cloud";
    return () => { meta.remove(); };
  }, []);
  useEffect(() => {
    if (CLOUD_OFFER_ENABLED) return undefined;
    let mort = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const oui = session?.user?.id ? await chargerTemoinCloud(supabase, session.user.id) : false;
      if (!mort) setAcces(oui ? 'oui' : 'non');
    }).catch(() => { if (!mort) setAcces('non'); });
    return () => { mort = true; };
  }, []);
  if (acces === 'non') return <Navigate to="/app" replace />;
  if (acces !== 'oui') return null;
  const T = conditionsCloud();
  return (
    <main style={{ minHeight: '100vh', background: C.canvas, fontFamily: POLICE, padding: '24px 16px 48px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, color: C.ink, lineHeight: 1.25 }}>{T.titre}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: C.mute2 }}>{T.version}</p>
        {T.articles.map((a) => (
          <section key={a.t} style={{ margin: '0 0 12px', padding: '16px 18px', background: BLANC, borderRadius: 16, border: `1px solid ${C.border}` }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, color: C.ink }}>{a.t}</h2>
            {a.ps.map((p) => <p key={p.slice(0, 40)} style={{ margin: '0 0 8px', fontSize: 14, color: C.mute2, lineHeight: 1.65 }}>{p}</p>)}
          </section>
        ))}
      </div>
    </main>
  );
}
