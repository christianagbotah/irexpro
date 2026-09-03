import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Optional,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';
import { AuthUserDto } from './dto/auth-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { DisableMfaDto, MfaCodeDto } from './dto/mfa.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { MfaService } from './mfa.service';
import { PasswordResetService } from './password-reset.service';
import { VerificationService } from './verification.service';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly passwordResetService: PasswordResetService,
    // Optional keeps older focused controller unit-test modules source-compatible.
    // Production AuthModule always provides both services; endpoints fail closed
    // if a deliberately minimal test module omits them.
    @Optional() private readonly mfaService?: MfaService,
    @Optional() private readonly verificationService?: VerificationService,
  ) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto, req.ip);
    this.authCookieService.setRefreshCookie(res, tokens.refreshToken, dto.rememberMe);
    return tokens;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60 * 1000, limit: 10 } })
  @ApiOperation({ summary: 'Login with password and TOTP when MFA is enabled' })
  @ApiResponse({ status: 200, description: 'Login successful, returns access and refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto, req.ip);
    this.authCookieService.setRefreshCookie(res, tokens.refreshToken, dto.rememberMe);
    return tokens;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60 * 1000, limit: 60 } })
  @ApiOperation({ summary: 'Refresh and rotate access/refresh tokens' })
  @ApiResponse({ status: 200, description: 'New access and refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid, expired, revoked, or replayed refresh token' })
  async refresh(
    @Req() req: Request,
    @Body() dto?: RefreshTokenDto,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const refreshToken = this.authCookieService.getRefreshTokenFromCookie(req) ?? dto?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    if (res) {
      this.authCookieService.setRefreshCookie(res, tokens.refreshToken);
    }

    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and immediately revoke all active tokens for the account' })
  async logout(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(principal.userId, req.ip);
    this.authCookieService.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user (frontend-safe DTO)' })
  @ApiResponse({ status: 200, description: 'Current user profile with roles', type: AuthUserDto })
  async me(@CurrentUser() principal: AuthenticatedPrincipal): Promise<AuthUserDto> {
    return this.authService.getAuthUserDto(principal.userId, principal.roles as never);
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  @ApiOperation({ summary: 'Begin TOTP MFA setup for the current account' })
  async beginMfaSetup(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Ip() ip: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    if (!this.mfaService) throw new ServiceUnavailableException('MFA is temporarily unavailable');
    return this.mfaService.beginSetup(principal.userId, ip);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  @ApiOperation({ summary: 'Verify TOTP setup and enable MFA; revokes existing sessions' })
  async enableMfa(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: MfaCodeDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    if (!this.mfaService) throw new ServiceUnavailableException('MFA is temporarily unavailable');
    await this.mfaService.enable(principal.userId, dto.code, ip);
    return { message: 'MFA enabled. Sign in again using your authenticator code.' };
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  @ApiOperation({
    summary: 'Disable MFA using current password and TOTP; revokes existing sessions',
  })
  async disableMfa(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: DisableMfaDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    if (!this.mfaService) throw new ServiceUnavailableException('MFA is temporarily unavailable');
    await this.mfaService.disable(principal.userId, dto.code, dto.password, ip);
    return { message: 'MFA disabled. Existing sessions have been revoked.' };
  }

  @Post('verification/email/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  @ApiOperation({ summary: 'Send a single-use email verification link' })
  async requestEmailVerification(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ message: string }> {
    if (!this.verificationService) {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable');
    }
    await this.verificationService.requestEmailVerification(principal.userId, {
      ipAddress: ip,
      userAgent,
    });
    return { message: 'If verification is required, an email has been sent.' };
  }

  @Post('verification/email/confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  @ApiOperation({ summary: 'Confirm a single-use email verification token' })
  async confirmEmailVerification(
    @Body() dto: VerifyEmailDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    if (!this.verificationService) {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable');
    }
    await this.verificationService.verifyEmail(dto.token, ip);
    return { message: 'Email verified successfully.' };
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  @ApiOperation({ summary: 'Request a password reset (email link or SMS code)' })
  @ApiResponse({
    status: 200,
    description: 'Always returns a generic message — does not reveal whether the account exists.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ message: string }> {
    await this.passwordResetService.requestReset(dto.identifier, {
      ipAddress: ip,
      userAgent,
    });
    return {
      message:
        'If an account exists for this identifier, password reset instructions have been sent.',
    };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  @ApiOperation({ summary: 'Reset password using a token (email) or code (phone)' })
  @ApiResponse({ status: 200, description: 'Password has been reset successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired reset token/code' })
  @ApiResponse({ status: 400, description: 'Weak password or missing fields' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.token) {
      await this.passwordResetService.resetWithToken(dto.token, dto.password);
    } else if (dto.identifier && dto.code) {
      await this.passwordResetService.resetWithCode(dto.identifier, dto.code, dto.password);
    } else {
      throw new BadRequestException(
        'Provide either a reset token (email flow) or identifier + code (phone flow)',
      );
    }
    return { message: 'Password has been reset successfully.' };
  }
}
