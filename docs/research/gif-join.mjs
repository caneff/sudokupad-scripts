// Joins PNG frames into one looping GIF with Python's PIL (python3 with Pillow), for the site's animated pictures.
// Each frame is `{ files, ms, caption, captionUnder }`: `files` are PNG paths put side by side, 40 px apart and centered
// on the tallest, on white. A `files` entry may instead be `{ stack: [paths], scale }`: the PNGs one above the next, 8 px apart and right
// aligned (a `[width, height]` pair in place of a path is white space of that size), the whole shrunk by `scale` (1 by default); `caption` is a line of text centered under file number `captionUnder` (the last one by default).
// One palette serves every frame, so a color only one frame has (a red circle, a darker shade) keeps its own entry.
// The last frame's `ms` is its pause before the loop restarts.
import { spawnSync } from 'node:child_process'

const JOIN = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
frames, target = json.loads(sys.argv[1]), sys.argv[2]
font = ImageFont.load_default(size=36)
GAP, CAPTION_GAP, STACK_GAP = 40, 12, 8
def load(entry):
    if isinstance(entry, str):
        return Image.open(entry).convert('RGB')
    parts = [Image.new('RGB', tuple(f), 'white') if isinstance(f, list) else Image.open(f).convert('RGB') for f in entry['stack']]
    stack = Image.new('RGB', (max(p.width for p in parts), sum(p.height for p in parts) + STACK_GAP * (len(parts) - 1)), 'white')
    y = 0
    for part in parts:
        stack.paste(part, (stack.width - part.width, y))
        y += part.height + STACK_GAP
    scale = entry.get('scale', 1)
    return stack.resize((round(stack.width * scale), round(stack.height * scale)), Image.Resampling.LANCZOS) if scale != 1 else stack
sheets = []
for frame in frames:
    images = [load(f) for f in frame['files']]
    under = frame.get('captionUnder', len(images) - 1)
    height = max(im.height for im in images)
    xs = [sum(im.width + GAP for im in images[:i]) for i in range(len(images))]
    width = xs[-1] + images[-1].width
    captionTop = None
    if frame.get('caption'):
        captionTop = (height - images[under].height) // 2 + images[under].height + CAPTION_GAP
        height = max(height, captionTop + 44)
    sheet = Image.new('RGB', (width, height), 'white')
    for x, im in zip(xs, images):
        sheet.paste(im, (x, (max(i.height for i in images) - im.height) // 2))
    if captionTop is not None:
        ImageDraw.Draw(sheet).text((xs[under] + images[under].width // 2, captionTop), frame['caption'], fill='black', font=font, anchor='mt')
    sheets.append(sheet)
# Every frame is padded to the largest, so a caption longer than the others cannot change the size.
w, h = max(s.width for s in sheets), max(s.height for s in sheets)
padded = []
for s in sheets:
    canvas = Image.new('RGB', (w, h), 'white')
    canvas.paste(s, (0, 0))
    padded.append(canvas)
strip = Image.new('RGB', (w, h * len(padded)))
for i, im in enumerate(padded):
    strip.paste(im, (0, i * h))
palette = strip.quantize(colors=64)
padded = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in padded]
padded[0].save(target, save_all=True, append_images=padded[1:], duration=[f['ms'] for f in frames], loop=0, optimize=True)
`

export function joinGif (frames, target) {
  const joined = spawnSync('python3', ['-I', '-c', JOIN, JSON.stringify(frames), target], { encoding: 'utf8' })
  if (joined.status !== 0) throw new Error(`joining the frames failed: ${joined.error ?? joined.stderr}`)
}
