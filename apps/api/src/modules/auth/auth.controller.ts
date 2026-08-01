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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { User } from '../users/entities/user.entity';

@ApiTags('Auth')
@Controller('auth')
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
    const ipAddress = req.ip;
    const tokens = await this.authService.register(dto, ipAddress);
    // Sprint 25: set httpOnly refresh cookie for web/admin. Mobile reads the
    // refreshToken from the JSON body. Both flows are supported simultaneously.
    // Sprint 27: pass rememberMe to control cookie maxAge.
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
    const ipAddress = req.ip;
    const tokens = await this.authService.login(dto, ipAddress);
    // Sprint 25: set httpOnly refresh cookie for web/admin. Mobile reads the
    // refreshToken from the JSON body. Both flows are supported simultaneously.
    // Sprint 27: pass rememberMe to control cookie maxAge.
    this.authCookieService.setRefreshCookie(res, tokens.refreshToken, dto.rememberMe);
    return tokens;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token (cookie for web/admin, body for mobile)' })
  @ApiResponse({ status: 200, description: 'New access and refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() req: Request,
    @Body() dto?: RefreshTokenDto,
    @Res({ passthrough: true }) res?: Response,
  ) {
    // Sprint 25: hybrid refresh — check httpOnly cookie first (web/admin),
    // then fall back to JSON body (mobile).
    const refreshToken =
      this.authCookieService.getRefreshTokenFromCookie(req) ?? dto?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    // Rotate the refresh cookie for web/admin (if res is available)
    if (res) {
      this.authCookieService.setRefreshCookie(res, tokens.refreshToken);
    }

    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — clear refresh cookie, client discards tokens' })
  async logout(@Res({ passthrough: true }) res: Response) {
    // Sprint 25: clear the httpOnly refresh cookie for web/admin.
    // Mobile client discards its in-memory/SecureStore tokens.
    // Server-side token invalidation via Redis blacklist is a Phase 2 enhancement.
    this.authCookieService.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user (frontend-safe DTO)' })
  @ApiResponse({ status: 200, description: 'Current user profile with roles', type: AuthUserDto })
  async me(@CurrentUser() user: User & { roles?: string[] }): Promise<AuthUserDto> {
    // Sprint 25: return a frontend-safe AuthUserDto that explicitly allowlists
    // only safe fields (id, email, firstName, lastName, countryCode, status,
    // roles, mfaEnabled, lastLoginAt, createdAt). Sensitive fields
    // (passwordHash, mfaSecret, deletedAt, userRoles, profile PII) are never
    // included. Roles come from the JWT payload (set by JwtStrategy.validate).
    return this.authService.getAuthUserDto(user.id, (user.roles ?? []) as never);
  }

  // ── Sprint 28: Secure password reset ────────────────────────────────────

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
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
    // Sprint 28: always return the SAME generic message whether or not the
    // account exists. This prevents account enumeration. The raw token/code
    // is delivered via email/SMS (if configured) — never returned in the response.
    await this.passwordResetService.requestReset(dto.identifier, {
      ipAddress: ip,
      userAgent,
    });
    return {
      message: 'If an account exists for this identifier, password reset instructions have been sent.',
    };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using a token (email) or code (phone)' })
  @ApiResponse({ status: 200, description: 'Password has been reset successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired reset token/code' })
  @ApiResponse({ status: 400, description: 'Weak password or missing fields' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    // Sprint 28: supports two flows:
    //   1. Email token: { token, password }
    //   2. Phone code: { identifier, code, password }
    // The controller routes to the appropriate service method.
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
