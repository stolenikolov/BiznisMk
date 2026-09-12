import type { User } from '../generated/prisma/client.js';

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: user.createdAt,
  };
}
