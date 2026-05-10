import { getDb } from "../src/lib/db";
import { DB_PATH } from "../src/lib/db-path";

// Touching getDb() runs the schema migration.
getDb();
console.log(`Initialized database at ${DB_PATH}`);
