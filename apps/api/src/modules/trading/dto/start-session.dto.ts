import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartSessionDto {
  @ApiPropertyOptional({
    description:
      'Specific broker connection ID to use. ' +
      'If omitted, the first active CONNECTED broker connection is used.',
    example: 'uuid-v4',
  })
  @IsOptional()
  @IsUUID()
  brokerConnectionId?: string;
}
