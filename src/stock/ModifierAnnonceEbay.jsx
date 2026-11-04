// ═══════════════════════════════════════════════════════════════════════════
// STOCK › MODIFIER SUR eBAY (30/10/2026, lot E — thecloset72000 ; 04/11 : TOUT, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce eBay publiée par l'API ne se modifie pas sur eBay (règle d'eBay : « Cette opération n'est pas autorisée
// pour les objets de l'inventaire ») : elle se modifie ICI. Titre, description, prix — et depuis le 04/11 les
// CARACTÉRISTIQUES (celles de la catégorie eBay : obligatoires d'abord, listes fermées en choix) et les PHOTOS (ordre,
// retrait, ajout). L'annonce est révisée en place (même numéro, vues et favoris gardés), jamais retirée.
// Serveur : ebay-account, actions lire_annonce et modifier_annonce (_shared/ebay-modifier-annonce.ts).
import { useEffect, useMemo, useState } from 'react';
import Feuille from './Feuille';
import { S } from './jetons';
import { televerserPhotos } from '../utils/photosUpload';
import { aspectsChanges } from '../utils/ebayModification';

const PHOTOS_MAX = 24;

const MOTS = {
  fr: {
    titre: 'Modifier sur eBay', champTitre: 'Titre (80 caractères au plus)', champDesc: 'Description', champPrix: 'Prix (€)',
    enregistrer: 'Enregistrer sur eBay', annuler: 'Annuler', enCours: 'Envoi à eBay…', lecture: 'Lecture de l\'annonce sur eBay…',
    note: "L'annonce reste en ligne : eBay la met à jour à sa place (même numéro, vues et favoris gardés).",
    fait: (c) => `Annonce eBay modifiée (${c.join(', ')}).`, rien: 'Rien n\'a changé.', reseau: "eBay n'a pas répondu : réessaie dans un instant.",
    noms: { titre: 'titre', description: 'description', prix: 'prix', caracteristiques: 'caractéristiques', photos: 'photos' },
    carac: 'Caractéristiques', obligatoire: 'obligatoire', choisir: 'Choisir…', aucune: '— (vide)',
    toutes: (n) => `Voir les ${n} autres caractéristiques`, moins: 'Moins de caractéristiques',
    photos: 'Photos', ajouter: 'Ajouter des photos', retirer: 'Retirer', avant: 'Avancer', apres: 'Reculer',
    photosMax: `eBay accepte ${PHOTOS_MAX} photos au plus.`, photoIllisible: (n) => `${n} photo(s) n'ont pas pu être lues.`,
    lectureKo: 'Les caractéristiques et les photos n\'ont pas pu être lues chez eBay : titre, description et prix restent modifiables.',
    plusieurs: 'plusieurs valeurs : sépare-les par une virgule',
  },
  en: {
    titre: 'Edit on eBay', champTitre: 'Title (80 characters at most)', champDesc: 'Description', champPrix: 'Price (€)',
    enregistrer: 'Save on eBay', annuler: 'Cancel', enCours: 'Sending to eBay…', lecture: 'Reading the listing on eBay…',
    note: 'The listing stays online: eBay updates it in place (same number, views and watchers kept).',
    fait: (c) => `eBay listing updated (${c.join(', ')}).`, rien: 'Nothing changed.', reseau: "eBay didn't answer: try again in a moment.",
    noms: { titre: 'title', description: 'description', prix: 'price', caracteristiques: 'item specifics', photos: 'photos' },
    carac: 'Item specifics', obligatoire: 'required', choisir: 'Choose…', aucune: '— (empty)',
    toutes: (n) => `Show the ${n} other item specifics`, moins: 'Fewer item specifics',
    photos: 'Photos', ajouter: 'Add photos', retirer: 'Remove', avant: 'Move up', apres: 'Move down',
    photosMax: `eBay accepts ${PHOTOS_MAX} photos at most.`, photoIllisible: (n) => `${n} photo(s) could not be read.`,
    lectureKo: 'Item specifics and photos could not be read on eBay: title, description and price can still be edited.',
    plusieurs: 'several values: separate them with a comma',
  },
};

