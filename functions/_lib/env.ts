export interface Env {
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  GITHUB_WRITE_TOKEN?: string;
  SESSION_SECRET?: string;
  ALLOWED_LOGINS?: string;
}

export function requireEnv(env: Env, name: keyof Env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
