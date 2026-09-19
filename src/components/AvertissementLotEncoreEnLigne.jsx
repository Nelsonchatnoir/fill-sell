// ── « Encore en ligne » — LA VERSION LOT (2026-09-19) ────────────────────────
// AvertissementAnnoncesEnLigne dit, pour UN article, où une copie reste
// achetable. Ce composant dit la même chose pour une SÉLECTION, avant
// « Pas vendues (N) » — le geste en lot de la modale « Annonces plus en ligne ».
//
// POURQUOI IL EXISTE. « Je l'ai retirée » ne retire RIEN ailleurs, et c'est
// voulu (décision du 18/09 : une réponse sur une plateforme n'en conclut pas
// une autre). Mais en lot, personne ne peut le deviner : on coche 33 lignes,
// on clique une fois, et les copies Leboncoin ou eBay restent achetables sans
// qu'un mot l'ait dit. Le lot NOMME donc les articles concernés — les compter
// ne suffit pas, c'est le titre qui permet d'aller les retirer.
//
// ⛔ AUCUN CALCUL ICI. Le juge est `annoncesEncoreEnLigne` (utils/
// publicationState.js), le même que la modale « Marquer comme vendu » et que la
// carte vocale. Il écarte déjà la plateforme dont la sonde a constaté
// l'absence : sur ces articles-là (disparu_le posé), Vinted n'apparaît jamais —
// ce qui reste est exactement « la copie qui vit ailleurs ».
//
// UNE SEULE REQUÊTE pour toute la sélection : monter N fois le composant à
// l'unité ferait N lectures, et la sélection peut valoir des centaines
// d'articles.
//
// Muet tant que la lecture n'a pas répondu, et muet en cas d'échec : un
// avertissement qui clignote se lit comme un bug, et on n'invente jamais une
// annonce en ligne. Il n'empêche jamais le geste — il l'éclaire.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { annoncesEncoreEnLigne } from '../utils/publicationState';
import { PLATFORM_LABELS } from '../utils/shared';
import { V } from './voice/tokens';

const PLAFOND_LISTE = 40; // « les 33 d'aujourd'hui tiennent sur un écran »

export default function AvertissementLotEncoreEnLigne({ items = [], lang = 'fr', style }) {
  const fr = lang !== 'en';
  // La clé de la lecture : la sélection elle-même. Elle change → la réponse
  // précédente ne vaut plus, et le rendu repasse muet sans setState de remise
  // à zéro (donc sans rendu en cascade).
  const cle = items.map(i => i.id).sort().join(',');
  const [lu, setLu] = useState({ cle: null, jobs: [] });

  useEffect(() => {
    if (!cle) return;
    let annule = false;
    (async () => {
      const ids = cle.split(',');
      const jobs = [];
      // PostgREST tronque à 1 000 sans prévenir : on pagine par paquets d'ids
      // ET par range, comme partout ailleurs.
      for (let i = 0; i < ids.length && !annule; i += 200) {
        const lot = ids.slice(i, i + 200);
        for (let from = 0; from < 5000; from += 1000) {
          // ⛔ Colonnes vérifiées : cross_post_jobs n'a PAS d'updated_at, et un
          // select PostgREST est tout ou rien.
          const { data, error } = await supabase
            .from('cross_post_jobs')
            .select('id, inventaire_id, platform, status, action, created_at, published_at, listing_url, platform_fields')
            .in('inventaire_id', lot)
            .in('status', ['pending', 'processing', 'published', 'deleted'])
            .order('id', { ascending: true })
            .range(from, from + 999);
          if (annule) return;
          if (error) { console.error('[lotEncoreEnLigne]', error.message); setLu({ cle, jobs: [] }); return; }
          jobs.push(...(data ?? []));
          if ((data?.length ?? 0) < 1000) break;
        }
      }
      if (!annule) setLu({ cle, jobs });
    })();
    return () => { annule = true; };
  }, [cle]);

  if (!cle || lu.cle !== cle) return null;

  const parArticle = new Map();
  for (const j of lu.jobs) {
    const k = String(j.inventaire_id);
    if (!parArticle.has(k)) parArticle.set(k, []);
    parArticle.get(k).push(j);
  }
  const concernes = items
    .map(it => ({ it, enLigne: annoncesEncoreEnLigne(it, parArticle.get(String(it.id)) ?? []) }))
    .filter(x => x.enLigne.length > 0);
  if (!concernes.length) return null;

  const montres = concernes.slice(0, PLAFOND_LISTE);
  const reste = concernes.length - montres.length;

  return (
    <div style={{
      background: V.amberSoft, border: '1px solid rgba(232,149,109,0.38)', borderRadius: 14,
      padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8, ...style,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: V.amberInk, lineHeight: 1.35 }}>
        ⚠️ {fr
          ? `${concernes.length} ${concernes.length > 1 ? 'de ces annonces ont' : 'de ces annonces a'} une copie encore en ligne ailleurs`
          : `${concernes.length} of these listings still ${concernes.length > 1 ? 'have' : 'has'} a copy online elsewhere`}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: V.amberInk, opacity: 0.92, lineHeight: 1.45 }}>
        {fr
          ? "« Pas vendues » ne retire rien sur les autres plateformes — c'est voulu, une réponse ici ne décide pas pour elles. Retire-les toi-même si elles ne doivent plus être achetables."
          : '“Not sold” removes nothing on the other platforms — by design, an answer here does not decide for them. Take them down yourself if they should no longer be buyable.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {montres.map(({ it, enLigne }) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: V.amberInk, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.title || it.titre || (fr ? 'Sans titre' : 'Untitled')}
            </span>
            {enLigne.map(a => (a.url ? (
              <a key={a.platform} href={a.url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 11.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                  background: '#fff', border: '1px solid rgba(232,149,109,0.38)', borderRadius: 99,
                  padding: '3px 9px', color: V.amberInk,
                }}>
                {PLATFORM_LABELS[a.platform] || a.platform} ↗
              </a>
            ) : (
              // Lien jamais capté par l'extension : la plateforme est nommée
              // quand même — c'est le lien qui manque, pas l'annonce.
              <span key={a.platform} style={{
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                background: '#fff', border: '1px solid rgba(232,149,109,0.38)', borderRadius: 99,
                padding: '3px 9px', color: V.amberInk, opacity: 0.8,
              }}>
                {PLATFORM_LABELS[a.platform] || a.platform}
              </span>
            )))}
          </div>
        ))}
        {reste > 0 && (
          <div style={{ fontSize: 11.5, fontWeight: 600, color: V.amberInk, opacity: 0.8 }}>
            {fr ? `+ ${reste} autre${reste > 1 ? 's' : ''}` : `+ ${reste} more`}
          </div>
        )}
      </div>
    </div>
  );
}
