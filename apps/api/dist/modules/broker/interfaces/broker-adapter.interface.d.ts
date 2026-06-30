export interface IBrokerAdapter {
    readonly brokerId: string;
    readonly brokerName: string;
    readonly supportsDemo: boolean;
    setMode(mode: BrokerMode): void;
    connect(credentials: DecryptedBrokerCredentials): Promise<BrokerConnectionResult>;
    disconnect(): Promise<void>;
    testConnection(credentials: DecryptedBrokerCredentials): Promise<BrokerConnectionTestResult>;
    isConnected(): boolean;
    getAccountInfo(): Promise<BrokerAccountInfo>;
    getAccountBalance(): Promise<BrokerBalance>;
    getOpenPositions(): Promise<BrokerPosition[]>;
    getPositionById(externalOrderId: string): Promise<BrokerPosition | null>;
    getInstrumentList(): Promise<BrokerInstrument[]>;
    getCurrentPrice(instrument: string): Promise<BrokerPrice>;
    getOHLCV(instrument: string, timeframe: string, count: number): Promise<OHLCV[]>;
    placeOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult>;
    modifyOrder(externalOrderId: string, modifications: BrokerOrderModification): Promise<BrokerOrderResult>;
    closeOrder(externalOrderId: string, lotSize?: string): Promise<BrokerOrderResult>;
    closeAllOrders(): Promise<BrokerCloseAllResult>;
    getClosedTrades(from: Date, to: Date): Promise<BrokerClosedTrade[]>;
}
export declare enum BrokerMode {
    DEMO = "DEMO",
    LIVE = "LIVE"
}
export declare enum BrokerConnectionStatus {
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    DISCONNECTED = "DISCONNECTED",
    ERROR = "ERROR",
    SUSPENDED = "SUSPENDED"
}
export interface DecryptedBrokerCredentials {
    apiKey?: string;
    apiSecret?: string;
    accountId: string;
    serverUrl?: string;
    additionalParams?: Record<string, string>;
}
export interface BrokerConnectionResult {
    success: boolean;
    accountId: string;
    accountType: BrokerMode;
    currency: string;
    serverTime: Date;
    error?: string;
}
export interface BrokerConnectionTestResult {
    success: boolean;
    accountId?: string;
    accountType?: BrokerMode;
    currency?: string;
    errorCode?: string;
    errorMessage?: string;
}
export interface BrokerAccountInfo {
    accountId: string;
    currency: string;
    leverage: number;
    balance: string;
    equity: string;
    margin: string;
    freeMargin: string;
    marginLevel: string;
}
export interface BrokerBalance {
    balance: string;
    equity: string;
    currency: string;
    timestamp: Date;
}
export interface BrokerOrderRequest {
    idempotencyKey: string;
    instrument: string;
    direction: 'BUY' | 'SELL';
    lotSize: string;
    stopLoss: string;
    takeProfit: string;
    comment?: string;
}
export interface BrokerOrderModification {
    newStopLoss?: string;
    newTakeProfit?: string;
    newTrailingStop?: string;
}
export interface BrokerOrderResult {
    success: boolean;
    externalOrderId?: string;
    filledPrice?: string;
    filledAt?: Date;
    status: 'FILLED' | 'PENDING' | 'REJECTED' | 'FAILED';
    brokerMessage?: string;
    rawResponse?: unknown;
}
export interface BrokerCloseAllResult {
    closedCount: number;
    failedCount: number;
    errors: string[];
}
export interface BrokerPosition {
    externalOrderId: string;
    instrument: string;
    direction: 'BUY' | 'SELL';
    lotSize: string;
    openPrice: string;
    currentPrice: string;
    stopLoss: string;
    takeProfit: string;
    unrealisedPnl: string;
    openedAt: Date;
    commission: string;
    swap: string;
}
export interface BrokerClosedTrade {
    externalOrderId: string;
    instrument: string;
    direction: 'BUY' | 'SELL';
    lotSize: string;
    openPrice: string;
    closePrice: string;
    stopLoss: string;
    takeProfit: string;
    realisedPnl: string;
    openedAt: Date;
    closedAt: Date;
    commission: string;
    swap: string;
    closeReason: 'TP' | 'SL' | 'MANUAL' | 'SYSTEM' | 'UNKNOWN';
}
export interface BrokerInstrument {
    symbol: string;
    description: string;
    digits: number;
    minLot: string;
    maxLot: string;
    lotStep: string;
    contractSize: string;
}
export interface BrokerPrice {
    instrument: string;
    bid: string;
    ask: string;
    spread: string;
    timestamp: Date;
}
export interface OHLCV {
    timestamp: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}
