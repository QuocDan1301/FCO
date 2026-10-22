from pathlib import Path
import json
import re

work = Path(__file__).resolve().parent

def parse_page(path):
    text = path.read_text(encoding='utf-8')
    match = re.search(r'window\.__NUXT__=\(function\((.*?)\)\{return (.*?)\}\((.*?)\)\);</script>', text, re.S)
    if not match:
        raise ValueError(f'No SSR data: {path}')
    params, expression, arguments = match.groups()
    constants = dict(zip(params.split(','), json.loads('[' + arguments + ']')))
    def replace(token):
        value = token.group(0)
        if value.startswith('"'):
            return value
        if expression[token.end():].lstrip().startswith(':'):
            return json.dumps(value)
        if value in constants:
            return json.dumps(constants[value], ensure_ascii=False)
        if value in ('true', 'false', 'null'):
            return value
        raise ValueError(f'Unexpected identifier {value}')
    data = json.loads(re.sub(r'"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*', replace, expression))
    return data['data'][0]['items']

if __name__ == '__main__':
    for path in work.glob('fifaaddict-*.html'):
        players = parse_page(path)
        path.with_suffix('.json').write_text(json.dumps(players, ensure_ascii=False, indent=2), encoding='utf-8')
        print(path.name, len(players), sorted(set(p['year'] for p in players)))
