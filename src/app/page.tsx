'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import BottomNav from '@/components/BottomNav';
import GovBottomNav, { type GovTab } from '@/components/GovBottomNav';
import ScreenDrawer from '@/components/ScreenDrawer';
import Onboarding from '@/components/Onboarding';
import AgentChat from '@/components/AgentChat';
import GrievanceForm from '@/components/GrievanceForm';
import SchemeScanner from '@/components/SchemeScanner';
import HelpNeighbourOverlay from '@/components/HelpNeighbourOverlay';
import VoiceAssistant from '@/components/VoiceAssistant';
import ImpactDashboard from '@/components/ImpactDashboard';
import DigipinLocator from '@/components/DigipinLocator';
import EmergencyContactsManager from '@/components/EmergencyContactsManager';
import GovDashboard from '@/components/GovDashboard';
import GovCaseManagement from '@/components/GovCaseManagement';
import GovAnalytics from '@/components/GovAnalytics';
import GovAlerts from '@/components/GovAlerts';
import GovAdmin from '@/components/GovAdmin';
import CivicDigitalTwin from '@/components/CivicDigitalTwin';
import SOSHardwareTrigger from '@/components/SOSHardwareTrigger';
import SOSButton from '@/components/SOSButton';
import { SCREENS, type ScreenKey } from '@/lib/screens';
import { translations } from '@/lib/i18n/translations';
import { useAppStore, type AgentKey } from '@/lib/store';
import TrackCasesOverlay from '@/components/TrackCasesOverlay';
import ProfileTab from '@/components/ProfileTab';
import SchemeScannerScreen from '@/components/screens/SchemeScanner';
import BureaucracyXRay from '@/components/screens/BureaucracyXRay';
import CivicKarma from '@/components/screens/CivicKarma';
import KisanMitraScreen from '@/components/screens/KisanMitra';
import { FlagStripe } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { buildBackendUserId } from '@/lib/backend-identity';

const TRANSLATOR_SAFE_LANGS = new Set([
  'en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur', 'ne',
]);

type CitizenAlert = {
  id: string;
  message: string;
  category: string;
  priority: string;
  createdAt: number;
  source?: string;
};

function getTranslatorTargetLang(lang: string): string {
  if (TRANSLATOR_SAFE_LANGS.has(lang)) return lang;
  if (lang === 'kok') return 'mr';
  if (lang === 'ks') return 'ur';
  return 'hi';
}

function getAlertIcon(category: string) {
  if (category === 'health') return 'vaccines';
  if (category === 'schemes') return 'agriculture';
  if (category === 'emergency') return 'warning';
  return 'campaign';
}

