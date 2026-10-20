#!/usr/bin/env bash
# The Android app's launcher icons and splash screens, from the game's own
# icon (public/icons/icon-512.png), on its night purple:
#   bash scripts/android-art.sh
# The adaptive icon's foreground is the whole icon at 76 of its 108 dp, so
# the launcher's mask (a circle, a squircle…) keeps the rocket; the older
# icons (Android 7) are the icon itself, and a round one cut to a circle.
set -euo pipefail
ICON=public/icons/icon-512.png
RES=android/app/src/main/res
BG='#241b3f'
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dpi=${d%%:*} px=${d##*:}
  fg=$((px * 108 / 48)) inner=$((px * 76 / 48))
  convert "$ICON" -resize "${px}x${px}" -depth 8 -strip "$RES/mipmap-$dpi/ic_launcher.png"
  convert "$ICON" -resize "${px}x${px}" \( -size "${px}x${px}" xc:black -fill white -draw "circle $((px / 2)),$((px / 2)) $((px / 2)),0" \) -alpha off -compose CopyOpacity -composite -depth 8 -strip "$RES/mipmap-$dpi/ic_launcher_round.png"
  convert -size "${fg}x${fg}" xc:none \( "$ICON" -resize "${inner}x${inner}" \) -gravity center -composite -depth 8 -strip "$RES/mipmap-$dpi/ic_launcher_foreground.png"
done
# splash screens (before Android 12; from 12 on, the system shows the icon on the theme's colour)
for f in "$RES"/drawable*/splash.png; do
  size=$(identify -format '%wx%h' "$f")
  w=${size%x*} h=${size#*x}
  s=$(( (w < h ? w : h) * 2 / 5 ))
  convert -size "$size" "xc:$BG" \( "$ICON" -resize "${s}x${s}" \) -gravity center -composite -depth 8 -strip "$f"
done
