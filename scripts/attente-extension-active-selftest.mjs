// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une file arrêtée alors que l'extension est ouverte remonte en rouge » (05/11, demande de Nico)
//   npm run selftest:attente-extension-active
//
// LE CAS : le retrait Leboncoin 69f89a6d de louis-seller a attendu du 03/11 15:36 au 05/11 09:52 — l'extension
// d'Amiral (exécutant de la délégation) ouverte tout du long, en pause Leboncoin. Personne ne l'a vu.
// CE QUE CE TEST VERROUILLE (_shared/attente-extension-active.js + ops-digest) :
//   A. le cas de Louis, rejoué à ses heures : signalé, exécutant nommé (Amiral, délégation) ;
//   B. l'exécutant : celui d'une délégation valide (posée des deux côtés), sinon le compte lui-même ;
//   C. ce qui n'est PAS une file arrêtée : file qui avance, ordinateur éteint (ou pas vu depuis 24 h), tâche fraîche,
//      programmée plus tard, en attente de la personne, eBay, file en pause voulue (un retrait, lui, reste suivi),
//      republication automatique pas encore engagée (son créneau) — mais engagée, elle est suivie ;
//   D. la ligne lisible ; E. ops-digest : section rouge, comptée, sujet, colonnes lues.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/attente-extension-active.js")).href);

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const LOUIS = "447d920c-976a-4d8f-aff4-a2998050358c";
const AMIRAL = "faf5021a-479a-4bb3-b3ec-c296770739b7";
const SEULE = "11111111-2222-4333-8444-555555555555";
const H = 3600_000;
const iso = (t) => new Date(t).toISOString();
const flagsLouis = { delegation_leboncoin: { executant: AMIRAL, nom: "Compte-faf5021a" } };
const flagsAmiral = { execute_leboncoin_pour: [LOUIS] };
const profils = (extra = {}) => new Map([
  [LOUIS, { id: LOUIS, username: "client-447d920c", extension_last_seen_at: null, beta_flags: flagsLouis, platform_settings: {}, ...(extra[LOUIS] ?? {}) }],
  [AMIRAL, { id: AMIRAL, username: "Compte-faf5021a", extension_last_seen_at: null, beta_flags: flagsAmiral, platform_settings: {}, ...(extra[AMIRAL] ?? {}) }],
  [SEULE, { id: SEULE, username: "seule", extension_last_seen_at: null, beta_flags: {}, platform_settings: {}, ...(extra[SEULE] ?? {}) }],
]);
const job = (o) => ({ id: o.id ?? "j-" + Math.random().toString(16).slice(2, 10), status: "pending", action: "delete", platform: "leboncoin", error: "", platform_fields: {}, ...o });

console.log("\n[A] le cas de client-447d920c, à ses heures (05/11 09:50 Paris)");
{
  const maintenant = Date.parse("2026-11-05T08:50:00Z");
  const p = profils({ [AMIRAL]: { extension_last_seen_at: "2026-11-05T08:41:51Z" } });
  const j = job({ id: "69f89a6d-0000", user_id: LOUIS, created_at: "2026-11-03T14:36:00Z",
    error: "Leboncoin passe par ton compte Compte-faf5021a : cette tâche partira dès que l'extension FillSell (à jour) sera ouverte" });
  const r = M.filesArretees({ jobs: [j], profils: p, derniersDeparts: new Map([[`${LOUIS}|leboncoin`, Date.parse("2026-11-02T15:52:00Z")]]), maintenant });
  const a = r.arretees[0];
  ok(r.arretees.length === 1, "le retrait de Compte-essai-2 est signalé", JSON.stringify(r));
  ok(a?.delegue === true && a?.executant === AMIRAL && a?.executantNom === "Compte-faf5021a", "exécutant : Compte-faf5021a, par la délégation", JSON.stringify(a));
  ok(a?.attenteH === 42 && a?.vuIlYaMin === 8, `attente 42 h, extension vue il y a 8 min (${a?.attenteH} h, ${a?.vuIlYaMin} min)`);
  const l = a ? M.ligneFileArretee(a) : "";
  ok(/^\[Leboncoin\] client-447d920c — 1 tâche\(s\) en file depuis 42 h \(delete×1\) · exécutée par Compte-faf5021a \(délégation\), extension vue il y a 8 min/.test(l), "la ligne dit qui doit faire la tâche", l);
  ok(/dernier départ 2026-11-02 15:52 UTC/.test(l) && /affiché : « Leboncoin passe par ton compte Compte-faf5021a/.test(l), "la ligne dit le dernier départ et ce que lit la personne", l);
  // Le soir du 03/11 : Amiral vu 2 h après la création seulement → pas encore 6 h d'attente « extension ouverte ».
  const r2 = M.filesArretees({ jobs: [j], profils: profils({ [AMIRAL]: { extension_last_seen_at: "2026-11-03T16:40:00Z" } }), derniersDeparts: new Map(), maintenant: Date.parse("2026-11-03T20:40:00Z") });
  ok(r2.arretees.length === 0 && r2.extensionsFermees === 1, "extension vue moins de 6 h après l'échéance : pas encore une file arrêtée");
}

