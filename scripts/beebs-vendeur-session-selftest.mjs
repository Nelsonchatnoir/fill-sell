// Autotest — QUEL VENDEUR BEEBS LE RELEVÉ INTERROGE (2026-09-25)
//   npm run selftest:beebs-vendeur-session
//
// Ce que ce test garantit, et qui a été payé : MEMINIANDMOVE et
// pironneau.vincent avaient six relevés Beebs rouges parce que leur page
// « Mes annonces » était vide (annonces retirées) — aucune graine, aucun
// vendeur, aucun compteur. Le relevé lit maintenant le vendeur connecté dans le
// cookie de session (jeton Firebase), et contrôle les annonces que FillSell
// connaît contre l'index : deux sources qui se contredisent = rien n'est conclu.
//
// Les fonctions sont extraites de chrome-extension/content-scripts/beebs.js :
// ce test relit la source livrée, pas une copie.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/beebs.js"), "utf8").split("\r\n").join("\n");
const extraire = (entete) => {
  const debut = src.indexOf(entete);
  const fin = src.indexOf("\n}\n", debut);
  if (debut < 0 || fin < 0) { console.error(`✗ « ${entete} » introuvable dans beebs.js`); process.exit(1); }
  return src.slice(debut, fin + 3);
};
const corps = [
  extraire("function beebsUidDeJeton(jeton) {"),
  extraire("function beebsChoisirUid({"),
].join("\n");
const { beebsUidDeJeton, beebsChoisirUid } = new Function(`${corps}; return { beebsUidDeJeton, beebsChoisirUid };`)();

let ko = 0;
const verifie = (nom, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { ko++; console.log(`  ✗ ${nom} ${detail}`); }
};
const b64url = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (charge) => `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(charge)}.signature`;

console.log("1. L'IDENTIFIANT LU DANS LE JETON DE SESSION");
const UID = "KkROmCs9BAQ0tDmwtFekFQ3ygf12"; // forme réelle : 28 caractères
verifie("jeton Firebase → user_id",
  beebsUidDeJeton(jwt({ iss: "https://securetoken.google.com/babytouch-782e4", user_id: UID, sub: UID, name: "Hélène Ça" })) === UID);
verifie("sans user_id → sub",
  beebsUidDeJeton(jwt({ iss: "https://securetoken.google.com/babytouch-782e4", sub: UID })) === UID);
verifie("autre émetteur → null (pas un jeton Firebase)",
  beebsUidDeJeton(jwt({ iss: "https://accounts.example.com", user_id: UID })) === null);
verifie("uid de forme douteuse → null (il part dans un filtre d'index)",
  beebsUidDeJeton(jwt({ iss: "https://securetoken.google.com/x", user_id: "abc OR user_id:zzz" })) === null);
verifie("jeton illisible → null", beebsUidDeJeton("pas.un.jeton") === null && beebsUidDeJeton("") === null && beebsUidDeJeton(null) === null);

console.log("\n2. QUEL VENDEUR INTERROGER");
const A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBB";
let c = beebsChoisirUid({ uidGraines: A, uidSession: A, uidsConnus: [A, A], graines: 3 });
verifie("page, session et annonces connues d'accord → vendeur des graines", c.uid === A && c.source === "index_public");
c = beebsChoisirUid({ uidGraines: A, uidSession: null, uidsConnus: [], graines: 3 });
verifie("sans cookie lisible : comme avant (graines seules)", c.uid === A && c.source === "index_public");
c = beebsChoisirUid({ uidGraines: null, uidSession: A, uidsConnus: [], graines: 0 });
verifie("LE CAS MEMINIANDMOVE : page vide, rien de connu dans l'index → compte connecté", c.uid === A && c.source === "session");
c = beebsChoisirUid({ uidGraines: null, uidSession: A, uidsConnus: [A], graines: 0 });
verifie("page vide, annonce connue sous le compte connecté → compte connecté", c.uid === A && c.source === "session");
c = beebsChoisirUid({ uidGraines: B, uidSession: A, uidsConnus: [], graines: 2 });
verifie("page d'un autre compte que la session → rien n'est conclu", c.uid === null && /autre compte/.test(c.motif));
c = beebsChoisirUid({ uidGraines: null, uidSession: A, uidsConnus: [B], graines: 0 });
verifie("annonce connue en ligne sous un autre compte → rien n'est conclu", c.uid === null && /autre compte/.test(c.motif));
c = beebsChoisirUid({ uidGraines: A, uidSession: null, uidsConnus: [A, B], graines: 1 });
verifie("sans session, annonces connues sous deux comptes → rien n'est conclu", c.uid === null);
c = beebsChoisirUid({ uidGraines: null, uidSession: null, uidsConnus: [A], graines: 0 });
verifie("ni page ni session, annonces connues sous UN compte → ce compte", c.uid === A && c.source === "annonces_connues");
c = beebsChoisirUid({ uidGraines: null, uidSession: null, uidsConnus: [], graines: 0 });
verifie("rien du tout → motif d'avant, à l'octet", c.uid === null && c.motif === "aucune annonce connue pour retrouver le vendeur");
c = beebsChoisirUid({ uidGraines: null, uidSession: null, uidsConnus: [], graines: 4 });
verifie("graines introuvables, sans session → motif d'avant, à l'octet",
  c.uid === null && c.motif === "vendeur introuvable dans l'index à partir des annonces connues");

if (ko) { console.log(`\n✗ ${ko} cas en échec`); process.exit(1); }
console.log("\n✓ tous les cas passent");
