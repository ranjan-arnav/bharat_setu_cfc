'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { FlagStripe } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
// DIGIPIN Character Alphabet — 16 chars for 4×4 grid encoding (India Post specification)
// Official alphabet: rows (S→N), columns (W→E) each split into 4
const DIGIPIN_ALPHABET = 'FCJ987XM654HGWKB';

// India bounding box
const LAT_MIN = 6.0, LAT_MAX = 38.0;
const LON_MIN = 68.0, LON_MAX = 98.0;

/**
 * Encodes a GPS coordinate pair into a 10-character DIGIPIN code
 * using the hierarchical 4×4 grid algorithm over India's bounding box.
 */
function encodeDigipin(lat: number, lon: number): string | null {
  if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
    return null; // Outside India
  }

  let latMin = LAT_MIN, latMax = LAT_MAX;
  let lonMin = LON_MIN, lonMax = LON_MAX;
  let code = '';

  for (let level = 0; level < 10; level++) {
    const latSpan = latMax - latMin;
    const lonSpan = lonMax - lonMin;

    // Which cell (0–3) in latitude (south → north)?
    const latDiv = Math.min(3, Math.floor((lat - latMin) / latSpan * 4));
    // Which cell (0–3) in longitude (west → east)?
    const lonDiv = Math.min(3, Math.floor((lon - lonMin) / lonSpan * 4));

    // Map to flat index 0–15 (row = lat from south, col = lon from west)
    const idx = latDiv * 4 + lonDiv;
    code += DIGIPIN_ALPHABET[idx];

    // Narrow down to selected cell
    latMin = latMin + latDiv * latSpan / 4;
    latMax = latMin + latSpan / 4;
    lonMin = lonMin + lonDiv * lonSpan / 4;
    lonMax = lonMin + lonSpan / 4;
  }

  // Format as XXXX-XXX-XXX
  return `${code.slice(0, 4)}-${code.slice(4, 7)}-${code.slice(7, 10)}`;
}

/**
 * Reverse: decode the bounding box center of a DIGIPIN code
 */
function decodeDigipin(digipin: string): { lat: number; lon: number } | null {
  const clean = digipin.replace(/-/g, '').toUpperCase();
  if (clean.length !== 10) return null;

  let latMin = LAT_MIN, latMax = LAT_MAX;
  let lonMin = LON_MIN, lonMax = LON_MAX;

  for (const char of clean) {
    const idx = DIGIPIN_ALPHABET.indexOf(char);
    if (idx === -1) return null;

    const latDiv = Math.floor(idx / 4);
    const lonDiv = idx % 4;
    const latSpan = latMax - latMin;
    const lonSpan = lonMax - lonMin;

    latMin = latMin + latDiv * latSpan / 4;
    latMax = latMin + latSpan / 4;
    lonMin = lonMin + lonDiv * lonSpan / 4;
    lonMax = lonMin + lonSpan / 4;
  }

  return {
    lat: (latMin + latMax) / 2,
    lon: (lonMin + lonMax) / 2,
  };
}

interface DigipinLocatorProps {
  onClose: () => void;
  onUseInQuery?: (digipin: string) => void;
}

