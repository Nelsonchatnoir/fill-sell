// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT BEEBS SORTI DE LA VÉRIFICATION SANS ÊTRE MIS EN LIGNE (25/10, XEWER)
// `npm run selftest:beebs-sortie-verification`
// ═══════════════════════════════════════════════════════════════════════════
// XEWER : 74 dépôts Beebs depuis le 01/10, 8 vus en ligne ; les autres sortent
// de « en vérification » en quelques minutes et restent « publiés » (11 sans
// lien, 6a38d0b6 republication depuis le 09/10). La règle
// (_shared/beebs-sortie-verification.js), en deux temps parce que MESURÉ le
// 25/10 (31 jours, 1 452 dépôts lus) : 18 dépôts sortis de la vérification sans
// être en ligne le sont devenus 48 à 126 h plus tard — une règle « 30 min » en
// aurait déclaré 17 refusés à tort ; à 7 jours : 0 sur 1 293 dépôts vus en ligne.
//   1. SORTIE constatée : marqueur pas_encore_visible (l'app : « Beebs vérifie ») ;
//   2. REFUS prouvé à 7 jours : lecture qui voit TOUT « en ligne », sans elle.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const M = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/beebs-sortie-verification.js')).href);
let ko = 0, n = 0;
const ok = (c, quoi, detail = '') => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

// Le compte de XEWER le 25/10 : 32 annonces en ligne (toutes lues), et la rafale de 05:52 → 06:02.
const EN_LIGNE = Array.from({ length: 32 }, (_, k) => String(34040000 + k));
const lecture = (lu_le, verif, enLigne = EN_LIGNE, annoncees = enLigne.length) => ({ ok: true, lu_le, ids: [...verif, ...enLigne],
  pages: [{ page: 'en_verification', ok: true, ids: verif, n: verif.length, cartes: verif.length }, { page: 'en_ligne', ok: true, ids: enLigne, n: enLigne.length, annoncees }] });
const depot = (id, num, avant, apres, extra = {}) => ({ id, platform: 'beebs', action: 'publish', status: 'published', price: '6',
  platform_listing_id: num, listing_url: `https://www.beebs.app/fr/p/${num}`, published_at: apres.lu_le, created_at: '2026-10-20T10:58:00Z', vu_en_ligne_le: null,
  platform_fields: { preuve_identifiant_beebs: { id: num, avant, apres } }, ...extra });
const J29 = depot('935e5f12', '34229929', lecture('2026-10-25T04:57:56Z', ['34229927', '34229926']), lecture('2026-10-25T04:58:12Z', ['34229929', '34229927', '34229926']));
const J30 = depot('344f0752', '34229930', lecture('2026-10-25T04:59:53Z', ['34229929']), lecture('2026-10-25T04:59:56Z', ['34229930', '34229929']));
const J31 = depot('9a7cb6cc', '34229931', lecture('2026-10-25T05:01:10Z', ['34229930']), lecture('2026-10-25T05:01:14Z', ['34229931', '34229930']));
const J33 = depot('3838b513', '34229933', lecture('2026-10-25T05:02:26Z', ['34229931', '34229930']), lecture('2026-10-25T05:02:30Z', ['34229933', '34229931', '34229930']));
const rafale = [J29, J30, J31, J33];
const releve = (started_at, { page = 32, index = 32, statut = 'done', tot = 32, vus = tot } = {}) => ({ status: statut, started_at, finished_at: started_at.replace(/:00Z$/, ':30Z'),
  items_vus: vus, total_entries: tot, erreur: `[défilement] page : ${page} annonce(s) affichée(s) (1 défilement(s), la page n'en affichait pas plus) | page : 0 annonce(s) affichée(s) (1 défilement(s)) | index public Beebs : ${index} annonce(s) en ligne, ${index} lue(s) au total` });

console.log('1. Les lectures « Mes annonces » des dépôts');
const ls = M.lecturesDesDepotsBeebs(rafale);
ok(ls.length === 8 && ls[0].le === '2026-10-25T04:57:56.000Z' && ls.every((l, i) => !i || l.le >= ls[i - 1].le), 'avant et après de chaque dépôt, dans l’ordre du temps');
ok(ls.every((l) => l.verif instanceof Set && l.enLigne instanceof Set && l.enLigneComplete === true), '« en vérification » lue en entier, « en ligne » lue en entier (32/32)');
const tronquee = M.lecturesDesDepotsBeebs([depot('x', '34229999', lecture('2026-10-25T04:00:00Z', [], EN_LIGNE, 97), lecture('2026-10-25T04:00:05Z', ['34229999'], EN_LIGNE, 97))]);
ok(tronquee.every((l) => !l.enLigneComplete), 'compte de 97 annonces : « en ligne » tronquée → jamais une lecture complète');

