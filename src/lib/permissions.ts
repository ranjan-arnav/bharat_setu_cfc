/**
 * Centralized Role-Based Permission System
 * Defines what each role can do and provides guard utilities.
 */

export type UserRole = 'citizen' | 'contributor' | 'community_head' | 'government';

export type Permission =
  | 'basic_actions'
  | 'highlight_issue'
  | 'community_engage'
  | 'cluster_issues'
  | 'priority_flag'
  | 'all_actions'
  | 'update_status'
  | 'broadcast';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  citizen: ['basic_actions'],
  contributor: ['basic_actions', 'highlight_issue', 'community_engage'],
  community_head: ['basic_actions', 'highlight_issue', 'cluster_issues', 'priority_flag', 'community_engage'],
  government: ['all_actions', 'update_status', 'broadcast', 'basic_actions', 'highlight_issue', 'cluster_issues', 'priority_flag', 'community_engage'],
};

/** Check if a role has a specific permission */
export function hasPermission(role: UserRole, action: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('all_actions') || perms.includes(action);
}

/** Derive role from karma score + user type */
export function getRoleFromKarma(karma: number, userType: 'citizen' | 'government'): UserRole {
  if (userType === 'government') return 'government';
  if (karma >= 150) return 'community_head';
  if (karma >= 51) return 'contributor';
  return 'citizen';
}
