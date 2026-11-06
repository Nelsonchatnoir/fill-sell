#!/usr/bin/env python3
# (06/11/2026 soir, décision de Nico : « on mesurera la charge en réel, au fur et à mesure des utilisateurs ajoutés un par
# un ») LA MESURE CONTINUE d'un serveur Cloud — LECTURE SEULE de l'hôte, rien n'est touché :
#   · toutes les 30 s, chaque navigateur de compte (conteneurs fs-nav-<compte>) : mémoire du cgroup (totale, non
#     récupérable = anon + shmem), processeur (fils), bridage au plafond, oom ; la PUCE par compte = le temps du moteur de
#     rendu (drm-engine-render, fdinfo i915) de SON processus graphique Chrome ; l'hôte : processeur, charge, mémoire
#     disponible, puce totale (navigateurs + Xorg) ;
#   · toutes les 5 min : UNE ligne dans public.cloud_mesures par l'appel cloud_mesure_noter (migration 20261106210000) —
#     moyennes, maxima, 95e centile de la fenêtre. Claude la lit à chaque « check news » par la vue cloud_charge_heures.
# La clé de service est lue dans /srv/fillsell-cloud/.env à chaque envoi, jamais écrite ni affichée. Un envoi raté est
# dit dans le journal (journalctl -u fillsell-mesure) et la fenêtre suivante repart : rien ne s'accumule.
# Service : deploiement/mesure/fillsell-mesure.service (Nice=10, MemoryMax=128M).
import glob, json, os, re, subprocess, sys, time, urllib.request

ENV = '/srv/fillsell-cloud/.env'
PAS_S, FENETRE_S = 30, 300
CG = '/sys/fs/cgroup/system.slice'
RE_NAV = re.compile(r'^fs-nav-([0-9a-f-]{36})$')


def lire_env():
    v = {}
    with open(ENV) as f:
        for l in f:
            if '=' in l and not l.startswith('#'):
                k, _, x = l.rstrip('\n').partition('=')
                v[k] = x
    return v


def lire(p, defaut=''):
    try:
        with open(p) as f:
            return f.read()
    except OSError:
        return defaut


def stat_kv(p):
    d = {}
    for l in lire(p).splitlines():
        k, _, x = l.partition(' ')
        if x.strip().lstrip('-').isdigit():
            d[k] = int(x)
    return d


def navigateurs():
    """Les conteneurs de comptes en marche : {compte: id complet} (jamais les navigateurs de charge ni les autres)."""
    r = subprocess.run(['docker', 'ps', '--no-trunc', '--format', '{{.ID}} {{.Names}}'], capture_output=True, text=True, timeout=20)
    out = {}
    for l in r.stdout.splitlines():
        i, _, nom = l.partition(' ')
        m = RE_NAV.match(nom.strip())
        if m:
            out[m.group(1)] = i
    return out


def rendu_ns(pids):
    """Le temps cumulé du moteur de rendu de la puce (ns) des processus donnés, compté une fois par client DRM."""
    vus = {}
    for p in pids:
        for f in glob.glob(f'/proc/{p}/fdinfo/*'):
            t = lire(f)
            if 'drm-driver:' not in t:
                continue
            cid = re.search(r'^drm-client-id:\s*(\d+)', t, re.M)
            ns = re.search(r'^drm-engine-render:\s*(\d+)', t, re.M)
            if cid and ns:
                vus[cid.group(1)] = int(ns.group(1))
    return sum(vus.values())


def processus_graphique(cg):
    """Le processus graphique de Chrome (--type=gpu-process) : le seul qui tient la puce pour tout le navigateur."""
    pids = []
    for p in lire(f'{cg}/cgroup.procs').split():
        try:
            with open(f'/proc/{p}/cmdline', 'rb') as f:
                if b'--type=gpu-process' in f.read():
                    pids.append(p)
        except OSError:
            pass
    return pids


