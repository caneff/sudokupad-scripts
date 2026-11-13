"""Writes a slide's animated WebP from its pictures in order: a hold on each, a crossfade to the next, and from the last a crossfade back to the
first, looping. Nothing else moves. Two pictures are a before and an after; more are the steps of one action, shown in turn.
Run: python3 -I slide-animation.py first.png [more.png ...] last.png target.webp
The slideshow's still picture is the last picture, which a visitor who prefers reduced motion sees (site/slideshows.json's `animation` field)."""
import sys
from PIL import Image

HOLD_MS = 2500
FADE_STEPS = 3
FADE_STEP_MS = 100
QUALITY = 95

*paths, target = sys.argv[1:]
if len(paths) < 2:
    sys.exit('an animation needs at least two pictures and a target')
pictures = [Image.open(path).convert('RGB') for path in paths]
if len({picture.size for picture in pictures}) > 1:
    sys.exit(f'the pictures are {[picture.size for picture in pictures]}: a crossfade needs one size')
frames, durations = [], []
for i, picture in enumerate(pictures):
    after = pictures[(i + 1) % len(pictures)]
    frames += [picture, *(Image.blend(picture, after, k / (FADE_STEPS + 1)) for k in range(1, FADE_STEPS + 1))]
    durations += [HOLD_MS] + [FADE_STEP_MS] * FADE_STEPS
frames[0].save(target, save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=QUALITY, method=6)
