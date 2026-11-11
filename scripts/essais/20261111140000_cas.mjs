// LES CAS du retrait « partout » entre comptes reliés (11/11/2026, L1), joués sur la base jetable du décor
// (20261111140000_decor.mjs : définitions, déclencheurs et RLS de PROD). Partagés par le verrou et par le banc.
//   apres = false : les définitions de prod seules → le défaut se reproduit (aucun retrait chez le compte relié) ;
//   apres = true  : avec la migration 20261111140000 → la règle, ses garde-fous, les décisions de Nico (11/11 15:15).
// Les modules du serveur qui décident hors de la base sont appelés tels quels (jamais recopiés) :
// _shared/republication-retrait.js (un retrait clôt les republications en attente de la même annonce),
// _shared/remise-en-vente-attente.js (règle A : une remise Leboncoin close revient-elle en attente ?) et
// _shared/publication-apres-retrait.js (le filet d'update-job-status lit les tâches laissées du bilan).
// Valeurs d'essai inventées seulement (comptes, fiches, numéros, liens, titres) : aucune donnée client.
import { A, B, C, E, F, lire, FIXTURE, INTACTES, PARTAGEES } from './20261111140000_decor.mjs';
import { republicationsAClore, retraitVivant, MESSAGE_REPUBLICATION_RETRAIT } from '../../supabase/functions/_shared/republication-retrait.js';
import { decisionRearmementRemise } from '../../supabase/functions/_shared/remise-en-vente-attente.js';
import { retraitPendantLaTache, MOTIF_PUBLICATION_APRES_RETRAIT } from '../../supabase/functions/_shared/publication-apres-retrait.js';

export const CHEMIN = 'suppression_article_compte_relie';
export const POSE_PAR = 'armer_retraits_fiche_liee (serveur)';
export const POSE_PAR_REPONSE = 'copie_retrait_partout_repondre (geste de la personne)';
export const SOURCE_QUESTION = 'retrait_partout_compte_relie';
export const MESSAGE_PUBLICATION_ANNULEE = "Annulée à ta demande — rien n'a été publié.";
export const MESSAGE_REPUBLICATION_ANNULEE = "Annulée à ta demande — ton annonce est restée en ligne.";
export const MESSAGE_ECHEC_NUMERO = "Annulée : article retiré partout depuis ton autre compte — vérifie qu'aucune annonce n'est restée en ligne.";
export const MESSAGE_REPUBLICATION_ENGAGEE = "Annulée : article retiré partout depuis ton autre compte — l'ancienne annonce est supprimée, la nouvelle ne sera pas publiée.";
const PERSONNE = { source: 'releve', rattachement: { par: 'utilisateur' } };                            // rattachée par la personne
const TITRE = { source: 'releve', rattachement: { par: 'auto', motif: 'titre_exact', score: 0.95 } };   // par le titre seul
const PHOTO = { source: 'releve', rattachement: { par: 'auto', motif: 'photo_identique' } };            // photo identique

/**
 * Joue les cas. `ok(condition, message, détail)` compte ; `apres` dit si la migration est appliquée ;
 * `migration` / `inverse` (textes) servent aux cas qui rejouent la migration (panne, verrou de la migration).
 */
