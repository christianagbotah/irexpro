import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalConfigService } from './global-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Global Config')
@UseGuards(JwtAuthGuard)
@Controller('global-config')
export class GlobalConfigController {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  @Get('countries')
  @Public()
  @ApiOperation({ summary: 'List all supported countries and their configuration' })
  async listCountries() {
    return this.globalConfigService.findAllCountries();
  }

  @Get('countries/:countryCode')
  @Public()
  @ApiOperation({ summary: 'Get configuration for a specific country' })
  async getCountry(@Param('countryCode') countryCode: string) {
    return this.globalConfigService.findByCountryCode(countryCode);
  }
}
