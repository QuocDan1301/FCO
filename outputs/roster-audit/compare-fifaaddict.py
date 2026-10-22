from pathlib import Path
import json
import re
import unicodedata

work = Path(__file__).resolve().parent
root = work.parents[1]
source = (root / 'src/game.ts').read_text(encoding='utf-8')
rows = source.split('export const players: Player[] = [', 1)[1].split('\n];', 1)[0]
current = []
for line in rows.splitlines():
    if not line.strip():
        continue
    values = re.search(r"id: (\d+), name: '((?:\\.|[^'])*)', ovr: (\d+), pos: '([^']+)'.*?tier: '([^']+)'", line)
    assert values, line
    identifier, name, ovr, pos, tier = values.groups()
    current.append(dict(id=int(identifier), name=name.replace("\\'", "'"), ovr=int(ovr), pos=pos, tier=tier))
assert current == json.loads((work / 'local-players.json').read_text(encoding='utf-8')), 'Local roster changed'

def normalize(name):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower())

report = []
for season, tier, label, count in [('icontm', 'eternal', 'ICON TM', 126), ('26ts', 'stellar', '26TS', 161), ('no7', 'origin', 'NO.7', 24)]:
    full = {}
    pages = [work / 'fifaaddict-no7.json'] if season == 'no7' else [work / f'fifaaddict-{season}-{group}.json' for group in ['attack', 'midfield', 'defense']]
    for page in pages:
        records = json.loads(page.read_text(encoding='utf-8'))
        assert len(records) < 100, f'Truncated results: {page}'
        full.update({p['uid']: p for p in records})
    assert len(full) == count, (label, len(full))
    index = {normalize(p['name']): p for p in full.values()}
    assert len(index) == len(full), 'Duplicate normalized names'
    local = [p for p in current if p['tier'] == tier]
    found = set()
    for player in local:
        name = normalize(player['name'])
        if name == 'ebutragueno':
            name = 'butragueno'
        assert name in index, (label, player['name'])
        assert index[name]['uid'] not in found, 'Duplicate local card'
        found.add(index[name]['uid'])
    missing = [dict(name=p['name'], pos=p['pos'], ovr=p['pos1val'], url='https://vn.fifaaddict.com/fo4db/pid' + p['uid']) for p in full.values() if p['uid'] not in found]
    report.append(dict(season=label, inGame=len(local), fullCount=len(full), missingCount=len(missing), missing=missing, source=f'https://fifaaddict.com/fo4db?class={season}&sv=vn'))

official = json.loads((work / 'comparison.json').read_text(encoding='utf-8'))
for result in report:
    previous = next(r for r in official if r['season'] == result['season'])
    assert {normalize(p['name']) for p in result['missing']} == {normalize(p['name']) for p in previous['missing']}, 'Sources disagree'
(work / 'fifaaddict-comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# Cầu thủ còn thiếu trong game', '', 'Đối chiếu ngày 22/10/2026 với FIFA Addict. Dùng tên miền fifaaddict.com và bộ lọc máy chủ Việt Nam; nhánh vn.fifaaddict.com không kết nối được từ công cụ tải.', '', '| Mùa thẻ | Có trong game | FIFA Addict | Còn thiếu |', '|---|---:|---:|---:|']
for row in report:
    lines.append(f"| {row['season']} | {row['inGame']} | {row['fullCount']} | {row['missingCount']} |")
lines += ['', '## Thẻ 26TS còn thiếu', '', '| Cầu thủ | Vị trí | OVR FIFA Addict |', '|---|---|---:|']
for p in report[1]['missing']:
    lines.append(f"| [{p['name']}]({p['url']}) | {p['pos']} | {p['ovr']} |")
lines += ['', '## Nguồn', '']
for row in report:
    lines.append(f"- [{row['season']}]({row['source']})")
lines += ['', 'ICON TM và 26TS được chia thành ba nhóm vị trí để tránh giới hạn 100 kết quả. Các nhóm có thể trùng cầu thủ do vị trí phụ; đã khử trùng bằng UID. Tất cả cầu thủ trong game khớp danh sách nguồn. Kết quả thiếu khớp hoàn toàn với dữ liệu Garena/Nexon đã kiểm tra trước đó.', '']
(work / 'cau-thu-con-thieu.md').write_text('\n'.join(lines), encoding='utf-8')
print(json.dumps([{k:v for k,v in r.items() if k not in ('missing','source')} for r in report]))
print('Verified current game source, complete position groups, unique matches, and agreement with official audit.')
