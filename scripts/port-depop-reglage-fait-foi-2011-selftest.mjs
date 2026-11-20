// (20/11/2026, urgence de Nico — compte Business) LE RÉGLAGE DU VENDEUR FAIT FOI pour le port Depop : 336 annonces à
// 4,15 € pour un réglage à 5,99 € (le port hérité de l'ancien dépôt de la fiche passait devant le réglage). Verrous : le
// module pur, le serveur (get-pending-jobs), l'app (écran de publication, champs du job).
import fs from 'node:fs';
import { portDepopAServir, decisionPortDepop, SOURCE_PORT_SAISI_ARTICLE } from '../supabase/functions/_shared/port-depop.js';
import { champsDepop } from '../src/utils/depopPublication.js';

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };
const lire = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const job = (pf, action = 'publish') => ({ platform: 'depop', action, platform_fields: pf });

console.log('1. La règle (pure)');
const r = portDepopAServir(job({ depopPort: 4.15 }), 5.99);
ok(r.action === 'remplacer' && r.valeur === 5.99 && r.avant === 4.15, 'publication au port hérité 4,15 € → le réglage 5,99 €', JSON.stringify(r));
ok(portDepopAServir(job({ depopPort: '4,15' }, 'republish'), 5.99).action === 'remplacer', 'republication (port copié de l\'annonce d\'avant) → le réglage');
ok(portDepopAServir(job({ depopPort: 4.15, depop_port_source: 'defaut_reglages' }), 5.99).action === 'remplacer', 'ancien prix par défaut (réglage changé depuis) → le réglage du moment');
ok(portDepopAServir(job({ depopPort: 3.5, depop_port_source: SOURCE_PORT_SAISI_ARTICLE }), 5.99).action === 'rien', 'port saisi pour CET article par la personne : gardé');
ok(portDepopAServir(job({ depopPort: 5.99 }), 5.99).action === 'rien', 'déjà au réglage : rien');
ok(portDepopAServir(job({ depopPort: 4.15 }), null).action === 'rien', 'sans réglage : rien ne change');
ok(portDepopAServir(job({}), 5.99).action === 'rien' && decisionPortDepop(job({}), 5.99).action === 'poser', 'sans port : la décision d\'avant le pose (inchangée)');
ok(portDepopAServir({ platform: 'vinted', action: 'publish', platform_fields: { depopPort: 4.15 } }, 5.99).action === 'rien'
  && portDepopAServir(job({ depopPort: 4.15 }, 'delete'), 5.99).action === 'rien', 'seulement Depop, publication et republication');

console.log('2. Le serveur (get-pending-jobs)');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const iS = gpj.indexOf('const rS = portDepopAServir(j, await portDefaut());');
const iP = gpj.indexOf('if (pfJ["depopPort"] != null && String(pfJ["depopPort"]).trim() !== "") continue;');
ok(iS > 0 && iP > iS, 'le réglage est appliqué AVANT le « port déjà dit, on n\'y touche pas »');
ok(/depop_port_remplace: \{ avant: rS\.avant/.test(gpj) && /\.eq\("status", "pending"\)/.test(gpj.slice(iS, iP)), 'la trace de l\'ancien port, et seulement sur un job encore en file');

console.log('3. L\'app');
const lps = lire('src/components/ListingPreviewScreen.jsx');
ok(/depopPort: v, depop_port_source: "saisie_article"/.test(lps), 'la saisie de la personne est marquée « saisie_article »');
ok(/if \(actuel != null && \(portDepopSource === "saisie_article" \|\| actuel === defaut\)\) return;/.test(lps)
  && /depopPort: v, depop_port_source: "defaut_reglages"/.test(lps), 'un port hérité est remplacé par le réglage à l\'écran');
const c1 = champsDepop({ icon: 'robe', genre: 'femme', pf: { depopPort: '3,50', depop_port_source: 'saisie_article', etat: 'Très bon état' } }).champs;
const c2 = champsDepop({ icon: 'robe', genre: 'femme', pf: { depopPort: '4,15', etat: 'Très bon état' } }).champs;
ok(c1.depopPort === 3.5 && c1.depop_port_source === 'saisie_article' && c2.depopPort === 4.15 && !('depop_port_source' in c2),
  'les champs du job portent la marque de la saisie, et seulement elle');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ port-depop-reglage-fait-foi : ${n}/${n}`);
process.exit(ko ? 1 : 0);
