import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiSchedulerSessionStartPayload,
  AiSchedulerSessionStopPayload,
} from './interfaces/ai-scheduler.interface';

const INTERNAL_API_KEY_HEADER = 'x-irexpro-internal-api-key';
const REQUEST_TIMEOUT_MS = 5000;

/**
 * AiEngineClient — HTTP client for NestJS → Python AI engine coordination.
 *
 * Used to notify the AI engine when trading sessions start/stop so scheduled
 * paper-mode signal generation can be registered/unregistered.
 *
 * Failures are logged but never block trading session lifecycle.
 */
@Injectable()
export class AiEngineClient {
  private readonly logger = new Logger(AiEngineClient.name);

  constructor(private readonly configService: ConfigService) {}

  isSchedulerIntegrationEnabled(): boolean {
    return this.configService.get<boolean>('aiEngine.schedulerEnabled', false);
  }

  private getBaseUrl(): string {
    return this.configService.get<string>(
      'aiEngine.baseUrl',
      'http://localhost:8001/api/v1',
    );
  }

  private getInternalApiKey(): string | undefined {
    return this.configService.get<string>('internalApi.key');
  }

  async notifySessionStarted(payload: AiSchedulerSessionStartPayload): Promise<void> {
    if (!this.isSchedulerIntegrationEnabled()) return;

    const url = `${this.getBaseUrl()}/scheduler/sessions/start`;
    await this.post(url, { ...payload }, payload.tradingSessionId);
  }

  async notifySessionStopped(payload: AiSchedulerSessionStopPayload): Promise<void> {
    if (!this.isSchedulerIntegrationEnabled()) return;

    const url = `${this.getBaseUrl()}/scheduler/sessions/stop`;
    await this.post(url, { ...payload }, payload.tradingSessionId);
  }

  private async post(
    url: string,
    body: Record<string, unknown>,
    sessionId: string,
  ): Promise<void> {
    const apiKey = this.getInternalApiKey();
    if (!apiKey) {
      this.logger.warn(
        `AI engine notification skipped — internal API key not configured session=${sessionId}`,
      );
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [INTERNAL_API_KEY_HEADER]: apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `AI engine notification failed session=${sessionId} status=${response.status}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `AI engine notification error session=${sessionId}: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