console.log('\n2. Le relevé qui voit TOUT « en ligne »');
ok(M.releveVoitToutEnLigne(releve('2026-10-25T10:50:00Z')), 'page 32 = index 32 : la page a tout montré');
ok(!M.releveVoitToutEnLigne(releve('2026-10-25T10:50:00Z', { page: 60, index: 97, tot: 97 })), 'page 60 < index 97 : l’index (en retard sur les annonces neuves) ne suffit pas');
ok(M.releveVoitToutEnLigne({ status: 'done', started_at: '2026-10-25T10:00:00Z', finished_at: '2026-10-25T10:00:30Z', items_vus: 16, total_entries: 16,
  erreur: '[défilement] page : 0 annonce(s) affichée(s) | index public Beebs : 16 annonce(s) en ligne, 16 lue(s) au total | [flux] en ligne 16/16, en vérification 0, index 16 → liste lue par le flux' }), 'flux « en ligne 16/16 » : lu en entier');
ok(!M.releveVoitToutEnLigne(releve('2026-10-25T10:50:00Z', { statut: 'failed' })) && !M.releveVoitToutEnLigne(releve('2026-10-25T10:50:00Z', { vus: 20 })), 'relevé raté ou incomplet : jamais');

console.log('\n3. Le verdict');
const t = (iso) => Date.parse(iso);
const v1 = M.jugerSortieVerificationBeebs(J29, { lectures: ls, releves: [], lignes: [], maintenant: t('2026-10-25T06:00:00Z') });
ok(v1?.verdict === 'sortie' && v1.derniere_vue === '2026-10-25T04:59:56.000Z' && v1.sortie_constatee_le === '2026-10-25T05:01:10.000Z',
  '34229929 : vu en vérification jusqu’à 04:59:56, absent à 05:01:10 → SORTIE constatée, rien de conclu', JSON.stringify(v1));
