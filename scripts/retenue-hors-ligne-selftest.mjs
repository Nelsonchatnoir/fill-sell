// selftest:retenue-hors-ligne — (15/10, RoCotCot) jamais deux annonces hors
// ligne en même temps sur Leboncoin / Beebs / Depop, et un motif « En attente »
// qui se lève dès que l'annonce retirée est revenue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frereHorsLigne, retenueLevee, plateformesRetenuesPar, idsQuiRetiennent, attendSaRelecture, memeArticle, MESSAGE_EN_FILE } from '../supabase/functions/_shared/retenue-hors-ligne.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const T0 = Date.parse('2026-10-15T14:18:00Z');

// 1. Le groupe Leboncoin / Beebs / Depop.
const bopIt = { id: 'b1', platform: 'beebs' };
// (05/11 soir, règle 4 — correctif demandé par Nico) Plus de groupe : un AUTRE article d'une autre plateforme part.
ok(frereHorsLigne({ id: 'l1', platform: 'leboncoin' }, [bopIt]) === null, 'Beebs hors ligne ne retient plus le retrait Leboncoin d’un AUTRE article');
ok(frereHorsLigne({ id: 'd1', platform: 'depop' }, [bopIt]) === null, 'ni le retrait Depop d’un autre article');
// … mais le MÊME article n'est jamais hors ligne sur deux plateformes à la fois (Vinted compris).
const bopItArticle = { ...bopIt, inventaire_id: 7 };
ok(frereHorsLigne({ id: 'l1', platform: 'leboncoin', inventaire_id: 7 }, [bopItArticle])?.id === 'b1', 'le MÊME article : Leboncoin retenu par Beebs');
ok(frereHorsLigne({ id: 'v1', platform: 'vinted', inventaire_id: 7 }, [bopItArticle])?.id === 'b1', 'le MÊME article : Vinted retenu aussi');
ok(memeArticle({ inventaire_id: 7 }, { inventaire_id: '7' }) && !memeArticle({ inventaire_id: null }, { inventaire_id: null }), 'memeArticle : identifiant connu et égal seulement');
ok(frereHorsLigne({ id: 'v1', platform: 'vinted' }, [bopIt]) === null, 'Vinted n’est jamais retenu par Beebs');
ok(frereHorsLigne({ id: 'b2', platform: 'beebs' }, [{ id: 'v9', platform: 'vinted' }]) === null, 'Beebs n’est jamais retenu par Vinted');
ok(frereHorsLigne({ id: 'v2', platform: 'vinted' }, [{ id: 'v9', platform: 'vinted' }])?.id === 'v9', 'Vinted reste retenu par Vinted (comme avant)');
ok(frereHorsLigne({ id: 'b1', platform: 'beebs' }, [bopIt]) === null, 'un job ne se retient pas lui-même');
ok(frereHorsLigne({ id: 'b2', platform: 'beebs' }, [{ id: 'l9', platform: 'leboncoin' }, { id: 'b9', platform: 'beebs' }])?.id === 'b9', 'même plateforme d’abord');
ok(JSON.stringify(plateformesRetenuesPar('beebs')) === JSON.stringify(['beebs']), 'Beebs : sa plateforme seule (plus de groupe)');
ok(JSON.stringify(plateformesRetenuesPar('vinted')) === JSON.stringify(['vinted']), 'Vinted seul');

