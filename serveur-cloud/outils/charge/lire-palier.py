#!/usr/bin/env python3
# (06/11/2026) LIRE UN PALIER de l'essai de charge (docs/cloud/ESSAI-CHARGE-CLOUD2.md) — lecture seule.
#   python3 lire-palier.py <début AAAA-MM-JJTHH:MM:SS> <fin AAAA-MM-JJTHH:MM:SS> [--images]
# Lit /srv/fillsell-cloud/etat/essais/charge-{hote,navigateurs,gpu}-<jour>.csv sur la fenêtre, et (--images) mesure
# 10 s d'images par seconde de chaque navigateur de charge par son port 9223. Rend les chiffres ET le verdict du palier
# selon les seuils de docs/cloud/ESSAI-CHARGE-CLOUD2.md § 4 (VERT / ROUGE, avec la règle qui casse).
import csv, glob, json, os, subprocess, sys, time, urllib.request

D = '/srv/fillsell-cloud/etat/essais'
SEUILS = {'cpu_moy': 60, 'cpu_p95': 85, 'charge_moy': 32, 'dispo_min_mo': 6144, 'gpu_moy': 60, 'gpu_p95': 90,
          'images_med': 20, 'bride_part': 0.10}

def q(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, int(p * (len(v) - 1)))] if v else None

def moy(v):
    return round(sum(v) / len(v), 1) if v else None

def lignes(motif, debut, fin, sep=';'):
    for f in sorted(glob.glob(os.path.join(D, motif))):
        with open(f, newline='') as h:
            for r in csv.reader(h, delimiter=sep):
                if r and debut <= r[0] < fin:
                    yield r