const v2 = M.jugerSortieVerificationBeebs(J29, { lectures: ls, releves: [releve('2026-10-25T10:50:00Z'), releve('2026-10-28T10:50:00Z')], lignes: [], maintenant: t('2026-10-29T12:00:00Z') });
ok(v2?.verdict === 'sortie', 'relevés complets à +6 h et +3 jours sans elle : toujours « sortie » (jusqu’à 126 h d’invisibilité mesurées)');
const v3 = M.jugerSortieVerificationBeebs(J29, { lectures: ls, releves: [releve('2026-10-25T10:50:00Z'), releve('2026-11-01T06:00:00Z')], lignes: [], maintenant: t('2026-11-01T07:00:00Z') });
ok(v3?.verdict === 'refus' && v3.confirmee_par === 'releve' && v3.confirmee_le === '2026-11-01T06:00:00.000Z', '7 jours après la dernière vue, un relevé qui voit tout « en ligne » sans elle → REFUS prouvé', JSON.stringify(v3));
const v4 = M.jugerSortieVerificationBeebs(J29, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z', { page: 60, index: 97, tot: 97 })], lignes: [], maintenant: t('2026-11-01T07:00:00Z') });
ok(v4?.verdict === 'sortie', 'gros compte (page 60 < index 97) : jamais de refus sur l’index seul');
ok(M.jugerSortieVerificationBeebs(J33, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z')], lignes: [], maintenant: t('2026-11-01T07:00:00Z') }) === null,
  '34229933 (dernier de la rafale) : aucune lecture « en vérification » après lui → rien (il est peut-être encore en vérification)');
const vuEnLigne = [...ls, { le: '2026-10-26T08:00:00.000Z', job_id: 'y', moment: 'avant', verif: new Set(), enLigne: new Set([...EN_LIGNE, '34229929']), enLigneComplete: true }];
ok(M.jugerSortieVerificationBeebs(J29, { lectures: vuEnLigne, releves: [releve('2026-11-01T06:00:00Z')], lignes: [], maintenant: t('2026-11-01T07:00:00Z') }) === null,
  'vue « en ligne » par une lecture (bd380fbf, 34113827 : en ligne 67 h après sa sortie) → jamais rien');
ok(M.jugerSortieVerificationBeebs(J29, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z')], lignes: [{ listing_id: '34229929', statut_plateforme: 'en_ligne', vu_le: '2026-10-27T10:00:00Z', run_id: 'r1' }], maintenant: t('2026-11-01T07:00:00Z') }) === null,
  'vue « en ligne » par un relevé (ligne avec run_id) → jamais rien');
const fantome = [{ listing_id: '34229929', statut_plateforme: 'en_ligne', vu_le: '2026-10-25T04:58:12Z', run_id: null }];
ok(M.jugerSortieVerificationBeebs(J29, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z')], lignes: fantome, maintenant: t('2026-11-01T07:00:00Z') })?.verdict === 'refus',
  'la ligne « en_ligne » posée par une republication à son propre dépôt (run_id nul, 6a38d0b6) n’est pas une vue');
ok(M.jugerSortieVerificationBeebs({ ...J29, vu_en_ligne_le: '2026-10-26T00:00:00Z' }, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z')], maintenant: t('2026-11-01T07:00:00Z') }) === null, 'vue par la veille → rien');
ok(M.jugerSortieVerificationBeebs({ ...J29, price: '999' }, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z')], maintenant: t('2026-11-01T07:00:00Z') }) === null,
  '999 € : Beebs examine les annonces chères dans un état invisible (34109673, en ligne 48 h après) → jamais jugée ici');
ok(M.jugerSortieVerificationBeebs({ ...J29, status: 'failed' }, { lectures: ls, maintenant: t('2026-10-25T06:00:00Z') }) === null
  && M.jugerSortieVerificationBeebs({ ...J29, platform_fields: { ...J29.platform_fields, refus_verification_beebs: { le: 'x', numero: '34229929' } } }, { lectures: ls, maintenant: t('2026-10-25T06:00:00Z') }) === null
  && M.jugerSortieVerificationBeebs(J29, { lectures: ls, maintenant: t('2026-12-01T06:00:00Z') }) === null, 'pas « publié », déjà tranché, ou dépôt de plus de 30 jours : rien');
// (29/10, lot A point 8 — XEWER 99571727) Un refus posé sur un ANCIEN numéro (refus sur 34099938, nouveau dépôt 34234780 après une
// relance) ne protège pas le nouveau dépôt : il se juge à neuf.
ok(M.jugerSortieVerificationBeebs({ ...J29, platform_fields: { ...J29.platform_fields, refus_verification_beebs: { le: 'x', numero: '34099938' } } }, { lectures: ls, releves: [releve('2026-11-01T06:00:00Z')], lignes: fantome, maintenant: t('2026-11-01T07:00:00Z') })?.verdict === 'refus',
  'marqueur de refus d’un ANCIEN numéro : le nouveau dépôt se juge à neuf (plus de protection à vie)');
const autreCompte = M.lecturesDesDepotsBeebs([J29, depot('z', '35000001', lecture('2026-10-25T05:30:00Z', ['35000001'], ['35000002'], 1), lecture('2026-10-25T05:30:05Z', ['35000001'], ['35000002'], 1))]);
ok(M.jugerSortieVerificationBeebs(J29, { lectures: autreCompte, maintenant: t('2026-10-25T06:00:00Z') }) === null, 'une lecture d’un AUTRE compte Beebs (aucune annonce en commun) ne prouve jamais une sortie');
const rep = { ...J29, action: 'republish', id: '6a38d0b6' };
ok(M.jugerSortieVerificationBeebs(rep, { lectures: M.lecturesDesDepotsBeebs([rep, J30, J31, J33]), releves: [releve('2026-11-01T06:00:00Z')], maintenant: t('2026-11-01T07:00:00Z') })?.verdict === 'refus', 'une republication se juge pareil');

console.log('\n4. Ce que le job dit, et ce qui s’écrit');
const m1 = M.messageRefusVerificationBeebs(J29, v3);
// (29/10, lot B 4.5) Le message vrai, daté : reçue, en vérification à HHhMM le JJ/MM, retirée (plus là à HHhMM le JJ/MM) sans mise en
// ligne, Beebs ne dit pas pourquoi ; la preuve datée ; jamais « refusée à sa vérification » ni « serait refusé de même ».
ok(m1.startsWith("Beebs a reçu ton annonce (n° 34229929, en vérification à 05h58 le 25/10), puis l'a retirée de sa vérification sans la mettre en ligne (elle n'y était plus à 06h01 le 25/10) ; Beebs ne dit pas pourquoi.")
  && /Le relevé fait à 07h00 le 01\/11, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n'a jamais mis cette annonce en ligne\./.test(m1)
  && /Rien n'est en ligne, rien n'est vendu/.test(m1) && /ne compte pas dans tes limites/.test(m1) && !/serait refusé|a refusé|relance/i.test(m1),
  'publication : reçue, en vérification à 05h58 le 25/10, plus là à 06h01 (deux heures, jamais une durée), preuve datée (heure de Paris), rien en ligne ni vendu, rendue, jamais « refusée » ni « relance »', m1);
const m2 = M.messageRefusVerificationBeebs(rep, v3);
ok(/^Beebs a reçu ta nouvelle annonce \(n° 34229929/.test(m2) && /L'ancienne annonce avait été retirée : ton article n'est plus en ligne sur Beebs/.test(m2) && /republication ne compte pas/.test(m2), 'republication : l’ancienne retirée, l’article n’est plus en ligne', m2);
const pfS = M.pfApresSortieVerification(J29, v1, { maintenant: t('2026-10-25T06:00:00Z') });
ok(pfS.pas_encore_visible?.sortie_constatee_le === v1.sortie_constatee_le && pfS.pas_encore_visible.regle === 'sortie_de_verification_2510' && pfS.pas_encore_visible.depuis === v1.sortie_constatee_le,
  'sortie : marqueur pas_encore_visible daté (l’app dit « Beebs vérifie ton annonce »)');
const pfR = M.pfApresRefusVerification({ ...J29, platform_fields: { ...J29.platform_fields, sale_signal: 'unavailable', unavailable_since: 'x', pas_encore_visible: pfS.pas_encore_visible } }, v3);
ok(pfR.refus_verification_beebs?.regle === M.REGLE_SORTIE_VERIFICATION && pfR.refus_verification_beebs.confirmee_le === v3.confirmee_le && !pfR.sale_signal && !pfR.unavailable_since && !pfR.pas_encore_visible
  && pfR.preuve_identifiant_beebs, 'refus : la preuve posée, les signaux de vente et le marqueur retirés, la preuve du dépôt gardée');

// (29/10, lot B 4.6 — XEWER) Relancer un refus prouvé, c'est changer le contenu d'abord : l'empreinte du contenu refusé
// (titre, description, photos, rayon) est posée au refus ; une relance à l'identique est retenue, une relance modifiée servie.
console.log('\n4 bis. L’empreinte du contenu refusé (lot B 4.6)');
const E = await import(pathToFileURL(join(RACINE, 'src/utils/empreinteContenu.js')).href);
const PHOTOS = [{ url: 'https://x.supabase.co/storage/v1/object/public/listing-photos/u/raw/1792243456064_0.jpg?v=1792243456064', type: 'original' },
  { url: 'https://x.supabase.co/storage/v1/object/public/listing-photos/u/raw/1792243456064_1.jpg?v=1792243456064', type: 'original' }];
const RAYON_JV = ['Jeux, jouets et loisirs', 'Multimédia', 'Jeux vidéo'];
const JC = { ...J29, id: '824ba918', title: '🎮 Conflict: Desert Storm II – Xbox Classics', description: '🎮 Je vends Conflict: Desert Storm II sur Xbox première génération.',
  photos: PHOTOS, platform_fields: { ...J29.platform_fields, beebsCategoryPath: RAYON_JV } };
const pfE = M.pfApresRefusVerification(JC, v3);
const emp = pfE.refus_verification_beebs?.empreinte_contenu;
ok(typeof emp === 'string' && /^c1:[0-9a-f]{16}$/.test(emp) && emp === E.empreinteContenuDuJob(JC), 'refus : empreinte_contenu posée (titre + description + photos + rayon), la même fonction que l’app et le serveur', String(emp));
ok(!('empreinte_contenu' in (M.pfApresRefusVerification(J29, v3).refus_verification_beebs ?? {})), 'job lu sans son texte ni ses photos (select de handler-watch d’avant) : aucune empreinte, rien ne serait comparé à faux');
const refuse = { ...JC, status: 'pending', platform_fields: pfE };
ok(E.relanceRefusBeebs(refuse)?.verdict === 'meme_contenu', 'relance À L’IDENTIQUE (même titre, description, photos, rayon) → retenue');
ok(E.relanceRefusBeebs({ ...refuse, description: `${JC.description}\n\n` })?.verdict === 'meme_contenu' && E.relanceRefusBeebs({ ...refuse, title: `  ${JC.title} ` })?.verdict === 'meme_contenu',
  'un espace ou un retour à la ligne de plus ne change pas l’annonce : toujours retenue');
ok(E.relanceRefusBeebs({ ...refuse, title: '🎮 Conflict: Desert Storm II – Xbox originale – PAL' })?.verdict === 'contenu_modifie', 'titre modifié → servie');
ok(E.relanceRefusBeebs({ ...refuse, description: 'Jeu Xbox originale, testé, boîte et notice.' })?.verdict === 'contenu_modifie', 'description modifiée → servie');
ok(E.relanceRefusBeebs({ ...refuse, photos: [PHOTOS[1], PHOTOS[0]] })?.verdict === 'contenu_modifie' && E.relanceRefusBeebs({ ...refuse, photos: PHOTOS.slice(0, 1) })?.verdict === 'contenu_modifie',
  'photos réordonnées (autre vignette) ou retirées → servie');
ok(E.relanceRefusBeebs({ ...refuse, platform_fields: { ...pfE, beebsCategoryPath: ['Jeux, jouets et loisirs', 'Multimédia', 'Consoles de jeux'] } })?.verdict === 'contenu_modifie', 'rayon modifié → servie');
ok(E.relanceRefusBeebs({ ...refuse, photos: PHOTOS.map((p) => p.url) })?.verdict === 'meme_contenu', 'photos en chaînes ou en objets : la même liste');
ok(E.relanceRefusBeebs({ id: refuse.id, platform: 'beebs', action: 'publish', title: refuse.title, platform_fields: pfE })?.verdict === 'a_verifier',
  'job de la liste de l’app (ni description ni photos) : « à vérifier », jamais conclu');
ok(E.relanceRefusBeebs(J29) === null && E.relanceRefusBeebs({ ...refuse, platform: 'vinted' }) === null
  && E.relanceRefusBeebs({ ...refuse, platform_fields: { ...pfE, refus_verification_beebs: { ...pfE.refus_verification_beebs, empreinte_contenu: undefined } } }) === null,
  'sans refus, hors Beebs, ou refus d’avant le 29/10 (sans empreinte) : rien ne change');
ok(E.relanceRefusBeebs({ ...refuse, platform_fields: { ...pfE, refus_verification_beebs: { ...pfE.refus_verification_beebs, empreinte_contenu: 'c0:0000000000000000' } } })?.verdict === 'contenu_modifie',
  'empreinte d’une autre version : jamais « la même » (on laisse partir)');
const mM = E.messageRefusBeebsMemeContenu(refuse);
ok(/Beebs a refusé cette annonce à sa vérification/.test(mM) && /à l'identique/.test(mM) && /Rien n'a été envoyé à Beebs/.test(mM) && /Change d'abord le texte, les photos ou le rayon/.test(mM) && !/\d+\s*(min|h)\b/.test(mM),
  'le motif du job retenu : refus, à l’identique, rien envoyé, quoi changer — jamais une durée', mM);
ok(E.SOURCE_REFUS_BEEBS_MEME_CONTENU === 'refus_beebs_meme_contenu' && E.MESSAGE_BOUTON_REFUS_BEEBS.fr === "Change d'abord le texte, les photos ou le rayon : Beebs refuserait la même annonce",
  'source et texte du bouton, mot pour mot');

console.log('\n5. Le câblage (handler-watch)');
const hw = lire('supabase/functions/handler-watch/index.ts');
const b = hw.slice(hw.indexOf('BEEBS : UN DÉPÔT SORTI DE LA VÉRIFICATION SANS ÊTRE MIS EN LIGNE'), hw.indexOf('BEEBS : UN DÉPÔT SORTI DE LA VÉRIFICATION SANS ÊTRE MIS EN LIGNE') + 9000);
ok(/from "\.\.\/_shared\/beebs-sortie-verification\.js"/.test(hw) && /getUTCMinutes\(\) % 15 >= 9/.test(b) && /\.limit\(120\)/.test(b) && /parCompteSV\.size >= 10/.test(b), 'toutes les 15 min, 120 dépôts et 10 comptes au plus');
ok(/\.not\("platform_fields->preuve_identifiant_beebs", "is", null\)/.test(b) && !/\.is\("platform_fields->refus_verification_beebs", null\)/.test(b)
  && /sortie_constatee_le\.lt\."\$\{il7j\}"/.test(b), 'seulement les dépôts lus avant/après (le refus déjà posé sur CE numéro écarté par le juge), sorties marquées depuis moins de 7 j non relues');
ok(/if \(!String\(j\.listing_url \?\? ""\)\.trim\(\)\) continue;/.test(b) && /pevSV\?\.sortie_constatee_le === v\.sortie_constatee_le\) continue;/.test(b),
  'sortie : jamais sur un dépôt sans lien (aucun lien posé par ricochet), aucune ligne inchangée réécrite');
ok((b.match(/\.eq\("status", "published"\)\.is\("vu_en_ligne_le", null\)/g) ?? []).length === 2, 'chaque écriture garde l’état lu (publié, jamais vu en ligne)');
ok(/status: "failed", error: messageRefusVerificationBeebs\(j, v\)/.test(b) && /if \(j\.action === "publish"\) \{\s*const \{ data: ref, error: refErr \} = await supabase\.rpc\("refund_publish_unconfirmed", \{ p_job: j\.id \}\)/.test(b)
  && b.indexOf('status: "failed"') < b.indexOf('supabase.rpc("refund_publish_unconfirmed"'), 'refus : « failed » + message vrai, PUIS la publication rendue (la republication l’est par son déclencheur)');
// (29/10, lot B 4.6) L'empreinte n'est posée que si handler-watch lit le texte et les photos du dépôt : constat, pas un rouge.
{
  const sel = (b.match(/\.select\("([^"]*)"\)\s*\.eq\("platform", "beebs"\)\.in\("action", \["publish", "republish"\]\)\.eq\("status", "published"\)/) ?? [])[1] ?? '';
  const lit = ['title', 'description', 'photos'].every((c) => new RegExp(`\\b${c}\\b`).test(sel));
  console.log(lit ? '  ✓ handler-watch lit titre, description et photos des dépôts jugés : l’empreinte est posée au refus'
    : `  ⚠ handler-watch ne lit pas encore « title, description, photos » des dépôts jugés (select : ${sel || 'introuvable'}) : aucune empreinte posée en prod tant qu'ils n'y sont pas`);
}

console.log('\n6. Le câblage du refus à l’identique (lot B 4.6 : get-pending-jobs, Stock)');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const bg = gpj.slice(gpj.indexOf("UN REFUS BEEBS PROUVÉ NE REPART JAMAIS À L'IDENTIQUE"), gpj.indexOf("UN ARTICLE VENDU N'EST JAMAIS PUBLIÉ NI REPUBLIÉ"));
ok(/from "\.\.\/\.\.\/\.\.\/src\/utils\/empreinteContenu\.js"/.test(gpj) && bg.length > 200 && /relanceRefusBeebs\(j\)/.test(bg) && /verdict !== "meme_contenu"\) continue/.test(bg),
  'get-pending-jobs : la fonction de l’app, seulement sur un contenu identique');
ok(/status: "needs_user", error: messageRefusBeebsMemeContenu\(j\)/.test(bg) && /needs_user_source: SOURCE_REFUS_BEEBS_MEME_CONTENU/.test(bg) && /\.eq\("status", "pending"\)/.test(bg)
  && /out = out\.filter\(\(j\) => !memeContenu\.has\(String\(j\.id\)\)\)/.test(bg) && !/needsUserAttempts\s*[:=]/.test(bg),
  'retenue en needs_user « refus_beebs_meme_contenu » (état lu gardé), jamais servie, aucune tentative consommée');
const st = lire('src/tabs/StockTab.jsx');
ok(/from '\.\.\/utils\/empreinteContenu\.js'/.test(st) && /refus\?\.verdict === 'meme_contenu'\) return \{ \.\.\.info, memeContenuBeebs: true \}/.test(st)
  && /if\(r\.memeContenuBeebs\)return\(/.test(st) && /MESSAGE_BOUTON_REFUS_BEEBS\[lang==="en"\?"en":"fr"\]/.test(st),
  'Stock : le bouton dit « Change d’abord le texte, les photos ou le rayon… » sur un contenu identique');
const rel = st.slice(st.indexOf('async function relancerJobEchoue'), st.indexOf('async function relancerJobEchoue') + 2500);
ok(/job\?\.platform === 'beebs'/.test(rel) && /select\('id, platform, action, status, title, description, photos, platform_fields'\)/.test(rel)
  && /verdictB === 'meme_contenu'\) \{[\s\S]{0,200}?return;/.test(rel) && rel.indexOf("verdictB === 'meme_contenu'") < rel.indexOf("if (mode === 'copie')"),
  'Stock : la relance (copie comprise) relit le job et ne relance pas un contenu identique');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${n} contrôles`);
process.exit(ko ? 1 : 0);
