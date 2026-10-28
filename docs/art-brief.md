# Ship art brief

This is for the graphics AI (Midjourney, Recraft.ai or Imagen 3) and for whoever packages its pictures into the app. It covers the style, the rules for keeping the designs original, the file format, and the first batch to make. [sprite-list.md](sprite-list.md) lists every sprite with its exact size and anchor, plus each ship's deck spots.

Ship is a study app dressed up as a cartoon ship. The art is layered sprites. The app puts them together, moves them, and adds the effects on top.

## Style

- **Look:** clean cartoon/anime with a 2.5D side view. Nautical adventure charm in the spirit of classic adventure anime and Studio Ghibli. Warm, sunny palette, bold dark outlines and simple cel shading (a base, one shadow tone and a highlight). No photo textures, no heavy gradients and no text.
- **Outlines:** about 4 px at 1× (the ships use `#2A2238`). Light comes from the upper left.
- **Ships** are seen from the side, bow on the right, from slightly above. Each deck shows as a thin band about 24 px deep, so sailors can stand on it.
- **Sailors** are chibi: a big head on a small body. They're seen in 3/4 view facing the viewer, seated behind a desk that hides their legs.
- **Leave the motion to the app.** Draw everything at rest:
  - The app bobs and tilts the ship, billows the sails, ripples the flags, turns the helm wheel, swings the bell and sways the citrus tree.
  - It nods the sailor's head, blinks (by swapping eye sprites) and nudges the hands.
  - It adds the effects: Zzz bubbles, steam, smoke, sparkles and coins.
  - So draw flags flat, and draw the wheel, bell, fruit and blossoms as separate sprites.

## Keep it original

The designs must be original so the app is safe to share. They may share the *mood* of One Piece, but nothing that could be mistaken for it.

- **No franchise copies.** Don't copy ships, characters, flags or logos from One Piece (Going Merry, Thousand Sunny, Baratie, Polar Tang, Red Force, Nami's orange grove) or any other franchise. Use no names, words or logos at all.
- **No Straw Hat Jolly Roger.** Never draw a skull wearing a straw hat with a red band over crossed bones.
  - Ship's starter flag is the **Sun-Hat Skull**: a lilac sun hat with a teal band and a daisy, on a winking skull in round gold glasses, over teal crossed quills, on a navy field.
- **The default sailor** wears a straw hat with a **blue** ribbon (never red), with brown hair and a blue striped shirt. No scar under the eye, no red vest, no sandals.
- **The Woolly Wanderer's ram** is a carved, painted wooden ram with its own features, such as long curling horns and a tasselled bridle. Don't make it the Going Merry's round sheep head.
- **The Golden Mane's lion** is a carved lion head in side profile with a flowing mane. Don't make it a round, front-facing sun-face.
- **Mythic ships** use generic or public-domain myths only (Pegasus, merfolk, alebrijes, kaiju, gorgons, Sasquatch, chalkydri).

## Files

- **Format:** transparent PNG (8-bit with alpha, sRGB), or SVG with `width` and `height` set. One sprite per file.
  - Name files in lowercase with dashes, e.g. `hull-back.png` or `hat-tricorn.png`.
- **Size:** each sprite has an exact size, listed in [sprite-list.md](sprite-list.md). Keep the empty space transparent; don't crop it away, because the anchor is measured from the top-left corner.
- **Sharper art:** art at exactly double size is welcome and looks better when zoomed in. Put `"density": 2` in its manifest entry, and double its size and anchor.
- **Anchor:** the one pixel that sits on the app's placement point, such as where a figurehead meets the bow or where a pot stands on the deck. Each sprite's anchor is in the list; use it unless you have a reason not to.
- **Colorable pieces:** draw skin, hair, coats and sleeves in **greys**. The app colors them in for each sailor.
  - Mid-grey `#808080` becomes the chosen color, lighter greys become highlights and darker greys become shadows. Outlines stay near-black.
  - Mark these pieces `"tintable": true`.

## Folders and manifests

Everything goes under `apps/web/public/assets/`, one folder per sheet:

```text
assets/
├── index.json               written by the check script; don't edit
├── ships/woolly-wanderer/   hull-back, rigging, hull-front (+ cabin-decor, cabin-room)
├── sails/                   <style>:billowing and <style>:furled for every sail style
├── figureheads/             one per figurehead
├── flags/                   one per flag
├── props/                   helm, bell, citrus tree, fruit, blossom, desks, galley table
├── avatars/                 the sailor's layers
└── environment/tropical-sea/  sky, clouds, waves-back, waves-mid, waves-front
```

