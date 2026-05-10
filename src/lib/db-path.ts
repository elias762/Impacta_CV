import { join } from "node:path";

export const DB_PATH = process.env.IMPACTA_DB_PATH ?? join(process.cwd(), "data", "impacta.db");
export const UPLOADS_DIR = process.env.IMPACTA_UPLOADS_DIR ?? join(process.cwd(), "uploads");
