# Vititi VTT

A simple virtual tabletop: Svelte 5 + Bootstrap 5 on the front end, PocketBase (v0.23+) for the backend and real-time sync.

## Run the front end

```bash
npm install
cp .env.example .env      # then set VITE_PB_URL to your PocketBase server
npm run dev               # dev server
npm run build             # static build in dist/ (host it anywhere)
```

## Connect your PocketBase server

### 1. Point the app at it
In `.env`:
```
VITE_PB_URL=https://pb.example.com
```
Restart `npm run dev` after changing it. Vite only reads `.env` at startup.

- If the VTT is served over **https**, PocketBase must be **https** too, or the browser blocks it as mixed content.
- CORS: PocketBase allows every origin by default. If you started it with `--origins=...`, add the VTT's URL to that list.
- If PocketBase sits behind nginx or Caddy, the proxy must allow **SSE** (Server-Sent Events) for `/api/realtime`. For nginx that means `proxy_buffering off;`, `proxy_read_timeout 360s;`, and `proxy_http_version 1.1;`.

### 2. Create the collections

The app uses its **own** auth collection, `vititi_users`, and leaves PocketBase's default `users` collection alone. Players log in with **name + password**. The built-in `email` field still exists (PocketBase requires it on auth collections), but it's optional and unused. Names must be unique.

**Option A: JSON import (easiest).** Open **Settings → Import collections** in the dashboard and paste or load `pocketbase/pb_schema.json`. Make sure the "delete missing collections" option is **off**, so your other collections are kept. Review the changes, then confirm. This creates `vititi_users`, `maps`, `tokens`, `drawings` and `game` with all fields and API rules.

**Option B: migration.** Copy `pocketbase/pb_migrations/1793400000_init_vtt.js` into the `pb_migrations/` folder next to your `pocketbase` executable. Restart PocketBase, or run `./pocketbase migrate up`.

**What gets created** (for reference, or if you'd rather build it by hand):

| Collection | Fields |
|---|---|
| `vititi_users` (auth) | `name` text (required, unique index, set as the only *identity field* under Options → Password auth), `role` select (`dm`,`player`). The built-in `email` field is set to not required. |
| `maps` | `name` text (required), `image` file (single, images, max ~50MB), `width` `height` numbers, `grid_type` select (`square`,`hex`), `grid_size` `grid_offset_x` `grid_offset_y` numbers, `grid_visible` bool, `fog` json, `created` autodate |
| `tokens` | `map` relation→maps (single, required, cascade delete), `name` text, `image` file, `x` `y` `size` numbers, `hidden` bool, `dm_only` bool, `deceased` bool, `created` autodate |
| `drawings` | `map` relation→maps (cascade), `author` relation→vititi_users, `kind` select (`aoe`,`highlight`), `shape` select (`circle`,`half`,`quarter`,`rect`), `x1` `y1` `x2` `y2` numbers, `color` text, `created` autodate |
| `game` | `active_map` relation→maps (single, not cascade), `created` autodate |

API rules (A = `@request.auth.id != ""`, DM = `@request.auth.role = "dm"`):

| Collection | List/View | Create | Update | Delete |
|---|---|---|---|---|
| vititi_users | A | `@request.body.role = "player"` | `id = @request.auth.id && @request.body.role:isset = false` | superusers only |
| maps | A | DM | DM | DM |
| tokens | A | DM | see below | DM |
| drawings | A | `@request.auth.id != "" && @request.body.author = @request.auth.id` | DM | `author = @request.auth.id \|\| @request.auth.role = "dm"` |
| game | A | DM | DM | DM |

tokens update rule (players may only change x/y of unlocked, visible tokens):
```
@request.auth.role = "dm" || (@request.auth.id != "" && dm_only = false && hidden = false && @request.body.map:isset = false && @request.body.name:isset = false && @request.body.image:isset = false && @request.body.size:isset = false && @request.body.hidden:isset = false && @request.body.dm_only:isset = false && @request.body.deceased:isset = false)
```

### 3. Create the DM account
Register in the app with a name and password. New accounts start as `player`. Then in the dashboard open **vititi_users**, find your record, and set `role` to `dm`. Log out and back in. Players just register.

## Using it

**DM**
- **Maps:** drop or upload images in the sidebar. "View" previews a map for you only. **"Move players here"** switches every player to that map.
- **Map settings:** grid type (square/hex), cell size in px (1 cell = 5 ft), and X/Y offset so the grid lines up with the map art. Changes sync live.
- **Tokens:** use the "Add token" form, or drag image files straight onto the map. Select a token to rename or resize it, toggle 👻 hidden, 🔒 DM-only or 💀 deceased (greyed out with a skull badge), move it to another map, or delete it.
- **Fog:** turn it on in Map settings, then drag rectangles with the **Reveal Fog** and **Hide Fog** tools. "Cover all" and "Reveal all" reset it. The DM sees fog at 50% opacity; players see it solid.

**Everyone**
- **Camera:** mouse wheel zooms. Right-drag, middle-drag, Space+drag, or left-drag on empty space (Select tool) pans. "Fit map" re-centres.
- **Select / Move:** drag tokens. Positions sync live while you drag and snap to the grid on release if *Snap to grid* is on. While dragging, a ruler shows how far the token has moved.
- **Measure:** drag to measure. Choose how diagonals count (5e = 5 ft each, 5/10/5, or Euclidean). The line stays until your next click or Esc. *Measurements are local and other players don't see them.*
- **Area of Effect:** pick full, half or quarter circle and a colour, then drag from the origin outward. The drag sets radius and direction. With snap on, the radius snaps to 5 ft steps.
- **Highlight:** drag a rectangle. Its size is shown in feet.
- AoEs and highlights stay on the map and sync to everyone. Remove one by selecting it (Select tool) and clicking its red ×, by pressing Delete, or from the sidebar list ("Clear mine"; the DM also gets "Clear all").

## Code layout

```
src/
  lib/pb.js            PocketBase client (reads VITE_PB_URL)
  lib/auth.svelte.js   login/register/logout, current user, isDM()
  lib/game.svelte.js   shared state + realtime subscriptions + CRUD
  lib/ui.svelte.js     local UI state (current tool, snap, colour…)
  lib/geometry.js      grid snapping (square/hex), distances, AoE shapes
  components/
    Table.svelte       viewport: camera, layers, all pointer tools
    Grid/Fog/Token/Drawing/Ruler.svelte   SVG layers
    Toolbar, Sidebar, MapManager, MapSettings, TokenPanel, DrawingList, Login
```

Rendering is one SVG: map image → grid → drawings → tokens → fog → live previews. World coordinates are pixels of the map image. Useful CSS hooks for styling: `.vtt-token`, `.token-hidden`, `.token-deceased`, `.vtt-token-body`, `.vtt-token-skull`, `.vtt-grid-line`, `.vtt-fog`, `.vtt-drawing`, `.vtt-ruler`. CSS beats SVG presentation attributes, so for example `.vtt-grid-line { stroke: red }` works.

## Known limitations (by design, to keep it simple)
- Hidden tokens and fog are hidden **on the client** (the token isn't rendered for players). A player who inspects network traffic could still see hidden token data. Making this secure requires server-side filtering plus extra handling of realtime events.
- Measurement lines aren't broadcast to other players.
- There's no pinch-zoom on touch devices. Single-finger drag works.
