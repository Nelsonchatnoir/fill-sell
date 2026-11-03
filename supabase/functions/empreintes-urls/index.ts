// ═══════════════════════════════════════════════════════════════════════════
// empreintes-urls — calculer les empreintes d'une liste de photos, RIEN d'autre
// (2026-09-30, incident Beebs : rendre leur numéro aux dépôts par la photo)
// ═══════════════════════════════════════════════════════════════════════════
// APPELANT : la base (pg_net, x-cron-secret), à la main, par lots. Aucun
// autre appelant. → verify_jwt = FALSE (déployer avec --no-verify-jwt), garde
// maison sur le secret : verify_jwt=false n'est JAMAIS « pas
// d'authentification ».
//
// POURQUOI UNE FONCTION DE PLUS. photo-empreinte exige un JWT d'utilisateur
// (c'est l'app qui l'appelle), et doublons-balayage calcule ET décide (fusions,
// questions) — on ne peut pas lui demander l'un sans l'autre. Celle-ci ne fait
// QUE remplir le cache photo_empreintes, avec exactement les mêmes règles
// (_shared/empreinte-telechargement.ts : hôtes en liste fermée, poids et
// pixels bornés) et le même module d'empreinte (_shared/empreinte-image.ts).
// Elle ne lit ni n'écrit rien d'autre : aucun job, aucune fiche, aucune
// annonce, aucune question.
//
// COÛT MAÎTRISÉ : 8 URL par appel au plus — 5 depuis le 03/11 (le décodage coûte du CPU, et une
// fonction edge n'en a que 2 s par requête — doublons-balayage s'arrête à 6),
// 40 s de budget ; une URL déjà dans le cache n'est ni téléchargée ni
// recalculée ; une image illisible va dans photo_empreintes_echecs (comme
// doublons-balayage).
// (15/10, P18) Et 1 s de DÉCODAGE par appel (BUDGET_DECODAGE_MS,
// _shared/empreinte-telechargement.ts) : 45 appels sur ~1 500 étaient coupés
// à 2 s de CPU en 24 h, perdant leurs dernières photos. Une photo qui ne tient
// plus dans l'appel est REMISE (« restantes ») : jamais notée en échec — une
// URL en échec est « illisible » pour le moteur et pour fusion_photo_tick —,
// elle reste sans empreinte et l'appelant la redemande à sa passe suivante.
// (15/10, P16) Un échec PASSAGER (429 de notre stockage, 5xx, réseau, délai,
// décodeur pas prêt) n'est jamais noté non plus — c'était 498 photos « illisibles »
// pour toujours. Sur un 429, l'appel s'arrête là : on n'insiste pas.
// (03/11) LA RÉDUCTION DES PHOTOS DE NOTRE BUCKET SE FAIT CHEZ NOUS
// (_shared/empreinte-maison.ts) : libvips sur un seul thread refait à l'octet
// la transformation de Supabase (≈ 235 à 390 $ par cycle), même empreinte au
// bit près. Interrupteur coin_config `empreintes_moteur_maison` (1 = maison ;
// 0, absente ou illisible = Supabase), relu à chaque appel : tout repart chez
// Supabase sans redéploiement. Hors du périmètre prouvé, sur une erreur, un
// piège du module ou faute de temps, la photo repart chez Supabase
// (empreinterUrl, comme avant) : aucune empreinte perdue ni vide. 5 URL par
// appel au plus (8 avant), loin des 2 s de CPU ; les suivantes sont REMISES
// (« restantes ») et l'appelant les redemande, comme une remise de budget.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { budgetDecodage, DecodageRemis, EchecPassager, empreinterUrl, hoteAutorise, urlTransformee } from "../_shared/empreinte-telechargement.ts";
import { calculMaison, CLE_MOTEUR_MAISON, empreinterMaison, Repli, SOURCE_MAISON } from "../_shared/empreinte-maison.ts";

