import { RiskService } from './risk.service';
import { ToggleKillSwitchDto } from './dto/kill-switch.dto';
import { UpdateRiskProfileDto } from './dto/update-risk-profile.dto';
export declare class RiskController {
    private readonly riskService;
    constructor(riskService: RiskService);
    toggleKillSwitch(dto: ToggleKillSwitchDto, userId: string): Promise<{
        killSwitchActive: boolean;
        killSwitchReason: string | null;
        message: string;
    }>;
    getRiskProfile(userId: string): Promise<import("./entities/risk-profile.entity").RiskProfile>;
    updateRiskProfile(dto: UpdateRiskProfileDto, userId: string): Promise<import("./entities/risk-profile.entity").RiskProfile>;
    getViolations(userId: string, limit?: string): Promise<import("./entities/risk-violation.entity").RiskViolation[]>;
    getRiskStatus(userId: string): Promise<{
        killSwitchActive: boolean;
        brokerConnected: boolean;
        canTrade: boolean;
        limits: {
            maxDailyLossPercent: string;
            maxDrawdownPercent: string;
            maxOpenTrades: number;
            maxPositionSizeLot: string;
            allowedInstruments: string | string[];
            maxVolatilityScore: string;
        };
    }>;
}
