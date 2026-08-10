import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

/**
 * AiService — SKELETON (Sprint 3 / Python AI services implementation)
 *
 * CRITICAL ARCHITECTURE RULES:
 * 1. The AI Signal Engine NEVER places trades directly.
 * 2. Every AI signal MUST pass through the Risk Engine before execution.
 * 3. The mandatory flow is:
 *    AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine → Broker
 *
 * The AI services are Python FastAPI services (services/signal-engine, etc.)
 * This NestJS module acts as the Signal intake from Python services.
 *
 * See: docs/architecture/10-ai-trading-architecture.md
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  getLatestSignal(_instrument: string): Promise<never> {
    throw new NotImplementedException(
      'AiService: AI signal service integration not yet implemented',
    );
  }
}
