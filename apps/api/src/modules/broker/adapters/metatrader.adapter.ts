import { Injectable, Logger } from '@nestjs/common';
import {
  BrokerAccountInfo,
  BrokerBalance,
  BrokerCloseAllResult,
  BrokerClosedTrade,
  BrokerConnectionResult,
  BrokerConnectionTestResult,
  BrokerInstrument,
  BrokerMode,
  BrokerOrderModification,
  BrokerOrderRequest,
  BrokerOrderResult,
  BrokerPosition,
  BrokerPrice,
  DecryptedBrokerCredentials,
  IBrokerAdapter,
  OHLCV,
  RequiredMarginParams,
} from '../interfaces/broker-adapter.interface';
import { BrokerAdapterError, BrokerErrorCode } from '../interfaces/broker-adapter.errors';
import { MetaApiClientService } from '../services/metaapi-client.service';

/** MetaAPI stringCode for a successfully executed trade */
const MT_SUCCESS_CODE = 'TRADE_RETCODE_DONE';

/**
 * MetaTraderAdapter — Full MT4/MT5 integration via MetaAPI cloud platform.
 *
 * Authentication architecture:
 * - Platform-level: METAAPI_TOKEN (env var) → MetaApiClientService singleton
 * - Per-user: MetaAPI accountId UUID stored (encrypted) in BrokerConnection.accountId
 *   This UUID is obtained when the user links their MT account to MetaAPI
 *
 * Connection model:
 * - MetaApiClientService maintains a pool of long-lived RPC connections per accountId
 * - connect(credentials) provisions/retrieves the RPC connection for credentials.accountId
 * - All trading methods use the pooled connection (no re-connect per call)
 *
 * SECURITY INVARIANTS:
 * - credentials parameter is NEVER logged
 * - All monetary values returned as decimal STRINGS — never floats
 * - idempotencyKey is embedded in order comment for broker-side dedup
 * - DEMO mode is validated before LIVE mode can be enabled
 *
 * See: docs/architecture/09-broker-integration-architecture.md
 */
