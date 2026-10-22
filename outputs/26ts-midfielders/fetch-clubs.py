from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import urllib.request

work = Path(__file__).resolve().parent
root = work.parent.parent
needed = {'Seattle Sounders': 'seattle sounders', 'Vancouver Whitecaps': 'vancouver whitecaps', 'Elche': 'elche', 'Torino FC': 'torino', 'Monaco': 'monaco', 'NEC Nijmegen': 'nijmegen', 'Al Khaleej': 'al khaleej', 'Hoffenheim': 'hoffenheim', 'FC Cincinnati': 'cincinnati', 'Braga': 'braga'}
def league_teams(league):
    url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams?limit=100'
    return [row['team'] for row in json.load(urllib.request.urlopen(url))['sports'][0]['leagues'][0]['teams']]
with ThreadPoolExecutor(max_workers=8) as pool:
    teams = sum(pool.map(league_teams, ['por.1', 'esp.1', 'usa.1', 'fra.1', 'ned.1', 'ksa.1', 'ger.1', 'ita.1']), [])
sources = []
for club, search in needed.items():
    found = [team for team in teams if search in team['displayName'].lower()]
    assert len(found) == 1, (club, [t['displayName'] for t in found])
    team = found[0]
    url = team['logos'][0]['href']
    name = f"{team['id']}.png"
    (root / 'public/assets/clubs' / name).write_bytes(urllib.request.urlopen(url).read())
    page = next(link['href'] for link in team['links'] if 'clubhouse' in link['rel'])
    sources.append({'club': club, 'name': team['displayName'], 'url': url, 'page': page, 'asset': f'/assets/clubs/{name}'})
(work / 'club-sources.json').write_text(json.dumps(sources, indent=2), encoding='utf-8')
for code in ['SN', 'AT']:
    raw = urllib.request.urlopen(f'https://raw.githubusercontent.com/lipis/flag-icons/v7.5.0/flags/4x3/{code.lower()}.svg').read()
    (work / f'{code.lower()}.svg').write_bytes(raw)
print('Downloaded 10 club logos and Senegal/Austria flags.')
