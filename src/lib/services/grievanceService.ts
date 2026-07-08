/**
 * Grievance Service — CRUD for civic complaints
 * Backend-ready: swap mock implementations for real fetch() calls.
 */

import type { ApiResponse } from './userService';

export interface GrievancePayload {
  description: string;
  category: string;
  digipin: string;
  imageCaption?: string;
}

export type GrievanceStatus = 'Submitted' | 'Under Review' | 'In Progress' | 'Resolved';

export interface GrievanceRecord {
  id: string;
  refId: string;
  description: string;
  category: string;
  digipin: string;
  status: GrievanceStatus;
  imageCaption?: string;
  submittedAt: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function submitGrievance(data: GrievancePayload): Promise<ApiResponse<GrievanceRecord>> {
  await delay(1200);
  const year = new Date().getFullYear();
  const seq = Math.floor(1000 + Math.random() * 9000);
  const record: GrievanceRecord = {
    id: `grv_${Date.now()}`,
    refId: `GRV-${year}-${seq}`,
    ...data,
    status: 'Submitted',
    submittedAt: new Date().toISOString(),
  };
  return { success: true, data: record, timestamp: Date.now() };
}

export async function getGrievances(_page = 1, _limit = 20): Promise<ApiResponse<GrievanceRecord[]>> {
  await delay(600);
  return { success: true, data: [], timestamp: Date.now() };
}

/** Government-only: update case status */
export async function updateGrievanceStatus(
  id: string,
  status: GrievanceStatus
): Promise<ApiResponse<{ id: string; status: GrievanceStatus }>> {
  await delay(500);
  return { success: true, data: { id, status }, timestamp: Date.now() };
}
