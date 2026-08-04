const REQUIRED = ["MELI_CLIENT_ID", "MELI_CLIENT_SECRET", "MELI_REDIRECT_URI", "SESSION_SECRET"] as const;

export type ServerEnvName = (typeof REQUIRED)[number];

export function getRequiredEnv(name: ServerEnvName): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

export function getEnvironmentStatus() {
  return Object.fromEntries(REQUIRED.map((name) => [name, Boolean(process.env[name])])) as Record<ServerEnvName, boolean>;
}
