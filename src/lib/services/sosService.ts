/**
 * SOS Service — Emergency alert dispatch
 * Backend-ready: swap mock implementations for real fetch() calls.
 */

import type { ApiResponse } from './userService';

export interface SOSPayload {
  latitude: number;
  longitude: number;
  digipin?: string;
  emergencyContacts: { name: string; phone: string }[];
  message?: string;
}

export interface SOSRecord {
  id: string;
  status: 'dispatched' | 'cancelled' | 'acknowledged';
  dispatchedAt: string;
  eta?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function triggerSOS(_payload: SOSPayload): Promise<ApiResponse<SOSRecord>> {
  await delay(600);
  const record: SOSRecord = {
    id: `sos_${Date.now()}`,
    status: 'dispatched',
    dispatchedAt: new Date().toISOString(),
    eta: '8 minutes',
  };
  return { success: true, data: record, timestamp: Date.now() };
}

export async function cancelSOS(id: string): Promise<ApiResponse<{ id: string; status: 'cancelled' }>> {
  await delay(300);
  return { success: true, data: { id, status: 'cancelled' }, timestamp: Date.now() };
}
