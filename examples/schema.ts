/**
 * User account role permissions
 */
export type UserRole = 'ADMIN' | 'MEMBER' | 'GUEST';

/**
 * User profile entity representation
 */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  age?: number;
  tags: string[];
  metadata?: Record<string, string>;
  createdAt: Date;
}
