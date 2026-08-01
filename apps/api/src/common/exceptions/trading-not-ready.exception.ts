import { HttpException, HttpStatus } from '@nestjs/common';
import type { OnboardingStep } from '../../modules/users/onboarding.service';

/**
 * TradingNotReadyException — Sprint 29 amendment.
 *
 * Thrown by TradingService.startTradingSession when the user has not completed
 * all required onboarding steps. Returns HTTP 403 with a safe structured body:
 *
 * {
 *   "statusCode": 403,
 *   "code": "TRADING_NOT_READY",
 *   "message": "Your trading setup is not ready.",
 *   "missingSteps": ["PROFILE", "RISK_PROFILE", "BROKER_CONNECTION"]
 * }
 *
 * The frontend uses missingSteps to direct the user to the correct onboarding
 * page. No broker credentials or internal errors are exposed.
 */
export class TradingNotReadyException extends HttpException {
  constructor(missingSteps: OnboardingStep[]) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        code: 'TRADING_NOT_READY',
        message: 'Your trading setup is not ready.',
        missingSteps,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
