// ═══════════════════════════════════════════════════════════════════════════
// DONNÉES DE CLIENTS DANS LE CODE — verrou (11/11/2026, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règle : jamais de nom, pseudo ou e-mail de client dans le code, les commentaires,
// les fixtures ni les docs suivis — l'id8 du compte à la place (« le compte 2f4383e9 »),
// ou une valeur factice manifeste (`vendeur-essai-1`, `client@exemple.invalid`).
// Règle écrite : docs/regles/depot-git-build-site.md § « Données de clients ».
//
// Ce verrou relit les fichiers SUIVIS de src/, supabase/functions/, chrome-extension/,
// serveur-cloud/ et scripts/, et tombe rouge sur :
//   1. toute adresse e-mail hors liste blanche (domaines de l'équipe, de test, des
//      plateformes ; boîtes de l'équipe par empreinte), COMMENTAIRES COMPRIS ;
//   2. toute identité de client connue (empreintes SHA-256 ci-dessous, jamais le nom)
//      dans une DONNÉE : chaîne, gabarit, valeur JSON, texte d'une page — pas dans un
//      commentaire ni un identifiant de code (passe « b », plus tard : `--commentaires`,
//      `--identifiants` étendent le contrôle).
// Exclusions (« c », jamais) : migrations déjà appliquées (supabase/migrations, hors
// périmètre), noms de fichiers (un chemin qui désigne un fichier suivi), tables de
// sauvegarde (identifiant qui porte « sauvegarde », « backup » ou « _bak »), et les
// valeurs FONCTIONNELLES listées dans EXCEPTIONS (empreinte du chemin + de l'identité,
// nombre exact d'occurrences permises, raison).
//
// Le contrôle ne recopie AUCUN nom ni e-mail de client : une identité est une
// empreinte (16 premiers caractères hexadécimaux de SHA-256 de « fillsell:<jeton> »,
// jeton = minuscules, sans accents, lettres et chiffres seulement : « Prénom-Nom » →
// « prenomnom »). Un rouge se lit « fichier:ligne — identité n°k » ; la ligne dit où
// regarder, jamais qui.
//
//   npm run selftest:donnees-clients                 (le contrôle)
//   node scripts/donnees-clients-selftest.mjs --racine <dossier>   (une copie)
//   … --commentaires   (étend le contrôle des noms aux commentaires : passe « b »)
//   … --identifiants   (étend aux identifiants de code : variables, tables temporaires)
//   … --empreinte <jeton>   (affiche l'empreinte d'un jeton, pour la liste)
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(ICI, "..");
const ARGS = process.argv.slice(2);
const arg = (nom) => { const i = ARGS.indexOf(nom); return i >= 0 ? ARGS[i + 1] : null; };
const AVEC_COMMENTAIRES = ARGS.includes("--commentaires");
const AVEC_IDENTIFIANTS = ARGS.includes("--identifiants");
const RACINE = path.resolve(arg("--racine") ?? DEPOT);

// ── Empreintes ─────────────────────────────────────────────────────────────
export const normaliser = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const jeton = (t) => (normaliser(t).match(/[a-z0-9]+/g) ?? []).join("");
export const empreinte = (cle) => crypto.createHash("sha256").update("fillsell:" + cle).digest("hex").slice(0, 16);

const PRINCIPAL = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (PRINCIPAL && arg("--empreinte") != null) {
  console.log(empreinte(jeton(arg("--empreinte"))));
  process.exit(0);
}

