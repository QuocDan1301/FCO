from pathlib import Path
import json
import shutil

work = Path(__file__).resolve().parent
cards = json.loads((work / 'cards.json').read_text(encoding='utf-8'))
stamps = {card['stamp'] for card in cards} | {'181515'}
destination = work / 'sources'
destination.mkdir(exist_ok=True)
for directory in Path('C:/$Recycle.Bin').iterdir():
    if not directory.is_dir(): continue
    try:
        entries = list(directory.glob('$I*'))
    except PermissionError:
        continue
    for info in entries:
        try: content = info.read_bytes()
        except (PermissionError, FileNotFoundError): continue
        for stamp in stamps:
            name = f'Screenshot 2026-10-22 {stamp}.png'
            if name.encode('utf-16-le') not in content: continue
            image = info.with_name('$R' + info.name[2:])
            if image.is_file():
                shutil.copy2(image, destination / name)
                print('Recovered source copy:', name)
print('Source copies available:', len(list(destination.glob('*.png'))))
