// ═══════════════════════════════════════════════════════════════════════════
// L'IA CHOISIT LA CATÉGORIE — DANS NOTRE LISTE, JAMAIS AILLEURS
// (étape 3 du chantier « sortir de l'emoji », 2026-09-07)
// ═══════════════════════════════════════════════════════════════════════════
// LE PRINCIPE : LA MACHINE PROPOSE, L'IA TRANCHE.
// L'appelant a ratissé des CANDIDATS — feuilles de nos arbres relevés, plus
// les suggestions rendues par la plateforme elle-même quand il les possède
// (les cinq d'eBay). Cette fonction ne fait qu'une chose : demander à l'IA
// LAQUELLE, et vérifier que sa réponse est bien l'une d'elles.
//
// POURQUOI L'IA ET PAS UN RAPPROCHEMENT DE LETTRES : mesuré sur l'arbre réel,
// « bonnet » ne ressemble qu'à « Bonnets de bain » (Sport > Natation) et
// « Bonnets de douche » (Beauté > Soins du corps). Un score de similarité
// choisirait l'un des deux. Seul un modèle sait qu'un bonnet de bébé n'est ni
// l'un ni l'autre — et qu'une chapka est un chapeau.
//
// GARDE-FOUS, tous appliqués ICI, côté serveur (l'appelant ne peut pas les
// contourner) :
//   · la réponse doit être EXACTEMENT une clé de la liste envoyée. Un modèle
//     recopie parfois de travers : on ne compare donc pas des libellés, on
//     compare des CLÉS opaques et courtes (« e3 », « v11 ») qu'on a nous-mêmes
//     attribuées. Hors liste → traité comme « aucune ».
//   · « aucune » est une réponse LÉGITIME et attendue. On ne pose alors rien,
//     et l'appelant laisse la plateforme trancher.
//   · la valeur rendue est la CANDIDATE D'ORIGINE, recopiée depuis la liste
//     d'entrée — jamais du texte régénéré par le modèle. Pour eBay, chemin ET
//     identifiant voyagent donc ensemble, indissociables par construction.
//   · un seul appel pour les quatre plateformes : l'objet ne change pas d'une
//     plateforme à l'autre, seule sa traduction en rayon change.
// ═══════════════════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appelAutorise, loggerAppelIA, tokensDe } from "../_shared/usage-guard.ts";

const ALLOWED_ORIGINS = [
  "https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173",
];

const PLATEFORMES = ["vinted", "leboncoin", "beebs", "ebay"] as const;
type Plateforme = typeof PLATEFORMES[number];

interface Candidat { chemin: string[]; id?: string | null; source?: string }

// ── « AUTRE » N'EST PAS UNE CATÉGORIE (règle Nico, appliquée le 07/09 soir) ─
// Rétro-test sur le VRAI périmètre (22 articles sans mot-objet) : 8 choix
// meilleurs, 12 identiques, 2 moins bons — et les DEUX moins bons sont le même
// cas, un fourre-tout retenu alors que la liste contenait de vraies feuilles :
//   · « Guerlain Aqua Allegoria 125 ml » → Collections > Autres (32643)
//   · « Uriage Huile Lavante pour Bébé » → Bébé, puériculture > Autres (1261)
// Une annonce dans « Autres » ne se trouve pas. On RETIRE donc les fourre-tout
// de la liste dès qu'elle contient au moins une vraie feuille : le modèle doit
// choisir une catégorie réelle, ou répondre « aucune ».
// ⛔ Quand il n'y a QUE des fourre-tout, on les garde : un fourre-tout vaut
//    mieux qu'une catégorie fausse, et mieux que rien du tout.
const FOURRE_TOUT = /^(autres?|divers|other|others|miscellaneous)$/i;
const estFourreTout = (c: Candidat) =>
  FOURRE_TOUT.test(String(c.chemin[c.chemin.length - 1] ?? "").trim());