// 2. La retenue se lève quand le frère est revenu.
const retenue = (extra = {}) => ({ republish_step: 'captured', retenue_hors_ligne: { job: 'b1', titre: 'Bop It' }, ...extra });
ok(retenueLevee(retenue(), new Set(['b1']), T0) === null, 'frère toujours hors ligne : la retenue reste (elle est vraie)');
const l = retenueLevee(retenue(), new Set(), T0);
ok(l && l.retirer.includes('retenue_hors_ligne'), 'frère revenu : retenue levée');
ok(!l.retirer.includes('next_action_after'), 'sans attente : rien d’autre');
const l30 = retenueLevee(retenue({ next_action_after: new Date(T0 + 28 * 60_000).toISOString() }), new Set(), T0);
ok(l30.retirer.includes('next_action_after'), 'l’attente de 30 min de l’extension est levée avec la retenue');
const l3h = retenueLevee(retenue({ next_action_after: new Date(T0 + 3 * 3600_000).toISOString() }), new Set(), T0);
ok(!l3h.retirer.includes('next_action_after'), 'une reprise espacée (3 h) n’est jamais touchée');
ok(retenueLevee(retenue({ republish_step: 'deleted' }), new Set(), T0) === null, 'jamais sur une republication déjà engagée');
ok(retenueLevee(retenue({ deleted_at: '2026-10-15T14:00:00Z' }), new Set(), T0) === null, 'jamais après une suppression');
ok(retenueLevee({ republish_step: 'captured' }, new Set(), T0) === null, 'sans retenue : rien');
ok(/Ton annonce est toujours en ligne/.test(MESSAGE_EN_FILE) && !/n'est pas encore revenue/.test(MESSAGE_EN_FILE), 'le message « En file » dit vrai');

// 3. Câblage dans get-pending-jobs.
const gpj = readFileSync(new URL('../supabase/functions/get-pending-jobs/index.ts', import.meta.url), 'utf8');
ok(/from "\.\.\/_shared\/retenue-hors-ligne\.js"/.test(gpj), 'gpj importe la règle');
ok(/const frere = frereHorsLigne\(j,/.test(gpj), 'gpj retient par le groupe');
ok(gpj.includes('.or(`platform.eq.${plateformesRetenuesPar(String(frere["platform"]), frere)[0]}${frere["inventaire_id"] != null ? `,inventaire_id.eq.${frere["inventaire_id"]}` : ""}`)'), 'les autres en file : sa plateforme et le MÊME article (règle 4 du 05/11)');
ok(/retenueLevee\(pfM, idsHorsLigne, Date\.now\(\)\)/.test(gpj) && /update\(\{ error: MESSAGE_EN_FILE/.test(gpj), 'gpj lève les retenues périmées');
ok(gpj.includes('const idsHorsLigne = idsQuiRetiennent(String(m["platform"] ?? ""), (horsLigne ?? []) as Array<Record<string, unknown>>, m["inventaire_id"] ?? null);') && gpj.includes('.select("id, platform, error, platform_fields, inventaire_id")'), 'la levée se juge par plateforme de la marque ET par article (règle 4)');

// 4. (26/10, Johan Désiré) Une annonce qui attend sa RELECTURE ne retient que SA plateforme.
// Son essai de recréation s'est arrêté sur /deposer-une-annonce/options après le retrait : garde anti-doublon.
const jeanLee = {
  id: 'l7', platform: 'leboncoin',
  platform_fields: {
    republish_step: 'deleted', deleted_at: '2026-10-26T14:49:52.290Z',
    work_window_state: { at_start: { at: '2026-10-26T15:08:30.234Z' }, at_end: { at: '2026-10-26T15:33:53.234Z', fill_step: 'depot', tab_url: 'https://www.leboncoin.fr/deposer-une-annonce/options' } },
    recreation_attente_depuis: '2026-10-26T16:08:07.831Z',
  },
};
const lbcEnRecreation = { id: 'l8', platform: 'leboncoin', platform_fields: { republish_step: 'deleted', deleted_at: '2026-10-26T14:49:52.290Z' } };
ok(attendSaRelecture(jeanLee), 'Jean Lee (essai arrêté sur /options) attend sa relecture');
ok(!attendSaRelecture(lbcEnRecreation), 'une annonce simplement retirée (recréation à suivre) n’attend pas de relecture');
ok(!attendSaRelecture({ ...jeanLee, platform_fields: { ...jeanLee.platform_fields, recreation_verifiee: { apres: '2026-10-26T15:33:53.234Z' } } }), 'relecture faite (« aucune ») : elle redevient une recréation ordinaire');
ok(frereHorsLigne({ id: 'b5', platform: 'beebs' }, [jeanLee]) === null, 'Beebs n’est plus retenu par une annonce Leboncoin en relecture');
ok(frereHorsLigne({ id: 'd5', platform: 'depop' }, [jeanLee]) === null, 'Depop non plus');
ok(frereHorsLigne({ id: 'l9', platform: 'leboncoin' }, [jeanLee])?.id === 'l7', 'Leboncoin reste retenu : jamais deux annonces hors ligne sur la même plateforme');
ok(frereHorsLigne({ id: 'b5', platform: 'beebs' }, [jeanLee, lbcEnRecreation]) === null, '(règle 4) une annonce Leboncoin en recréation ne retient plus les AUTRES articles de Beebs');
// (05/11 soir) « Retenue levée trop tôt » : le Mickey attendait sa relecture sur Leboncoin, sa republication Depop est
// partie (10:19:44) → le même article hors ligne sur deux plateformes. Désormais, même en relecture, il retient son article.
const mickeyLbc = { ...jeanLee, id: 'l10', inventaire_id: 55 };
ok(frereHorsLigne({ id: 'd10', platform: 'depop', inventaire_id: 55 }, [mickeyLbc])?.id === 'l10', 'le MÊME article en relecture sur Leboncoin retient sa republication Depop');
ok(idsQuiRetiennent('depop', [mickeyLbc], 55).has('l10'), 'et sa marque Depop ne se lève pas tant qu’il est hors ligne');
ok(retenueLevee({ republish_step: 'captured', retenue_hors_ligne: { job: 'l10', titre: 'Mickey' } }, idsQuiRetiennent('depop', [mickeyLbc], 55), T0) === null, 'retenue du même article : jamais levée trop tôt');
ok(JSON.stringify(plateformesRetenuesPar('leboncoin', jeanLee)) === JSON.stringify(['leboncoin']), 'motif posé sur Leboncoin seul');
ok(JSON.stringify(plateformesRetenuesPar('leboncoin', lbcEnRecreation)) === JSON.stringify(['leboncoin']), '(règle 4) en recréation aussi : sa plateforme seule');
ok(!idsQuiRetiennent('beebs', [jeanLee]).has('l7') && idsQuiRetiennent('leboncoin', [jeanLee]).has('l7'), 'idsQuiRetiennent : par plateforme de la marque');
const marqueBeebs = { republish_step: 'captured', retenue_hors_ligne: { job: 'l7', titre: 'Jean Lee' } };
ok(retenueLevee(marqueBeebs, idsQuiRetiennent('beebs', [jeanLee]), T0)?.retirer.includes('retenue_hors_ligne'), 'les marques Beebs posées par Jean Lee se lèvent au passage suivant');
ok(retenueLevee(marqueBeebs, idsQuiRetiennent('leboncoin', [jeanLee]), T0) === null, 'les marques Leboncoin restent (vraies)');
ok(idsQuiRetiennent('vinted', [jeanLee]).size === 0 && idsQuiRetiennent('vinted', [{ id: 'v1', platform: 'vinted' }]).has('v1'), 'Vinted par plateforme, comme avant');
ok(!/String\(h\["platform"\]\) === String\(j\.platform\) && String\(h\["id"\]\) !== String\(j\.id\)/.test(gpj), 'l’ancienne comparaison par plateforme seule a disparu');

console.log(`✓ selftest:retenue-hors-ligne — ${n} assertions`);
