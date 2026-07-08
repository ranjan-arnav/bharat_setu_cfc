'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Search, Calculator } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { MarketService, type MarketPrice, getTranslation, getCurrentLanguage, type Language, getUserLocationData, type LocationData } from './kisan-utils';
import PriceChart from './PriceChart';

export default function MarketCard() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentLang, setCurrentLang] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [calcQuantity, setCalcQuantity] = useState<number>(10);
  const [calcTransportCost, setCalcTransportCost] = useState<number>(15);
  const [selectedCalcCrop, setSelectedCalcCrop] = useState<string>('Wheat');

  const loadPrices = useCallback(async (location?: LocationData | null) => {
    setLoading(true);
    try {
      const state = location?.state || location?.city || undefined;
      const data = await MarketService.fetchMarketPrices(state);
      const dataWithDistances = await MarketService.calculateDistances(data);
      const enrichedData = MarketService.enrichPriceData(dataWithDistances);
      setPrices(enrichedData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initializeLocation = async () => {
      const location = await getUserLocationData();
      setUserLocation(location);
      await loadPrices(location);
    };

    void initializeLocation();
    setCurrentLang(getCurrentLanguage());
  }, [loadPrices]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setLoading(true);
        try {
          const results = await MarketService.searchPrices(searchQuery);
          setPrices(MarketService.enrichPriceData(results));
        } finally {
          setLoading(false);
        }
      } else if (searchQuery.length === 0) {
        void loadPrices(userLocation);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [searchQuery, userLocation, loadPrices]);

  const advice = MarketService.getMarketAdvice(prices);
  const selectedCrop = prices.find((price) => price.name.toLowerCase() === selectedCalcCrop.toLowerCase());
  const gross = (selectedCrop?.price || 0) * calcQuantity;
  const net = Math.max(0, gross - calcQuantity * calcTransportCost);

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black flex items-center gap-2 text-[#138808]">
          <TrendingUp size={18} />
          {getTranslation('crops.marketPrices', currentLang)}
        </h3>
        <button onClick={() => loadPrices(userLocation)} disabled={loading} className="p-2 rounded-lg border border-black/10 dark:border-white/10">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 p-4 space-y-4">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={getTranslation('crops.searchCrops', currentLang)}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-10 pr-3 min-h-11 rounded-xl border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-black/20 text-sm"
          />
        </div>

        {advice.length > 0 && (
          <div className="space-y-2">
            {advice.map((tip, index) => {
              const icon = tip.key === 'highPriceIncrease' ? '📈' : tip.key === 'pricesDecline' ? '📉' : '💹';
              const cropNames = tip.crops.join(', ');
              const message = tip.key === 'highPriceIncrease'
                ? `${icon} ${getTranslation('market.highpriceincrease', currentLang)} ${cropNames}.`
                : tip.key === 'pricesDecline'
                  ? `${icon} ${getTranslation('market.pricesdecline', currentLang)} ${cropNames}.`
                  : `${icon} ${getTranslation('market.stableprices', currentLang)} ${cropNames}.`;

              return (
                <div key={index} className="flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-2.5">
                  <AlertTriangle className="text-yellow-600 mt-0.5" size={14} />
                  <p className="text-xs text-slate-700 dark:text-gray-200">{message}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          {prices.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())).map((item) => (
            <div key={item.id} className="rounded-xl border border-black/10 dark:border-white/10 p-3 bg-slate-50 dark:bg-black/20">
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <p className="text-sm font-bold">{item.name}</p>
                  <p className="text-[11px] text-slate-500">{item.market}, {item.state}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-[#138808]">₹{item.price.toLocaleString('en-IN')}</p>
                  <p className={`text-[11px] font-bold ${item.trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {item.trend === 'up' ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />} {Math.abs(item.change)}%
                  </p>
                </div>
              </div>
              <div className="h-14 -mx-1">
                <PriceChart data={item.priceHistory} trend={item.trend} height={56} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-3">
          <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2 flex items-center gap-1"><Calculator size={13} /> Profit Calculator</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <input value={selectedCalcCrop} onChange={(event) => setSelectedCalcCrop(event.target.value)} className="min-h-10 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/20 px-3 text-sm" placeholder="Crop" />
            <input type="number" value={calcQuantity} onChange={(event) => setCalcQuantity(Number(event.target.value || 0))} className="min-h-10 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/20 px-3 text-sm" placeholder="Qty qtl" />
            <input type="number" value={calcTransportCost} onChange={(event) => setCalcTransportCost(Number(event.target.value || 0))} className="min-h-10 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/20 px-3 text-sm" placeholder="Transport/qtl" />
          </div>
          <p className="text-xs">Gross: ₹{gross.toLocaleString('en-IN')} · Net: <span className="font-bold text-emerald-700 dark:text-emerald-400">₹{net.toLocaleString('en-IN')}</span></p>
        </div>
      </div>
    </motion.section>
  );
}