// Identités de clients relevées le 11/11/2026 (relevé complet hors dépôt). Un
// seul mot : contrôlé seul ; plusieurs mots (prénom nom, pseudo à tiret) : contrôlés
// joints, deux à quatre mots consécutifs. Les prénoms seuls trop courants (marques,
// mots du français) ne sont pas dans la liste : remplacés à la main le 11/11.
const IDENTITES_UN_MOT = new Set([
  "004fd7cc4d7c3c2c", "022b8d5c832099fd", "025d321ee8c12cdc", "030443851ced2fd2", "053ef426c8b9a16d", "0589eb354f91cd09",
  "059a055e4504784c", "05a3554fbaa87719", "06a47e40ce40127d", "093faa17b01ce84f", "09f91292571f1528", "0a0050a4faaa0459",
  "0c09658e009a4314", "0da47d97ba5d9ca7", "0e01aff7d94d05c6", "0f3fb3637088566b", "11d57339edf29709", "12b81e7e15351a66",
  "13170742c16399a3", "135d0a2b006c732c", "1491ecfd39f92fca", "171e6bab279a2ffa", "191dd48870314029", "19a81570ec4e1986",
  "1a555b35acc36683", "1a83242e46f7ce0b", "1cd1acd6078527d9", "1d7d44579c355967", "2221b06abe4e5373", "225f529f694fb082",
  "22c17a2720536931", "2313f35a86cc6539", "23b4f3316221f27e", "245f48a74898b19a", "24a81f2dc9fbbeac", "2535ed3738748837",
  "25c294d96dc78619", "26bd66265fee4d42", "29910257f181e176", "29945fffc766c964", "2a0aba952684cfb8", "2bfe83125ff3396b",
  "2c1b2715a0a06874", "2c301db8d1011042", "2e3e858aa2b13fbb", "2e9c4435979b1c1f", "2eb7bc3cb17c0216", "2f11863f5a481600",
  "30f63520df1ebc5b", "31547330619dd166", "336cd5c89f1541a2", "33bb9d1c6eac9f36", "345a07c0f06e8ad9", "346e1196915ecaa8",
  "34c8ba2c66b0362b", "35a43990bcd0a53c", "363c3709ef121d70", "367b47447df2d6a3", "368528ee8585f7fc", "372017aaad3a7f56",
  "38fc4b2a693cd31f", "39180bddad00bf83", "395feb1a63dea2a9", "39dc9e109ecbae78", "3c0d137944503514", "3d4f51d8a396dee7",
  "3e28415a0e8d69c0", "41d0c4ce6826ccce", "4325cc5a84169583", "448a30721557db83", "45c02cbf7c732cc2", "476938fbb75f2c7d",
  "47720f6223134407", "4a4a44d8f4b6959c", "4a8294c94ae114d8", "4c1bd6d128cff431", "4d2db5d5206a4b6b", "4dfe3c1ce41021ed",
  "4e91a0a1d42bd25a", "4f3abbdd7d1246c3", "4f84907a0d462653", "4fa277b2c33f3a8d", "5242ff8d9bfc3c44", "52555180efed1d62",
  "52d2233809b08a78", "531d3a208774dfcf", "55d3aa070c5de9f8", "565242fa75b8da12", "56d65d91188cfb25", "5f30ca353f1abbbb",
  "5f817bffaccd83d1", "6019b8c91ceb54d9", "6046f36c3ffcd497", "637bb898cdb3d331", "63dcbd9b13073fe5", "64e2c1e510a4ac99",
  "64ec70c1f418194f", "6717bcd1b6b72ce2", "6779b9eccd372863", "6853fcd233265135", "68c9194a7cc71dd6", "69216fae68172fd2",
  "69953d2f464019c3", "69ac27dc2283b36c", "6a240f95e6be81df", "6aa83912703eb6aa", "6cd03ef8e990d4fc", "6df115b969f74275",
  "6fcd1aa9490cbc48", "707780770bfe359d", "70dbecf10e35098f", "715fe6bcbb6b5c26", "749f060a65c95e56", "75e2907bbea3b5f1",
  "7623e4bc9cd6ca1f", "7836ed1c5e3e3b52", "7b6fd488a151f111", "7c0ab51e6622d991", "7c0dc14cfb7ae6d6", "7c6bece45645dee0",
  "7d01f233b017a6bc", "7d1a9ed157de9fe0", "7d68e3be10f44a36", "7e6ae1a781cb7757", "7e8d53aa31c07473", "7f7bfc37645d2cf6",
  "7f8f5d9483b8af87", "80699afe28a74b3e", "8453083ae7e624c8", "84c36d196b5ccd08", "87602a6173b7c39d", "88f0b621dff203e0",
  "8a0091139be8211b", "8adb9becbbfa03f5", "8b83c4d0052e7103", "8beb09a0506eecd1", "8c3dff1b9ed1c62d", "903071083a4e886c",
  "9086d1a7e0000c24", "90babb57066a9dee", "90ed6438ee84a1a0", "92ce9da7b1108d28", "9399c8db50206565", "952e9748043e76fd",
  "95feeafa5df2b187", "9641c2e274feb0c7", "968557d8aaf98a5e", "98f0e17f7a48b4bd", "993cd893a34f0a52", "9988ee5e1dda98e6",
  "9a59a4c3ac109942", "9a7eda1163b12c4c", "9ad60f10f276fc38", "9c4218ee9a28faf2", "9c564e582c14bff0", "9d63473d7ce10690",
  "9e0ada53c03ce61a", "9f3031ba98fa950a", "a1f6f9a030dfce1c", "a21b83ce91c6b897", "a33ebc3c3795ffa5", "a34444ca52e0c12d",
  "a34b1f06b099b9d7", "a4e27ad84d568f56", "a5f14df13887b386", "a662437c143ce5f2", "aa78747dfe6ae137", "ab4a729f7b7cdc37",
  "ad37435d45c558b7", "adeaa5454ccd4812", "ae61d0be9a677346", "ae840565382f5564", "af1bdeca372699ef", "b07a50597268a10b",
  "b0b890a79b4e9f9e", "b18c87c3304d58c4", "b222b4a13e606576", "b24f6bda2462e969", "b39290d5e1398b89", "b4ec5814c858b2f9",
  "b5472173d4c977f0", "b56a910a125ce2b7", "b5e3b9d0ccc7459c", "b84690e6c5678b39", "ba7bc8822313bdf6", "bbaf1a3a797c61cb",
  "bbb8313f7bcbe947", "bc0009433b481e6d", "bdd006e676572123", "bedd892a707e9903", "c004b4e079f674bd", "c0304a04bafdc399",
  "c04d2f7af2ff405d", "c194f6a8b6334814", "c1b990d2aade47bb", "c3caaeeb19a90c09", "c3cd38d4000fab14", "c42f4bc437811319",
  "c737999ceca5d892", "c75187dea9e02a42", "c753ac3f02721496", "ca8881653350c647", "cbf31dbd6f2f539b", "ccd314822aad58be",
  "ccd511f91dafd243", "ce454e85eefa5b49", "cee153c9a64c93b6", "d02057910b310b00", "d052cbb1f417a4ef", "d11059411b1a7637",
  "d27a30ca35c9aa96", "d314c1f580806c69", "d33f947c36231a4d", "d34edebcd8fd5f18", "d3aaa5609b68f951", "d4148969f6de95b0",
  "d461f5a0e87f7826", "d6d0a2701100ea4b", "d9a07399bab4eb7e", "dbba6835eaf6752c", "dd769f39b12e2c6b", "dea79ddbbb751262",
  "df6eb5f2267e54dc", "df9479f0c6c2e57c", "dfc308edc1532a06", "e19ab98ec9d55064", "e1bcd2af2a244da1", "e30df714fb854da0",
  "e33fbe503f217fd3", "e41eabf63de43359", "e508bb701d6579ae", "e58495ceb842bcd7", "e5ba4b014c446d3a", "e6042514405fc6c2",
  "e61998e8a8d37c3a", "e61e06281421790a", "e68e725df6a4b31f", "e6dbdf9110629820", "e778a33ef15d158d", "e93cab38202f9f3e",
  "eb7178d1ae41c5d1", "eb8f0ca7cfdc3dac", "ec3b05547839119a", "ec5bc03da99cb661", "ec947a7ab542188a", "ed228e4df540ccd5",
  "ed36b04c94564ea8", "ee01db730d2be295", "ef04c1d71c431ec0", "ef1d356979db135c", "f3304d54d690f999", "f456cf6d5a6823f9",
  "f5adebd1d1d5b4c9", "f61e52631d428ff0", "f67dd5c194a549b9", "f6bbfa710c8f44b8", "f7103f4f72270bbb", "f73fd7a74a4370f4",
  "f758eb4527e4c5cf", "f7faaed5398bd210", "f862e57685467b0a", "f8d199930b89785e", "f9cd8e42123e1062", "fb5140390507c418",
  "fb6650d00a8fc93a", "fdac43e8a78dff3f", "fe3483dd87bb3d2d", "ff7f9a34ec652293", "ffce50dd6d982c93", "fff081e7ff8bb2a7",
]);
const IDENTITES_PLUSIEURS_MOTS = new Set([
  "02d3324bc7d5f1dd", "03b61c92778579b0", "05fbfa42da00cc3a", "06fad102927aa9bd", "0eca73d2ff1859a2", "0edd43a67871ccca",
  "0f3cd7c25ce275da", "0fb1be39ec75195c", "1243952853b82097", "12fef9bed0f31329", "190cb767e8677cc0", "1a181d307c002b25",
  "1aca8674aa2cb1bb", "1c959a9626f9c5b4", "1d896888bfe99f93", "1e1c8b2af10c94f6", "1f13ab915b040e2d", "20e7572c083537b6",
  "231b8356746be697", "261ff071910bd786", "2c8ae88efaf14b0d", "30438341dae6e202", "3660715dc3288128", "36a37e617c6c1166",
  "36eaf3f2cf260961", "3a0613c47053508b", "3adf490105f06275", "414f2947b699b1dc", "42a5f9f012409ea1", "44916e3094bf8fa9",
  "49cb68cbe863addd", "4c0e1059159b8311", "4d82792d0a219732", "4fc4c957ae975688", "514700b2c73baa40", "524fc96bd69a5024",
  "541c2e047dd6de7d", "5541e296d52f063c", "55d1acadc5a5053c", "55f8bd1b5b273487", "57f0fe9189c257ab", "58154243ad84152f",
  "5974cb41e56bc8ec", "5a61b178d9eaa629", "5b951440410c1d3b", "62b5aded3cccd9bf", "65bce514f292f06f", "68de7823d70d4ec3",
  "6ae0bc072f8946a0", "6b6316733cbd91ea", "6be98c737d25c848", "723ad0759d485b74", "7358ee5ac96ab2f4", "73c023997ba814f1",
  "755cd47aa86c0261", "757157bca6856397", "760bdc0f69aae8e9", "762354a3ebdc1ff0", "782c6b7fc6281fc0", "788198204bc221e1",
  "7ae94ceabda1dcb2", "7c12084d30267611", "7e1e7b86011ff6b5", "8154272bbc58d1be", "824aedb74c7d9a45", "82e14095fb81ee15",
  "83022593ad00646a", "841bc43dfb3fe5e2", "84542e3340174a1b", "854cef4d0d3c8098", "86a68c82026a7c62", "88b1b39aabfad762",
  "8cd308bec7c5ccbf", "90a204adb40675b6", "9273c57c7eb44d33", "932c093584cca4c4", "989e9c14c46a5939", "992cf05297b94b60",
  "9af3df6b2976688a", "9b50bdb8869e10fb", "9d65c6dc511600c2", "9f64769f3e5a6ae3", "a0d5a4de053ea175", "a613a1aa47035dac",
  "a7deac91b1311ea3", "a8cd557e965f7e2c", "ac9734a9a0c4ec6e", "b0c8030a8fb64833", "b1945f7c654c9750", "b41fa51c56167779",
  "b5abf0eda53c0cb8", "b6298801d951db65", "b83f8eff54ad990e", "ba5a189e5c8a0fe7", "bc847a7344efabd1", "be47e1f3573ecf80",
  "c015fae0e9fefda1", "c0f530d7b9afa56f", "c12c746dc77d2f3b", "c1e8c94be12457d9", "c4bc5f07ede74fa9", "c4fb20aa194602bb",
  "cd30ffa014ad00e9", "cd58c3e47985cbc6", "d25df66286fe6712", "d6b6ad2cdbc2081a", "d6c660c6a35a19a4", "da43d14ad7cdb8e5",
  "dec7f7800efb610d", "decc4d725a946cec", "e0142acd42d72dc1", "e3fa97fe3de65de0", "ed06fb8e274608e6", "ee7c11b76d44301d",
  "f264be32f212739f", "f2d835a8adfc7f45", "f30608ffefb8bcab", "f9a163fc7a970937", "f9d576a024a6f94c", "fdf50fe1d34d3983",
  "fe018de54b397bdd", "ff0cb8de3f370cce", "ff6394ebb2608e66",
]);