const MAX_URLS = 5;
const BUDGET_MS = 40_000;
const BUDGET_DECODAGE_MS = 1_000;

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  let body: { urls?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const recues = [...new Set((Array.isArray(body.urls) ? body.urls : [])
    .map((u) => String(u ?? "").trim()).filter(Boolean))];
  const urls = recues.slice(0, MAX_URLS);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();

  // (08/10) Une ligne SANS variantes (calculée avant le 08/10) est recalculée :
  // le moteur v3 compare le centre des photos, pas seulement l'image entière.
  const [{ data: connues }, { data: moteur, error: eMoteur }] = urls.length
    ? await Promise.all([
      admin.from("photo_empreintes").select("url").in("url", urls).not("variantes", "is", null),
      admin.from("coin_config").select("value").eq("key", CLE_MOTEUR_MAISON).maybeSingle(),
    ])
    : [{ data: [] }, { data: null, error: null }];
  const deja = new Set(((connues ?? []) as Array<{ url: string }>).map((r) => r.url));
  const maison = !eMoteur && Number((moteur as { value?: unknown } | null)?.value) === 1;

  let calculees = 0;
  let restantes = recues.length - urls.length;
  let parMaison = 0, parSupabase = 0;
  const replis: Record<string, number> = {};
  let repli: string | null = null;
  const calcul = calculMaison();
  const echecs: Array<{ url: string; motif: string }> = [];
  const passageres: Array<{ url: string; motif: string }> = [];
  const decodage = budgetDecodage(BUDGET_DECODAGE_MS);
  let remise = false;
  for (const url of urls) {
    if (deja.has(url)) continue;
    if (remise || Date.now() - debut > BUDGET_MS) { restantes++; continue; }
    try {
      if (!hoteAutorise(url, supabaseUrl)) throw new Error("hôte hors liste");
      const bucket = urlTransformee(url, supabaseUrl) !== null;
      let e: Awaited<ReturnType<typeof empreinterUrl>> | null = null;
      if (maison && bucket) {
        try {
          e = await empreinterMaison(url, decodage, calcul);
        } catch (err) {
          if (err instanceof DecodageRemis) throw err;
          // Tout le reste (hors périmètre, erreur, piège, temps) : la photo repart chez Supabase, ci-dessous.
          const cat = err instanceof Repli ? err.categorie : "module";
          replis[cat] = (replis[cat] ?? 0) + 1;
          if (!repli) repli = `${cat} : ${String((err as Error)?.message ?? err).slice(0, 140)}`;
        }
      }
      const parLeModule = e !== null;
      if (!e) e = await empreinterUrl(url, supabaseUrl, decodage);
      const { error } = await admin.from("photo_empreintes").upsert({
        url, dhash: e.dhash, phash: e.phash, couleur: e.couleur, largeur: e.largeur, hauteur: e.hauteur,
        variantes: e.variantes ?? null,
        source: parLeModule ? SOURCE_MAISON : "empreintes-urls", calculee_le: new Date().toISOString(),
      }, { onConflict: "url" });
      if (error) throw new Error(`écriture : ${error.message}`);
      calculees++;
      if (parLeModule) parMaison++;
      else if (bucket) parSupabase++;
    } catch (err) {
      // Remise (budget de l'appel atteint) : rien n'est écrit, la photo reste à faire.
      if (err instanceof DecodageRemis) { remise = true; restantes++; continue; }
      // Passager : rien n'est écrit, la photo reste à faire ; sur un 429, on n'insiste pas.
      if (err instanceof EchecPassager) {
        passageres.push({ url, motif: err.message.slice(0, 160) });
        restantes++;
        if (/^HTTP 429\b/.test(err.message)) remise = true;
        continue;
      }
      const motif = String((err as Error)?.message ?? err).slice(0, 160);
      echecs.push({ url, motif });
      const { data: prec } = await admin.from("photo_empreintes_echecs").select("essais").eq("url", url).maybeSingle();
      await admin.from("photo_empreintes_echecs").upsert({
        url, motif, essais: (Number(prec?.essais) || 0) + 1, echec_le: new Date().toISOString(),
      }, { onConflict: "url" });
    }
  }

  const sortie = {
    demandees: recues.length, deja_connues: deja.size, calculees, echouees: echecs.length, restantes,
    duree_ms: Date.now() - debut, decodage_ms: Math.round(decodage.consommeMs), decodages: decodage.decodages,
    passageres: passageres.length, ...(passageres.length ? { passagere: passageres[0].motif } : {}),
    moteur: maison ? "maison" : "supabase", par_maison: parMaison, par_supabase: parSupabase,
    ...(calcul.reductions ? { maison_ms: Math.round(calcul.ms) } : {}),
    ...(repli ? { replis, repli } : {}),
  };
  console.log("[empreintes-urls]", JSON.stringify(sortie));
  return json({ ...sortie, echecs: echecs.slice(0, 10) });
});
