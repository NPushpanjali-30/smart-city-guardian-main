import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { RealtimeWebSocketServer } from './websocket/wsServer.js';
import { dataAggregator } from './services/dataAggregator.js';

const app = createApp();
const server = http.createServer(app);

// Initialize Real-Time WebSocket server on /ws
const wsServer = new RealtimeWebSocketServer(server);

// Start centralized background data ingestion workers
dataAggregator.startBackgroundWorkers();

server.listen(config.PORT, config.HOST, () => {
  logger.info(`SmartCity Guardian API Server listening on ${config.HOST}:${config.PORT}`, {
    operation: 'server_startup',
    details: {
      port: config.PORT,
      env: config.NODE_ENV,
      mockMode: config.MOCK_MODE,
      endpoints: [
        'GET /health',
        'GET /api/v1/health',
        'GET /api/v1/version',
        'GET /api/v1/weather/current',
        'GET /api/v1/traffic/live',
        'GET /api/v1/flood/events',
        'GET /api/v1/data/providers/status',
        'WS  /ws',
      ],
    },
  });
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Draining connections and initiating graceful shutdown...`, {
    operation: 'server_shutdown',
  });

  dataAggregator.stopBackgroundWorkers();
  wsServer.close();

  server.close(() => {
    logger.info('HTTP server closed successfully. Process exiting.', { operation: 'server_shutdown' });
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