export { IDENTITES_UN_MOT, IDENTITES_PLUSIEURS_MOTS };

// Boîtes de l'équipe (Nico, Ornella, leurs comptes d'essai) : adresse débarrassée
// de son alias « +suffixe », en minuscules — par empreinte, jamais en clair.
const BOITES_EQUIPE = new Set([
  "2a4ec823453b866f", "72e5ba2158d9bfcb", "4bd5c32a0b804348", "39b3371fc6a9b015",
  "ece1703fb3cd90bf", "9929ccacfb52addb", "a9406eff3f7acae7",
]);

// Domaines jamais clients : l'équipe, les valeurs factices, les plateformes et services.
const DOMAINES_PERMIS = [
  "fillsell.app", "fillsell.fr", "fillsell.invalid",
  "exemple.fr", "exemple.com", "exemple.org", "exemple.net", "exemple.invalid", "exemple.test",
  "example.com", "example.org", "example.net",
  "iam.gserviceaccount.com", "amazonaws.com",
  "vinted.fr", "vinted.com", "leboncoin.fr", "ebay.com", "ebay.fr", "beebs.app", "depop.com",
  "stripe.com", "resend.dev", "resend.com", "supabase.co", "supabase.io", "users.noreply.github.com",
];
const SUFFIXES_PERMIS = [".invalid", ".test", ".example", ".localhost"];
const domainePermis = (d) => DOMAINES_PERMIS.some((p) => d === p || d.endsWith("." + p)) || SUFFIXES_PERMIS.some((s) => d.endsWith(s));
// « a@b.fr », « x@ex.fr » : adresse factice manifeste (trois caractères au plus de chaque côté).
const factCourte = (a) => /^[a-z0-9.]{1,3}@[a-z]{1,2}\.[a-z]{2,3}$/.test(a);
const EXT_FICHIER = /^(png|jpe?g|webp|avif|gif|svg|ico|js|mjs|cjs|ts|tsx|jsx|css|json|html?|md|txt|sql|map|woff2?)$/;

