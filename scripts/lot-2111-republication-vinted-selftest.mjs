// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 4 : jamais une republication Vinted proposée pour une annonce vendue ou retirée
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant (Doriane, gilet sherpa 10754921573) : republiée le 10/11, plus jamais vue par 23 relevés complets en 3 jours,
// 5 republications « manuel » proposées et créées du 18 au 21/11, chacune close « n'est plus en ligne » (annonce_disparue)
// — et proposée de nouveau le lendemain. Une annonce Vinted « sold »/« closed » restait aussi proposée.
//   node --import ./scripts/loader-ext.mjs scripts/lot-2111-republication-vinted-selftest.mjs
import assert from 'node:assert/strict';
import { vintedPlusEnLigne, repubEtatPlateforme } from '../src/utils/republication.js';

let ok = 0;
const t = (nom, f) => { f(); ok++; console.log(`  ✓ ${nom}`); };
const ITEM = { id: 1, vinted_item_id: '10754921573', statut: 'stock', disparu_le: null, vinted_status: 'active', last_synced_at: '2026-11-10T21:00:00Z' };
const PUB = { id: 'p', platform: 'vinted', action: 'republish', status: 'published', created_at: '2026-11-10T20:48:00Z', published_at: '2026-11-10T20:55:00Z', platform_fields: {} };
const DISPARUE = (at, n) => ({ id: `d${n}`, platform: 'vinted', action: 'republish', status: 'cancelled', created_at: at,
  platform_fields: { annonce_disparue: { at, motif: 'absente de 50 relevés complets depuis sa dernière vue', pose_par: 'handler-watch' } } });

console.log('1. L\'annonce Vinted n\'est plus en ligne');
t('close « disparue » par le serveur, jamais revue depuis → plus en ligne, plus proposée', () => {
  const jobs = [PUB, DISPARUE('2026-11-20T21:33:10Z', 1)];
  assert.equal(vintedPlusEnLigne(ITEM, jobs), true);
  assert.equal(repubEtatPlateforme(ITEM, jobs, 'vinted'), 'ineligible');
});
t('un relevé l\'a revue depuis (last_synced_at après) → de nouveau proposée', () => {
  const jobs = [PUB, DISPARUE('2026-11-20T21:33:10Z', 1)];
  const revue = { ...ITEM, last_synced_at: '2026-11-21T06:00:00Z' };
  assert.equal(vintedPlusEnLigne(revue, jobs), false);
  assert.equal(repubEtatPlateforme(revue, jobs, 'vinted'), 'ok');
});
t('une publication Vinted partie APRÈS la disparition → la nouvelle annonce compte', () => {
  const apres = { ...PUB, id: 'p2', created_at: '2026-11-21T10:00:00Z', published_at: '2026-11-21T10:05:00Z' };
  assert.equal(vintedPlusEnLigne(ITEM, [PUB, DISPARUE('2026-11-20T21:33:10Z', 1), apres]), false);
});
t('Vinted la dit vendue ou close → jamais proposée', () => {
  for (const s of ['sold', 'closed']) {
    assert.equal(vintedPlusEnLigne({ ...ITEM, vinted_status: s }, [PUB]), true, s);
    assert.equal(repubEtatPlateforme({ ...ITEM, vinted_status: s }, [PUB], 'vinted'), 'ineligible', s);
  }
});
t('sans aucune preuve d\'absence : rien ne change (proposée comme avant)', () => {
  assert.equal(vintedPlusEnLigne(ITEM, [PUB]), false);
  assert.equal(repubEtatPlateforme(ITEM, [PUB], 'vinted'), 'ok');
});

console.log(`\n${ok} vérifications vertes — lot du 21/11, point 4 (republication Vinted d'une annonce partie).`);
