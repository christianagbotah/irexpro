import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum AccountStatusAction {
  DEACTIVATE = 'DEACTIVATE',
  PERMANENTLY_LOCK = 'PERMANENTLY_LOCK',
  DELETE = 'DELETE',
}

/** Admin-only direct account action with a required accountable reason. */
export class UpdateAccountStatusDto {
  @ApiProperty({ enum: AccountStatusAction })
  @IsEnum(AccountStatusAction)
  action: AccountStatusAction;

  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
