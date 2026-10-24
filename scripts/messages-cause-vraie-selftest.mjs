// selftest:messages-cause-vraie — (15/10, lot C) Chaque message dit la VRAIE
// cause et le bon geste ; aucune étiquette anti-robot sur une simple
// déconnexion ; aucun job qui tourne sur un compte Vinted restreint.
// Cas réels du 14-15/10 :
//   · carhoa : relevé Vinted de 01:32 « [cause403] session_absente » (aucun
//     cookie de connexion), 17 republications passées à 07:45 en « Vinted
//     bloque tes actions depuis plusieurs heures » (deux refus à 3 min d'écart,
//     puis ordinateur éteint) ;
//   · Hassan Said : publication Vinted refusée 400 validation_error « Le titre
//     contient trop de symboles d'affilée », dite « On ne sait pas encore
//     pourquoi » et « ton annonce n'a pas été touchée » (sur une publication) ;
//   · Kossiwa : « ton annonce est intacte » sur une PUBLICATION ; compte
//     restreint jusqu'au 18/10, 10 ouvertures du formulaire avant l'arrêt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const P = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/pas-de-rouge.js')).href);
const M = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/mur-geste.js')).href);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

console.log('1. Hassan Said : Vinted refuse le TITRE');
const BRUT_HASSAN = "Vinted a refusé la publication : Le titre contient trop de symboles d'affilée — l'annonce n'a PAS été créée. Champ exigé par Vinted : Titre. À faire : renseigne « Titre » dans la copie Vinted de l'app, puis relance la publication. [sonde réseau : /api/v2/item_upload/items → HTTP 400 · prix ENVOYÉ = 25 · réponse : {\"code\":99,\"message\":\"Erreurs trouvées\",\"message_code\":\"validation_error\",\"errors\":[{\"field\":\"title\",\"value\":\"Le titre contient trop de symboles d'affilée\"}],\"payload\":{}}]";
{
  const o = P.classerEchec({ platform: 'vinted', action: 'publish', brut: BRUT_HASSAN, essais: 1, pf: {}, reprises: 3 });
  ok(o.motif === 'vinted_titre_refuse' && o.statut === 'needs_user', 'cause connue et déterministe : à la personne, jamais une reprise à l\'identique');
  ok(o.message.includes('« Le titre contient trop de symboles d\'affilée »') && o.message.includes('Rien n\'a été publié.'), 'la phrase de Vinted, et « rien n\'a été publié » (pas « ton annonce n\'a pas été touchée »)');
  ok(!/on ne sait pas/i.test(o.message), 'plus jamais « on ne sait pas encore pourquoi »');
  ok(o.champ?.field_key === 'title' && o.champ?.target?.key === 'titre_saisi' && o.pf?.titre_refuse?.motif, 'la question « Titre » (✋ Compléter) et le marqueur du titre refusé');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/if \(!pf\.titre_refuse \|\| titreVide\(pf\[CLE_TITRE_SAISI\]\) \|\| !titreRecevable\(pf\[CLE_TITRE_SAISI\]\)\) continue;/.test(gpj) && /j\.title = nouveau;/.test(gpj), 'serveur : la réponse REMPLACE le titre refusé du job (jamais resservi tel quel) — sauf une réponse générique (24/10, B4)');
  const r = P.classerEchec({ platform: 'vinted', action: 'republish', brut: BRUT_HASSAN.replace('la publication', 'la republication'), essais: 1, pf: { republish_step: 'deleted' }, reprises: 0 });
  ok(r.message.includes('déjà retirée, sera remise en ligne'), 'republication dont l\'annonce est retirée : on ne dit pas « intacte »');
}

console.log('2. Kossiwa : la phrase suit l\'action ; la restriction vaut pour le compte');
{
  // (24/10) La restriction de Kossiwa (« jusqu'au 18/10/2026 ») était écrite en dur : passé le 18/10,
  // classerEchec la jugeait — à juste titre — terminée (compte_restreint_echu), et ce contrôle virait
  // au rouge sans qu'aucune ligne de code n'ait changé. La date est désormais toujours à venir (J+5,
  // heure de Paris), et la restriction échue a son propre contrôle juste après.
  const jjmmaaaa = (decalageJours) => {
    const d = new Date(Date.now() + decalageJours * 86_400_000);
    const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
      .formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year}`;
  };
  const pfK = { last_diagnostic: { signal: 'selling_restriction', titre: `Compte restreint jusqu'au ${jjmmaaaa(5)}`, corps: '' } };
  const k = P.classerEchec({ platform: 'vinted', action: 'publish', brut: 'RESTRICTION VINTED (/selling-restriction)', essais: 5, pf: pfK, reprises: 0 });
  ok(k.motif === 'compte_restreint' && k.message.includes('Rien n\'a été publié.') && !k.message.includes('intacte'), 'publication sur compte restreint : « rien n\'a été publié », jamais « ton annonce est intacte »');
  const kr = P.classerEchec({ platform: 'vinted', action: 'republish', brut: 'RESTRICTION VINTED', essais: 5, pf: pfK, reprises: 0 });
  ok(kr.message.includes('ton annonce est intacte'), 'republication avant retrait : « ton annonce est intacte » reste vrai');
  const pfEchue = { last_diagnostic: { signal: 'selling_restriction', titre: `Compte restreint jusqu'au ${jjmmaaaa(-2)}`, corps: '' } };
  const ke = P.classerEchec({ platform: 'vinted', action: 'publish', brut: 'RESTRICTION VINTED (/selling-restriction)', essais: 5, pf: pfEchue, reprises: 0 });
  ok(ke.motif === 'compte_restreint_echu' && ke.statut === 'pending' && ke.message.includes('repart toute seule') && !ke.message.includes('intacte'),
    'restriction échue : la publication repart seule (jamais « intacte », jamais une attente sans fin)');
  const i1 = P.classerEchec({ platform: 'beebs', action: 'publish', brut: 'jamais vu', essais: 1, pf: {}, reprises: 0 });
  ok(i1.message.includes('Rien n\'a été publié.') && !i1.message.includes('touchée'), 'motif inconnu sur une publication : « rien n\'a été publié »');
  ok(M.messageConnexionRequise('beebs', { publication: true }).includes('Rien n\'a été publié'), 'mur « Connexion Beebs requise » d\'une publication : plus « Ton annonce est intacte »');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/VINTED A RESTREINT LE COMPTE : AUCUNE/.test(gpj) && /restrictionVinted\(pfRx\(j\)\)/.test(gpj) && /messageRestrictionVinted\(restriction, String\(j\.action\), pf\)/.test(gpj),
    'serveur : dès qu\'un job a lu la restriction, aucune publication/republication Vinted du compte n\'est servie avant la fin');
  ok(/j\.action === "publish" \|\| j\.action === "republish"\)\);\n\s*if \(retenus\.length\)/.test(gpj), 'les retraits (articles vendus) restent servis');
}

