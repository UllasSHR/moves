# Brand assets

`moves-logo.png` is the monochrome four-fingertip Moves mark, adapted from the
approved logo concept with the built-in image generator. Its white background
keeps the black mark visible in both light and dark README views. The README
renders it at 128 by 128 pixels. The native build converts this source into a
multi-resolution macOS app icon (`MovesIcon.icns`) for Finder and app discovery.

`public/brand/moves-mark.png` is the transparent version used in the native panel
header and as a template menu-bar icon. macOS adapts the menu icon to the menu
bar's appearance; the dark panel displays the mark in white. Generated ICNS and
iconset files stay out of Git. Moves is a menu-bar app, so it does not keep a
normal Dock icon while running.

## Generation prompt

Extract the approved large central four-stroke Moves symbol from this concept sheet into a clean standalone logo asset. Preserve that exact four-stroke mark's shape, spacing, rounded ends, proportions and left-right symmetry; do not redesign it. Show only ONE black four-stroke symbol, centered on a flat pure white square canvas, filling about 76 percent of the canvas width with even generous margins. Remove the word Moves, Concept 01, all other text, all tiles, menu-bar examples, borders and every usage mockup. Pure black mark and pure white background only, flat crisp edges, no gradient, no texture, no shadows, no green, no extra decoration. This single asset will sit above a GitHub README title and needs to be clear when displayed at 128px.

### Transparent UI mark

Prepare a native UI template icon from this approved Moves symbol. Preserve the exact four black curved fingertip strokes, their thickness, spacing, rounded ends, proportions and symmetry. Remove ONLY the white background, replacing it with genuine transparency. The mark must be solid black with clean edges, no white opaque rectangle anywhere. Keep a square canvas and the same margins. No new strokes, text, colors, glow, texture, gradient or shadow. It will be used as an NSImage template in a macOS menu bar and a small app header, so the background must have alpha zero and the four glyphs remain opaque black.
