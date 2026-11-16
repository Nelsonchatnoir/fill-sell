// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 5c DU LOT DU 16/11/2026 MIDI — LE CRÉNEAU OÙ L'ORDINATEUR EST TOUJOURS ÉTEINT SE DIT
//     npm run selftest:creneau-hors-presence
// ═══════════════════════════════════════════════════════════════════════════
// Constat (contact.grizstyle) : créneau 18:30–19:45, ordinateur allumé surtout de 20:30 à 00:30 ; l'app ne disait qu'un
// « dernier créneau manqué », jamais que c'était chaque soir, ni les heures où l'ordinateur est allumé, ni où le changer.
// Ce test prouve :
//   A. 3 créneaux sur les 5 derniers passés Chrome fermé → alerte ; 2 sur 5, ou des créneaux manqués pour une autre
//      raison, ou une autre plateforme → rien ;
//   B. les heures allumées se lisent dans les relevés (heure de Paris), une soirée qui passe minuit reste une plage
//      (20:30 → 00:30) ; moins de 4 jours vus → rien d'affirmé ;
//   C. l'avis dit le nombre, les heures et « Changer mon créneau » ; jamais une heure inventée ;
//   D. les Réglages de la republication le montrent, lisent les créneaux et les relevés UNE fois (aucune boucle) et le
//      bouton ouvre le réglage du créneau ; la cadence n'est jamais écrite par cet avis.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let M = null;
try { M = await import(new URL('../src/utils/creneauHorsPresence.js', import.meta.url).href); } catch (e) { console.log(`  (module absent : ${e?.message})`); }

const cr = (jour, statut, absent = true, platform = 'vinted') => ({ platform, statut, debut: `2026-11-${jour}T17:30:00Z`, extension_vue: !absent, sautes: absent && statut === 'manque' ? { _extension_absente: { n: 1 } } : {} });

console.log('\nA. Les 5 derniers créneaux');
{
  const f = M?.creneauxSansOrdinateur;
  const grizstyle = [cr(11, 'manque'), cr(12, 'manque'), cr(13, 'manque'), cr(14, 'manque'), cr(15, 'fait', false), cr(10, 'manque')];
  ok(f?.(grizstyle, 'vinted')?.alerte === true && f?.(grizstyle, 'vinted')?.manques === 4 && f?.(grizstyle, 'vinted')?.sur === 5, '4 sur 5 Chrome fermé → alerte', JSON.stringify(f?.(grizstyle, 'vinted')));
  ok(f?.([cr(11, 'manque'), cr(12, 'manque'), cr(13, 'fait', false), cr(14, 'fait', false), cr(15, 'fait', false)], 'vinted')?.alerte === false, '2 sur 5 → rien');
  ok(f?.([cr(11, 'manque', false), cr(12, 'manque', false), cr(13, 'manque', false), cr(14, 'fait', false), cr(15, 'fait', false)], 'vinted')?.alerte === false, 'manqués Chrome OUVERT (autre raison) → rien');
  ok(f?.(grizstyle, 'leboncoin')?.alerte === false, 'une autre plateforme → rien');
  ok(f?.([...grizstyle, { ...cr(16, 'en_cours'), statut: 'en_cours' }], 'vinted')?.alerte === true, 'le créneau en cours ne compte pas');
}

console.log('\nB. Les heures où l’ordinateur est allumé (relevés, heure de Paris)');
{
  const h = M?.heuresAllume;
  const soirs = [];
  for (const j of [11, 12, 13, 14, 15]) for (const hh of ['19:40', '20:30', '21:30', '22:30', '23:15']) soirs.push(`2026-11-${j}T${hh}:00Z`);
  for (const j of [12, 13, 14, 15, 16]) soirs.push(`2026-11-${j}T23:20:00Z`);
  const r = h?.(soirs);
  ok(r?.de === '20:45' && r?.a === '00:15', `soirées de 20:40 à 00:20 (Paris) → « entre ${r?.de} et ${r?.a} » (minuit franchi, une seule plage)`, JSON.stringify(r));
  ok(h?.(['2026-11-15T20:00:00Z', '2026-11-15T21:00:00Z', '2026-11-14T20:00:00Z']) === null, 'moins de 4 jours vus → rien d’affirmé');
}

console.log('\nC. L’avis');
{
  const a = M?.avisCreneauHorsPresence?.({ platform: 'vinted', compte: { alerte: true, manques: 4, sur: 5 }, heures: { de: '20:30', a: '00:30' } });
  ok(a?.titre === 'Ton ordinateur est éteint pendant ton créneau Vinted' && /Sur tes 5 derniers créneaux, 4 sont passés Chrome fermé : rien n'est parti\./.test(a?.corps ?? '')
    && /allumé le plus souvent entre 20:30 et 00:30/.test(a?.corps ?? '') && a?.bouton === 'Changer mon créneau', 'titre, nombre, heures, « Changer mon créneau »', JSON.stringify(a));
  const sans = M?.avisCreneauHorsPresence?.({ platform: 'vinted', compte: { alerte: true, manques: 3, sur: 5 }, heures: null });
  ok(sans && !/allumé le plus souvent/.test(sans.corps), 'heures inconnues : jamais une heure inventée');
  ok(M?.avisCreneauHorsPresence?.({ platform: 'vinted', compte: { alerte: false } }) === null, 'pas d’alerte → pas d’avis');
}

console.log('\nD. Les Réglages de la republication');
{
  const r = lire('src/components/RepublicationPlanifiee.jsx');
  ok(/avisCreneauHorsPresence\(/.test(r) && /from\('republish_creneaux'\)/.test(r) && /from\('vinted_sync_runs'\)/.test(r), 'les Réglages lisent créneaux et relevés et montrent l’avis');
  ok(/data-avis-hors-presence/.test(r) && /refCreneau\.current\?\.scrollIntoView/.test(r), '« Changer mon créneau » amène au réglage du créneau');
  ok(!/regler\([^)]*\)[^;]*horsPresence/.test(r), 'l’avis n’écrit jamais un réglage lui-même (la personne choisit)');
}

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
