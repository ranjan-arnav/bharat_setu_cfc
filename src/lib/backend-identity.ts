import type { AgentKey, CitizenProfile } from './store';

export interface BackendIdentityInput {
  userProfile?: {
    name?: string;
    digipin?: string;
  };
  citizenProfile?: Pick<CitizenProfile, 'aadhaarMasked' | 'mobile' | 'name'> | null;
}

function digitsOnly(value: string | undefined): string {
  return (value || '').replace(/\D/g, '');
}

function slug(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function buildBackendUserId(input: BackendIdentityInput): string {
  const aadhaarDigits = digitsOnly(input.citizenProfile?.aadhaarMasked);
  if (aadhaarDigits.length >= 4) {
    return `aadhaar-${aadhaarDigits.slice(-4)}`;
  }

  const mobileDigits = digitsOnly(input.citizenProfile?.mobile);
  if (mobileDigits.length >= 10) {
    return `mobile-${mobileDigits.slice(-10)}`;
  }

  const profileName = slug(input.userProfile?.name || input.citizenProfile?.name);
  if (profileName) {
    return `name-${profileName}`;
  }

  const profileDigipin = slug(input.userProfile?.digipin);
  if (profileDigipin) {
    return `digipin-${profileDigipin}`;
  }

  return 'anonymous-user';
}

export function buildConversationId(userId: string, agentKey: AgentKey): string {
  return `${userId}:${agentKey}`;
}
