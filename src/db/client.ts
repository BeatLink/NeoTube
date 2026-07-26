// pouchdb-browser uses IndexedDB — the correct adapter for all browser targets.
// Tests substitute the memory adapter by mocking this module.
import PouchDB from 'pouchdb-browser'

// Lazy singleton — deferred until first use so tests that mock this module
// never trigger the IndexedDB constructor in jsdom.
let _db: PouchDB.Database | null = null

export function db(): PouchDB.Database {
  if (!_db) _db = new PouchDB('neotube')
  return _db
}
