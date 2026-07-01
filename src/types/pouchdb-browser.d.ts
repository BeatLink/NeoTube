// pouchdb-browser ships its own types via @types/pouchdb but doesn't re-export
// the module name. This shim lets TypeScript resolve the import.
declare module 'pouchdb-browser' {
  import PouchDB from 'pouchdb'
  export = PouchDB
}
