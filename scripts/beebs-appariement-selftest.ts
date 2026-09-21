// Auto-test de la règle d'appariement dépôt ↔ annonce Beebs (2026-09-21).
//   deno run --allow-read scripts/beebs-appariement-selftest.ts
//
// LES DONNÉES SONT RÉELLES. Ce sont les cinq dépôts Beebs de meminiandmove du
// 20/09 au soir, et les quatre annonces que l'index public porte pour ce compte
// (creation_date relevée le 21/09). Les quatre premiers dépôts ont retrouvé
// leur lien par un AUTRE chemin (la page « Mes annonces », via l'extension) :
// ils servent donc de vérité indépendante. Le cinquième — le pantalon Sandro,
// vendu le 20/09 à 22:42 — est en modération : absent de l'index. La règle doit
// apparier les quatre et NE RIEN dire du cinquième.

import { apparier, type AnnonceIndex, type DepotACaler } from "../supabase/functions/_shared/beebs-index.ts";

let echecs = 0;
const verifier = (nom: string, condition: boolean, detail = "") => {
  if (condition) {
    console.log(`  ✓ ${nom}`);
  } else {
    echecs++;
    console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ""}`);
  }
};

// ── Le lot réel du 20/09 au soir ────────────────────────────────────────────
const ANNONCES: AnnonceIndex[] = [
  { listing_id: "34010498", titre: "Robe Oh Polly rouge froncée – Taille 38", prix: 22, photo_url: null, creation_ms: 1789927629000 },   // 20:07:09
  { listing_id: "34010521", titre: "Robe courte Oh Polly champagne froncée ajourée - 38", prix: 22, photo_url: null, creation_ms: 1789927813000 }, // 20:10:13
  { listing_id: "34010538", titre: "Polo Yamaha Racing GYTR Yamalube bleu L", prix: 14.5, photo_url: null, creation_ms: 1789927959000 }, // 20:12:39
  { listing_id: "34010570", titre: "T-shirt C&A bleu marine délavé – Taille S", prix: 7, photo_url: null, creation_ms: 1789928209000 },  // 20:16:49
];
const DEPOTS: DepotACaler[] = [
  { id: "a846ad20", repere_ms: 1789927637000, prix: 22 },   // 20:07:17 → 34010498
  { id: "a064c8ef", repere_ms: 1789927820000, prix: 22 },   // 20:10:20 → 34010521
  { id: "9a71389a", repere_ms: 1789927967000, prix: 14.5 }, // 20:12:47 → 34010538
  { id: "8ef548ce", repere_ms: 1789928216000, prix: 7 },    // 20:16:56 → 34010570
  { id: "3b657a62", repere_ms: 1789928363000, prix: 24 },   // 20:19:23 → EN MODÉRATION, rien
];
const ATTENDU: Record<string, string> = {
  a846ad20: "34010498", a064c8ef: "34010521",
  "9a71389a": "34010538", "8ef548ce": "34010570",
};

console.log("1. Le lot réel du 20/09 (4 dépôts vérifiés + 1 en modération)");
{
  const r = apparier(DEPOTS, ANNONCES, new Set());
  verifier("4 appariements, pas 5", r.size === 4, `obtenu ${r.size}`);
  for (const [job, id] of Object.entries(ATTENDU)) {
    verifier(`${job} → ${id}`, r.get(job)?.annonce.listing_id === id, `obtenu ${r.get(job)?.annonce.listing_id ?? "rien"}`);
  }
  verifier("le Sandro (en modération) n'est apparié à RIEN", !r.has("3b657a62"));
  const ecarts = [...r.values()].map((v) => v.ecart_ms / 1000);
  verifier("écarts mesurés entre 7 et 8 s", ecarts.every((e) => e >= 7 && e <= 8), `écarts ${ecarts.join(", ")}`);
}

console.log("2. Garde anti-croisement : une annonce déjà portée par un autre job");
{
  const r = apparier(DEPOTS, ANNONCES, new Set(["34010570"]));
  verifier("le T-shirt n'est plus apparié", !r.has("8ef548ce"));
  verifier("les trois autres le restent", r.size === 3, `obtenu ${r.size}`);
}

console.log("3. Le prix doit coïncider quand les deux sont connus");
{
  const depots = DEPOTS.map((d) => (d.id === "8ef548ce" ? { ...d, prix: 9 } : d));
  const r = apparier(depots, ANNONCES, new Set());
  verifier("prix 9 € contre 7 € → aucun appariement", !r.has("8ef548ce"));
}
{
  const depots = DEPOTS.map((d) => (d.id === "8ef548ce" ? { ...d, prix: null } : d));
  const r = apparier(depots, ANNONCES, new Set());
  verifier("prix inconnu côté dépôt → le verrou ne s'applique pas", r.get("8ef548ce")?.annonce.listing_id === "34010570");
}

console.log("4. Deux candidats dans la fenêtre → on s'abstient");
{
  const annonces: AnnonceIndex[] = [
    ...ANNONCES,
    { listing_id: "99999999", titre: "Jumelle", prix: 7, photo_url: null, creation_ms: 1789928214000 }, // 2 s du T-shirt
  ];
  const r = apparier(DEPOTS, annonces, new Set());
  verifier("le T-shirt n'est apparié à AUCUNE des deux", !r.has("8ef548ce"));
}

console.log("5. Hors fenêtre → rien (une absence ne s'invente pas)");
{
  const depots: DepotACaler[] = [{ id: "loin", repere_ms: 1789928209000 + 45_000, prix: 7 }];
  const r = apparier(depots, [ANNONCES[3]], new Set());
  verifier("45 s d'écart → aucun appariement", r.size === 0);
}

console.log("6. Appariement MUTUEL : la rafale ne s'approprie pas l'annonce du voisin");
{
  // Deux dépôts proches d'une SEULE annonce, l'un à 5 s, l'autre à 12 s : le
  // second ne doit pas la prendre. (Le premier non plus ici : deux candidats
  // côté annonce ne se posent pas, mais côté DÉPÔT le second voit un candidat
  // unique — c'est exactement ce que le verrou mutuel arrête.)
  const annonces: AnnonceIndex[] = [ANNONCES[3]];
  const depots: DepotACaler[] = [
    { id: "proche", repere_ms: 1789928209000 + 5_000, prix: 7 },
    { id: "loin", repere_ms: 1789928209000 + 12_000, prix: 7 },
  ];
  const r = apparier(depots, annonces, new Set());
  verifier("seul le plus proche gagne", r.size === 1 && r.has("proche"), `obtenu ${[...r.keys()].join(",") || "rien"}`);
}

console.log(echecs === 0 ? "\nTOUT PASSE." : `\n${echecs} ÉCHEC(S).`);
if (echecs > 0) Deno.exit(1);
