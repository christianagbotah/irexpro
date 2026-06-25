import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
export declare class HealthService {
    private dataSource;
    private configService;
    constructor(dataSource: DataSource, configService: ConfigService);
    check(): Promise<Record<string, unknown>>;
    private checkDatabase;
}