// Valeurs fonctionnelles gardées (le 11/11/2026) : empreinte du chemin (`empreinte(chemin)`),
// empreinte de l'identité ou de l'adresse, nombre d'occurrences permises, raison.
const EXCEPTIONS = [
  // (14/11, lot « zéro friction », bloc C2) Corps de PROD de rapprochement_v3_fiche_de relu à l'octet (pg_get_functiondef) : son
  // commentaire daté du 26/10 nomme un compte ; le banc revérifie le md5 de prod, la fixture ne peut pas être retouchée.
  { f: "6c295fc19f07208e", e: "841bc43dfb3fe5e2", n: 1, pourquoi: "copie mot pour mot d'une fonction de prod (commentaire), md5 revérifié par le banc (c)" },
  { f: "6c295fc19f07208e", e: "0f3fb3637088566b", n: 1, pourquoi: "copie mot pour mot d'une fonction de prod (commentaire), md5 revérifié par le banc (c)" },
  { f: "d60acf6476f89436", e: "2eb7bc3cb17c0216", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "6993fc6954a59ade", e: "e0ec6508b91a0e62", n: 1, pourquoi: "selftest --prod : comparé à la vraie adresse en base (fonctionnel)" },
  { f: "6993fc6954a59ade", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "selftest --prod : comparé à la vraie adresse en base (fonctionnel)" },
  { f: "6993fc6954a59ade", e: "42a5f9f012409ea1", n: 1, pourquoi: "selftest --prod : comparé à la vraie adresse en base (fonctionnel)" },
  { f: "6c1f91a25608db6c", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "f58acbc591a3f7d3", e: "1c6ac6157dd6f8bf", n: 2, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "f58acbc591a3f7d3", e: "e0ec6508b91a0e62", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "f58acbc591a3f7d3", e: "9641c2e274feb0c7", n: 2, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "f58acbc591a3f7d3", e: "d6d0a2701100ea4b", n: 1, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "e5d6c7d2a52d91c8", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "b6f5556363811526", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "b6f5556363811526", e: "d6d0a2701100ea4b", n: 1, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "b6f5556363811526", e: "9641c2e274feb0c7", n: 2, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "20d1fd56ee29018d", e: "d6d0a2701100ea4b", n: 1, pourquoi: "copie d'un texte de réparation ou de migration (c), cherché ou rejoué tel quel" },
  { f: "20d1fd56ee29018d", e: "42a5f9f012409ea1", n: 1, pourquoi: "copie d'un texte de réparation ou de migration (c), cherché ou rejoué tel quel" },
  { f: "297e2ebc8e3bebd1", e: "1c6ac6157dd6f8bf", n: 3, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "297e2ebc8e3bebd1", e: "e0ec6508b91a0e62", n: 2, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "297e2ebc8e3bebd1", e: "42a5f9f012409ea1", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "297e2ebc8e3bebd1", e: "d6d0a2701100ea4b", n: 2, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "c386f0691b696df2", e: "1c6ac6157dd6f8bf", n: 3, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "c386f0691b696df2", e: "e0ec6508b91a0e62", n: 2, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "c386f0691b696df2", e: "42a5f9f012409ea1", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "c386f0691b696df2", e: "d6d0a2701100ea4b", n: 4, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "24a392c9e6e78d07", e: "42a5f9f012409ea1", n: 1, pourquoi: "copie d'un texte de réparation ou de migration (c), cherché ou rejoué tel quel" },
  { f: "df28442c3e67c96e", e: "637bb898cdb3d331", n: 12, pourquoi: "générateur d'une migration appliquée (c) : son texte doit rester celui de la migration" },
  { f: "48d34e71e5d4a4f6", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "a5ce8cb64b1e5a4c", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "14c91fe640db9548", e: "2eb7bc3cb17c0216", n: 1, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "14c91fe640db9548", e: "e68e725df6a4b31f", n: 1, pourquoi: "essai sur base jetable : valeur de données rejouée telle quelle" },
  { f: "8a43e61eb145d0fa", e: "7ae94ceabda1dcb2", n: 3, pourquoi: "générateur d'une migration appliquée (c) : son texte doit rester celui de la migration" },
  { f: "8a43e61eb145d0fa", e: "b0b890a79b4e9f9e", n: 3, pourquoi: "générateur d'une migration appliquée (c) : son texte doit rester celui de la migration" },
  { f: "8a43e61eb145d0fa", e: "68de7823d70d4ec3", n: 2, pourquoi: "générateur d'une migration appliquée (c) : son texte doit rester celui de la migration" },
  { f: "8a43e61eb145d0fa", e: "42a5f9f012409ea1", n: 1, pourquoi: "générateur d'une migration appliquée (c) : son texte doit rester celui de la migration" },
  { f: "f566daafa017441d", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "744e68283a09182b", e: "993cd893a34f0a52", n: 2, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b ») ; copie d'un texte de réparation ou de migration (c), cherché ou rejoué tel quel" },
  { f: "99d7941dfc42940f", e: "637bb898cdb3d331", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "d0cbe269ca04e391", e: "9086d1a7e0000c24", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "53c5af72b126fee2", e: "34c8ba2c66b0362b", n: 2, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "a303eea39653bd15", e: "86a68c82026a7c62", n: 2, pourquoi: "copie d'un texte de réparation ou de migration (c), cherché ou rejoué tel quel" },
  { f: "f5175d8d2002424e", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "093cff66680c2e81", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "b01281a9fbaa4ac0", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "8566844ed30781de", e: "022b8d5c832099fd", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "bc3120bf7f16e57c", e: "19a81570ec4e1986", n: 1, pourquoi: "copie d'un texte de réparation ou de migration (c), cherché ou rejoué tel quel" },
  { f: "87a08c071f6edec7", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "f9b8d027b4800200", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "copie mot pour mot d'une migration, d'une sauvegarde ou d'une réparation (c)" },
  { f: "8bfef6b199983867", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "fichier de sauvegarde (c)" },
  { f: "8bfef6b199983867", e: "fb6650d00a8fc93a", n: 1, pourquoi: "fichier de sauvegarde (c)" },
  { f: "b0e9e4a5d174d976", e: "6717bcd1b6b72ce2", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "db78f56524b06479", e: "2313f35a86cc6539", n: 3, pourquoi: "fichier de sauvegarde (c)" },
  { f: "6b2220caf90ab7d8", e: "d6d0a2701100ea4b", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "6b2220caf90ab7d8", e: "42a5f9f012409ea1", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "83676001bb604f51", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "83676001bb604f51", e: "e0ec6508b91a0e62", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "83676001bb604f51", e: "42a5f9f012409ea1", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "83676001bb604f51", e: "d6d0a2701100ea4b", n: 2, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "2282e872d2f320d1", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "2282e872d2f320d1", e: "e0ec6508b91a0e62", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "2282e872d2f320d1", e: "42a5f9f012409ea1", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "2282e872d2f320d1", e: "d6d0a2701100ea4b", n: 2, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "624176a4b3053ee7", e: "d6d0a2701100ea4b", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "c30e2c157699b319", e: "d6d0a2701100ea4b", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a3fb51e9a7759e17", e: "42a5f9f012409ea1", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "bd09f110c4c6a4e7", e: "e68e725df6a4b31f", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "be37ae84729bb02f", e: "bb6730ac9bbcb640", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "be37ae84729bb02f", e: "20e7572c083537b6", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "be37ae84729bb02f", e: "6853fcd233265135", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "e3c41f7ae28cd046", e: "d461f5a0e87f7826", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "6caafaf6a2b13d72", e: "e0ec6508b91a0e62", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6caafaf6a2b13d72", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6caafaf6a2b13d72", e: "42a5f9f012409ea1", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6caafaf6a2b13d72", e: "aa78747dfe6ae137", n: 4, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "6812a71aba7ab7c7", e: "e0ec6508b91a0e62", n: 2, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6812a71aba7ab7c7", e: "42a5f9f012409ea1", n: 2, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "a71c8aecf64c5c7a", e: "b222b4a13e606576", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "514700b2c73baa40", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "053ef426c8b9a16d", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "6b6316733cbd91ea", n: 4, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "004fd7cc4d7c3c2c", n: 4, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "41d0c4ce6826ccce", n: 3, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "af1bdeca372699ef", n: 14, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "a71c8aecf64c5c7a", e: "f8d199930b89785e", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "047d24c133584fa7", e: "6b6316733cbd91ea", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "047d24c133584fa7", e: "004fd7cc4d7c3c2c", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "047d24c133584fa7", e: "ca8881653350c647", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "dd35b62e30bfd497", e: "dec7f7800efb610d", n: 6, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "dd35b62e30bfd497", e: "9ad60f10f276fc38", n: 6, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "dd35b62e30bfd497", e: "b222b4a13e606576", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "dd35b62e30bfd497", e: "5f817bffaccd83d1", n: 9, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "dd35b62e30bfd497", e: "52d2233809b08a78", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "e0258f032247f5f3", e: "6b6316733cbd91ea", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "e0258f032247f5f3", e: "004fd7cc4d7c3c2c", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "e0258f032247f5f3", e: "9086d1a7e0000c24", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "e0258f032247f5f3", e: "82e14095fb81ee15", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "e0258f032247f5f3", e: "af1bdeca372699ef", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "e0258f032247f5f3", e: "f8d199930b89785e", n: 1, pourquoi: "réparation exécutée en prod : trace exacte de ce qui a tourné" },
  { f: "cc89eeeda080ed53", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6411d02561bee578", e: "92c20d7ab0f6e2a9", n: 4, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6411d02561bee578", e: "44916e3094bf8fa9", n: 4, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "6411d02561bee578", e: "1a555b35acc36683", n: 4, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "79820642cc39cf4e", e: "1c6ac6157dd6f8bf", n: 1, pourquoi: "réparation exécutée en prod : sélecteur ou valeur écrite (l'inverse doit défaire à l'identique)" },
  { f: "811bcd50659799ac", e: "9273c57c7eb44d33", n: 2, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "d47de21f85bff709", e: "7e1e7b86011ff6b5", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "d47de21f85bff709", e: "11d57339edf29709", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "596abb821642eb0d", e: "637bb898cdb3d331", n: 3, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "b87d929859af12e6", e: "49cb68cbe863addd", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
  { f: "b87d929859af12e6", e: "5f30ca353f1abbbb", n: 1, pourquoi: "texte cherché tel quel dans un commentaire ou un fichier en cours ailleurs (passe « b »)" },
];

// ── Lecteur : qu'est-ce qui est commentaire, chaîne, code ? ────────────────
// Rend, pour chaque caractère, sa classe : "k" commentaire, "s" chaîne/texte, "c" code.
const AVANT_REGEX = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^"]);
const MOTS_AVANT_REGEX = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);

export function classesJs(t) {
  const n = t.length; const k = new Uint8Array(n); // 0 code, 1 commentaire, 2 chaîne
  const pile = []; // profondeurs d'accolades des ${ } ouverts dans des gabarits
  let i = 0; let dernier = ""; let dernierMot = ""; let prof = 0;
  const gabarit = () => { // i sur le caractère qui suit le « ` » ouvrant
    while (i < n) {
      const ch = t[i];
      if (ch === "\\") { k[i] = 2; if (i + 1 < n) k[i + 1] = 2; i += 2; continue; }
      if (ch === "`") { k[i] = 2; i++; return "fin"; }
      if (ch === "$" && t[i + 1] === "{") { k[i] = 2; k[i + 1] = 2; i += 2; pile.push(prof); prof = 0; return "expr"; }
      k[i] = 2; i++;
    }
    return "fin";
  };
  while (i < n) {
    const ch = t[i];
    if (ch === "/" && t[i + 1] === "/") { while (i < n && t[i] !== "\n") k[i++] = 1; continue; }
    if (ch === "/" && t[i + 1] === "*") { const j = t.indexOf("*/", i + 2); const e = j < 0 ? n : j + 2; k.fill(1, i, e); i = e; continue; }
    if (ch === "'" || ch === '"') {
      k[i++] = 2;
      while (i < n && t[i] !== ch && t[i] !== "\n") { if (t[i] === "\\") k[i++] = 2; if (i < n) k[i++] = 2; }
      if (i < n && t[i] === ch) k[i++] = 2;
      dernier = "a"; dernierMot = ""; continue;
    }
    if (ch === "`") { k[i++] = 2; gabarit(); dernier = "a"; dernierMot = ""; continue; }
    if (ch === "/" && (AVANT_REGEX.has(dernier) || MOTS_AVANT_REGEX.has(dernierMot))) {
      let j = i + 1; let classe = false;
      while (j < n && t[j] !== "\n") {
        if (t[j] === "\\") { j += 2; continue; }
        if (t[j] === "[") classe = true; else if (t[j] === "]") classe = false;
        else if (t[j] === "/" && !classe) break;
        j++;
      }
      if (j < n && t[j] === "/") { j++; while (j < n && /[a-z]/.test(t[j])) j++; k.fill(2, i, j); i = j; dernier = "a"; dernierMot = ""; continue; }
    }
    if (ch === "{") prof++;
    if (ch === "}") {
      if (prof === 0 && pile.length) { prof = pile.pop(); k[i++] = 2; gabarit(); dernier = "a"; dernierMot = ""; continue; }
      prof--;
    }
    if (!/\s/.test(ch)) {
      if (/[A-Za-z0-9_$]/.test(ch)) {
        let j = i; while (j < n && /[A-Za-z0-9_$]/.test(t[j])) j++;
        dernierMot = t.slice(i, j); dernier = "a"; i = j; continue;
      }
      dernier = ch; dernierMot = "";
    }
    i++;
  }
  return k;
}

export function classesSql(t) {
  const n = t.length; const k = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const ch = t[i];
    if (ch === "-" && t[i + 1] === "-") { while (i < n && t[i] !== "\n") k[i++] = 1; continue; }
    if (ch === "/" && t[i + 1] === "*") { const j = t.indexOf("*/", i + 2); const e = j < 0 ? n : j + 2; k.fill(1, i, e); i = e; continue; }
    if (ch === "'") {
      const echap = i > 0 && /[eE]/.test(t[i - 1]) && !/[A-Za-z0-9_]/.test(t[i - 2] ?? "");
      k[i++] = 2;
      while (i < n) {
        if (echap && t[i] === "\\") { k[i++] = 2; if (i < n) k[i++] = 2; continue; }
        if (t[i] === "'" && t[i + 1] === "'") { k[i++] = 2; k[i++] = 2; continue; }
        if (t[i] === "'") { k[i++] = 2; break; }
        k[i++] = 2;
      }
      continue;
    }
    i++;
  }
  return k;
}

