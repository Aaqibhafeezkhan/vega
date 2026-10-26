"""Generates build/icon.png (512x512): a deep-space rounded tile with a four-point star. Pure stdlib, deterministic."""
import math, struct, zlib, os

N = 512
R = 112  # corner radius
px = bytearray()

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def in_round_rect(x, y):
    cx = min(max(x, R), N - 1 - R)
    cy = min(max(y, R), N - 1 - R)
    return (x - cx) ** 2 + (y - cy) ** 2 <= R * R

def star(x, y):
    # four-point star: |x|^p + |y|^p <= r^p with p < 1 gives concave arms
    dx, dy = (x - N / 2) / (N * 0.36), (y - N / 2) / (N * 0.36)
    return abs(dx) ** 0.55 + abs(dy) ** 0.55 <= 1.0

for y in range(N):
    px.append(0)  # filter byte
    for x in range(N):
        if not in_round_rect(x, y):
            px += bytes((0, 0, 0, 0))
            continue
        t = (x + y) / (2 * N)
        base = mix((18, 20, 48), (8, 9, 20), t)
        # soft glow behind the star
        d = math.hypot(x - N / 2, y - N / 2) / (N * 0.5)
        glow = max(0.0, 1 - d) ** 2.2
        col = mix(base, (110, 130, 255), glow * 0.55)
        if star(x, y):
            s = max(0.0, 1 - d * 1.4)
            col = mix((200, 215, 255), (255, 255, 255), s)
        px += bytes((*col, 255))

def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(px), 9)) + chunk(b'IEND', b'')
os.makedirs('build', exist_ok=True)
open('build/icon.png', 'wb').write(png)
print('wrote build/icon.png', len(png), 'bytes')
