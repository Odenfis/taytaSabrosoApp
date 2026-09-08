import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { user: User; deviceId: string };
    }
  }
}

export {};