def releve():
    """Un relevé instantané (compteurs cumulés : les écarts se font entre deux relevés)."""
    t = time.monotonic()
    comptes = {}
    for u, i in navigateurs().items():
        cg = f'{CG}/docker-{i}.scope'
        if not os.path.isdir(cg):
            continue
        ms, cs, ev = stat_kv(f'{cg}/memory.stat'), stat_kv(f'{cg}/cpu.stat'), stat_kv(f'{cg}/memory.events')
        comptes[u] = {'id': i, 'mem': int(lire(f'{cg}/memory.current', '0') or 0) // 1048576,
                      'nonrec': (ms.get('anon', 0) + ms.get('shmem', 0)) // 1048576,
                      'cpu_us': cs.get('usage_usec', 0), 'brides': cs.get('nr_throttled', 0), 'oom': ev.get('oom_kill', 0),
                      'puce_ns': rendu_ns(processus_graphique(cg))}
    champs = lire('/proc/stat').splitlines()[0].split()[1:9]
    tot, inactif = sum(map(int, champs)), int(champs[3]) + int(champs[4])
    mi = {l.split(':')[0]: int(l.split()[1]) for l in lire('/proc/meminfo').splitlines() if l.split()[1:2] and l.split()[1].isdigit()}
    xorg = subprocess.run(['pgrep', '-x', 'Xorg'], capture_output=True, text=True).stdout.split()
    return {'t': t, 'comptes': comptes, 'cpu': (tot, inactif), 'charge1': float(lire('/proc/loadavg', '0').split()[0]),
            'mem_total': mi.get('MemTotal', 0) // 1024, 'mem_dispo': mi.get('MemAvailable', 0) // 1024, 'xorg_ns': rendu_ns(xorg)}


def p95(v):
    v = sorted(v)
    return round(v[min(len(v) - 1, int(0.95 * (len(v) - 1)))], 3) if v else None


def moy(v):
    return round(sum(v) / len(v), 3) if v else None


def resumer(points):
    """La fenêtre de 5 min : l'hôte et chaque compte (pure à partir des relevés)."""
    hote = {'cpu': [], 'puce': [], 'charge1': [], 'dispo': [], 'nav': []}
    par = {}
    for a, b in zip(points, points[1:]):
        dt = b['t'] - a['t']
        if dt <= 0:
            continue
        (t0, i0), (t1, i1) = a['cpu'], b['cpu']
        if t1 > t0:
            hote['cpu'].append(100 * ((t1 - t0) - (i1 - i0)) / (t1 - t0))
        puce_tot = max(0, b['xorg_ns'] - a['xorg_ns'])
        for u, cb in b['comptes'].items():
            ca = a['comptes'].get(u)
            if not ca or ca['id'] != cb['id']:
                continue
            d = par.setdefault(u, {'mem': [], 'nonrec': [], 'cpu': [], 'puce': [], 'brides': 0, 'n': 0, 'oom': 0})
            d['mem'].append(cb['mem']); d['nonrec'].append(cb['nonrec'])
            d['cpu'].append(max(0, cb['cpu_us'] - ca['cpu_us']) / 1e6 / dt)
            pn = max(0, cb['puce_ns'] - ca['puce_ns']); puce_tot += pn
            d['puce'].append(100 * pn / (dt * 1e9))
            d['brides'] += 1 if cb['brides'] > ca['brides'] else 0
            d['n'] += 1
            d['oom'] = max(d['oom'], cb['oom'] - ca['oom'])
        hote['puce'].append(min(100.0, 100 * puce_tot / (dt * 1e9)))
        hote['charge1'].append(b['charge1']); hote['dispo'].append(b['mem_dispo']); hote['nav'].append(len(b['comptes']))
    total = points[-1]['mem_total'] if points else 0
    dispo_min = min(hote['dispo']) if hote['dispo'] else None
    h = {'points': len(hote['nav']), 'navigateurs_max': max(hote['nav']) if hote['nav'] else 0,
         'cpu_moy_pct': moy(hote['cpu']), 'cpu_p95_pct': p95(hote['cpu']), 'charge1_max': max(hote['charge1']) if hote['charge1'] else None,
         'mem_total_mo': total, 'mem_dispo_min_mo': dispo_min,
         'mem_utilisee_max_pct': round(100 * (total - dispo_min) / total, 1) if total and dispo_min is not None else None,
         'puce_moy_pct': moy(hote['puce']), 'puce_p95_pct': p95(hote['puce'])}
    comptes = {u: {'mem_med_mo': sorted(d['mem'])[len(d['mem']) // 2], 'mem_max_mo': max(d['mem']),
                   'nonrec_med_mo': sorted(d['nonrec'])[len(d['nonrec']) // 2],
                   'cpu_moy_fils': moy(d['cpu']), 'cpu_max_fils': round(max(d['cpu']), 3),
                   'puce_moy_pct': moy(d['puce']), 'puce_max_pct': round(max(d['puce']), 3),
                   'bride_part': round(d['brides'] / d['n'], 3), 'oom': d['oom']} for u, d in par.items() if d['n']}
    return h, comptes


def envoyer(serveur, hote, comptes):
    e = lire_env()
    url, cle = e.get('SUPABASE_URL', '').rstrip('/'), e.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not cle:
        raise RuntimeError('SUPABASE_URL ou la clé de service absente du .env')
    corps = json.dumps({'p_serveur': serveur, 'p_hote': hote, 'p_comptes': comptes}).encode()
    req = urllib.request.Request(f'{url}/rest/v1/rpc/cloud_mesure_noter', data=corps, method='POST',
                                 headers={'apikey': cle, 'Authorization': f'Bearer {cle}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        r.read()


def main():
    serveur = lire_env().get('SERVEUR_NOM', '').strip()
    if not re.match(r'^[a-z0-9][a-z0-9-]{0,40}$', serveur):
        print('REFUS : SERVEUR_NOM absent ou illisible dans le .env', file=sys.stderr); sys.exit(1)
    if '--essai' in sys.argv:   # une fenêtre courte, affichée, RIEN envoyé (vérification à l'installation)
        points = [releve()]
        for _ in range(6):
            time.sleep(10); points.append(releve())
        hote, comptes = resumer(points)
        print(json.dumps({'serveur': serveur, 'hote': hote, 'comptes': comptes}, ensure_ascii=False, indent=1))
        return
    points = [releve()]
    debut = time.monotonic()
    while True:
        time.sleep(PAS_S)
        try:
            points.append(releve())
        except Exception as x:   # un relevé raté ne casse jamais la mesure
            print(f'relevé raté : {x}', file=sys.stderr)
        if time.monotonic() - debut >= FENETRE_S and len(points) >= 2:
            hote, comptes = resumer(points)
            try:
                envoyer(serveur, hote, comptes)
            except Exception as x:
                print(f'envoi raté : {str(x)[:200]}', file=sys.stderr)
            points, debut = points[-1:], time.monotonic()


if __name__ == '__main__':
    main()
