import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sprout, Loader2, CheckCircle, MapPin, Droplets, TrendingUp, Calendar, IndianRupee, ThermometerSun, Sparkles, ChevronRight } from 'lucide-react'
import { GroqService, getTranslation, getCurrentLanguage, type Language, getUserLocationData } from './kisan-utils'

interface RecommendationResult {
  crop_name: string
  yield: string
  water: string
  conditions: string
  market: string
  duration: string
  investment: string
}

export default function CropRecommendation() {
  const [formData, setFormData] = useState({
    soilType: '',
    location: '',
    season: '',
    waterAvailability: '',
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [recommendations, setRecommendations] = useState<RecommendationResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentLang, setCurrentLang] = useState<Language>('en')
  const groq = new GroqService()

  useEffect(() => {
    setCurrentLang(getCurrentLanguage())

    const initLoc = async () => {
      const loc = await getUserLocationData()
      if (loc) {
        setFormData(prev => ({ ...prev, location: loc.city }))
      }
    }
    initLoc()

    const handleLanguageChange = () => {
      setCurrentLang(getCurrentLanguage())
    }

    window.addEventListener('languageChange', handleLanguageChange)
    return () => window.removeEventListener('languageChange', handleLanguageChange)
  }, [])

  const soilTypes = [
    { key: 'loamy', label: getTranslation('cropRecommendation.loamy', currentLang) },
    { key: 'clay', label: getTranslation('cropRecommendation.clay', currentLang) },
    { key: 'sandy', label: getTranslation('cropRecommendation.sandy', currentLang) },
    { key: 'silt', label: getTranslation('cropRecommendation.silt', currentLang) },
    { key: 'redSoil', label: getTranslation('cropRecommendation.redSoil', currentLang) },
    { key: 'blackSoil', label: getTranslation('cropRecommendation.blackSoil', currentLang) },
    { key: 'alluvial', label: getTranslation('cropRecommendation.alluvial', currentLang) },
  ]
  const seasons = [
    { key: 'kharif', label: getTranslation('cropRecommendation.kharif', currentLang) },
    { key: 'rabi', label: getTranslation('cropRecommendation.rabi', currentLang) },
    { key: 'zaid', label: getTranslation('cropRecommendation.zaid', currentLang) },
  ]
  const waterLevels = [
    { key: 'abundant', label: getTranslation('cropRecommendation.abundant', currentLang) },
    { key: 'moderate', label: getTranslation('cropRecommendation.moderate', currentLang) },
    { key: 'limited', label: getTranslation('cropRecommendation.limited', currentLang) },
    { key: 'rainDependent', label: getTranslation('cropRecommendation.rainDependent', currentLang) },
  ]

  const handleGenerate = async () => {
    if (!formData.soilType || !formData.location || !formData.season || !formData.waterAvailability) {
      alert(getTranslation('cropRecommendation.fillRequiredFields', currentLang))
      return
    }

    setIsGenerating(true)
    setRecommendations(null)
    setError(null)

    try {
      const response = await groq.getCropRecommendation(
        formData.soilType,
        formData.location,
        `${formData.season} with ${formData.waterAvailability} water availability`,
        currentLang
      )

      try {
        const jsonStart = response.indexOf('[')
        const jsonEnd = response.lastIndexOf(']') + 1
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = response.substring(jsonStart, jsonEnd)
          const parsed = JSON.parse(jsonStr)
          setRecommendations(parsed)
        } else {
          throw new Error("No JSON found")
        }
      } catch (e) {
        console.log("JSON parsing failed, falling back to Markdown parser", e)
        setRecommendations(parseMarkdownResponse(response))
      }

    } catch (error) {
      console.error('Recommendation error:', error)
      setError(getTranslation('cropRecommendation.errorMessage', currentLang))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="pb-10 font-sans">
      {/* Hero Welcome */}
      <div className="mb-6 mt-2">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Sprout className="text-emerald-500" size={28} />
          {getTranslation('cropRecommendation.title', currentLang)}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">
          {getTranslation('cropRecommendation.description', currentLang)}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!recommendations && !isGenerating && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-5"
          >
            {/* Soil Type */}
            <div className="bg-white dark:bg-slate-800/80 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 tracking-wide uppercase">
                <ThermometerSun className="text-amber-500" size={18} />
                {getTranslation('cropRecommendation.soilType', currentLang)}
              </label>
              <div className="flex flex-wrap gap-2">
                {soilTypes.map((type) => {
                  const isActive = formData.soilType === type.label;
                  return (
                    <motion.button
                      key={type.key}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setFormData({ ...formData, soilType: type.label })}
                      className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all relative overflow-hidden ${
                        isActive
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 border-transparent'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5'
                      }`}
                    >
                      {isActive && <div className="absolute inset-0 bg-white/20" />}
                      {type.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Location & Season Group */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-slate-800/80 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 tracking-wide uppercase">
                  <MapPin className="text-blue-500" size={18} />
                  {getTranslation('cropRecommendation.location', currentLang)}
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder={getTranslation('cropRecommendation.locationPlaceholder', currentLang)}
                  className="w-full px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all placeholder-slate-400"
                />
              </div>

              <div className="bg-white dark:bg-slate-800/80 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 tracking-wide uppercase">
                  <Calendar className="text-orange-500" size={18} />
                  {getTranslation('cropRecommendation.season', currentLang)}
                </label>
                <div className="flex bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-white/5">
                  {seasons.map((season) => {
                    const isActive = formData.season === season.label;
                    return (
                      <motion.button
                        key={season.key}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setFormData({ ...formData, season: season.label })}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                          isActive
                            ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        {season.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Water */}
            <div className="bg-white dark:bg-slate-800/80 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 dark:bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 tracking-wide uppercase">
                <Droplets className="text-cyan-500" size={18} />
                {getTranslation('cropRecommendation.waterAvailability', currentLang)}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {waterLevels.map((level) => {
                  const isActive = formData.waterAvailability === level.label;
                  return (
                    <motion.button
                      key={level.key}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setFormData({ ...formData, waterAvailability: level.label })}
                      className={`px-4 py-3 rounded-2xl text-xs font-bold transition-all relative overflow-hidden ${
                        isActive
                          ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20 border-transparent'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5'
                      }`}
                    >
                      {isActive && <div className="absolute inset-0 bg-white/20" />}
                      {level.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined">error</span>
                {error}
              </motion.div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleGenerate}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black rounded-3xl py-4 flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-500/20"
            >
              <Sparkles size={20} />
              {getTranslation('cropRecommendation.generateRecommendations', currentLang)}
            </motion.button>
          </motion.div>
        )}

        {/* Loading State */}
        {isGenerating && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="relative size-24 flex items-center justify-center mb-6">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
              <div className="absolute inset-2 bg-emerald-500/20 rounded-full animate-ping" style={{ animationDelay: '300ms' }} />
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full shadow-xl flex items-center justify-center z-10">
                <Loader2 className="animate-spin text-emerald-600" size={32} />
              </div>
            </div>
            <p className="text-lg font-black text-slate-800 dark:text-white">
              {getTranslation('cropRecommendation.analyzing', currentLang)}
            </p>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2 text-center max-w-[250px]">
              {getTranslation('cropRecommendation.gettingRecommendations', currentLang)}
            </p>
          </motion.div>
        )}

        {/* Results View */}
        {recommendations && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <CheckCircle className="text-emerald-500" size={18} />
                {getTranslation('cropRecommendation.recommendationsReady', currentLang)}
              </h3>
            </div>

            {recommendations.map((crop, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className={`bg-white dark:bg-slate-800/80 rounded-3xl p-5 border shadow-sm relative overflow-hidden ${
                  idx === 0 
                    ? 'border-emerald-500/30 dark:border-emerald-500/30' 
                    : 'border-slate-200 dark:border-white/5'
                }`}
              >
                {/* Visual Flair for Top Match */}
                {idx === 0 && (
                  <>
                    <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                    <div className="absolute top-4 right-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black tracking-widest px-2.5 py-1 rounded-full uppercase flex items-center gap-1 shadow-sm">
                      <Sparkles size={10} /> Top Match
                    </div>
                  </>
                )}

                <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mb-4 leading-none">
                  {crop.crop_name}
                </h3>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1">
                      <TrendingUp size={12} className="text-blue-500" />
                      {getTranslation('cropRecommendation.yieldLabel', currentLang).replace(':', '')}
                    </p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-snug">{crop.yield}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1">
                      <IndianRupee size={12} className="text-amber-500" />
                      {getTranslation('cropRecommendation.marketLabel', currentLang).replace(':', '')}
                    </p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-snug">{crop.market}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-white/5 col-span-2 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-0.5 flex items-center gap-1">
                        <Calendar size={12} className="text-purple-500" />
                        {getTranslation('cropRecommendation.durationLabel', currentLang).replace(':', '')}
                      </p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{crop.duration}</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-0.5 flex items-center justify-end gap-1">
                        <Droplets size={12} className="text-cyan-500" />
                        Water Req.
                      </p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{crop.water}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50/50 dark:bg-emerald-500/5 p-3 rounded-2xl border border-emerald-100/50 dark:border-emerald-500/10 mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-bold mb-1 flex items-center gap-1">
                    <ThermometerSun size={12} />
                    {getTranslation('cropRecommendation.conditionsLabel', currentLang).replace(':', '')}
                  </p>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">{crop.conditions}</p>
                </div>
                
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 italic px-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  {getTranslation('cropRecommendation.investmentLabel', currentLang)} {crop.investment}
                </p>
              </motion.div>
            ))}

            <div className="flex gap-3 pt-4">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setRecommendations(null)
                  setFormData({ soilType: '', location: '', season: '', waterAvailability: '' })
                }}
                className="flex-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">refresh</span>
                {getTranslation('cropRecommendation.newSearch', currentLang)}
              </motion.button>
              
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const shareText = recommendations.map(c => 
                    `${c.crop_name}\nYield: ${c.yield}\nMarket: ${c.market}`
                  ).join('\n---\n')
                  navigator.share?.({
                    title: getTranslation('cropRecommendation.shareTitle', currentLang),
                    text: shareText,
                  })
                }}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold rounded-2xl py-4 text-sm transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">share</span>
                {getTranslation('cropRecommendation.share', currentLang)}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function parseMarkdownResponse(text: string): RecommendationResult[] {
  const crops: RecommendationResult[] = []

  const cleanText = text.replace(/\*\*/g, '').replace(/###/g, '')

  const parts = cleanText.split(/(?=\n\d+\.\s+)/).filter(p => p.trim().length > 20)

  parts.forEach(part => {
    const lines = part.trim().split('\n')
    const firstLine = lines[0].replace(/^\d+\.\s*/, '').trim()
    const name = firstLine.length < 50 ? firstLine : 'Suggested Crop'

    const getVal = (keywords: string[]) => {
      for (const keyword of keywords) {
        const regex = new RegExp(`${keyword}[:\\-]\\s*(.*?)(?=\\n|$)`, 'i')
        const match = part.match(regex)
        if (match) return match[1].trim()
      }
      return 'Refer to description'
    }

    if (lines.length > 1) {
      crops.push({
        crop_name: name,
        yield: getVal(['Yield', 'Expected yield', 'Production']),
        water: getVal(['Water', 'Water requirements', 'Irrigation']),
        conditions: getVal(['Conditions', 'Ideal growing conditions', 'Climate', 'Soil']),
        market: getVal(['Market', 'Market potential', 'Price', 'Selling price']),
        duration: getVal(['Duration', 'Growing duration', 'Time']),
        investment: getVal(['Investment', 'Cost', 'Initial investment'])
      })
    }
  })

  if (crops.length === 0) {
    return [{
      crop_name: "Recommendation Details",
      yield: "See below",
      water: "See below",
      conditions: text.slice(0, 100) + "...",
      market: "See below",
      duration: "See below",
      investment: "See below"
    }]
  }

  return crops
}
