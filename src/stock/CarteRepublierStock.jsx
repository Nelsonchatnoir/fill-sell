// ═══════════════════════════════════════════════════════════════════════════
// « REPUBLIE TON STOCK EN 1 CLIC » — EN TÊTE DU STOCK APRÈS LA PREMIÈRE SYNCHRO (18/11/2026, lot T1 de Nico, maquette 17)
// ═══════════════════════════════════════════════════════════════════════════
// La carte S'AJOUTE en tête du Stock : elle ne remplace rien (Publier, Republier, À régler, filtres, sections, compteurs,
// cartes d'articles : tout reste, à sa place — retouche n° 1 de Nico du 18/11).
// ⛔ Elle n'invente aucun geste : son bouton ouvre « Remonter mes annonces », le geste EXISTANT du Stock (gesteRemonter :
//    choix des annonces, puis la feuille qui dit le coût en remontées AVANT de valider). Cadence, créneaux, plafonds,
//    paliers et quotas : inchangés (règle de Nico, intouchables sans sa décision).
// Visible quand : le geste existe (republication possible sur ce compte), il y a des annonces à remonter, une synchro a
// déjà réussi sur ce compte (vinted_sync_runs « done », lu une fois), et la carte n'a été ni utilisée ni fermée sur cet
// appareil. Journal : usage_logs 'stock_carte' { carte: 'republier', evenement: vue | clic | fermee, n }.
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LOGOS_PLATEFORMES } from '../utils/logosPlateformes';

const TEAL = '#2F9E90';
const DEEP = '#1B6E62';
const INK = '#10201B';
const cle = (userId) => `fs_carte_republier:${userId}`;
const lireMasque = (userId) => { try { return localStorage.getItem(cle(userId)); } catch { return null; } };
const poserMasque = (userId, v) => { try { localStorage.setItem(cle(userId), v); } catch { /* affichage seul */ } };

const CSS = `
.fs-crs{position:relative;border-radius:26px;padding:16px;margin:0 0 14px;background:#FFFFFF;border:1.5px solid ${TEAL};box-shadow:0 22px 40px -30px rgba(27,110,98,.8);color:${INK};animation:fsCrsEntree .5s cubic-bezier(.2,.8,.2,1) both}
.fs-crs-montee{position:relative;height:96px;margin:0 0 12px;border-radius:16px;background:#EFF4F2;overflow:hidden}
.fs-crs-r{position:absolute;left:10px;right:10px;height:26px;border-radius:9px;background:#FFFFFF;display:flex;align-items:center;gap:8px;padding:0 8px;box-shadow:0 2px 8px -4px rgba(16,32,27,.25)}
.fs-crs-r i{width:16px;height:16px;border-radius:5px;flex:none}
.fs-crs-r b{flex:1;height:6px;border-radius:3px;background:#EFEDE5}
.fs-crs-r1{top:7px;border:1.5px solid ${TEAL};animation:fsCrsMonte 3.4s cubic-bezier(.22,.61,.36,1) infinite}
.fs-crs-r2{top:36px;animation:fsCrsDesc 3.4s cubic-bezier(.22,.61,.36,1) infinite}
.fs-crs-r3{top:65px;animation:fsCrsDesc 3.4s cubic-bezier(.22,.61,.36,1) infinite}
@keyframes fsCrsMonte{0%,8%{transform:translateY(58px)}45%,100%{transform:translateY(0)}}
@keyframes fsCrsDesc{0%,8%{transform:translateY(-29px)}45%,100%{transform:translateY(0)}}
@keyframes fsCrsEntree{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.fs-crs-cta{position:relative;overflow:hidden;width:100%;min-height:54px;border-radius:999px;border:0;background:linear-gradient(120deg,${TEAL},${DEEP});color:#FFFFFF;font:inherit;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;box-shadow:0 12px 26px -12px rgba(47,158,144,.75)}
.fs-crs-cta::after{content:"";position:absolute;top:0;bottom:0;left:0;width:42%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);transform:translateX(-120%);animation:fsCrsBrille 3.6s ease-in-out infinite 1.2s}
@keyframes fsCrsBrille{0%{transform:translateX(-120%)}38%,100%{transform:translateX(330%)}}
.fs-crs-x{position:absolute;top:8px;right:8px;width:44px;height:44px;border-radius:22px;border:0;background:transparent;display:grid;place-items:center;color:${INK};cursor:pointer}
.fs-crs-cta:focus-visible,.fs-crs-x:focus-visible{outline:2px solid ${DEEP};outline-offset:2px}
@media (prefers-reduced-motion:reduce){.fs-crs,.fs-crs-r1,.fs-crs-r2,.fs-crs-r3,.fs-crs-cta::after{animation:none}}
`;

