"""Draws the AyuTube mark (an "A" chevron turned 90 degrees clockwise so it
reads like a play button) and writes the icon and splash sources that
@capacitor/assets turns into Android resources."""
from PIL import Image, ImageDraw

SS = 4
POLYS = [
    ([(627, 337), (722, 487), (555, 738), (271, 900)], "#FF0D50"),
    ([(271, 900), (555, 738), (449, 900)], "#DC0046"),
    ([(722, 487), (625, 635), (687, 722)], "#99002F"),
    ([(722, 487), (979, 900), (799, 900), (687, 722)], "#E8004E"),
]

# Turn the mark 90 degrees clockwise around the middle of its bounding box.
CX, CY = 625.0, 618.5


def turn(point):
    dx, dy = point[0] - CX, point[1] - CY
    return (CX - dy, CY + dx)


TURNED = [([turn(p) for p in pts], colour) for pts, colour in POLYS]
XS = [x for pts, _ in TURNED for x, _ in pts]
YS = [y for pts, _ in TURNED for _, y in pts]
MIN_X, MAX_X, MIN_Y, MAX_Y = min(XS), max(XS), min(YS), max(YS)
ASPECT = (MAX_X - MIN_X) / (MAX_Y - MIN_Y)


def logo(height):
    """The mark alone, `height` pixels tall, on a transparent background."""
    width = round(height * ASPECT)
    big = Image.new("RGBA", (width * SS, height * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    scale = height * SS / (MAX_Y - MIN_Y)

    for pts, colour in TURNED:
        draw.polygon(
            [((x - MIN_X) * scale, (y - MIN_Y) * scale) for x, y in pts], fill=colour
        )

    return big.resize((width, height), Image.LANCZOS)


def centred(size, fraction, background):
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    mark = logo(round(size * fraction))
    # The turned mark is a triangle whose weight sits left of its box, so nudge
    # it slightly right to look centred.
    nudge = round(mark.width * 0.04)
    canvas.alpha_composite(
        mark, ((size - mark.width) // 2 + nudge, (size - mark.height) // 2)
    )
    return canvas


BLACK = (0, 0, 0, 255)

centred(1024, 0.64, BLACK).convert("RGB").save("resources/icon-only.png")
centred(1024, 0.54, None).save("resources/icon-foreground.png")
Image.new("RGB", (1024, 1024), (0, 0, 0)).save("resources/icon-background.png")
splash = centred(2732, 0.24, BLACK).convert("RGB")
splash.save("resources/splash.png")
splash.save("resources/splash-dark.png")

# A copy of the mark for the web build.
logo(512).save("resources/logo-512.png")
