import pino from 'pino';
import { env } from '../config/env';

const redactPaths = [
  'secretKey',
  'privateKey',
  'mnemonic',
  '*.secretKey',
  '*.privateKey',
  'req.headers.authorization',
];

export const logger = pino({
  level: env.logLevel,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: undefined,
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

export const child = (scope: string) => logger.child({ scope });
