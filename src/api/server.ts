import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env';
import { child } from '../lib/logger';
import { registerRoutes } from './routes';

const log = child('api');

/**
 * A small read-mostly JSON API next to the bot. The dashboard in web/ talks to
 * it; nothing here can move funds, which is deliberate - the signing path
 * lives behind Telegram auth and stays there.
 */
export const createApp = (): express.Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(
    cors({
      origin: env.api.corsOrigins.length > 0 ? env.api.corsOrigins : false,
    }),
  );

  app.use((req, _res, next) => {
    log.debug({ method: req.method, path: req.path }, 'request');
    next();
  });

  registerRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err: error }, 'api error');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
};

export const startApiServer = (): http.Server => {
  const server = createApp().listen(env.api.port, () => {
    log.info({ port: env.api.port }, 'dashboard api listening');
  });
  return server;
};

if (require.main === module) {
  startApiServer();
}
