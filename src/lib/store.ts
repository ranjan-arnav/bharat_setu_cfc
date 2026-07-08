import { create } from 'zustand';
import { getRoleFromKarma, type UserRole } from './permissions';
import type { CollectiveCluster } from './intelligence';
import { buildBackendUserId, buildConversationId } from './backend-identity';

export type UserType = 'citizen' | 'government';

export type AgentKey = 'nagarik_mitra' | 'swasthya_sahayak' | 'yojana_saathi' | 'arthik_salahkar' | 'vidhi_sahayak' | 'kisan_mitra';
export type OverlayType = 'none' | 'agent-chat' | 'grievance' | 'scheme-scanner' | 'voice' | 'impact' | 'scam-alert' | 'sos-active' | 'digipin' | 'track' | 'emergency-contacts' | 'help-neighbour' | 'omni-router';
export type TrackedItemType = 'grievance' | 'scheme' | 'health' | 'legal' | 'finance';

export interface TrackedItem {
  id: string;
  type: TrackedItemType;
  title: string;
  description: string;
  status: 'Active' | 'Under Review' | 'In Progress' | 'Resolved' | 'Pending';
  createdAt: number;
  agentKey: AgentKey;
  refId?: string;           // e.g. GRV-NM-2026-XXXX or WTR-XXXX, generated with new Date().getFullYear()
  neighbourhood?: number;   // others in same DIGIPIN zone w/ same issue
  emoji?: string;
  portal?: string;          // deeplink portal name
  eta?: string;             // expected resolution
  amount?: string;          // financial amount involved
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  priority: 1 | 2;
}

export interface CitizenProfile {
  name: string;
  nameHindi: string;
  aadhaarMasked: string;
  dob: string;
  gender: string;
  mobile: string;
  address: string;
  district: string;
  state: string;
  pincode: string;
  digipin: string;
  language: string;
  occupation: string;
  income: number;
  bplCard: boolean;
  rationCardType: string;
  linkedSchemes: string[];
  eligibleSchemes: string[];
  aadhaarVerified: boolean;
  emergencyContacts: EmergencyContact[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentKey?: AgentKey;
  imageUrl?: string;
  imageAlt?: string;
}

export interface ActiveForm {
  formKey?: string;
  type: string;
  title: string;
  subtitle?: string;
  ministry?: string;
  fields: {
    name: string;
    label: string;
    section?: string;
    inputType?: 'text' | 'textarea' | 'number' | 'date' | 'radio' | 'checkboxGroup' | 'select' | 'file';
    options?: string[];
    required?: boolean;
    helpText?: string;
    autofillSource?: string;
  }[];
  documents?: string[];
  eligibility?: string[];
  benefits?: string[];
}

interface Grievance {
  id: string;
  description: string;
  category: string;
  digipin: string;
  status: 'Submitted' | 'Under Review' | 'In Progress' | 'Resolved';
  imageCaption?: string;
  submittedAt: string;
}

interface AppState {
  // Auth
  isAuthenticated: boolean;
  userType: UserType;
  role: UserRole;
  login: (name: string, userType: UserType) => void;
  logout: () => void;
  resetSession: () => void;

  // Overlay management
  activeOverlay: OverlayType;
  setOverlay: (overlay: OverlayType) => void;

  // Agent chat
  activeAgent: AgentKey;
  setActiveAgent: (agent: AgentKey) => void;
  chatHistory: Record<AgentKey, ChatMessage[]>;
  addMessage: (agentKey: AgentKey, message: ChatMessage) => void;
  setAgentMessages: (agentKey: AgentKey, messages: ChatMessage[]) => void;
  clearChat: (agentKey: AgentKey) => void;

  // Voice
  isListening: boolean;
  setListening: (val: boolean) => void;
  lastTranscript: string;
  setTranscript: (text: string) => void;

  // Onboarding
  onboardingComplete: boolean;
  completeOnboarding: () => void;

  // User profile (for scheme matching)
  userProfile: {
    name: string;
    digipin: string;
    language: string;
    state: string;
    occupation: string;
    income: number;
  };
  setUserProfile: (profile: Partial<AppState['userProfile']>) => void;

  // Rich citizen profile (post-onboarding)
  citizenProfile: CitizenProfile | null;
  setCitizenProfile: (profile: CitizenProfile) => void;

