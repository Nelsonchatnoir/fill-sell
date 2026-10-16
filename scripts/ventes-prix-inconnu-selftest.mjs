// selftest:ventes-prix-inconnu — LE PRIX D'UNE VENTE NÉE D'UN JOB, ET LE MAIL
// SANS MONTANT QUAND IL EST INCONNU (16/10, point C1).
//
//   npm run selftest:ventes-prix-inconnu            contrôles du dépôt (hors ligne)
//   npm run selftest:ventes-prix-inconnu -- --prod  + preuve en prod dans une
//        transaction ANNULÉE (scripts/preuves/preuve-ventes-prix-inconnu.mjs,
//        migration et réparation rejouées) : aucun mail, aucune ligne gardée.
//
// Cas : 128 notes de vente (push_ventes) nées SANS prix depuis le 06/10 — des
// republications Vinted, dont le `price` est NULL — et 45 mails « vendu 0 € »
// (Number(null) || 0), certains avec un bénéfice négatif. La règle (migration
// 20261016221000) : vente enregistrée > prix lu à la vente > prix du job >
// dernier prix publié > fiche du stock ; aucun → NULL, et le mail n'écrit alors
// AUCUN montant.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261016221000_ventes_prix_inconnu.sql');
let INV = '';
try { INV = lire('supabase/rollbacks/20261016221000_ventes_prix_inconnu.sql'); } catch { INV = ''; }
const REP = (() => { try { return lire('scripts/reparations/20261016_ventes_prix_zero.sql'); } catch { return ''; } })();
const PUSH_VENTES = lire('supabase/functions/push-ventes/index.ts');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };

const fonction = (txt, nom) => {
  const i = txt.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return null;
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? null : txt.slice(i, j + 10);
};

// ── A. Réécrites DEPUIS la prod : retirer les blocs (16/10, C1) rend la prod à l'octet ──
const trgMig = fonction(MIG, 'push_trg_job');
const decMig = fonction(MIG, 'push_ventes_a_envoyer');
const trgProd = fonction(INV, 'push_trg_job');
const decProd = fonction(INV, 'push_ventes_a_envoyer');
ok(trgMig && decMig && trgProd && decProd, 'A0. les deux fonctions sont dans la migration ET dans l\'inverse (prod du 16/10)');
if (trgMig && trgProd) {
  const ramene = trgMig
    .replace('  v_prix numeric;\n', '')
    .replace(/    -- \(16\/10, C1\) Le prix ANNONCÉ[\s\S]*?    end;\n(    perform public\.push_noter)/, '$1')
    .replace('new.title, v_prix, null, null,', 'new.title, new.price, null, null,');
  ok(ramene === trgProd, 'A1. push_trg_job = définition EN PROD + le seul bloc (16/10, C1)');
}
if (decMig && decProd) {
  const ramene = decMig
    .replace('  v_prix     numeric;\n  v_j        record;\n', '')
    .replace(/      -- \(16\/10, C1\) Le prix ANNONCÉ d'une note de JOB[\s\S]*?      end if;\n(      -- Décidée : elle part\.)/, '$1')
    .replace('traite_le = now(), prix = v_prix,', 'traite_le = now(),')
    .replace("        'prix', v_prix, 'devise', r.devise,", "        'prix', r.prix, 'devise', r.devise,");
  ok(ramene === decProd, 'A2. push_ventes_a_envoyer = définition EN PROD + les seuls blocs (16/10, C1)');
}

// ── B. La règle : UN ordre, chaque source > 0, jamais 0 inventé ──────────────
const regle = fonction(MIG, 'prix_vente_du_job') ?? '';
const ordre = ['prix_vente_enregistree(', "'detected_price'", 'p_price > 0', "'prix_recreation'", "'{republish_snapshot,prix}'", 'i.prix_vente > 0'];
const positions = ordre.map((m) => regle.indexOf(m));
ok(positions.every((p) => p > 0) && positions.every((p, k) => k === 0 || p > positions[k - 1]),
  'B1. ordre : vente enregistrée > prix lu à la vente > prix du job > prix de recréation > snapshot > fiche');
ok(!/coalesce\([^;]*,\s*0\s*\)/.test(regle), 'B2. aucun repli sur 0 : une source absente reste NULL');
ok(/i\.user_id = p_user/.test(regle), 'B3. la fiche lue est celle du MÊME compte');
const lisible = fonction(MIG, '_prix_ou_null') ?? '';
ok(/CASE WHEN s\.x ~ '\^\[0-9\]\+\(\[\.\]\[0-9\]\+\)\?\$' THEN CASE WHEN s\.x::numeric > 0/.test(lisible),
  'B4. _prix_ou_null : conversion tentée seulement sur des chiffres (CASE imbriqué), > 0 sinon NULL');
const recu = fonction(MIG, 'prix_vente_enregistree') ?? '';
ok(/p_platform IS DISTINCT FROM 'ebay'/.test(recu), 'B5. eBay : jamais le reçu par annonce (une annonce en quantité se vend plusieurs fois)');
ok(/v\.prix_vente > 0/.test(recu) && /o\.user_id = p_user/.test(recu), 'B6. reçu : prix > 0, du même compte');
ok(/REVOKE ALL ON FUNCTION public\.prix_vente_du_job\([^)]*\) FROM PUBLIC, anon, authenticated;/.test(MIG)
   && /REVOKE ALL ON FUNCTION public\._prix_ou_null\(text\) FROM PUBLIC, anon, authenticated;/.test(MIG)
   && /REVOKE ALL ON FUNCTION public\.prix_vente_enregistree\([^)]*\) FROM PUBLIC, anon, authenticated;/.test(MIG),
  'B7. les trois fonctions neuves : fermées à anon et authenticated (REVOKE nommé)');

