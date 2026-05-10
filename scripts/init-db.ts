import { getDb } from "../src/lib/db";
import { DB_PATH } from "../src/lib/db-path";

async function main() {
  await getDb();
  console.log(`Initialized database (target: ${process.env.TURSO_URL ?? `file:${DB_PATH}`})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
