import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { Role, RoleName } from './entities/role.entity';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private profileRepo: Repository<UserProfile>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['profile', 'userRoles', 'userRoles.role'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(page?: number, limit?: number): Promise<{ users: User[]; total: number }> {
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 100);
    const [users, total] = await this.userRepo.findAndCount({
      relations: ['profile'],
      order: { createdAt: 'DESC' },
      take: limitNum,
      skip: (pageNum - 1) * limitNum,
    });
    return { users, total };
  }

  /**
   * Legacy profile update — only updates UserProfile fields.
   * Kept for backward compatibility. Prefer updateMyProfile() for Sprint 29.
   */
  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    Object.assign(profile, updates);
    return this.profileRepo.save(profile);
  }

  /**
   * Sprint 29: update the authenticated user's profile for onboarding.
   * Updates BOTH User-level fields (countryCode, timezone, preferredCurrency)
   * AND UserProfile fields (firstName, lastName, tradingExperienceLevel).
   * Returns the updated User with profile relation loaded.
   */
  async updateMyProfile(userId: string, dto: UpdateMyProfileDto): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['profile'] });
    if (!user) throw new NotFoundException('User not found');

    // Update User-level fields
    if (dto.countryCode !== undefined) user.countryCode = dto.countryCode.toUpperCase();
    if (dto.timezone !== undefined) user.timezone = dto.timezone;
    if (dto.preferredCurrency !== undefined) user.preferredCurrency = dto.preferredCurrency.toUpperCase();

    // Update UserProfile fields
    if (user.profile) {
      if (dto.firstName !== undefined) user.profile.firstName = dto.firstName;
      if (dto.lastName !== undefined) user.profile.lastName = dto.lastName;
      if (dto.tradingExperienceLevel !== undefined) user.profile.tradingExperienceLevel = dto.tradingExperienceLevel;
      await this.profileRepo.save(user.profile);
    }

    await this.userRepo.save(user);
    return this.findById(userId);
  }

  async seedDefaultRoles(): Promise<void> {
    for (const name of Object.values(RoleName)) {
      const exists = await this.roleRepo.findOne({ where: { name } });
      if (!exists) {
        await this.roleRepo.save(this.roleRepo.create({ name, description: `Default ${name} role` }));
      }
    }
  }
}