console.log('3. carhoa : une déconnexion n\'est jamais un anti-robot');
{
  const runsCarhoa = [{ status: 'failed', erreur: "[cause403] session_absente — aucune session Vinted dans ce navigateur (HTTP 403 sur la sonde)", started_at: '2026-10-14T23:32:00Z', finished_at: '2026-10-14T23:33:10Z' }];
  const a = M.connexionVintedAbsenteProuvee({ runs: runsCarhoa, dernierSucces: Date.parse('2026-10-02T10:00:00Z'), sessions: { vinted: null }, maintenant: Date.parse('2026-10-15T05:45:00Z') });
  ok(a.prouvee === true, 'carhoa : cookie de connexion absent au dernier relevé, rien de réussi depuis → connexion PROUVÉE absente');
  ok(!M.connexionVintedAbsenteProuvee({ runs: runsCarhoa, dernierSucces: Date.parse('2026-10-15T00:10:00Z'), maintenant: Date.parse('2026-10-15T05:45:00Z') }).prouvee, 'un succès Vinted après le relevé → pas de preuve');
  ok(!M.connexionVintedAbsenteProuvee({ runs: runsCarhoa, sessions: { vinted: true, checked_at: '2026-10-15T01:00:00Z' }, maintenant: Date.parse('2026-10-15T05:45:00Z') }).prouvee, 'la sonde revoit Vinted répondre après → pas de preuve');
  ok(!M.connexionVintedAbsenteProuvee({ runs: runsCarhoa, maintenant: Date.parse('2026-10-16T05:45:00Z') }).prouvee, 'relevé de plus de 24 h → pas de preuve');
  ok(!M.connexionVintedAbsenteProuvee({ runs: [{ status: 'failed', erreur: '[retry403] protection anti-robot', started_at: '2026-10-14T23:32:00Z' }], maintenant: Date.parse('2026-10-15T05:45:00Z') }).prouvee, 'un vrai 403 anti-robot (session présente) n\'est jamais requalifié');
  const pf = { attente_antirobot_compte: { depuis: '2026-10-14T23:42:58Z' }, blocage_antirobot: { depuis: 'x' }, republish_step: 'a_capturer' };
  const { pf: pfC, message } = M.murConnexionVintedProuve({ action: 'republish' }, pf, a.le, 'test');
  ok(/^(Connexion|Reconnexion) \S+ requise/.test(message) && message.startsWith('Connexion Vinted requise'), '« Connexion Vinted requise » : le début de phrase que relancer_jobs_connexion et l\'app (« Me connecter ») reconnaissent');
  ok(!('attente_antirobot_compte' in pfC) && !('blocage_antirobot' in pfC) && pfC.antirobot_requalifie?.preuve === 'cause403_session_absente' && pfC.needs_user_source === 'connexion',
    'marqueurs anti-robot mis de côté (sinon relancer_jobs_connexion ne relance jamais) ; geste = connexion');
  ok(!/anti-?robot|bloque tes actions/i.test(message), 'aucun mot « anti-robot » ni « bloque tes actions »');
  const m6 = M.messagePauseVintedGeste({ depuis: '2026-10-14T23:42:58Z' });
  ok(!/plusieurs heures/.test(m6) && /depuis le 15\/10 à 01:42/.test(m6), 'vrai anti-robot > 6 h : la date du premier refus, plus « depuis plusieurs heures »');
  const hw = lire('supabase/functions/handler-watch/index.ts');
  ok((hw.match(/preuvesConnexionVintedAbsente\(supabase,/g) ?? []).length === 2 && /MUR « ANTI-ROBOT » DÉJÀ POSÉ SUR UNE CONNEXION/.test(hw), 'chien de garde : la règle des 6 h ET la requalification des murs déjà posés');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  // (18/10, lot 5) La pause des LECTURES de sa boutique (sonde à 200) a son propre message ; la pause du
  // compte garde « Connexion Vinted requise » quand l'absence de connexion est prouvée.
  ok(/const msgPause = lecturesSeules \? ANTIROBOT_LECTURES_MSG : absenceAr\.prouvee \? PAUSE_CONNEXION_MSG : ANTIROBOT_COMPTE_MSG;/.test(gpj) && /murConnexionVintedProuve\(j, pf, absenceAr\.le, "get-pending-jobs"\)/.test(gpj),
    'file des jobs : la pause du compte dit « Connexion Vinted requise » quand c\'est prouvé, et passe à la connexion au-delà de 6 h');
}

console.log(`\n✓ messages-cause-vraie : ${n} contrôles verts`);
