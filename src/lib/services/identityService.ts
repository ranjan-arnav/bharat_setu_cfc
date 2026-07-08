/**
 * Identity Service — DigiLocker / Aadhaar profile simulation
 * Backend-ready: swap mock implementations for real fetch() calls.
 */

import type { ApiResponse } from './userService';

export interface VerifiedProfile {
  name: string;
  nameHindi: string;
  dob: string;
  gender: string;
  mobile: string;
  address: string;
  district: string;
  state: string;
  pincode: string;
  aadhaarMasked: string;
  aadhaarVerified: boolean;
  occupation: string;
  income: number;
  bplCard: boolean;
  rationCardType: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Simulates DigiLocker API fetch — returns mock verified citizen data after 1.5s delay */
export async function fetchDigiLockerProfile(aadhaarLast4: string): Promise<ApiResponse<VerifiedProfile>> {
  await delay(1500);
  const profile: VerifiedProfile = {
    name: 'Ramesh Kumar Sharma',
    nameHindi: 'रमेश कुमार शर्मा',
    dob: '1985-03-15',
    gender: 'Male',
    mobile: '+91 98765 43210',
    address: '42, Shanti Nagar, Ward 7',
    district: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226001',
    aadhaarMasked: `XXXX-XXXX-${aadhaarLast4 || '4321'}`,
    aadhaarVerified: true,
    occupation: 'Farmer (Kisan)',
    income: 180000,
    bplCard: true,
    rationCardType: 'AAY',
  };
  return { success: true, data: profile, timestamp: Date.now() };
}

/** Simulates Aadhaar OTP verification */
export async function verifyAadhaar(_aadhaarMasked: string): Promise<ApiResponse<{ verified: boolean; source: string }>> {
  await delay(1000);
  return {
    success: true,
    data: { verified: true, source: 'UIDAI e-KYC' },
    timestamp: Date.now(),
  };
}
