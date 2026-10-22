from pathlib import Path
import base64
import json
import re

work = Path(__file__).resolve().parent
destination = work / 'sources'
destination.mkdir(exist_ok=True)
session = next(Path('C:/Users/Admin/.codex/sessions/2026/10/22').glob('*01a162f4-34c2-7f10-9057-d86a7c990ece.jsonl'))
for line in session.open(encoding='utf-8'):
    if '182130.png' not in line: continue
    payload = json.loads(line).get('payload', {})
    if payload.get('role') != 'user': continue
    name = None
    count = 0
    for content in payload.get('content', []):
        if content.get('type') == 'input_text':
            found = re.findall(r'Screenshot 2026-10-22 (\d{6})\.png', content.get('text', ''))
            if found: name = f'Screenshot 2026-10-22 {found[-1]}.png'
        if content.get('type') == 'input_image':
            url = content['image_url']
            assert name and url.startswith('data:image/png;base64,')
            (destination / name).write_bytes(base64.b64decode(url.split(',', 1)[1]))
            name = None
            count += 1
    assert count == 17
    print('Copied 17 original attachments into the project sources folder.')
    break
else:
    raise RuntimeError('Current request attachments not found.')
