#!/usr/bin/env python3
"""One-off import of the Swift terminal palettes (TerminalThemeSettings.swift + the GhosttyTheme catalog) as one token JSON per theme
(packages/ui/tokens/terminal-themes/<id>.json). To add a theme later, drop one more JSON there and run `pnpm gen`.

Usage: gen-terminal-palettes.py <TerminalThemeSettings.swift> <GhosttyTheme/Themes dir> <out dir>
"""
import glob
import json
import re
import sys

settings, themes_dir, out = sys.argv[1:4]
src = open(settings, encoding='utf-8').read()

def block(name):
    m = re.search(r'(?:var %s: String|func %s\(isDark: Bool\) -> String) \{\s*(?://[^\n]*\s*)*switch self \{(.*?)\n        \}\n    \}' % (name, name), src, re.S)
    return m.group(1)

cases = re.findall(r'case (\w+)(?: = "([^"]+)")?\n', src.split('var id')[0])
ids = {c: (v or c) for c, v in cases}

def strings(body):
    res = {}
    for m in re.finditer(r'case \.(\w+): (?:String\(localized: )?"([^"]+)"', body):
        res[m.group(1)] = m.group(2)
    return res

titles, details = strings(block('title')), strings(block('detail'))
cat = block('catalogName')
names = {}
for m in re.finditer(r'case \.(\w+):\s*(?:isDark \? "([^"]+)" : "([^"]+)"|"([^"]+)")', cat):
    k = m.group(1)
    names[k] = (m.group(2), m.group(3)) if m.group(2) else (m.group(4), m.group(4))
names['followSystem'] = ('Afterglow', 'Alabaster')

defs = {}
for f in glob.glob(themes_dir + '/*.swift'):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'GhosttyThemeDefinition\(\s*name: "([^"]+)",(.*?)\n    \)', s, re.S):
        body = m.group(2)
        get = lambda k: (re.search(k + r': "([0-9a-fA-F]{6})"', body) or [None, None])[1]
        pal = dict(re.findall(r'(\d+): "([0-9a-fA-F]{6})"', body.split('palette:')[1]))
        defs[m.group(1)] = {
            'background': '#' + get('background'),
            'foreground': '#' + get('foreground'),
            'palette': ['#' + pal[str(i)] for i in range(16)],
        }

options, used = [], {}
for case, pid in ids.items():
    dark, light = names[case]
    for n in (dark, light):
        used[n] = defs[n]
    options.append({'id': pid, 'title': titles[case], 'dark': dark, 'light': light})
import os
os.makedirs(out, exist_ok=True)
for order, o in enumerate(options):
    def half(name):
        d = defs[name]
        return {'background': d['background'], 'foreground': d['foreground'], 'ansi': d['palette']}
    doc = {'id': o['id'], 'order': order, 'title': o['title'], 'detail': details.get(next(c for c, v in ids.items() if v == o['id']), ''), 'dark': half(o['dark'])}
    if o['light'] != o['dark']:
        doc['light'] = half(o['light'])
    json.dump(doc, open(os.path.join(out, o['id'] + '.json'), 'w'), indent=1, ensure_ascii=False)
    open(os.path.join(out, o['id'] + '.json'), 'a').write('\n')
print(len(options), 'themes written')
