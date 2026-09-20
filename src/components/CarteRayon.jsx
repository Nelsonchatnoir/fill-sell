// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON, ET LES CHAMPS QUI EN DÉCOULENT (2026-09-20, lot B)
// ═══════════════════════════════════════════════════════════════════════════
// Ce bloc vit DANS la carte d'une plateforme, sous le titre et la description.
// Il répond à trois questions que l'écran ne posait jamais :
//   · où mon article va-t-il tomber sur cette plateforme ?
//   · puis-je le changer ?              (la demande de XEWER : ses jeux vidéo
//     classés en consoles, donc des frais de port faux)
//   · que me reste-t-il vraiment à renseigner ?
//
// ⛔ ZÉRO FRICTION EN PLUS. Tout ici est en LECTURE tant qu'on ne touche à
//    rien : le rayon s'affiche, les champs connus se résument en une ligne,
//    et la personne qui ne change rien ne tape pas un geste de plus. Le
//    catalogue n'est même pas lu tant que la carte est repliée.
// ⛔ LES MOTS DE LA PERSONNE, JAMAIS LES CODES. Ce bloc lit `platform_fields`
//    tel que la personne et l'IA l'ont rempli — « Bon état », « 6 mois » —
//    et jamais la version transformée pour la plateforme (« good »,
//    « 3-6 mois / 62 cm »), qui n'est calculée qu'au moment de publier.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, MapPin } from 'lucide-react';
import { UI } from './ui';
import { feuillesDe } from '../utils/categorieParMot';
import { texteComparable } from '../utils/texteComparable';
import { libelleRayon, cheminComplet, cleCategorie } from '../utils/rayonPublication';
import { lireChampsDuRayon, classerChamps, lignesDepuisConfigLocale, CANAL_ASPECTS } from '../utils/champsDuRayon';

const MOTS = {
  fr: {
    rayon: 'RAYON', changer: 'Changer', annuler: 'Annuler',
    chercher: 'Chercher un rayon…', aucun: 'Aucun rayon trouvé pour ce mot.',
    // ⛔ TROIS VÉRITÉS DIFFÉRENTES, TROIS PHRASES DIFFÉRENTES. Dire « cette
    //    plateforme ne partira pas » à tout le monde était faux deux fois sur
    //    cinq, et ça fait peur pour rien :
    //    · Vinted / Leboncoin / eBay : sans rayon, la plateforme est
    //      VRAIMENT écartée avant le débit. La phrase est vraie.
    //    · Opla : sa catégorie est posée côté serveur au départ du job, et
    //      son pré-vol demande s'il ne sait pas. Elle part. On le dit.
    //    · Beebs : son formulaire pose la question au dépôt. Elle part aussi.
    pasDeRayon: 'Aucun rayon trouvé pour cet article. Choisis-le ici — sans lui, cette plateforme ne partira pas.',
    pasDeRayonOpla: 'Opla choisit le rayon au moment de l’envoi. Tu peux le fixer ici si tu préfères décider toi-même.',
    pasDeRayonBeebs: 'Beebs posera la question au moment du dépôt. Tu peux choisir le rayon ici pour ne pas avoir à y répondre.',
    tonChoix: 'ton choix', trouve: 'trouvé pour toi', aVerifier: 'à vérifier',
    manque: 'À COMPLÉTER', dejaLa: (n) => `Déjà rempli · ${n}`,
    obligatoire: 'demandé par la plateforme',
    horsGrille: (v) => `« ${v} » n’existe pas dans ce rayon — choisis dans la liste`,
    revenir: 'Revenir au rayon trouvé',
    voisins: 'Rayons voisins',
    chargement: 'Chargement des rayons…',
    tapez: 'Tape un mot pour chercher un rayon.',
    choisir: 'Choisir',
  },
  en: {
    rayon: 'CATEGORY', changer: 'Change', annuler: 'Cancel',
    chercher: 'Search a category…', aucun: 'No category matches that word.',
    pasDeRayon: 'No category found for this item. Pick one here — without it, this platform will be skipped.',
    pasDeRayonOpla: 'Opla picks the category when the listing is sent. You can set it here if you would rather decide.',
    pasDeRayonBeebs: 'Beebs will ask at posting time. You can pick the category here so you do not have to.',
    tonChoix: 'your choice', trouve: 'found for you', aVerifier: 'worth checking',
    manque: 'TO COMPLETE', dejaLa: (n) => `Already filled · ${n}`,
    obligatoire: 'required by the platform',
    horsGrille: (v) => `“${v}” does not exist in this category — pick from the list`,
    revenir: 'Back to the found category',
    voisins: 'Nearby categories',
    chargement: 'Loading categories…',
    tapez: 'Type a word to search.',
    choisir: 'Pick',
  },
};

