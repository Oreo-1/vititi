# Vititi VTT

A simple virtual tabletop: Svelte 5 + Bootstrap 5 on the front end, PocketBase (v0.23+) for the backend and real-time sync.

## Run the front end

```bash
pnpm install
cp .env.example .env      # then set VITE_PB_URL to your PocketBase server
pnpm dev                  # dev server
pnpm build                # static build in dist/ (host it anywhere)
```

## Connect your PocketBase server

### 1. Point the app at it
In `.env`:
```
VITE_PB_URL=https://pb.example.com
```

- If the VTT is served over **https**, PocketBase must be **https** too, or the browser blocks it as mixed content.
- CORS: PocketBase allows every origin by default. If you started it with `--origins=...`, add the VTT's URL to that list.
- If PocketBase sits behind nginx or Caddy, the proxy must allow **SSE** (Server-Sent Events) for `/api/realtime`. For nginx that means `proxy_buffering off;`, `proxy_read_timeout 360s;`, and `proxy_http_version 1.1;`.

### 2. Create the collections

The app uses its **own** auth collection, `vititi_users`, and leaves PocketBase's default `users` collection alone. Players log in with **name + password**. The built-in `email` field still exists (PocketBase requires it on auth collections), but it's optional and unused. Names must be unique.

**Option A: JSON import (easiest).** Open **Settings → Import collections** in the dashboard and paste or load `pocketbase/pb_schema.json`. Make sure the "delete missing collections" option is **off**, so your other collections are kept. Review the changes, then confirm. This creates `vititi_users`, `maps`, `tokens`, `drawings` and `game` with all fields and API rules.

**Option B: migration.** Copy `docker/pocketbase/pb_migrations/1793400001_import_vititi_schema.js` into the `pb_migrations/` folder next to your `pocketbase` executable and start it with `PB_SCHEMA_FILE=/path/to/pb_schema.json ./pocketbase serve` (or run `./pocketbase migrate up`). It imports `pocketbase/pb_schema.json` once, on a fresh database.

**Updating an existing database.** A newer version of the app can need new fields, and `pb_schema.json` is only imported automatically on a fresh database. For any existing database, Docker included, repeat Option A in the dashboard. Without the new fields, those values aren't saved: for example, renaming an AoE would appear to do nothing, a rotated rectangle would turn back after a reload, and the initiative order would be lost on reload. The import also removes fields the app no longer uses, with their data: `kind` on `drawings` is gone, because `shape` already tells circles and rectangles apart.

