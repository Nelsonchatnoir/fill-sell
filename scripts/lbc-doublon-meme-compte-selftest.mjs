// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 8 DU LOT DU 16/11/2026 MIDI — REFUS DE MODÉRATION LEBONCOIN : NE PLUS RENVOYER CE QUI SERA REFUSÉ
//     npm run selftest:lbc-doublon-meme-compte
// ═══════════════════════════════════════════════════════════════════════════
// Constat (diagnostic du 16/11) : gjehly — Topps Anna #9 et Cruella #90 déposées 6 fois À L'IDENTIQUE, refusées 6 fois ;
// APRÈS la règle du 13/11, la copie est encore partie (14/11 06:46 et 06:56) : le juge ne comparait que la copie d'avant
// le service (brute), alors que la tâche refusée porte ce qui est PARTI (servie). ayadi007 — 4 refus « juste après dépôt »
// le 13/11 : à chaque fois la 2ᵉ annonce identique (mêmes photos, même texte) sur le MÊME compte Leboncoin. Rejoué sur le
// parc du 25/10 au 16/11 : 10 dépôts acceptés, tous avec leur jumelle sur un AUTRE compte ; 6 refusés, tous avec une
// jumelle sur le MÊME compte ; aucun accepté avec une jumelle sur le même compte. Le seuil de 2 (13/11) mélangeait les comptes.
// Ce test prouve :
//   A. R1 : la copie d'un refus d'avant la règle est retenue dès son PREMIER service (servie = ce qui a été refusé) ;
//   B. R2 : compte du dépôt connu → UNE jumelle en ligne sur ce compte retient ; une jumelle sur un autre compte ne compte
//      pas (même deux) ; compte inconnu → la règle d'avant (2) ;
//   C. get-pending-jobs lit le compte des annonces et le compte qui dépose (un seul compte relevé en 24 h, sinon inconnu).
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
const imp = async (rel) => { try { return await import(pathToFileURL(join(ROOT, rel)).href); } catch (e) { console.log(`  (${rel} : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };
const R = await imp('src/utils/relanceRefusLbc.js');
const E = await imp('src/utils/empreinteContenu.js');
const M = await imp('supabase/functions/_shared/lbc-memes-photos.js');
const fixtures = JSON.parse(fs.readFileSync(join(ROOT, 'scripts/fixtures/lbc-relance-identique-1311.json'), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

console.log('\nA. R1 — la copie d’un refus, à son premier service');
{
  const refuse = fixtures['137ea70c'];
  const copie = clone(fixtures['5adbc272']);
  copie.status = 'pending'; copie.platform_listing_id = null; copie.published_at = null;
  // Une copie NEUVE (13/11, « Relancer » = une nouvelle tâche) : aucune marque de refus à elle — seule la tâche refusée en porte.
  for (const k of ['depot_jamais_en_ligne', 'jamais_en_ligne', 'relance_apres_depot_mort', 'lbc_envois']) delete copie.platform_fields[k];
  copie.id = 'copie-673503a3';
  const servieRefusee = E?.empreinteEnvoiLbcDuJob?.(refuse);
  // 673503a3 le 14/11 06:46 : la copie d'avant le service différait (brute), ce qui partait = le dépôt refusé (servie).
  const cand = { job: copie, servie: servieRefusee, brute: 'l1:9e620c1bfa893676', texteInchange: true };
  const r = R?.refusLbcIdentique?.(cand, [{ job: refuse, texteInchange: true }]);
  ok(servieRefusee && r?.refuse === refuse.id && r?.par === 'contenu', 'retenue : ce qui partirait = ce qui a été refusé (avant : null, la copie partait)', JSON.stringify(r));
  const r2 = R?.refusLbcIdentique?.({ ...cand, servie: 'l1:0000000000000000' }, [{ job: refuse, texteInchange: true }]);
  ok(r2 === null, 'contenu réellement changé (ni la copie ni ce qui partirait ne sont le refus) : elle part');
}

console.log('\nB. R2 — le compte Leboncoin qui dépose');
{
  const photos = [{ url: 'https://x/a.jpg' }, { url: 'https://x/b.jpg' }];
  const cand = { id: 'c1', platform: 'leboncoin', action: 'publish', status: 'pending', inventaire_id: 'F1', photos };
  const occ = (n, compte) => ({ cle: `o${n}`, numero: `33${n}`, fiche: `F${n + 1}`, etat: 'en_ligne', photos, compte });
  const juge = (occupants, compteDepot) => M?.jugerMemesPhotosLbc?.([cand], { occupants, compteDepot })?.get('c1') ?? null;
  ok(juge([occ(1, 'A')], 'A')?.retenir === true, 'une jumelle en ligne sur LE MÊME compte : retenue (ayadi 76d55115, cc81c36a, e5337ed2)');
  ok(juge([occ(1, 'B')], 'A') === null && juge([occ(1, 'B'), occ(2, 'B')], 'A') === null, 'jumelles sur l’AUTRE compte (une ou deux) : la publication part (les 10 acceptées du parc)');
  ok(juge([occ(1, 'A')], null) === null && juge([occ(1, null), occ(2, null)], null)?.retenir === true, 'compte du dépôt inconnu : la règle d’avant (une jumelle passe, deux retiennent)');
  ok(juge([occ(1, null)], 'A')?.retenir === true, 'jumelle dont le compte est inconnu : elle compte (prudence)');
}

console.log('\nC. get-pending-jobs');
{
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/fiche_supprimee_le, compte_plateforme"\)/.test(g) && /compte: typeof a\.compte_plateforme === "string" \? a\.compte_plateforme : null/.test(g), 'les annonces jumelles portent leur compte Leboncoin');
  ok(/compteDepot = comptes\.size === 1 \? \[\.\.\.comptes\]\[0\] : null;/.test(g) && /retraitEngage\(j\), compteDepot \}\);/.test(g), 'le compte qui dépose : un seul compte relevé en 24 h, sinon inconnu');
}

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
