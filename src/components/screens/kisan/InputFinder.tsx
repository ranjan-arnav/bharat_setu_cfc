'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Search, Store, IndianRupee, Phone, Navigation, MapPinned, Zap, RefreshCw, BadgeCheck, AlertCircle } from 'lucide-react'
import type { InputShop } from '@/lib/kisan/inputShops'
import { getTranslation, getCurrentLanguage, type Language } from './kisan-utils'
import { InputShopService } from '@/lib/kisan/inputShops'

export default function InputFinder() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<'all' | 'pmksk' | 'private'>('all')
  const [currentLang, setCurrentLang] = useState<Language>('en')
  const [shops, setShops] = useState<InputShop[]>([])
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationName, setLocationName] = useState<string>('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [generatingShops, setGeneratingShops] = useState(false)

  useEffect(() => {
    setCurrentLang(getCurrentLanguage())
    const handleLanguageChange = () => setCurrentLang(getCurrentLanguage())
    window.addEventListener('languageChange', handleLanguageChange)
    return () => window.removeEventListener('languageChange', handleLanguageChange)
  }, [])

  const loadShops = () => {
    const allShops = InputShopService.getAllShops()
    setShops(allShops)
  }

  const requestLocation = useCallback(async () => {
    setLocationLoading(true)
    const location = await InputShopService.getUserLocation()

    if (location) {
      setUserLocation(location)
      const shouldRegenerate = InputShopService.shouldRegenerateForLocation(location.lat, location.lng)

      if (shouldRegenerate) {
        setGeneratingShops(true)
        const newShops = await InputShopService.generateShopsWithLLM(location.lat, location.lng)
        const locName = await InputShopService.getLocationName(location.lat, location.lng)
        setLocationName(locName)
        setGeneratingShops(false)
        
        const shopsWithDistance = InputShopService.getShopsNearLocation(location.lat, location.lng, 100)
        setShops(shopsWithDistance.length > 0 ? shopsWithDistance : newShops)
      } else {
        const locName = await InputShopService.getLocationName(location.lat, location.lng)
        setLocationName(locName)
        const shopsWithDistance = InputShopService.getShopsNearLocation(location.lat, location.lng, 100)
        setShops(shopsWithDistance)
      }
    } else {
      loadShops()
    }
    setLocationLoading(false)
  }, [])

  useEffect(() => {
    requestLocation()
  }, [requestLocation])

  const filteredShops = (() => {
    let result = [...shops]
    if (selectedType !== 'all') {
      result = result.filter((shop) => shop.type === selectedType)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((shop) =>
        shop.name.toLowerCase().includes(q) ||
        shop.address.toLowerCase().includes(q) ||
        shop.items.some((item) => item.name.toLowerCase().includes(q))
      )
    }
    return result
  })()

  // Categories for Segmented Control
  const categories = [
    { id: 'all', label: `${getTranslation('inputFinder.allShops', currentLang)} (${shops.length})` },
    { id: 'pmksk', label: getTranslation('inputFinder.pmkskCenters', currentLang) },
    { id: 'private', label: getTranslation('inputFinder.privateShops', currentLang) },
  ] as const;

  return (
    <div className="pb-10 font-sans">
      
      {/* Hero Welcome */}
      <div className="mb-6 mt-2">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Store className="text-indigo-500" size={28} />
          {getTranslation('inputFinder.title', currentLang)}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">
          {getTranslation('inputFinder.description', currentLang)}
        </p>
      </div>

      {/* Location Status Banners */}
      <AnimatePresence mode="popLayout">
        {locationLoading && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
            <div className="bg-blue-50/80 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4 flex items-center gap-3 shadow-sm backdrop-blur-sm">
              <RefreshCw className="text-blue-500 animate-spin" size={20} />
              <p className="text-blue-700 dark:text-blue-300 font-bold text-sm">Locating nearby shops...</p>
            </div>
          </motion.div>
        )}

        {generatingShops && !locationLoading && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
            <div className="bg-purple-50/80 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-2xl p-4 flex gap-4 shadow-sm backdrop-blur-sm">
              <div className="relative flex shrink-0 mt-0.5">
                <div className="absolute inset-0 bg-purple-500/20 rounded-full animate-ping" />
                <Zap className="text-purple-600 dark:text-purple-400 relative z-10" size={20} />
              </div>
              <div>
                <p className="text-purple-900 dark:text-purple-200 font-bold text-sm mb-0.5">Finding shops near {locationName || 'your location'}</p>
                <p className="text-purple-600 dark:text-purple-400 text-xs font-semibold">Using AI to discover reliable agri-input centers...</p>
              </div>
            </div>
          </motion.div>
        )}

        {userLocation && !locationLoading && !generatingShops && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4 overflow-hidden">
            <div className="bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-4 shadow-sm backdrop-blur-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <MapPinned size={18} />
                </div>
                <div>
                  <p className="text-emerald-900 dark:text-emerald-200 font-bold text-sm leading-tight">Verified Location</p>
                  <p className="text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold mt-0.5">Shops near {locationName || 'you'}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (userLocation) {
                    InputShopService.clearCache()
                    await requestLocation()
                  }
                }}
                className="shrink-0 p-2 bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 rounded-xl font-bold hover:bg-emerald-50 dark:hover:bg-emerald-500/30 transition-colors shadow-sm border border-emerald-100 dark:border-emerald-500/30"
                aria-label="Refresh Location"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky top-0 z-20 bg-slate-50 dark:bg-[#071020] pt-2 pb-3 -mx-4 px-4 border-b border-slate-200/60 dark:border-white/5 shadow-sm">
        {/* Search Bar */}
        <div className="relative group mb-3">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={getTranslation('inputFinder.searchPlaceholder', currentLang)}
            className="block w-full pl-11 pr-4 py-3.5 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
          />
        </div>

        {/* Animated Segmented Control */}
        <div className="relative flex p-1.5 bg-slate-200/60 dark:bg-slate-800/80 rounded-[20px] shadow-inner">
          {categories.map((cat) => {
            const isActive = selectedType === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedType(cat.id as typeof selectedType)}
                className={`relative flex-1 py-2 z-10 transition-colors duration-300 text-xs font-bold tracking-wide ${
                  isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabFilter"
                    className="absolute inset-0 bg-white dark:bg-slate-700 shadow-sm rounded-[14px] -z-10 border border-black/5 dark:border-white/5"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                {cat.label.split(' (')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4 mt-4">
          {filteredShops.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 bg-white/50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
              <Store className="text-slate-300 dark:text-slate-600 mb-4" size={48} />
              <p className="text-lg font-black text-slate-700 dark:text-slate-300">No shops found</p>
              <p className="text-sm font-medium text-slate-500 mt-1">Try adjusting your filters or location</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredShops.map((shop, index) => {
                const isPMKSK = shop.type === 'pmksk';
                return (
                  <motion.div
                    layout
                    key={shop.name + shop.address}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.05, 0.3) }}
                    className="bg-white dark:bg-slate-800/80 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden relative group hover:border-indigo-500/30 transition-colors"
                  >
                    {/* decorative background glow for PMKSK */}
                    {isPMKSK && (
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    )}

                    <div className="flex items-start justify-between gap-4 mb-4 relative z-10">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{shop.name}</h3>
                          {isPMKSK ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 flex items-center gap-1">
                              <BadgeCheck size={12} /> PMKSK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-200">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                          <MapPin size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[200px]">{shop.address}</span>
                        </p>
                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <Navigation size={12} className="shrink-0" />
                          <span>{shop.distance} {getTranslation('inputFinder.kmAway', currentLang)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 mb-5 border border-slate-100 dark:border-white/5 relative z-10">
                      <p className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2.5 flex items-center gap-1">
                        <Zap size={12} className="text-amber-500" />
                        {getTranslation('inputFinder.currentPrices', currentLang).replace(':', '')}
                      </p>
                      <div className="space-y-2">
                        {shop.items.map((item, i) => (
                          <div key={item.name + i} className="flex items-end justify-between text-xs border-b border-slate-200 dark:border-slate-800 pb-1.5 last:border-0 last:pb-0">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                            <span className="font-black text-slate-900 dark:text-white flex items-center bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md shadow-sm border border-slate-100 dark:border-slate-700">
                              <IndianRupee size={12} className="mr-0.5" />
                              {item.price}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 relative z-10">
                      <motion.a
                        href={`tel:${shop.phone}`}
                        whileTap={{ scale: 0.95 }}
                        className="flex-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-50 font-bold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Phone size={16} />
                        {getTranslation('inputFinder.call', currentLang)}
                      </motion.a>
                      <motion.a
                        href={`https://www.bing.com/maps?q=${encodeURIComponent(shop.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileTap={{ scale: 0.95 }}
                        className="flex-[1.5] bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20"
                      >
                        <Navigation size={16} />
                        {getTranslation('inputFinder.getDirections', currentLang)}
                      </motion.a>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

      <div className="mt-8 bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20 rounded-3xl p-5 flex gap-4 shadow-sm">
        <div className="bg-amber-100 dark:bg-amber-500/20 w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
          <AlertCircle size={20} className="text-amber-600 dark:text-amber-500" />
        </div>
        <div>
          <p className="font-bold text-amber-900 dark:text-amber-400 text-sm mb-1">Did you know?</p>
          <p className="text-amber-700/80 dark:text-amber-500/80 text-xs font-semibold leading-relaxed">
            PMKSK (Pradhan Mantri Kisan Samriddhi Kendra) shops usually offer subsidized prices on high-quality fertilizers and seeds verified by the government.
          </p>
        </div>
      </div>
    </div>
  )
}