**What gets created** (for reference, or if you'd rather build it by hand):

| Collection | Fields |
|---|---|
| `vititi_users` (auth) | `name` text (required, unique index, set as the only *identity field* under Options → Password auth), `role` select (`dm`,`player`). The built-in `email` field is set to not required. |
| `maps` | `name` text (required), `image` file (single, images, max ~50MB), `width` `height` numbers, `grid_type` select (`square`,`hex`), `grid_size` `grid_offset_x` `grid_offset_y` numbers, `grid_visible` bool, `fog` json, `created` autodate |
| `tokens` | `map` relation→maps (single, required, cascade delete), `name` text, `image` file, `x` `y` `size` numbers, `hidden` bool, `dm_only` bool, `deceased` bool, `created` autodate |
| `drawings` | `map` relation→maps (cascade), `author` relation→vititi_users, `shape` select (`circle`,`half`,`quarter`,`rect`, required), `x1` `y1` `x2` `y2` numbers, `rotation` number (degrees, rectangles only), `color` text, `name` text (optional, max 50), `created` autodate |
| `game` | `active_map` relation→maps (single, not cascade), `initiative` json (turn order), `created` autodate |

API rules (A = `@request.auth.id != ""`, DM = `@request.auth.role = "dm"`):

| Collection | List/View | Create | Update | Delete |
|---|---|---|---|---|
| vititi_users | A | `@request.body.role = "player"` | `id = @request.auth.id && @request.body.role:isset = false` | superusers only |
| maps | A | DM | DM | DM |
| tokens | A | DM | see below | DM |
| drawings | A | `@request.auth.id != "" && @request.body.author = @request.auth.id` | DM, or the author (who can't change `author` or `map`) | `author = @request.auth.id \|\| @request.auth.role = "dm"` |
| game | A | DM | DM | DM |

tokens update rule (players may only change x/y of unlocked, visible tokens):
```
@request.auth.role = "dm" || (@request.auth.id != "" && dm_only = false && hidden = false && @request.body.map:isset = false && @request.body.name:isset = false && @request.body.image:isset = false && @request.body.size:isset = false && @request.body.hidden:isset = false && @request.body.dm_only:isset = false && @request.body.deceased:isset = false)
```

### 3. Create the DM account
Register in the app with a name and password. New accounts start as `player`. Then in the dashboard open **vititi_users**, find your record, and set `role` to `dm`. Log out and back in. Players just register.

### 4. Run with Docker

```bash
cp docker/.env.example .env     # set PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD
docker compose up -d --build
```

- App: http://localhost:7777 (change with `WEB_PORT`)
- PocketBase dashboard: http://localhost:7777/_/
- The collections from `pocketbase/pb_schema.json` are imported automatically on the first start.
- Data (database + uploaded maps/tokens) lives in the `pb_data` volume.
- Register in the app, then set your user's `role` to `dm` in the dashboard (`vititi_users`).

## Using it

**DM**
- **Maps:** drop or upload images in the sidebar. "View" previews a map for you only. **"Move players here"** switches every player to that map. ✏️ renames a map: Enter or clicking away saves, Esc cancels.
- **Map settings:** grid type (square/hex), cell size in px (1 cell = 5 ft), and X/Y offset so the grid lines up with the map art. Changes sync live.
- **Tokens:** use the "Add token" form, or drag image files straight onto the map. Select a token to rename or resize it, toggle 👻 hidden, 🔒 DM-only or 💀 deceased (greyed out with a skull badge), move it to another map, clone it, or delete it. A clone copies the token's name, image, size and toggles, and appears next to the original.
- **Fog:** turn it on in Map settings, then drag rectangles with the **Reveal Fog** and **Hide Fog** tools. "Cover all" and "Reveal all" reset it. The DM sees fog at 50% opacity; players see it solid. Fog edges are softened, fading inward from the edge of each revealed area; change `FOG_SOFTNESS` in `src/lib/geometry.js` to adjust this. If a player drops a token with its center in the fog, it goes back to where the drag started. The DM can place tokens anywhere.
- **Initiative:** the tracker in the bottom-left corner of the map holds the turn order, with whoever is acting now at the top. Add tokens with **+ Add all** (every token on the viewed map) or **Add to initiative** on a selected token. **Next ▶** sends the current token to the back of the queue. Drag an entry up or down to move its turn earlier or later (action advance or delay), and × removes it. Deleted tokens drop out automatically. Players see the same order live, without hidden tokens, but can't change it. ▾ collapses the tracker for you only.

**Everyone**
- **Camera:** mouse wheel zooms. Right-drag, middle-drag, Space+drag, or left-drag on empty space (Select tool) pans. "Fit map" re-centres. "Hide sidebar" (top right of the map) gives the map the full width, and "Show sidebar" brings it back.
- **Select / Move:** drag tokens. Positions sync live while you drag and snap to the grid on release if *Snap to grid* is on (it starts off). While dragging, a ruler shows how far the token has moved.
- **Measure:** drag to measure. Distances show to the nearest foot (Euclidean to 0.1 ft); with *Snap to grid* on, the ends snap to cell centres, so you get whole cells. Choose how diagonals count (5e = 5 ft each, 5/10/5, or Euclidean). The line disappears as soon as you let go. *Measurements are local and other players don't see them.*
- **Area of Effect:** pick full, half or quarter circle and a colour, then drag from the origin outward. The drag sets radius and direction. With snap on, the radius snaps to 5 ft steps. Pick **Rectangle** to drag a rectangle from corner to corner instead; its size is shown in feet.
- AoEs stay on the map and sync to everyone. You can edit your own (the DM can edit any): with the Select tool, drag a shape to move it, or select it and drag a white handle to resize it. An AoE's handle sets its radius and direction; a rectangle has one on each corner. Esc cancels a drag in progress.
- **Rotating:** a selected rectangle also has a blue handle above it: drag it to turn the rectangle around its centre. With *Snap to grid* on it turns in 15° steps. With snap on, the corners of a rectangle at an angle other than a right angle resize it in 5 ft steps, as it can no longer line up with the grid. The sidebar list shows the angle. Half and quarter circles turn with their own handle, which sets their direction.
- **Naming shapes:** click ✏️ next to a shape in the sidebar list to give it a name, like "Fireball". The name shows on the map next to its size. Enter or clicking away saves, Esc cancels, and saving it blank removes the name. Names are optional, and you can rename your own shapes (the DM can rename any).
- Remove a shape by selecting it (Select tool) and clicking its red ×, by pressing Delete, or from the sidebar list ("Clear mine"; the DM also gets "Clear all").

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
    Grid/Fog/Token/Drawing/DrawingHandles/Ruler.svelte   SVG layers
    Toolbar, Sidebar, MapManager, MapSettings, TokenPanel, DrawingList, Login
```

Rendering is one SVG: map image → grid → drawings → tokens → fog → live previews. World coordinates are pixels of the map image. Useful CSS hooks for styling: `.vtt-token`, `.token-hidden`, `.token-deceased`, `.vtt-token-body`, `.vtt-token-skull`, `.vtt-grid-line`, `.vtt-fog`, `.vtt-drawing`, `.vtt-drawing-handle`, `.vtt-ruler`. CSS beats SVG presentation attributes, so for example `.vtt-grid-line { stroke: red }` works.

## Known limitations (by design, to keep it simple)
- Hidden tokens and fog are hidden **on the client** (the token isn't rendered for players). A player who inspects network traffic could still see hidden token data. Making this secure requires server-side filtering plus extra handling of realtime events.
- Measurement lines aren't broadcast to other players.
- The fog teleport also runs **on the client**. It stops normal play, but a player calling the API directly could still move a token into fog.
- There's no pinch-zoom on touch devices. Single-finger drag works.
