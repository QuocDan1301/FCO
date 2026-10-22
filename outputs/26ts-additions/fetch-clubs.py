from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import urllib.request

work = Path(__file__).resolve().parent
root = work.parent.parent
needed = {
    'Estoril': 'estoril', 'Celta': 'celta', 'Brighton': 'brighton',
    'San Diego FC': 'san diego', 'Marseille': 'marseille', 'Al Shabab': 'al shabab',
    'Benfica': 'benfica', 'Nashville SC': 'nashville', 'Feyenoord': 'feyenoord',
    'Strasbourg': 'strasbourg',
}
def league_teams(league):
    url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams?limit=100'
    data = json.load(urllib.request.urlopen(url))
    return [row['team'] for row in data['sports'][0]['leagues'][0]['teams']]
with ThreadPoolExecutor(max_workers=7) as pool:
    teams = sum(pool.map(league_teams, ['por.1', 'esp.1', 'eng.1', 'usa.1', 'fra.1', 'ned.1', 'ksa.1']), [])
sources = []
for club, search in needed.items():
    found = [team for team in teams if search in team['displayName'].lower()]
    assert len(found) == 1, (club, [t['displayName'] for t in found])
    team = found[0]
    url = team['logos'][0]['href']
    name = f"{team['id']}.png"
    raw = urllib.request.urlopen(url).read()
    (root / 'public/assets/clubs' / name).write_bytes(raw)
    page = next(link['href'] for link in team['links'] if 'clubhouse' in link['rel'])
    sources.append({'club': club, 'name': team['displayName'], 'url': url, 'page': page,
                    'asset': f'/assets/clubs/{name}'})
(work / 'club-sources.json').write_text(json.dumps(sources, indent=2), encoding='utf-8')
print(json.dumps(sources))