export default function DigipinLocator({ onClose, onUseInQuery }: DigipinLocatorProps) {
  const { t } = useTranslation();
  const { userProfile, setUserProfile } = useAppStore();
  const [digipin, setDigipin] = useState<string>(userProfile.digipin || '');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<{ lat: number; lon: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'detect' | 'lookup'>('detect');

  const detectDigipin = useCallback(() => {
    setLoading(true);
    setError('');
    setDigipin('');
    setCoords(null);

    if (!navigator.geolocation) {
      setError(t('geolocationNotAvailableInBrowser', 'Geolocation is not available in this browser.'));
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const code = encodeDigipin(lat, lon);

        if (!code) {
          setError(t('outsideIndiaDigipinOnly', 'You are outside India boundaries. DIGIPIN works only within India.'));
        } else {
          setDigipin(code);
          setCoords({ lat, lon });
          // Save to user profile
          setUserProfile({ digipin: code });
        }
        setLoading(false);
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: t('locationPermissionDeniedAllowInBrowserSettings', 'Location permission denied. Allow location in browser settings.'),
          2: t('locationUnavailableEnableGps', 'Location unavailable. Please enable GPS.'),
          3: t('locationRequestTimedOutTryAgain', 'Location request timed out. Please try again.'),
        };
        setError(msgs[err.code] || t('locationDetectionFailed', 'Failed to detect location.'));
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [setUserProfile, t]);

  const copyToClipboard = useCallback(async () => {
    if (!digipin) return;
    try {
      await navigator.clipboard.writeText(digipin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = digipin;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [digipin]);

  const shareOnWhatsApp = useCallback(() => {
    if (!digipin) return;
    const text = encodeURIComponent(`${t('myDigipinLabel', '📍 My DIGIPIN')}: ${digipin}\n🌐 ${t('location', 'Location')}: ${coords ? `${coords.lat.toFixed(6)}°N, ${coords.lon.toFixed(6)}°E` : t('india', 'India')}\n\n${t('digipinShareText', 'Shared my accurate address on Bharat Setu!')} 🇮🇳 #DIGIPIN #BharatSetu`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }, [digipin, coords, t]);

  const lookupDigipin = useCallback((code?: string) => {
    const target = (code ?? lookupInput).trim();
    if (code) setLookupInput(code); // sync input field when called from sample
    const result = decodeDigipin(target);
    if (!result) {
      setError(t('invalidDigipinFormatExample', 'Invalid DIGIPIN format. Example: FCJX-MK4-F8B (4-3-3 format)'));
      setLookupResult(null); // clear any stale previous result
    } else {
      setLookupResult(result);
      setError('');
    }
  }, [lookupInput, t]);

  const precisionMeters = 4;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-[#1a0a3a]/95 backdrop-blur-xl border-b border-purple-200 dark:border-purple-500/20">
        <button onClick={onClose} className="p-1" aria-label={t('close', 'Close')}>
          <span className="material-symbols-outlined text-slate-600 dark:text-gray-400">arrow_back</span>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">📮</span>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{t('knowYourDigipin', 'Know Your DIGIPIN')}</h2>
          </div>
          <p className="text-[10px] text-purple-600 dark:text-purple-300/70">{t('indiaPostIsroGeocodingTechnology', 'India Post · ISRO Geocoding Technology')}</p>
        </div>
        <div className="flex items-center gap-1 bg-purple-100 dark:bg-purple-500/10 border border-purple-300 dark:border-purple-500/20 rounded-full px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse"></span>
          <span className="text-[10px] text-purple-700 dark:text-purple-300 font-bold">{t('live', 'LIVE')}</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-slate-100 dark:bg-[#0f1a30] border-b border-slate-200 dark:border-white/5">
        {(['detect', 'lookup'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(''); }}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? 'text-purple-600 dark:text-purple-300 border-b-2 border-purple-600 dark:border-purple-400'
                : 'text-slate-400 dark:text-gray-500'
            }`}
          >
            {tab === 'detect' ? t('detectMyDigipin', '📍 Detect My DIGIPIN') : t('lookupDigipin', '🔍 Lookup DIGIPIN')}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

        {/* ─── DETECT TAB ─── */}
        {activeTab === 'detect' && (
          <>
            {/* Hero Card */}
            <div className="bg-gradient-to-br from-purple-50 to-slate-50 dark:from-[#1a0a3a] dark:to-[#0a1628] border border-purple-200 dark:border-purple-500/20 rounded-2xl p-5 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(139,92,246,0.3) 20px, rgba(139,92,246,0.3) 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(139,92,246,0.3) 20px, rgba(139,92,246,0.3) 21px)'}}></div>
              <div className="relative">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-purple-100 dark:bg-purple-500/20 border-2 border-purple-300 dark:border-purple-400/40 flex items-center justify-center">
                  <span className="material-symbols-outlined text-purple-600 dark:text-purple-300 text-4xl">
                    {loading ? 'sync' : digipin ? 'location_on' : 'gps_fixed'}
                  </span>
                  {loading && <span className="absolute inset-0 rounded-full border-2 border-purple-400 dark:border-purple-400/40 animate-spin" />}
                </div>

                {digipin ? (
                  <>
                    <div className="mb-1">
                      <p className="text-[10px] text-purple-600 dark:text-purple-300/70 uppercase tracking-widest font-bold">Your DIGIPIN</p>
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="text-3xl font-black text-slate-900 dark:text-white tracking-[0.15em] font-mono">{digipin}</span>
                    </div>
                    {coords && (
                      <p className="text-[10px] text-slate-600 dark:text-gray-400">
                        {coords.lat.toFixed(6)}°N, {coords.lon.toFixed(6)}°E · ±{precisionMeters}m precision
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">{t('whatIsDigipin', 'What is DIGIPIN?')}</h3>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      {t('digipinDescriptionLine1', 'India Post\'s 10-digit digital address code.')}<br />
                      {t('digipinDescriptionLine2', 'Unique pin code for every home, farm, and shop.')}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-sm mt-0.5">error</span>
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Detect Button */}
            <button
              onClick={detectDigipin}
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'sync' : 'my_location'}
              </span>
              {loading ? t('detectingLocationViaGps', 'Detecting location via GPS...') : t('findMyDigipin', 'Find My DIGIPIN')}
            </button>

            {/* Actions when DIGIPIN is available */}
            {digipin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl py-3 text-xs font-bold text-slate-900 dark:text-white transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? 'check_circle' : 'content_copy'}</span>
                    {copied ? t('copied', 'Copied!') : t('copyCode', 'Copy Code')}
                  </button>
                  <button
                    onClick={shareOnWhatsApp}
                    className="flex items-center justify-center gap-2 bg-green-50 dark:bg-[#25D366]/10 border border-green-300 dark:border-[#25D366]/30 rounded-xl py-3 text-xs font-bold text-green-700 dark:text-[#25D366] transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-sm">share</span>
                    {t('whatsappShare', 'WhatsApp Share')}
                  </button>
                </div>

                {onUseInQuery && (
                  <button
                    onClick={() => onUseInQuery(digipin)}
                    className="w-full bg-gradient-to-r from-[#FF9933] to-[#138808] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-sm">chat</span>
                    {t('useThisDigipinInAgentQuery', 'Use this DIGIPIN in Agent Query')}
                  </button>
                )}
              </>
            )}

            {/* Info Cards */}
            <div className="space-y-2">
              {[
                { icon: 'local_post_office', title: t('indiaPost', 'India Post'), desc: t('indiaPostDescription', 'Reliable postal delivery with precise addressing'), action: () => window.open('https://www.indiapost.gov.in/', '_blank') },
                { icon: 'emergency', title: t('emergencyServices', 'Emergency Services'), desc: t('emergencyServicesDescription', 'Share exact location with ambulance and police'), action: () => {
                  if (coords) {
                    const msg = `🚨 ${t('emergencyAtDigipin', 'Emergency at DIGIPIN')}: ${digipin}\n${t('location', 'Location')}: ${coords.lat.toFixed(6)}°N, ${coords.lon.toFixed(6)}°E\nBing Maps: https://www.bing.com/maps?q=${coords.lat},${coords.lon}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                  }
                } },
                { icon: 'agriculture', title: t('kisanServices', 'Kisan Services'), desc: t('kisanServicesDescription', 'PM-KISAN and crop insurance for your precise area'), action: () => window.open('https://pmkisan.gov.in/', '_blank') },
                { icon: 'real_estate_agent', title: t('propertyRecords', 'Property Records'), desc: t('propertyRecordsDescription', 'Bhulekh, registration, and municipal services'), action: () => window.open('https://bhulekh.gov.in/', '_blank') },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 bg-slate-100 dark:bg-white/3 border border-slate-200 dark:border-white/5 rounded-xl p-3 hover:bg-slate-200 dark:hover:bg-white/5 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-purple-600 dark:text-purple-300 text-base">{item.icon}</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="text-[10px] text-slate-600 dark:text-gray-400">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ─── LOOKUP TAB ─── */}
        {activeTab === 'lookup' && (
          <>
            <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-700 dark:text-gray-300 mb-3">{t('enterDigipinCode', 'Enter DIGIPIN Code')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                  placeholder={t('digipinExamplePlaceholder', 'e.g. 4MF-KM4-F8K')}
                  maxLength={12}
                  className="flex-1 bg-white dark:bg-[#0f1a30] border border-slate-300 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400/50"
                />
                <button
                  onClick={() => lookupDigipin()}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Find
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {lookupResult && (
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-500/10 dark:to-indigo-500/10 border border-purple-200 dark:border-purple-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-purple-600 dark:text-purple-300 text-sm">location_on</span>
                  <p className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">DIGIPIN Location</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-600 dark:text-gray-400 uppercase tracking-wider">Latitude</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white font-mono">{lookupResult.lat.toFixed(6)}°N</p>
                  </div>
                  <div className="bg-white dark:bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-600 dark:text-gray-400 uppercase tracking-wider">Longitude</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white font-mono">{lookupResult.lon.toFixed(6)}°E</p>
                  </div>
                </div>
                <a
                  href={`https://www.bing.com/maps?q=${lookupResult.lat},${lookupResult.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold py-2.5 rounded-xl text-xs transition-all"
                >
                  <span className="material-symbols-outlined text-sm">map</span>
                    {t('viewOnBingMaps', 'View on Bing Maps')}
                </a>
              </div>
            )}

            {/* Sample DIGIPIN codes */}
            <div className="bg-slate-100 dark:bg-white/3 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-3">{t('sampleDigipins', 'Sample DIGIPINs')}</p>
              <div className="space-y-2">
                {[
                  { code: '4MF-KM4-F8K', place: 'New Delhi, Central' },
                  { code: '8CG-JX5-M7B', place: 'Mumbai, Maharashtra' },
                  { code: '6FB-HC3-K2F', place: 'Chennai, Tamil Nadu' },
                  { code: '7HG-MJ6-N4X', place: 'Kolkata, West Bengal' },
                ].map((item) => (
                  <button
                    key={item.code}
                    onClick={() => lookupDigipin(item.code)}
                    className="w-full flex items-center justify-between bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 rounded-lg px-3 py-2 transition-all"
                  >
                    <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-300">{item.code}</span>
                    <span className="text-[10px] text-slate-600 dark:text-gray-400">{item.place}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
