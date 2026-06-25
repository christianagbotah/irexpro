import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IBrokerAdapter } from '../interfaces/broker-adapter.interface';

export interface BrokerSummary {
  brokerId: string;
  brokerName: string;
  supportsDemo: boolean;
}

/**
 * BrokerAdapterRegistry — Factory registry for all IBrokerAdapter implementations.
 *
 * Each broker adapter registers itself at module init.
 * BrokerService calls getAdapter(brokerId) to retrieve the correct implementation.
 * No broker-specific logic ever leaks into BrokerService or above.
 *
 * See: docs/architecture/09-broker-integration-architecture.md §5
 */
@Injectable()
export class BrokerAdapterRegistry {
  private readonly logger = new Logger(BrokerAdapterRegistry.name);
  private readonly adapters = new Map<string, IBrokerAdapter>();

  register(adapter: IBrokerAdapter): void {
    this.adapters.set(adapter.brokerId, adapter);
    this.logger.log(`Registered broker adapter: ${adapter.brokerId} (${adapter.brokerName})`);
  }

  getAdapter(brokerId: string): IBrokerAdapter {
    const adapter = this.adapters.get(brokerId);
    if (!adapter) {
      throw new NotFoundException(
        `No broker adapter registered for brokerId: "${brokerId}". ` +
          `Supported brokers: [${this.getSupportedBrokerIds().join(', ')}]`,
      );
    }
    return adapter;
  }

  getSupportedBrokers(): BrokerSummary[] {
    return Array.from(this.adapters.values()).map((a) => ({
      brokerId: a.brokerId,
      brokerName: a.brokerName,
      supportsDemo: a.supportsDemo,
    }));
  }

  getSupportedBrokerIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  isSupported(brokerId: string): boolean {
    return this.adapters.has(brokerId);
  }
}