export async function jouerCas(o, ok, { apres, migration = null, inverse = null, seulement = null } = {}) {
  const { q, un } = o;
  const cas = async (nom, f) => {
    if (seulement && !seulement.some((s) => nom.startsWith(s))) return;
    console.log(`\n${nom}`);
    try { await f(); } catch (e) { await o.commeServeur().catch(() => {}); ok(false, `${nom} : erreur inattendue`, `${e.message}${e.where ? ` — ${String(e.where).slice(0, 200)}` : ''}`); }
  };
  const motifsRefus = async (inv) => (await o.journal(B, 'retrait_refuse_compte_relie', inv)).map((l) => l.metadata.motif);
  const bilans = async (compte, inv) => (await o.journal(compte, 'retrait_partout_compte_relie', inv)).map((l) => l.metadata);
  const bilan = async (compte, inv) => (await bilans(compte, inv)).at(-1) ?? null;
  const questions = (compte, inv) => q(`SELECT id, statut, motif, source, niveau, garde::text AS garde, absorbe::text AS absorbe, preuves
    FROM inventaire_doublons WHERE user_id = $1 AND garde = $2 ORDER BY created_at, id`, [compte, inv]);
  const marque = (compte, inv) => un(`SELECT user_id, inventaire_id::text AS fiche, le, de_compte, de_fiche::text AS de_fiche, chemin, plateformes
    FROM jumelles_retirees_partout WHERE user_id = $1 AND inventaire_id = $2`, [compte, inv]);
  const ligne = (table, id) => un(`SELECT to_jsonb(t.*) AS l FROM public.${table} t WHERE t.id = $1`, [id]).then((r) => r.l ?? null);
  /** Une panne PROVOQUÉE (déclencheur d'essai, retiré ensuite avec sa fonction : les définitions restent celles d'APRÈS). */
  const panne = async (nom, table, quand, si, corps = `RAISE EXCEPTION 'panne provoquée par l''essai (${nom})'`) => {
    await q(`CREATE FUNCTION public.essai_panne_${nom}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN ${corps}; RETURN NEW; END $f$`);
    await q(`CREATE TRIGGER essai_panne_${nom} ${quand} ON public.${table} FOR EACH ROW WHEN (${si}) EXECUTE FUNCTION public.essai_panne_${nom}()`);
    return async () => { await q(`DROP TRIGGER IF EXISTS essai_panne_${nom} ON public.${table}`); await q(`DROP FUNCTION IF EXISTS public.essai_panne_${nom}()`); };
  };
  /** Le geste de l'app, chronométré. */
  const chrono = async (f) => { const t0 = Date.now(); let err = null, n = null; try { n = await f(); } catch (e) { err = e; } return { ms: Date.now() - t0, err, n }; };

  await cas('1. « Partout » traverse la liaison — voie de l\'app (retraits armés par l\'app, puis la fiche)', async () => {
    const p = await o.paire({ miens: [{ platform: 'vinted' }, { platform: 'beebs' }], siens: [{ platform: 'leboncoin', pf: PERSONNE }] });
    const avantJumelle = await ligne('inventaire', p.g);
    const n = await o.supprimerEnRetirant(A, p.f);
    const rA = await q(`SELECT platform FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete' AND listing_url = ANY($2::text[])`, [A, p.miens.map((d) => d.url)]);
    const rB = await o.retraits(B, p.g);
    ok(n === 1 && rA.length === 2, 'la fiche du compte qui agit est supprimée ; ses deux retraits (Vinted, Beebs) sont à SON nom', { n, rA });
    if (!apres) {
      ok(rB.length === 0, 'LE DÉFAUT (définitions de prod seules) : aucun retrait chez le compte relié — sa copie Leboncoin reste en ligne', rB);
      return;
    }
    const r = rB[0] ?? {}; const ap = r.pf?.arme_par ?? {};
    ok(rB.length === 1 && r.status === 'pending' && r.platform === 'leboncoin', 'un retrait Leboncoin est armé chez le compte relié (pending)', rB);
    ok(r.user_id === B && String(r.inventaire_id) === String(p.g), '… à SON nom, sur SA fiche jumelle');
    ok(r.num === p.siens[0].num && r.url === p.siens[0].url, '… qui vise SON annonce : le numéro et le lien de son dépôt', { num: r.num, url: r.url });
    ok(ap.chemin === CHEMIN && ap.pose_par === POSE_PAR && ap.depot === p.siens[0].id && ap.de_fiche === String(p.f) && ap.de_compte === A,
      `… tracé : chemin ${CHEMIN}, dépôt, fiche et compte d'origine`, ap);
    ok(!/armer_retrait_job/i.test(String(ap.pose_par)) && !/^vente_/i.test(String(ap.chemin)) && !('next_action_after' in (r.pf ?? {})),
      '… jamais lu comme un retrait de vente (pose_par, chemin), aucun délai de 10 min');
    const dep = await o.tache(p.siens[0].id);
    ok(dep.status === 'published' && dep.platform_fields?.retrait_arme?.job === r.id && dep.platform_fields?.pending_removal === false,
      'le dépôt de la jumelle note son retrait (retrait_arme), comme à la vente', dep.platform_fields);
    const j = (await o.journal(B, 'retrait_annonces', p.g)).at(-1)?.metadata;
    ok(j?.chemin === CHEMIN && j?.n_annonces === 1 && JSON.stringify(j?.plateformes) === '["leboncoin"]' && j?.de_fiche === String(p.f),
      'journal chez le compte relié : retrait_annonces, 1 annonce, Leboncoin', j);
    const b = await bilan(B, p.g);
    ok(b?.retraits === 1 && Array.isArray(b?.erreurs) && b.erreurs.length === 0 && JSON.stringify(b?.plateformes_partagees) === JSON.stringify([...PARTAGEES].sort()),
      'bilan chez le compte relié : 1 retrait, la portée (les boutiques partagées), la clé « erreurs » (vide)', b);
    const apresJumelle = await ligne('inventaire', p.g);
    ok(JSON.stringify(apresJumelle) === JSON.stringify(avantJumelle), 'la fiche jumelle n\'est ni supprimée ni modifiée (elle reste au stock, à l\'octet)', { avantJumelle, apresJumelle });
    const m = await marque(B, p.g);
    ok(m.fiche === String(p.g) && m.de_compte === A && m.de_fiche === String(p.f) && m.chemin === CHEMIN && JSON.stringify(m.plateformes) === JSON.stringify([...PARTAGEES].sort()),
      'décision 4 : la jumelle porte sa MARQUE (jumelles_retirees_partout : de quel compte, de quelle fiche, quand, quelle portée)', m);
    const lien = await un(`SELECT derniere_propagation FROM fiches_liees_comptes WHERE id = $1`, [p.lien]);
    ok(lien.derniere_propagation === null, 'derniere_propagation n\'est pas écrit (réservé à la vente)');
    // Rejouée (script de réparation, fiche déjà supprimée) : rien de plus, aucune ligne réécrite.
    const nBilans = (await bilans(B, p.g)).length;
    const rejoue = (await un(`SELECT public.armer_retraits_fiche_liee($1, $2) AS r`, [A, p.f])).r;
    const m2 = await marque(B, p.g);
    ok(rejoue.armes === 0 && rejoue.deja === 1 && (await o.retraits(B, p.g)).length === 1 && String(m2.le) === String(m.le) && (await bilans(B, p.g)).length === nBilans,
      'rejouée après la suppression : aucun retrait de plus (déjà armé), la marque n\'est pas réécrite, aucun bilan de plus', { rejoue, m2 });
  });

  await cas('2. « Partout » traverse — voie du filet (suppression seule : le filet serveur arme les retraits)', async () => {
    const p = await o.paire({ miens: [{ platform: 'beebs' }], siens: [{ platform: 'leboncoin' }] });
    await o.supprimer(A, p.f);
    const rA = await q(`SELECT platform_fields ? 'filet_suppression_serveur' AS filet FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete' AND listing_url = $2`, [A, p.miens[0].url]);
    const rB = await o.retraits(B, p.g);
    ok(rA.length === 1 && rA[0].filet === true, 'le filet de prod arme le retrait du compte qui agit (inchangé)', rA);
    ok(apres ? rB.length === 1 && rB[0].status === 'pending' : rB.length === 0,
      apres ? 'le retrait de la copie du compte relié est armé (quel que soit l\'ordre des déclencheurs)' : 'LE DÉFAUT : aucun retrait chez le compte relié', rB);
  });

  await cas('3. Deux plateformes partagées chez le compte relié : dépôt de FillSell et photo identique', async () => {
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }, { platform: 'beebs', pf: PHOTO }] });
    await o.supprimerEnRetirant(A, p.f);
    const rB = await o.retraits(B, p.g);
    ok(apres ? rB.length === 2 && rB.map((r) => r.platform).sort().join() === 'beebs,leboncoin' && rB.every((r) => r.status === 'pending') : rB.length === 0,
      apres ? 'deux retraits (Beebs, Leboncoin), un par copie certaine' : 'LE DÉFAUT : aucun retrait chez le compte relié', rB);
  });

  await cas('4. Décision 1 (portée) : sens inverse — le compte relié agit ; Depop partagée, Vinted propre à chaque compte', async () => {
    const p = await o.paire({ moi: B, autre: A, miens: [{ platform: 'leboncoin' }], siens: [{ platform: 'vinted' }, { platform: 'depop', pf: { depop_product_id: '778899' } }] });
    await q(`UPDATE inventaire SET vinted_item_id = $2, vinted_status = 'active', listed_at_guess = now() - interval '60 days' WHERE id = $1`, [p.g, p.siens[0].num]);
    const candidatsVinted = async () => (await q(`SELECT inv_id FROM public.republish_planifiee_candidats($1, '{"age_jours": 7}'::jsonb, 'vinted')`, [A])).map((x) => String(x.inv_id));
    ok((await candidatsVinted()).includes(String(p.g)), 'témoin : avant le geste, la jumelle est candidate à la republication automatique Vinted (republish_planifiee_candidats de prod)');
    await o.supprimerEnRetirant(B, p.f);
    const r = await o.retraits(A, p.g);
    if (!apres) { ok(r.length === 0, 'LE DÉFAUT : aucun retrait chez l\'autre compte', r); return; }
    const d = r.find((x) => x.platform === 'depop');
    ok(r.length === 1 && d?.status === 'pending', 'un seul retrait chez l\'autre compte : Depop (boutique partagée)', r);
    ok(String(d?.pf?.depop_product_id) === '778899', 'le retrait Depop porte le numéro du dépôt (depop_product_id)', d?.pf);
    ok(d?.user_id === A, 'la garde Depop (depop_autorise lit auth.uid()) laisse passer : le compte relié écrit pour lui-même');
    ok((await o.tache(p.siens[0].id)).status === 'published' && !r.some((x) => x.platform === 'vinted'),
      'la copie Vinted (sa boutique Vinted à lui, jamais partagée) n\'est pas retirée : hors de la portée', r);
    ok((await candidatsVinted()).includes(String(p.g)) && (await bilan(A, p.g))?.hors_portee >= 1,
      '… elle reste suivie (candidate à sa propre republication Vinted), le bilan la compte hors de la portée', await bilan(A, p.g));
  });

  await cas('5. Jamais sans liaison', async () => {
    const a = await o.paire({ moi: E, autre: F, miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    await o.supprimerEnRetirant(E, a.f);
    ok((await o.retraits(F, a.g)).length === 0, 'lien de fiches entre deux comptes NON reliés (aucune ligne comptes_lies) : rien');
    const b = await o.paire({ lien: false, miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    const tiers = await o.fiche(C);
    const dt = await o.depot(C, tiers, { platform: 'leboncoin' });
    await o.supprimerEnRetirant(A, b.f);
    ok((await o.retraits(B, b.g)).length === 0, 'comptes reliés mais fiches NON liées (même titre) : rien');
    ok((await o.retraits(C, tiers)).length === 0 && (await o.tache(dt.id)).status === 'published', 'un tiers qui porte une fiche et une annonce au même titre : rien');
    const d = await o.paire({ lien: false, miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    await q(`INSERT INTO fiches_liees_comptes (fiche_a, user_a, fiche_b, user_b, source) VALUES ($1, $2, $3, $4, 'essai')`, [d.f, C, d.g, B]);
    await o.supprimerEnRetirant(A, d.f);
    ok((await o.retraits(B, d.g)).length === 0, 'lien de fiches dont le propriétaire n\'est pas le compte qui agit : rien');
  });

  await cas('6. Décision 5 : jamais sur un titre seul — la QUESTION de la vente, posée au compte relié', async () => {
    const a = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: TITRE }] });
    await o.supprimerEnRetirant(A, a.f);
    ok((await o.retraits(B, a.g)).length === 0 && (await o.tache(a.siens[0].id)).status === 'published',
      'copie rattachée automatiquement par le titre (titre_exact) : aucun retrait, l\'annonce reste en ligne');
    if (!apres) return;
    ok((await motifsRefus(a.g)).join() === 'rattachement_non_confirme', 'le refus est tracé chez le compte relié (rattachement_non_confirme)', await motifsRefus(a.g));
    const qs = await questions(B, a.g);
    const ann = await un(`SELECT id FROM annonces_plateforme WHERE user_id = $1 AND job_id = $2`, [B, a.siens[0].id]);
    const qx = qs[0] ?? {};
    ok(qs.length === 1 && qx.motif === 'copie_non_prouvee' && qx.statut === 'proposee' && qx.source === SOURCE_QUESTION && qx.niveau === 'probable'
      && qx.garde === String(a.g) && qx.absorbe === String(a.g),
    'la question « c\'est le même article ? » est posée au compte relié : le mécanisme de la vente (inventaire_doublons, copie_non_prouvee), sur SA jumelle', qs);
    ok(qx.preuves?.job === a.siens[0].id && qx.preuves?.annonce_id === ann.id && qx.preuves?.platform === 'leboncoin' && qx.preuves?.url === a.siens[0].url
      && qx.preuves?.rattachement_automatique === true && qx.preuves?.retrait_partout?.de_fiche === String(a.f) && qx.preuves?.retrait_partout?.de_compte === A,
    '… elle montre l\'annonce que le « Oui » retirera (dépôt, annonce relevée, lien) et d\'où vient le geste', qx.preuves);
    ok(!(await marque(B, a.g)).fiche, 'point 3 : une question seule n\'est pas un retrait — la jumelle ne porte PAS la marque « retirée partout »');
    const r = (await un(`SELECT public.armer_retraits_fiche_liee($1, $2) AS r`, [A, a.f])).r;
    ok((await questions(B, a.g)).length === 1 && (await o.retraits(B, a.g)).length === 0 && r.questions === 0, 'rejouée : la question n\'est jamais reposée, rien n\'est retiré', r);
    // (Relecture finale, point 5) L'annonce relevée du dépôt ne désigne plus SON numéro (republication qui a changé le
    // numéro, ancienne ligne) : la question montrerait une autre annonce que celle qu'un « Oui » retirerait — pas de question.
    const z = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: TITRE }] });
    await q(`UPDATE annonces_plateforme SET listing_id = $3, url = $4 WHERE user_id = $1 AND job_id = $2`, [B, z.siens[0].id, ...((n) => [n, o.LIEN.leboncoin(n)])(o.numero())]);
    await o.supprimerEnRetirant(A, z.f);
    const refusZ = await o.journal(B, 'retrait_refuse_compte_relie', z.g);
    ok((await questions(B, z.g)).length === 0 && (await o.retraits(B, z.g)).length === 0 && refusZ.some((l) => l.metadata?.sans_question === 'annonce_non_designee'),
      'point 5 : l\'annonce relevée ne désigne pas le numéro du dépôt : aucune question (jamais une autre annonce que celle à retirer), refus tracé', refusZ.map((l) => l.metadata));
    const b = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: PERSONNE }] });
    const autre = await o.fiche(B);
    await q(`INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, par) VALUES ($1, $2, $3, $4, 'auto (doublon certain : titre_exact_prix_egal)')`,
      [B, b.g, autre, JSON.stringify({ cross_post_jobs: [b.siens[0].id] })]);
    await o.supprimerEnRetirant(A, b.f);
    ok((await o.retraits(B, b.g)).length === 0 && (await questions(B, b.g)).length === 1,
      'copie amenée sur la jumelle par une fusion automatique sans photo identique : aucun retrait, la question');
    const c2 = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: TITRE }] });
    const logo = await o.retirerParLogo(B, c2.g, c2.siens[0]);
    await o.supprimerEnRetirant(A, c2.f);
    ok((await questions(B, c2.g)).length === 0 && (await o.retraits(B, c2.g)).map((x) => x.id).join() === logo,
      'copie au titre seul dont l\'annonce a déjà son retrait (par la personne) : aucune question, aucun second retrait');
  });

  await cas('7. Les suppressions qui ne sont pas « partout », et le retrait d\'une seule plateforme', async () => {
    const a = await o.paire({ miens: [], siens: [{ platform: 'leboncoin' }, { platform: 'beebs' }] });
    await o.supprimerEnRetirant(A, a.f);
    ok((await o.retraits(B, a.g)).length === 0, 'fiche sans annonce supprimée : rien chez le compte relié (sa jumelle vend toujours)');
    const b = await o.paire({ miens: [{ platform: 'depop' }, { platform: 'beebs' }], siens: [{ platform: 'leboncoin' }] });
    const rep = await o.supprimerEnLaissant(A, b.f);
    ok(rep?.ok === true && (await o.retraits(B, b.g)).length === 0, '« Supprimer la fiche, laisser les annonces en ligne » : rien chez le compte relié', rep);
    const b2 = await o.paire({ miens: [{ platform: 'depop' }, { platform: 'beebs' }], siens: [{ platform: 'leboncoin' }] });
    await o.retirerParLogo(A, b2.f, b2.miens[0]);
    const rep2 = await o.supprimerEnLaissant(A, b2.f);
    ok(rep2?.ok === true && (await o.retraits(B, b2.g)).length === 0, '… même avec un retrait par logo en attente juste avant : rien', rep2);
    const c1 = await o.paire({ miens: [{ platform: 'vinted' }, { platform: 'beebs' }], siens: [{ platform: 'leboncoin' }, { platform: 'beebs' }] });
    await o.retirerParLogo(A, c1.f, c1.miens[0]);
    ok((await o.retraits(B, c1.g)).length === 0 && (await un(`SELECT count(*)::int AS n FROM inventaire WHERE id = $1`, [c1.f])).n === 1,
      'retrait d\'UNE plateforme par son logo (aucune fiche supprimée) : rien chez le compte relié, sur aucune plateforme');
    const d = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    await q(`SELECT set_config('fillsell.sans_retrait', '1', false)`);
    await o.supprimer(A, d.f);
    await q(`SELECT set_config('fillsell.sans_retrait', '', false)`);
    ok((await o.retraits(B, d.g)).length === 0, 'réinitialisation (fillsell.sans_retrait) : rien');
    const e = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    await q(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    await q(`DELETE FROM inventaire WHERE id = $1`, [e.f]);
    await o.commeServeur();
    ok((await o.retraits(B, e.g)).length === 0, 'suppression par le serveur (service_role : suppression de compte) : rien');
    const f = await o.paire({ miens: [{ platform: 'beebs' }], siens: [{ platform: 'leboncoin' }] });
    const logo = await o.retirerParLogo(A, f.f, f.miens[0]);
    await o.executerRetrait(logo);
    await q(`UPDATE cross_post_jobs SET created_at = now() - interval '20 minutes' WHERE id = $1`, [logo]);
    await o.supprimerEnRetirant(A, f.f);
    ok((await o.retraits(B, f.g)).length === 0, 'retrait par logo déjà fait il y a 20 min, puis fiche (sans autre annonce) supprimée : rien');
    if (!apres) return;
    // Décision 3 : la fenêtre « partout » est de 2 MINUTES.
    const w3 = await o.paire({ miens: [{ platform: 'beebs' }], siens: [{ platform: 'leboncoin' }] });
    const logo3 = await o.retirerParLogo(A, w3.f, w3.miens[0]);
    await q(`UPDATE cross_post_jobs SET created_at = now() - interval '3 minutes' WHERE id = $1`, [logo3]);
    await o.supprimer(A, w3.f);
    ok((await o.retraits(B, w3.g)).length === 0, 'décision 3 : retrait par logo armé il y a 3 min (encore en file), puis fiche supprimée : hors de la fenêtre de 2 min, rien');
    const w1 = await o.paire({ miens: [{ platform: 'beebs' }], siens: [{ platform: 'leboncoin' }] });
    const logo1 = await o.retirerParLogo(A, w1.f, w1.miens[0]);
    await q(`UPDATE cross_post_jobs SET created_at = now() - interval '1 minute' WHERE id = $1`, [logo1]);
    await o.supprimer(A, w1.f);
    ok((await o.retraits(B, w1.g)).length === 1, '… armé il y a 1 min, puis fiche supprimée : « partout », le retrait chez le compte relié');
  });

  await cas('8. Jamais : jumelle vendue ou fusionnée, deux annonces vivantes, annonce vendue, achat en cours, Opla, sans numéro, hors portée', async () => {
    const jamais = async (quoi, siens, prepare = null, motif = null, suite = null) => {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens });
      if (prepare) await prepare(p);
      await o.supprimerEnRetirant(A, p.f);
      const r = await o.retraits(B, p.g);
      ok(r.length === 0, `${quoi} : aucun retrait`, r);
      if (apres && motif) ok((await motifsRefus(p.g)).includes(motif), `… refus tracé (${motif})`, await motifsRefus(p.g));
      if (apres && suite) await suite(p);
    };
    await jamais('jumelle VENDUE (le circuit de la vente s\'en charge)', [{ platform: 'leboncoin' }], async (p) => {
      await q(`SELECT set_config('fillsell.sans_retrait', '1', false)`);
      await q(`UPDATE inventaire SET statut = 'vendu', quantite = 0 WHERE id = $1`, [p.g]);
      await q(`SELECT set_config('fillsell.sans_retrait', '', false)`);
    });
    await jamais('jumelle fusionnée dans une autre fiche', [{ platform: 'leboncoin' }], async (p) => {
      const garde = await o.fiche(B);
      await q(`UPDATE inventaire SET fusionne_dans = $2 WHERE id = $1`, [p.g, garde]);
    });
    await jamais('deux annonces vivantes de la jumelle sur la plateforme (deux exemplaires)', [{ platform: 'leboncoin' }],
      async (p) => { await o.annonce(B, p.g, { platform: 'leboncoin', num: o.numero() }); }, 'deux_annonces_vivantes');
    await jamais('annonce elle-même vendue (sale_signal « sold »)', [{ platform: 'leboncoin', pf: { sale_signal: 'sold' } }], null, 'annonce_vendue');
    await jamais('annonce sous achat en cours (transaction Leboncoin « pending »)', [{ platform: 'leboncoin', tx: 'pending' }], null, 'achat_en_cours');
    await jamais('copie Opla (quittée le 10/10)', [{ platform: 'opla' }], null, null, async (p) => {
      ok(Boolean((await o.tache(p.siens[0].id)).platform_fields?.opla_a_retirer), '… l\'information « retire-la toi-même sur Opla » est posée une fois sur la copie (comme à la vente)');
    });
    await jamais('copie sans numéro ni lien (jamais un ciblage par le titre chez le compte relié)', [{ platform: 'beebs', num: null, url: null }], null, 'sans_numero_ni_lien');
    await jamais('décision 1 : copie Vinted (une boutique Vinted par compte, jamais partagée)', [{ platform: 'vinted' }], null, null, async (p) => {
      ok((await motifsRefus(p.g)).length === 0 && (await bilan(B, p.g))?.hors_portee === 1, '… ni refus ni question : hors de la portée, comptée au bilan', await bilan(B, p.g));
    });
    await jamais('décision 1 : copie eBay (boutique NON partagée entre les deux comptes)', [{ platform: 'ebay' }], null, null, async (p) => {
      ok((await motifsRefus(p.g)).length === 0 && (await o.tache(p.siens[0].id)).status === 'published', '… ni refus ni question, l\'annonce reste suivie');
    });
  });

  await cas('9. Aucun doublon : un retrait déjà ouvert chez le compte relié', async () => {
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    const logo = await o.retirerParLogo(B, p.g, p.siens[0]);
    await o.supprimerEnRetirant(A, p.f);
    const r = await o.retraits(B, p.g);
    ok(r.length === 1 && r[0].id === logo, 'le retrait déjà en attente reste le seul (aucun second retrait de la même annonce)', r);
    if (apres) ok(Boolean((await marque(B, p.g)).fiche), '… un retrait déjà en cours compte : la jumelle porte sa marque (point 3)');
  });

  await cas('10. Décisions 2 et 6 : ce qui attend chez la jumelle, sur les boutiques partagées — et rien d\'autre', async () => {
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    const g = p.g, dep = p.siens[0];
    // Les republications d'abord (une republication naît « publish » puis devient « republish » : l'index de prod « une
    // seule publication active par article et plateforme » ne la compte plus ensuite).
    const repub = await o.depot(B, g, { platform: 'leboncoin', action: 'republish', status: 'pending', num: dep.num, url: dep.url, pf: { republish_step: 'a_capturer' } });
    const numEng = o.numero();
    const repubEng = await o.depot(B, g, { platform: 'beebs', action: 'republish', status: 'needs_user', num: numEng, url: o.LIEN.beebs(numEng),
      pf: { republish_step: 'deleted', deleted_at: new Date().toISOString(), needs_user_source: 'relancer' } });
    const numEngC = o.numero();
    const repubEngEnCours = await o.depot(B, g, { platform: 'depop', action: 'republish', status: 'processing', num: numEngC, url: o.LIEN.depop(numEngC),
      pf: { republish_step: 'deleted', deleted_at: new Date().toISOString(), processing_since: new Date(Date.now() - 600000).toISOString() } });
    const pubAttente = await o.depot(B, g, { platform: 'beebs', status: 'pending' });
    const pubGeste = await o.depot(B, g, { platform: 'depop', status: 'needs_user', pf: { needs_user_source: 'champ_requis' }, erreur: 'Il manque la taille.' });
    const pubEchec = await o.depot(B, g, { platform: 'depop', status: 'failed', erreur: 'Connexion Depop requise' });
    const numEchec = o.numero();
    const pubEchecNum = await o.depot(B, g, { platform: 'beebs', status: 'failed', num: numEchec, url: o.LIEN.beebs(numEchec), erreur: 'Beebs : annonce jamais vue en ligne' });
    const pubEnCours = await o.depot(B, g, { platform: 'leboncoin', status: 'processing', pf: { processing_since: new Date(Date.now() - 600000).toISOString() } });
    const ebayAttente = await o.depot(B, g, { platform: 'ebay', status: 'pending' });
    const h = await o.fiche(B);                                   // une AUTRE fiche du compte relié
    const hDep = await o.depot(B, h, { platform: 'leboncoin' });
    const hPub = await o.depot(B, h, { platform: 'beebs', status: 'pending' });
    const hRepub = await o.depot(B, h, { platform: 'leboncoin', action: 'republish', status: 'pending', num: hDep.num, url: hDep.url, pf: { republish_step: 'a_capturer' } });
    await o.supprimerEnRetirant(A, p.f);
    const lu = async (x) => o.tache(x.id);
    const [r, a, n, e, en, c, re, rc, eb, hp, hr] = [await lu(repub), await lu(pubAttente), await lu(pubGeste), await lu(pubEchec), await lu(pubEchecNum),
      await lu(pubEnCours), await lu(repubEng), await lu(repubEngEnCours), await lu(ebayAttente), await lu(hPub), await lu(hRepub)];
    ok(hp.status === 'pending' && hr.status === 'pending' && (await o.retraits(B, h)).length === 0,
      'les tâches d\'une AUTRE fiche du compte relié ne sont pas touchées (publication et republication toujours en file)');
    if (!apres) {
      ok(r.status === 'pending' && a.status === 'pending' && n.status === 'needs_user' && e.status === 'failed' && c.status === 'processing' && re.status === 'needs_user',
        'LE DÉFAUT : les publications et republications en file de la jumelle partiraient encore', [r.status, a.status, n.status, e.status, c.status, re.status]);
      return;
    }
    const retrait = (await o.retraits(B, g))[0];
    ok(Boolean(retrait) && retrait.status === 'pending', 'le retrait de la copie Leboncoin est armé');
    ok(r.status === 'cancelled' && r.error === MESSAGE_REPUBLICATION_RETRAIT && Boolean(r.platform_fields.arret_utilisateur)
      && r.platform_fields.hors_quota === true && r.platform_fields.republication_retrait_demande?.retrait === retrait?.id
      && r.platform_fields.republication_retrait_demande?.annonce === dep.num && r.platform_fields.needsUserAttempts >= 99,
    'republication en attente (non engagée) : close comme le fait le serveur quand un retrait vise son annonce (cancelled, arret_utilisateur, hors_quota, message du 31/10)', { s: r.status, e: r.error, pf: r.platform_fields });
    for (const [x, quoi] of [[a, 'publication en attente (pending)'], [n, 'publication qui attend un geste (needs_user)'], [e, 'publication échouée sans numéro (failed)']]) {
      ok(x.status === 'cancelled' && x.error === MESSAGE_PUBLICATION_ANNULEE && Boolean(x.platform_fields.arret_utilisateur)
        && x.platform_fields.annulee_dans_la_file?.par === POSE_PAR && x.platform_fields.needsUserAttempts >= 99
        && x.platform_fields.retrait_partout_compte_relie?.de_fiche === String(p.f),
      `${quoi} : annulée comme dans « Ta file » (cancelled, arret_utilisateur, « ${MESSAGE_PUBLICATION_ANNULEE} »)`, { s: x.status, e: x.error, pf: x.platform_fields });
    }
    ok(en.status === 'cancelled' && en.error === MESSAGE_ECHEC_NUMERO && Boolean(en.platform_fields.arret_utilisateur) && en.platform_fields.erreurs_archivees?.at(-1)?.statut === 'failed',
      'décision 6 : une publication échouée QUI PORTE un numéro est annulée aussi (toutes les échouées), avec un message vrai', { s: en.status, e: en.error });
    ok(e.platform_fields.erreurs_archivees?.at(-1)?.erreur === 'Connexion Depop requise' && n.platform_fields.erreurs_archivees?.at(-1)?.statut === 'needs_user',
      'l\'erreur d\'avant est archivée (jamais rien d\'effacé)', e.platform_fields.erreurs_archivees);
    ok(re.status === 'cancelled' && re.error === MESSAGE_REPUBLICATION_ENGAGEE && Boolean(re.platform_fields.arret_utilisateur) && re.platform_fields.hors_quota === true
      && re.platform_fields.republication_arretee_retrait_partout?.etape === 'deleted',
    'décision 2 : republication ENGAGÉE (ancienne annonce supprimée) : annulée, la nouvelle ne part pas', { s: re.status, e: re.error, pf: re.platform_fields });
    ok(c.status === 'processing' && !c.platform_fields?.arret_utilisateur && rc.status === 'processing' && !rc.platform_fields?.arret_utilisateur,
      'publication et republication EN COURS d\'exécution par un poste : jamais cassées en plein geste, jamais écrites', { c: c.status, rc: rc.status });
    ok(eb.status === 'pending' && !eb.platform_fields?.arret_utilisateur, 'décision 1 : la publication eBay (boutique non partagée) n\'est pas touchée', eb);
    const b = await bilan(B, g);
    ok(b?.publications_annulees === 4 && b?.republications_annulees === 2 && b?.republications_engagees_annulees === 1 && b?.echouees_annulees === 2
      && b?.retraits === 1 && b?.hors_portee >= 1,
    'le bilan du geste est journalisé chez le compte relié (4 publications dont 2 échouées, 2 republications dont 1 engagée, 1 retrait, la portée)', b);
    const laissees = (b?.taches_laissees ?? []).map((t) => `${t.job}:${t.motif}`).sort();
    ok(JSON.stringify(laissees) === JSON.stringify([`${pubEnCours.id}:en_cours`, `${repubEngEnCours.id}:en_cours`].sort()),
      'décision 2 : les tâches laissées (en cours) sont NOMMÉES dans le bilan, par leur identifiant', b?.taches_laissees);
    // Le filet serveur (update-job-status, _shared/publication-apres-retrait.js, tel quel) lit ce bilan : ce qu'elles
    // publieraient est retiré aussitôt.
    const lignesBilan = await q(`SELECT created_at, metadata FROM usage_logs WHERE user_id = $1 AND feature = 'retrait_partout_compte_relie'`, [B]);
    const filet = [retraitPendantLaTache(c, { bilans: lignesBilan }), retraitPendantLaTache(rc, { bilans: lignesBilan }), retraitPendantLaTache(hp, { bilans: lignesBilan })];
    ok(filet[0] === MOTIF_PUBLICATION_APRES_RETRAIT.RETRAIT_PARTOUT_COMPTE_RELIE && filet[1] === MOTIF_PUBLICATION_APRES_RETRAIT.RETRAIT_PARTOUT_COMPTE_RELIE && filet[2] === null,
      '… le filet d\'update-job-status les reconnaît (article retiré partout) — et jamais une tâche d\'une autre fiche', { filet, hp: { id: hp.id, s: hp.status, a: hp.action } });
    const refus = (await un(`SELECT public.controler_job_extension($1, 'poste-essai', $2, 'processing') AS r`, [B, a.id])).r;
    ok(refus?.ok === false && /Arrêtée à ta demande/.test(refus?.reason ?? ''), 'un poste qui tenait la tâche annulée en mémoire ne peut plus rien y écrire (controler_job_extension de prod)', refus);
    const geste = await o.enApp(B, () => un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title)
      VALUES ($1, $2, 'beebs', 'publish', 'pending', 'original', 'Article d''essai') RETURNING id, status`, [B, g]));
    ok(geste.status === 'pending', 'un geste EXPLICITE de la personne (publier la jumelle) reste possible : la publication entre en file', geste);

    ok(JSON.stringify((b?.annulees_avec_numero ?? []).map((x) => x.job)) === JSON.stringify([pubEchecNum.id]),
      '… la tâche annulée qui portait un numéro est nommée au bilan (annulees_avec_numero) : la personne vérifie', b?.annulees_avec_numero);
    // Une publication en attente qui porte déjà un numéro (l'annonce a pu partir) : annulée aussi (seule une tâche EN COURS
    // est laissée), avec un message vrai, et nommée au bilan.
    const pn = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    const numPn = o.numero();
    const pubNum = await o.depot(B, pn.g, { platform: 'beebs', status: 'pending', num: numPn, url: o.LIEN.beebs(numPn) });
    await o.supprimerEnRetirant(A, pn.f);
    const pnx = await o.tache(pubNum.id);
    const bpn = await bilan(B, pn.g);
    ok(pnx.status === 'cancelled' && pnx.error === MESSAGE_ECHEC_NUMERO && Boolean(pnx.platform_fields?.arret_utilisateur)
      && bpn?.annulees_avec_numero?.some((x) => x.job === pubNum.id && x.statut_avant === 'pending') && !(bpn?.taches_laissees ?? []).some((x) => x.job === pubNum.id),
    'publication en attente qui porte déjà un numéro : annulée (seule une tâche en cours est laissée), message vrai, nommée au bilan', { pnx, bpn });

    // (Relecture finale, point 4) Une plateforme où la copie est un DOUTE (titre seul : la question) : rien n'y est annulé
    // ni clos chez la jumelle — sa republication en file reste telle quelle.
    const t = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: TITRE }] });
    const tRep = await o.depot(B, t.g, { platform: 'leboncoin', action: 'republish', status: 'needs_user', num: t.siens[0].num, url: t.siens[0].url, pf: { republish_step: 'a_capturer', needs_user_source: 'relancer' } });
    const tPub = await o.depot(B, t.g, { platform: 'beebs', status: 'pending' });
    await o.supprimerEnRetirant(A, t.f);
    const tr = await o.tache(tRep.id);
    ok((await o.retraits(B, t.g)).length === 0 && (await o.tache(t.siens[0].id)).status === 'published' && tr.status === 'needs_user' && !tr.platform_fields?.arret_utilisateur
      && (await o.tache(tPub.id)).status === 'cancelled' && JSON.stringify((await bilan(B, t.g))?.plateformes_en_doute) === '["leboncoin"]',
    'point 4 : copie rattachée par le titre (la question) : jamais retirée, sa republication Leboncoin n\'est PAS annulée ; la publication Beebs (sans doute) l\'est', { s: tr.status, e: tr.error, b: await bilan(B, t.g) });

    // Sans doute sur la plateforme : le retrait de l'annonce X (la copie certaine la plus récente) ne clôt jamais, en son
    // nom, la republication d'une AUTRE annonce Y (ancien dépôt dont l'annonce n'est plus relevée) — même numéro exigé.
    const xy = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', il: '5 days' }, { platform: 'leboncoin', il: '60 days', annonce: false }] });
    const repAutre = await o.depot(B, xy.g, { platform: 'leboncoin', action: 'republish', status: 'pending', num: xy.siens[1].num, url: xy.siens[1].url, pf: { republish_step: 'a_capturer' } });
    await o.supprimerEnRetirant(A, xy.f);
    const ra = await o.tache(repAutre.id);
    const rxy = await o.retraits(B, xy.g);
    ok(rxy.length === 1 && rxy[0].num === xy.siens[0].num && ra.status === 'cancelled' && ra.error === MESSAGE_REPUBLICATION_ANNULEE && !ra.platform_fields.republication_retrait_demande,
      'la republication de l\'annonce Y n\'est jamais close au nom du retrait de l\'annonce X (même numéro exigé) — annulée « ton annonce est restée en ligne »', { rxy, s: ra.status, e: ra.error });

    // Deux exemplaires sur la plateforme (deux annonces vivantes) : un doute aussi — la republication de l'annonce Y n'est ni
    // close au nom du retrait de l'annonce X, ni annulée.
    const dx = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }, { platform: 'leboncoin' }] });
    const logoX = await o.retirerParLogo(B, dx.g, dx.siens[0]);
    const repY = await o.depot(B, dx.g, { platform: 'leboncoin', action: 'republish', status: 'pending', num: dx.siens[1].num, url: dx.siens[1].url, pf: { republish_step: 'a_capturer' } });
    await o.supprimerEnRetirant(A, dx.f);
    const ry = await o.tache(repY.id);
    ok((await o.retraits(B, dx.g)).length === 1 && (await o.tache(logoX)).status === 'pending' && ry.status === 'pending' && !ry.platform_fields?.arret_utilisateur,
      'point 4 : deux exemplaires (deux annonces vivantes) : la republication de l\'annonce Y n\'est ni close au nom du retrait de X, ni annulée', { s: ry.status, e: ry.error });
  });

  await cas('11. Décision 2 : rien d\'automatique ne remet la jumelle en ligne', async () => {
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }], jumelle: { quantite: 3 } });
    const g = p.g, dep = p.siens[0];
    const vendu = await o.depot(B, g, { platform: 'leboncoin', status: 'sold', il: '3 days' });
    await q(`INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu) VALUES ($1, $2, 'leboncoin', $3)`, [B, g, vendu.id]);
    const close = await o.depot(B, g, { platform: 'leboncoin', status: 'failed', num: o.numero(), il: '2 days',
      pf: { remise_en_vente: { annonce_vendue: vendu.num, apres_vente_job: vendu.id } }, erreur: 'Leboncoin a désactivé cette annonce.' });
    const annulee = await o.depot(B, g, { platform: 'leboncoin', status: 'cancelled', num: o.numero(), il: '2 days',
      pf: { remise_en_vente: { annonce_vendue: vendu.num, apres_vente_job: vendu.id } }, erreur: 'Leboncoin a désactivé cette annonce.' });
    const vieille = await o.depot(B, g, { platform: 'leboncoin', status: 'cancelled', num: o.numero(), il: '20 days',
      pf: { remise_en_vente: { annonce_vendue: vendu.num, apres_vente_job: vendu.id } }, erreur: 'Leboncoin a désactivé cette annonce.' });
    const h = await o.fiche(B, { quantite: 3 });
    const hVendu = await o.depot(B, h, { platform: 'leboncoin', status: 'sold', il: '3 days' });
    await q(`INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu) VALUES ($1, $2, 'leboncoin', $3)`, [B, h, hVendu.id]);
    const candidats = async () => (await q(`SELECT inv_id FROM public.republish_planifiee_candidats($1, '{"age_jours": 7}'::jsonb, 'leboncoin')`, [B])).map((x) => String(x.inv_id));
    const faits = { vendueEncoreAffichee: true, depotVu: false, autreAnnonceVivante: false };
    ok((await candidats()).includes(String(g)), 'témoin : avant le geste, la jumelle est candidate à la republication automatique (republish_planifiee_candidats de prod)');
    ok(decisionRearmementRemise(await o.tache(close.id), faits).rearmer === true, 'témoin : avant le geste, sa remise Leboncoin close reviendrait en attente (règle A de handler-watch)');
    await o.supprimerEnRetirant(A, p.f);
    const remise = async (inv) => un(`SELECT statut, motif FROM remises_en_vente WHERE user_id = $1 AND inventaire_id = $2`, [B, inv]);
    if (!apres) {
      ok((await candidats()).includes(String(g)) && (await remise(g)).statut === 'a_faire' && decisionRearmementRemise(await o.tache(close.id), faits).rearmer === true,
        'LE DÉFAUT : la jumelle reste candidate à la republication automatique, sa remise en vente reste à faire, sa remise close reviendrait en attente');
      return;
    }
    const retrait = (await o.retraits(B, g))[0];
    ok(Boolean(retrait) && retrait.num === dep.num, 'le retrait de la copie certaine est armé');
    if (!retrait) return;
    // (a) La republication automatique. Tant que le retrait attend, le dépôt est encore « published » : une republication
    // née du balayage est close par le serveur au poll suivant (republication-retrait.js, tel quel).
    const auto = await o.depot(B, g, { platform: 'leboncoin', action: 'republish', status: 'pending', num: dep.num, url: dep.url, pf: { republish_step: 'a_capturer', source: 'auto' } });
    const lignes = await q(`SELECT id, user_id, platform, action, status, platform_listing_id, listing_url, created_at, platform_fields FROM cross_post_jobs WHERE id = ANY($1::uuid[])`, [[auto.id, retrait.id]]);
    const leRetrait = lignes.find((l) => l.id === retrait.id);
    ok(retraitVivant(leRetrait) && republicationsAClore(lignes.filter((l) => l.id === auto.id), leRetrait).length === 1,
      'republication automatique née pendant que le retrait attend : close par le serveur au poll suivant (le retrait de la traversée est un retrait comme un autre)');
    await o.executerRetrait(retrait.id);
    const apresRetrait = await o.tache(dep.id);
    const ann = await un(`SELECT retiree_le IS NOT NULL AS retiree, disparu_le IS NOT NULL AS partie FROM annonces_plateforme WHERE user_id = $1 AND platform = 'leboncoin' AND listing_id = $2`, [B, dep.num]);
    ok(apresRetrait.status === 'cancelled' && apresRetrait.platform_fields.removed_by_user === true && ann.retiree && ann.partie,
      'retrait fait : le MÊME état qu\'après un retrait par logo — dépôt « cancelled » (removed_by_user), annonce relevée retirée', { s: apresRetrait.status, ann });
    ok(!(await candidats()).includes(String(g)), 'la jumelle n\'est plus candidate à la republication automatique (plus aucun dépôt publié)');
    // (b) La remise en vente automatique.
    const rg = await remise(g), rh = await remise(h);
    ok(rg.statut === 'abandonnee' && rg.motif === 'retrait_partout_compte_relie', 'sa remise en vente à faire est close (« abandonnee ») : remises_en_vente_tick ne lit que « a_faire »', rg);
    ok(rh.statut === 'a_faire', 'la remise en vente d\'une AUTRE fiche du compte relié n\'est pas touchée', rh);
    await q(`SELECT public.remises_en_vente_tick(20, $1)`, [B]);
    const nees = await q(`SELECT id FROM cross_post_jobs WHERE user_id = $1 AND inventaire_id = $2 AND action = 'publish' AND created_at > now() - interval '1 minute' AND platform_fields ? 'remise_en_vente' AND id <> ALL($3::uuid[])`, [B, g, [close.id, annulee.id, vieille.id]]);
    ok(nees.length === 0 && (await remise(g)).statut === 'abandonnee', 'un passage de remises_en_vente_tick (prod) ne crée aucune publication pour la jumelle', nees);
    // (c) Les reprises du serveur : la remise close ne revient pas en attente ; plus rien d'elle n'attend ni n'a échoué.
    const d = decisionRearmementRemise(await o.tache(close.id), faits);
    const cl = await o.tache(close.id);
    ok(d.rearmer === false && d.motif === 'arretee_par_la_personne' && cl.status === 'cancelled',
      'sa remise Leboncoin échouée est annulée (décision 6) et ne revient plus en attente (règle A : marque arret_utilisateur)', { d, s: cl.status });
    const an = await o.tache(annulee.id);
    ok(an.status === 'cancelled' && Boolean(an.platform_fields?.arret_utilisateur) && an.platform_fields?.retrait_partout_compte_relie?.de_fiche === String(p.f)
      && decisionRearmementRemise(an, faits).motif === 'arretee_par_la_personne',
    'sa remise Leboncoin déjà close (moins de 14 jours) porte la marque arret_utilisateur : la règle A la respecte', an.platform_fields);
    const v = await o.tache(vieille.id);
    ok(!v.platform_fields?.arret_utilisateur && !v.platform_fields?.retrait_partout_compte_relie,
      '… une remise close de plus de 14 jours n\'est pas réécrite (la règle A ne la reprend plus : aucune ligne inutile écrite)', v.platform_fields);
    const restes = await q(`SELECT platform, action, status FROM cross_post_jobs WHERE user_id = $1 AND inventaire_id = $2 AND action IN ('publish', 'republish')
      AND status IN ('pending', 'processing', 'needs_user') AND id <> $3`, [B, g, auto.id]);
    ok(restes.length === 0, 'plus aucune publication ni republication de la jumelle n\'attend : les relances du serveur (needs_user, pending) n\'ont rien à reprendre', restes);
    const fj = await un(`SELECT statut, quantite FROM inventaire WHERE id = $1`, [g]);
    ok(fj.statut === 'stock' && fj.quantite === 3, 'la fiche jumelle est toujours au stock, inchangée', fj);
    // (d) Décision 4 : la marque, visible pour le compte relié seul (RLS), que l'app montre et tient hors des lots.
    const vueB = await o.enApp(B, () => q(`SELECT inventaire_id::text AS fiche, de_fiche::text AS de_fiche FROM jumelles_retirees_partout`));
    const vueA = await o.enApp(A, () => q(`SELECT inventaire_id FROM jumelles_retirees_partout WHERE user_id = $1`, [B]));
    ok(vueB.some((x) => x.fiche === String(g) && x.de_fiche === String(p.f)) && vueA.length === 0,
      'décision 4 : la jumelle porte sa marque, lisible par SON compte (l\'app), invisible de l\'autre (RLS)', { vueB: vueB.length, vueA: vueA.length });
  });

  await cas('12. Le retrait à la vente est inchangé — et aucune fonction de prod n\'est réécrite', async () => {
    const fx = JSON.parse(lire(FIXTURE));
    const md5 = await o.md5();
    const ecarts = Object.keys(fx.md5).filter((f) => md5[f] !== fx.md5[f]);
    ok(ecarts.length === 0 && Object.keys(fx.md5).length >= 190 && INTACTES.every((f) => fx.md5[f]),
      `les ${Object.keys(fx.md5).length} fonctions de la fixture (toutes, dont les ${INTACTES.length} de la vente, de ses preuves, de la question et du filet) sont celles de PROD, à l'octet`, ecarts.slice(0, 5));
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
    await q(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, quantite, plateforme, plateforme_code, vendu_le, date, source)
      VALUES ($1, $2, 'vente', 12, 1, 'Beebs', 'beebs', now(), current_date, 'essai')`, [A, p.f]);
    await q(`UPDATE inventaire SET statut = 'vendu', quantite = 0, plateforme = 'Beebs' WHERE id = $1`, [p.f]);
    const jum = await un(`SELECT statut FROM inventaire WHERE id = $1`, [p.g]);
    const r = await o.retraits(B, p.g);
    ok(jum.statut === 'vendu' && r.length === 1 && r[0].pf?.arme_par?.chemin === 'vente_article_serveur'
      && r[0].pf?.arme_par?.pose_par === 'armer_retrait_job (serveur)' && Boolean(r[0].pf?.next_action_after),
    'vente chez un compte → jumelle vendue → retrait chez le compte relié (vente_article_serveur, armer_retrait_job, délai de 10 min) : comme avant', { jum, r: r.map((x) => x.pf?.arme_par) });
    await o.supprimerEnRetirant(A, p.f);
    ok((await o.retraits(B, p.g)).length === 1, 'puis la fiche vendue est supprimée : aucun retrait de plus (jumelle vendue : le circuit de la vente)');
  });

  if (apres) {
    await cas('13. Une erreur de la traversée ne fait jamais échouer la suppression', async () => {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      await q(`CREATE OR REPLACE FUNCTION public.copies_fiche_liee(p_user uuid, p_fiche bigint)
        RETURNS TABLE(lien bigint, compte uuid, fiche bigint, job uuid, platform text, mise_en_ligne timestamp with time zone, rang integer, motif_refus text, etat_refus text, partagee boolean)
        LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'panne provoquée par l''essai'; END $f$`);
      let n = 0, err = null;
      try { n = await o.supprimerEnRetirant(A, p.f); } catch (e) { err = e.message; }
      const rA = await q(`SELECT 1 FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete' AND listing_url = $2`, [A, p.miens[0].url]);
      ok(err === null && n === 1 && rA.length === 1, 'la fiche est supprimée et le retrait du compte qui agit est là, malgré la panne', err);
      const trace = await q(`SELECT metadata FROM usage_logs WHERE user_id = $1 AND feature = 'retrait_partout_compte_relie_erreur' AND metadata ->> 'article_id' = $2`, [A, String(p.f)]);
      ok((await o.retraits(B, p.g)).length === 0 && trace.length === 1 && /panne provoquée/.test(trace[0]?.metadata?.erreur ?? ''),
        '… rien d\'écrit à moitié chez le compte relié, la panne est tracée (retrait_partout_compte_relie_erreur)', trace);
      if (migration) await o.c.query(migration);
      const ap = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      await o.supprimerEnRetirant(A, ap.f);
      ok((await o.retraits(B, ap.g)).length === 1, 'la migration rejouée rétablit la règle (idempotente)');
    });

    await cas('14. L\'identité de la session est rendue telle quelle', async () => {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'depop' }] });
      await o.commeApp(A);
      let apresGeste;
      try {
        await o.c.query('BEGIN');
        await o.c.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
          VALUES ($1, $2, 'vinted', 'delete', 'pending', 'original', 'Article d''essai', $3, '{}'::jsonb)`, [A, p.f, p.miens[0].url]);
        await o.c.query(`DELETE FROM inventaire WHERE id = $1`, [p.f]);
        apresGeste = await un(`SELECT auth.uid() AS uid, current_setting('request.jwt.claims', true) AS claims, current_user::text AS role,
          (SELECT count(*)::int FROM cross_post_jobs) AS visibles`);
        await o.c.query('COMMIT');
      } catch (e) { await o.c.query('ROLLBACK').catch(() => {}); throw e; } finally { await o.commeServeur(); }
      ok(apresGeste.uid === A && JSON.parse(apresGeste.claims).sub === A && apresGeste.role === 'authenticated',
        'dans la même transaction, après la traversée : auth.uid() est toujours le compte qui agit', apresGeste);
      const r = await o.retraits(B, p.g);
      ok(r.length === 1 && r[0].platform === 'depop', 'et le retrait Depop du compte relié est armé');
      const vus = await o.enApp(A, () => q(`SELECT count(*)::int AS n FROM cross_post_jobs WHERE user_id = $1`, [B]));
      ok(vus[0].n === 0, 'sous RLS, le compte qui agit ne voit toujours aucune tâche du compte relié');
    });

    await cas('15. Les droits : le serveur seulement, sauf la réponse de la personne', async () => {
      const refuse = async (role, sql) => { await o.c.query(`SET ROLE ${role}`); try { await o.c.query(sql); return false; } catch (e) { return /permission denied/i.test(e.message); } finally { await o.c.query('RESET ROLE'); } };
      const serveur = [`SELECT public.armer_retraits_fiche_liee('${A}', 1)`, `SELECT * FROM public.copies_fiche_liee('${A}', 1)`,
        `SELECT public.inventaire_arme_retraits_fiche_liee()`, `SELECT public.armer_retrait_copie_reliee(gen_random_uuid(), 'x', 'y', '{}'::jsonb)`,
        `SELECT public.annonce_en_retrait_compte_relie(gen_random_uuid())`];
      for (const role of ['authenticated', 'anon']) {
        let tous = true;
        for (const sql of serveur) if (!(await refuse(role, sql))) tous = false;
        ok(tous, `${role} ne peut exécuter aucune des cinq fonctions du serveur`);
      }
      ok(await refuse('anon', `SELECT public.copie_retrait_partout_repondre(gen_random_uuid(), 'non')`), 'anon ne peut pas répondre à une question');
      const droits = await un(`SELECT has_function_privilege('service_role', 'public.armer_retraits_fiche_liee(uuid,bigint,text)', 'EXECUTE') AS s,
        has_function_privilege('authenticated', 'public.copies_fiche_liee(uuid,bigint)', 'EXECUTE') AS a,
        has_function_privilege('authenticated', 'public.copie_retrait_partout_repondre(uuid,text,uuid)', 'EXECUTE') AS r`);
      ok(droits.s === true && droits.a === false && droits.r === true, 'service_role garde l\'exécution (scripts de réparation) ; authenticated : la réponse seulement');
      const conf = await q(`SELECT p.proname, p.prosecdef, p.proconfig::text AS cfg FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('copies_fiche_liee', 'annonce_en_retrait_compte_relie', 'armer_retrait_copie_reliee', 'armer_retraits_fiche_liee',
                          'inventaire_arme_retraits_fiche_liee', 'copie_retrait_partout_repondre') ORDER BY 1`);
      ok(conf.length === 6 && conf.every((f) => f.prosecdef && /search_path=public, pg_temp/.test(f.cfg)), 'SECURITY DEFINER, search_path fixé (public, pg_temp)', conf);
      const tab = await un(`SELECT c.relrowsecurity AS rls, has_table_privilege('authenticated', c.oid, 'SELECT') AS lit,
          has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE') OR has_table_privilege('authenticated', c.oid, 'DELETE') AS ecrit,
          has_table_privilege('anon', c.oid, 'SELECT') AS anon
        FROM pg_class c WHERE c.oid = 'public.jumelles_retirees_partout'::regclass`);
      ok(tab.rls === true && tab.lit === true && tab.ecrit === false && tab.anon === false, 'la marque : RLS, lue par l\'app, jamais écrite par elle, jamais lue par un visiteur', tab);
    });
  }

  await cas('16. Pourquoi le serveur : sous RLS, l\'app ne peut pas armer un retrait pour l\'autre compte', async () => {
    const p = await o.paire({ lien: false, miens: [], siens: [{ platform: 'leboncoin' }] });
    let refus = null;
    try {
      await o.enApp(A, () => o.c.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
        VALUES ($1, $2, 'leboncoin', 'delete', 'pending', 'original', 'Article d''essai', $3, '{}'::jsonb)`, [B, p.g, p.siens[0].url]));
    } catch (e) { refus = e.message; }
    ok(/row-level security/i.test(refus ?? ''), 'la politique de prod de cross_post_jobs (auth.uid() = user_id) refuse l\'insertion pour un autre compte', refus);
  });

  if (!apres) return;

  await cas('17. Relecture M6 : la MÊME annonce d\'une boutique partagée n\'a jamais deux retraits', async () => {
    for (const [voie, geste] of [['app', o.supprimerEnRetirant], ['filet', o.supprimer]]) {
      const num = o.numero(), url = o.LIEN.leboncoin(num);
      const p = await o.paire({ miens: [{ platform: 'leboncoin', num, url }], siens: [{ platform: 'leboncoin', num, url }] });
      await geste(A, p.f);
      const rA = await q(`SELECT id FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete' AND platform = 'leboncoin' AND listing_url = $2 AND status = 'pending'`, [A, url]);
      ok(rA.length === 1 && (await o.retraits(B, p.g)).length === 0 && (await motifsRefus(p.g)).includes('annonce_en_retrait_compte_relie'),
        `voie ${voie} : le compte qui agit retire l'annonce partagée ; chez le compte relié, aucun second retrait du même numéro (refus tracé)`, { rA, rB: await o.retraits(B, p.g), m: await motifsRefus(p.g) });
      ok(Boolean((await marque(B, p.g)).fiche), `voie ${voie} : … l'annonce est retirée (par l'autre compte) : la jumelle porte sa marque`);
    }
    // (Relecture finale, point 1 — BLOQUANT) Deux annonces DIFFÉRENTES sur la boutique partagée : la fiche du compte qui
    // agit a SON dépôt (N1), la jumelle le SIEN (N2 ≠ N1, rattachement certain). Deux annonces d'une plateforme = deux
    // exemplaires : jamais un retrait d'office de N2 ; la question si son annonce est vivante, un refus tracé sinon ; rien
    // d'annulé ni de clos sur cette plateforme chez la jumelle (point 4).
    for (const [voie, geste] of [['app', o.supprimerEnRetirant], ['filet', o.supprimer]]) {
      const p = await o.paire({ miens: [{ platform: 'leboncoin' }], siens: [{ platform: 'leboncoin', pf: PERSONNE }] });
      const repY = await o.depot(B, p.g, { platform: 'leboncoin', action: 'republish', status: 'pending', num: p.siens[0].num, url: p.siens[0].url, pf: { republish_step: 'a_capturer' } });
      const pubB = await o.depot(B, p.g, { platform: 'beebs', status: 'pending' });
      const vendu = await o.depot(B, p.g, { platform: 'leboncoin', status: 'sold', il: '3 days' });
      await q(`INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu) VALUES ($1, $2, 'leboncoin', $3)`, [B, p.g, vendu.id]);
      await geste(A, p.f);
      const rA = await q(`SELECT id FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete' AND platform = 'leboncoin' AND listing_url = $2`, [A, p.miens[0].url]);
      const qs = await questions(B, p.g);
      const rem = await un(`SELECT statut FROM remises_en_vente WHERE user_id = $1 AND inventaire_id = $2`, [B, p.g]);
      ok(rA.length === 1 && (await o.retraits(B, p.g)).length === 0 && (await o.tache(p.siens[0].id)).status === 'published'
        && (await motifsRefus(p.g)).includes('deux_annonces_paire') && qs.length === 1 && qs[0].preuves?.job === p.siens[0].id && qs[0].preuves?.doute === 'deux_annonces_paire',
      `point 1, voie ${voie} : N1 ≠ N2 sur la boutique partagée — aucun retrait d'office de N2 chez le compte relié : la QUESTION, le refus tracé (deux_annonces_paire)`, { rA, rB: await o.retraits(B, p.g), m: await motifsRefus(p.g), qs });
      ok((await o.tache(repY.id)).status === 'pending' && rem.statut === 'a_faire' && (await o.tache(pubB.id)).status === 'cancelled',
        `point 4, voie ${voie} : rien d'annulé ni de clos sur la plateforme du doute (republication, remise), la publication Beebs l'est`, { repY: (await o.tache(repY.id)).status, rem, pubB: (await o.tache(pubB.id)).status });
    }
    // … l'annonce de la jumelle n'est plus vivante : ni retrait ni question, un refus tracé.
    const p2 = await o.paire({ miens: [{ platform: 'leboncoin' }], siens: [{ platform: 'leboncoin', pf: PERSONNE }] });
    await q(`UPDATE annonces_plateforme SET disparu_le = now() WHERE user_id = $1 AND listing_id = $2`, [B, p2.siens[0].num]);
    await o.supprimerEnRetirant(A, p2.f);
    ok((await o.retraits(B, p2.g)).length === 0 && (await questions(B, p2.g)).length === 0 && (await motifsRefus(p2.g)).includes('deux_annonces_paire'),
      'point 1 : N1 ≠ N2, l\'annonce de la jumelle n\'est plus vivante : ni retrait ni question, le refus tracé', { m: await motifsRefus(p2.g) });
  });

  await cas('18. Relecture I1/M1 : jamais d\'attente — verrous NOWAIT / SKIP LOCKED tracés, budget de temps, une tâche en cours jamais verrouillée', async () => {
    const tenir = async (sql, p) => { const x = await o.autre(); await x.query('BEGIN'); await x.query(sql, p); return async () => { await x.query('ROLLBACK').catch(() => {}); await x.end().catch(() => {}); }; };
    // a. La tâche EN COURS est tenue par le poste qui l'exécute : la traversée ne l'attend jamais (elle ne la verrouille pas).
    {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      const enCours = await o.depot(B, p.g, { platform: 'beebs', status: 'processing', pf: { processing_since: new Date(Date.now() - 600000).toISOString() } });
      const attente = await o.depot(B, p.g, { platform: 'depop', status: 'pending' });
      const lacher = await tenir(`SELECT 1 FROM cross_post_jobs WHERE id = $1 FOR UPDATE`, [enCours.id]);
      const t = await chrono(() => o.supprimerEnRetirant(A, p.f));
      await lacher();
      const b = await bilan(B, p.g);
      ok(!t.err && t.n === 1 && t.ms < 700 && (await o.retraits(B, p.g)).length === 1 && (await o.tache(attente.id)).status === 'cancelled'
        && (await o.tache(enCours.id)).status === 'processing' && b?.taches_laissees?.some((x) => x.job === enCours.id && x.motif === 'en_cours'),
      `a. tâche en cours tenue par son poste : suppression en ${t.ms} ms, le retrait et l'annulation faits, la tâche en cours jamais attendue ni écrite, nommée`, { err: t.err?.message, ms: t.ms, b });
    }
    // b. Une publication en attente tenue par un autre geste : SKIP LOCKED — laissée, nommée, tracée.
    {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      const attente = await o.depot(B, p.g, { platform: 'beebs', status: 'pending' });
      const lacher = await tenir(`SELECT 1 FROM cross_post_jobs WHERE id = $1 FOR UPDATE`, [attente.id]);
      const t = await chrono(() => o.supprimerEnRetirant(A, p.f));
      await lacher();
      const b = await bilan(B, p.g);
      ok(!t.err && t.ms < 700 && (await o.tache(attente.id)).status === 'pending' && (await o.retraits(B, p.g)).length === 1
        && b?.taches_laissees?.some((x) => x.job === attente.id && x.motif === 'verrouillee')
        && b?.erreurs?.some((x) => x.etape === 'taches_en_attente' && x.job === attente.id && x.erreur === 'verrou'),
      `b. publication tenue ailleurs : jamais attendue (${t.ms} ms), laissée et nommée, le verrou tracé dans « erreurs »`, { err: t.err?.message, ms: t.ms, b });
    }
    // c. Le dépôt à retirer tenu par un autre geste : NOWAIT — rien d'écrit pour lui, tracé.
    {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }, { platform: 'beebs' }] });
      const lacher = await tenir(`SELECT 1 FROM cross_post_jobs WHERE id = $1 FOR UPDATE`, [p.siens[0].id]);
      const t = await chrono(() => o.supprimerEnRetirant(A, p.f));
      await lacher();
      const r = await o.retraits(B, p.g);
      const b = await bilan(B, p.g);
      ok(!t.err && t.ms < 700 && r.length === 1 && r[0].platform === 'beebs'
        && b?.erreurs?.some((x) => x.etape === 'retrait' && x.job === p.siens[0].id && x.erreur === 'verrou'),
      `c. dépôt tenu ailleurs : jamais attendu (${t.ms} ms), l'autre copie retirée, le verrou tracé`, { err: t.err?.message, ms: t.ms, r, b });
    }
    // d. La FICHE jumelle tenue (FOR UPDATE) : l'insertion du retrait attend sa clé étrangère — lock_timeout 1 s, jamais
    //    la limite de 8 s de l'API (une 57014 ferait échouer la suppression).
    {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      const lacher = await tenir(`SELECT 1 FROM inventaire WHERE id = $1 FOR UPDATE`, [p.g]);
      const t = await chrono(() => o.supprimerEnRetirant(A, p.f));
      await lacher();
      const b = await bilan(B, p.g);
      ok(!t.err && t.n === 1 && t.ms < 4000 && (await o.retraits(B, p.g)).length === 0
        && b?.erreurs?.some((x) => x.etape === 'retrait' && x.job === p.siens[0].id && /lock|verrou/i.test(String(x.erreur))),
      `d. fiche jumelle tenue ailleurs : la suppression passe en ${t.ms} ms (jamais la limite de 8 s), le retrait non armé est tracé`, { err: t.err?.message, ms: t.ms, b });
    }
    // e. Le budget de temps (2 s) : une étape lente n'emporte jamais la suppression ; le reste est tracé, nommé.
    {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'beebs', titre: 'LENT-ESSAI' }, { platform: 'leboncoin' }] });
      const attente = await o.depot(B, p.g, { platform: 'depop', status: 'pending' });
      const lever = await panne('lent', 'cross_post_jobs', 'BEFORE INSERT', `new.action = 'delete' AND new.title = 'LENT-ESSAI'`, 'PERFORM pg_sleep(2.3)');
      const t = await chrono(() => o.supprimerEnRetirant(A, p.f));
      await lever();
      const r = await o.retraits(B, p.g);
      const b = await bilan(B, p.g);
      ok(!t.err && t.ms < 5000 && r.length === 1 && r[0].platform === 'beebs' && (await o.tache(attente.id)).status === 'pending'
        && b?.erreurs?.some((x) => x.etape === 'retrait' && x.job === p.siens[1].id && x.erreur === 'budget')
        && b?.taches_laissees?.some((x) => x.job === attente.id && x.motif === 'budget'),
      `e. budget dépassé (${t.ms} ms) : la copie suivante n'est pas armée (tracée « budget »), la tâche en attente est laissée et nommée`, { err: t.err?.message, ms: t.ms, r, b });
    }
    // f. Plusieurs fiches supprimées en UNE requête : elles partagent le même budget (la limite de 8 s vaut pour la requête).
    {
      const p1 = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'beebs', titre: 'LENT-ESSAI' }] });
      const p2 = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      const lever = await panne('lent2', 'cross_post_jobs', 'BEFORE INSERT', `new.action = 'delete' AND new.title = 'LENT-ESSAI'`, 'PERFORM pg_sleep(2.3)');
      // p1 (la lente) est née avant p2 : la suppression la traite en premier (ordre physique comme ordre de la clé).
      const t = await chrono(() => o.enApp(A, async () => (await o.c.query(`DELETE FROM inventaire WHERE id = ANY($1::bigint[])`, [[p1.f, p2.f]])).rowCount));
      await lever();
      const r1 = await o.retraits(B, p1.g), r2 = await o.retraits(B, p2.g);
      ok(!t.err && t.n === 2 && t.ms < 5000 && r1.length === 1 && r2.length === 0 && (await bilan(B, p2.g))?.erreurs?.some((x) => x.erreur === 'budget'),
        `f. deux fiches supprimées en une requête (${t.ms} ms) : le budget est celui de la REQUÊTE, la seconde traversée ne le dépasse pas (tracée « budget »)`, { err: t.err?.message, ms: t.ms, r1, r2 });
      ok(Boolean((await marque(B, p1.g)).fiche) && !(await marque(B, p2.g)).fiche,
        'point 3 : suppression de masse au-delà du budget — la jumelle dont rien n\'a été fait ne porte PAS la marque (le bilan dit « budget ») ; l\'autre, oui');
    }
  });

  await cas('19. Une suppression en cascade (déclencheur dans un déclencheur) ne traverse jamais', async () => {
    await q(`CREATE TABLE IF NOT EXISTS public.essai_cascade (fiche bigint)`);
    await q(`GRANT INSERT ON public.essai_cascade TO authenticated`);
    await q(`CREATE OR REPLACE FUNCTION public.essai_cascade_supprime() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN DELETE FROM public.inventaire WHERE id = NEW.fiche; RETURN NEW; END $f$`);
    await q(`CREATE TRIGGER essai_cascade_supprime AFTER INSERT ON public.essai_cascade FOR EACH ROW EXECUTE FUNCTION public.essai_cascade_supprime()`);
    try {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }] });
      await o.enApp(A, () => o.c.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
        VALUES ($1, $2, 'vinted', 'delete', 'pending', 'original', 'Article d''essai', $3, '{}'::jsonb)`, [A, p.f, p.miens[0].url]));
      await o.enApp(A, () => o.c.query(`INSERT INTO public.essai_cascade (fiche) VALUES ($1)`, [p.f]));
      const partie = (await un(`SELECT count(*)::int AS n FROM inventaire WHERE id = $1`, [p.f])).n === 0;
      ok(partie && (await o.retraits(B, p.g)).length === 0, 'fiche supprimée par un déclencheur (profondeur > 1) : rien chez le compte relié (la porte du filet)');
    } finally {
      await q(`DROP TABLE IF EXISTS public.essai_cascade`);
      await q(`DROP FUNCTION IF EXISTS public.essai_cascade_supprime()`);
    }
  });

  if (migration && inverse) {
    await cas('20. Relecture B1 : la migration et son inverse n\'attendent jamais plus de 5 s derrière une écriture sur inventaire', async () => {
      const x = await o.autre();
      const f0 = await o.fiche(A);
      await x.query('BEGIN');
      await x.query(`UPDATE inventaire SET titre = titre WHERE id = $1`, [f0]);
      const essai = async (sql) => { await q(`SET statement_timeout = '9s'`); const t0 = Date.now(); let code = null; try { await o.c.query(sql); } catch (e) { code = e.code; } const ms = Date.now() - t0; await q('RESET statement_timeout'); return { code, ms }; };
      try {
        const m = await essai(migration);
        ok(m.code === '55P03' && m.ms < 7500 && (await o.objetsNeufs()).declencheur, `la migration rend la main en ${m.ms} ms (lock_timeout 5 s, 55P03) et n'a rien fait à moitié`, m);
        const i = await essai(inverse);
        const reste = await o.objetsNeufs();
        ok(i.code === '55P03' && i.ms < 7500 && reste.declencheur && reste.fonctions.length === 6 && reste.table, `l'inverse aussi (${i.ms} ms) : rien n'est retiré à moitié`, { i, reste });
        const lt = await un(`SELECT current_setting('lock_timeout') AS v`);
        ok(lt.v === '0', 'la session garde son réglage (le SET de la migration est défait avec elle)', lt);
      } finally {
        await x.query('ROLLBACK').catch(() => {}); await x.end().catch(() => {});
      }
    });
  }

  await cas('21. Décision 5 : la réponse du compte relié à la question (copie_retrait_partout_repondre)', async () => {
    const poser = async () => { const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: TITRE }] }); await o.supprimerEnRetirant(A, p.f); return { p, qx: (await questions(B, p.g))[0] }; };
    const repondre = (user, id, d, annonce = null) => o.enApp(user, () => un(`SELECT public.copie_retrait_partout_repondre($1, $2, $3) AS r`, [id, d, annonce])).then((x) => x.r);
    const { p: p1, qx: q1 } = await poser();
    ok(Boolean(q1?.id), 'la question est posée', q1);
    ok((await repondre(B, q1.id, 'oui', null))?.reason === 'annonce_non_montree' && (await o.retraits(B, p1.g)).length === 0,
      '« Oui » sans l\'annonce montrée : refusé, rien n\'est retiré (jamais une annonce que l\'écran n\'a pas montrée)');
    ok((await repondre(A, q1.id, 'oui', q1.preuves.annonce_id))?.reason === 'introuvable', 'l\'autre compte ne peut pas répondre à sa place (introuvable sur sa session)');
    const r1 = await repondre(B, q1.id, 'oui', q1.preuves.annonce_id);
    const rB = await o.retraits(B, p1.g);
    const dep = await o.tache(p1.siens[0].id);
    const q1b = (await questions(B, p1.g))[0];
    ok(r1?.ok === true && rB.length === 1 && rB[0].status === 'pending' && rB[0].num === p1.siens[0].num
      && rB[0].pf?.arme_par?.chemin === 'copie_confirmee_retrait_partout' && rB[0].pf?.arme_par?.pose_par === POSE_PAR_REPONSE && rB[0].pf?.arme_par?.question === q1.id,
    '« Oui » sur l\'annonce montrée : le retrait de CETTE annonce, à son nom, tracé (chemin, question)', { r1, rB });
    ok(!/armer_retrait_job/i.test(String(rB[0]?.pf?.arme_par?.pose_par)) && !/^vente_/i.test(String(rB[0]?.pf?.arme_par?.chemin)),
      '… jamais lu comme un retrait d\'article vendu');
    ok(dep.platform_fields?.rattachement?.par === 'utilisateur' && dep.platform_fields?.rattachement?.motif === 'meme_article_confirme'
      && dep.platform_fields?.rattachement?.confirme?.question === q1.id && dep.platform_fields?.retrait_arme?.job === rB[0]?.id,
    '… le geste prouve le rattachement (par utilisateur, meme_article_confirme), comme le « Oui » de la vente', dep.platform_fields);
    ok(q1b.statut === 'confirmee' && q1b.preuves?.retrait === rB[0]?.id, '… la question est tranchée (confirmee, avec son retrait)', q1b);
    ok((await repondre(B, q1.id, 'oui', q1.preuves.annonce_id))?.reason === 'deja_tranchee' && (await o.retraits(B, p1.g)).length === 1, 'répondre deux fois : rien de plus');
    // (Relecture finale, point 5) Entre la question et la réponse, l'annonce montrée ne désigne plus le numéro du dépôt
    // (ancienne ligne, numéro changé) : le « Oui » ne retire RIEN (il retirerait une autre annonce que celle montrée).
    const { p: p5, qx: q5 } = await poser();
    await q(`UPDATE annonces_plateforme SET listing_id = $2, url = $3 WHERE id = $1`, [q5.preuves.annonce_id, ...((n) => [n, o.LIEN.leboncoin(n)])(o.numero())]);
    const r5 = await repondre(B, q5.id, 'oui', q5.preuves.annonce_id);
    ok(r5?.ok === false && r5?.reason === 'sans_objet' && (await o.retraits(B, p5.g)).length === 0,
      'point 5 : l\'annonce montrée ne désigne plus le numéro du dépôt : « Oui » sans objet, rien n\'est retiré', r5);
    const { p: p2, qx: q2 } = await poser();
    const r2 = await repondre(B, q2.id, 'non');
    await un(`SELECT public.armer_retraits_fiche_liee($1, $2) AS r`, [A, p2.f]);
    ok(r2?.ok === true && (await questions(B, p2.g))[0]?.statut === 'refusee' && (await questions(B, p2.g)).length === 1 && (await o.retraits(B, p2.g)).length === 0,
      '« Non » : rien n\'est retiré, la question n\'est jamais reposée (rejouée : aucune nouvelle)');
    // L'app d'aujourd'hui (et l'entrée de l'équipe) passent par la réponse de la VENTE : sur une jumelle au stock, elle ne
    // retire rien (sans objet) — aucune réponse par erreur ne retire une annonce avant l'OTA.
    const { p: p3, qx: q3 } = await poser();
    const r3 = await o.enApp(B, () => un(`SELECT public.inventaire_doublon_decider($1, 'oui', $2) AS r`, [q3.id, q3.preuves.annonce_id])).then((x) => x.r);
    ok(r3?.ok === false && (await o.retraits(B, p3.g)).length === 0, 'la réponse de la vente (prod, inchangée) sur cette question : rien n\'est retiré', r3);
  });

  await cas('22. Relecture M27 : une seule copie par plateforme, la plus récente — jamais un ancien dépôt dont l\'annonce est partie', async () => {
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', il: '60 days' }, { platform: 'leboncoin', il: '5 days' }] });
    await q(`UPDATE annonces_plateforme SET disparu_le = now() - interval '30 days' WHERE user_id = $1 AND listing_id = $2`, [B, p.siens[0].num]);
    await o.supprimerEnRetirant(A, p.f);
    const r = await o.retraits(B, p.g);
    ok(r.length === 1 && r[0].num === p.siens[1].num, 'deux dépôts certains publiés (l\'ancien dont l\'annonce a disparu) : un seul retrait, celui de la copie la plus récente', r);
  });

  await cas('23. Relecture M01b : rattachement confirmé par la personne PUIS déplacé par une fusion automatique — la question, jamais le retrait', async () => {
    const confirme = { source: 'releve', rattachement: { par: 'utilisateur', motif: 'meme_article_confirme', confirme: { le: new Date(Date.now() - 5 * 86400000).toISOString() } } };
    const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin', pf: confirme }] });
    const autre = await o.fiche(B);
    await q(`INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, par) VALUES ($1, $2, $3, $4, 'ia (essai)')`,
      [B, p.g, autre, JSON.stringify({ cross_post_jobs: [p.siens[0].id] })]);
    const preuves = await un(`SELECT public.retrait_job_prouve($1) AS prouve, public.rattachement_confirme($1) AS confirme`, [p.siens[0].id]);
    ok(preuves.prouve === true && preuves.confirme === false, 'témoin : retrait_job_prouve le croit prouvé, rattachement_confirme non (les deux preuves de prod)', preuves);
    await o.supprimerEnRetirant(A, p.f);
    ok((await o.retraits(B, p.g)).length === 0 && (await questions(B, p.g)).length === 1 && (await motifsRefus(p.g)).includes('rattachement_non_confirme'),
      'aucun retrait : la question est posée, le refus tracé (les DEUX preuves sont exigées)');
  });

  await cas('24. Relecture M39 / M41 / I2 : une étape qui échoue n\'emporte jamais les autres, et chaque erreur est au bilan', async () => {
    const etape = async (nom, preparer, verifier) => {
      const p = await o.paire({ miens: [{ platform: 'vinted' }], siens: [{ platform: 'leboncoin' }, ...(preparer.siens ?? [])] });
      const extra = preparer.avant ? await preparer.avant(p) : {};
      const lever = await panne(nom, preparer.table, preparer.quand, preparer.si(p, extra));
      let t;
      try { t = await chrono(() => o.supprimerEnRetirant(A, p.f)); } finally { await lever(); }
      await verifier(p, extra, t, await bilan(B, p.g));
    };
    await etape('a', { siens: [{ platform: 'beebs', titre: 'PANNE-ESSAI-A' }], table: 'cross_post_jobs', quand: 'BEFORE INSERT', si: () => `new.action = 'delete' AND new.title = 'PANNE-ESSAI-A'` },
      async (p, x, t, b) => {
        const r = await o.retraits(B, p.g);
        ok(!t.err && r.length === 1 && r[0].platform === 'leboncoin' && b?.erreurs?.some((e) => e.etape === 'retrait' && e.job === p.siens[1].id && /panne provoquée/.test(e.erreur)),
          'a. le retrait d\'une copie échoue : l\'autre copie est retirée, l\'erreur est au bilan (clé « erreurs »)', { err: t.err?.message, r, b });
      });
    await etape('b', { table: 'cross_post_jobs', quand: 'BEFORE UPDATE', avant: async (p) => ({
      casse: await o.depot(B, p.g, { platform: 'beebs', status: 'pending', titre: 'PANNE-ESSAI-B' }), saine: await o.depot(B, p.g, { platform: 'depop', status: 'pending' }) }),
    si: () => `old.title = 'PANNE-ESSAI-B' AND new.status = 'cancelled'` },
    async (p, x, t, b) => {
      ok(!t.err && (await o.retraits(B, p.g)).length === 1 && (await o.tache(x.saine.id)).status === 'cancelled' && (await o.tache(x.casse.id)).status === 'pending'
        && b?.taches_laissees?.some((e) => e.job === x.casse.id && e.motif === 'erreur') && b?.erreurs?.some((e) => e.etape === 'taches_en_attente' && e.job === x.casse.id),
      'b. l\'annulation d\'une tâche échoue : le retrait et l\'autre annulation sont faits, la tâche est laissée, nommée, l\'erreur au bilan', { err: t.err?.message, b });
    });
    await etape('c', { table: 'remises_en_vente', quand: 'BEFORE UPDATE', avant: async (p) => {
      const v = await o.depot(B, p.g, { platform: 'leboncoin', status: 'sold', il: '3 days' });
      await q(`INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu) VALUES ($1, $2, 'leboncoin', $3)`, [B, p.g, v.id]);
      return { attente: await o.depot(B, p.g, { platform: 'beebs', status: 'pending' }) };
    }, si: () => 'true' },
    async (p, x, t, b) => {
      const rem = await un(`SELECT statut FROM remises_en_vente WHERE user_id = $1 AND inventaire_id = $2`, [B, p.g]);
      ok(!t.err && (await o.retraits(B, p.g)).length === 1 && (await o.tache(x.attente.id)).status === 'cancelled' && rem.statut === 'a_faire'
        && b?.erreurs?.some((e) => e.etape === 'remises_en_vente'),
      'c. la clôture des remises en vente échoue : retrait et annulations faits, l\'erreur au bilan', { err: t.err?.message, rem, b });
    });
    await etape('d', { table: 'jumelles_retirees_partout', quand: 'BEFORE INSERT', si: () => 'true' },
      async (p, x, t, b) => {
        ok(!t.err && (await o.retraits(B, p.g)).length === 1 && !(await marque(B, p.g)).fiche && b?.erreurs?.some((e) => e.etape === 'marque'),
          'd. la marque échoue : le retrait est fait, l\'erreur au bilan', { err: t.err?.message, b });
      });
    await etape('e', { table: 'usage_logs', quand: 'BEFORE INSERT', si: () => `new.feature = 'retrait_annonces' AND new.user_id = '${B}'` },
      async (p, x, t, b) => {
        ok(!t.err && (await o.retraits(B, p.g)).length === 1 && b?.erreurs?.some((e) => e.etape === 'journal'),
          'e. la ligne du journal échoue : le retrait est fait, le bilan le dit', { err: t.err?.message, b });
      });
    await etape('f', { table: 'usage_logs', quand: 'BEFORE INSERT', si: () => `new.feature = 'retrait_partout_compte_relie' AND new.user_id = '${B}'` },
      async (p, x, t, b) => {
        ok(!t.err && t.n === 1 && (await o.retraits(B, p.g)).length === 1 && b === null, 'f. le bilan échoue : la suppression et le retrait sont faits quand même', { err: t.err?.message, b });
      });
  });
}
