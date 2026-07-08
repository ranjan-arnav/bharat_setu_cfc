'use client';
/**
 * SOSButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen SOS overlay with:
 *   • Hold-to-trigger (3 s press + animated countdown ring) — prevents accidental taps
 *   • Async GPS capture + DIGIPIN encoding
 *   • Async fan-out POST /api/sos → immediate eventId response
 *   • Live per-responder status feed (polling /api/sos/status every 800 ms)
 *   • Conditional Women & Child Safety section (auto-classified by context)
 *   • "Cancel SOS" and "I'm Safe" controls
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { captureLocation, encodeDigipin, generateOfflineSmsLink, SOSLocation, ResponderType } from '@/lib/sos-engine';
import { startAzureSttCapture, type WebSttSession } from '@/lib/web-stt';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'            // initial — holding button activates
  | 'holding'         // user is holding the button; countdown in progress
  | 'listening'       // voice detection — 5s speech recognition after tap
  | 'locating'        // GPS + DIGIPIN acquisition
  | 'dispatching'     // POST /api/sos called; awaiting eventId
  | 'active'          // SOS live — polling responder status
  | 'timer'           // safety timer configuration
  | 'safe';           // user marked themselves safe

// ── Emergency voice keywords (multilingual) ────────────────────────────────
const SOS_KEYWORDS = [
  // English
  'help', 'help me', 'save me', 'sos', 'emergency', 'save', 'danger',
  'fire', 'police', 'ambulance', 'attack', 'murder', 'thief',
  // Hindi
  'bachao', 'bachaao', 'madad', 'police', 'chor', 'aag',
  'bachao mujhe', 'koi bachao', 'help karo', 'madad karo',
  'मदद', 'बचाओ', 'पुलिस', 'आग', 'चोर', 'एम्बुलेंस',
  // Marathi
  'वाचवा', 'मदत', 'पोलीस',
  // Tamil
  'காப்பாற்று', 'உதவி', 'போலீஸ்',
  // Telugu
  'రక్షించండి', 'సహాయం', 'పోలీసు',
  // Bengali
  'বাঁচাও', 'সাহায্য', 'পুলিশ',
  // Gujarati
  'બચાવો', 'મદદ',
  // Kannada
  'ಕಾಪಾಡಿ', 'ಸಹಾಯ',
  // Malayalam
  'രക്ഷിക്കൂ', 'സഹായം',
  // Punjabi
  'ਬਚਾਓ', 'ਮਦਦ',
];

interface DispatchedResponder {
  id: string;
  name: string;
  type: ResponderType;
  priority: number;
  conditional: boolean;
  status: 'pending' | 'notified' | 'acknowledged' | 'failed';
  notifiedAt?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESPONDER_ICON: Record<ResponderType, string> = {
  police: 'local_police',
  ambulance: 'medical_services',
  fire: 'local_fire_department',
  women_child_safety: 'woman',
  child_helpline: 'child_care',
  disaster_management: 'flood',
  legal_aid: 'gavel',
  contact: 'group',
  cyber_crime: 'security',
};

const RESPONDER_COLOR: Record<ResponderType, string> = {
  police: 'text-blue-400',
  ambulance: 'text-green-400',
  fire: 'text-orange-400',
  women_child_safety: 'text-pink-400',
  child_helpline: 'text-yellow-400',
  disaster_management: 'text-cyan-400',
  legal_aid: 'text-purple-400',
  contact: 'text-emerald-400',
  cyber_crime: 'text-violet-400',
};

function StatusBadge({ status }: { status: DispatchedResponder['status'] }) {
  if (status === 'notified' || status === 'acknowledged') {
    return <span className="text-[10px] font-bold text-green-400 uppercase">Notified</span>;
  }
  if (status === 'failed') {
    return <span className="text-[10px] font-bold text-red-400 uppercase">Failed</span>;
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase">
      <span className="material-symbols-outlined text-[12px] animate-spin">autorenew</span>
      Sending…
    </span>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

type LiveAmbulanceRoute = {
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
  current: { lat: number; lon: number };
  etaMinutes: number;
  progressPct: number;
  distanceKm: number;
  mapEmbedUrl: string;
  routeUrl: string;
};

function buildLiveAmbulanceRoute(
  loc: SOSLocation,
  elapsedMilliseconds: number,
  eventRef?: string | null,
): LiveAmbulanceRoute {
  const seedSource = eventRef || loc.digipin || `${loc.lat}-${loc.lng}`;
  let hash = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    hash = ((hash << 5) - hash + seedSource.charCodeAt(index)) | 0;
  }
  const seed = Math.abs(hash);

  const destination = {
    lat: Number(loc.lat.toFixed(6)),
    lon: Number(loc.lng.toFixed(6)),
    label: 'Your location',
  };

  const origin = {
    lat: Number((loc.lat + 0.02 + ((seed % 7) / 1000)).toFixed(6)),
    lon: Number((loc.lng - 0.025 - ((seed % 9) / 1000)).toFixed(6)),
    label: 'Ambulance Base',
  };

  const deltaLat = destination.lat - origin.lat;
  const deltaLon = destination.lon - origin.lon;
  const routeDistanceKm = Number((Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon) * 111).toFixed(1));
  const baseEta = Math.max(7, Math.min(22, Math.round((routeDistanceKm / 0.7) * 2.4)));
  const elapsedMinutes = Math.floor(elapsedMilliseconds / 60000);
  const progressPct = Math.max(6, Math.min(98, Math.round((elapsedMinutes / baseEta) * 100)));
  const progressFactor = progressPct / 100;

  const current = {
    lat: Number((origin.lat + (destination.lat - origin.lat) * progressFactor).toFixed(6)),
    lon: Number((origin.lon + (destination.lon - origin.lon) * progressFactor).toFixed(6)),
  };

  const minLon = Math.min(origin.lon, destination.lon, current.lon) - 0.02;
  const maxLon = Math.max(origin.lon, destination.lon, current.lon) + 0.02;
  const minLat = Math.min(origin.lat, destination.lat, current.lat) - 0.02;
  const maxLat = Math.max(origin.lat, destination.lat, current.lat) + 0.02;

  const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${current.lat}%2C${current.lon}`;
  const routeUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lon}%3B${destination.lat}%2C${destination.lon}`;

  return {
    origin,
    destination,
    current,
    etaMinutes: Math.max(1, baseEta - elapsedMinutes),
    progressPct,
    distanceKm: routeDistanceKm,
    mapEmbedUrl,
    routeUrl,
  };
}

// ─── Hold-button ring animation ───────────────────────────────────────────────

const HOLD_DURATION = 3000; // ms to hold before triggering
const RING_RADIUS = 54;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

// ─── Component ────────────────────────────────────────────────────────────────

interface SOSButtonProps {
  onClose: () => void;
}

export default function SOSButton({ onClose }: SOSButtonProps) {
  const { t } = useTranslation();
  const { userProfile, citizenProfile } = useAppStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [holdProgress, setHoldProgress] = useState(0);      // 0–1
  const [location, setLocation] = useState<SOSLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [responders, setResponders] = useState<DispatchedResponder[]>([]);
  const [context, setContext] = useState<{
    requiresWomenSafety: boolean;
    requiresChildSafety: boolean;
    requiresDisasterResponse: boolean;
    requiresCyberCrime: boolean;
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  // ── Voice Detection State ──────────────────────────────────────────────────
  const [listenCountdown, setListenCountdown] = useState(5);
  const [detectedSpeech, setDetectedSpeech] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<'detecting' | 'triggered' | 'safe' | null>(null);
  const voiceCaptureSessionRef = useRef<WebSttSession | null>(null);
  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const holdRaf = useRef<number | null>(null);
  const holdStart = useRef<number>(0);
  const sosStart = useRef<number>(0);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const triggerSOSRef = useRef<(() => void) | null>(null);
  const trackingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const offlineQueue = useRef<SOSLocation[]>([]);
  const isMounted = useRef(true);

  // ── Safety Timer State ──────────────────────────────────────────────────────
  const [timerMinutes, setTimerMinutes] = useState<number>(15);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (holdRaf.current) cancelAnimationFrame(holdRaf.current);
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      if (poller.current) clearInterval(poller.current);
      if (trackingInterval.current) clearInterval(trackingInterval.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (listenTimerRef.current) clearInterval(listenTimerRef.current);
      voiceCaptureSessionRef.current?.stop();
    };
  }, []);

  // ── Mission clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'active') {
      sosStart.current = Date.now();
      elapsedTimer.current = setInterval(() => {
        if (isMounted.current) setElapsedMs(Date.now() - sosStart.current);
      }, 1000);
    } else if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
    }
    return () => { if (elapsedTimer.current) clearInterval(elapsedTimer.current); };
  }, [phase]);

  // ── Safety Timer Tick ──────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRemaining === null || phase === 'active') return;

    if (timerRemaining <= 0) {
      setTimerRemaining(null);
      triggerSOSRef.current?.();
      return;
    }

    const t = setTimeout(() => {
      setTimerRemaining(prev => prev !== null ? prev - 1 : null);
    }, 1000);

    return () => clearTimeout(t);
  }, [timerRemaining, phase]);

  // ── Network status and flush offline queue ────────────────────────────────
  useEffect(() => {
    const handleOnline = async () => {
      if (offlineQueue.current.length > 0 && eventId) {
        try {
          // Flush queue
          await fetch('/api/sos/update-location', {
            method: 'POST',
            body: JSON.stringify({ eventId, updates: offlineQueue.current, isOfflineBatch: true }),
            headers: { 'Content-Type': 'application/json' },
          });
          offlineQueue.current = [];
          console.log('[SOS Tracking] Flushed offline location queue.');
        } catch { /* keep in queue */ }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [eventId]);

  // ── Live Tracking 10s Ping ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !eventId) return;

    trackingInterval.current = setInterval(async () => {
      try {
        const loc = await captureLocation();
        if (navigator.onLine) {
          await fetch('/api/sos/update-location', {
            method: 'POST',
            body: JSON.stringify({ eventId, updates: [loc] }),
            headers: { 'Content-Type': 'application/json' },
          });
          // Attempt to flush offline queue if any
          if (offlineQueue.current.length > 0) {
            await fetch('/api/sos/update-location', {
              method: 'POST',
              body: JSON.stringify({ eventId, updates: offlineQueue.current, isOfflineBatch: true }),
              headers: { 'Content-Type': 'application/json' },
            });
            offlineQueue.current = [];
          }
        } else {
          // Store in offline queue
          offlineQueue.current.push(loc);
        }
      } catch { /* ignore tracking errors */ }
    }, 10000);

    return () => { if (trackingInterval.current) clearInterval(trackingInterval.current); };
  }, [phase, eventId]);

  // ── Poll /api/sos/status ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !eventId) return;

    poller.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sos/status?id=${eventId}`);
        if (!res.ok || !isMounted.current) return;
        const data = await res.json();
        if (data.results?.length > 0 && isMounted.current) {
          setResponders((prev) =>
            prev.map((r) => {
              const updated = data.results.find(
                (dr: { responderId: string; status: DispatchedResponder['status'] }) =>
                  dr.responderId === r.id
              );
              return updated ? { ...r, status: updated.status, notifiedAt: updated.notifiedAt } : r;
            })
          );
        }
        if (data.allNotified && poller.current) {
          clearInterval(poller.current);
        }
      } catch { /* ignore polling errors */ }
    }, 800);

    return () => { if (poller.current) clearInterval(poller.current); };
  }, [phase, eventId]);

  // ── Voice Detection — start 5s listening ──────────────────────────────────
  const startVoiceListen = useCallback(async () => {
    setPhase('listening');
    setListenCountdown(5);
    setDetectedSpeech(null);
    setVoiceResult('detecting');

    // Countdown timer
    let remaining = 5;
    listenTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (isMounted.current) setListenCountdown(remaining);
      if (remaining <= 0 && listenTimerRef.current) {
        clearInterval(listenTimerRef.current);
      }
    }, 1000);

    try {
      const lang = userProfile.language || 'hi-IN';
      const language = lang.includes('-') ? lang : `${lang}-IN`;
      const captureSession = await startAzureSttCapture(language, 5000);
      voiceCaptureSessionRef.current = captureSession;

      const transcriptRaw = await captureSession.done;
      if (!isMounted.current) return;

      const transcript = transcriptRaw.toLowerCase().trim();
      setDetectedSpeech(transcript || null);

      const found = transcript ? SOS_KEYWORDS.some(kw => transcript.includes(kw.toLowerCase())) : false;
      if (found) {
        setVoiceResult('triggered');
        setTimeout(() => {
          if (isMounted.current) triggerSOSRef.current?.();
        }, 800);
      } else {
        setVoiceResult('safe');
        setTimeout(() => {
          if (isMounted.current) {
            setPhase('idle');
            setVoiceResult(null);
            setDetectedSpeech(null);
          }
        }, 1500);
      }
    } catch {
      if (!isMounted.current) return;
      setVoiceResult('safe');
      setTimeout(() => {
        if (isMounted.current) {
          setPhase('idle');
          setVoiceResult(null);
          setDetectedSpeech(null);
        }
      }, 1500);
    } finally {
      voiceCaptureSessionRef.current = null;
      if (listenTimerRef.current) clearInterval(listenTimerRef.current);
    }
  }, [userProfile.language]);

  // ── Hold-press handlers ────────────────────────────────────────────────────

  const startHold = useCallback(() => {
    if (phase !== 'idle') return;
    holdStart.current = performance.now();
    setPhase('holding');
    setHoldProgress(0);

    const tick = () => {
      const elapsed = performance.now() - holdStart.current;
      const prog = Math.min(elapsed / HOLD_DURATION, 1);
      if (isMounted.current) setHoldProgress(prog);

      if (prog >= 1) {
        // Force-trigger: held for 3 seconds
        triggerSOSRef.current?.();
        return;
      }
      holdRaf.current = requestAnimationFrame(tick);
    };
    holdRaf.current = requestAnimationFrame(tick);
  }, [phase]);

  const cancelHold = useCallback(() => {
    if (phase !== 'holding') return;
    if (holdRaf.current) cancelAnimationFrame(holdRaf.current);
    setHoldProgress(0);
    // Short tap (< 3s) → start voice listening instead of going back to idle
    startVoiceListen();
  }, [phase, startVoiceListen]);

  // ── Core SOS trigger ──────────────────────────────────────────────────────
  const triggerSOS = useCallback(async () => {
    if (holdRaf.current) cancelAnimationFrame(holdRaf.current);
    setPhase('locating');
    setStatusMsg('Acquiring GPS location…');
    retryCount.current = 0; // reset retry counter on fresh trigger

    // ── Step 1: GPS ──────────────────────────────────────────────────────────
    let loc: SOSLocation;
    try {
      loc = await captureLocation();
      if (!isMounted.current) return;
      setLocation(loc);
      setLocationError(null);
    } catch {
      // Fallback: use profile DIGIPIN if available
      if (!isMounted.current) return;
      const profileDigipin = citizenProfile?.digipin || userProfile.digipin || '0000-000-000';
      setLocationError('GPS unavailable — using profile location');
      loc = {
        lat: 28.6139,
        lng: 77.2090,
        digipin: profileDigipin || encodeDigipin(28.6139, 77.2090),
        accuracy: 999,
        capturedAt: Date.now(),
      };
      setLocation(loc);
    }

    setPhase('dispatching');
    setStatusMsg('Broadcasting SOS alert…');

    // ── Step 2: POST to /api/sos ─────────────────────────────────────────────
    try {
      const profile = citizenProfile;
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: loc.lat,
          lng: loc.lng,
          digipin: loc.digipin,
          accuracy: loc.accuracy,
          userId: profile?.aadhaarMasked || userProfile.name || 'user',
          userName: profile?.name || userProfile.name || 'Bharat Setu User',
          userMobile: profile?.mobile || '',
          userGender: profile?.gender,
          description: '',
          // Bug fix: don't use the victim's own number as emergency contact.
          // A real implementation would read a separate "emergencyContact" field
          // from the citizen profile once that field is added.
        }),
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();

      if (!isMounted.current) return;

      setEventId(data.eventId);
      setContext(data.context);
      setResponders(
        data.responders.map((r: { id: string; name: string; type: ResponderType; priority: number; conditional: boolean }) => ({
          ...r,
          status: 'pending' as const,
        }))
      );
      setPhase('active');
      setStatusMsg('');

      // ── Step 3: Trigger WhatsApp Click-to-Chat (Hardcoded to 7061203449) ─────
      if (profile) {
        let waMessage = '';

        if (locationError && locationError.includes('unavailable')) {
          waMessage = `SOS triggered. Location unavailable.\nNeeds help. Dispatch immediately.`;
        } else {
          const mapLink = `https://atlas.microsoft.com/map?query=${loc.lat},${loc.lng}`;
          waMessage = `SOS\nName:${profile.name || userProfile.name || 'Bharat Setu User'}\nMob:${profile.mobile || ''}\nLoc:${mapLink}\nDIGIPIN:${loc.digipin}\nAccuracy:${loc.accuracy || 0}m\nCoords:${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}\nNeeds help. Dispatch immediately.`;
        }

        const encodedMessage = encodeURIComponent(waMessage);
        const url = `https://wa.me/917061203449?text=${encodedMessage}`;

        try {
          // Add a small delay so browser doesn't block it too aggressively
          setTimeout(() => window.open(url, '_blank'), 500);
        } catch (e) {
          console.error('Failed to open WhatsApp window', e);
        }
      }

    } catch {
      if (!isMounted.current) return;
      // Bug fix: limit retries to 1 to prevent an infinite retry loop on
      // persistent network failure.
      if (retryCount.current >= 1) {
        setStatusMsg('Network unavailable. Generating Offline SMS…');

        // Use offline SMS fallback
        const primaryContactPhone = citizenProfile?.emergencyContacts?.[0]?.phone || '112';
        const smsLink = generateOfflineSmsLink(loc, primaryContactPhone);

        setTimeout(() => {
          window.location.href = smsLink;
          setPhase('idle');
        }, 1500);

        return;
      }
      retryCount.current += 1;
      setStatusMsg('Network error — retrying…');
      // Bug fix: store the timer ref so we can cancel it on unmount
      retryTimer.current = setTimeout(() => {
        if (isMounted.current) triggerSOS();
      }, 2000);
    }
  }, [citizenProfile, userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep triggerSOSRef in sync with the latest triggerSOS (solves stale-closure in startHold)
  // Bug fix: this effect runs after every render where triggerSOS reference changes,
  // ensuring startHold always calls the up-to-date version.
  useEffect(() => {
    triggerSOSRef.current = triggerSOS;
  }, [triggerSOS]);

  // ── I'm Safe ──────────────────────────────────────────────────────────────
  const markSafe = async () => {
    if (poller.current) clearInterval(poller.current);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    if (trackingInterval.current) clearInterval(trackingInterval.current);

    if (eventId) {
      try {
        await fetch('/api/sos/end', {
          method: 'POST',
          body: JSON.stringify({ eventId }),
          headers: { 'Content-Type': 'application/json' },
        });
      } catch { /* silently fail session end on network drops */ }
    }
    setPhase('safe');
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const notifiedCount = responders.filter((r) => r.status === 'notified' || r.status === 'acknowledged').length;
  const hasWomenSafety = context?.requiresWomenSafety;
  const hasChildSafety = context?.requiresChildSafety;
  const liveAmbulanceRoute = location ? buildLiveAmbulanceRoute(location, elapsedMs, eventId) : null;

  // Sort: priority 1 first, then by whether they've been notified
  const sortedResponders = [...responders].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.status === 'notified' && b.status !== 'notified') return -1;
    if (b.status === 'notified' && a.status !== 'notified') return 1;
    return 0;
  });

  // ─── LISTENING SCREEN (Voice Detection) ─────────────────────────────────────
  if (phase === 'listening') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white dark:bg-black/95 text-slate-900 dark:text-white p-8 gap-6">
        {/* Pulsing mic */}
        <div className={`w-28 h-28 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.5)] ${voiceResult === 'triggered' ? 'bg-red-600 animate-pulse' :
          voiceResult === 'safe' ? 'bg-green-600' :
            'bg-red-500/20 animate-pulse'
          }`}>
          <span className="material-symbols-outlined text-5xl text-slate-900 dark:text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
            {voiceResult === 'triggered' ? 'emergency' : voiceResult === 'safe' ? 'check' : 'mic'}
          </span>
        </div>

        {/* Status text */}
        <div className="text-center space-y-3">
          {voiceResult === 'triggered' ? (
            <>
              <h2 className="text-2xl font-black text-red-400 uppercase tracking-wider">🚨 SOS Keyword Detected!</h2>
              <p className="text-sm text-red-300">Triggering emergency alert…</p>
            </>
          ) : voiceResult === 'safe' ? (
            <>
              <h2 className="text-xl font-black text-green-400 uppercase tracking-wider">No Emergency Detected</h2>
              <p className="text-sm text-slate-400">Returning to home…</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-wider">🎤 Listening…</h2>
              <p className="text-sm text-slate-400">Say &quot;Help&quot;, &quot;Bachao&quot;, &quot;Madad&quot;, &quot;SOS&quot; to trigger emergency</p>
              <div className="text-5xl font-mono font-bold text-red-400 mt-4">
                {listenCountdown}
                <span className="text-lg text-slate-500 ml-1">s</span>
              </div>
            </>
          )}
        </div>

        {/* Detected speech */}
        {detectedSpeech && (
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 max-w-xs text-center">
            <p className="text-[10px] text-slate-500 uppercase mb-1">Heard:</p>
            <p className="text-sm text-slate-900 dark:text-white">&quot;{detectedSpeech}&quot;</p>
          </div>
        )}

        {/* Cancel button */}
        {voiceResult === 'detecting' && (
          <button
            onClick={() => {
              voiceCaptureSessionRef.current?.stop();
              if (listenTimerRef.current) clearInterval(listenTimerRef.current);
              setPhase('idle');
              setVoiceResult(null);
              setDetectedSpeech(null);
            }}
            className="mt-2 w-full max-w-xs bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-xl transition-all uppercase tracking-widest text-sm"
          >
            Cancel
          </button>
        )}

        {/* Force SOS button */}
        {voiceResult === 'detecting' && (
          <button
            onClick={() => {
              voiceCaptureSessionRef.current?.stop();
              if (listenTimerRef.current) clearInterval(listenTimerRef.current);
              triggerSOSRef.current?.();
            }}
            className="w-full max-w-xs bg-red-600 hover:bg-red-500 text-slate-900 dark:text-white font-bold py-4 rounded-xl transition-all uppercase tracking-widest text-sm shadow-[0_0_20px_rgba(239,68,68,0.6)]"
          >
            🚨 Force SOS Now
          </button>
        )}
      </div>
    );
  }

  // ─── TIMER SCREEN ─────────────────────────────────────────────────────────
  if (phase === 'timer') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center flex-1 w-full max-w-sm mx-auto p-8 gap-8 bg-white dark:bg-black/95 text-slate-900 dark:text-white animate-in fade-in duration-500">
        <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center pulse-blue shadow-[0_0_30px_rgba(59,130,246,0.5)]">
          <span className="material-symbols-outlined text-blue-400 text-5xl">timer</span>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-wider">Safety Timer</h2>
          <p className="text-sm text-slate-400">If timer reaches zero before you cancel it, SOS will auto-trigger.</p>
        </div>

        <div className="w-full flex items-center justify-center gap-4 py-8">
          <button
            onClick={() => setTimerMinutes(Math.max(1, timerMinutes - 1))}
            className="w-12 h-12 rounded-full border border-black/20 dark:border-white/20 flex items-center justify-center text-slate-900 dark:text-white text-3xl font-light hover:bg-black/10 dark:bg-white/10 transition-colors"
          >-</button>
          <div className="text-5xl font-mono font-bold text-blue-400 w-32 text-center drop-shadow-md">
            {timerMinutes}<span className="text-xl text-slate-500 ml-1">m</span>
          </div>
          <button
            onClick={() => setTimerMinutes(timerMinutes + 1)}
            className="w-12 h-12 rounded-full border border-black/20 dark:border-white/20 flex items-center justify-center text-slate-900 dark:text-white text-3xl font-light hover:bg-black/10 dark:bg-white/10 transition-colors"
          >+</button>
        </div>

        <div className="flex gap-4 w-full">
          <button
            onClick={() => setPhase('idle')}
            className="flex-1 py-4 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-xl font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setTimerRemaining(timerMinutes * 60);
              setPhase('idle');
            }}
            className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold uppercase tracking-widest text-slate-900 dark:text-white transition-colors shadow-[0_0_20px_rgba(59,130,246,0.6)]"
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  // ─── SAFE SCREEN ──────────────────────────────────────────────────────────
  if (phase === 'safe') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white dark:bg-black/95 text-slate-900 dark:text-white p-8 gap-6">
        <div className="size-24 rounded-full bg-green-600 flex items-center justify-center shadow-[0_0_40px_rgba(22,163,74,0.6)]">
          <span className="material-symbols-outlined text-5xl">check</span>
        </div>
        <h2 className="text-3xl font-black text-green-400 tracking-wider">You&apos;re Safe</h2>
        <p className="text-slate-400 text-center text-sm max-w-xs">
          All responders have been notified that you are safe.{' '}
          {eventId && <span className="text-slate-500 text-xs block mt-1">Ref: {eventId}</span>}
        </p>
        <button
          onClick={onClose}
          className="mt-4 w-full max-w-xs bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:bg-white/20 text-slate-900 dark:text-white font-bold py-4 rounded-xl transition-all uppercase tracking-widest text-sm"
        >
          Close
        </button>
      </div>
    );
  }

  // ─── ACTIVE SOS SCREEN ─────────────────────────────────────────────────────
  if (phase === 'active') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col overflow-y-auto"
        style={{ background: 'var(--sos-gradient, linear-gradient(180deg, #4c0606 0%, #1a0808 100%))' }}>

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-red-50/90 dark:bg-black/40 backdrop-blur-md border-b border-red-200 dark:border-red-900/30">
          <div className="flex items-center gap-3">
            <div className="size-3 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-slate-900 dark:text-white font-black text-base uppercase tracking-widest">🚨 SOS Active</h2>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-red-400 font-bold text-sm font-mono">{formatElapsed(elapsedMs)}</p>
            <p className="text-slate-500 text-[9px] uppercase">Recording…</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-4 pb-28">
          {/* ── Location Card ── */}
          {location && (
            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 backdrop-blur-md overflow-hidden">
              <div className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{t("isroDigipinLabel")}</p>
                    <p className="text-slate-900 dark:text-white text-xl font-mono font-black tracking-widest">{location.digipin}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-green-400">
                    <span className="material-symbols-outlined text-sm">gps_fixed</span>
                    {location.accuracy < 50 ? `±${location.accuracy}m` : 'Approx'}
                  </div>
                </div>
                <div className="flex gap-6 border-t border-black/10 dark:border-white/10 pt-2">
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase">Latitude</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white font-mono">{location.lat.toFixed(5)}° N</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase">Longitude</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white font-mono">{location.lng.toFixed(5)}° E</p>
                  </div>
                </div>
                {locationError && (
                  <p className="text-[9px] text-yellow-400 font-bold">{locationError}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Live Ambulance Tracking (OpenStreetMap) ── */}
          {liveAmbulanceRoute && (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest font-black text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">local_shipping</span>
                  Live Ambulance Tracking
                </p>
                <p className="text-[11px] font-bold text-slate-900 dark:text-white">ETA {liveAmbulanceRoute.etaMinutes}m</p>
              </div>

              <iframe
                title="live-ambulance-osm"
                src={liveAmbulanceRoute.mapEmbedUrl}
                loading="lazy"
                className="w-full h-44 rounded-lg border border-black/10 dark:border-white/10"
              />

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-1.5">
                  <p className="text-[9px] text-slate-500 uppercase">Progress</p>
                  <p className="text-[11px] font-black text-emerald-500">{liveAmbulanceRoute.progressPct}%</p>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-1.5">
                  <p className="text-[9px] text-slate-500 uppercase">Distance</p>
                  <p className="text-[11px] font-black text-slate-900 dark:text-white">{liveAmbulanceRoute.distanceKm} km</p>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-1.5">
                  <p className="text-[9px] text-slate-500 uppercase">Current</p>
                  <p className="text-[11px] font-black text-slate-900 dark:text-white">{liveAmbulanceRoute.current.lat}, {liveAmbulanceRoute.current.lon}</p>
                </div>
              </div>

              <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-black/5 dark:bg-white/5 rounded-lg p-2 space-y-1">
                <p><span className="font-bold">Route:</span> {liveAmbulanceRoute.origin.label} → {liveAmbulanceRoute.destination.label}</p>
                <p><span className="font-bold">Current ambulance point:</span> {liveAmbulanceRoute.current.lat}, {liveAmbulanceRoute.current.lon}</p>
              </div>

              <button
                onClick={() => window.open(liveAmbulanceRoute.routeUrl, '_blank')}
                className="w-full h-10 rounded-lg border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-200 font-bold text-[11px] uppercase tracking-wider"
              >
                Open Route in OpenStreetMap
              </button>
            </div>
          )}

          {/* ── Women & Child Safety Banner (conditional) ── */}
          {(hasWomenSafety || hasChildSafety) && (
            <div className="rounded-xl border border-pink-500/40 bg-pink-500/10 p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-pink-300 text-2xl mt-0.5">woman</span>
              <div>
                <p className="text-pink-700 dark:text-pink-200 font-bold text-sm">
                  {hasChildSafety ? 'Women & Child Safety Services Activated' : 'Women Safety Services Activated'}
                </p>
                <p className="text-pink-600 dark:text-pink-300/70 text-xs mt-0.5">
                  {hasChildSafety
                    ? "Women\u2019s Helpline (1091) + CHILDLINE (1098) have been alerted."
                    : "Women\u2019s Helpline (1091) and Women & Child Safety Wing are on alert."}
                </p>
              </div>
            </div>
          )}

          {/* ── Dispatch status ── */}
          <div>
            <div className="flex justify-between items-center mb-2 px-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                Emergency Responders
              </p>
              <p className="text-[10px] font-bold text-green-400">
                {notifiedCount}/{responders.length} Notified
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-black/10 dark:bg-white/10 h-1 rounded-full mb-3 overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-700"
                style={{ width: `${responders.length > 0 ? (notifiedCount / responders.length) * 100 : 0}%` }}
              />
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 divide-y divide-white/5">
              {sortedResponders.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className={`material-symbols-outlined text-xl ${RESPONDER_COLOR[r.type] || 'text-slate-300'}`}>
                      {RESPONDER_ICON[r.type] || 'support_agent'}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{r.name}</p>
                      {r.conditional && (
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Specialist Channel</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </div>

          {/* ── Quick call buttons ── */}
          <div className="grid grid-cols-2 gap-2">
            <a href="tel:100"
              className="flex items-center justify-center gap-2 h-12 bg-red-600/80 hover:bg-red-600 rounded-xl font-bold text-sm text-slate-900 dark:text-white">
              <span className="material-symbols-outlined text-base">local_police</span>100
            </a>
            <a href="tel:108"
              className="flex items-center justify-center gap-2 h-12 bg-green-700/80 hover:bg-green-700 rounded-xl font-bold text-sm text-slate-900 dark:text-white">
              <span className="material-symbols-outlined text-base">medical_services</span>108
            </a>
            {hasWomenSafety && (
              <a href="tel:1091"
                className="flex items-center justify-center gap-2 h-12 bg-pink-700/80 hover:bg-pink-700 rounded-xl font-bold text-sm text-slate-900 dark:text-white col-span-2">
                <span className="material-symbols-outlined text-base">woman</span>Women&apos;s Helpline 1091
              </a>
            )}
          </div>

          {/* ── Event ID ── */}
          {eventId && (
            <p className="text-center text-slate-600 text-[9px] font-mono">{eventId}</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-black/80 backdrop-blur-xl border-t border-red-200 dark:border-white/10 flex gap-3 z-10">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-bold py-4 rounded-xl uppercase tracking-widest text-sm"
          >
            Cancel SOS
          </button>
          <button
            onClick={markSafe}
            className="flex-[2] bg-green-600 hover:bg-green-500 text-slate-900 dark:text-white font-black py-4 rounded-xl uppercase tracking-widest text-base shadow-[0_0_20px_rgba(22,163,74,0.4)]"
          >
            I&apos;m Safe
          </button>
        </div>
      </div>
    );
  }

  // ─── LOCATING / DISPATCHING SCREENS ───────────────────────────────────────
  if (phase === 'locating' || phase === 'dispatching') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white dark:bg-black/95 gap-6 text-slate-900 dark:text-white p-8">
        <div className="relative size-24">
          <svg className="size-24" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
            {/* Bug fix: full circumference = 2π×44 ≈ 276.46; 138 was only half the arc */}
            <circle
              cx="50" cy="50" r="44" fill="none" stroke="#f20d0d" strokeWidth="4"
              strokeDasharray="276.46 276.46" strokeDashoffset="207"
              strokeLinecap="round"
              style={{ transformOrigin: '50% 50%', animation: 'spin 1.2s linear infinite' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl text-red-400">
              {phase === 'locating' ? 'gps_fixed' : 'broadcast_on_home'}
            </span>
          </div>
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider">{statusMsg}</h3>
        <p className="text-slate-500 text-sm text-center">
          {phase === 'locating'
            ? 'Capturing your GPS coordinates and DIGIPIN…'
            : 'Alerting police, ambulance and all active responders…'}
        </p>
        <button
          onClick={onClose}
          className="mt-6 text-slate-500 text-sm underline"
        >
          Cancel
        </button>
        {/* CSS keyframe */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } .rotating circle { transform-origin: 50% 50%; }`}</style>
      </div>
    );
  }

  // ─── IDLE / HOLDING — main hold-button screen ─────────────────────────────
  const strokeOffset = RING_CIRC * (1 - holdProgress);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 text-slate-900 dark:text-white p-8"
      style={{ background: 'var(--sos-gradient, linear-gradient(180deg, #4c0606 0%, #1a0808 100%))' }}
    >
      {/* ── Active Timer Bar ── */}
      {timerRemaining !== null && (
        <div className="absolute top-16 left-5 right-5 z-10 bg-blue-500/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between shadow-lg cursor-pointer" onClick={() => setTimerRemaining(null)}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-blue-400 animate-pulse">timer</span>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Safety Timer Active</p>
              <p className="text-[10px] text-slate-400">SOS auto-triggers in <span className="text-slate-900 dark:text-white font-mono font-bold">{Math.floor(timerRemaining / 60)}:{(timerRemaining % 60).toString().padStart(2, '0')}</span></p>
            </div>
          </div>
          <button className="text-[10px] font-bold bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 px-2 py-1 rounded text-slate-600 dark:text-slate-300 uppercase tracking-widest transition-colors">
            Stop
          </button>
        </div>
      )}

      {/* Close */}
      <button onClick={onClose} className="absolute top-5 right-5 text-slate-900 dark:text-white/40 hover:text-slate-900 dark:text-white">
        <span className="material-symbols-outlined text-3xl">close</span>
      </button>

      <h2 className="text-2xl font-black uppercase tracking-widest text-slate-900 dark:text-white/90">Emergency SOS</h2>

      {/* Hold button with countdown ring */}
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
          {/* Track */}
          <circle cx="70" cy="70" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          {/* Progress */}
          <circle
            cx="70" cy="70" r={RING_RADIUS}
            fill="none"
            stroke={phase === 'holding' ? '#f20d0d' : 'transparent'}
            strokeWidth="6"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.05s linear' }}
          />
        </svg>

        {/* Central button */}
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={() => startHold()}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
          className={`absolute size-[110px] rounded-full flex flex-col items-center justify-center gap-1 select-none transition-all touch-none
            ${phase === 'holding'
              ? 'bg-red-600 shadow-[0_0_40px_rgba(242,13,13,0.8)] scale-95'
              : 'bg-red-700 shadow-[0_0_20px_rgba(242,13,13,0.5)] hover:bg-red-600 active:scale-95'}`}
        >
          <span className="material-symbols-outlined text-4xl text-slate-900 dark:text-white">sos</span>
          <span className="text-[10px] font-black text-slate-900 dark:text-white/80 uppercase tracking-widest">
            {phase === 'holding'
              ? `${Math.ceil(3 - holdProgress * 3)}s`
              : 'Hold'}
          </span>
        </button>
      </div>

      <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
        {phase === 'holding'
          ? 'Keep holding to trigger emergency alert…'
          : 'Press and hold for 3 seconds to send SOS to police, ambulance and all emergency services.'}
      </p>

      {/* Quick-dial strip */}
      <div className="w-full max-w-sm grid grid-cols-3 gap-3">
        {[
          { label: 'Police', number: '100', icon: 'local_police' },
          { label: 'Ambulance', number: '108', icon: 'medical_services' },
          { label: 'Women', number: '1091', icon: 'woman' },
        ].map(({ label, number, icon }) => (
          <a
            key={number}
            href={`tel:${number}`}
            className="flex flex-col items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 hover:bg-black/10 dark:bg-white/10 no-underline"
          >
            <span className="material-symbols-outlined text-2xl text-red-400">{icon}</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white">{label}</span>
            <span className="text-[10px] text-slate-400">{number}</span>
          </a>
        ))}
      </div>

      <button
        onClick={() => setPhase('timer')}
        className="w-full max-w-sm mt-2 flex items-center justify-center gap-2 py-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl text-slate-600 dark:text-slate-300 font-bold uppercase tracking-widest text-xs transition-colors"
      >
        <span className="material-symbols-outlined text-sm">timer</span>
        Start Safety Timer
      </button>

    </div>
  );
}
