"""Fetch polarized.cc workouts, decode embedded ZWO (data: URIs), pick the ~1 h variant,
and write a JS module for the trainer app."""
import base64, html, json, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

OUT = sys.argv[1]
BASE = 'https://polarized.cc'
UA = {'User-Agent': 'Mozilla/5.0 (personal workout import)'}

CATS = {
    'easy': ['active-recovery', 'aerobic-foundation', 'z2-cadence-ladder', 'z2-high-cadence-spin-ups',
             'z2-aerobic-tempo-waves', 'z2-torque-builder', 'z2-rolling-terrain-simulation', 'z2-focus-ride',
             'cadence-climb-drills', 'seated-climbing-endurance', 'z2-low-cadence-strength-endurance',
             'z2-seated-standing-climb-alternation', 'z2-climbing-rhythm-builder', 'recovery-spin',
             'z2-endurance-with-form-sprints', 'zone-1-base-builder', 'zone-1-climb-sim', 'base-miles',
             'endurance-foundation', 'z2-stochastic-endurance', 'z2-fondo-rhythm-builder'],
    'hard': ['zone-3-crusher', 'vo2-max-destroyer', 'seiler-4x8-intervals', '5x5-vo2max-intervals',
             'hard-start-4x4-intervals', 'sprint-power-repeats', 'hc-climb-simulation', 'climbing-4x8-intervals',
             'mountain-strength-5x6', 'climbing-power-6x3', 'climbing-attack-intervals', 'threshold-endurance',
             'climb-repeats', 'vo2-max-builders', 'ronnestad-30-15-intervals', '40-20-intervals',
             'microbursts-15-15', 'gran-fondo-race-day'],
    'sweetspot': ['sweet-spot-pyramid', 'threshold-progression', 'mountain-intervals', 'sweet-spot-endurance'],
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def decode_data_uri(uri):
    uri = html.unescape(uri)
    head, _, data = uri.partition(',')
    if ';base64' in head:
        return base64.b64decode(data).decode('utf-8', 'replace')
    return urllib.parse.unquote(data)


def f2(x):
    return round(float(x), 3)


def convert(root):
    steps = []
    for el in root.find('workout'):
        tag = el.tag
        a = el.attrib
        d = int(round(float(a.get('Duration', 0))))
        if tag in ('Warmup', 'Cooldown', 'Ramp'):
            lo, hi = f2(a['PowerLow']), f2(a['PowerHigh'])
            name = {'Warmup': 'Ogrevanje', 'Cooldown': 'Ohlajanje'}.get(tag, 'Rampa')
            steps.append({'name': name, 'duration': d, 'power': lo, 'powerEnd': hi} if lo != hi
                         else {'name': name, 'duration': d, 'power': lo})
        elif tag == 'SteadyState':
            steps.append({'name': None, 'duration': d, 'power': f2(a['Power'])})
        elif tag == 'IntervalsT':
            n = int(a.get('Repeat', 1))
            on_d = int(round(float(a['OnDuration'])))
            off_d = int(round(float(a['OffDuration'])))
            on_p = f2(a.get('OnPower', a.get('PowerOnHigh', a.get('PowerOnLow'))))
            off_p = f2(a.get('OffPower', a.get('PowerOffHigh', a.get('PowerOffLow'))))
            for i in range(1, n + 1):
                steps.append({'name': f'Interval {i}/{n}', 'duration': on_d, 'power': on_p})
                steps.append({'name': 'Počitek', 'duration': off_d, 'power': off_p})
        elif tag == 'FreeRide':
            steps.append({'name': 'Prosto', 'duration': d, 'power': 0.55})
        elif tag == 'MaxEffort':
            steps.append({'name': 'Maksimalno', 'duration': d, 'power': 1.5})
        elif tag in ('textevent', 'TextEvent'):
            continue
        else:
            raise ValueError('Unknown ZWO element ' + tag)
    # Name plain steady-state steps.
    prev = None
    for s in steps:
        if s['name'] is None:
            p = s['power']
            if p <= 0.60:
                s['name'] = 'Počitek' if prev is not None and prev['power'] > p + 0.1 else 'Lahko'
            elif p <= 0.75:
                s['name'] = 'Vzdržljivost'
            else:
                s['name'] = 'Interval'
        prev = s
    return steps


def main():
    try:
        print('robots.txt:\n' + get(BASE + '/robots.txt')[:600])
    except Exception as e:
        print('robots.txt not readable:', e)

    out = []
    report = []
    for cat, slugs in CATS.items():
        for slug in slugs:
            url = f'{BASE}/workouts/{slug}/'
            try:
                page = get(url)
            except Exception as e:
                report.append(f'FAIL {slug}: {e}')
                continue
            uris = re.findall(r'href="(data:[^"]+)"', page) + re.findall(r"href='(data:[^']+)'", page)
            variants = {}
            for u in uris:
                try:
                    xml = decode_data_uri(u)
                    if '<workout_file' not in xml:
                        continue
                    root = ET.fromstring(xml)
                    steps = convert(root)
                except Exception as e:
                    report.append(f'PARSE {slug}: {e}')
                    continue
                total = sum(s['duration'] for s in steps)
                name = (root.findtext('name') or slug).strip()
                name = re.sub(r'\s*\((Quick|Standard|Extended|Long|Short)\)\s*$', '', name)
                variants[total] = (name, steps)
            if not variants:
                report.append(f'NONE {slug}: {len(uris)} data links')
                continue
            ok = [t for t in variants if 50 * 60 <= t <= 70 * 60]
            all_mins = sorted(round(t / 60) for t in variants)
            if not ok:
                report.append(f'SKIP {slug}: lengths {all_mins}')
                continue
            t = min(ok, key=lambda x: abs(x - 3600))
            name, steps = variants[t]
            out.append({'id': 'pz-' + slug, 'name': name, 'category': cat, 'source': url, 'steps': steps})
            report.append(f'OK   {slug}: {name} -> {round(t / 60)} min ({len(steps)} steps), all {all_mins}')
            time.sleep(0.5)

    js = ('// Vaje s polarized.cc (Zwift .zwo, različica ~1 h). Samodejno ustvarjeno – ne urejaj ročno.\n'
          '// Moč je delež FTP. category: easy | hard | sweetspot\n'
          'export const POLARIZED_WORKOUTS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
    open(OUT, 'w', encoding='utf-8').write(js)
    print('\n'.join(report))
    print(f'\nWrote {len(out)} workouts to {OUT}')


main()
