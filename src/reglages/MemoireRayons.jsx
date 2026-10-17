// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › PRÉFÉRENCES — LES RÉPONSES RETENUES PAR RAYON (18/10 nuit, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// La mémoire « compte × catégorie » (src/publication/moteur/memoireCategorie.js)
// se voit et se vide ici : chaque réponse retenue (plateforme, rayon, champ,
// valeur, date), « Oublier » une par une, « Tout oublier ». Lecture à
// l'ouverture de la page seulement (jamais d'intervalle).
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { R } from './theme';
import { Groupe, Carte, Bouton, Note } from './ReglagesUI';
import { listerMemoire, oublierEntree, viderMemoire } from '../utils/memoireChamps';

const NOMS = { leboncoin: 'Leboncoin', ebay: 'eBay', vinted: 'Vinted', beebs: 'Beebs', depop: 'Depop' };
const LIBELLES = { clothing_type: 'Univers', shoe_type: 'Univers', accessories_univers: 'Univers', 'Département': 'Département' };

export default function MemoireRayons({ c, T }) {
  const userId = c.user?.id ?? null;
  const [lignes, setLignes] = useState(null);
  // Mémoire éteinte (interrupteur, utils/memoireChamps) : la section ne s'affiche pas.
  const [eteinte, setEteinte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    if (!userId) return undefined;
    let mort = false;
    listerMemoire(supabase, userId)
      .then((l) => { if (mort) return; if (l === null) setEteinte(true); else setLignes(l); })
      .catch(() => { if (!mort) setLignes([]); });
    return () => { mort = true; };
  }, [userId]);

  const oublier = async (l) => {
    setEnCours(true);
    const r = await oublierEntree(supabase, userId, l);
    setEnCours(false);
    if (!r.ok) { c.toast(T.erreurSauvegarde); return; }
    setLignes((prev) => (prev ?? []).filter((x) => !(x.plateforme === l.plateforme && x.compte === l.compte && x.categorie === l.categorie && x.champ === l.champ)));
  };
  const toutOublier = async () => {
    setEnCours(true);
    const r = await viderMemoire(supabase, userId);
    setEnCours(false);
    if (!r.ok) { c.toast(T.erreurSauvegarde); return; }
    setLignes([]);
    c.toast(T.memoireRayonVidee);
  };
  const date = (iso) => {
    const d = Date.parse(iso ?? '');
    if (!Number.isFinite(d)) return '';
    return new Date(d).toLocaleDateString(c.lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
  };

  if (eteinte) return null;
  return (
    <Groupe intitule={T.sMemoireRayon}>
      <Carte>
        {lignes === null ? (
          <div className="rg-ligne" style={{ minHeight: 52, color: R.texteSecondaire, fontSize: 14 }}>…</div>
        ) : lignes.length === 0 ? (
          <div className="rg-ligne" style={{ minHeight: 52, color: R.texteSecondaire, fontSize: 14 }}>{T.memoireRayonVide}</div>
        ) : (
          <>
            {lignes.map((l) => (
              <div key={`${l.plateforme}|${l.compte}|${l.categorie}|${l.champ}`} className="rg-ligne" style={{ minHeight: 60, gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>
                    {LIBELLES[l.champ] ?? l.champ} · {NOMS[l.plateforme] ?? l.plateforme} : « {l.valeur} »
                  </span>
                  <span style={{ fontSize: 12, lineHeight: '17px', color: R.texteSecondaire, overflowWrap: 'anywhere' }}>
                    {l.categorie}{date(l.repondu_le) ? ` · ${date(l.repondu_le)}` : ''}
                  </span>
                </span>
                <Bouton ton="creux" disabled={enCours} onClick={() => oublier(l)} style={{ minHeight: 38, padding: '0 14px', fontSize: 13.5 }}>
                  {T.memoireRayonOublier}
                </Bouton>
              </div>
            ))}
            <div style={{ padding: '12px 16px' }}>
              <Bouton ton="danger-creux" disabled={enCours} onClick={toutOublier}>{T.memoireRayonVider}</Bouton>
            </div>
          </>
        )}
      </Carte>
      <Note>{T.memoireRayonNote}</Note>
    </Groupe>
  );
}
