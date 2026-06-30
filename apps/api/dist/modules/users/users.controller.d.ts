import { UsersService } from './users.service';
import { User } from './entities/user.entity';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getMe(user: User): Promise<User>;
    updateMe(user: User, updates: Record<string, unknown>): Promise<import("./entities/user-profile.entity").UserProfile>;
    listUsers(page?: number, limit?: number): Promise<{
        users: User[];
        total: number;
    }>;
    getUserById(id: string): Promise<User>;
}
