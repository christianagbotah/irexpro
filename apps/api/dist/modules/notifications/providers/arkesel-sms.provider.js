"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArkeselSmsProvider = void 0;
const common_1 = require("@nestjs/common");
let ArkeselSmsProvider = class ArkeselSmsProvider {
    constructor() {
        this.providerId = 'arkesel';
        this.displayName = 'Arkesel SMS';
        this.supportedCountries = ['GH', 'NG', 'KE', 'GH', 'CI', 'SN'];
        this.isLive = false;
    }
    async sendSms(_params) {
        throw new common_1.NotImplementedException('ArkeselSmsProvider: live SMS sending not yet implemented');
    }
};
exports.ArkeselSmsProvider = ArkeselSmsProvider;
exports.ArkeselSmsProvider = ArkeselSmsProvider = __decorate([
    (0, common_1.Injectable)()
], ArkeselSmsProvider);
//# sourceMappingURL=arkesel-sms.provider.js.map