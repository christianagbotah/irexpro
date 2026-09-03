import { IsBoolean, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ActivateEmergencyShutdownDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  reason: string;

  @IsBoolean()
  forceClose: boolean;
}

export class DeactivateEmergencyShutdownDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  reason: string;
}