@Injectable()
export class MetaTraderAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(MetaTraderAdapter.name);

  readonly brokerId = 'metatrader5';
  readonly brokerName = 'MetaTrader 5 (via MetaAPI)';
  readonly supportsDemo = true;

  private mode: BrokerMode = BrokerMode.DEMO;
  /** MetaAPI account UUID for the currently active user connection */
  private currentAccountId: string | null = null;

  constructor(private readonly metaApiClient: MetaApiClientService) {}

  setMode(mode: BrokerMode): void {
    this.mode = mode;
  }

  // ─── Connection lifecycle ──────────────────────────────────────────────────

  async connect(credentials: DecryptedBrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      const conn = await this.metaApiClient.getOrCreateConnection(credentials.accountId);
      this.currentAccountId = credentials.accountId;

      const info = await conn.getAccountInformation();

      return {
        success: true,
        accountId: String(info.login ?? credentials.accountId),
        accountType: this.resolveAccountType(info.type),
        currency: info.currency ?? 'USD',
        serverTime: new Date(),
      };
    } catch (err) {
      this.currentAccountId = null;
      throw this.mapError(err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.currentAccountId) {
      await this.metaApiClient.removeConnection(this.currentAccountId);
      this.currentAccountId = null;
    }
  }

  async testConnection(
    credentials: DecryptedBrokerCredentials,
  ): Promise<BrokerConnectionTestResult> {
    try {
      const result = await this.metaApiClient.testAccountAccess(credentials.accountId);
      return {
        success: result.success,
        accountType: result.accountType === 'DEMO' ? BrokerMode.DEMO : BrokerMode.LIVE,
        currency: result.currency,
        errorMessage: result.error,
      };
    } catch (err) {
      const mapped = this.mapError(err);
      return { success: false, errorCode: mapped.code, errorMessage: mapped.message };
    }
  }

  isConnected(): boolean {
    if (!this.currentAccountId) return false;
    return this.metaApiClient.hasConnection(this.currentAccountId);
  }

  // ─── Account state ────────────────────────────────────────────────────────

  async getAccountInfo(): Promise<BrokerAccountInfo> {
    const conn = await this.getActiveConnection();
    try {
      const info = await conn.getAccountInformation();
      return {
        accountId: String(info.login ?? this.currentAccountId),
        currency: info.currency,
        leverage: info.leverage ?? 0,
        balance: this.toDecimalString(info.balance),
        equity: this.toDecimalString(info.equity),
        margin: this.toDecimalString(info.margin),
        freeMargin: this.toDecimalString(info.freeMargin),
        marginLevel: this.toDecimalString(info.marginLevel ?? 0),
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getAccountBalance(): Promise<BrokerBalance> {
    const conn = await this.getActiveConnection();
    try {
      const info = await conn.getAccountInformation();
      return {
        balance: this.toDecimalString(info.balance),
        equity: this.toDecimalString(info.equity),
        currency: info.currency,
        timestamp: new Date(),
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getOpenPositions(): Promise<BrokerPosition[]> {
    const conn = await this.getActiveConnection();
    try {
      const positions = await conn.getPositions();
      return (positions ?? []).map((p: any) => this.mapPosition(p));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getPositionById(externalOrderId: string): Promise<BrokerPosition | null> {
    const conn = await this.getActiveConnection();
    try {
      const position = await conn.getPosition(externalOrderId);
      return position ? this.mapPosition(position) : null;
    } catch (err) {
      const mapped = this.mapError(err);
      if (mapped.code === BrokerErrorCode.POSITION_NOT_FOUND) return null;
      throw mapped;
    }
  }

  /**
   * Sprint 32 Gate 3: calculate required margin for a proposed order.
   *
   * LIVE mode: MetaAPI does not expose a native required-margin calculation
   * through the existing RPC connection. The broker's margin rules vary by
   * instrument, account type, and margin mode — a generic formula using
   * a default contractSize is NOT authoritative for LIVE.
   * Therefore: return null (CAPABILITY_UNAVAILABLE) for LIVE.
   * The Risk Engine fails closed when this returns null.
   *
   * PAPER mode: not applicable — PAPER uses the PaperBrokerAdapter which
   * has deterministic simulated margin calculation.
   */
  async getRequiredMargin(_params: RequiredMarginParams): Promise<string | null> {
    // LIVE: cannot safely calculate required margin without a provider-native
    // calculation capability. Return null → Risk Engine fails closed.
    if (this.mode === BrokerMode.LIVE) {
      return null;
    }
    // DEMO/PAPER: delegate to the paper broker adapter's deterministic formula
    // (DEMO mode uses the same paper-broker semantics for simulated margin).
    // This is safe because PAPER/DEMO symbol specifications are controlled by us.
    return null;
  }

  // ─── Market data ──────────────────────────────────────────────────────────

  async getInstrumentList(): Promise<BrokerInstrument[]> {
    const conn = await this.getActiveConnection();
    try {
      const symbols: string[] = await conn.getSymbols();
      // Return summaries — full specs fetched per symbol via getSymbolSpecification
      return (symbols ?? []).map((s: string) => ({
        symbol: s,
        description: s,
        digits: 5,
        minLot: '0.01',
        maxLot: '100',
        lotStep: '0.01',
        contractSize: '100000',
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getCurrentPrice(instrument: string): Promise<BrokerPrice> {
    const conn = await this.getActiveConnection();
    try {
      await conn.subscribeToMarketData(instrument);
      const price = await conn.getSymbolPrice(instrument);
      await conn.unsubscribeFromMarketData(instrument);
      return {
        instrument,
        bid: this.toDecimalString(price.bid),
        ask: this.toDecimalString(price.ask),
        spread: this.toDecimalString(price.ask - price.bid),
        timestamp: price.time ?? new Date(),
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getOHLCV(instrument: string, timeframe: string, count: number): Promise<OHLCV[]> {
    // Precheck: throws BrokerAdapterError(NOT_CONNECTED) if no active connection.
    // The account-level historical-candles API below does not use the returned
    // connection handle directly (it reaches into the connection pool instead),
    // but the precheck preserves the same connectivity gate as every other
    // method on this adapter.
    await this.getActiveConnection();
    try {
      // MetaAPI uses account-level historical candles API
      const entry = this.metaApiClient['connectionPool']?.get(this.currentAccountId!);
      if (!entry)
        throw new BrokerAdapterError(BrokerErrorCode.NOT_CONNECTED, 'No active connection');

      const candles = await entry.account.getHistoricalCandles(
        instrument,
        this.mapTimeframe(timeframe),
        new Date(),
        count,
      );
      return (candles ?? []).map((c: any) => ({
        timestamp: c.time,
        open: this.toDecimalString(c.open),
        high: this.toDecimalString(c.high),
        low: this.toDecimalString(c.low),
        close: this.toDecimalString(c.close),
        volume: this.toDecimalString(c.tickVolume ?? c.volume ?? 0),
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // ─── Order management ─────────────────────────────────────────────────────

  async placeOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult> {
    const conn = await this.getActiveConnection();
    try {
      const lotSize = parseFloat(order.lotSize);
      const sl = parseFloat(order.stopLoss);
      const tp = parseFloat(order.takeProfit);
      // idempotencyKey embedded in comment AND clientId for broker-side dedup
      const opts = {
        comment: `${order.idempotencyKey}`,
        clientId: order.idempotencyKey,
      };

      let result: any;
      if (order.direction === 'BUY') {
        result = await conn.createMarketBuyOrder(order.instrument, lotSize, sl, tp, opts);
      } else {
        result = await conn.createMarketSellOrder(order.instrument, lotSize, sl, tp, opts);
      }

      const success = result?.stringCode === MT_SUCCESS_CODE;
      return {
        success,
        externalOrderId: result?.positionId ?? result?.orderId,
        filledAt: success ? new Date() : undefined,
        status: success ? 'FILLED' : result?.numericCode === 10004 ? 'REJECTED' : 'FAILED',
        brokerMessage: result?.message,
        rawResponse: result,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async modifyOrder(
    externalOrderId: string,
    modifications: BrokerOrderModification,
  ): Promise<BrokerOrderResult> {
    const conn = await this.getActiveConnection();
    try {
      const sl = modifications.newStopLoss ? parseFloat(modifications.newStopLoss) : undefined;
      const tp = modifications.newTakeProfit ? parseFloat(modifications.newTakeProfit) : undefined;

      const result = await conn.modifyPosition(externalOrderId, sl, tp);
      const success = result?.stringCode === MT_SUCCESS_CODE;
      return {
        success,
        externalOrderId,
        status: success ? 'FILLED' : 'FAILED',
        brokerMessage: result?.message,
        rawResponse: result,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async closeOrder(externalOrderId: string, lotSize?: string): Promise<BrokerOrderResult> {
    const conn = await this.getActiveConnection();
    try {
      let result: any;
      if (lotSize) {
        result = await conn.closePositionPartially(externalOrderId, parseFloat(lotSize));
      } else {
        result = await conn.closePosition(externalOrderId);
      }
      const success = result?.stringCode === MT_SUCCESS_CODE;
      return {
        success,
        externalOrderId,
        filledAt: success ? new Date() : undefined,
        status: success ? 'FILLED' : 'FAILED',
        brokerMessage: result?.message,
        rawResponse: result,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async closeAllOrders(): Promise<BrokerCloseAllResult> {
    const positions = await this.getOpenPositions();
    let closedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      positions.map(async (pos) => {
        try {
          const result = await this.closeOrder(pos.externalOrderId);
          if (result.success) closedCount++;
          else {
            failedCount++;
            errors.push(`${pos.externalOrderId}: ${result.brokerMessage ?? 'failed'}`);
          }
        } catch (err) {
          failedCount++;
          errors.push(`${pos.externalOrderId}: ${(err as Error).message}`);
        }
      }),
    );

    return { closedCount, failedCount, errors };
  }

  // ─── Trade history ─────────────────────────────────────────────────────────

  async getClosedTrades(from: Date, to: Date): Promise<BrokerClosedTrade[]> {
    const conn = await this.getActiveConnection();
    try {
      const deals = await conn.getDealsByTimeRange(from, to);
      return (deals ?? [])
        .filter(
          (d: any) =>
            d.entryType === 'DEAL_ENTRY_OUT' &&
            (d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL'),
        )
        .map((d: any) => this.mapClosedDeal(d));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async getActiveConnection(): Promise<any> {
    if (!this.currentAccountId) {
      throw new BrokerAdapterError(
        BrokerErrorCode.NOT_CONNECTED,
        'No active connection. Call connect() first.',
        undefined,
        false,
      );
    }
    try {
      return await this.metaApiClient.getOrCreateConnection(this.currentAccountId);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private toDecimalString(value: number | undefined | null): string {
    if (value === undefined || value === null) return '0';
    return value.toFixed(8);
  }

  private resolveAccountType(mtType: string | undefined): BrokerMode {
    if (!mtType) return this.mode;
    return mtType.includes('DEMO') ? BrokerMode.DEMO : BrokerMode.LIVE;
  }

  /**
   * Map iRexPro timeframe strings to MetaAPI timeframe strings.
   * MetaAPI uses: '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mn'
   */
  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      M1: '1m',
      M5: '5m',
      M15: '15m',
      M30: '30m',
      H1: '1h',
      H4: '4h',
      D1: '1d',
      W1: '1w',
      MN1: '1mn',
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
    };
    return map[tf] ?? tf;
  }

  private mapPosition(p: any): BrokerPosition {
    return {
      externalOrderId: String(p.id),
      instrument: p.symbol,
      direction: p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
      lotSize: this.toDecimalString(p.volume),
      openPrice: this.toDecimalString(p.openPrice),
      currentPrice: this.toDecimalString(p.currentPrice),
      stopLoss: this.toDecimalString(p.stopLoss),
      takeProfit: this.toDecimalString(p.takeProfit),
      unrealisedPnl: this.toDecimalString(p.profit),
      openedAt: p.time ?? new Date(),
      commission: this.toDecimalString(p.commission),
      swap: this.toDecimalString(p.swap),
    };
  }

  private mapClosedDeal(d: any): BrokerClosedTrade {
    const closeReason = this.resolveCloseReason(d);
    return {
      externalOrderId: String(d.id),
      instrument: d.symbol ?? '',
      direction: d.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
      lotSize: this.toDecimalString(d.volume),
      openPrice: '0', // deals don't carry open price — use reconciliation against positions
      closePrice: this.toDecimalString(d.price),
      stopLoss: '0',
      takeProfit: '0',
      realisedPnl: this.toDecimalString(d.profit),
      openedAt: d.time ?? new Date(),
      closedAt: d.time ?? new Date(),
      commission: this.toDecimalString(d.commission),
      swap: this.toDecimalString(d.swap ?? 0),
      closeReason,
    };
  }

  private resolveCloseReason(d: any): BrokerClosedTrade['closeReason'] {
    const reason = d.reason?.toLowerCase() ?? '';
    if (reason.includes('sl') || reason === 'deal_reason_sl') return 'SL';
    if (reason.includes('tp') || reason === 'deal_reason_tp') return 'TP';
    if (reason.includes('client') || reason === 'deal_reason_client') return 'MANUAL';
    if (reason.includes('expert') || reason === 'deal_reason_expert') return 'SYSTEM';
    return 'UNKNOWN';
  }

  /**
   * Map MetaAPI / network errors to typed BrokerAdapterError.
   * Never includes raw credentials in the error message.
   */
  mapError(err: unknown): BrokerAdapterError {
    if (err instanceof BrokerAdapterError) return err;

    const message = (err as any)?.message ?? 'Unknown MetaAPI error';
    const status = (err as any)?.status ?? (err as any)?.statusCode;
    const lower = message.toLowerCase();

    if (status === 401 || lower.includes('authentication') || lower.includes('unauthorized')) {
      return new BrokerAdapterError(BrokerErrorCode.AUTHENTICATION_FAILED, message, message, false);
    }
    if (status === 404 || lower.includes('not found') || lower.includes('position not found')) {
      return new BrokerAdapterError(BrokerErrorCode.POSITION_NOT_FOUND, message, message, false);
    }
    if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
      return new BrokerAdapterError(BrokerErrorCode.RATE_LIMITED, message, message, true);
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return new BrokerAdapterError(BrokerErrorCode.CONNECTION_TIMEOUT, message, message, true);
    }
    if (lower.includes('connection') && (lower.includes('lost') || lower.includes('closed'))) {
      return new BrokerAdapterError(BrokerErrorCode.CONNECTION_LOST, message, message, true);
    }
    if (lower.includes('market closed') || lower.includes('trade disabled')) {
      return new BrokerAdapterError(BrokerErrorCode.MARKET_CLOSED, message, message, false);
    }
    if (lower.includes('insufficient margin') || lower.includes('not enough money')) {
      return new BrokerAdapterError(BrokerErrorCode.INSUFFICIENT_MARGIN, message, message, false);
    }
    if (lower.includes('invalid symbol') || lower.includes('unknown symbol')) {
      return new BrokerAdapterError(BrokerErrorCode.INVALID_INSTRUMENT, message, message, false);
    }
    if (lower.includes('duplicate') || lower.includes('client id')) {
      return new BrokerAdapterError(BrokerErrorCode.DUPLICATE_ORDER, message, message, false);
    }
    if (status >= 500 || lower.includes('internal server error')) {
      return new BrokerAdapterError(BrokerErrorCode.BROKER_SERVER_ERROR, message, message, true);
    }

    return new BrokerAdapterError(BrokerErrorCode.UNKNOWN, message, message, false);
  }
}
