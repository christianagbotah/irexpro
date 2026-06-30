"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioSmsProvider = void 0;
const common_1 = require("@nestjs/common");
let TwilioSmsProvider = class TwilioSmsProvider {
    constructor() {
        this.providerId = 'twilio';
        this.displayName = 'Twilio';
        this.supportedCountries = ['*'];
        this.isLive = false;
    }
    async sendSms(_params) {
        throw new common_1.NotImplementedException('TwilioSmsProvider: live SMS sending not yet implemented');
    }
};
exports.TwilioSmsProvider = TwilioSmsProvider;
exports.TwilioSmsProvider = TwilioSmsProvider = __decorate([
    (0, common_1.Injectable)()
], TwilioSmsProvider);
//# sourceMappingURL=twilio-sms.provider.js.map