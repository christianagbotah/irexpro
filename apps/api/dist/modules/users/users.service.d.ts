import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { Role } from './entities/role.entity';
export declare class UsersService {
    private userRepo;
    private profileRepo;
    private roleRepo;
    constructor(userRepo: Repository<User>, profileRepo: Repository<UserProfile>, roleRepo: Repository<Role>);
    findById(id: string): Promise<User>;
    findAll(page?: number, limit?: number): Promise<{
        users: User[];
        total: number;
    }>;
    updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile>;
    seedDefaultRoles(): Promise<void>;
}
