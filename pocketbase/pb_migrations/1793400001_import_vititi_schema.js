/// <reference path="../pb_data/types.d.ts" />

// Imports the Vititi collections from pb_schema.json on the first start of a
// fresh database. PocketBase records applied migrations in its _migrations
// table, so this runs exactly once and never touches existing data afterwards.
//
// deleteMissing = false -> only adds/updates the collections listed in the JSON
// and leaves everything else (e.g. the built-in "users" collection) alone.
migrate((app) => {
  const path = $os.getenv("PB_SCHEMA_FILE") || "/pb/pb_schema.json"
  const collections = JSON.parse(toString($os.readFile(path)))
  app.importCollections(collections, false)
}, (app) => {
  // Down migration: remove the collections again (children first).
  for (const name of ["drawings", "tokens", "game", "maps", "vititi_users"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (_) {
      // already gone
    }
  }
})