// JSX : le texte entre « > » et « < » d'une même ligne (hors « => » et « >= ») se lit comme une chaîne.
export function texteJsx(t, k) {
  const m = new Uint8Array(t.length); let dedans = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\n") { dedans = false; continue; }
    if (k[i] !== 0) continue;
    if (ch === ">" && t[i - 1] !== "=" && t[i + 1] !== "=") { dedans = true; continue; }
    if (ch === "<") { dedans = false; continue; }
    if (ch === "{" || ch === "}") { dedans = false; continue; }
    if (dedans) m[i] = 1;
  }
  return m;
}

export function classesHtml(t) {
  const n = t.length; const k = new Uint8Array(n);
  for (const re of [/<!--[\s\S]*?-->/g, /\/\*[\s\S]*?\*\//g]) for (const m of t.matchAll(re)) k.fill(1, m.index, m.index + m[0].length);
  return k;
}

export function classesDiese(t) {
  const n = t.length; const k = new Uint8Array(n);
  for (const m of t.matchAll(/(^|[ \t])#[^\n]*/gm)) k.fill(1, m.index, m.index + m[0].length);
  return k;
}

// Ce que le contrôle des noms relit, par sorte de fichier : "s" chaînes seulement
// (le code lui-même porte des identifiants, passe « b »), "jsx" chaînes et texte
// entre balises, "cs" tout sauf les commentaires, "prose" rien (texte libre =
// commentaire, passe « b »).
export function sorteDe(f) {
  const b = f.toLowerCase();
  if (/\.(mjs|cjs|js|ts)$/.test(b)) return { lire: classesJs, noms: "s" };
  if (/\.(jsx|tsx)$/.test(b)) return { lire: classesJs, noms: "jsx" };
  if (/\.sql(\.txt)?$/.test(b)) return { lire: classesSql, noms: "s" };
  if (/\.(html?|svg|xml|css|vue)$/.test(b)) return { lire: classesHtml, noms: "cs" };
  if (/\.(json|tsv|csv|txt|patch)$/.test(b)) return { lire: (t) => new Uint8Array(t.length), noms: "cs" };
  if (/\.(sh|py|ya?ml|toml|ps1|service|gitignore)$/.test(b) || /(^|\/)\.[^/]+$/.test(b)) return { lire: classesDiese, noms: "cs" };
  if (/\.(md|markdown)$/.test(b)) return { lire: (t) => new Uint8Array(t.length).fill(1), noms: "prose" };
  return null; // binaire ou inconnu : pas relu
}

// ── Les deux contrôles sur un texte ─────────────────────────────────────────
const RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
export const cleEmail = (a) => { const [l, d] = a.toLowerCase().split("@"); return l.replace(/\+.*$/, "") + "@" + d; };

export function emailsHorsListe(t) {
  const sortie = [];
  for (const m of t.matchAll(RE_EMAIL)) {
    const a = m[0].toLowerCase().replace(/^[._%+\-]+/, "");
    const d = a.split("@")[1] ?? "";
    if (EXT_FICHIER.test(d.split(".").pop())) continue; // « logo@2x.png »
    if (domainePermis(d) || factCourte(a)) continue;
    if (BOITES_EQUIPE.has(empreinte(cleEmail(a)))) continue;
    sortie.push({ index: m.index + (m[0].length - a.length), cle: empreinte(cleEmail(a)), longueur: a.length });
  }
  return sortie;
}

// Un chemin qui désigne un fichier suivi (« scripts/fixtures/x-2010.json », « ./x-selftest.mjs ») :
// nom de fichier, exclu (« c »). Une table de sauvegarde : exclue (« c »).
export function masquerExclus(t, nomsDeFichiers) {
  return t.replace(/[A-Za-z0-9_.\-\/]+/g, (w) => {
    if (/sauvegarde|backup|_bak(\b|_)/i.test(w)) return " ".repeat(w.length);
    if (!/[\/.]/.test(w)) return w;
    const base = w.replace(/[.\-]+$/, "").split("/").pop(); // « …_INVERSE.sql. » en fin de phrase
    const sansExt = base.replace(/\.[A-Za-z0-9]+(\.[A-Za-z0-9]+)?$/, "");
    if (nomsDeFichiers.has(base) || (sansExt.length >= 6 && nomsDeFichiers.has("~" + sansExt))) return " ".repeat(w.length);
    return w;
  });
}

// Minuscules sans accents, caractère pour caractère (les positions restent celles du texte).
const CAR = new Map();
function normaliserMemeLongueur(t) {
  let s = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c.charCodeAt(0) < 128) { s += c.toLowerCase(); continue; }
    let v = CAR.get(c);
    if (v === undefined) { v = normaliser(c); if (v.length !== 1) v = " "; CAR.set(c, v); }
    s += v;
  }
  return s;
}

export function nomsDans(t, { un = IDENTITES_UN_MOT, plusieurs = IDENTITES_PLUSIEURS_MOTS, cache = new Map() } = {}) {
  const h = (s) => { let v = cache.get(s); if (v === undefined) { v = empreinte(s); cache.set(s, v); } return v; };
  const sortie = [];
  const base = normaliserMemeLongueur(t);
  const atomes = [...base.matchAll(/[a-z0-9]+/g)].map((m) => ({ s: m[0], i: m.index, f: m.index + m[0].length }));
  for (let a = 0; a < atomes.length; a++) {
    const x = atomes[a];
    if (x.s.length >= 3 && (un.has(h(x.s)) || plusieurs.has(h(x.s)))) sortie.push({ index: x.i, cle: h(x.s), mots: 1 });
    let joint = x.s;
    for (let b = a + 1; b < Math.min(atomes.length, a + 4); b++) {
      const sep = base.slice(atomes[b - 1].f, atomes[b].i);
      if (sep.length > 3 || sep.includes("\n")) break;
      joint += atomes[b].s;
      if (plusieurs.has(h(joint))) sortie.push({ index: x.i, cle: h(joint), mots: b - a + 1 });
    }
  }
  return sortie;
}

// Relit un fichier : rend ses rouges (sans nom ni adresse).
export function relireTexte(f, texte, nomsDeFichiers, options = {}) {
  const sorte = sorteDe(f);
  if (!sorte) return [];
  const rouges = [];
  const debuts = [0];
  for (let i = 0; i < texte.length; i++) if (texte.charCodeAt(i) === 10) debuts.push(i + 1);
  const ligneDe = (idx) => { let a = 0, b = debuts.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (debuts[m] <= idx) a = m; else b = m - 1; } return a + 1; };
  for (const e of emailsHorsListe(texte)) rouges.push({ f, ligne: ligneDe(e.index), sorte: "e-mail", cle: e.cle, detail: `adresse hors liste blanche (${e.longueur} car.)` });
  if (sorte.noms === "prose" && !options.commentaires) return rouges;
  const k = sorte.lire(texte);
  const morceaux = new Array(texte.length);
  const code = sorte.noms === "cs" || options.identifiants;
  const jsx = sorte.noms === "jsx" ? texteJsx(texte, k) : null;
  for (let i = 0; i < texte.length; i++) {
    const c = k[i];
    const garder = texte[i] === "\n" || (c === 1 ? options.commentaires : c === 2 ? true : (code || (jsx !== null && jsx[i] === 1)));
    morceaux[i] = garder ? texte[i] : " ";
  }
  const vu = masquerExclus(morceaux.join(""), nomsDeFichiers);
  for (const x of nomsDans(vu, options)) rouges.push({ f, ligne: ligneDe(x.index), sorte: "identité", cle: x.cle, detail: `identité de client (${x.mots} mot${x.mots > 1 ? "s" : ""})` });
  return rouges;
}

// ── Contrôles du contrôle (en mémoire) : le verrou sait voir rouge ──────────
if (PRINCIPAL) principal();
function principal() {
let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`); if (!cond) echecs++; };
console.log("1. Le verrou sait voir rouge (cas fabriqués en mémoire, aucun vrai nom)");
{
  const faux = "vendeurfacticezq"; // un jeton fabriqué, ajouté à une liste de test
  const un = new Set([empreinte(faux)]);
  const plusieurs = new Set([empreinte("prenomfactice" + "nomfactice")]);
  const opt = { un, plusieurs };
  const adresse = ["essai.hors", "liste"].join("-") + "@" + ["gmail", "com"].join(".");
  const js = [
    `const a = "${faux}"; // ${faux} en commentaire`,
    `/* ${adresse} */ const v_${faux} = 1;`,
    "const g = `cas ${x} de " + faux.toUpperCase() + "`;",
    `const p = "Prenomfactice NOMFACTICE"; const r = /${faux}/;`,
    `const f = "./fixtures/${faux}-2010.json";`,
  ].join("\n");
  const noms = new Set([`${faux}-2010.json`]);
  const r = relireTexte("x.mjs", js, noms, opt);
  const lignes = (s) => r.filter((x) => x.sorte === s).map((x) => x.ligne).join(",");
  ok(lignes("identité") === "1,3,4,4", `identité vue dans une chaîne, un gabarit, une regex et un « prénom nom » (lignes ${lignes("identité")}), jamais dans un commentaire, un identifiant ni un nom de fichier`);
  ok(lignes("e-mail") === "2", `adresse hors liste vue même en commentaire (ligne ${lignes("e-mail")})`);
  const rc = relireTexte("x.mjs", js, noms, { ...opt, commentaires: true, identifiants: true });
  ok(rc.filter((x) => x.sorte === "identité").map((x) => x.ligne).join(",") === "1,1,2,3,4,4", "--commentaires et --identifiants étendent le contrôle (lignes 1 et 2 en plus)");
  const sql = `-- ${faux} en commentaire\nselect '${faux}' as x, v_${faux} from sauvegarde_${faux}_1111;\nraise notice 'cas E''${faux}';`;
  const rs = relireTexte("x.sql", sql, new Set(), opt);
  ok(rs.map((x) => x.ligne).join(",") === "2,3", `SQL : la chaîne (deux fois), jamais le commentaire, la variable ni la table de sauvegarde (lignes ${rs.map((x) => x.ligne).join(",")})`);
  const permis = ["client@exemple.invalid", "a@b.fr", "support@fillsell.app", "logo@2x.png", "x@vinted.fr"].join(" ");
  ok(relireTexte("x.json", permis, new Set(), opt).length === 0, "liste blanche : valeurs factices, domaines de l'équipe et des plateformes, images @2x");
  ok(relireTexte("x.json", `{"login":"${faux}"}`, new Set(), opt).length === 1 && relireTexte("x.md", `${faux} ${adresse}`, new Set(), opt).length === 1,
    "JSON : relu en entier ; Markdown : prose (adresse seulement, le nom attend la passe « b »)");
  const jsx = `const ${faux.toUpperCase()} = { login: "x" };\nconst v = (a) => a.${faux};\nreturn <p>Le cas ${faux}</p>;`;
  const rj = relireTexte("x.jsx", jsx, new Set(), opt);
  ok(rj.map((x) => x.ligne).join(",") === "3", `JSX : le texte entre balises (ligne ${rj.map((x) => x.ligne).join(",")}), jamais un identifiant`);
}

