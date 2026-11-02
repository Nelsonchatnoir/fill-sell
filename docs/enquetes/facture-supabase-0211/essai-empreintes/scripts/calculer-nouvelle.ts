// ═══════════════════════════════════════════════════════════════════════════
// LA NOUVELLE MÉTHODE, en local, à l'octet : le code du commit 40e4bd3 (lot B)
// ═══════════════════════════════════════════════════════════════════════════
// `empreinterUrl` est importée TELLE QUELLE de la copie de 40e4bd3
// (mod40e4bd3/empreinte-telechargement.ts + empreinte-image.ts, extraites par
// `git show 40e4bd3:…`) : essais = [urlAllegee(url), url] → pour notre bucket une
// seule URL, l'ORIGINALE (/storage/v1/object/public/…), décodée par imagescript
// 1.3.0 (JPEG/PNG) ou @jsquash/webp 1.4.0 (WebP), MAX_OCTETS 8 Mo, MAX_PIXELS 6 Mpx.
// Sans budget de décodage (doublons-balayage n'en a pas ; empreintes-urls en a un,
// qui ne fait que REMETTRE une photo à plus tard, jamais un autre résultat).
//
// Garde-fous :
//   · toute requête vers /storage/v1/render/ est REFUSÉE avant de partir (fetch enveloppé) ;
//   · seules les URL du bucket listing-photos sont traitées ;
//   · un échec PASSAGER (429, 5xx, réseau, délai : estPassager du module) est repris
//     5 fois (1, 2, 4, 8, 16 s) ; au-delà il est noté « passager_epuise » ;
//   · les octets lus (Response.arrayBuffer) sont comptés ; rien n'est écrit sur disque
//     que l'empreinte.
// Usage : deno run --allow-net --allow-read --allow-write calculer-nouvelle.ts <entrée.txt> <sortie.ndjson> [concurrence] [plafond_octets]
// (concurrence 1 : les octets par photo sont exacts ; le total l'est toujours)
import { empreinterUrl, EchecPassager } from "../mod40e4bd3/empreinte-telechargement.ts";

const SUPABASE_URL = "https://tojihnuawsoohlolangc.supabase.co";
const PREFIXE = `${SUPABASE_URL}/storage/v1/object/public/listing-photos/`;

// ── garde : jamais une transformation ──
const fetchOrigine = globalThis.fetch;
let requetes = 0;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/storage\/v1\/render\//i.test(u)) throw new Error(`INTERDIT : transformation demandée (${u})`);
  requetes++;
  return fetchOrigine(input as RequestInfo, init);
}) as typeof fetch;

// ── octets lus ──
let octets = 0;
const abOrigine = Response.prototype.arrayBuffer;
Response.prototype.arrayBuffer = async function (this: Response) {
  const b = await abOrigine.call(this);
  octets += b.byteLength;
  return b;
};

const [entree, sortie, concStr, plafondStr] = Deno.args;
// plafond d'octets de CE processus (budget egress total ÷ nombre de processus) : au-delà, plus aucune URL n'est prise
const PLAFOND = Number(plafondStr) || Infinity;
const CONC = Math.max(1, Number(concStr) || 1);
const urls = (await Deno.readTextFile(entree)).split("\n").map((l) => l.trim()).filter(Boolean);
// reprise : les URL déjà écrites dans la sortie ne sont pas refaites
const faites = new Set<string>();
try {
  for (const l of (await Deno.readTextFile(sortie)).split("\n")) {
    if (!l.trim()) continue;
    try { const j = JSON.parse(l); if (j.url && !j.passager_epuise) faites.add(j.url); } catch { /* ligne coupée */ }
  }
} catch { /* pas encore de sortie */ }
const aFaire = urls.filter((u) => !faites.has(u));
const f = await Deno.open(sortie, { create: true, append: true });
const enc = new TextEncoder();
const ecrire = async (o: unknown) => { await f.write(enc.encode(JSON.stringify(o) + "\n")); };

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
let i = 0, ok = 0, ko = 0;
const t0 = Date.now();

async function une(url: string) {
  if (!url.startsWith(PREFIXE)) { await ecrire({ url, erreur: "hors bucket listing-photos (non traitée)" }); return; }
  let dernier = "";
  for (let essai = 0; essai <= 5; essai++) {
    const avant = octets;
    const t = performance.now();
    try {
      const e = await empreinterUrl(url, SUPABASE_URL);
      await ecrire({ url, dhash: e.dhash, phash: e.phash, couleur: e.couleur, variantes: e.variantes, largeur: e.largeur, hauteur: e.hauteur,
        octets: octets - avant, ms: Math.round(performance.now() - t), essais: essai + 1 });
      ok++;
      return;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (err instanceof EchecPassager) { dernier = msg; await attendre(1000 * 2 ** essai); continue; }
      await ecrire({ url, erreur: msg.slice(0, 200), octets: octets - avant, essais: essai + 1 });
      ko++;
      return;
    }
  }
  await ecrire({ url, erreur: dernier.slice(0, 200), passager_epuise: true });
  ko++;
}

async function ouvrier() {
  for (;;) {
    if (octets >= PLAFOND) { console.log("PLAFOND atteint", octets); return; }
    const k = i++;
    if (k >= aFaire.length) return;
    await une(aFaire[k]);
    if ((ok + ko) % 200 === 0) {
      console.log(`${ok + ko}/${aFaire.length} ok=${ok} ko=${ko} ${(octets / 1e6).toFixed(0)} Mo ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, ouvrier));
f.close();
console.log(JSON.stringify({ fin: true, total: aFaire.length, ok, ko, octets, requetes, secondes: Math.round((Date.now() - t0) / 1000) }));
