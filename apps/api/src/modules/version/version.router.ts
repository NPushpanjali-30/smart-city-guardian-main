import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';

export const versionRouter = Router();

let currentAppVersion = {
  version: '2.1.0',
  versionCode: 210,
  releaseDate: new Date().toISOString(),
  minSupportedVersion: '2.0.0',
  releaseNotes: 'Decluttered standalone mobile interface, zero-delay emergency broadcast dispatch, background push alerts when app is closed, and automatic OTA app updates.',
  mandatory: true,
  updateUrl: '/',
};

/**
 * GET /api/v1/app/version
 * Checks the latest published app version
 */
versionRouter.get(['/version', '/app/version'], (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    ...currentAppVersion,
  });
});

/**
 * POST /api/v1/admin/version/release
 * Publishes a new app version and automatically broadcasts the update event to all devices
 */
versionRouter.post('/admin/version/release', async (req: Request, res: Response) => {
  try {
    const { version, releaseNotes, mandatory = true } = req.body;
    if (!version) {
      res.status(400).json({ error: 'Version string (e.g. 2.0.2) is required' });
      return;
    }

    const nextCode = currentAppVersion.versionCode + 1;
    currentAppVersion = {
      version,
      versionCode: nextCode,
      releaseDate: new Date().toISOString(),
      minSupportedVersion: currentAppVersion.version,
      releaseNotes: releaseNotes || `Smart City Guardian v${version} release with enhanced safety features.`,
      mandatory: Boolean(mandatory),
      updateUrl: '/',
    };

    logger.info(`[VersionService] New app version released: v${version} (Code: ${nextCode})`);

    // Dynamically broadcast over WebSocket to all active users
    try {
      const { getActiveWsServer } = await import('../../websocket/wsServer.js');
      const ws = getActiveWsServer();
      if (ws) {
        ws.broadcastAll({
          topic: 'realtime:system',
          eventType: 'APP_UPDATE_AVAILABLE',
          timestamp: new Date().toISOString(),
          payload: {
            ...currentAppVersion,
            autoUpdate: true,
          },
        });
      }
    } catch {}

    res.status(200).json({
      status: 'ok',
      success: true,
      message: `Version v${version} published. Auto-update signal broadcasted across city devices.`,
      data: currentAppVersion,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to release version' });
  }
});
