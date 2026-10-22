from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import urllib.request

work = Path(__file__).resolve().parent
root = work.parents[1]
needed = {'Al Taawoun': ('ksa.1', 'al taawoun'), 'Telstar': ('ned.1', 'telstar'), 'Famalicão': ('por.1', 'famalic'), 'Lille': ('fra.1', 'lille')}
def fetch(item):
    club, (league, term) = item
    url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams?limit=100'
    rows = json.load(urllib.request.urlopen(url, timeout=30))['sports'][0]['leagues'][0]['teams']
    matches = [r['team'] for r in rows if term in r['team']['displayName'].lower()]
    assert len(matches) == 1, (club, matches)
    team = matches[0]
    logo = team['logos'][0]['href']
    asset = f"/assets/clubs/{team['id']}.png"
    (root / 'public' / asset.lstrip('/')).write_bytes(urllib.request.urlopen(logo, timeout=30).read())
    return dict(club=club, url=logo, asset=asset)
with ThreadPoolExecutor(max_workers=4) as pool:
    sources = list(pool.map(fetch, needed.items()))
(work / 'club-sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
flag = urllib.request.urlopen('https://raw.githubusercontent.com/lipis/flag-icons/v7.5.0/flags/4x3/me.svg', timeout=30).read()
(work / 'me.svg').write_bytes(flag)
print(json.dumps(sources, ensure_ascii=True))
