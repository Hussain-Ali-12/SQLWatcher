export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface UserInfo {
  user_id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer' | string;
  expires_at: string;
  user: UserInfo;
}

export interface NotificationItem {
  notification_id: number;
  alert_id: number;
  created_at: string;
  title: string;
  message: string;
  severity: string;
  is_read: boolean;
  source?: 'websocket' | 'history' | 'manual';
  received_at?: string;
}
