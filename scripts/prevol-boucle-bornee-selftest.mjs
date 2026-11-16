// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 6 DU LOT DU 16/11/2026 MIDI — PLUS JAMAIS DE BOUCLE SANS FIN SUR LE CONTRÔLE D'AVANT RETRAIT
//     npm run selftest:prevol-boucle-bornee
// ═══════════════════════════════════════════════════════════════════════════
// Constat (joshua.sapone, Premium) : 2 republications Beebs (vestes Salvatore Ferragamo et Versus) créées le 15/11 20:02 ;
// ~18 contrôles d'avant retrait de ~5 min chacun, aucun abouti, Chrome occupé à chaque fois. Le poste est lent (médiane
// 173 s contre 31 s sur le parc). Au-delà de la borne de 300 s, l'extension rendait `pending` sans erreur (« illisible ») :
// le serveur ne comptait rien, ne bornait rien, ne disait rien. Et la borne élargie promise par l'extension (« le serveur
// élargit la borne ») n'était jamais posée. Même chemin pour la table toscane (Leboncoin, ≈ 40 contrôles par jour).
// Ce test prouve :
//   A. le module pur reconnaît un contrôle non concluant (Beebs borne atteinte ; Leboncoin avec son détail) et rien d'autre ;
//   B. pas-de-rouge le borne : 30, 60, 120 min puis la personne (« relancer »), message vrai (rien retiré) ; la borne élargie
//      (fill_borne_ms 20 min) dès le premier quand le poste a manqué de temps ; jamais « Leboncoin n'a pas affiché les photos » ;
//   C. « trop lent » : la première reprise élargit la borne (poste ≥ 0.6.177) ; sans build, l'ancienne règle (2 h) ;
//   D. rejeu de la nuit de la veste Versus (10 contrôles) et de la table toscane (23 rapports) : la personne au 4ᵉ ;
//   E. update-job-status passe le rapport au classement ; get-pending-jobs allume le port après un « trop lent ».
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
const importer = async (p) => { try { return await import(new URL(`../${p}`, import.meta.url).href); } catch (e) { console.log(`  (module ${p} : ${String(e?.message ?? e).slice(0, 160)})`); return null; } };
const PNC = await importer('supabase/functions/_shared/prevol-non-concluant.js');
const PDR = await importer('supabase/functions/_shared/pas-de-rouge.js');
const T0 = Date.parse('2026-11-16T09:39:44Z');
const BUILD = '2026-11-10T14:10:14Z+ba13a51 · v0.6.186';

const rapportBeebs = { statut: 'pending', erreur: null, action: 'republish', platform: 'beebs',
  pfRecu: { republish_step: 'captured', republish_prevol_formulaire: { at: new Date(T0 - 1000).toISOString(), verdict: 'illisible', plateforme: 'beebs', detail: 'aucune preuve positive du formulaire' } },
  pfJob: { processing_since: new Date(T0 - 310_000).toISOString() }, maintenant: T0 };
const rapportLbc = { statut: 'pending', erreur: null, action: 'republish', platform: 'leboncoin',
  pfRecu: { republish_step: 'captured', republish_prevol_formulaire: { at: new Date(T0 - 2000).toISOString(), verdict: 'illisible', plateforme: 'leboncoin', detail: 'Élément introuvable: input[type="file"] (même après avance du wizard paginé)' } },
  pfJob: { processing_since: new Date(T0 - 160_000).toISOString() }, maintenant: T0 };

console.log('\nA. Le module pur');
{
  const f = PNC?.prevolNonConcluant;
  const b = f?.(rapportBeebs);
  ok(b?.borneAtteinte === true && b?.plateforme === 'beebs', 'Beebs, aucune preuve, 310 s après la prise : non concluant, borne atteinte', JSON.stringify(b));
  const l = f?.(rapportLbc);
  ok(l && l.borneAtteinte === false && /input\[type="file"\]/.test(l.detail), 'Leboncoin, élément introuvable : non concluant, avec son détail', JSON.stringify(l));
  ok(f?.({ ...rapportBeebs, erreur: 'autre chose' }) === null, 'un rapport qui porte une erreur : pas ici (son propre classement)');
  ok(f?.({ ...rapportBeebs, statut: 'failed' }) === null && f?.({ ...rapportBeebs, action: 'publish' }) === null, 'un échec, ou une publication : pas ici');
  ok(f?.({ ...rapportBeebs, pfRecu: { ...rapportBeebs.pfRecu, republish_step: 'deleted' } }) === null, 'annonce déjà retirée (remise en ligne) : jamais ici');
  ok(f?.({ ...rapportBeebs, maintenant: T0 + 3600_000 }) === null, 'un verdict périmé (1 h) : rien');
  ok(f?.({ ...rapportBeebs, pfRecu: { ...rapportBeebs.pfRecu, republish_prevol_formulaire: { ...rapportBeebs.pfRecu.republish_prevol_formulaire, verdict: 'ok' } } }) === null, 'un contrôle concluant : rien');
}

