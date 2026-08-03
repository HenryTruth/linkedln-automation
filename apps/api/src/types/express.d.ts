declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      plan: string;
      isAdmin: boolean;
    }

    interface Request {
      user: User;
    }
  }
}

export {};
