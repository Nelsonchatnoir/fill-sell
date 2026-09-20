// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › CHAMPS DES PLATEFORMES — LA FILE DE QUARANTAINE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE C'EST. Quand l'extension relève un champ marqué OBLIGATOIRE sur le
// formulaire d'une plateforme, il n'entre pas au catalogue tout de suite : le
// trigger `aspects_garde_corroboration` le met en QUARANTAINE tant que DEUX
// observateurs distincts ne l'ont pas vu, représentant au moins la moitié des
// releveurs de cette catégorie. C'est la réponse à la contamination du 16/09 —
// une observation chez UN seul compte était devenue une règle pour tout le
// parc, et Ornella s'est retrouvée devant un champ « Photos » vide.
//
// Le mécanisme tourne depuis. Ce qui manquait, c'est l'ARBITRAGE : certaines
// lignes n'atteindront jamais deux témoins (une catégorie que deux personnes
// ne publieront jamais le même mois), et d'autres ne doivent jamais entrer.
// Cet écran est le seul endroit où elles se tranchent.
//
// ⛔ IL N'AJOUTE AUCUNE GARDE ET N'EN LÈVE AUCUNE. La corroboration, la garde
//    « question posable » (photos/titre/description/prix et clés non
//    traduites) et le gel Leboncoin du 16/09 restent exactement ce qu'ils
//    sont. Cet écran se pose PAR-DESSUS.
//
// ⚠️ CONSÉQUENCE DIRECTE, ET ELLE EST VISIBLE À L'ÉCRAN : sur Leboncoin, le
//    gel interdit à `required` de repasser de false à true, et trois clés
//    (estimated_parcel_weight, quantity, spare_parts_availability) ne peuvent
//    jamais être requises. Une ligne Leboncoin ne peut donc PAS être validée
//    ici — seulement refusée ou laissée en attente. On l'écrit sur la ligne
//    plutôt que d'offrir un bouton qui ne ferait rien.
//
// COMMENT UNE VALIDATION PASSE LA CORROBORATION SANS LA TOUCHER : la garde ne
// met en quarantaine que les écritures de source `dom` (le relevé automatique).
// Une validation humaine écrit source = `manual`, que la garde laisse passer
// par construction. Rien n'est contourné : c'est la porte prévue.
//
// OÙ VIT LE REFUS. Il n'y a pas de table de décisions, et il n'en faut pas :
// `platform_category_aspects.source` est contraint à (dom|server_400|manual),
// donc un refus ne peut pas s'y marquer. Il se journalise dans `usage_logs`
// (feature `catalogue_quarantaine`), qui porte déjà les traces de l'app — qui,
// quand, quoi. La file exclut ce qui a été tranché : un refus ne revient pas.
//
// ⛔ ÉCRITURE = RELECTURE. Un UPDATE filtré par RLS rend 0 ligne SANS erreur,
//    et un trigger peut remettre `required` à false en silence. On relit donc
//    la valeur écrite et on n'affiche « validé » que si elle est vraiment
//    passée — jamais un ✅ qui n'a rien enregistré (doctrine du 19/09).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { R } from './theme';
import { Groupe, Carte, Bouton, Note, Pastille } from './ReglagesUI';

const FEATURE = 'catalogue_quarantaine';
// Le gel du 16/09, recopié ici pour l'EXPLIQUER à l'écran — la garde qui fait
// foi est en base (`garde_aspects_lbc_requis`), pas cette constante.
const LBC_CLES_INTERDITES = ['estimated_parcel_weight', 'quantity', 'spare_parts_availability'];

const cle = (r) => `${r.platform}|${r.category_key}|${r.field_key}`;

const NOMS_PF = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

// ⛔ POSTGREST TRONQUE À 1000 LIGNES, SANS ERREUR NI AVERTISSEMENT — et
//    `platform_category_aspects` en porte 1682 (relevé le 20/09). Un
//    `.select()` nu perdrait donc un tiers du catalogue EN SILENCE, et toute
//    ligne de file dont la fiche tombe au-delà de la millième disparaîtrait
//    de l'écran comme si elle n'existait pas. On pagine.
async function toutLire(construire) {
  const PAS = 1000;
  const tout = [];
  for (let debut = 0; ; debut += PAS) {
    const { data, error } = await construire().range(debut, debut + PAS - 1);
    if (error || !data) break;
    tout.push(...data);
    if (data.length < PAS) break;
  }
  return tout;
}

function dateCourte(v) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

// Les deux formes que la garde « question posable » refuse. Recopiées des
// expressions RÉELLES du trigger `garde_aspects_question_posable` — elles ne
// remplacent rien, elles permettent de DIRE pourquoi au lieu d'offrir un
// bouton qui remettrait la ligne à « pas obligatoire » sans un mot.
const CONTENU_ANNONCE = /^(photo|photos|image|images|picture|pictures|media|title|titre|description|price|prix)$/i;
const CLE_BRUTE = /^[a-z0-9]+(_[a-z0-9]+)+$/;