/** Props : userId, lang, geste (gesteRemonter du Stock : { n, offertCourt, onOuvrir } ou null). */
export default function CarteRepublierStock({ userId, lang = 'fr', geste }) {
  const fr = lang !== 'en';
  const [masque, setMasque] = useState(() => (userId ? lireMasque(userId) : null));
  const [synchroFaite, setSynchroFaite] = useState(null);
  const n = geste?.n ?? 0;
  const candidate = Boolean(userId) && Boolean(geste) && n > 0 && !masque;

  // UNE lecture : une synchro a-t-elle déjà réussi sur ce compte ? (jamais en boucle)
  useEffect(() => {
    if (!candidate || synchroFaite !== null) return undefined;
    let annule = false;
    Promise.resolve()
      .then(() => supabase.from('vinted_sync_runs').select('id').eq('user_id', userId).eq('status', 'done').in('kind', ['dressing', 'annonces']).limit(1))
      .then(({ data, error }) => { if (!annule) setSynchroFaite(!error && Array.isArray(data) && data.length > 0); })
      .catch(() => { if (!annule) setSynchroFaite(false); });
    return () => { annule = true; };
  }, [candidate, synchroFaite, userId]);

  const journal = (evenement) => {
    try {
      supabase.from('usage_logs').insert({ user_id: userId, feature: 'stock_carte', metadata: { carte: 'republier', evenement, n } })
        .then(({ error }) => { if (error) console.warn('[stock] carte republier non journalisée :', error.message); });
    } catch { /* la télémétrie ne bloque rien */ }
  };
  const visible = candidate && synchroFaite === true;
  const vueRef = useRef(false);
  useEffect(() => {
    if (!visible || vueRef.current) return;
    vueRef.current = true;
    journal('vue');
  });

  if (!visible) return null;
  const ouvrir = () => { journal('clic'); poserMasque(userId, 'utilisee'); setMasque('utilisee'); geste.onOuvrir?.(); };
  const fermer = () => { journal('fermee'); poserMasque(userId, 'fermee'); setMasque('fermee'); };
  return (
    <section className="fs-crs" data-carte-republier="" aria-label={fr ? 'Republie ton stock en 1 clic' : 'Relist your stock in 1 tap'}>
      <style>{CSS}</style>
      <button type="button" className="fs-crs-x" onClick={fermer} aria-label={fr ? 'Fermer' : 'Close'}><X size={18} /></button>
      <div className="fs-crs-montee" aria-hidden="true">
        <div className="fs-crs-r fs-crs-r1"><i style={{ background: '#9DB4C9' }} /><b /><img src={LOGOS_PLATEFORMES.Vinted} alt="" width={14} height={14} style={{ borderRadius: 4 }} /></div>
        <div className="fs-crs-r fs-crs-r2"><i style={{ background: '#E8C9A9' }} /><b /></div>
        <div className="fs-crs-r fs-crs-r3"><i style={{ background: '#F2C4C9' }} /><b /></div>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5C6560' }}>{fr ? 'Ta prochaine étape' : 'Your next step'}</p>
      <h2 style={{ margin: '0 0 6px', fontSize: 23, lineHeight: 1.12, letterSpacing: '-0.035em' }}>{fr ? 'Republie ton stock en 1 clic' : 'Relist your stock in 1 tap'}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, color: '#5C6560' }}>
        {fr ? 'Tes annonces qui datent descendent dans les listes. Remets-les en haut, sur chaque plateforme : le nombre de remontées est affiché avant de valider.'
          : 'Older listings sink down the lists. Put them back on top, on each platform: the number of bumps is shown before you confirm.'}
      </p>
      <button type="button" className="fs-crs-cta" onClick={ouvrir}>
        <ArrowUp size={19} strokeWidth={2.4} aria-hidden="true" />
        {fr ? `Republier mes annonces (${n})` : `Relist my listings (${n})`}
      </button>
      {geste.offertCourt && <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#5C6560', textAlign: 'center' }}>{geste.offertCourt}</p>}
    </section>
  );
}