console.log("\n[B] qui doit faire la tâche");
{
  const p = profils();
  ok(M.executantDe({ user_id: LOUIS, platform: "leboncoin" }, p).id === AMIRAL, "Leboncoin délégué (des deux côtés) → l'exécutant");
  ok(M.executantDe({ user_id: LOUIS, platform: "vinted" }, p).id === LOUIS, "une autre plateforme du même compte → le compte lui-même");
  const unSeulCote = new Map([...p, [AMIRAL, { ...p.get(AMIRAL), beta_flags: {} }]]);
  ok(M.executantDe({ user_id: LOUIS, platform: "leboncoin" }, unSeulCote).id === LOUIS, "délégation posée d'un seul côté → AUCUNE délégation : le compte lui-même");
  ok(M.executantsDeclares(new Map([[LOUIS, p.get(LOUIS)]])).join() === AMIRAL, "les exécutants déclarés sont relus en plus des propriétaires");
}

console.log("\n[C] ce qui n'est pas une file arrêtée");
{
  const maintenant = Date.parse("2026-11-05T09:00:00Z");
  const vu = { [SEULE]: { extension_last_seen_at: iso(maintenant - 5 * 60_000) } };
  const vieux = iso(maintenant - 30 * H);
  const juge = (jobs, o = {}) => M.filesArretees({ jobs, profils: profils(o.extra ?? vu), derniersDeparts: o.departs ?? new Map(), maintenant });
  const base = { user_id: SEULE, created_at: vieux };
  ok(juge([job(base)]).arretees.length === 1, "témoin : un retrait vieux de 30 h, extension vue il y a 5 min, rien parti → signalé");
  const r1 = juge([job(base)], { departs: new Map([[`${SEULE}|leboncoin`, maintenant - 2 * H]]) });
  ok(r1.arretees.length === 0 && r1.filesQuiAvancent === 1, "quelque chose est parti il y a 2 h : la file avance");
  const r2 = juge([job(base)], { extra: { [SEULE]: { extension_last_seen_at: iso(maintenant - 30 * H) } } });
  ok(r2.arretees.length === 0 && r2.extensionsFermees === 1, "extension pas vue depuis l'échéance : ordinateur éteint");
  const r2b = juge([job({ ...base, created_at: iso(maintenant - 400 * H) })], { extra: { [SEULE]: { extension_last_seen_at: iso(maintenant - 100 * H) } } });
  ok(r2b.arretees.length === 0 && r2b.extensionsFermees === 1, "extension vue après l'échéance mais pas depuis 24 h : éteinte, pas rouge");
  ok(juge([job({ ...base, created_at: iso(maintenant - 3 * H) })]).arretees.length === 0, "tâche de 3 h : trop fraîche");
  ok(juge([job({ ...base, next_action_after: iso(maintenant + H) })]).arretees.length === 0, "programmée dans 1 h : rien à dire");
  ok(juge([job({ ...base, platform_fields: { next_action_after: iso(maintenant - 2 * H) } })]).arretees.length === 0, "reprise programmée il y a 2 h : l'échéance repart de là");
  ok(juge([job({ ...base, status: "needs_user" })]).arretees.length === 0, "needs_user : attend la personne");
  ok(juge([job({ ...base, platform: "ebay" })]).arretees.length === 0, "eBay : par l'API, sans extension");
  const pause = { [SEULE]: { ...vu[SEULE], platform_settings: { file_pause: { active: true } } } };
  const r3 = juge([job({ ...base, action: "publish" }), job({ ...base, action: "republish" })], { extra: pause });
  ok(r3.arretees.length === 0 && r3.attentesVoulues === 2, "file mise en pause par la personne : publication et republication attendent sa reprise");
  ok(juge([job(base)], { extra: pause }).arretees.length === 1, "file en pause : un RETRAIT reste suivi (jamais en pause)");
  const r4 = juge([job({ ...base, action: "republish", platform_fields: { republish_source: "auto", republish_step: "a_capturer" } })]);
  ok(r4.arretees.length === 0 && r4.attentesVoulues === 1, "republication automatique pas engagée : son créneau la gouverne");
  ok(juge([job({ ...base, action: "republish", platform_fields: { republish_source: "auto", republish_step: "deleted" } })]).arretees.length === 1,
    "republication automatique déjà retirée (étape deleted) : suivie — l'annonce est hors ligne");
  const plusieurs = juge([job(base), job({ ...base, action: "republish", created_at: iso(maintenant - 50 * H), error: "x" })]).arretees;
  ok(plusieurs.length === 1 && plusieurs[0].n === 2 && plusieurs[0].attenteH === 50, "groupé par compte et plateforme, la plus ancienne échéance donne l'attente");
}

