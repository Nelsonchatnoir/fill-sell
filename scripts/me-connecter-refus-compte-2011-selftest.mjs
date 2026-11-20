// VERROU (20/11/2026 nuit, ordre de Nico — cliente Cloud 35ab6f0f) : QUAND UNE PLATEFORME REFUSE LE COMPTE, « ME
// CONNECTER » S'OUVRE DE LUI-MÊME DANS L'APP (iPhone, Android, web), UNE FOIS PAR REFUS ET PAR APPAREIL, SANS LECTURE EN BOUCLE.
// Le cas : Beebs refusait son compte au clic « Mettre en vente » ; le coffre disait Beebs connectée, donc l'écran ne
// s'ouvrait jamais seul (ouvrirConnexionToutSeul : « toutes connectées »). Rouge sur 9459cd0, vert après.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const verifier = (c, m, d = '') => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 200)}` : ''}`); } };
const C = await import('../src/cloud/connexionsCloud.js').catch((e) => ({ erreur: e }));
verifier(typeof C.refusCompteAOuvrir === 'function', 'refusCompteAOuvrir existe (règle pure, src/cloud/connexionsCloud.js)', C.erreur?.message);
if (typeof C.refusCompteAOuvrir === 'function') {
  const T = Date.parse('2026-11-20T00:30:00Z');
  const lignes = [
    { platform: 'beebs', rc: { le: '2026-11-19T23:39:32.705Z' } },
    { platform: 'beebs', rc: { le: '2026-11-20T00:16:56.139Z' } },
    { platform: 'leboncoin', rc: { le: '2026-11-18T10:00:00Z' } },
    { platform: 'beebs', rc: null }, null,
  ];
  const r = C.refusCompteAOuvrir(lignes, { maintenant: T });
  verifier(r?.plateforme === 'beebs' && r?.le === '2026-11-20T00:16:56.139Z', 'rejeu 35ab6f0f : « Me connecter » s\'ouvre pour Beebs, sur le refus le plus récent', JSON.stringify(r));
  verifier(C.refusCompteAOuvrir(lignes, { vus: { beebs: '2026-11-20T00:16:56.139Z' }, maintenant: T }) === null, 'déjà ouvert pour ce refus sur cet appareil : rien ne se rouvre');
  verifier(C.refusCompteAOuvrir(lignes, { vus: { beebs: '2026-11-19T23:39:32.705Z' }, maintenant: T })?.le === '2026-11-20T00:16:56.139Z', 'un refus PLUS RÉCENT que le dernier ouvert : l\'écran se rouvre');
  verifier(C.refusCompteAOuvrir([{ platform: 'leboncoin', rc: { le: '2026-11-18T10:00:00Z' } }], { maintenant: T }) === null, 'un refus de plus de 24 h n\'ouvre plus rien');
  verifier(C.refusCompteAOuvrir(undefined) === null && C.refusCompteAOuvrir([{ platform: 'beebs', rc: { le: 'x' } }]) === null, 'rien de lisible : rien ne s\'ouvre');
}
const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8').replace(/\r\n/g, '\n');
const i = app.indexOf('UNE PLATEFORME QUI REFUSE LE COMPTE OUVRE « ME CONNECTER »');
const bloc = i > 0 ? app.slice(i, app.indexOf('},[user?.id,porteCx,clientCloud,meConnecterOuvert,showOnboardingFlow]);', i)) : '';
verifier(i > 0 && bloc.includes("refusCxLuRef.current=true;") && bloc.includes("if(!user?.id||!porteCx||!clientCloud||meConnecterOuvert||showOnboardingFlow||refusCxLuRef.current)return;"),
  'App.jsx : une seule lecture par ouverture de l\'app, client du Cloud seulement, jamais par-dessus le parcours d\'entrée');
verifier(!/setInterval|setTimeout/.test(bloc), '… jamais de relecture en boucle');
verifier(bloc.includes(".not('platform_fields->refus_compte','is',null)") && bloc.includes(".in('status',['pending','needs_user'])") && bloc.includes('.limit(50)'),
  '… lecture bornée des seules tâches ouvertes marquées refus_compte');
verifier(bloc.includes('fs_cloud_cx_refus_${user.id}') && bloc.includes("ouvrirMeConnecter('refus_compte')") && bloc.includes("setCxOrigine('refus_compte')"),
  '… mémoire par appareil, ouverture par la porte tracée (ouvrirMeConnecter)');
verifier(app.includes("choisies={cxOrigine&&cxOrigine!=='refus_compte'&&cxCloud.lu?"), '… toutes les plateformes montrées (la refusée n\'est jamais cachée)');

console.log(ko ? `✗ me-connecter-refus-compte-2011 : ${ok}/${ok + ko}` : `✓ me-connecter-refus-compte-2011 : ${ok}/${ok}`);
process.exit(ko ? 1 : 0);
