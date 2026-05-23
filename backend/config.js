import dotenv from 'dotenv';

dotenv.config();

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} must be configured in the backend environment.`);
  }
  return value;
}

export function getJwtSecret() {
  return requireEnv('JWT_SECRET');
}