const SYSTEM = `Tu ranges un article d'occasion dans le catalogue de plusieurs plateformes de vente.

Pour CHAQUE plateforme, on te donne une liste numérotée de catégories POSSIBLES. Tu choisis celle qui correspond à l'article, et tu réponds par sa CLÉ exacte.

RÈGLES ABSOLUES :
- Tu ne peux répondre QUE par une clé présente dans la liste de cette plateforme. Jamais un libellé, jamais une catégorie inventée, jamais une clé d'une autre plateforme.
- Si AUCUNE catégorie de la liste ne convient vraiment, réponds null pour cette plateforme. C'est une bonne réponse, pas un échec : mieux vaut rien qu'un rayon faux.
- Juge l'OBJET, pas les mots. Un bonnet de bébé n'est ni un bonnet de bain (natation) ni un bonnet de douche (salle de bain). Une chapka est un chapeau. Une taie d'oreiller est du linge de lit, pas un soin du visage.
- Respecte le genre et l'âge indiqués : un article de bébé ne va pas dans un rayon adulte.

Réponds UNIQUEMENT du JSON valide, de la forme :
{"vinted":"v3","leboncoin":null,"beebs":"b1","ebay":"e12"}
Une plateforme absente de l'entrée est absente de ta réponse.`;

const SYSTEM_LISTES = `Tu remplis une annonce d'occasion. Pour chaque CHAMP, on te donne la liste EXACTE des valeurs que la plateforme accepte, chacune précédée de sa CLÉ. Tu choisis la valeur qui correspond à l'article, et tu réponds par sa CLÉ.

RÈGLES ABSOLUES :
- Tu ne peux répondre QUE par une clé présente dans la liste de CE champ.
- Si aucune valeur ne correspond VRAIMENT, réponds null pour ce champ. C'est une bonne réponse : mieux vaut un champ vide qu'une valeur fausse.
- JAMAIS « au plus proche ». Un 2XL n'est pas un XL. Un bleu marine n'est pas un bleu. Une taille 6 ans n'est pas une taille 5 ans. Si la valeur exacte n'est pas dans la liste, c'est null.
- Les libellés peuvent contenir une description après le nom : juge sur le nom.

Réponds UNIQUEMENT du JSON valide, une clé par champ, par exemple :
{"État":"x3","Couleur":null,"Taille":"x12"}`;

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Deux appelants : l'app (JWT utilisateur) et le worker eBay (secret cron,
  // il n'a pas de session). Le second est borné au même contrat.
  const authHeader = req.headers.get("Authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const secretAttendu = Deno.env.get("CRON_SECRET");
  let userId: string | null = null;
  if (cronSecret && secretAttendu && cronSecret === secretAttendu) {
    userId = null; // appel serveur : pas de garde-fou par utilisateur
  } else {
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    userId = user.id;
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Volume réel mesuré le 07/09 : 25 articles par jour reçoivent une catégorie
  // calculée, tous utilisateurs confondus. 300/jour et par utilisateur est
  // donc ~12× la pointe de TOUT le parc — inatteignable sans une boucle.
  if (userId && !(await appelAutorise(admin, userId, "resolve_categorie", 300))) {
    console.warn(`[resolve-categorie] garde-fou atteint pour ${userId}`);
    return json({ error: "rate_limited" }, 429);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Missing API key" }, 500);

  let corps: {
    titre?: string;
    attributs?: Record<string, unknown>;
    candidats?: Partial<Record<Plateforme, Candidat[]>>;
    listes?: Record<string, { plateforme?: string; options?: string[] }>;
    user_id?: string;
  };
  try { corps = await req.json(); } catch { return json({ error: "corps illisible" }, 400); }
  // Appel SERVEUR (secret cron) : le coût doit quand même être imputé à
  // l'utilisateur du job, sinon il n'apparaît dans aucune mesure. Le garde-fou
  // par utilisateur, lui, ne s'applique qu'aux appels de l'app — un worker ne
  // boucle pas.
  const userPourJournal = userId ?? (typeof corps.user_id === "string" ? corps.user_id : null);

  const titre = String(corps.titre ?? "").trim().slice(0, 200);
  // ══ LISTES FERMÉES (point 5, 07/09 soir) ══════════════════════════════════
  // MÊME PRINCIPE QUE LA CATÉGORIE, appliqué aux valeurs : la machine propose
  // la liste RÉELLEMENT affichée par la plateforme, l'IA choisit DEDANS, et on
  // vérifie. Les clés sont opaques, la valeur rendue est recopiée de la liste
  // d'entrée, et « aucune » reste une réponse légitime.
  //
  // ⛔ POURQUOI ON N'ENVOIE PAS UNE TABLE ÉCRITE DANS LE CODE : les valeurs
  //    acceptées changent, et une liste périmée est exactement ce qui produit
  //    les refus. L'appelant lit la liste SUR LA PAGE et nous l'envoie.
  // ⛔ JAMAIS « AU PLUS PROCHE » : pas de 2XL vers XL, pas de bleu marine vers
  //    bleu. Le modèle choisit une valeur EXACTE de la liste, ou rien.
  const listes = corps.listes ?? {};
  if (Object.keys(listes).length) {
    const parCleV = new Map<string, { champ: string; valeur: string }>();
    const lignesV: string[] = [];
    let iv = 0;
    for (const [champ, def] of Object.entries(listes)) {
      const options = (def?.options ?? []).map((o) => String(o ?? "").trim()).filter(Boolean).slice(0, 60);
      if (!options.length) continue;
      lignesV.push(`\n${champ}${def?.plateforme ? ` (${def.plateforme})` : ""} :`);
      for (const o of options) {
        const cle = `x${iv++}`;
        parCleV.set(cle, { champ, valeur: o });
        lignesV.push(`  ${cle} = ${o}`);
      }
    }
    if (!parCleV.size) return json({ valeurs: {}, motif: "aucune option fournie" });

    const attributsV = Object.entries(corps.attributs ?? {})
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("\n");
    const messageV =
      `ARTICLE\n${titre || "(sans titre)"}\n${attributsV ? attributsV + "\n" : ""}` +
      `\nVALEURS POSSIBLES${lignesV.join("\n")}`;

    let texteV = "";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150, temperature: 0, system: SYSTEM_LISTES,
          messages: [{ role: "user", content: messageV }],
        }),
      });
      if (!res.ok) { console.error("[resolve-categorie] listes IA:", await res.text()); return json({ valeurs: {}, motif: "ia_indisponible" }); }
      const data = await res.json();
      texteV = String(data.content?.[0]?.text ?? "");
      try { await loggerAppelIA(admin, userPourJournal, "resolve_listes", tokensDe(data)); } catch { /* mesure */ }
    } catch (e) {
      console.error("[resolve-categorie] listes exception:", e);
      return json({ valeurs: {}, motif: "ia_indisponible" });
    }

    // On lit du JSON, pas un motif construit à la volée : un nom de champ
    // contient des accents et des espaces, en faire une expression régulière
    // est une source d'échec silencieux.
    const valeurs: Record<string, string> = {};
    const refusesV: string[] = [];
    let rendu: Record<string, unknown> = {};
    try {
      const d = texteV.indexOf("{"), fin = texteV.lastIndexOf("}");
      if (d >= 0 && fin > d) rendu = JSON.parse(texteV.slice(d, fin + 1));
    } catch { /* réponse illisible : traitée comme « aucune » partout */ }
    for (const champ of Object.keys(listes)) {
      const brut = rendu[champ];
      if (typeof brut !== "string" || !brut) continue;   // absent ou null : légitime
      const t = parCleV.get(brut.trim());
      if (!t || t.champ !== champ) { refusesV.push(`${champ}:${brut}`); continue; }
      valeurs[champ] = t.valeur;                          // la valeur D'ORIGINE, recopiée
    }
    if (refusesV.length) console.warn(`[resolve-categorie] valeur hors liste ignorée : ${refusesV.join(", ")}`);
    try {
      const lignesJ = Object.keys(listes).map((champ) => ({
        user_id: userPourJournal,
        plateforme: String(listes[champ]?.plateforme ?? "?"),
        etape: "arbitrage",
        issue: valeurs[champ] ? "choisi" : refusesV.some((r) => r.startsWith(`${champ}:`)) ? "hors_liste" : "aucune",
        motif: `liste_fermee:${champ}`,
        n_candidats: (listes[champ]?.options ?? []).length,
        choisi_chemin: valeurs[champ] ?? null,
        titre: titre.slice(0, 200),
      }));
      if (lignesJ.length) await admin.from("categorie_journal").insert(lignesJ);
    } catch (e) { console.error("[resolve-categorie] journal listes:", (e as Error)?.message); }
    return json({ valeurs, refuses: refusesV });
  }

  const candidats = corps.candidats ?? {};
  // Clés opaques : « v0…v19 », « e0…e19 ». C'est CE vocabulaire fermé que le
  // modèle doit rendre, et c'est lui qu'on vérifie — pas un libellé recopié.
  const parCle = new Map<string, { plateforme: Plateforme; candidat: Candidat }>();
  const parPlateforme = new Map<Plateforme, number>();
  const lignes: string[] = [];
  for (const pf of PLATEFORMES) {
    const brutes = (candidats[pf] ?? []).filter((c) => Array.isArray(c?.chemin) && c.chemin.length);
    const vraies = brutes.filter((c) => !estFourreTout(c));
    const liste = (vraies.length ? vraies : brutes).slice(0, 20);
    if (!liste.length) continue;
    parPlateforme.set(pf, liste.length);
    if (vraies.length && vraies.length < brutes.length) {
      console.log(`[resolve-categorie] ${pf} : ${brutes.length - vraies.length} fourre-tout ecarte(s)`);
    }
    lignes.push(`\n${pf.toUpperCase()} :`);
    liste.forEach((c, i) => {
      const cle = `${pf[0]}${i}`;
      parCle.set(cle, { plateforme: pf, candidat: c });
      lignes.push(`  ${cle} = ${c.chemin.join(" > ")}${c.source ? `  (proposée par ${c.source})` : ""}`);
    });
  }
  if (!parCle.size) return json({ choix: {}, motif: "aucun candidat fourni" });

  const attributs = Object.entries(corps.attributs ?? {})
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join("\n");

  const message =
    `ARTICLE\n${titre || "(sans titre)"}\n${attributs ? attributs + "\n" : ""}` +
    `\nCATÉGORIES POSSIBLES${lignes.join("\n")}`;

  let texte = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!res.ok) {
      console.error("[resolve-categorie] IA:", await res.text());
      return json({ choix: {}, motif: "ia_indisponible" });
    }
    const data = await res.json();
    texte = String(data.content?.[0]?.text ?? "");
    // Coût journalisé comme les autres appels IA : c'est ce qui permettra de
    // répondre « combien ça coûte » sans réestimer à la louche.
    try { await loggerAppelIA(admin, userPourJournal, "resolve_categorie", tokensDe(data)); }
    catch { /* la journalisation ne fait jamais échouer un classement */ }
  } catch (e) {
    console.error("[resolve-categorie] exception:", e);
    return json({ choix: {}, motif: "ia_indisponible" });
  }

  // ── VÉRIFICATION : la réponse doit être une clé de CETTE plateforme ───────
  // On ne fait JAMAIS confiance au texte rendu : on relit la clé, on retrouve
  // la candidate d'ORIGINE dans notre map, et c'est elle qu'on rend. Le modèle
  // ne peut donc rien inventer, même en recopiant de travers.
  const choix: Record<string, { chemin: string[]; id: string | null; source: string }> = {};
  const refuses: string[] = [];
  for (const pf of PLATEFORMES) {
    const m = texte.match(new RegExp(`"${pf}"\\s*:\\s*(?:"([^"]{1,8})"|null)`));
    if (!m) continue;
    const cle = m[1];
    if (!cle) continue; // null explicite : réponse légitime, on ne pose rien
    const trouve = parCle.get(cle);
    if (!trouve || trouve.plateforme !== pf) { refuses.push(`${pf}:${cle}`); continue; }
    choix[pf] = {
      chemin: trouve.candidat.chemin,
      id: trouve.candidat.id ?? null,
      source: trouve.candidat.source ?? "arbre",
    };
  }
  if (refuses.length) {
    console.warn(`[resolve-categorie] réponse hors liste ignorée : ${refuses.join(", ")} — titre « ${titre} »`);
  }
  // ── JOURNAL (point 2, instrumentation PURE) ───────────────────────────────
  // Une ligne par décision et par plateforme. Rien ne le relit pour décider :
  // aucun comportement ne dépend de son contenu. Best-effort de bout en bout —
  // une écriture de mesure ne doit jamais faire échouer un classement.
  try {
    const lignes: Record<string, unknown>[] = [];
    for (const pf of PLATEFORMES) {
      if (!parPlateforme.has(pf)) continue;
      const c = choix[pf];
      const horsListe = refuses.some((r) => r.startsWith(`${pf}:`));
      lignes.push({
        user_id: userPourJournal,
        plateforme: pf,
        etape: "arbitrage",
        issue: c ? "choisi" : horsListe ? "hors_liste" : "aucune",
        n_candidats: parPlateforme.get(pf) ?? 0,
        choisi_id: c?.id ?? null,
        choisi_chemin: c ? c.chemin.join(" > ").slice(0, 300) : null,
        titre: titre.slice(0, 200),
      });
    }
    if (lignes.length) await admin.from("categorie_journal").insert(lignes);
  } catch (e) {
    console.error("[resolve-categorie] journal:", (e as Error)?.message);
  }

  return json({
    choix,
    refuses,
    candidats_envoyes: parCle.size,
  });
});
