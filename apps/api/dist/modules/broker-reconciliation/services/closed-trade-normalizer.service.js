"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ClosedTradeNormalizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedTradeNormalizerService = void 0;
exports.majorToMinorUnits = majorToMinorUnits;
exports.isValidBigIntString = isValidBigIntString;
const common_1 = require("@nestjs/common");
function majorToMinorUnits(majorStr) {
    if (!majorStr || majorStr === '' || majorStr === 'null')
        return '0';
    const trimmed = majorStr.trim();
    const negative = trimmed.startsWith('-');
    const abs = negative ? trimmed.slice(1) : trimmed;
    const dotIdx = abs.indexOf('.');
    let intPart;
    let decPart;
    if (dotIdx === -1) {
        intPart = abs;
        decPart = '00';
    }
    else {
        intPart = abs.slice(0, dotIdx);
        decPart = abs.slice(dotIdx + 1, dotIdx + 3).padEnd(2, '0');
    }
    if (!/^\d*$/.test(intPart) || !/^\d{2}$/.test(decPart)) {
        return '0';
    }
    const minor = BigInt(intPart === '' ? '0' : intPart) * 100n + BigInt(decPart);
    return negative ? (-minor).toString() : minor.toString();
}
function isValidBigIntString(value) {
    return /^-?\d+$/.test(value.trim());
}
let ClosedTradeNormalizerService = ClosedTradeNormalizerService_1 = class ClosedTradeNormalizerService {
    constructor() {
        this.logger = new common_1.Logger(ClosedTradeNormalizerService_1.name);
    }
    normalize(rawTrades, brokerProvider, now = new Date()) {
        const valid = [];
        const skipped = [];
        for (const raw of rawTrades) {
            const result = this.normalizeOne(raw, brokerProvider, now);
            if (result.kind === 'valid') {
                valid.push(result.trade);
            }
            else {
                skipped.push(result);
                this.logger.debug(`[Normalizer] Skipped trade externalOrderId=${raw.externalOrderId ?? '<none>'}: ${result.reason}`);
            }
        }
        return { valid, skipped };
    }
    normalizeOne(raw, brokerProvider, now) {
        const brokerTradeId = raw.externalOrderId?.trim();
        if (!brokerTradeId) {
            return { kind: 'skipped', externalOrderId: null, reason: 'missing brokerTradeId (externalOrderId)' };
        }
        if (!raw.closedAt) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'missing closedAt (open trade)' };
        }
        if (raw.closedAt > now) {
            return {
                kind: 'skipped',
                externalOrderId: brokerTradeId,
                reason: `future closedAt (${raw.closedAt.toISOString()})`,
            };
        }
        const grossRealisedPnl = majorToMinorUnits(raw.realisedPnl ?? '0');
        const commission = majorToMinorUnits(raw.commission ?? '0');
        const swap = majorToMinorUnits(raw.swap ?? '0');
        if (!isValidBigIntString(grossRealisedPnl)) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid grossRealisedPnl' };
        }
        if (!isValidBigIntString(commission)) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid commission' };
        }
        if (!isValidBigIntString(swap)) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid swap' };
        }
        const netRealisedPnl = (BigInt(grossRealisedPnl) + BigInt(commission) + BigInt(swap)).toString();
        if (raw.direction !== 'BUY' && raw.direction !== 'SELL') {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: `invalid direction: ${raw.direction}` };
        }
        if (!raw.instrument?.trim()) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'missing instrument' };
        }
        const rawMetadataSummary = {
            brokerProvider,
            instrument: raw.instrument,
            direction: raw.direction,
            lotSize: raw.lotSize,
            closeReason: raw.closeReason,
            openedAt: raw.openedAt?.toISOString() ?? null,
            closedAt: raw.closedAt.toISOString(),
        };
        return {
            kind: 'valid',
            trade: {
                brokerTradeId,
                brokerOrderId: null,
                instrument: raw.instrument.trim(),
                direction: raw.direction,
                volume: raw.lotSize ?? '0',
                openedAt: raw.openedAt ?? null,
                closedAt: raw.closedAt,
                entryPrice: raw.openPrice ?? null,
                exitPrice: raw.closePrice ?? null,
                grossRealisedPnl,
                commission,
                swap,
                netRealisedPnl,
                currency: 'USD',
                rawMetadataSummary,
            },
        };
    }
};
exports.ClosedTradeNormalizerService = ClosedTradeNormalizerService;
exports.ClosedTradeNormalizerService = ClosedTradeNormalizerService = ClosedTradeNormalizerService_1 = __decorate([
    (0, common_1.Injectable)()
], ClosedTradeNormalizerService);
//# sourceMappingURL=closed-trade-normalizer.service.js.map