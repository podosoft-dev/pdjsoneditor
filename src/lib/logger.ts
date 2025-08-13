import { Logger } from 'tslog';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';

type Level = 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const levelMap: Record<Level, number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6
};

function resolveMinLevel(): number {
  const raw = env.PUBLIC_LOG_LEVEL?.toLowerCase() as Level | undefined;
  if (raw && raw in levelMap) return levelMap[raw];
  // Default: debug in dev, warn in prod
  return dev ? levelMap.debug : levelMap.warn;
}

export const logger = new Logger({
  name: 'pdjsoneditor',
  minLevel: resolveMinLevel()
});

