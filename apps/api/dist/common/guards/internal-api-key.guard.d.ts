import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare const INTERNAL_API_KEY_HEADER = "x-irexpro-internal-api-key";
export declare class InternalApiKeyGuard implements CanActivate {
    private readonly configService;
    private readonly logger;
    constructor(configService: ConfigService);
    canActivate(context: ExecutionContext): boolean;
}
