// Map of all Stitch screens
export const SCREENS = {
  home: { file: '/screens/home.html?v=5', label: 'Home', icon: 'home', tab: 'home' },
  voice: { file: '/screens/voice.html', label: 'Voice', icon: 'mic', tab: 'voice' },
  civic: { file: '/screens/civic.html', label: 'Nagarik Mitra', icon: 'account_balance', tab: 'services' },
  health: { file: '/screens/health.html', label: 'Swasthya Sahayak', icon: 'health_and_safety', tab: 'services' },
  welfare: { file: '/screens/welfare.html?v=4', label: 'Yojana Saathi', icon: 'volunteer_activism', tab: 'services' },
  finance: { file: '/screens/finance.html', label: 'Arthik Salahkar', icon: 'account_balance_wallet', tab: 'services' },
  legal: { file: '/screens/legal.html', label: 'Vidhi Sahayak', icon: 'gavel', tab: 'services' },
  'kisan-mitra': { file: '', label: 'Kisan Mitra', icon: 'agriculture', tab: 'services' },
  cases: { file: '/screens/cases.html', label: 'Track Cases', icon: 'folder_shared', tab: 'track' },
  sos: { file: '/screens/sos.html', label: 'Emergency SOS', icon: 'emergency', tab: 'sos' },
  'help-neighbour': { file: '', label: 'Document Explainer', icon: 'description', tab: 'services' },
  'scheme-scanner': { file: '/screens/scheme-scanner.html?v=4', label: 'Scheme Scanner', icon: 'qr_code_scanner', tab: 'services' },
  'xray-tracker': { file: '/screens/xray-tracker.html', label: 'Scheme Tracker', icon: 'track_changes', tab: 'track' },
  community: { file: '/screens/community.html?v=4', label: 'Community Impact', icon: 'groups', tab: 'community' },
  karma: { file: '/screens/karma.html?v=2', label: 'Civic Karma', icon: 'military_tech', tab: 'community' },
  profile: { file: '', label: 'Profile', icon: 'person', tab: 'profile' },
} as const;

export type ScreenKey = keyof typeof SCREENS;