const classer = (rapport, reprises, build = BUILD) => PDR?.classerEchec?.({
  platform: rapport.platform, action: 'republish', brut: PNC?.texteBrutPrevolNonConcluant?.(PNC?.prevolNonConcluant?.(rapport)) ?? '', reecrit: '', essais: reprises, pf: {}, reprises, build,
});

console.log('\nB. pas-de-rouge borne la boucle');
{
  const s0 = classer(rapportBeebs, 0);
  ok(s0?.verdict === 'reprise' && s0?.motif === 'prevol_non_concluant' && s0?.dansMinutes === 30 && s0?.pf?.fill_borne_ms === 1_200_000,
    'Beebs borne atteinte, 1er : reprise dans 30 min avec une borne de 20 min', JSON.stringify(s0));
  const l0 = classer(rapportLbc, 0), l1 = classer(rapportLbc, 1), l2 = classer(rapportLbc, 2), l3 = classer(rapportLbc, 3);
  ok(l0?.dansMinutes === 30 && l1?.dansMinutes === 60 && l2?.dansMinutes === 120 && !l0?.pf, 'Leboncoin : 30, 60, 120 min (pas de borne élargie : le poste n’a pas manqué de temps)', JSON.stringify([l0, l1, l2].map((x) => x?.dansMinutes)));
  ok(l3?.verdict === 'a_toi' && l3?.statut === 'needs_user' && l3?.source === 'relancer' && /Rien n'a été retiré : ton annonce est toujours en ligne/.test(l3?.message ?? ''),
    'au 4ᵉ : la personne, « relancer », message vrai (rien retiré, annonce en ligne)', JSON.stringify(l3));
  ok(![l0, l1, l2, l3].some((x) => /lbc_photos_non_affichees/.test(String(x?.motif))), 'jamais « Leboncoin n’a pas affiché l’ajout des photos » pour un élément introuvable du contrôle');
}

console.log('\nC. « Trop lent » : la borne élargie dès la première reprise');
{
  const brut = 'Contrôle avant retrait trop lent sur ce poste (292 s pour remplir le formulaire, borne 300 s) : rien n\'a été retiré.';
  const s = PDR?.classerEchec?.({ platform: 'beebs', action: 'republish', brut, reecrit: '', essais: 0, pf: {}, reprises: 0, build: BUILD });
  ok(s?.verdict === 'reprise' && s?.dansMinutes === 30 && s?.pf?.fill_borne_ms === 1_200_000, 'poste 0.6.186 : reprise dans 30 min, borne 20 min (ce que l’extension promettait)', JSON.stringify(s));
  const s2 = PDR?.classerEchec?.({ platform: 'beebs', action: 'republish', brut, reecrit: '', essais: 1, pf: { fill_borne_ms: 1_200_000 }, reprises: 1, build: BUILD });
  ok(s2?.dansMinutes === 120 && !s2?.pf, 'borne déjà élargie : la règle d’avant (2 h)', JSON.stringify(s2));
  const s3 = PDR?.classerEchec?.({ platform: 'beebs', action: 'republish', brut, reecrit: '', essais: 0, pf: {}, reprises: 0 });
  ok(s3?.dansMinutes === 120 && !s3?.pf, 'sans build (poste inconnu) : la règle d’avant, à l’identique', JSON.stringify(s3));
}

console.log('\nD. Rejeux');
{
  let reprises = 0, auQuatrieme = null;
  for (let i = 1; i <= 10; i++) {
    const s = classer(rapportBeebs, reprises);
    if (s?.verdict === 'reprise') reprises += 1; else { auQuatrieme = i; break; }
  }
  ok(auQuatrieme === 4, `veste Versus (10 contrôles de la nuit) : la personne au ${auQuatrieme ?? '—'}ᵉ rapport (avant : jamais)`);
  reprises = 0; auQuatrieme = null;
  for (let i = 1; i <= 23; i++) {
    const s = classer(rapportLbc, reprises);
    if (s?.verdict === 'reprise') reprises += 1; else { auQuatrieme = i; break; }
  }
  ok(auQuatrieme === 4, `table toscane (23 rapports « illisible ») : la personne au ${auQuatrieme ?? '—'}ᵉ (avant : ≈ 40 contrôles par jour)`);
}

console.log('\nE. Les fonctions');
{
  const u = lire('supabase/functions/update-job-status/index.ts');
  ok(/import \{ prevolNonConcluant, texteBrutPrevolNonConcluant \} from "\.\.\/_shared\/prevol-non-concluant\.js";/.test(u) && /prevolTropLentAPoser \|\| prevolNonConcluantAPoser\)\) \{/.test(u)
    && /brut: typeof body\.error === "string" && body\.error \? body\.error : \(pncJob \? texteBrutPrevolNonConcluant\(pncJob\) : ""\),/.test(u), 'update-job-status passe le contrôle non concluant au classement');
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/"platform_fields->pas_de_rouge->>motif\.eq\.prevol_trop_lent",/.test(g) && /"platform_fields->republish_prevol_formulaire->>verdict\.eq\.trop_lent",/.test(g), 'get-pending-jobs allume le port de remplissage après un contrôle trop lent (14 j)');
}

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
