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
const currency_minor_units_1 = require("./currency-minor-units");
function majorToMinorUnits(majorStr, digits = 2) {
    if (majorStr === null || majorStr === undefined)
        return null;
    const trimmed = String(majorStr).trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'null')
        return null;
    const negative = trimmed.startsWith('-');
    const abs = negative ? trimmed.slice(1) : trimmed;
    const dotIdx = abs.indexOf('.');
    let intPart;
    let decPart;
    if (dotIdx === -1) {
        intPart = abs;
        decPart = '';
    }
    else {
        intPart = abs.slice(0, dotIdx);
        decPart = abs.slice(dotIdx + 1);
    }
    if (intPart === '')
        intPart = '0';
    if (!/^\d+$/.test(intPart))
        return null;
    if (decPart !== '' && !/^\d+$/.test(decPart))
        return null;
    const frac = digits === 0 ? '' : decPart.slice(0, digits).padEnd(digits, '0');
    const scale = 10n ** BigInt(digits);
    const minor = BigInt(intPart) * scale + (digits > 0 ? BigInt(frac) : 0n);
    return negative ? (-minor).toString() : minor.toString();
}
function isValidBigIntString(value) {
    return /^-?\d+$/.test(value.trim());
}
let ClosedTradeNormalizerService = ClosedTradeNormalizerService_1 = class ClosedTradeNormalizerService {
    constructor() {
        this.logger = new common_1.Logger(ClosedTradeNormalizerService_1.name);
    }
    normalize(rawTrades, brokerProvider, currency, now = new Date()) {
        const valid = [];
        const skipped = [];
        const digits = (0, currency_minor_units_1.getMinorUnitDigits)(currency);
        for (const raw of rawTrades) {
            const result = this.normalizeOne(raw, brokerProvider, currency, digits, now);
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
    normalizeOne(raw, brokerProvider, currency, digits, now) {
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
        const grossRealisedPnl = majorToMinorUnits(raw.realisedPnl ?? '0', digits);
        const commission = majorToMinorUnits(raw.commission ?? '0', digits);
        const swap = majorToMinorUnits(raw.swap ?? '0', digits);
        if (grossRealisedPnl === null || !isValidBigIntString(grossRealisedPnl)) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid grossRealisedPnl' };
        }
        if (commission === null || !isValidBigIntString(commission)) {
            return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid commission' };
        }
        if (swap === null || !isValidBigIntString(swap)) {
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
                currency,
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