function formatAlertTime(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function HomePage() {
  const [activeScreen, setActiveScreen] = useState<ScreenKey>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [govTab, setGovTab] = useState<GovTab>('home');
  const [profileEmergencyFocusToken, setProfileEmergencyFocusToken] = useState(0);
  const [citizenAssistantNudge, setCitizenAssistantNudge] = useState('');
  const [citizenNudgeDismissed, setCitizenNudgeDismissed] = useState(false);
  const [citizenAlerts, setCitizenAlerts] = useState<CitizenAlert[]>([]);
  const [dismissedCitizenAlertIds, setDismissedCitizenAlertIds] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const profileHydratedRef = useRef(false);

  const { activeOverlay, setOverlay, setActiveAgent, setTranscript, onboardingComplete, userProfile, citizenProfile, trackedItems, karmaScore, isAuthenticated, userType, logout, setCitizenProfile, setUserProfile, setNotifications } = useAppStore();
  const { t, lang } = useTranslation();

  const navigateTo = useCallback((screen: ScreenKey) => {
    setActiveScreen(screen);
    setDrawerOpen(false);
  }, []);

  const openAgentChat = useCallback((agent: AgentKey) => {
    setActiveAgent(agent);
    setOverlay('agent-chat');
  }, [setActiveAgent, setOverlay]);

  // Inject bridge script + nav hider CSS into iframe
  const injectBridge = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument?.head) return;
      const doc = iframe.contentDocument;

      // CSS: hide Stitch bottom nav
      if (!doc.getElementById('setu-nav-hider')) {
        const style = doc.createElement('style');
        style.id = 'setu-nav-hider';
        style.textContent = `
          nav { display: none !important; }
          div[class*="sticky"][class*="top-0"] { display: none !important; }
          div[class*="app-header"], div[class*="AppHeader"] { display: none !important; }
          div[class*="bottom-0"][class*="border-t"] { display: none !important; }
          div[class*="bottom-0"][class*="bg-white"] { display: none !important; }
          div[class*="bottom-0"][class*="bg-gray"] { display: none !important; }
          div[class*="bottom-0"][class*="bg-surface"] { display: none !important; }
          .absolute.bottom-0 { display: none !important; }
          body > div > div:last-child { padding-bottom: 80px !important; }
          .flex-1.overflow-y-auto, main { padding-bottom: 100px !important; }
          body { min-height: 100% !important; margin: 0 !important; }
        `;
        doc.head.appendChild(style);
      }

      // JS: inject bridge script for postMessage relay
      if (!doc.getElementById('setu-bridge')) {
        const script = doc.createElement('script');
        script.id = 'setu-bridge';
        script.src = '/bridge.js';
        doc.body.appendChild(script);
      }

      // Push user profile data directly into iframe DOM (same-origin)
      try {
        const firstName = userProfile.name ? userProfile.name.split(' ')[0] : 'नागरिक';
        const greetPrefix = t('namasteGreeting', 'Namaste');
        const greetEl = doc.getElementById('user-greeting') as HTMLElement | null;
        if (greetEl) greetEl.textContent = `${greetPrefix}, ${firstName}!`;
        const dpEl = doc.getElementById('digipin-display') as HTMLElement | null;
        if (dpEl && userProfile.digipin) dpEl.textContent = userProfile.digipin;
        const dateEl = doc.getElementById('current-date') as HTMLElement | null;
        if (dateEl) {
          const d = new Date();
          const loc = lang === 'hi' ? 'hi-IN' : lang === 'en' ? 'en-IN' : `${lang}-IN`;
          dateEl.textContent = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short' });
        }
      } catch { /* ignore sub-DOM errors */ }

      // Also notify via postMessage so the HTML-side listener fires too
      // Use live store karmaScore — incremented by addKarma / addTrackedItem
      const karmaTiers = [
        { min: 2000, label: 'Setu Hero', next: 9999, nextName: 'Legend' },
        { min: 1000, label: 'Gold Citizen', next: 2000, nextName: 'Hero' },
        { min: 400, label: 'Silver Citizen', next: 1000, nextName: 'Gold' },
        { min: 0, label: 'Naya Nagarik', next: 400, nextName: 'Silver' },
      ];
      const karmaTierInfo = karmaTiers.find(t => karmaScore >= t.min) ?? karmaTiers[3];
      const karmaProgress = Math.min(100, Math.round((karmaScore / karmaTierInfo.next) * 100));
      const streakDays = Math.min(30, Math.max(1, trackedItems.filter(i => i.status === 'Resolved').length * 3 + trackedItems.length));
      const karmaRank = Math.max(1, Math.ceil((1500 - karmaScore) / 10));
      iframe.contentWindow?.postMessage(
        {
          source: 'bharat-setu-parent',
          action: 'user-update',
          name: userProfile.name,
          digipin: userProfile.digipin,
          greetingPrefix: t('namasteGreeting', 'Namaste'),
          district: citizenProfile?.district ?? '',
          state: citizenProfile?.state ?? '',
          income: citizenProfile?.income != null ? String(citizenProfile.income) : '',
          occupation: citizenProfile?.occupation ?? '',
          rationCardType: citizenProfile?.rationCardType ?? '',
          trackedCount: trackedItems.length,
          karmaScore,
          karmaTier: karmaTierInfo.label,
          karmaProgress,
          karmaNextTier: karmaTierInfo.nextName,
          karmaNextThreshold: karmaTierInfo.next,
          streakDays,
          karmaRank,
        },
        '*',
      );

        const activeLangDict = translations[lang] || translations['en'];

      // Send translated dashboard strings to iframe
      iframe.contentWindow?.postMessage(
        {
          source: 'bharat-setu-parent',
          action: 'apply-translations',
          translations: {
            ...activeLangDict,
            greeting: t('namasteGreeting', 'Namaste'),
            helpToday: t('helpToday', 'How can we help today?'),
            tapToSpeak: t('tapToSpeak', 'Tap to Speak / बोलें'),
            allLangsSupported: t('allLangsSupported', 'All 22 official languages supported'),
            councilTitle: t('councilTitle', 'Council of Five Agents'),
            viewAll: t('viewAll', 'View All'),
            agentNM: t('agentNM', 'Nagarik Mitra'),
            agentNMSub: t('agentNMSub', 'Civic Services'),
            agentSS: t('agentSS', 'Swasthya Sahayak'),
            agentSSSub: t('agentSSSub', 'Health & Care'),
            agentYS: t('agentYS', 'Yojana Saathi'),
            agentYSSub: t('agentYSSub', 'Welfare Schemes'),
            agentAS: t('agentAS', 'Arthik Salahkar'),
            agentASSub: t('agentASSub', 'Finance & Loans'),
            agentVS: t('agentVS', 'Vidhi Sahayak'),
            agentVSSub: t('agentVSSub', 'Legal Aid & Rights'),
            isroActive: t('isroActive', 'ISRO DIGIPIN Active'),
            digipinPrecision: t('digipinPrecision', 'Precision: 4x4m Grid • Tap to Know Your DIGIPIN 📮'),
            navHome: t('navHome', 'Home'),
            navSchemes: t('navSchemes', 'Schemes'),
            navScan: t('navScan', 'Scan'),
            navDocs: t('navDocs', 'Docs'),
            navProfile: t('navProfile', 'Profile'),
          },
        },
        '*',
      );

      // Direct DOM injection for all screens (same-origin fallback)
      try {
        const d = doc;
        const dist = citizenProfile?.district ?? '';
        const st = citizenProfile?.state ?? '';
        const fullLoc = dist && st ? `${dist}, ${st}` : dist || st;
        const firstName = userProfile.name ? userProfile.name.split(' ')[0] : '\u0928\u093e\u0917\u0930\u093f\u0915';
        // welfare
        const wg = d.getElementById('welfare-greeting') as HTMLElement | null;
        if (wg) wg.textContent = `${t('namasteGreeting', 'Namaste')}, ${firstName}! \uD83D\uDE4F`;
        const wob = d.getElementById('welfare-occupation-badge') as HTMLElement | null;
        if (wob && citizenProfile?.occupation) wob.textContent = citizenProfile.occupation.split('(')[0].trim();
        const wlb = d.getElementById('welfare-location-badge') as HTMLElement | null;
        if (wlb && st) wlb.textContent = `Rural (${st.substring(0, 2).toUpperCase()})`;
        // scheme-scanner
        const sn = d.getElementById('scheme-user-name') as HTMLElement | null;
        if (sn && userProfile.name) sn.textContent = userProfile.name;
        const sl = d.getElementById('scheme-location') as HTMLElement | null;
        if (sl && fullLoc) sl.textContent = fullLoc;
        const si = d.getElementById('scheme-income') as HTMLElement | null;
        if (si && citizenProfile?.income != null) si.textContent = `\u20B9${citizenProfile.income}/yr`;
        const so = d.getElementById('scheme-occupation') as HTMLElement | null;
        if (so && citizenProfile?.occupation) so.textContent = citizenProfile.occupation;
        const sc = d.getElementById('scheme-category') as HTMLElement | null;
        if (sc && citizenProfile?.rationCardType) sc.textContent = citizenProfile.rationCardType;
        // health
        const hname = d.getElementById('health-abha-name') as HTMLElement | null;
        if (hname && userProfile.name) hname.textContent = userProfile.name;
        const sosContact = d.getElementById('sos-emergency-contact') as HTMLElement | null;
        if (sosContact && userProfile.name) sosContact.textContent = `${userProfile.name.split(' ')[0]} (परिवार)`;
        // community
        const cdt = d.getElementById('community-district-title') as HTMLElement | null;
        if (cdt && fullLoc) cdt.textContent = fullLoc;
        const cc = d.getElementById('community-contributions') as HTMLElement | null;
        if (cc) cc.textContent = `${trackedItems?.length ?? 3} Grievances`;
        // karma
        const kdb = d.getElementById('karma-district-badge') as HTMLElement | null;
        if (kdb && dist) kdb.textContent = `${dist} District`;
        const kt = d.getElementById('karma-total') as HTMLElement | null;
        if (kt) kt.textContent = karmaScore.toLocaleString('en-IN');
        const ktier = d.getElementById('karma-tier') as HTMLElement | null;
        if (ktier) ktier.textContent = karmaTierInfo.label;
        const klt = d.getElementById('karma-leaderboard-title') as HTMLElement | null;
        if (klt && dist) klt.textContent = `${dist} District`;
        const kyn = d.getElementById('karma-you-name') as HTMLElement | null;
        if (kyn) kyn.textContent = firstName;
        const kyt = d.getElementById('karma-you-tier') as HTMLElement | null;
        if (kyt) kyt.textContent = karmaTierInfo.label;
        const kys = d.getElementById('karma-you-score') as HTMLElement | null;
        if (kys) kys.textContent = karmaScore.toLocaleString('en-IN');
        const kpt = d.getElementById('karma-progress-text') as HTMLElement | null;
        if (kpt) kpt.textContent = `${karmaScore} / ${karmaTierInfo.next} to ${karmaTierInfo.nextName}`;
        const kpb = d.getElementById('karma-progress-bar') as HTMLElement | null;
        if (kpb) (kpb as HTMLElement).style.width = `${karmaProgress}%`;
        const kbd = d.getElementById('karma-banner-district') as HTMLElement | null;
        if (kbd && dist) kbd.textContent = dist;
        // civic initials
        const civicInit = d.getElementById('civic-user-initials') as HTMLElement | null;
        if (civicInit && userProfile.name) {
          const parts = userProfile.name.trim().split(/\s+/);
          civicInit.textContent = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
        }
        const kur = d.getElementById('karma-user-rank') as HTMLElement | null;
        if (kur) kur.textContent = `#${karmaRank}`;
        const kstreakEl = d.getElementById('karma-streak') as HTMLElement | null;
        if (kstreakEl) kstreakEl.textContent = String(streakDays);
      } catch { /* ignore DOM errors */ }
    } catch {
      // cross-origin fallback - silently ignore
    }
  }, [userProfile, citizenProfile, trackedItems, karmaScore, lang, t]);

  // Reload bridge on screen change
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handler = () => injectBridge();
    iframe.addEventListener('load', handler);
    injectBridge();
    return () => iframe.removeEventListener('load', handler);
  }, [activeScreen, injectBridge]);

  // Re-push profile whenever name / digipin changes (e.g. after persona selection)
  useEffect(() => {
    if (userProfile.name || userProfile.digipin) {
      const t = setTimeout(() => injectBridge(), 100);
      return () => clearTimeout(t);
    }
  }, [userProfile.name, userProfile.digipin, injectBridge]);

  // Sync HTML lang attribute for screen-reader / TTS accessibility
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (userType !== 'citizen' || !onboardingComplete) return;

    let mounted = true;
    const controller = new AbortController();

    const loadCitizenNudge = async () => {
      try {
        const response = await fetch('/api/backend/civic-twin-graph?topK=1', { signal: controller.signal });
        if (!response.ok) return;

        const data = (await response.json()) as {
          citizenAssistant?: {
            nudges?: string[];
          };
        };

        const nudge = data?.citizenAssistant?.nudges?.[0];
        if (!mounted || !nudge) return;

        let localizedNudge = nudge;
        if (lang !== 'en') {
          try {
            const targetLang = getTranslatorTargetLang(lang);
            const translateResponse = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: nudge,
                sourceLang: 'en',
                targetLang,
              }),
              signal: controller.signal,
            });

            if (translateResponse.ok) {
              const translatedData = (await translateResponse.json()) as {
                translated?: string;
              };
              if (translatedData.translated?.trim()) {
                localizedNudge = translatedData.translated;
              }
            }
          } catch {
            // keep original nudge on translation failure
          }
        }

        if (mounted) {
          setCitizenAssistantNudge(localizedNudge);
          setCitizenNudgeDismissed(false);
        }
      } catch {
        // keep UI clean if assistant endpoint is unavailable
      }
    };

    void loadCitizenNudge();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [lang, onboardingComplete, userType]);

  useEffect(() => {
    if (userType !== 'citizen' || !onboardingComplete) return;

    let mounted = true;

    const loadCitizenAlerts = async () => {
      try {
        const response = await fetch('/api/backend/citizen-alerts?limit=4&sinceHours=120');
        if (!response.ok) return;

        const data = (await response.json()) as { alerts?: CitizenAlert[] };
        if (!mounted || !Array.isArray(data.alerts)) return;

        setCitizenAlerts(data.alerts.slice(0, 4));
      } catch {
        // keep citizen home clean when alert feed is unavailable
      }
    };

    void loadCitizenAlerts();
    const intervalId = window.setInterval(() => {
      void loadCitizenAlerts();
    }, 60000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [onboardingComplete, userType]);

  useEffect(() => {
    if (userType !== 'citizen') return;
    const unreadAlerts = citizenAlerts.filter((alert) => !dismissedCitizenAlertIds.includes(alert.id)).length;
    setNotifications(unreadAlerts);
  }, [citizenAlerts, dismissedCitizenAlertIds, setNotifications, userType]);

  useEffect(() => {
    if (!onboardingComplete || userType !== 'citizen' || profileHydratedRef.current) return;
    profileHydratedRef.current = true;

    const loadProfile = async () => {
      try {
        const state = useAppStore.getState();
        const userId = buildBackendUserId(state);
        const response = await fetch(`/api/backend/profiles?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) return;

        const data = await response.json() as {
          found?: boolean;
          profile?: {
            userProfile?: typeof userProfile;
            citizenProfile?: typeof citizenProfile;
          } | null;
        };

        if (!data.found || !data.profile) return;
        if (data.profile.userProfile) setUserProfile(data.profile.userProfile);
        if (data.profile.citizenProfile) setCitizenProfile(data.profile.citizenProfile);
      } catch {
        // continue with local profile state if backend is unavailable
      }
    };

    void loadProfile();
  }, [onboardingComplete, setCitizenProfile, setUserProfile, userType, userProfile]);

  // Listen for postMessage from iframe bridge
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== 'bharat-setu-iframe') return;

      switch (data.action) {
        case 'open-overlay':
          if (data.overlay === 'voice') setOverlay('voice');
          else if (data.overlay === 'grievance') setOverlay('grievance');
          else if (data.overlay === 'scheme-scanner') setOverlay('scheme-scanner');
          else if (data.overlay === 'scam-alert') setOverlay('scam-alert');
          else if (data.overlay === 'digipin') setOverlay('digipin');
          else if (data.overlay === 'emergency-contacts') setOverlay('emergency-contacts');
          break;

        case 'open-agent-chat':
          if (data.agent) openAgentChat(data.agent as AgentKey);
          break;

        case 'sos-location':
          // iframe captured GPS — update store DIGIPIN
          if (data.digipin) useAppStore.getState().setUserProfile({ digipin: data.digipin });
          break;

        case 'navigate':
          if (data.screen && SCREENS[data.screen as ScreenKey]) {
            navigateTo(data.screen as ScreenKey);
          }
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setOverlay, openAgentChat, navigateTo]);

  useEffect(() => {
    if (userType !== 'citizen') return;
    if (activeOverlay === 'emergency-contacts') {
      setOverlay('none');
      navigateTo('profile');
      setProfileEmergencyFocusToken((value) => value + 1);
    }
  }, [activeOverlay, navigateTo, setOverlay, userType]);

  // Listen for custom events from components
  useEffect(() => {
    const handleStartApplication = (e: Event) => {
      const customEvent = e as CustomEvent;
      const schemeName = customEvent.detail?.schemeName;

      // Close any active overlay (like scheme scanner)
      setOverlay('none');

      // Open the welfare agent after a slight delay
      setTimeout(() => {
        openAgentChat('yojana_saathi');

        // Wait for chat to open, then inject the initial message
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('inject-chat-message', {
              detail: { message: `I want to apply for the ${schemeName} scheme. Please guide me through the application process step by step.` }
            })
          );
        }, 500);
      }, 300);
    };

    window.addEventListener('start-scheme-application', handleStartApplication);
    return () => window.removeEventListener('start-scheme-application', handleStartApplication);
  }, [setOverlay, openAgentChat]);

  // Determine active tab from screen
  const activeTab = SCREENS[activeScreen]?.tab || 'home';
  const visibleCitizenAlerts = citizenAlerts.filter((alert) => !dismissedCitizenAlertIds.includes(alert.id));
  const topCitizenAlert = visibleCitizenAlerts[0];
  const showCitizenNudge =
    activeScreen === 'home' && activeOverlay === 'none' && Boolean(citizenAssistantNudge) && !citizenNudgeDismissed;

  return (
    <div className="relative w-full h-[100dvh] max-w-[430px] mx-auto overflow-hidden bg-slate-50 dark:bg-navy">

      {/* Global SOS Hardware Trigger — only when authenticated */}
      {isAuthenticated && <SOSHardwareTrigger />}

      {/* GoI Brand Bar — different for government */}
      {userType === 'government' ? (
        <div className="w-full bg-white dark:bg-[#050d1a] z-30 relative">
          <div className="w-full h-[3px] flex">
            <div className="flex-1 bg-[#138808]" />
            <div className="flex-1 bg-black/10 dark:bg-white/20" />
            <div className="flex-1 bg-[#138808]" />
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-[#050d1a]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#138808]/15 dark:bg-[#138808]/20 border border-[#138808]/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#138808] text-lg">shield</span>
              </div>
              <div>
                <div className="text-base font-black text-slate-900 dark:text-white tracking-wider leading-tight">{t('bharatSetu', 'Bharat Setu')}</div>
                <div className="text-[9px] text-[#138808] tracking-widest font-bold uppercase">{t('govAdminPanel', 'Government Admin Panel')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {isAuthenticated && (
                <button onClick={logout} className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors" title={t('logout', 'Logout')}>
                  <span className="material-symbols-outlined text-[16px] text-red-400">logout</span>
                </button>
              )}
              <div className="text-[9px] text-right">
                <div className="text-[#138808] font-bold text-sm">{t('janSeva', 'Jan Seva')}</div>
                <div className="text-slate-500 dark:text-gray-400">{t('districtMagistrate', 'District Magistrate')}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full bg-slate-50 dark:bg-navy z-30 relative">
          <FlagStripe thick />
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-[#071020]">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Bharat Setu Logo" width={32} height={32} className="w-8 h-8 drop-shadow-sm" />
              <div>
                <div className="text-base font-black text-slate-900 dark:text-white tracking-wider leading-tight">{t('bharatSetu', 'Bharat Setu')}</div>
                <div className="text-[9px] text-[#5b8def] tracking-widest font-medium uppercase">{t('bharatSetuDigitalIndia', 'Bharat Setu · Digital India')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {isAuthenticated && (
                <button onClick={logout} className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors" title={t('logout', 'Logout')}>
                  <span className="material-symbols-outlined text-[16px] text-red-400">logout</span>
                </button>
              )}
              <div className="text-[9px] text-slate-500 dark:text-gray-400 text-right">
                <div className="text-[#FF9933] font-bold text-sm">{t('satyamevaJayate', 'Satyameva Jayate')}</div>
                <div>{t('govtOfIndia', 'Govt. of India')}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Onboarding — shown on first launch */}
      {!onboardingComplete && <Onboarding />}

      {/* ═══ CONTENT AREA — different for Government vs Citizen ═══ */}
      {userType === 'government' ? (
        /* Government: full-screen dashboard replaces iframe */
        <div style={{ height: 'calc(100dvh - 72px - 58px)' }} className="bg-slate-50 dark:bg-[#050d1a]">
          {govTab === 'home' && <GovDashboard />}
          {govTab === 'cases' && <GovCaseManagement />}
          {govTab === 'analytics' && <GovAnalytics />}
          {govTab === 'twin' && <CivicDigitalTwin />}
          {govTab === 'alerts' && <GovAlerts />}
          {govTab === 'admin' && <GovAdmin />}
        </div>
      ) : (
        /* Citizen: existing iframe + profile layout */
        <>
          {activeScreen === 'profile' && (
            <div style={{ height: 'calc(100dvh - 72px - 58px)' }}>
              <ProfileTab focusEmergencyContactsToken={profileEmergencyFocusToken} />
            </div>
          )}
          {activeScreen === 'scheme-scanner' && (
            <div style={{ height: 'calc(100dvh - 72px - 58px)' }} className="absolute inset-x-0 bottom-[72px] z-10 bg-slate-50 dark:bg-[#071020]">
              <SchemeScannerScreen />
            </div>
          )}
          {activeScreen === 'xray-tracker' && (
            <div style={{ height: 'calc(100dvh - 72px - 58px)' }} className="absolute inset-x-0 bottom-[72px] z-10 bg-slate-50 dark:bg-[#071020]">
              <BureaucracyXRay />
            </div>
          )}
          {activeScreen === 'karma' && (
            <div style={{ height: 'calc(100dvh - 72px - 58px)' }} className="absolute inset-x-0 bottom-[72px] z-10 bg-slate-50 dark:bg-[#071020]">
              <CivicKarma />
            </div>
          )}
          {activeScreen === 'kisan-mitra' && (
            <div style={{ height: 'calc(100dvh - 72px - 58px)' }} className="absolute inset-x-0 bottom-[72px] z-10 bg-slate-50 dark:bg-[#071020]">
              <KisanMitraScreen />
            </div>
          )}
          {activeScreen === 'help-neighbour' && (
            <div style={{ height: 'calc(100dvh - 72px - 58px)' }} className="absolute inset-x-0 bottom-[72px] z-10 bg-slate-50 dark:bg-[#071020]">
              <HelpNeighbourOverlay 
                onClose={() => navigateTo('home')} 
                onRouteGrievance={(text) => {
                  setTranscript(text);
                  navigateTo('home');
                  setActiveAgent('nagarik_mitra');
                  setTimeout(() => setOverlay('agent-chat'), 150);
                }}
              />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={SCREENS[activeScreen as ScreenKey]?.file || ''}
            className={`w-full h-full border-0 bg-slate-50 dark:bg-navy transition-colors duration-300 ${['profile', 'scheme-scanner', 'xray-tracker', 'karma', 'kisan-mitra', 'help-neighbour'].includes(activeScreen) ? 'hidden' : 'block'}`}
            title={SCREENS[activeScreen]?.label || 'App Content'}
            style={{ height: 'calc(100dvh - 72px - 58px)' }}
          />
        </>
      )}

      {/* Bottom Navigation — different for government */}
      {userType === 'government' ? (
        <GovBottomNav
          activeTab={govTab}
          onNavigate={(tab) => {
            if (tab === 'cases') useAppStore.getState().clearTrackBadge();
            setGovTab(tab);
          }}
        />
      ) : (
        <>
          {activeScreen === 'home' && activeOverlay === 'none' && topCitizenAlert && (
            <div className={`absolute left-2 right-2 z-20 ${showCitizenNudge ? 'bottom-[108px]' : 'bottom-[64px]'}`}>
              <div className="bg-red-50/95 dark:bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-red-500 shrink-0">{getAlertIcon(topCitizenAlert.category)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-red-700 dark:text-red-300 truncate">{t('publicAlert', 'Public Alert')}</p>
                  <p className="text-[10px] text-red-700/90 dark:text-red-200 leading-tight truncate">{topCitizenAlert.message}</p>
                  <p className="text-[9px] text-red-600/70 dark:text-red-300/80">{t(formatAlertTime(topCitizenAlert.createdAt), formatAlertTime(topCitizenAlert.createdAt))}</p>
                </div>
                <button
                  onClick={() => {
                    setDismissedCitizenAlertIds((prev) => [...prev, topCitizenAlert.id]);
                  }}
                  className="ml-auto text-red-400 hover:text-red-600 dark:hover:text-red-200 transition-colors"
                  aria-label={t('dismiss', 'Dismiss')}
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </div>
          )}



          <ScreenDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onNavigate={(screen) => {
              const agentScreenMap: Record<string, AgentKey> = {
                civic: 'nagarik_mitra',
                health: 'swasthya_sahayak',
                welfare: 'yojana_saathi',
                finance: 'arthik_salahkar',
                legal: 'vidhi_sahayak',
              };
              if (agentScreenMap[screen]) {
                openAgentChat(agentScreenMap[screen]);
                setDrawerOpen(false);
              } else if (screen === 'help-neighbour') {
                navigateTo('help-neighbour');
                setDrawerOpen(false);
              } else if (screen === 'scheme-scanner') {
                setOverlay('scheme-scanner');
                setDrawerOpen(false);
              } else {
                navigateTo(screen);
                setDrawerOpen(false);
              }
            }}
            activeScreen={activeScreen}
          />
          <BottomNav
            activeTab={activeTab}
            onNavigate={(screen) => {
              if (screen === 'community') {
                setOverlay('impact');
              } else if (screen === 'sos') {
                setOverlay('sos-active');
              } else if (screen === 'cases') {
                useAppStore.getState().clearTrackBadge();
                setOverlay('track');
              } else {
                navigateTo(screen);
              }
            }}
            onServicesOpen={() => setDrawerOpen(!drawerOpen)}
          />
        </>
      )}

      {/* ===== OVERLAY SYSTEM ===== */}

      {/* Agent Chat */}
      {activeOverlay === 'agent-chat' && (
        <AgentChat onClose={() => setOverlay('none')} />
      )}

      {/* Grievance Filing */}
      {activeOverlay === 'grievance' && (
        <GrievanceForm onClose={() => setOverlay('none')} />
      )}

      {/* Scheme Scanner */}
      {activeOverlay === 'scheme-scanner' && (
        <SchemeScanner onClose={() => setOverlay('none')} />
      )}

      {/* Help Neighbour Document Assistant */}
      {activeOverlay === 'help-neighbour' && (
        <HelpNeighbourOverlay
          onClose={() => setOverlay('none')}
          onRouteGrievance={(text) => {
            const { setTranscript } = useAppStore.getState();
            setTranscript(text);
            setOverlay('none');
            setActiveAgent('nagarik_mitra');
            setTimeout(() => setOverlay('agent-chat'), 150);
          }}
        />
      )}

      {/* Voice Assistant */}
      {activeOverlay === 'voice' && (
        <VoiceAssistant
          onClose={() => setOverlay('none')}
          onOpenChat={(agent) => {
            setOverlay('none');
            setTimeout(() => openAgentChat(agent), 50);
          }}
        />
      )}

      {/* SOS Overlay */}
      {activeOverlay === 'sos-active' && (
        <SOSButton onClose={() => setOverlay('none')} />
      )}

      {/* Track Cases */}
      {activeOverlay === 'track' && (
        <TrackCasesOverlay
          onClose={() => setOverlay('none')}
          onOpenGrievance={() => { setOverlay('none'); setTimeout(() => setOverlay('grievance'), 100); }}
          onOpenAgent={(agent) => { setOverlay('none'); setTimeout(() => openAgentChat(agent), 100); }}
        />
      )}

      {/* Impact Dashboard */}
      {activeOverlay === 'impact' && (
        <ImpactDashboard onClose={() => setOverlay('none')} />
      )}

      {/* DIGIPIN Locator */}
      {activeOverlay === 'digipin' && (
        <DigipinLocator
          onClose={() => setOverlay('none')}
          onUseInQuery={(digipin) => {
            setOverlay('none');
            // Store DIGIPIN and open civic agent with context
            const { setUserProfile } = useAppStore.getState();
            if (digipin) setUserProfile({ digipin });
            setTimeout(() => openAgentChat('nagarik_mitra'), 200);
          }}
        />
      )}

      {/* Emergency Contacts Manager */}
      {activeOverlay === 'emergency-contacts' && (
        <EmergencyContactsManager onClose={() => setOverlay('none')} />
      )}

      {/* Scam Alert Overlay */}
      {activeOverlay === 'scam-alert' && (
        <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto transition-colors duration-300" style={{ animation: 'slideUp 0.3s ease-out' }}>
          <FlagStripe />
          <div className="flex items-center gap-3 px-4 py-3 bg-red-600/20 border-b border-red-500/30">
            <button onClick={() => setOverlay('none')} className="p-1">
              <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
            </button>
            <div className="flex-1 text-center">
              <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">warning</span>
                {t('scamAlertSystem', 'Scam Alert System')}
              </h2>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
            <div className="w-24 h-24 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center animate-pulse">
              <span className="material-symbols-outlined text-red-400 text-5xl">shield</span>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('scamAlertTitle')}</h3>
              <p className="text-sm text-slate-500 dark:text-gray-400 leading-relaxed">
                {t('scamAlertPowered', 'Powered by Azure Content Safety + custom Phi-3 Mini threat model.')}
                {' '}
                {t('scamAlertMonitoring', 'Monitors incoming calls, SMS, and UPI requests for fraud patterns.')}
              </p>
            </div>
            <div className="w-full space-y-3">
              {[
                { icon: 'call', label: t('scamLabelCallBlocked', 'Suspicious call from +91-XXXX blocked'), ts: Date.now() - 2 * 60000, severity: 'high' },
                { icon: 'sms', label: t('scamLabelSmsQuarantined', 'Fake KYC SMS detected and quarantined'), ts: Date.now() - 65 * 60000, severity: 'medium' },
                { icon: 'account_balance', label: t('scamLabelUpiFlagged', 'UPI phishing link flagged'), ts: Date.now() - 3 * 3600000, severity: 'high' },
              ].map((alert, i) => {
                const diffMs = Date.now() - alert.ts;
                const timeLabel = diffMs < 3600000
                  ? `${Math.max(1, Math.floor(diffMs / 60000))} ${t('minutesAgoShort', 'min ago')}`
                  : `${Math.floor(diffMs / 3600000)} ${t('hoursAgoShort', 'hrs ago')}`;
                return (
                  <div key={i} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert.severity === 'high' ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                      <span className={`material-symbols-outlined ${alert.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`}>{alert.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{alert.label}</p>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400">{timeLabel}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => openAgentChat('arthik_salahkar')}
              className="w-full bg-gradient-to-r from-red-500 to-amber-500 text-slate-900 dark:text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">chat</span>
              {t('talkAboutScams')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