// ── Le dépôt ────────────────────────────────────────────────────────────────
const PERIMETRE = /^(src|supabase\/functions|chrome-extension|serveur-cloud|scripts)\//;
function fichiersSuivis() {
  const sortie = execFileSync("git", ["ls-files", "-z"], { cwd: fs.existsSync(path.join(RACINE, ".git")) ? RACINE : DEPOT, encoding: "utf8", maxBuffer: 1 << 28 });
  return sortie.split("\0").filter(Boolean);
}
const tous = fichiersSuivis();
const nomsDeFichiers = new Set();
for (const f of tous) { const b = f.split("/").pop(); nomsDeFichiers.add(b); nomsDeFichiers.add("~" + b.replace(/\.[A-Za-z0-9]+(\.[A-Za-z0-9]+)?$/, "")); }
const aRelire = tous.filter((f) => PERIMETRE.test(f) && !f.startsWith("supabase/migrations/"));
const exceptions = new Map(EXCEPTIONS.map((e) => [e.f + ":" + e.e, { ...e, vus: 0 }]));
const cache = new Map();
const rouges = []; let relus = 0;
for (const f of aRelire) {
  const p = path.join(RACINE, f);
  if (!fs.existsSync(p)) continue;
  const buf = fs.readFileSync(p);
  if (buf.length > 20 * 1024 * 1024 || buf.includes(0)) continue;
  const texte = buf.toString("utf8");
  if (!sorteDe(f)) continue;
  relus++;
  for (const r of relireTexte(f, texte, nomsDeFichiers, { commentaires: AVEC_COMMENTAIRES, identifiants: AVEC_IDENTIFIANTS, cache })) {
    const e = exceptions.get(empreinte(f) + ":" + r.cle);
    if (e && e.vus < e.n) { e.vus++; continue; }
    rouges.push(r);
  }
}
console.log(`\n2. Le dépôt : ${relus} fichiers suivis relus (src, supabase/functions, chrome-extension, serveur-cloud, scripts)${AVEC_COMMENTAIRES ? ", commentaires compris" : ""}${AVEC_IDENTIFIANTS ? ", identifiants compris" : ""}`);
const index = new Map([...IDENTITES_UN_MOT, ...IDENTITES_PLUSIEURS_MOTS].map((h, i) => [h, i + 1]));
for (const r of rouges.slice(0, 400)) console.log(`  ✗ ${r.f}:${r.ligne} — ${r.sorte === "e-mail" ? r.detail : `${r.detail}, n°${index.get(r.cle)}`} [${r.cle}]`);
if (rouges.length > 400) console.log(`  … et ${rouges.length - 400} autres`);
ok(rouges.length === 0, `aucune donnée de client hors exceptions (${rouges.length} trouvée${rouges.length > 1 ? "s" : ""})`);
const exceptionsInutiles = [...exceptions.values()].filter((e) => e.vus < e.n);
for (const e of exceptionsInutiles) console.log(`  ✗ exception [${e.f}:${e.e}] : ${e.vus}/${e.n} occurrence(s) — à resserrer (${e.pourquoi})`);
ok(exceptionsInutiles.length === 0, `chaque exception sert exactement (${EXCEPTIONS.length} exception${EXCEPTIONS.length > 1 ? "s" : ""})`);

const regle = fs.readFileSync(path.join(DEPOT, "docs/regles/depot-git-build-site.md"), "utf8");
ok(/11\/11\/2026 — jamais de nom, pseudo ni e-mail de client/.test(regle) && /selftest:donnees-clients/.test(regle) && /« c »/.test(regle),
  "3. la règle est écrite (docs/regles/depot-git-build-site.md : règle, verrou, exclusions « c »)");

console.log(echecs ? `\nROUGE — ${echecs} contrôle(s) en échec` : "\nVERT — aucune donnée de client dans le code suivi");
process.exit(echecs ? 1 : 0);
}
