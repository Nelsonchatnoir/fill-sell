import fs from "node:fs"; import readline from "node:readline";
const S = process.argv[2];
const lire = (f) => { const s = fs.readFileSync(`${S}/${f}`, "utf8"); return JSON.parse(s.slice(s.indexOf("{"))).rows; };
const obj = lire("obj.json");
const P = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/";
const nomDe = (u) => { const b = u.split("?")[0].slice(P.length); try { return decodeURIComponent(b); } catch { return b; } };
const objets = new Map(obj.map((o) => [o.n, o]));
const groupes = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[3]) });
for await (const l of rl) {
  const r = JSON.parse(l); if (!r[0].startsWith(P)) continue;
  const o = objets.get(nomDe(r[0])); if (!o) continue;
  const k = `${o.e}|${o.t}`; if (!groupes.has(k)) groupes.set(k, []);
  groupes.get(k).push(r);
}
const bits = (a, b) => { if (!a || !b) return null; let n = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } } return n; };
const cas = { memes_dimensions: 0, dimensions_differentes: 0 }; const dDims = {}; const parJour = {}; const ex = [];
for (const [, l] of groupes) {
  if (l.length < 2) continue;
  for (let i = 1; i < l.length; i++) {
    const a = l[0], b = l[i];
    if (a[4] == null || b[4] == null) continue;
    const ea = JSON.stringify(a.slice(1, 7)), eb = JSON.stringify(b.slice(1, 7));
    if (ea === eb) continue;
    const memes = a[5] === b[5] && a[6] === b[6];
    cas[memes ? "memes_dimensions" : "dimensions_differentes"]++;
    const k = `${a[5]}x${a[6]} / ${b[5]}x${b[6]}`; dDims[k] = (dDims[k] ?? 0) + 1;
    const j = [a[8].slice(0, 10), b[8].slice(0, 10)].sort().join(" & "); parJour[j] = (parJour[j] ?? 0) + 1;
    if (ex.length < 6) ex.push({ dims: k, d: bits(a[1], b[1]), p: bits(a[2], b[2]), cal: [a[8], b[8]], src: [a[7], b[7]] });
  }
}
console.log(cas); console.log(Object.entries(dDims).sort((x, y) => y[1] - x[1]).slice(0, 10)); console.log(Object.entries(parJour).sort((x, y) => y[1] - x[1]).slice(0, 12)); console.log(ex);
