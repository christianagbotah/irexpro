import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { PasswordResetService } from './password-reset.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthUserDto } from './dto/auth-user.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
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
  @ApiOperation({ summary: 'Login with email and password' })
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