/** Recherche dans les feuilles relevées : tous les mots tapés doivent être
 *  dans le chemin. Comparaison sans accents ni casse (texteComparable), la
 *  même que le reste de la résolution — « etagere » trouve « Étagères ». */
function chercher(feuilles, motif, max = 40) {
  const mots = texteComparable(motif).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const sortie = [];
  for (const f of feuilles) {
    const hay = texteComparable(f.chemin.join(' '));
    if (mots.every((m) => hay.includes(m))) {
      sortie.push(f);
      if (sortie.length >= max) break;
    }
  }
  // La feuille dont le DERNIER segment colle le mieux d'abord : on cherche un
  // rayon, pas une branche.
  const cible = texteComparable(motif);
  return sortie.sort((a, b) => {
    const fa = texteComparable(a.chemin[a.chemin.length - 1]);
    const fb = texteComparable(b.chemin[b.chemin.length - 1]);
    return (fa === cible ? -2 : fa.includes(cible) ? -1 : 0) - (fb === cible ? -2 : fb.includes(cible) ? -1 : 0)
      || a.chemin.length - b.chemin.length;
  });
}

export default function CarteRayon({
  platform, lang = 'fr',
  rayon,                  // { chemin, id, choisi } — déjà résolu par l'appelant
  suggestions = [],       // les candidates du calcul : [{ chemin, id }]
  champs,                 // platform_fields de CETTE copie (les mots de la personne)
  configLocale = [],     // les champs que l'extension consomme de toute façon
  supabase,
  onChoisirRayon,         // (choix|null) => void
  onChampChange,          // (cle, valeur, cleCatalogue) => void
}) {
  const T = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [ouvertPicker, setOuvertPicker] = useState(false);
  const [motif, setMotif] = useState('');
  const [feuilles, setFeuilles] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [connusOuverts, setConnusOuverts] = useState(false);
  const cleLue = useRef(null);

  const cle = cleCategorie(rayon?.chemin);

  // ── Le catalogue se lit QUAND le rayon est connu, et se RELIT quand il
  //    change : c'est tout le point du lot — les champs découlent du rayon.
  //    Une lecture par rayon, mise en cache par la clé déjà lue.
  useEffect(() => {
    const signature = cle && platform ? `${platform}|${cle}` : null;
    if (cleLue.current === signature) return undefined;
    let vivant = true;
    (async () => {
      // Pas de rayon : plus de champs de rayon non plus. La remise à zéro
      // passe par la même voie asynchrone que la lecture — un setState
      // synchrone dans un effet enchaîne les rendus pour rien.
      const lignes = signature ? await lireChampsDuRayon(supabase, platform, cle) : null;
      if (!vivant) return;
      cleLue.current = signature;
      setCatalogue(lignes);
    })();
    return () => { vivant = false; };
  }, [platform, cle, supabase]);

  const { questions, connus, defauts } = useMemo(
    () => classerChamps(
      [...(catalogue ?? []), ...lignesDepuisConfigLocale(configLocale)],
      champs ?? {}, platform
    ),
    [catalogue, champs, platform, configLocale]
  );

  // ── LE BRUIT PREND SA VALEUR TOUT SEUL ───────────────────────────────────
  // « Chargeur inclus » et consorts ne valent pas qu'on arrête quelqu'un : ils
  // reçoivent le défaut le plus prudent, sans question. Une fois posé, le
  // champ réapparaît dans « Déjà rempli » — donc ce n'est pas caché, c'est
  // juste que ce n'était pas une question.
  const defautsPoses = useRef(new Set());
  useEffect(() => {
    if (!defauts?.length || !onChampChange) return;
    for (const d of defauts) {
      const marque = `${platform}|${cle}|${d.cle}`;
      if (defautsPoses.current.has(marque)) continue;
      defautsPoses.current.add(marque);
      onChampChange(d.cleNotre, d.valeur, d.cle);
    }
  }, [defauts, onChampChange, platform, cle]);

  // Les feuilles de la plateforme ne se chargent qu'à l'ouverture du
  // sélecteur : 2 500 entrées pour Vinted, on ne les descend pas pour rien.
  useEffect(() => {
    if (!ouvertPicker || feuilles) return undefined;
    let vivant = true;
    feuillesDe(platform).then((f) => { if (vivant) setFeuilles(f); }).catch(() => {});
    return () => { vivant = false; };
  }, [ouvertPicker, platform, feuilles]);

  // ── L'ÉCRAN N'EST JAMAIS VIDE ────────────────────────────────────────────
  // Quand le calcul est tombé juste, il n'avait pas ratissé de candidates :
  // ouvrir « Changer » donnait une boîte de recherche nue, et celui qui ne
  // sait pas quoi écrire restait bloqué devant rien.
  // On propose alors les VOISINS : les rayons qui partagent le même parent.
  // Ce sont exactement les bons candidats — « Jeux vidéo » est le voisin de
  // « Consoles », « Non-fiction » celui de « Fiction » — et ils sont là sans
  // une frappe. À défaut de parent (rayon de premier niveau), on montre les
  // rayons du même sommet d'arbre.
  const voisins = useMemo(() => {
    if (!feuilles || !rayon?.chemin?.length) return [];
    const c = rayon.chemin;
    const parent = c.slice(0, -1);
    const memeParent = (f) => f.chemin.length === c.length
      && parent.every((s, i) => texteComparable(String(s)) === texteComparable(String(f.chemin[i] ?? '')));
    let liste = feuilles.filter(memeParent);
    if (liste.length <= 1 && c.length > 1) {
      // Rayon fils unique : on remonte d'un cran plutôt que de ne rien montrer.
      const grand = c.slice(0, -2);
      liste = feuilles.filter((f) => f.chemin.length === c.length
        && grand.every((s, i) => texteComparable(String(s)) === texteComparable(String(f.chemin[i] ?? ''))));
    }
    return liste.slice(0, 40);
  }, [feuilles, rayon]);

  const resultats = useMemo(() => {
    if (motif.trim().length >= 2 && feuilles) return chercher(feuilles, motif);
    // Sans recherche : d'abord les candidates que le calcul avait ratissées
    // pour CET objet (c'est là que se trouve « Jeux vidéo » quand l'app a posé
    // « Consoles » — zéro frappe pour corriger le cas de XEWER), puis les
    // voisins du rayon courant. Jamais rien.
    const vus = new Set();
    const sortie = [];
    for (const f of [...suggestions, ...voisins]) {
      const k = f.chemin.join('>');
      if (vus.has(k)) continue;
      vus.add(k);
      sortie.push(f);
    }
    return sortie.slice(0, 25);
  }, [motif, feuilles, suggestions, voisins]);

  // Les voisins ont besoin de l'arbre : on le charge dès l'ouverture du
  // sélecteur, exactement comme la recherche (et jamais avant).
  const listeVide = !motif.trim() && resultats.length === 0;

  const memeChemin = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((s, i) => texteComparable(String(s)) === texteComparable(String(b[i])));

  const st = {
    bloc: { border: `1px solid ${UI.border}`, borderRadius: 14, padding: 12, background: UI.paper, marginBottom: 12 },
    eyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: UI.mute2 },
    feuille: { fontSize: 15, fontWeight: 700, color: UI.ink, lineHeight: 1.25, overflowWrap: 'anywhere' },
    chemin: { fontSize: 11.5, color: UI.mute2, marginTop: 2, lineHeight: 1.35, overflowWrap: 'anywhere' },
    lien: { background: 'none', border: 'none', color: UI.tealDeep, fontWeight: 700, fontSize: 12.5,
            cursor: 'pointer', fontFamily: 'inherit', padding: '6px 2px', flexShrink: 0 },
    option: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '9px 10px', borderRadius: 10, border: `1px solid ${UI.border}`, background: UI.card,
              cursor: 'pointer', fontFamily: 'inherit', marginTop: 6 },
  };

  return (
    <>
      {/* ── LE RAYON ────────────────────────────────────────────────── */}
      <div style={st.bloc}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={st.eyebrow}>{T.rayon}</span>
          {rayon?.chemin?.length ? (
            <span style={{ fontSize: 10.5, fontWeight: 700,
                           color: rayon.choisi ? UI.tealDeep : rayon.incertain ? "#92400E" : UI.mute2 }}>
              {rayon.choisi ? T.tonChoix : rayon.incertain ? T.aVerifier : T.trouve}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
          <MapPin size={15} color={rayon?.chemin?.length ? UI.tealDeep : UI.mute} style={{ flexShrink: 0, marginTop: 3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {rayon?.chemin?.length ? (
              <>
                <div style={st.feuille}>{libelleRayon(rayon.chemin)}</div>
                {rayon.chemin.length > 1 && <div style={st.chemin}>{cheminComplet(rayon.chemin)}</div>}
              </>
            ) : (
              <div style={{ ...st.chemin, marginTop: 0 }}>
                {platform === 'opla' ? T.pasDeRayonOpla : platform === 'beebs' ? T.pasDeRayonBeebs : T.pasDeRayon}
              </div>
            )}
          </div>
          <button type="button" style={st.lien} onClick={() => { setOuvertPicker((v) => !v); setMotif(''); }}>
            {ouvertPicker ? T.annuler : T.changer}
          </button>
        </div>

        {ouvertPicker && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: UI.card,
                          border: `1px solid ${UI.border}`, borderRadius: 10, padding: '0 10px' }}>
              <Search size={14} color={UI.mute} style={{ flexShrink: 0 }} />
              <input
                type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
                placeholder={T.chercher} autoFocus
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                         padding: '10px 0', fontSize: 13.5, fontFamily: 'inherit', color: UI.ink }}
              />
              {motif && (
                <button type="button" onClick={() => setMotif('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
                  <X size={14} color={UI.mute} />
                </button>
              )}
            </div>

            <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 2 }}>
              {resultats.length === 0 && motif.trim().length >= 2 && (
                <div style={{ ...st.chemin, padding: '10px 2px' }}>{T.aucun}</div>
              )}
              {listeVide && (
                <div style={{ ...st.chemin, padding: '10px 2px' }}>{feuilles ? T.tapez : T.chargement}</div>
              )}
              {resultats.map((f, i) => {
                const actif = memeChemin(f.chemin, rayon?.chemin);
                return (
                  <button
                    key={`${f.chemin.join('>')}-${i}`} type="button" style={{
                      ...st.option,
                      borderColor: actif ? UI.teal : UI.border,
                      background: actif ? UI.chip : UI.card,
                    }}
                    onClick={() => {
                      onChoisirRayon?.({ chemin: f.chemin, id: f.id ?? null, le: new Date().toISOString() });
                      setOuvertPicker(false); setMotif('');
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: UI.ink, overflowWrap: 'anywhere' }}>
                        {libelleRayon(f.chemin)}
                      </div>
                      {f.chemin.length > 1 && (
                        <div style={{ fontSize: 11, color: UI.mute2, overflowWrap: 'anywhere' }}>{cheminComplet(f.chemin)}</div>
                      )}
                    </div>
                    {actif && <Check size={15} color={UI.tealDeep} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>

            {rayon?.choisi && (
              <button type="button" style={{ ...st.lien, marginTop: 8 }}
                onClick={() => { onChoisirRayon?.(null); setOuvertPicker(false); }}>
                {T.revenir}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── CE QU'IL RESTE À DONNER ─────────────────────────────────── */}
      {questions.length > 0 && (
        <div style={{ ...st.bloc, background: UI.card, borderColor: UI.teal }}>
          <div style={st.eyebrow}>{T.manque}</div>
          {questions.map((q) => (
            <div key={q.cle} style={{ marginTop: 9 }}>
              <div style={{ fontSize: 11.5, color: UI.ink, fontWeight: 600 }}>{q.libelle}</div>
              <div style={{ fontSize: 10.5, color: q.horsGrille ? '#92400E' : UI.mute2, marginBottom: 4 }}>
                {q.horsGrille ? T.horsGrille(q.valeur) : T.obligatoire}
              </div>
              {q.valeurs.length > 0 ? (
                <select
                  value={q.valeur}
                  onChange={(e) => onChampChange?.(q.cleNotre, e.target.value, q.cle)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${UI.border}`,
                           fontSize: 13.5, fontFamily: 'inherit', background: UI.paper, color: UI.ink, boxSizing: 'border-box' }}
                >
                  <option value="">—</option>
                  {q.valeurs.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input
                  type="text" value={q.valeur}
                  onChange={(e) => onChampChange?.(q.cleNotre, e.target.value, q.cle)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${UI.border}`,
                           fontSize: 13.5, fontFamily: 'inherit', background: UI.paper, color: UI.ink, boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CE QU'ON SAIT DÉJÀ — replié, parce que ce ne sont pas des
             questions : ce sont des réponses. ─────────────────────────── */}
      {connus.length > 0 && (
        <div style={{ ...st.bloc, marginBottom: 12 }}>
          <button type="button" onClick={() => setConnusOuverts((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                     width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                     fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ ...st.eyebrow, color: UI.mute2 }}>{T.dejaLa(connus.length)}</span>
            <span style={{ fontSize: 11, color: UI.mute2 }}>{connusOuverts ? '▴' : '▾'}</span>
          </button>
          {!connusOuverts && (
            <div style={{ ...st.chemin, marginTop: 5 }}>
              {connus.map((c) => c.valeur).join(' · ')}
            </div>
          )}
          {/* Ouverts, ils redeviennent MODIFIABLES : une valeur trouvée peut
              être fausse, et c'était tout l'intérêt de l'ancienne grille.
              Ce qui change, c'est qu'on ne les montre plus par défaut — ce
              sont des réponses, pas des questions. */}
          {connusOuverts && connus.map((c) => (
            <div key={c.cle} style={{ marginTop: 9 }}>
              <div style={{ fontSize: 11.5, color: UI.mute2, fontWeight: 600, marginBottom: 3 }}>{c.libelle}</div>
              {c.valeurs.length > 0 ? (
                <select
                  value={c.valeurs.includes(c.valeur) ? c.valeur : ''}
                  onChange={(ev) => onChampChange?.(c.cleNotre, ev.target.value, c.cle)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${UI.border}`,
                           fontSize: 13, fontFamily: 'inherit', background: UI.card, color: UI.ink, boxSizing: 'border-box' }}
                >
                  {/* La valeur en place peut venir d'ailleurs que de la liste
                      relevée (saisie à la main, autre plateforme) : on la garde
                      visible plutôt que de l'effacer en silence. */}
                  {!c.valeurs.includes(c.valeur) && <option value="">{c.valeur}</option>}
                  {c.valeurs.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input
                  type="text" value={c.valeur}
                  onChange={(ev) => onChampChange?.(c.cleNotre, ev.target.value, c.cle)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${UI.border}`,
                           fontSize: 13, fontFamily: 'inherit', background: UI.card, color: UI.ink, boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

