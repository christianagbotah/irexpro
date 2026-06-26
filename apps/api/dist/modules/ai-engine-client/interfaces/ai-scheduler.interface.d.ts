export interface AiSchedulerSessionStartPayload {
    userId: string;
    tradingSessionId: string;
    brokerConnectionId: string;
    instruments: string[];
    timeframe: string;
    intervalSeconds?: number;
    source: 'broker' | 'mock';
    mode: 'paper';
}
export interface AiSchedulerSessionStopPayload {
    tradingSessionId: string;
}