export default function ModifierAnnonceEbay({ lang = 'fr', job: jobListe, supabase, onFermer, onModifiee }) {
  const M = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [job, setJob] = useState(jobListe);
  const [lue, setLue] = useState(false);
  const [titre, setTitre] = useState(String(jobListe?.title ?? '').slice(0, 80));
  const [description, setDescription] = useState(String(jobListe?.description ?? ''));
  const [prix, setPrix] = useState(jobListe?.price != null ? String(jobListe.price).replace('.', lang === 'en' ? '.' : ',') : '');
  // Ce qu'eBay porte (lire_annonce) : caractéristiques, photos, et le catalogue de la catégorie.
  const [ebay, setEbay] = useState(null);
  const [lectureKo, setLectureKo] = useState(false);
  const [saisies, setSaisies] = useState({});
  const [photos, setPhotos] = useState([]);
  const [toutes, setToutes] = useState(false);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let vivant = true;
    // La liste du Stock ne porte pas toujours la description : la tâche est relue telle qu'elle est en base.
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
    supabase.functions.invoke('ebay-account', { body: { action: 'lire_annonce', job_id: jobListe.id } })
      .then(({ data }) => {
        if (!vivant) return;
        if (!data?.ok) { setLectureKo(true); return; }
        setEbay({ aspects: data.annonce?.aspects ?? {}, photos: data.annonce?.photos ?? [], catalogue: data.catalogue ?? [] });
        setSaisies(Object.fromEntries(Object.entries(data.annonce?.aspects ?? {}).map(([k, v]) => [k, (v ?? []).join(', ')])));
        setPhotos(data.annonce?.photos ?? []);
      }, () => { if (vivant) setLectureKo(true); });
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobListe.id]);

  // L'ordre d'affichage : obligatoires, puis remplies, puis les autres (repliées). « Remplie » se lit sur ce qu'eBay
  // porte à l'ouverture, JAMAIS sur la saisie en cours : sinon le premier caractère tapé dans une « autre »
  // caractéristique la déplaçait vers le haut, le champ était recréé et perdait le focus (essai réel du 04/11 : « M »
  // enregistré au lieu de « Manches courtes »).
  const rangees = useMemo(() => {
    const cat = ebay?.catalogue ?? [];
    const rempli = (a) => (ebay?.aspects?.[a.name] ?? []).length > 0;
    const obligatoires = cat.filter((a) => a.required);
    const remplies = cat.filter((a) => !a.required && rempli(a));
    const autres = cat.filter((a) => !a.required && !rempli(a));
    // Une caractéristique portée par l'annonce mais absente du catalogue reste visible.
    const horsCatalogue = Object.keys(ebay?.aspects ?? {}).filter((n) => !cat.some((a) => a.name === n))
      .map((name) => ({ name, required: false, mode: 'FREE_TEXT', allowedValues: [] }));
    return { visibles: [...obligatoires, ...remplies, ...horsCatalogue], autres };
  }, [ebay]);

  const ajouterPhotos = async (files) => {
    const liste = [...(files ?? [])].slice(0, Math.max(0, PHOTOS_MAX - photos.length));
    if (!liste.length) { if (files?.length) setMessage({ ok: false, texte: M.photosMax }); return; }
    setAjoutEnCours(true); setMessage(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const r = await televerserPhotos(supabase, { userId: u?.user?.id, sources: liste, marqueur: 'ebay_', surErreur: 'ignorer' });
      // Les adresses publiques des photos FillSell : https, lues par eBay.
      setPhotos((p) => [...p, ...r.urls].slice(0, PHOTOS_MAX));
      if (r.illisibles.length) setMessage({ ok: false, texte: M.photoIllisible(r.illisibles.length) });
    } catch {
      setMessage({ ok: false, texte: M.reseau });
    } finally {
      setAjoutEnCours(false);
    }
  };
  const deplacer = (i, d) => setPhotos((p) => {
    const j = i + d;
    if (j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const enregistrer = async () => {
    const corps = { action: 'modifier_annonce', job_id: job.id };
    if (titre.trim() !== String(job?.title ?? '').trim()) corps.titre = titre;
    if (description.trim() !== String(job?.description ?? '').trim()) corps.description = description;
    const prixAvant = job?.price != null ? Number(job.price) : null;
    const prixLu = Number(String(prix).replace(',', '.'));
    if (String(prix).trim() && prixLu !== prixAvant) corps.prix = String(prix);
    if (ebay) {
      const ch = aspectsChanges(ebay.aspects, saisies, ebay.catalogue);
      if (Object.keys(ch).length) corps.aspects = ch;
      if (photos.length && JSON.stringify(photos) !== JSON.stringify(ebay.photos)) corps.photos = photos;
    }
    if (!['titre', 'description', 'prix', 'aspects', 'photos'].some((k) => k in corps)) { setMessage({ ok: false, texte: M.rien }); return; }
    setEnCours(true); setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-account', { body: corps });
      if (error || !data) { setMessage({ ok: false, texte: M.reseau }); return; }
      if (!data.ok) { setMessage({ ok: false, texte: data.message || M.reseau }); return; }
      const champs = (data.changements ?? []).map((c) => M.noms[c] ?? c);
      setMessage({ ok: true, texte: M.fait(champs) });
      if (ebay) {
        const aspectsApres = { ...ebay.aspects };
        for (const [k, v] of Object.entries(corps.aspects ?? {})) { if (v.length) aspectsApres[k] = v; else delete aspectsApres[k]; }
        setEbay({ ...ebay, aspects: aspectsApres, photos: corps.photos ?? ebay.photos });
      }
      onModifiee?.({ ...job, title: corps.titre ?? job.title, description: corps.description ?? job.description, price: corps.prix != null ? prixLu : job.price });
    } catch {
      setMessage({ ok: false, texte: M.reseau });
    } finally {
      setEnCours(false);
    }
  };

  const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 16, fontFamily: 'inherit', color: S.ink, outline: 'none' };
  const libelle = { fontSize: 13, fontWeight: 600, color: S.ink2, marginBottom: 6, display: 'block' };
  const titreSection = { fontSize: 15, fontWeight: 700, color: S.ink, marginTop: 4 };
  const petitBouton = { height: 32, padding: '0 10px', borderRadius: 10, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 12.5, fontWeight: 600, color: S.ink, fontFamily: 'inherit' };

  const ligneAspect = (a) => {
    const liste = Array.isArray(a.allowedValues) ? a.allowedValues : [];
    const fermee = a.mode === 'SELECTION_ONLY' && liste.length > 0;
    const multiple = a.cardinality === 'MULTI';
    const v = saisies[a.name] ?? '';
    const poser = (x) => setSaisies((s) => ({ ...s, [a.name]: x }));
    const idListe = `ebay-valeurs-${a.name.replace(/[^\w]/g, '_')}`;
    return (
      <label key={a.name}>
        <span style={libelle}>{a.name}{a.required ? ` · ${M.obligatoire}` : ''}{multiple && !fermee ? ` (${M.plusieurs})` : ''}</span>
        {fermee && !multiple ? (
          <select value={liste.includes(v) ? v : ''} onChange={(e) => poser(e.target.value)} style={champ}>
            <option value="">{a.required ? M.choisir : M.aucune}</option>
            {liste.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        ) : (
          <>
            <input value={v} list={liste.length ? idListe : undefined} maxLength={multiple ? 400 : 65}
              onChange={(e) => poser(e.target.value)} style={champ} />
            {liste.length ? <datalist id={idListe}>{liste.slice(0, 400).map((x) => <option key={x} value={x} />)}</datalist> : null}
          </>
        )}
      </label>
    );
  };

  const pied = (
    <>
      <button type="button" className="sk-btn sk-presse" onClick={onFermer} disabled={enCours}
        style={{ flex: 1, height: 48, borderRadius: 14, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 15, fontWeight: 700, color: S.ink, fontFamily: 'inherit' }}>
        {M.annuler}
      </button>
      <button type="button" className="sk-btn sk-presse" onClick={enregistrer} disabled={enCours || ajoutEnCours || !lue || !titre.trim()}
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

      {!ebay && !lectureKo ? <div style={{ fontSize: 13, color: S.ink2 }}>{M.lecture}</div> : null}
      {lectureKo ? <div style={{ fontSize: 13, color: S.ink2, lineHeight: 1.45 }}>{M.lectureKo}</div> : null}

      {ebay ? (
        <>
          <div style={titreSection}>{M.photos}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {photos.map((u, i) => (
              <div key={u} style={{ width: 96, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <img src={u} alt="" loading="lazy" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, border: `1px solid ${S.border}` }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" aria-label={M.avant} onClick={() => deplacer(i, -1)} disabled={i === 0} style={{ ...petitBouton, flex: 1, padding: 0 }}>←</button>
                  <button type="button" aria-label={M.apres} onClick={() => deplacer(i, 1)} disabled={i === photos.length - 1} style={{ ...petitBouton, flex: 1, padding: 0 }}>→</button>
                </div>
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))} disabled={photos.length <= 1} style={petitBouton}>{M.retirer}</button>
              </div>
            ))}
          </div>
          {photos.length < PHOTOS_MAX ? (
            <label style={{ ...petitBouton, display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', height: 40, cursor: 'pointer', opacity: ajoutEnCours ? 0.6 : 1 }}>
              {ajoutEnCours ? '…' : M.ajouter}
              <input type="file" accept="image/*" multiple hidden disabled={ajoutEnCours} onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          ) : null}

          <div style={titreSection}>{M.carac}</div>
          {rangees.visibles.map(ligneAspect)}
          {rangees.autres.length ? (
            <button type="button" onClick={() => setToutes((t) => !t)} style={{ ...petitBouton, alignSelf: 'flex-start', height: 40 }}>
              {toutes ? M.moins : M.toutes(rangees.autres.length)}
            </button>
          ) : null}
          {toutes ? rangees.autres.map(ligneAspect) : null}
        </>
      ) : null}

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
