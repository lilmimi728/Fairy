# ✦ Fairy Garden ✦

A cozy, **Stardew Valley–inspired pixel-art game** where you play as a garden
fairy. Till sleepy soil, plant magic seeds, water them under the sun, and
harvest glowing blooms for **Fairy Dust** ✨ — all set to a gentle day/night
cycle.

Everything is rendered procedurally on an HTML5 canvas at a 16px pixel grid and
scaled up crisply, so there are **no external image assets** and **no build
step** — it's pure HTML, CSS and vanilla JavaScript.

![pixel fairy farming](https://img.shields.io/badge/style-pixel%20art-ff9ed8) ![no build](https://img.shields.io/badge/build-none-b6f5d8)

> Also in this repo: **[Pulse](health/)**, a personal health, training and weekly accountability app.

## How to play

| Action | Keys |
| --- | --- |
| Fly around | `W` `A` `S` `D` or arrow keys |
| Select a tool | `1` Hoe · `2` Seeds · `3` Watering Can · `4` Harvest |
| Use tool on the tile you face | `Space` or `E` |
| Use tool on a nearby tile | Mouse click (within range) |
| Refill the watering can | `R` next to the pond |

### The gameplay loop

1. **Hoe** a patch of grass to till it into soil.
2. **Plant** a magic seed in the tilled soil.
3. **Water** it — watered crops grow during the daytime.
4. Re-water as it advances through each growth stage.
5. When a flower **glows and sparkles**, switch to the basket and **harvest**
   it for Fairy Dust ✨.
6. Refill your watering can at the **pond** whenever it runs dry.

Time flows on a day/night cycle; crops only grow while the sun is up, and the
world tints toward dusk and night as the clock turns.

## Running it

No server or dependencies required — just open the page:

```bash
# easiest: open the file directly
open index.html        # macOS
xdg-open index.html    # Linux

# or serve it locally (handy on some browsers)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project layout

```
index.html        # markup, HUD and overlay
css/style.css     # cozy UI theme
src/sprites.js    # procedural pixel-art drawing (terrain, crops, the fairy)
src/input.js      # keyboard + mouse handling
src/world.js      # tile map, terrain and crop state
src/player.js     # the fairy's movement and facing
src/game.js       # main loop, day/night, tools and HUD wiring
```

## Ideas for later

- Persisting your garden to `localStorage` between visits
- A shop to spend Fairy Dust on new seed colors and tools
- Sleeping in a cottage to skip to the next morning
- Weather, fireflies at night, and seasonal flowers

---

Made with a little magic. 🧚
