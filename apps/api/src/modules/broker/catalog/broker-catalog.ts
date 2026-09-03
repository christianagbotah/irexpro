/**
 * BrokerCatalog — Static catalog of broker integrations available on iRexPro.
 *
 * All brokers in this catalog connect via the MetaAPI cloud platform, which
 * provides a unified API for MT4/MT5 brokers worldwide. Users can browse this
 * catalog in the connect-broker wizard and select their broker.
 *
 * The catalog is a static constant — it does not change at runtime. New
 * brokers are added here and go through the standard review process.
 *
 * Each entry maps to the `metatrader5` adapter (or `metatrader4` when added).
 * The `brokerId` field in BrokerConnection stores the adapter ID, while
 * `brokerName` stores the display name from this catalog.
 */

export interface BrokerCatalogEntry {
  /** Adapter ID used internally (maps to IBrokerAdapter.brokerId) */
  adapterId: string;
  /** Display name shown to users */
  displayName: string;
  /** Short description for the connect wizard */
  description: string;
  /** Logo URL (static asset or CDN) */
  logoUrl: string | null;
  /** Website for reference */
  website: string;
  /** Which MetaTrader platform this broker uses */
  platform: 'MT4' | 'MT5';
  /** Whether DEMO accounts are supported for testing */
  supportsDemo: boolean;
  /** Whether LIVE trading is supported */
  supportsLive: boolean;
  /** Default account currencies this broker offers */
  defaultCurrencies: string[];
  /** Country/region where the broker is headquartered */
  region: string;
  /** Minimum deposit for live accounts (informational only) */
  minDepositUsd: number | null;
  /** Maximum leverage offered */
  maxLeverage: number;
  /** Whether the broker supports hedging */
  supportsHedging: boolean;
  /** Whether the broker supports scalping */
  supportsScalping: boolean;
  /** Sort order in the UI (lower = first) */
  sortOrder: number;
  /** Whether this broker is currently active on the platform */
  isActive: boolean;
}

export const BROKER_CATALOG: readonly BrokerCatalogEntry[] = Object.freeze([
  // ── Tier 1: Major global brokers (MT5 via MetaAPI) ──────────────────────────
  {
    adapterId: 'metatrader5',
    displayName: 'MetaTrader 5 (Generic)',
    description: 'Connect any MT5 broker account via MetaAPI. Enter your MetaAPI account ID.',
    logoUrl: null,
    website: 'https://metaapi.io',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP'],
    region: 'Global',
    minDepositUsd: null,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 1,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'IC Markets',
    description: 'Australian ECN broker with tight spreads. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://icmarkets.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP', 'AUD'],
    region: 'Australia',
    minDepositUsd: 200,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 2,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Pepperstone',
    description: 'Australian broker with Razor and Standard accounts. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://pepperstone.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP', 'AUD'],
    region: 'Australia',
    minDepositUsd: 200,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 3,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Exness',
    description: 'Broker with instant withdrawals and low spreads. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://exness.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'NGN', 'KES', 'GHS'],
    region: 'Cyprus',
    minDepositUsd: 10,
    maxLeverage: 2000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 4,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'FXTM (ForexTime)',
    description: 'Global broker with FXTM Invest copy trading. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://fxtm.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'NGN'],
    region: 'Cyprus',
    minDepositUsd: 10,
    maxLeverage: 2000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 5,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'XM',
    description: 'Global broker with no re-quotes and flexible leverage. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://xm.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP', 'JPY'],
    region: 'Cyprus',
    minDepositUsd: 5,
    maxLeverage: 1000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 6,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'FBS',
    description: 'Broker popular in Africa and Asia. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://fbs.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'NGN', 'KES'],
    region: 'Belize',
    minDepositUsd: 5,
    maxLeverage: 3000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 7,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'OctaFX',
    description: 'Broker with copy trading and low spreads. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://octafx.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'NGN', 'KES'],
    region: 'Saint Vincent',
    minDepositUsd: 25,
    maxLeverage: 1000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 8,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'HotForex (HFM)',
    description: 'Global broker with multiple account types. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://hfm.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'NGN', 'ZAR'],
    region: 'Cyprus',
    minDepositUsd: 0,
    maxLeverage: 2000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 9,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'RoboForex',
    description: 'Broker with copy trading and contest accounts. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://roboforex.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR'],
    region: 'Belize',
    minDepositUsd: 10,
    maxLeverage: 2000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 10,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Alpari',
    description: 'Established broker with multiple platforms. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://alpari.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'NGN'],
    region: 'Saint Vincent',
    minDepositUsd: 1,
    maxLeverage: 1000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 11,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'InstaForex',
    description: 'Broker with PAMM accounts and contests. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://instaforex.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR'],
    region: 'British Virgin Islands',
    minDepositUsd: 1,
    maxLeverage: 1000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 12,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Deriv',
    description: 'Broker with synthetic indices and forex. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://deriv.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP'],
    region: 'Malta',
    minDepositUsd: 5,
    maxLeverage: 1000,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 13,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'LiteFinance',
    description: 'Broker with zero-spread accounts. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://litefinance.org',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR'],
    region: 'Saint Vincent',
    minDepositUsd: 50,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 14,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Tickmill',
    description: 'ECN broker with institutional-grade spreads. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://tickmill.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP'],
    region: 'Seychelles',
    minDepositUsd: 100,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 15,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'FPMarkets',
    description: 'Australian ECN broker with DMA pricing. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://fpmarkets.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'AUD'],
    region: 'Australia',
    minDepositUsd: 100,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 16,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Vantage',
    description: 'Australian broker with RAW ECN accounts. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://vantagemarkets.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'AUD'],
    region: 'Australia',
    minDepositUsd: 50,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 17,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'BlackBull Markets',
    description: 'New Zealand broker with institutional execution. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://blackbull.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'NZD'],
    region: 'New Zealand',
    minDepositUsd: 0,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 18,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'Axi',
    description: 'Australian broker formerly known as AxiTrader. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://axi.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP', 'AUD'],
    region: 'Australia',
    minDepositUsd: 0,
    maxLeverage: 500,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 19,
    isActive: true,
  },
  {
    adapterId: 'metatrader5',
    displayName: 'AvaTrade',
    description: 'Irish broker with 1000+ instruments. MT5 via MetaAPI.',
    logoUrl: null,
    website: 'https://avatrade.com',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: true,
    defaultCurrencies: ['USD', 'EUR', 'GBP'],
    region: 'Ireland',
    minDepositUsd: 100,
    maxLeverage: 400,
    supportsHedging: true,
    supportsScalping: true,
    sortOrder: 20,
    isActive: true,
  },
  // ── Paper/Simulation ────────────────────────────────────────────────────────
  {
    adapterId: 'paper-broker',
    displayName: 'Paper Trading (Simulation)',
    description: 'Risk-free simulation broker for testing. No real orders are placed.',
    logoUrl: null,
    website: '#',
    platform: 'MT5',
    supportsDemo: true,
    supportsLive: false,
    defaultCurrencies: ['USD'],
    region: 'Internal',
    minDepositUsd: 0,
    maxLeverage: 30,
    supportsHedging: true,
    supportsScalping: false,
    sortOrder: 100,
    isActive: true,
  },
]);

/**
 * Get the active broker catalog (sorted by sortOrder).
 */
export function getBrokerCatalog(): BrokerCatalogEntry[] {
  return BROKER_CATALOG.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Find a catalog entry by display name.
 */
export function findBrokerByDisplayName(displayName: string): BrokerCatalogEntry | undefined {
  return BROKER_CATALOG.find((b) => b.displayName === displayName);
}