// ── C. Le déclencheur et la décision ─────────────────────────────────────────
ok(/new\.title, v_prix, null, null,/.test(trgMig ?? '') && /exception when others then\n      v_prix := new\.price;/.test(trgMig ?? ''),
  'C1. la note naît avec prix_vente_du_job ; une panne du calcul garde new.price (la note n\'est jamais perdue)');
ok(/coalesce\(public\.prix_vente_enregistree\(v_j\.user_id[\s\S]*?r\.prix,\s*public\.prix_vente_du_job\(/.test(decMig ?? ''),
  'C2. décision d\'une note de job : la vente ENREGISTRÉE, puis le prix de la note, puis la règle');
ok(/if r\.origine = 'job' and r\.job_id is not null then/.test(decMig ?? '') && /exception when others then\n          v_prix := r\.prix;/.test(decMig ?? ''),
  'C3. seules les notes de job sont recalculées ; une panne garde le prix de la note');
ok((decMig ?? '').split("'prix', r.prix,").length - 1 === 1 && (decMig ?? '').split("'prix', v_prix,").length - 1 === 1,
  'C4. une relance (note déjà décidée) garde son prix ; la décision rend le prix écrit sur la note');

// ── D. La réparation : seulement `prix`, seulement les notes SANS prix ───────
ok(/WHERE pv\.job_id IS NOT NULL AND pv\.prix IS NULL/.test(REP) && /UPDATE public\.push_ventes pv SET prix = s\.prix_apres/.test(REP)
   && /pv\.prix IS NULL;/.test(REP), 'D1. réparation : les notes nées d\'un job SANS prix, colonne prix seule, aucune ligne inchangée');
ok(!/SET\s+(statut|mail_statut|part_le|essais|mail_essais)\s*=/i.test(REP), 'D2. réparation : ni statut, ni mail_statut, ni part_le touchés — rien ne repart');
ok(/_backup_1610_ventes_prix_zero/.test(REP) && /-- UPDATE public\.push_ventes pv SET prix = b\.prix_avant/.test(REP),
  'D3. sauvegarde avant / après et inverse écrits');
ok(/to_regprocedure\('public\.prix_vente_du_job\(uuid,text,text,numeric,jsonb,bigint\)'\) IS NULL/.test(REP),
  'D4. la réparation refuse de tourner sans la migration (une seule règle)');

// ── E. Le mail : aucun montant pour un prix inconnu ─────────────────────────
ok(!/Number\(n\.prix\)\s*\|\|\s*0/.test(PUSH_VENTES), 'E1. push-ventes : plus de « Number(n.prix) || 0 »');
ok(/const prixVente = prixVenteConnu\(n\.prix\);/.test(PUSH_VENTES) && /if \(prixVente !== null && n\.inventaire_id != null\)/.test(PUSH_VENTES),
  'E2. push-ventes : prix inconnu → aucun bénéfice calculé (plus de bénéfice négatif sur 0 €)');

const E = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/emails-fillsell.ts')).href);
const P = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/push-envoi.ts')).href);
const mail = (v, lang = 'fr') => E.mailVentes({ ventes: [v], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang);
const ligne = (m, titre) => (m.html.match(new RegExp(`« ${titre} »[^<]*`)) ?? [''])[0];

const inconnu = mail({ titre: 'Puzzle', plateforme: 'vinted', prixVente: null, benefice: null });
ok(ligne(inconnu, 'Puzzle') === '« Puzzle » — Vinted : vendu', `E3. prix inconnu : « ${ligne(inconnu, 'Puzzle')} » (aucun montant)`);
ok(!/0 €/.test(inconnu.html) && !/bénéfice/.test(inconnu.html) && !/Ajoute le prix d(?:&#39;|')achat/.test(inconnu.html),
  'E4. prix inconnu : ni « 0 € », ni bénéfice, ni « ajoute le prix d\'achat »');
ok(inconnu.sujet === 'Vendu sur Vinted 🎉', 'E5. le sujet ne change pas');
const zero = mail({ titre: 'Puzzle', plateforme: 'vinted', prixVente: 0, benefice: -5 });
ok(ligne(zero, 'Puzzle') === '« Puzzle » — Vinted : vendu' && !/0 €/.test(zero.html) && !/-5/.test(zero.html),
  'E6. un 0 reçu n\'est jamais écrit « 0 € », ni son bénéfice négatif');
const connu = mail({ titre: 'Puzzle', plateforme: 'vinted', prixVente: 14, benefice: 5 });
ok(ligne(connu, 'Puzzle') === '« Puzzle » — Vinted : vendu 14 €, +5 € de bénéfice', `E7. prix connu : « ${ligne(connu, 'Puzzle')} »`);
const sansAchat = mail({ titre: 'Puzzle', plateforme: 'vinted', prixVente: 14, benefice: null });
ok(ligne(sansAchat, 'Puzzle') === '« Puzzle » — Vinted : vendu 14 €' && /Ajoute le prix d(?:&#39;|')achat/.test(sansAchat.html),
  'E8. prix connu, prix d\'achat inconnu : « vendu 14 € » + « ajoute le prix d\'achat » (inchangé)');
const centimes = mail({ titre: 'Badge', plateforme: 'vinted', prixVente: 0.4, benefice: null });
ok(ligne(centimes, 'Badge') === '« Badge » — Vinted : vendu 0,40 €', `E9. sous 0,50 € : « ${ligne(centimes, 'Badge')} » — jamais « 0 € »`);
const ailleurs = mail({ titre: 'Lampe', plateforme: 'ailleurs', prixVente: null, benefice: null });
ok(ligne(ailleurs, 'Lampe') === '« Lampe » — vendu ailleurs', `E10. ailleurs, prix inconnu : « ${ligne(ailleurs, 'Lampe')} »`);
const en = mail({ titre: 'Puzzle', plateforme: 'vinted', prixVente: null, benefice: null }, 'en');
ok(ligne(en, 'Puzzle') === '« Puzzle » — Vinted : sold' && !/€0/.test(en.html), 'E11. en anglais : « sold », sans montant');

// Prix CONNU : le mail est identique, octet pour octet, au gabarit servi par push-ventes v10 (3145ec7).
const REF = '3145ec7';
const dirRef = path.join(RACINE, 'build', 'selftest-ventes-prix-inconnu', REF);
let refOk = false;
try {
  rmSync(dirRef, { recursive: true, force: true });
  mkdirSync(dirRef, { recursive: true });
  for (const m of ['emails-fillsell.ts', 'email-template.ts', 'plateformes.ts', 'paiement-echoue.js']) {
    writeFileSync(path.join(dirRef, m), execFileSync('git', ['show', `${REF}:supabase/functions/_shared/${m}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
  }
  refOk = true;
} catch { refOk = false; }
if (refOk) {
  const A = await import(pathToFileURL(path.join(dirRef, 'emails-fillsell.ts')).href);
  const cas = [
    { ventes: [{ titre: 'Veste', plateforme: 'vinted', prixVente: 35, benefice: 22 }], retraitsACliquer: 2, retraitsBeebsAuto: 1 },
    { ventes: [{ titre: 'Lampe', plateforme: 'leboncoin', prixVente: 20, benefice: null }, { titre: null, plateforme: 'ebay', prixVente: 12, benefice: 4 },
      { titre: 'Robe', plateforme: 'beebs', prixVente: 9, benefice: null }], retraitsACliquer: 0, retraitsBeebsAuto: 0 },
    { ventes: [{ titre: 'Puzzle', plateforme: 'vinted', prixVente: 14, benefice: -3 }], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true },
    { ventes: [{ titre: 'Sac', plateforme: 'ailleurs', prixVente: 18.6, benefice: 7.4 }], retraitsACliquer: 0, retraitsBeebsAuto: 0 },
  ];
  const identiques = cas.every((c) => ['fr', 'en'].every((l) => {
    const a = A.mailVentes(c, l); const b = E.mailVentes(c, l);
    return a.sujet === b.sujet && a.html === b.html;
  }));
  ok(identiques, `E12. prix connus : mail identique à l'octet au gabarit de push-ventes v10 (${REF}), FR et EN`);
} else {
  ok(false, `E12. gabarit de référence ${REF} illisible (git show)`);
}

// ── F. La notification : même règle (prixVenteConnu) ─────────────────────────
ok(P.prixVenteConnu(null) === null && P.prixVenteConnu('') === null && P.prixVenteConnu(0) === null && P.prixVenteConnu('0') === null
   && P.prixVenteConnu(-2) === null && P.prixVenteConnu(true) === null && P.prixVenteConnu('abc') === null,
  'F1. prixVenteConnu : vide, 0, négatif, booléen, texte → null');
ok(P.prixVenteConnu(14) === 14 && P.prixVenteConnu('14.5') === 14.5, 'F2. prixVenteConnu : 14 → 14, « 14.5 » → 14.5');
ok(P.formaterPrix(null, 'EUR') === null && P.formaterPrix(0, 'EUR') === null && P.formaterPrix(14, 'EUR') === '14 €' && P.formaterPrix(14.5, 'EUR') === '14,50 €',
  'F3. notification : aucun montant pour un prix inconnu ou 0 ; « 14 € », « 14,50 € » inchangés');
const msg = P.messageVente({ id: 1, plateforme: 'vinted', titre: 'Puzzle', prix: null }, 'fr');
ok(msg.corps === 'Puzzle', `F4. notification d'une vente sans prix : « ${msg.corps} »`);

// ── G. Le bandeau de l'app suit le même ordre (une seule règle, deux miroirs) ─
const B = await import(pathToFileURL(path.join(RACINE, 'src/utils/prixBandeauVente.js')).href);
ok(B.prixParDefautDuBandeau({ price: 20, platform_fields: { detected_price: 18, prix_recreation: 14 } }) === 18
   && B.prixParDefautDuBandeau({ price: 20, platform_fields: { prix_recreation: 14 } }) === 20
   && B.prixParDefautDuBandeau({ price: null, platform_fields: { prix_recreation: 14, republish_snapshot: { prix: '13.0' } } }) === 14
   && B.prixParDefautDuBandeau({ price: null, platform_fields: { republish_snapshot: { prix: '0' } } }, { prix_vente: 3 }) === 3
   && B.prixParDefautDuBandeau({ price: 0, platform_fields: {} }, null) === null,
  'G1. bandeau (prixParDefautDuBandeau) : même ordre et mêmes « 0 = absence » que prix_vente_du_job (hors vente enregistrée)');

if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/preuves/preuve-ventes-prix-inconnu.mjs', '--avec-migration', '--avec-reparation'], { cwd: RACINE, encoding: 'utf8', shell: true });
  console.log(`\n${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd());
  ok(r.status === 0, 'PROD. preuve en prod (transaction annulée) : toute verte');
}

console.log(`\n${echecs === 0 ? '✓' : '✗'} selftest:ventes-prix-inconnu — ${total - echecs}/${total}`);
process.exit(echecs === 0 ? 0 : 1);
