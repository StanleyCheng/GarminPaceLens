# GarminPaceLens icons

The user supplied `GarminPaceLens.png` on 2026-10-03. The original is a
1254 × 1254 RGBA PNG. `assets/branding/garmin-pace-lens-master.png` is a
byte-identical copy. The dashboard header uses its 512px export,
`viz/icons/garmin-pace-lens.png`, with the existing 1.2× CSS scale.

Browser and bookmark icons use
`assets/branding/garmin-pace-lens-favicon-master.png`. This square variant
was made with the built-in imagegen edit tool: the artwork fills the canvas
and dark navy fills the rounded-corner areas. Every pixel is opaque, so
light browser surfaces cannot show a white border through transparent
padding or corners.

| Export | Size | Use |
| --- | --- | --- |
| `viz/favicon.ico` | 16, 32, 48 px | Browser favicon |
| `viz/favicon-16x16.png` | 16 × 16 px | Browser favicon |
| `viz/favicon-32x32.png` | 32 × 32 px | Browser favicon |
| `viz/icons/garmin-pace-lens-favicon.png` | 512 × 512 px | High-resolution browser favicon |
| `viz/apple-touch-icon.png` | 180 × 180 px | Safari bookmark and home screen |
| `viz/icons/garmin-pace-lens.png` | 512 × 512 px | Dashboard header artwork |

The dashboard and repository guide use `v=garmin-pace-lens-2` on icon URLs
to refresh cached icons. Both the favicon PNGs and every ICO frame have
fully opaque outer edges with no white border.

To reproduce browser exports with Pillow, open the favicon master as RGBA,
resize with `Image.Resampling.LANCZOS`, and save the ICO with
`sizes=[(16, 16), (32, 32), (48, 48)]`.

## Imagegen edit prompt

Use case: precise-object-edit. Asset type: production browser favicon master.
Edit the supplied Garmin Pace Lens logo solely to remove its unused outer
margin and make a completely opaque full-bleed square favicon. Crop tightly
to the actual dark rounded-square icon silhouette, ignoring stray transparent
pixels outside it, then enlarge its existing artwork so the main dark square
reaches every edge of the image. Fill the small areas outside the rounded
corners with matching dark navy taken from the icon so the entire square,
including all four corners, is opaque. There must be NO white edge, no
transparent edge, no padding, no outer border, and no framing margin.
Preserve the original mountain shapes, white runner, blue and cyan curved
graph, graph dots, lettering, colors and relative positions exactly. Exact
existing text: GARMIN with registered trademark and PaceLens. Do not redraw
or redesign the interior artwork; perform a tightly framed crop and opaque
dark corner extension only. Output one clean square PNG with artwork
extending edge to edge, suitable for resizing to 16px/32px favicons.
