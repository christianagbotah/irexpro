import { BrokerAccountInfo, BrokerBalance, BrokerCloseAllResult, BrokerClosedTrade, BrokerConnectionResult, BrokerConnectionTestResult, BrokerInstrument, BrokerMode, BrokerOrderModification, BrokerOrderRequest, BrokerOrderResult, BrokerPosition, BrokerPrice, DecryptedBrokerCredentials, IBrokerAdapter, OHLCV } from '../interfaces/broker-adapter.interface';
export declare class PaperBrokerAdapter implements IBrokerAdapter {
    private readonly logger;
    readonly brokerId = "paper-broker";
    readonly brokerName = "Paper Trading Broker (Simulated \u2014 PAPER_ONLY)";
    readonly supportsDemo = true;
    private _connected;
    private _mode;
    private _orderCounter;
    private _balance;
    private readonly _currency;
    setMode(mode: BrokerMode): void;
    connect(_credentials: DecryptedBrokerCredentials): Promise<BrokerConnectionResult>;
    disconnect(): Promise<void>;
    testConnection(_credentials: DecryptedBrokerCredentials): Promise<BrokerConnectionTestResult>;
    isConnected(): boolean;
    getAccountInfo(): Promise<BrokerAccountInfo>;
    getAccountBalance(): Promise<BrokerBalance>;
    getOpenPositions(): Promise<BrokerPosition[]>;
    getPositionById(_externalOrderId: string): Promise<BrokerPosition | null>;
    getInstrumentList(): Promise<BrokerInstrument[]>;
    getCurrentPrice(instrument: string): Promise<BrokerPrice>;
    getOHLCV(instrument: string, timeframe: string, count: number): Promise<OHLCV[]>;
    placeOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult>;
    modifyOrder(externalOrderId: string, _modifications: BrokerOrderModification): Promise<BrokerOrderResult>;
    closeOrder(externalOrderId: string, _lotSize?: string): Promise<BrokerOrderResult>;
    closeAllOrders(): Promise<BrokerCloseAllResult>;
    getClosedTrades(_from: Date, _to: Date): Promise<BrokerClosedTrade[]>;
}
