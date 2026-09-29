"""Klipper ut sprites ur DaVinci-arken i Downloads och sparar dem i assets/.

Arken har ett inbränt schackrutemönster i stället för riktig transparens,
så bakgrunden tas bort med en flood fill över gråa (omättade) pixlar från kanterna.
Kör:  python tools/cut_sprites.py
"""
from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path.home() / 'Downloads'
PREFIX = 'davinci_top_down_3_4_view_game_sprite__dark_fantasy_dungeo'
OUT = Path(__file__).resolve().parent.parent / 'assets'
OUT.mkdir(exist_ok=True)


def sheet(n):
    name = f'{PREFIX}.png' if n == 0 else f'{PREFIX} ({n}).png'
    return Image.open(SRC / name).convert('RGBA')


def is_bg(p):
    r, g, b = p[:3]
    return max(r, g, b) - min(r, g, b) <= 12 and (r + g + b) / 3 >= 50


def remove_bg(im):
    """Flood fill från kanterna över schackrutan; tonar kantpixlar mjukt."""
    im = im.copy()
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i] or not is_bg(px[x, y]):
            continue
        seen[i] = 1
        px[x, y] = (0, 0, 0, 0)
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    # ta bort ljusa halo-pixlar som gränsar till bakgrunden
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if seen[y * w + x]:
                continue
            if any(seen[(y + dy) * w + x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                r, g, b, a = px[x, y]
                if max(r, g, b) - min(r, g, b) <= 18 and (r + g + b) / 3 >= 90:
                    px[x, y] = (0, 0, 0, 0)
    return im


def clear_enclosed(im, min_area=300):
    """Tar bort stora inneslutna schackrute-fläckar (t.ex. innanför en båge)."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0 or not is_bg(px[sx, sy]):
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sy * w + sx] = 1
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] and is_bg(px[nx, ny]):
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            if len(comp) >= min_area:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
    return im


def trim(im, pad=2):
    box = im.getbbox()
    if not box:
        return im
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def fit(im, size):
    """Skalar så att längsta sidan blir `size`, centrerat på kvadratisk duk."""
    im = trim(im)
    s = size / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size))
    canvas.paste(im, ((size - im.width) // 2, size - im.height), im)  # fötterna nere
    return canvas


def save(im, name):
    im.save(OUT / f'{name}.png')
    print('sparade', name, im.size)


# ---- Rutor (ark 0: 3x3-rutnät) ----
tiles = sheet(0)
C = 1024 / 3
cells = {
    'floor': (0, 0), 'earth': (1, 0), 'gold': (2, 0),
    'rock': (0, 1), 'gem': (2, 1), 'claimed': (0, 2), 'wall': (2, 2),
}
for name, (cx, cy) in cells.items():
    inset = 40 if name != 'floor' else 70
    box = (int(cx * C + inset), int(cy * C + inset), int((cx + 1) * C - inset), int((cy + 1) * C - inset))
    if name == 'floor':  # undvik facklan uppe i hörnet
        box = (int(cx * C + 40), int(cy * C + 110), int(cx * C + 40 + 200), int(cy * C + 110 + 200))
    save(tiles.crop(box).resize((64, 64), Image.LANCZOS), f'tile_{name}')

# ---- Rum (ark 1: isometriska plattor -> golvtextur uppifrån) ----
rooms = sheet(1)
# Golvdiamantens hörn (topp, vänster, botten, höger), uppmätta för hand i arket.
room_quads = {
    'lair':     ((262, 75), (32, 195), (265, 330), (492, 200)),
    'hatchery': ((762, 72), (535, 195), (765, 330), (992, 200)),
    'treasury': ((510, 350), (272, 490), (512, 630), (752, 490)),
    'training': ((272, 660), (30, 820), (262, 955), (490, 815)),
    'library':  ((768, 690), (540, 820), (770, 960), (1000, 820)),
}
for name, (top, left, bottom, right) in room_quads.items():
    # krymp diamanten 8 % mot mitten så att plattans kanter inte kommer med
    cx = (top[0] + left[0] + bottom[0] + right[0]) / 4
    cy = (top[1] + left[1] + bottom[1] + right[1]) / 4
    shrink = lambda p: (cx + (p[0] - cx) * 0.92, cy + (p[1] - cy) * 0.92)
    t, l, b, r = map(shrink, (top, left, bottom, right))
    # QUAD-ordning: övre vänster, nedre vänster, nedre höger, övre höger
    flat = rooms.transform((256, 256), Image.QUAD, (*l, *b, *r, *t), Image.BICUBIC)
    save(flat, f'room_{name}')

# ---- Specialobjekt (ark 2) ----
special = remove_bg(sheet(2))
for name, box in {'heart': (60, 40, 460, 495), 'portal': (580, 80, 945, 470), 'gate': (285, 530, 830, 955)}.items():
    save(fit(special.crop(box), 192), name)

# ---- Varelser (ark 3) ----
cr = remove_bg(sheet(3))
for name, box in {'imp': (100, 60, 410, 450), 'goblin': (500, 50, 930, 475),
                  'mistress': (140, 495, 405, 995), 'warlock': (580, 550, 925, 990)}.items():
    save(fit(cr.crop(box), 96), name)

# ---- Hjältar (ark 4) ----
he = remove_bg(sheet(4))
for name, box in {'warrior': (25, 45, 300, 505), 'archer': (340, 30, 730, 510), 'priest': (730, 70, 985, 500),
                  'dwarf': (35, 515, 340, 995), 'lord': (690, 505, 995, 1015)}.items():
    im = he.crop(box)
    if name == 'archer':
        im = clear_enclosed(im)
    save(fit(im, 96), name)
