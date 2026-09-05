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
    const health = await this.healthService.check();

    return { status: health.status };
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Application process liveness check' })
  live() {
    const liveness = this.healthService.liveness();

    return { status: liveness.status };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Application dependency readiness check' })
  async ready() {
    const readiness = await this.healthService.readiness();
    const publicReadiness = { status: readiness.status };

    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(publicReadiness);
    }

    return publicReadiness;
  }
}
