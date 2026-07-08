'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { triggerSOS } from '@/lib/services/sosService';

/**
 * SOSHardwareTrigger — Global keyboard listener.
 * Rapid press of "S" key 5× within 2 seconds triggers SOS countdown.
 * Renders an overlay with cancel button during the 5-second countdown.
 */
export default function SOSHardwareTrigger() {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sosId, setSosId] = useState<string | null>(null);
  const citizenProfile = useAppStore(s => s.citizenProfile);
  const userProfile = useAppStore(s => s.userProfile);

  // Track rapid key presses
  useEffect(() => {
    const timestamps: number[] = [];
    const REQUIRED_PRESSES = 5;
    const WINDOW_MS = 2000;

    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 's' || countdown !== null) return;
      timestamps.push(Date.now());

      // Keep only recent presses
      while (timestamps.length > 0 && Date.now() - timestamps[0] > WINDOW_MS) {
        timestamps.shift();
      }

      if (timestamps.length >= REQUIRED_PRESSES) {
        timestamps.length = 0;
        setCountdown(5);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [countdown]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // Fire SOS
      const contacts = citizenProfile?.emergencyContacts?.map(c => ({ name: c.name, phone: c.phone })) || [];
      triggerSOS({ latitude: 0, longitude: 0, digipin: userProfile.digipin, emergencyContacts: contacts })
        .then(res => setSosId(res.data.id));
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, citizenProfile, userProfile]);

  const cancel = useCallback(() => {
    setCountdown(null);
    setSosId(null);
  }, []);

  if (countdown === null && !sosId) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center max-w-[430px] mx-auto" style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div className="bg-red-950/90 border-2 border-red-500/50 rounded-3xl p-8 text-center mx-6 shadow-2xl shadow-red-900/50">
        {sosId ? (
          <>
            <span className="material-symbols-outlined text-[48px] text-green-400 mb-3 block">check_circle</span>
            <h3 className="text-lg font-black text-white mb-1">SOS Dispatched</h3>
            <p className="text-xs text-red-200 mb-1">ID: {sosId}</p>
            <p className="text-xs text-red-300">Emergency contacts notified. Help is on the way.</p>
            <button onClick={cancel} className="mt-4 px-6 py-2 rounded-xl bg-white/10 text-white text-xs font-bold border border-white/20">
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-red-500/30" />
              <div className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-40" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-black text-red-400">{countdown}</span>
              </div>
            </div>
            <h3 className="text-lg font-black text-white mb-1">Emergency SOS</h3>
            <p className="text-xs text-red-200 mb-4">SOS will trigger in {countdown} seconds...</p>
            <button
              onClick={cancel}
              className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-bold border border-white/20 hover:bg-white/20 transition-colors active:scale-95"
            >
              Cancel SOS
            </button>
          </>
        )}
      </div>
    </div>
  );
}
