"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrokerHealthCheckJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerHealthCheckJob = exports.BROKER_HEALTH_JOB = exports.BROKER_HEALTH_QUEUE = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const broker_service_1 = require("../broker.service");
const broker_connection_entity_1 = require("../entities/broker-connection.entity");
const broker_adapter_interface_1 = require("../interfaces/broker-adapter.interface");
exports.BROKER_HEALTH_QUEUE = 'broker-health-check';
exports.BROKER_HEALTH_JOB = 'health-check-all';
let BrokerHealthCheckJob = BrokerHealthCheckJob_1 = class BrokerHealthCheckJob extends bullmq_1.WorkerHost {
    constructor(brokerService, connectionRepo) {
        super();
        this.brokerService = brokerService;
        this.connectionRepo = connectionRepo;
        this.logger = new common_1.Logger(BrokerHealthCheckJob_1.name);
    }
    async process(job) {
        this.logger.debug(`Running broker health check job: ${job.id}`);
        const connections = await this.connectionRepo.find({
            where: { status: broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED },
            select: ['id', 'userId', 'brokerId', 'accountId'],
        });
        if (connections.length === 0) {
            this.logger.debug('No active broker connections to health check');
            return { checked: 0, failed: 0 };
        }
        this.logger.log(`Health checking ${connections.length} active broker connection(s)`);
        let checked = 0;
        let failed = 0;
        await Promise.allSettled(connections.map(async (conn) => {
            try {
                const healthy = await this.brokerService.healthCheck(conn.id);
                if (healthy) {
                    checked++;
                }
                else {
                    failed++;
                    this.logger.warn(`Health check failed for connection ${conn.id} (broker=${conn.brokerId}, account=${conn.accountId})`);
                }
            }
            catch (err) {
                failed++;
                this.logger.error(`Health check threw for connection ${conn.id}: ${err.message}`);
            }
        }));
        this.logger.log(`Health check complete: ${checked} healthy, ${failed} failed`);
        return { checked, failed };
    }
};
exports.BrokerHealthCheckJob = BrokerHealthCheckJob;
exports.BrokerHealthCheckJob = BrokerHealthCheckJob = BrokerHealthCheckJob_1 = __decorate([
    (0, bullmq_1.Processor)(exports.BROKER_HEALTH_QUEUE),
    __param(1, (0, typeorm_1.InjectRepository)(broker_connection_entity_1.BrokerConnection)),
    __metadata("design:paramtypes", [broker_service_1.BrokerService,
        typeorm_2.Repository])
], BrokerHealthCheckJob);
//# sourceMappingURL=broker-health-check.job.js.map