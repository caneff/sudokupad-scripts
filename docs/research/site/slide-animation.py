"""Writes a slide's animated WebP from its before and after pictures: a hold on the before, a crossfade, a hold on the after, a crossfade back,
looping. Nothing else moves. Run: python3 -I slide-animation.py before.png after.png target.webp
The slideshow's still picture is the after picture, which a visitor who prefers reduced motion sees (site/slideshows.json's `animation` field)."""
import sys
from PIL import Image

HOLD_MS = 2500
FADE_STEPS = 3
FADE_STEP_MS = 100
QUALITY = 95

before, after = (Image.open(path).convert('RGB') for path in sys.argv[1:3])
if before.size != after.size:
    sys.exit(f'the before picture is {before.size} and the after {after.size}: a crossfade needs one size')
fade = [Image.blend(before, after, i / (FADE_STEPS + 1)) for i in range(1, FADE_STEPS + 1)]
frames = [before, *fade, after, *reversed(fade)]
durations = [HOLD_MS] + [FADE_STEP_MS] * FADE_STEPS + [HOLD_MS] + [FADE_STEP_MS] * FADE_STEPS
frames[0].save(sys.argv[3], save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=QUALITY, method=6)
