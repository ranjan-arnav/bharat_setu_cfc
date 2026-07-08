/**
 * User Service — Authentication & Profile Management
 * Backend-ready: swap mock implementations for real fetch() calls.
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: number;
}

export type UserType = 'citizen' | 'government';
export type UserRole = 'citizen' | 'contributor' | 'community_head' | 'government';

export interface AuthSession {
  id: string;
  userType: UserType;
  role: UserRole;
  name: string;
  token: string; // simulated JWT
}

export interface LoginCredentials {
  name: string;
  identifier: string; // Aadhaar for citizen, Official ID for gov
  userType: UserType;
}

// ---------- Mock helpers ----------
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const mockToken = () => `setu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// ---------- Public API ----------

export async function login(creds: LoginCredentials): Promise<ApiResponse<AuthSession>> {
  await delay(800); // simulate network
  const session: AuthSession = {
    id: `usr_${Date.now()}`,
    userType: creds.userType,
    role: creds.userType === 'government' ? 'government' : 'citizen',
    name: creds.name,
    token: mockToken(),
  };
  return { success: true, data: session, timestamp: Date.now() };
}

export async function logout(): Promise<ApiResponse<null>> {
  await delay(200);
  return { success: true, data: null, timestamp: Date.now() };
}

export async function getProfile(_userId: string): Promise<ApiResponse<{ name: string; userType: UserType }>> {
  await delay(400);
  return {
    success: true,
    data: { name: 'Mock User', userType: 'citizen' },
    timestamp: Date.now(),
  };
}
