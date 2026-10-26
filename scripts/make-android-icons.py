"""Generates the Android launcher icons from build/icon.png (run: python scripts/make-android-icons.py). Needs Pillow."""
import os
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
res = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
src = Image.open(os.path.join(root, 'build', 'icon.png')).convert('RGBA')

# legacy (pre-8.0 style / fallback) icons: the full rounded tile
for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    d = os.path.join(res, f'mipmap-{name}')
    os.makedirs(d, exist_ok=True)
    src.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))

# adaptive foreground: only the bright star (alpha from luminance), centred in the 66% safe zone of a 432 px canvas
star = src.copy()
px = star.load()
for y in range(star.height):
    for x in range(star.width):
        r, g, b, a = px[x, y]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        px[x, y] = (r, g, b, int(max(0, min(1, (lum - 95) / 60)) * a))
bbox = star.getbbox()
star = star.crop(bbox)
canvas = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
side = int(432 * 0.5)
star = star.resize((side, int(side * star.height / star.width)), Image.LANCZOS)
canvas.paste(star, ((432 - star.width) // 2, (432 - star.height) // 2), star)
d = os.path.join(res, 'drawable-nodpi')
os.makedirs(d, exist_ok=True)
canvas.save(os.path.join(d, 'ic_launcher_foreground.png'))
print('ok')
