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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bullmq_1 = require("@nestjs/bullmq");
const broker_service_1 = require("./broker.service");
const broker_controller_1 = require("./broker.controller");
const broker_connection_entity_1 = require("./entities/broker-connection.entity");
const broker_account_entity_1 = require("./entities/broker-account.entity");
const broker_adapter_registry_1 = require("./adapters/broker-adapter.registry");
const metatrader_adapter_1 = require("./adapters/metatrader.adapter");
const credential_encryption_service_1 = require("./services/credential-encryption.service");
const metaapi_client_service_1 = require("./services/metaapi-client.service");
const broker_health_check_job_1 = require("./jobs/broker-health-check.job");
const broker_health_check_producer_1 = require("./jobs/broker-health-check.producer");
const audit_module_1 = require("../audit/audit.module");
let BrokerModule = class BrokerModule {
    constructor(registry, metaTraderAdapter) {
        this.registry = registry;
        this.metaTraderAdapter = metaTraderAdapter;
    }
    onModuleInit() {
        this.registry.register(this.metaTraderAdapter);
    }
};
exports.BrokerModule = BrokerModule;
exports.BrokerModule = BrokerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([broker_connection_entity_1.BrokerConnection, broker_account_entity_1.BrokerAccount]),
            bullmq_1.BullModule.registerQueue({ name: broker_health_check_job_1.BROKER_HEALTH_QUEUE }),
            audit_module_1.AuditModule,
        ],
        controllers: [broker_controller_1.BrokerController],
        providers: [
            broker_service_1.BrokerService,
            credential_encryption_service_1.CredentialEncryptionService,
            metaapi_client_service_1.MetaApiClientService,
            broker_adapter_registry_1.BrokerAdapterRegistry,
            metatrader_adapter_1.MetaTraderAdapter,
            broker_health_check_job_1.BrokerHealthCheckJob,
            broker_health_check_producer_1.BrokerHealthCheckProducer,
        ],
        exports: [broker_service_1.BrokerService, broker_adapter_registry_1.BrokerAdapterRegistry],
    }),
    __metadata("design:paramtypes", [broker_adapter_registry_1.BrokerAdapterRegistry,
        metatrader_adapter_1.MetaTraderAdapter])
], BrokerModule);
//# sourceMappingURL=broker.module.js.map