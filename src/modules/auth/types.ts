export type AuthUser = {
  id: string;
  company_id: string;
  branch_id: string | null;
  username: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role_code?: string | null;
  role_profile?: 'SELLER' | 'CASHIER' | 'GENERAL' | null;
};

export type LoginPayload = {
  username: string;
  password: string;
  device_id: string;
  device_name?: string;
};

export type LoginResponse = {
  token_type: string;
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at: string;
  session_id: number;
  device_id: string;
  device_name?: string;
  user: AuthUser;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  deviceId: string;
  user: AuthUser;
};