  // Grievances
  grievances: Grievance[];
  addGrievance: (g: Grievance) => void;

  // Emergency contacts
  addEmergencyContact: (contact: Omit<EmergencyContact, 'id'>) => void;
  removeEmergencyContact: (id: string) => void;

  // Tracked items from chat (auto-added)
  trackedItems: TrackedItem[];
  replaceTrackedItems: (items: TrackedItem[]) => void;
  addTrackedItem: (item: TrackedItem) => void;
  updateTrackedStatus: (id: string, status: TrackedItem['status']) => void;
  enrichTrackedItem: (id: string, patch: Partial<Pick<TrackedItem, 'title' | 'description' | 'status' | 'refId' | 'eta' | 'portal' | 'emoji' | 'neighbourhood' | 'amount'>>) => void;

  // Track tab badge count
  trackBadge: number;
  clearTrackBadge: () => void;

  // Notification count
  notifications: number;
  setNotifications: (n: number) => void;

  // Karma score & Gamification
  karmaScore: number;
  addKarma: (points: number) => void;
  redeemedRewards: string[];
  redeemReward: (cost: number, rewardId: string) => boolean;

  // Global Contextual Form State
  activeForm: ActiveForm | null;
  setActiveForm: (form: ActiveForm | null) => void;
  formData: Record<string, string>;
  setFormData: (data: Record<string, string>) => void;

