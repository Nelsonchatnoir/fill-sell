// (20/11/2026, retrait Beebs e59ce552) CHAQUE MESSAGE NOMME LA PLATEFORME RÉELLE DU JOB, JAMAIS UNE AUTRE.
// Un retrait Beebs en vérification recevait le signal (delayed_publication) et le texte de Vinted (extension :
// processDeleteJob servait toutes les plateformes par attendreFinVerificationVinted), puis update-job-status le
// réécrivait « …supprime-la toi-même dans l'appli Vinted ». Verrous : le module pur, le serveur, l'extension, et
// tous les messages du même gabarit dans les content scripts.
import fs from 'node:fs';
import * as V from '../supabase/functions/_shared/verification-par-plateforme.js';

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };
const lire = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

console.log('1. Le module (pur)');
const texteVinted = "Vinted vérifie encore cette annonce : elle est masquée aux acheteurs, et Vinted refuse de la retirer tant que la vérification dure.";
ok(V.plateformeNommeeVerification(texteVinted) === 'vinted' && V.plateformeNommeeVerification('Beebs vérifie encore cette annonce : …') === 'beebs'
  && V.plateformeNommeeVerification('autre chose') === null, 'la plateforme nommée par le gabarit');
const pf = { retrait_en_attente_verification: { depuis: '2026-11-20T08:56:00.359Z', essais: 1, signal: "page de l'annonce : item_alert_type = delayed_publication" }, x: 1 };
const c = V.corrigerVerificationAutrePlateforme({ texte: texteVinted, plateforme: 'beebs', pf });
ok(c && /^Beebs vérifie encore cette annonce/.test(c.message) && !/Vinted/.test(c.message), 'job Beebs + texte Vinted → message Beebs, aucun « Vinted »', c?.message);
ok(c?.pf?.retrait_en_attente_verification?.signal === "annonce en vérification chez Beebs (lue par l'extension)" && c.pf.x === 1
  && c.pf.retrait_en_attente_verification.depuis === pf.retrait_en_attente_verification.depuis
  && /delayed_publication/.test(c.pf.retrait_en_attente_verification.signal_corrige?.avant ?? ''), 'le signal de Vinted remplacé par celui de Beebs, le reste gardé, l\'ancien noté');
ok(V.corrigerVerificationAutrePlateforme({ texte: texteVinted, plateforme: 'vinted', pf }) === null, 'job Vinted + texte Vinted : rien à corriger');
ok(V.corrigerVerificationAutrePlateforme({ texte: 'Beebs vérifie encore cette annonce', plateforme: 'beebs', pf }) === null, 'job Beebs + texte Beebs : rien');
ok(V.corrigerVerificationAutrePlateforme({ texte: 'Retrait non confirmé', plateforme: 'beebs', pf }) === null, 'hors gabarit : rien');
const sansPf = V.corrigerVerificationAutrePlateforme({ texte: texteVinted, plateforme: 'leboncoin', pf: null });
ok(sansPf && sansPf.pf === null && /^Leboncoin vérifie encore cette annonce/.test(sansPf.message), 'sans champs d\'entrée : seul le texte change (jamais de champs fabriqués) ; Leboncoin nommé');
for (const p of Object.keys(V.NOMS_PLATEFORMES)) {
  const m = V.messageVerificationRetrait(p);
  const autres = Object.entries(V.NOMS_PLATEFORMES).filter(([k]) => k !== p).map(([, nom]) => nom);
  ok(m.startsWith(V.NOMS_PLATEFORMES[p]) && !autres.some((nom) => m.includes(nom)), `message ${p} : nomme ${V.NOMS_PLATEFORMES[p]}, aucune autre plateforme`);
}

console.log('2. Le serveur (update-job-status)');
const ujs = lire('supabase/functions/update-job-status/index.ts');
ok(/import \{ plateformeNommeeVerification, corrigerVerificationAutrePlateforme \} from "\.\.\/_shared\/verification-par-plateforme\.js";/.test(ujs), 'importe la règle');
const iCorr = ujs.indexOf('corrigerVerificationAutrePlateforme({ texte: texteV');
const iVinted = ujs.indexOf('} else if (/^Vinted vérifie encore cette annonce/.test(texteV) && (plateformeJobV === null || plateformeJobV === "vinted")) {');
ok(iCorr > 0 && iVinted > iCorr, 'la plateforme réelle d\'abord ; la réécriture « appli Vinted » seulement sur un job Vinted');
ok(!/\n      if \(\/\^Vinted vérifie encore cette annonce\/\.test\(texteV\)\) \{/.test(ujs), 'plus aucune réécriture Vinted sans regarder la plateforme du job');

console.log('3. L\'extension (processDeleteJob)');
const bg = lire('chrome-extension/background.js');
const appels = [...bg.matchAll(/await attendreFinVerificationVinted\(/g)].length;
ok(appels === 1 && /if \(result\.enVerification && job\.platform === "vinted"\) \{\n\s+await attendreFinVerificationVinted\(/.test(bg), 'l\'attente Vinted ne sert que Vinted (un seul appel, gardé)');
ok(/async function attendreFinVerificationVinted\(accessToken, job, errorMsg\) \{\n\s+if \(job\?\.platform !== "vinted"\) return;/.test(bg), 'et la fonction elle-même refuse une autre plateforme');
const iBeebs = bg.indexOf('if (result.enVerification && job.platform === "beebs" && job.action === "delete") {');
const iV = bg.indexOf('if (result.enVerification && job.platform === "vinted") {');
ok(iBeebs > 0 && iV > iBeebs && /return await attendreFinVerificationBeebs\(accessToken, job, result\);/.test(bg.slice(iBeebs, iV)), 'un retrait Beebs en vérification prend SON attente, avant le bloc Vinted');
ok(/async function attendreFinVerificationBeebs\(accessToken, job, result\) \{/.test(bg), 'attendreFinVerificationBeebs existe (une seule règle pour les deux chemins)');

console.log('4. Le même gabarit partout : chaque content script ne nomme que SA plateforme');
for (const [fichier, nom] of [['vinted', 'Vinted'], ['beebs', 'Beebs'], ['leboncoin', 'Leboncoin'], ['depop', 'Depop']]) {
  const chemin = `chrome-extension/content-scripts/${fichier}.js`;
  if (!fs.existsSync(chemin)) continue;
  const src = lire(chemin).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const vus = [...src.matchAll(/(Vinted|Beebs|Leboncoin|Depop|eBay|Opla) vérifie encore/g)].map((m) => m[1]);
  ok(vus.every((x) => x === nom), `${fichier}.js : « X vérifie encore » ne nomme que ${nom}`, vus.join(','));
}

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ verification-par-plateforme : ${n}/${n}`);
process.exit(ko ? 1 : 0);
