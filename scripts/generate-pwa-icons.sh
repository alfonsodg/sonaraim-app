#!/bin/sh
# Generates real PWA icons for sonaraim-app (issue #28).
# Reproducible with ImageMagick: dark tile + SonarAIM "S" glyph ring.
set -eu
SCRIPT_DIR=$(dirname -- "$0")
OUT_DIR="$SCRIPT_DIR/../public/icons"
mkdir -p "$OUT_DIR"
for SIZE in 192 512; do
  magick -size "${SIZE}x${SIZE}" xc:"#090d16" \
    -fill "#121826" -draw "roundrectangle 8,8 $((SIZE - 8)),$((SIZE - 8)) 48,48" \
    -fill "none" -stroke "#22d3ee" -strokewidth "$((SIZE / 32))" \
    -draw "circle $((SIZE / 2)),$((SIZE / 2)) $((SIZE / 2)),$((SIZE / 4))" \
    -fill "#22d3ee" -font DejaVu-Sans -pointsize "$((SIZE / 3))" -gravity center \
    -annotate +0+8 "S" \
    "$OUT_DIR/icon-${SIZE}.png"
done
ls -la "$OUT_DIR"
#!/bin/sh
# Generates real PWA icons for sonaraim-app (issue #28).
# Reproducible with ImageMagick: dark tile + SonarAIM ring + "S" glyph.
set -eu
SCRIPT_DIR=$(dirname -- "$0")
OUT_DIR="$SCRIPT_DIR/../public/icons"
mkdir -p "$OUT_DIR"
for SIZE in 192 512; do
  magick -size "${SIZE}x${SIZE}" xc:"#090d16" \
    -fill "#121826" -draw "roundrectangle 8,8 $((SIZE - 8)),$((SIZE - 8)) 48,48" \
    -fill "none" -stroke "#22d3ee" -strokewidth "$((SIZE / 32))" \
    -draw "circle $((SIZE / 2)),$((SIZE / 2)) $((SIZE / 2)),$((SIZE / 4))" \
    -fill "#22d3ee" -font DejaVu-Sans -pointsize "$((SIZE / 3))" -gravity center \
    -annotate +0+8 "S" \
    "$OUT_DIR/icon-${SIZE}.png"
done
ls -la "$OUT_DIR"
