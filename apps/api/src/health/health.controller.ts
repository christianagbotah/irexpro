import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Application aggregate health check' })
  async check() {
    return this.healthService.check();
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Application process liveness check' })
  live() {
    return this.healthService.liveness();
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Application dependency readiness check' })
  async ready() {
    const readiness = await this.healthService.readiness();

    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}
