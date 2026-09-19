// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › OPLA — LES QUESTIONS DE CATÉGORIE DÉJÀ TRANCHÉES (2026-09-19)
// ═══════════════════════════════════════════════════════════════════════════
// Quand l'arbre Opla laisse DEUX feuilles possibles pour un article, on pose la
// question une fois ; `get-pending-jobs` range la réponse dans
// `profiles.platform_settings.opla.categories`, et les articles suivants qui
// posent EXACTEMENT la même question (même liste d'options) partent tout seuls.
//
// ⛔ CET ÉCRAN EST LE DROIT DE CHANGER D'AVIS, ET C'EST SA SEULE RAISON D'ÊTRE.
//    Une réponse mémorisée ne se regrave pas d'elle-même : comme la question
//    n'est plus posée, sans ce bouton elle serait gravée pour toujours. On
//    oublie la ligne, la question revient au prochain article, la nouvelle
//    réponse remplace l'ancienne.
//
// ⛔ ON N'AFFICHE QUE CE QU'ON A. Zéro réponse ⇒ le bloc n'existe pas : une
//    section vide qui explique un mécanisme jamais déclenché est du bruit.
// ⛔ AUCUN RÉFÉRENTIEL ICI. La ligne se lit entièrement dans ce qui a été
//    enregistré (chemins complets, déjà en clair) — l'app n'embarque pas les
//    886 feuilles pour afficher deux lignes.
//
// L'ÉCRITURE EST UNE RELECTURE-MODIFICATION : `platform_settings` porte aussi
// l'adresse Leboncoin et les réglages eBay. On relit la colonne juste avant
// d'écrire, on ne renvoie jamais une copie prise au montage du composant.
// `.select()` obligatoire : un UPDATE filtré par RLS rend 0 ligne SANS erreur,
// et sans lui on afficherait un « ✅ » qui n'a rien enregistré.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { R } from './theme';
import { Groupe, Carte, Bouton, Note } from './ReglagesUI';

/** { cle: { code, titre, options[], mot, le } } → lignes triées, la plus récente d'abord. */
function lignesDe(brut) {
  if (!brut || typeof brut !== 'object') return [];
  return Object.entries(brut)
    .map(([cle, v]) => ({
      cle,
      titre: String(v?.titre ?? '').trim(),
      options: Array.isArray(v?.options) ? v.options.map((t) => String(t)) : [],
      mot: String(v?.mot ?? '').trim(),
      le: String(v?.le ?? ''),
    }))
    .filter((e) => e.titre)
    .sort((a, b) => b.le.localeCompare(a.le));
}

export default function OplaCategoriesMemorisees({ c, T }) {
  const [lignes, setLignes] = useState([]);
  const [oubli, setOubli] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      if (!c.user?.id) return;
      const { data } = await supabase.from('profiles').select('platform_settings').eq('id', c.user.id).maybeSingle();
      if (!vivant) return;
      setLignes(lignesDe(data?.platform_settings?.opla?.categories));
    })();
    return () => { vivant = false; };
  }, [c.user?.id]);

  const oublier = async (cle) => {
    setOubli(cle);
    const { data } = await supabase.from('profiles').select('platform_settings').eq('id', c.user.id).maybeSingle();
    const reglages = (data?.platform_settings && typeof data.platform_settings === 'object') ? data.platform_settings : {};
    const opla = (reglages.opla && typeof reglages.opla === 'object') ? reglages.opla : {};
    const cats = { ...(opla.categories ?? {}) };
    delete cats[cle];
    const { data: ecrit, error } = await supabase
      .from('profiles')
      .update({ platform_settings: { ...reglages, opla: { ...opla, categories: cats } } })
      .eq('id', c.user.id)
      .select('id');
    setOubli(null);
    if (error || !ecrit?.length) { c.toast(T.erreurSauvegarde); return; }
    setLignes(lignesDe(cats));
    c.toast(T.oplaMemOubliee);
  };

  if (!lignes.length) return null;

  return (
    <Groupe intitule={T.oplaMemTitre}>
      <Carte>
        {lignes.map((e) => (
          <div key={e.cle} className="rg-ligne" style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: R.ink, overflowWrap: 'anywhere' }}>{e.titre}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.45, color: R.texteSecondaire, overflowWrap: 'anywhere' }}>
                {e.mot
                  ? `${T.oplaMemExemple} « ${e.mot} »`
                  : `${T.oplaMemParmi} ${e.options.length}`}
              </span>
            </div>
            <Bouton
              ton="creux"
              enCours={oubli === e.cle}
              onClick={() => oublier(e.cle)}
              style={{ minHeight: 44, padding: '0 16px', fontSize: 13.5, flexShrink: 0 }}
            >
              {oubli === e.cle ? '…' : T.oublier}
            </Bouton>
          </div>
        ))}
      </Carte>
      <Note>{T.oplaMemNote}</Note>
    </Groupe>
  );
}