def main():
    if len(sys.argv) < 3:
        print(__doc__ or 'usage : lire-palier.py <début> <fin> [--images]'); sys.exit(2)
    debut, fin = sys.argv[1], sys.argv[2]
    res, rouge = {}, []
    # L'hôte
    cpu, ch, dispo, nb = [], [], [], []
    for r in lignes('charge-hote-*.csv', debut, fin):
        if r[1]: cpu.append(int(r[1]))
        ch.append(float(r[2])); dispo.append(int(r[3])); nb.append(int(r[4]))
    res['hote'] = {'points': len(ch), 'navigateurs': max(nb) if nb else 0, 'cpu_moy': moy(cpu), 'cpu_p95': q(cpu, .95),
                   'charge_moy': moy(ch), 'charge_max': max(ch) if ch else None, 'dispo_min_mo': min(dispo) if dispo else None}
    # Les navigateurs : processeur (delta de usage_usec sur 5 s), mémoire, bridage, oom
    par = {}
    for r in lignes('charge-navigateurs-*.csv', debut, fin):
        par.setdefault(r[1], []).append(r)
    nav = {}
    for nom, rs in par.items():
        cpu_fil, brides, mem, anon_shm, oom = [], 0, [], [], 0
        for a, b in zip(rs, rs[1:]):
            dt = (time.mktime(time.strptime(b[0], '%Y-%m-%dT%H:%M:%S')) - time.mktime(time.strptime(a[0], '%Y-%m-%dT%H:%M:%S')))
            if dt > 0: cpu_fil.append((int(b[6]) - int(a[6])) / 1e6 / dt)
            if int(b[7]) > int(a[7]): brides += 1
        for r in rs:
            mem.append(int(r[2])); anon_shm.append(int(r[3]) + int(r[4])); oom = max(oom, int(r[10] or 0))
        nav[nom] = {'points': len(rs), 'cpu_fil_med': round(q(cpu_fil, .5) or 0, 3), 'cpu_fil_p95': round(q(cpu_fil, .95) or 0, 3),
                    'bride_part': round(brides / max(1, len(rs) - 1), 3), 'mem_med_mo': q(mem, .5), 'mem_p95_mo': q(mem, .95),
                    'non_recuperable_med_mo': q(anon_shm, .5), 'oom': oom}
    reels = {k: v for k, v in nav.items() if k.startswith('fs-nav-')}
    charge = {k: v for k, v in nav.items() if k.startswith('fs-charge-')}
    res['comptes_reels'] = reels
    res['charge'] = {'navigateurs': len(charge), 'cpu_fil_med': q([v['cpu_fil_med'] for v in charge.values()], .5),
                     'mem_med_mo': q([v['mem_med_mo'] for v in charge.values()], .5), 'oom': sum(v['oom'] for v in charge.values())}
    # La puce (RCS % = rendu 3D)
    gpu = []
    for f in sorted(glob.glob(os.path.join(D, 'charge-gpu-*.csv'))):
        with open(f) as h:
            entete = h.readline().split(';', 1)[-1].strip().split(',')
            i = entete.index('RCS %') if 'RCS %' in entete else None
            for l in h:
                t, _, v = l.strip().partition(';')
                if i is not None and debut <= t < fin:
                    try: gpu.append(float(v.split(',')[i]))
                    except (ValueError, IndexError): pass
    res['puce'] = {'points': len(gpu), 'rendu3d_moy': moy(gpu), 'rendu3d_p95': q(gpu, .95)}
    # Les images par seconde (10 s), et le rendu WebGL de chaque navigateur de charge
    if '--images' in sys.argv:
        noms = subprocess.run(['docker', 'ps', '--filter', 'label=fillsell.charge=1', '--format', '{{.Names}}'], capture_output=True, text=True).stdout.split()
        def lire(n):
            ip = subprocess.run(['docker', 'inspect', '-f', '{{(index .NetworkSettings.Networks "fillsell-cloud").IPAddress}}', n], capture_output=True, text=True).stdout.strip()
            try:
                t = next(p['title'] for p in json.load(urllib.request.urlopen(f'http://{ip}:9223/json/list', timeout=3)) if p.get('title', '').startswith('Charge'))
                rendu, compteur = t.split(' | ')[1], int(t.split(' | ')[-1])
                return rendu, compteur
            except Exception:
                return None, None
        avant = {n: lire(n) for n in noms}; time.sleep(10); apres = {n: lire(n) for n in noms}
        images = [(apres[n][1] - avant[n][1]) / 10 for n in noms if avant[n][1] is not None and apres[n][1] is not None]
        rendus = sorted({apres[n][0] for n in noms if apres[n][0]})
        res['images'] = {'mesures': len(images), 'med': q(images, .5), 'min': min(images) if images else None, 'rendus': rendus}
        if images and q(images, .5) < SEUILS['images_med']: rouge.append(f"images/s médiane {q(images, .5)} < {SEUILS['images_med']}")
        if any(('SwiftShader' in r or 'llvmpipe' in r) for r in rendus): rouge.append('rendu LOGICIEL (SwiftShader / llvmpipe)')
    # Le verdict
    h = res['hote']
    if h['cpu_moy'] is not None and h['cpu_moy'] > SEUILS['cpu_moy']: rouge.append(f"CPU moyen {h['cpu_moy']} % > {SEUILS['cpu_moy']}")
    if h['cpu_p95'] is not None and h['cpu_p95'] > SEUILS['cpu_p95']: rouge.append(f"CPU p95 {h['cpu_p95']} % > {SEUILS['cpu_p95']}")
    if h['charge_moy'] is not None and h['charge_moy'] > SEUILS['charge_moy']: rouge.append(f"charge moyenne {h['charge_moy']} > {SEUILS['charge_moy']}")
    if h['dispo_min_mo'] is not None and h['dispo_min_mo'] < SEUILS['dispo_min_mo']: rouge.append(f"mémoire disponible min {h['dispo_min_mo']} Mo < {SEUILS['dispo_min_mo']}")
    p = res['puce']
    if p['rendu3d_moy'] is not None and p['rendu3d_moy'] > SEUILS['gpu_moy']: rouge.append(f"puce moyenne {p['rendu3d_moy']} % > {SEUILS['gpu_moy']}")
    if p['rendu3d_p95'] is not None and p['rendu3d_p95'] > SEUILS['gpu_p95']: rouge.append(f"puce p95 {p['rendu3d_p95']} % > {SEUILS['gpu_p95']}")
    if not p['points']: rouge.append('puce NON relevée sur la fenêtre (fs-mesure-gpu arrêté ?)')
    for n, v in reels.items():
        if v['bride_part'] > SEUILS['bride_part']: rouge.append(f"{n[:16]}… bridé sur {round(100 * v['bride_part'])} % des relevés")
        if v['oom']: rouge.append(f"{n[:16]}… oom_kill")
    if res['charge']['oom']: rouge.append('oom_kill dans un navigateur de charge')
    res['verdict'] = 'ROUGE : ' + ' ; '.join(rouge) if rouge else 'VERT'
    print(json.dumps(res, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main()
