from pathlib import Path
import json
import re
import unicodedata

work = Path(__file__).resolve().parent
local = json.loads((work / 'local-players.json').read_text(encoding='utf-8'))
official = json.loads((work / 'garena-player-names.json').read_text(encoding='utf-8'))
def normalize(name):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower())
aliases = {'E. Butragueño': 'Butragueño'}
report = []
for tier, season_id, label in [('eternal', 100, 'ICON TM'), ('stellar', 866, '26TS'), ('origin', 843, 'NO.7')]:
    current = [p for p in local if p['tier'] == tier]
    full = [p for p in official if p.get('seasonId') == season_id]
    index = {normalize(p['name']): p for p in full}
    found = set()
    for player in current:
        name = normalize(aliases.get(player['name'], player['name']))
        assert name in index, (label, player['name'])
        identifier = index[name]['spid']
        assert identifier not in found, (label, player['name'], 'duplicate')
        found.add(identifier)
    missing = [p for p in full if p['spid'] not in found]
    report.append({'season': label, 'inGame': len(current), 'fullCount': len(full), 'missingCount': len(missing), 'missing': missing})
(work / 'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps([{k:v for k,v in row.items() if k != 'missing'} for row in report]))
print(json.dumps([p['name'] for row in report for p in row['missing']]))