Each folder has a `manifest.json` that lists its images. Here is a starter ship, with one spot moved to suit the drawing:

```json
{
  "version": 1,
  "kind": "ship",
  "sprites": [
    { "id": "hull-back", "file": "hull-back.png", "width": 1000, "height": 300, "anchorX": 500, "anchorY": 150 },
    { "id": "rigging", "file": "rigging.png", "width": 1200, "height": 700, "anchorX": 600, "anchorY": 700 },
    { "id": "hull-front", "file": "hull-front.png", "width": 1000, "height": 300, "anchorX": 500, "anchorY": 150 },
    { "id": "bowsprit", "file": "bowsprit.png", "width": 160, "height": 60, "anchorX": 0, "anchorY": 40 }
  ],
  "placements": [
    { "sprite": "hull-back", "x": 0, "y": 0, "zIndex": 10 },
    { "sprite": "rigging", "x": 0, "y": 0, "zIndex": 20 },
    { "sprite": "hull-front", "x": 0, "y": 0, "zIndex": 60 },
    { "sprite": "bowsprit", "x": 470, "y": -30, "zIndex": 65 }
  ],
  "layout": { "desk": { "x": -200, "y": 0 } }
}
```

- **`placements`** puts each piece in **ship units**:
  - The main deck is at y = 0 and the ship's middle at x = 0.
  - The stern is at x = −500 and the bow at +500, and y grows downward.
  - `zIndex` sets the stacking order. The app draws its own layers at 30 (sails), 50 (props and sailors), 70 (figurehead) and 80 (flag).
  - Leave `placements` out to get the default stack: the three pieces shown above.
- **`layout`** moves the app's spots to match the drawing: `desk`, `helm`, `citrusTree`, `bell`, `tables`, `masts`, `bow`, `flag`, `waterline`, `surfaces` and so on. Each ship's built-in spots are in [sprite-list.md](sprite-list.md).

Avatar sprite ids are a layer name plus a variant, e.g. `hat:tricorn`, `eyes:focus` or `arms:typing`. A few more variants are also understood:

- `body:<skin>` and `head:<skin>` for a skin tone drawn in full color instead of greys;
- `arms:<pose>:<coat>` for sleeves that suit one coat, e.g. `arms:writing:toga`;
- `hands:<pose>:<skin>`.

### Check your work

From the repository root:

```bash
npm run assets -w @ship/web   # checks every manifest and image size, rewrites index.json and sprite-list.md
npm test                      # the same checks run as tests
npm run dev                   # look at it: http://localhost:5173, or /dev/ships.html and /dev/avatars.html
```

**When the app switches to the art:** a part switches from the built-in drawing to your art as soon as its whole set is in, and each part switches on its own.

- A ship switches once it has `hull-back`, `rigging` and `hull-front`.
- A sail style switches once it has both looks.
- The citrus tree switches once it has all three looks plus the fruit and blossom.
- The sea switches once it has all three wave bands.
- A sailor switches only when every layer for their outfit exists, in every pose and face.

Add `?procedural=1` to the gallery pages to compare your art with the built-in drawings.

## Starter pack: make these first

1. **Woolly Wanderer** (`ships/woolly-wanderer/`): `hull-back`, `rigging` and `hull-front`.
   - A small, friendly caravel with a grassy lawn deck, a rustic wooden cabin under the raised stern deck, and two masts.
   - Its deck spots are in the sprite list.
2. **Sails** (`sails/`): `square:billowing` and `square:furled`, for the starter square sails.
3. **Figurehead** (`figureheads/`): `ram`.
4. **Flag** (`flags/`): `straw-skull`, the Sun-Hat Skull described above.
5. **Citrus tree** (`props/`):
   - `citrus-normal`, `citrus-blooming` and `citrus-wilted`, a potted tree in each look, with no fruit;
   - one `citrus-fruit` and one `citrus-blossom`.
6. **The starter sailor** (`avatars/`), in greys where marked:
   - `body`, `head`, `hair-back:messy` and `hair-front:messy`;
   - `coat:striped-shirt`, `hat:straw-hat` and `tool:quill-logbook`;
   - eyes: `open`, `focus`, `blink`, `happy` and `sleep`;
   - mouths: `smile`, `flat`, `open`, `sip` and `sleep`;
   - `arms:` and `hands:` for `writing`, `relaxed`, `sipping`, `stretching`, `spyglass` and `resting`.

   Their desk is `desk:captains-desk` in `props/`.

After that, any order works. The other 15 ships, the remaining sails, figureheads and flags, the other outfits and the environments are all in the sprite list.
