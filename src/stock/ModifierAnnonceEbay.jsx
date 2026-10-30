// ═══════════════════════════════════════════════════════════════════════════
// STOCK › MODIFIER SUR eBAY (30/10/2026, lot E — thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce eBay publiée par l'API ne se modifie pas dans Seller Hub (règle
// d'eBay) : elle se modifie ICI. Titre, description, prix — l'annonce est
// révisée en place (même numéro, vues et favoris gardés), jamais retirée.
// Serveur : ebay-account, action modifier_annonce (_shared/ebay-modifier-annonce.ts).
import { useEffect, useState } from 'react';
import Feuille from './Feuille';
import { S } from './jetons';

const MOTS = {
  fr: {
    titre: 'Modifier sur eBay', champTitre: 'Titre (80 caractères au plus)', champDesc: 'Description', champPrix: 'Prix (€)',
    enregistrer: 'Enregistrer sur eBay', annuler: 'Annuler', enCours: 'Envoi à eBay…',
    note: "L'annonce reste en ligne : eBay la met à jour à sa place (même numéro, vues et favoris gardés).",
    fait: (c) => `Annonce eBay modifiée (${c.join(', ')}).`, rien: 'Rien n\'a changé.', reseau: "eBay n'a pas répondu : réessaie dans un instant.",
    noms: { titre: 'titre', description: 'description', prix: 'prix' },
  },
  en: {
    titre: 'Edit on eBay', champTitre: 'Title (80 characters at most)', champDesc: 'Description', champPrix: 'Price (€)',
    enregistrer: 'Save on eBay', annuler: 'Cancel', enCours: 'Sending to eBay…',
    note: 'The listing stays online: eBay updates it in place (same number, views and watchers kept).',
    fait: (c) => `eBay listing updated (${c.join(', ')}).`, rien: 'Nothing changed.', reseau: "eBay didn't answer: try again in a moment.",
    noms: { titre: 'title', description: 'description', prix: 'price' },
  },
};

export default function ModifierAnnonceEbay({ lang = 'fr', job: jobListe, supabase, onFermer, onModifiee }) {
  const M = MOTS[lang === 'en' ? 'en' : 'fr'];
  // La liste du Stock ne porte pas toujours la description : la tâche est relue telle qu'elle est en base.
  const [job, setJob] = useState(jobListe);
  const [lue, setLue] = useState(false);
  useEffect(() => {
    let vivant = true;
    supabase.from('cross_post_jobs').select('id, title, description, price').eq('id', jobListe.id).maybeSingle()
      .then(({ data }) => {
        if (!vivant) return;
        if (data) {
          setJob((j) => ({ ...j, ...data }));
          setTitre(String(data.title ?? '').slice(0, 80));
          setDescription(String(data.description ?? ''));
          setPrix(data.price != null ? String(data.price).replace('.', lang === 'en' ? '.' : ',') : '');
        }
        setLue(true);
      }, () => { if (vivant) setLue(true); });
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobListe.id]);
  const [titre, setTitre] = useState(String(job?.title ?? '').slice(0, 80));
  const [description, setDescription] = useState(String(job?.description ?? ''));
  const [prix, setPrix] = useState(job?.price != null ? String(job.price).replace('.', lang === 'en' ? '.' : ',') : '');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  const enregistrer = async () => {
    const corps = { action: 'modifier_annonce', job_id: job.id };
    if (titre.trim() !== String(job?.title ?? '').trim()) corps.titre = titre;
    if (description.trim() !== String(job?.description ?? '').trim()) corps.description = description;
    const prixAvant = job?.price != null ? Number(job.price) : null;
    const prixLu = Number(String(prix).replace(',', '.'));
    if (String(prix).trim() && prixLu !== prixAvant) corps.prix = String(prix);
    if (!('titre' in corps) && !('description' in corps) && !('prix' in corps)) { setMessage({ ok: false, texte: M.rien }); return; }
    setEnCours(true); setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-account', { body: corps });
      if (error || !data) { setMessage({ ok: false, texte: M.reseau }); return; }
      if (!data.ok) { setMessage({ ok: false, texte: data.message || M.reseau }); return; }
      const champs = (data.changements ?? []).map((c) => M.noms[c] ?? c);
      setMessage({ ok: true, texte: M.fait(champs) });
      onModifiee?.({ ...job, title: corps.titre ?? job.title, description: corps.description ?? job.description, price: corps.prix != null ? prixLu : job.price });
    } catch {
      setMessage({ ok: false, texte: M.reseau });
    } finally {
      setEnCours(false);
    }
  };

  const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 16, fontFamily: 'inherit', color: S.ink, outline: 'none' };
  const libelle = { fontSize: 13, fontWeight: 600, color: S.ink2, marginBottom: 6, display: 'block' };
  const pied = (
    <>
      <button type="button" className="sk-btn sk-presse" onClick={onFermer} disabled={enCours}
        style={{ flex: 1, height: 48, borderRadius: 14, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 15, fontWeight: 700, color: S.ink, fontFamily: 'inherit' }}>
        {M.annuler}
      </button>
      <button type="button" className="sk-btn sk-presse" onClick={enregistrer} disabled={enCours || !lue || !titre.trim()}
        style={{ flex: 2, height: 48, borderRadius: 14, border: 'none', background: S.tealDeep, fontSize: 15, fontWeight: 700, color: '#FFFFFF', fontFamily: 'inherit', opacity: enCours ? 0.7 : 1 }}>
        {enCours ? M.enCours : M.enregistrer}
      </button>
    </>
  );

  return (
    <Feuille lang={lang} titre={M.titre} etiquette={job?.title} onFermer={onFermer} pied={pied}>
      <label>
        <span style={libelle}>{M.champTitre}</span>
        <input value={titre} maxLength={80} onChange={(e) => setTitre(e.target.value)} style={champ} />
      </label>
      <label>
        <span style={libelle}>{M.champPrix}</span>
        <input value={prix} inputMode="decimal" onChange={(e) => setPrix(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} style={{ ...champ, maxWidth: 160 }} />
      </label>
      <label>
        <span style={libelle}>{M.champDesc}</span>
        <textarea value={description} rows={Math.min(Math.max(5, description.split(/\r?\n/).length), 12)} onChange={(e) => setDescription(e.target.value)}
          style={{ ...champ, resize: 'vertical', lineHeight: 1.5, whiteSpace: 'pre-wrap' }} />
      </label>
      {message ? (
        <div role={message.ok ? 'status' : 'alert'} style={{ padding: '10px 12px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, lineHeight: 1.45,
          background: message.ok ? S.menthe : S.rougeFond, border: `1px solid ${message.ok ? S.mentheBord : S.rougeBord}`, color: message.ok ? S.tealDeep : S.rouge }}>
          {message.texte}
        </div>
      ) : null}
      <div style={{ fontSize: 12.5, color: S.ink2, lineHeight: 1.45 }}>{M.note}</div>
    </Feuille>
  );
}