  // Intelligence: Collective Action clusters
  collectiveClusters: CollectiveCluster[];
  addCluster: (cluster: CollectiveCluster) => void;
  joinCluster: (clusterId: string) => void;
}

export function getUserLevelDescriptor(karma: number) {
  if (karma >= 150) return { title: 'Community Head', color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20', icon: 'stars' };
  if (karma >= 51) return { title: 'Contributor', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20', icon: 'military_tech' };
  return { title: 'Citizen', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20', icon: 'person' };
}

function createEmptyChatHistory(): Record<AgentKey, ChatMessage[]> {
  return {
    nagarik_mitra: [],
    swasthya_sahayak: [],
    yojana_saathi: [],
    arthik_salahkar: [],
    vidhi_sahayak: [],
    kisan_mitra: [],
  };
}

function createDefaultTrackedItems(): TrackedItem[] {
  return [
    { id: 'demo-1', type: 'grievance', title: 'Broken streetlight — Ward 42', description: 'Street lamp near Baharpur post office not working for 3 days', status: 'In Progress', createdAt: Date.now() - 86400000 * 2, agentKey: 'nagarik_mitra', refId: `GRV-NM-${new Date().getFullYear()}-0847`, neighbourhood: 12, emoji: '🔦', portal: 'pgportal.gov.in', eta: '48 hours' },
    { id: 'demo-2', type: 'scheme', title: 'PM-KISAN Installment Pending', description: `${new Date().toLocaleString('default', { month: 'short' })} ${new Date().getFullYear()} installment of ₹2,000 not received`, status: 'Under Review', createdAt: Date.now() - 86400000, agentKey: 'yojana_saathi', refId: `KISAN-TKT-${new Date().getFullYear()}-8821`, emoji: '🌾', portal: 'pmkisan.gov.in', amount: '₹2,000' },
    { id: 'demo-3', type: 'health', title: 'Ayushman Bharat Card Applied', description: 'PMJAY card application submitted via ABHA', status: 'Pending', createdAt: Date.now() - 3600000 * 5, agentKey: 'swasthya_sahayak', refId: `PMJAY-${new Date().getFullYear()}-4421`, emoji: '💊', portal: 'pmjay.gov.in' },
  ];
}

function createDefaultUserProfile(): AppState['userProfile'] {
  return {
    name: '',
    digipin: '',
    language: 'hi',
    state: '',
    occupation: '',
    income: 0,
  };
}

function createLocalResetState() {
  return {
    isAuthenticated: false,
    userType: 'citizen' as UserType,
    role: 'citizen' as UserRole,
    activeOverlay: 'none' as OverlayType,
    activeAgent: 'nagarik_mitra' as AgentKey,
    chatHistory: createEmptyChatHistory(),
    isListening: false,
    lastTranscript: '',
    onboardingComplete: false,
    userProfile: createDefaultUserProfile(),
    citizenProfile: null,
    grievances: [],
    trackedItems: createDefaultTrackedItems(),
    trackBadge: 3,
    notifications: 3,
    karmaScore: 1250,
    redeemedRewards: [],
    activeForm: null,
    formData: {},
    collectiveClusters: [],
  };
}

function postJson(path: string, body: Record<string, unknown>) {
  void fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    // best-effort sync; UI state remains local even if backend is unavailable
  });
}

function persistProfile(state: Pick<AppState, 'userProfile' | 'citizenProfile'>) {
  const userId = buildBackendUserId(state);
  postJson('/api/backend/profiles', {
    userId,
    userProfile: state.userProfile,
    citizenProfile: state.citizenProfile,
  });
}

function persistTrackedItem(state: Pick<AppState, 'trackedItems' | 'userProfile' | 'citizenProfile'>, item: TrackedItem) {
  const userId = buildBackendUserId(state);
  const wardMatch = item.title.match(/ward\s*\d+/i);
  const ward = wardMatch ? wardMatch[0].replace(/^./, (char) => char.toUpperCase()) : undefined;
  const citizenName = state.userProfile?.name?.trim() || undefined;
  if (item.type === 'scheme') {
    postJson('/api/backend/scheme-applications', {
      userId,
      applicationId: item.id,
      schemeName: item.title,
      workflowStage: item.status,
      notes: item.description,
      metadata: {
        refId: item.refId,
        eta: item.eta,
        portal: item.portal,
        neighbourhood: item.neighbourhood,
        amount: item.amount,
        agentKey: item.agentKey,
        citizenName,
        ward,
        district: state.citizenProfile?.district,
        state: state.citizenProfile?.state,
      },
      createdAt: item.createdAt,
    });
    return;
  }

  postJson('/api/backend/cases', {
    userId,
    caseId: item.id,
    category: item.type,
    status: item.status,
    title: item.title,
    description: item.description,
    eta: item.eta,
    metadata: {
      refId: item.refId,
      portal: item.portal,
      neighbourhood: item.neighbourhood,
      amount: item.amount,
      agentKey: item.agentKey,
      citizenName,
      ward,
      district: state.citizenProfile?.district,
      state: state.citizenProfile?.state,
      department:
        item.type === 'grievance'
          ? 'Municipal'
          : item.type === 'health'
            ? 'Health'
            : item.type === 'legal'
              ? 'Legal'
              : item.type === 'finance'
                ? 'Financial'
                : 'Civic',
    },
    createdAt: item.createdAt,
  });
}

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  userType: 'citizen',
  role: 'citizen',
  login: (name, userType) => set((state) => ({
    isAuthenticated: true,
    userType,
    role: getRoleFromKarma(state.karmaScore, userType),
    userProfile: { ...state.userProfile, name },
    onboardingComplete: userType === 'government' ? true : state.onboardingComplete,
  })),
  logout: () => set({ isAuthenticated: false, userType: 'citizen', role: 'citizen', onboardingComplete: false }),
  resetSession: () => set(() => createLocalResetState()),

  onboardingComplete: false,
  completeOnboarding: () => set({ onboardingComplete: true }),

  activeOverlay: 'none',
  setOverlay: (overlay) => set({ activeOverlay: overlay }),

  activeAgent: 'nagarik_mitra',
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  chatHistory: createEmptyChatHistory(),
  addMessage: (agentKey, message) =>
    set((state) => {
      const nextMessages = [...state.chatHistory[agentKey], message];
      const nextState = {
        chatHistory: {
          ...state.chatHistory,
          [agentKey]: nextMessages,
        },
      };

      const userId = buildBackendUserId(state);
      postJson('/api/backend/messages', {
        userId,
        conversationId: buildConversationId(userId, agentKey),
        agentKey,
        role: message.role,
        content: message.content,
        createdAt: message.timestamp,
      });

      return nextState;
    }),
  setAgentMessages: (agentKey, messages) =>
    set((state) => ({
      chatHistory: {
        ...state.chatHistory,
        [agentKey]: messages,
      },
    })),
  clearChat: (agentKey) =>
    set((state) => ({
      chatHistory: {
        ...state.chatHistory,
        [agentKey]: [],
      },
    })),

  isListening: false,
  setListening: (val) => set({ isListening: val }),
  lastTranscript: '',
  setTranscript: (text) => set({ lastTranscript: text }),

  userProfile: createDefaultUserProfile(),
  setUserProfile: (profile) =>
    set((state) => {
      const nextState = { userProfile: { ...state.userProfile, ...profile } };
      persistProfile({ ...state, ...nextState });
      return nextState;
    }),

  citizenProfile: null,
  setCitizenProfile: (profile) =>
    set((state) => {
      const nextState = { citizenProfile: profile };
      persistProfile({ ...state, ...nextState });
      return nextState;
    }),

  grievances: [],
  addGrievance: (g) => set((state) => ({ grievances: [...state.grievances, g] })),

  addEmergencyContact: (contact) => set((state) => {
    const newContact: EmergencyContact = { ...contact, id: `ec-${Date.now()}` };
    const profile = state.citizenProfile;
    if (!profile) return {};
    const nextState = { citizenProfile: { ...profile, emergencyContacts: [...(profile.emergencyContacts || []), newContact] } };
    persistProfile({ ...state, ...nextState });
    return nextState;
  }),
  removeEmergencyContact: (id) => set((state) => {
    const profile = state.citizenProfile;
    if (!profile) return {};
    const nextState = { citizenProfile: { ...profile, emergencyContacts: (profile.emergencyContacts || []).filter(c => c.id !== id) } };
    persistProfile({ ...state, ...nextState });
    return nextState;
  }),

  trackedItems: createDefaultTrackedItems(),
  replaceTrackedItems: (items) => set(() => ({
    trackedItems: items,
    trackBadge: 0,
  })),
  addTrackedItem: (item) => set((state) => {
    const nextState = {
      trackedItems: [item, ...state.trackedItems],
      trackBadge: state.trackBadge + 1,
      karmaScore: state.karmaScore + 50,
    };
    persistTrackedItem({ ...state, ...nextState }, item);
    return nextState;
  }),
  updateTrackedStatus: (id, status) => set((state) => {
    const nextItems = state.trackedItems.map(t => t.id === id ? { ...t, status } : t);
    const updatedItem = nextItems.find((item) => item.id === id);
    if (updatedItem) {
      persistTrackedItem({ ...state, trackedItems: nextItems }, updatedItem);
    }
    return { trackedItems: nextItems };
  }),
  enrichTrackedItem: (id, patch) => set((state) => {
    const nextItems = state.trackedItems.map(t => t.id === id ? { ...t, ...patch } : t);
    const updatedItem = nextItems.find((item) => item.id === id);
    if (updatedItem) {
      persistTrackedItem({ ...state, trackedItems: nextItems }, updatedItem);
    }
    return { trackedItems: nextItems };
  }),

  trackBadge: 3, // matches 3 seeded demo trackedItems
  clearTrackBadge: () => set({ trackBadge: 0 }),

  notifications: 3, // Initial mock count
  setNotifications: (n) => set({ notifications: n }),

  karmaScore: 1250,
  addKarma: (points) => set((state) => {
    const newKarma = state.karmaScore + points;
    return { karmaScore: newKarma, role: getRoleFromKarma(newKarma, state.userType) };
  }),
  
  redeemedRewards: [],
  redeemReward: (cost, rewardId) => {
    let success = false;
    set((state) => {
      if (state.karmaScore >= cost && !state.redeemedRewards.includes(rewardId)) {
        success = true;
        return { 
          karmaScore: state.karmaScore - cost, 
          redeemedRewards: [...state.redeemedRewards, rewardId] 
        };
      }
      return state;
    });
    return success;
  },

  activeForm: null,
  setActiveForm: (form) => set({ activeForm: form }),
  formData: {},
  setFormData: (data) => set({ formData: data }),

  collectiveClusters: [],
  addCluster: (cluster) => set((state) => ({ collectiveClusters: [cluster, ...state.collectiveClusters] })),
  joinCluster: (clusterId) => set((state) => ({
    collectiveClusters: state.collectiveClusters.map(c => c.clusterId === clusterId ? { ...c, participantCount: c.participantCount + 1 } : c),
    karmaScore: state.karmaScore + 5, // karma for collective action
  })),
}));
