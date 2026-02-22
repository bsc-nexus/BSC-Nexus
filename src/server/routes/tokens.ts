import { Router, Response } from 'express';
import { requireApiKey, AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { usageLogger } from '../middleware/usageLogger.js';
import { getTokenInfo } from '../services/tokenService.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /v1/tokens/:address/info - Get token information
 */
router.get('/v1/tokens/:address/info', requireApiKey, rateLimit, usageLogger, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { address } = req.params;

    if (!address) {
      res.status(400).json({
        error: {
          code: 400,
          message: 'Token address is required',
        },
      });
      return;
    }

    logger.info('Token info requested', {
      address,
      apiKeyId: req.context?.apiKey?.id,
    });

    const tokenInfo = await getTokenInfo(address);

    res.json(tokenInfo);
  } catch (error: any) {
    logger.error('Failed to fetch token info', {
      address: req.params.address,
      error: error.message,
    });

    res.status(500).json({
      error: {
        code: 500,
        message: error.message || 'Failed to fetch token information',
      },
    });
  }
});

export default router;
