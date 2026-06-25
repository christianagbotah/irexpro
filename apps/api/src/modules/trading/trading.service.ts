import {
  ForbiddenException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { BrokerService } from '../broker/broker.service';

/**
 * TradingService — Trading session management and AI auto-trading gate.
 *
 * CRITICAL RULES:
 * 1. AI Auto Trading requires an active, valid subscription (SubscriptionsService.canUserStartAiAutoTrading)
 * 2. AI Auto Trading requires an active, connected broker account (BrokerService.hasActiveConnection)
 * 3. No live trading in Sprint 2 — session management implemented in Sprint 3
 * 4. Signal routing is managed by the AI/Strategy pipeline, NOT this service
 *
 * The broker gate is enforced here before ANY trading session can start.
 * This cannot be bypassed — it is a hard pre-condition check.
 *
 * See: docs/architecture/04-system-architecture.md §6
 * See: docs/architecture/09-broker-integration-architecture.md
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(private readonly brokerService: BrokerService) {}

  /**
   * Gate check: verify user has all prerequisites before trading can start.
   *
   * Prerequisites:
   * 1. User has an active subscription with allowsAiAutoTrading = true
   *    (checked externally by SubscriptionsService.canUserStartAiAutoTrading — call before this)
   * 2. User has a CONNECTED broker account
   *
   * Throws ForbiddenException if broker gate fails.
   * Throws NotImplementedException for live trading (Sprint 3).
   */
  async assertBrokerGate(userId: string): Promise<void> {
    const hasActiveBroker = await this.brokerService.hasActiveConnection(userId);
    if (!hasActiveBroker) {
      throw new ForbiddenException(
        'No active broker connection. Connect and verify a broker account before starting AI auto-trading.',
      );
    }
  }

  /**
   * Start a trading session.
   * Requires subscription gate + broker gate both passing.
   */
  async startTradingSession(_userId: string): Promise<never> {
    throw new NotImplementedException('TradingService: trading session management — Sprint 3');
  }

  /**
   * Stop a trading session.
   */
  async stopTradingSession(_userId: string): Promise<never> {
    throw new NotImplementedException('TradingService: trading session management — Sprint 3');
  }
}
