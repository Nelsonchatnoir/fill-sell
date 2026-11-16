// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 4 DU LOT DU 16/11/2026 MIDI — DEUX COMPTES D'UNE PLATEFORME NE SE MÉLANGENT JAMAIS (republication)
//     npm run selftest:compte-plateforme-melange
// ═══════════════════════════════════════════════════════════════════════════
// Constat (ayadi007, Business) : Leboncoin a bloqué son ancien compte ; son Mac relève le NOUVEAU compte (23b59b14…). Le
// 16/11 à 10:42, 19 republications visant l'ANCIEN compte ont été closes « n'est plus en ligne » sur deux relevés du
// nouveau compte (republication-cible.js ne regardait pas le compte du relevé). Une annonce du nouveau compte sur la même
// fiche pouvait même passer pour la « remise en ligne » de la cible (clôture « sans objet »).
// Ce test prouve :
//   A. relevé d'un compte B, cible sur le compte A : retenue « autre_compte », jamais close, jamais « sans objet » — même
//      quand la fiche a une annonce du compte B vue dans ce relevé ;
//   B. même compte (ou compte inconnu d'un côté) : la règle d'avant, à l'identique ;
//   C. le message le dit (« un autre compte… FillSell ne mélange jamais deux comptes ») ; get-pending-jobs lit les comptes
//      et passe le motif au message.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const R = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/republication-cible.js')).href);

const job = { action: 'republish', platform: 'leboncoin', status: 'pending', platform_listing_id: '3303478608', inventaire_id: 'F1', platform_fields: { republish_step: 'captured' } };
const releveB = { id: 'run-b', started_at: '2026-11-16T09:38:00Z', compte_plateforme: '23b59b14-5cde' };
const cibleA = { listing_id: '3303478608', vu_le: '2026-11-15T18:32:00Z', compte_plateforme: 'bf460991-06f6' };

console.log('\nA. Le relevé d’un autre compte');
{
  const v = R.jugerCibleRepublication({ job, releve: releveB, cible: cibleA, fiche: [] });
  ok(v.verdict === 'cible_absente' && v.motif === 'autre_compte', 'cible sur l’ancien compte, relevé du nouveau : retenue « autre_compte » (avant : cible absente → close au 2ᵉ relevé)', JSON.stringify(v));
  const fiche = [{ listing_id: '3310000001', vu_le: '2026-11-16T09:40:00Z', publiee_le: '2026-11-12T10:00:00Z', compte_plateforme: '23b59b14-5cde' }];
  const v2 = R.jugerCibleRepublication({ job, releve: releveB, cible: cibleA, fiche });
  ok(v2.verdict === 'cible_absente' && v2.motif === 'autre_compte', 'une annonce du NOUVEAU compte sur la fiche ne passe jamais pour la remise en ligne (avant : « sans objet », close)', JSON.stringify(v2));
}

console.log('\nB. Même compte, ou compte inconnu : la règle d’avant');
{
  const releveA = { ...releveB, compte_plateforme: 'bf460991-06f6' };
  const v = R.jugerCibleRepublication({ job, releve: releveA, cible: cibleA, fiche: [] });
  ok(v.verdict === 'cible_absente' && v.motif === 'cible_absente_du_releve', 'même compte, cible absente : la règle d’avant', JSON.stringify(v));
  const v2 = R.jugerCibleRepublication({ job, releve: { ...releveB, compte_plateforme: null }, cible: cibleA, fiche: [] });
  ok(v2.motif === 'cible_absente_du_releve', 'compte du relevé inconnu : la règle d’avant', JSON.stringify(v2));
  const v3 = R.jugerCibleRepublication({ job, releve: releveA, cible: { ...cibleA, vu_le: '2026-11-16T09:39:00Z' }, fiche: [] });
  ok(v3.verdict === 'servir', 'cible vue dans le relevé de son compte : servie');
}

console.log('\nC. Le message et get-pending-jobs');
{
  const m = R.messageCibleAbsente('leboncoin', '3303478608', 'autre_compte');
  ok(/est sur un autre compte Leboncoin que celui relevé en dernier sur ton ordinateur/.test(m) && /FillSell ne mélange jamais deux comptes/.test(m), 'le message dit l’autre compte', m);
  ok(/n'est plus dans ta liste au dernier relevé/.test(R.messageCibleAbsente('leboncoin', '1')), 'sans motif : le message d’avant');
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/select\("id, started_at, compte_plateforme"\)/.test(g) && /select\("listing_id, platform, vu_le, compte_plateforme"\)/.test(g)
    && /const msgA = messageCibleAbsente\(pfJ, cibleId, v\.motif\);/.test(g), 'get-pending-jobs lit le compte du relevé, des annonces et passe le motif');
}

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
