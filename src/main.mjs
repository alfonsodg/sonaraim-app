/**
 * @fileoverview Container and CLI entrypoint for the Sonaraim Client App PWA & Instant Clip server.
 */

import http from 'node:http';
import { createAppRequestHandler } from './server.mjs';

const nodeApiBaseUrl = String(process.env.NODE_API_BASE_URL ?? '').trim();
const rawPort = process.env.SONARAIM_APP_PORT ?? process.env.APP_WEB_PORT;
const appHttpPort = Number(rawPort);
const host = String(process.env.SONARAIM_APP_HOST ?? '0.0.0.0').trim() || '0.0.0.0';

if (!nodeApiBaseUrl) {
  console.error(JSON.stringify({ level: 'ERROR', service: 'sonaraim-app', error: 'Missing NODE_API_BASE_URL' }));
  process.exit(1);
}
if (!Number.isInteger(appHttpPort) || appHttpPort < 1 || appHttpPort > 65535) {
  console.error(JSON.stringify({ level: 'ERROR', service: 'sonaraim-app', error: 'Invalid SONARAIM_APP_PORT' }));
  process.exit(1);
}

const server = http.createServer(createAppRequestHandler({ nodeApiBaseUrl, appHttpPort }));
server.listen(appHttpPort, host, () => {
  console.log(
    JSON.stringify({
      level: 'INFO',
      service: 'sonaraim-app',
      status: 'listening',
      host,
      port: appHttpPort,
    })
  );
});
