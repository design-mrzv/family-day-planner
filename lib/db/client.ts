import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL не налаштований");

const sql = neon(url);
export const db = drizzle(sql, { schema });
