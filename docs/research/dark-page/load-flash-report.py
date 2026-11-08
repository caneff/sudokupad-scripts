# Reads load-flash-frames/ (written by load-flash-probe.mjs) and prints when the page was white and when dark.
# Run: python3 -I docs/research/dark-page/load-flash-report.py
import json, os
from PIL import Image
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'load-flash-frames')
times = json.load(open(os.path.join(d, 'times.json')))
log = json.load(open(os.path.join(d, 'log.json')))
prev = None
print('screencast (pixel at the right margin, mid-height):')
for i, ts in enumerate(times):
    im = Image.open(os.path.join(d, f'f{i:03d}.png')).convert('RGB')
    w, h = im.size
    px = im.getpixel((w - 20, h // 2))
    if px != prev and (prev is None or abs(px[0] - prev[0]) > 8 or i < 5): print(f'  frame {i} at {ts} ms: {px}')
    prev = px
print('in-page log (changes only):')
prev = None
for e in log:
    k = (e.get('html'), e.get('body'), e.get('board'), e.get('style'), e.get('fw'), e.get('rs'), e.get('paint'))
    if k != prev: print(' ', e)
    prev = k