console.log("\n[E] ops-digest : la section rouge");
{
  const od = lire("supabase/functions/ops-digest/index.ts");
  ok(/from "\.\.\/_shared\/attente-extension-active\.js"/.test(od), "ops-digest importe le juge (une seule règle)");
  ok(/🔴 Files arrêtées alors que l'extension est ouverte/.test(od) && /color:#B91C1C;">\$\{esc\(a\)\}<\/li>/.test(od), "section en rouge, chaque ligne en rouge");
  ok(/files_arretees: filesArreteesLignes\.length/.test(od), "comptée dans le total : le digest part dès qu'une file est arrêtée (silence = sain)");
  ok(/subject: `\$\{filesArreteesLignes\.length \? `🔴 Files arrêtées \(extension ouverte\)/.test(od), "le sujet du mail commence par l'alerte rouge");
  ok(/republish_source:platform_fields->>republish_source/.test(od) && /file_pause:platform_settings->file_pause/.test(od) && /beta_flags/.test(od),
    "lit ce que le juge consulte : platform_fields utiles, file_pause, délégation");
  ok(/executantsDeclares\(profils\)/.test(od), "relit les exécutants des délégations");
  // (05/11, point 8 b) le départ se lit aussi sur les traces qui ne s'effacent pas (publication, retrait fait).
  ok(/platform_fields->>processing_since\.gte\.\$\{depuis8j\},published_at\.gte\.\$\{depuis8j\},platform_fields->>deleted_at\.gte\.\$\{depuis8j\}/.test(od),
    "derniers départs : processing_since, publication ou retrait fait, des seuls comptes suspects");
  // (05/11, point 8 c et d) « ouverte » = un passage dans l'heure ; une pause Leboncoin n'est jamais une file arrêtée.
  ok(M.VU_RECEMMENT_MS === 3600_000, "extension « ouverte » : un passage dans l'heure (plus 24 h)");
  ok(M.pauseLeboncoinActive({ platform_settings: { leboncoin: { blocage_acces: { depuis: "2026-11-04T12:36:52Z" } } } })
    && !M.pauseLeboncoinActive({ platform_settings: { leboncoin: { blocage_acces: { depuis: "x", leve_le: "y" } } } })
    && !M.pauseLeboncoinActive({ platform_settings: {} }), "pause Leboncoin en cours : reconnue (levée ou absente : non)");
  {
    const T = Date.parse("2026-11-05T15:00:00Z");
    const jobLbc = { id: "g1", user_id: "g", platform: "leboncoin", action: "publish", status: "pending", created_at: "2026-11-04T12:00:00Z", platform_fields: {} };
    const pr = new Map([["g", { username: "compte-essai-17", extension_last_seen_at: "2026-11-05T14:55:00Z", platform_settings: { leboncoin: { blocage_acces: { depuis: "2026-11-04T12:36:52Z" } } } }]]);
    const r = M.filesArretees({ jobs: [jobLbc], profils: pr, derniersDeparts: new Map(), maintenant: T });
    ok(r.arretees.length === 0 && r.attentesVoulues === 1, "Leboncoin en pause chez client-521b7f89 : attente de la plateforme, pas de rouge", JSON.stringify(r));
    const pr2 = new Map([["g", { username: "x", extension_last_seen_at: "2026-11-05T04:00:00Z", platform_settings: {} }]]);
    ok(M.filesArretees({ jobs: [jobLbc], profils: pr2, derniersDeparts: new Map(), maintenant: T }).arretees.length === 0, "extension muette depuis 11 h : pas « ouverte », pas de rouge");
  }
  ok(/range\(page \* 1000, page \* 1000 \+ 999\)/.test(od), "lu par pages (PostgREST coupe à 1 000 lignes)");
}

// (05/11, point 18 — faux positif : doriane af37fa49) Une publication programmée pas encore servie attend sa plage : voulue.
ok(M.attenteVoulue({ action: "publish", platform_fields: { programmee: true } }, null) === "programmee", "publication programmée en attente de sa plage → attente voulue");
ok(M.attenteVoulue({ action: "publish", platform_fields: { programmee: true, programmee_servie_le: "2026-11-05T13:00:00Z" } }, null) === null, "programmée DÉJÀ servie et toujours en file → plus une attente voulue");
const od = readFileSync(join(ROOT, "supabase/functions/ops-digest/index.ts"), "utf8");
ok(/programmee:platform_fields->programmee, programmee_servie_le:platform_fields->>programmee_servie_le/.test(od) && /platform_fields: \{ [^}]*programmee, programmee_servie_le \}/.test(od),
  "ops-digest lit les deux clés de la publication programmée");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — une file arrêtée alors que l'extension est ouverte remonte en rouge`);
process.exit(ko ? 1 : 0);
