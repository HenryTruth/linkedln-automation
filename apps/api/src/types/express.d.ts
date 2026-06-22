declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      plan: string;
    }

    interface Request {
      user: User;
    }
  }
}

export {};
