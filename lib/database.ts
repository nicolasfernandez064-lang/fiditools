import { neon } from "@neondatabase/serverless";

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL no está configurada.");
  }
  return value;
}

export function getSql() {
  return neon(getDatabaseUrl());
}