/** Pourquoi cette ligne ne peut pas être validée, ou null si elle le peut. */
function motifNonValidable(r) {
  if (CONTENU_ANNONCE.test(String(r.field_key ?? ''))) {
    return "c'est le contenu de l'annonce (photo, titre, description, prix), pas une caractéristique — il est déjà demandé ailleurs et ne peut pas devenir une question";
  }
  if (r.field_label && r.field_label === r.field_key && CLE_BRUTE.test(r.field_label)) {
    return "la plateforme n'a jamais donné de libellé lisible à ce champ — on ne peut pas poser une question intitulée « " + r.field_key + " »";
  }
  if (r.platform !== 'leboncoin') return null;
  if (LBC_CLES_INTERDITES.includes(r.field_key)) {
    return "ce champ n'existe pas sur le formulaire particulier de Leboncoin — il ne peut jamais être requis (garde du 16/09)";
  }
  return "le gel Leboncoin du 16/09 interdit de rendre un champ obligatoire ici — à lever séparément";
}

export default function SousPageCatalogueQuarantaine({ c, T }) {
  const [lignes, setLignes] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);

  // `lire` RESTITUE la file, elle ne la pose pas : l'appelant décide quoi en
  // faire. C'est ce qui permet au montage de jeter le résultat si l'écran a
  // été quitté entre-temps, sans poser un state sur un composant démonté.
  const lire = useCallback(async () => {
    // Trois lectures, aucune jointure côté serveur : les trois tables sont
    // lisibles par `authenticated`. Chacune paginée (cf. toutLire).
    const [obs, dec] = await Promise.all([
      toutLire(() => supabase.from('platform_category_aspect_observations')
        .select('platform, category_key, field_key, observer, required, seen_count, first_seen_at, last_seen_at')
        .eq('required', true)
        .order('platform').order('category_key').order('field_key').order('observer')),
      toutLire(() => supabase.from('usage_logs').select('metadata')
        .eq('feature', FEATURE).order('created_at')),
    ]);

    // Le catalogue n'est lu que sur les clés effectivement observées : c'est
    // la seule partie qui nous intéresse, et ça évite de rapatrier 1682
    // lignes pour en garder trente. Le triple filtre est LARGE (il ne sait
    // pas apparier platform+categorie+champ), d'où la pagination derrière.
    const uniques = (f) => [...new Set(obs.map(f).filter(Boolean))];
    const cat = obs.length ? await toutLire(() => supabase.from('platform_category_aspects')
      .select('platform, category_key, field_key, field_label, required, allowed_values, input_type')
      .in('platform', uniques((o) => o.platform))
      .in('category_key', uniques((o) => o.category_key))
      .in('field_key', uniques((o) => o.field_key))
      .order('platform').order('category_key').order('field_key')) : [];

    const tranchees = new Set((dec ?? []).map((d) => {
      const m = d?.metadata ?? {};
      return `${m.platform}|${m.category_key}|${m.field_key}`;
    }));
    const catalogue = new Map((cat ?? []).map((r) => [cle(r), r]));

    // Une ligne de file = un champ OBSERVÉ obligatoire, qui ne l'est pas au
    // catalogue, et qui n'a pas encore été tranché. Les observateurs sont
    // regroupés : c'est leur NOMBRE qui compte (le seuil est à deux).
    const par = new Map();
    for (const o of obs) {
      const k = cle(o);
      if (tranchees.has(k)) continue;
      const ligneCat = catalogue.get(k);
      if (!ligneCat || ligneCat.required) continue; // absent du catalogue, ou déjà requis
      const e = par.get(k) ?? {
        ...o,
        field_label: ligneCat.field_label,
        allowed_values: ligneCat.allowed_values,
        input_type: ligneCat.input_type,
        observateurs: new Set(),
        vues: 0,
        vu_le: null,
      };
      e.observateurs.add(o.observer);
      e.vues += Number(o.seen_count ?? 1);
      const d = o.last_seen_at ?? o.first_seen_at;
      if (d && (!e.vu_le || d > e.vu_le)) e.vu_le = d;
      par.set(k, e);
    }
    return [...par.values()].sort((a, b) => (b.observateurs.size - a.observateurs.size)
      || String(a.platform).localeCompare(String(b.platform))
      || String(a.category_key).localeCompare(String(b.category_key)));
  }, []);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const file = await lire();
      if (vivant) setLignes(file);
    })();
    return () => { vivant = false; };
  }, [lire]);

  async function tracer(r, decision, resultat) {
    if (!c.user?.id) return;
    await supabase.from('usage_logs').insert({
      user_id: c.user.id,
      feature: FEATURE,
      metadata: {
        platform: r.platform, category_key: r.category_key, field_key: r.field_key,
        field_label: r.field_label ?? null, decision, resultat: resultat ?? null,
        temoins: r.observateurs.size,
      },
    });
  }

  async function valider(r) {
    setEnCours(cle(r)); setMessage(null);
    // `manual` : la source que la garde de corroboration laisse passer. Ce
    // n'est pas un contournement, c'est la porte prévue pour une décision
    // humaine — le relevé automatique, lui, reste en `dom` et reste corroboré.
    const { data, error } = await supabase.from('platform_category_aspects')
      .update({ required: true, source: 'manual' })
      .eq('platform', r.platform).eq('category_key', r.category_key).eq('field_key', r.field_key)
      .select('required');
    const passe = !error && Array.isArray(data) && data.length > 0 && data[0]?.required === true;
    if (error) setMessage({ ton: 'ko', texte: `« ${r.field_label} » n'a pas été enregistré : ${error.message}` });
    else if (!passe) {
      setMessage({ ton: 'ko', texte: `« ${r.field_label} » n'est pas passé : une garde en base l'a remis à « pas obligatoire ». La ligne reste dans la file.` });
    } else {
      await tracer(r, 'valide', 'requis');
      setMessage({ ton: 'ok', texte: `« ${r.field_label} » est maintenant demandé sur ${NOMS_PF[r.platform] ?? r.platform} — ${r.category_key}.` });
      setLignes(await lire());
    }
    setEnCours(null);
  }

  async function refuser(r) {
    setEnCours(cle(r)); setMessage(null);
    // ⛔ AUCUNE ÉCRITURE AU CATALOGUE : la ligne y est déjà à « pas
    //    obligatoire ». Refuser, c'est seulement dire qu'on ne veut plus voir
    //    la question — sinon la file se remplit des mêmes lignes à chaque
    //    nouvelle observation.
    await tracer(r, 'refuse', null);
    setMessage({ ton: 'ok', texte: `« ${r.field_label} » ne sera plus proposé. Il n'est pas demandé aux utilisateurs.` });
    setLignes(await lire());
    setEnCours(null);
  }

  if (lignes === null) return <Note>{T.quarantaineChargement}</Note>;

  return (
    <>
      <Groupe intitule={T.quarantaineTitre} appoint={lignes.length ? String(lignes.length) : null}>
        <Note>{T.quarantaineIntro}</Note>
      </Groupe>

      {message && (
        <Carte pad>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: message.ton === 'ko' ? R.negatifTexte : R.tealDeep, fontWeight: 600 }}>
            {message.texte}
          </div>
        </Carte>
      )}

      {lignes.length === 0 && (
        <Carte pad><div style={{ fontSize: 13.5, color: R.texteSecondaire, lineHeight: 1.5 }}>{T.quarantaineVide}</div></Carte>
      )}

      {lignes.map((r) => {
        const k = cle(r);
        const bloque = motifNonValidable(r);
        const valeurs = Array.isArray(r.allowed_values) ? r.allowed_values : [];
        const occupe = enCours === k;
        return (
          <Carte key={k} pad>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: R.ink, letterSpacing: '-0.01em' }}>
                  {r.field_label || r.field_key}
                </div>
                <div style={{ fontSize: 11.5, color: R.texteSecondaire, fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>
                  {r.field_key}
                </div>
              </div>
              <Pastille ton={r.observateurs.size >= 2 ? 'ok' : 'neutre'}>
                {r.observateurs.size === 1 ? T.unTemoin : T.nTemoins(r.observateurs.size)}
              </Pastille>
            </div>

            <div style={{ fontSize: 12.5, color: R.ink, marginTop: 8, lineHeight: 1.5 }}>
              <b>{NOMS_PF[r.platform] ?? r.platform}</b> · {r.category_key}
            </div>

            <div style={{ fontSize: 12.5, color: valeurs.length ? R.texteSecondaire : R.negatifTexte, marginTop: 6, lineHeight: 1.5 }}>
              {valeurs.length
                ? `${T.quarantaineValeurs(valeurs.length)} ${valeurs.slice(0, 5).map(String).join(' · ')}${valeurs.length > 5 ? ' …' : ''}`
                : T.quarantaineSansValeur}
            </div>

            <div style={{ fontSize: 11.5, color: R.texteSecondaire, marginTop: 6 }}>
              {T.quarantaineVu(r.vues)}{r.vu_le ? ` · ${T.quarantaineLe} ${dateCourte(r.vu_le)}` : ''}
            </div>

            {bloque && (
              <div style={{ fontSize: 12, color: R.texteSecondaire, background: R.paper, border: `1px solid ${R.border}`,
                            borderRadius: 10, padding: '8px 10px', marginTop: 9, lineHeight: 1.45, fontWeight: 600 }}>
                {T.quarantaineBloquee} {bloque}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
              {!bloque && (
                <Bouton ton="plein" onClick={() => valider(r)} enCours={occupe} disabled={occupe}>
                  {T.quarantaineValider}
                </Bouton>
              )}
              <Bouton ton="creux" onClick={() => refuser(r)} enCours={occupe} disabled={occupe}>
                {T.quarantaineRefuser}
              </Bouton>
            </div>
          </Carte>
        );
      })}

      <Note>{T.quarantainePied}</Note>
    </>
  );
}
