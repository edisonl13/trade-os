export const PERSISTENT_DATABASE_REQUIRED_CODE =
  "PERSISTENT_DATABASE_REQUIRED";

export function hasPersistentDatabase(): boolean {
  const databaseUrl = (
    process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL
  )?.trim();
  const isHostedDeployment = Boolean(
    process.env.VERCEL || process.env.VERCEL_ENV
  );

  if (!isHostedDeployment) {
    return true;
  }

  return Boolean(databaseUrl && !databaseUrl.startsWith("file:"));
}

export function getPersistentDatabaseError() {
  return {
    error:
      "This deployment is not connected to persistent storage. No trades were saved.",
    code: PERSISTENT_DATABASE_REQUIRED_CODE,
  };
}
