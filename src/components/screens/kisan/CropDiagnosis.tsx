'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Image as ImageIcon, Loader2, AlertCircle, CheckCircle, Sparkles, Volume2, ShieldAlert, HeartPulse, Recycle, Droplets, ArrowRight } from 'lucide-react'
import { GroqService, getTranslation, getCurrentLanguage, type Language, getUserLocationData } from './kisan-utils'
import { useTTS } from '@/hooks/useTTS'

interface DiagnosisResult {
  crop_name: string;
  health_status: 'Healthy' | 'Diseased';
  disease_name: string;
  symptoms: string[];
  treatment: {
    organic: string[];
    chemical: string[];
    cultural: string[];
  };
  prevention: string[];
  urgency: 'Low' | 'Medium' | 'High';
}

interface CropDiagnosisProps {
  darkMode: boolean
}

export default function CropDiagnosis({ darkMode }: CropDiagnosisProps) {
  const [image, setImage] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentLang, setCurrentLang] = useState<Language>('en')
  const [retryCount, setRetryCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const { isPlaying, playTTS } = useTTS(currentLang);
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const groq = new GroqService()
  const MAX_RETRIES = 2
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024

  useEffect(() => {
    setCurrentLang(getCurrentLanguage())
    const handleLanguageChange = () => setCurrentLang(getCurrentLanguage())
    window.addEventListener('languageChange', handleLanguageChange)
    return () => window.removeEventListener('languageChange', handleLanguageChange)
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > MAX_IMAGE_SIZE) {
        setError(getTranslation('dashboard.cropDiagnosis.imageTooLarge', currentLang) || 'Image too large. Max 5MB.')
        return
      }
      if (!file.type.startsWith('image/')) {
        setError(getTranslation('dashboard.cropDiagnosis.invalidFileType', currentLang) || 'Invalid image file.')
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
        setResult(null)
        setError(null)
        setRetryCount(0)
      }
      reader.readAsDataURL(file)
    }
  }

  const compressImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.src = base64Str
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height
            height = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
    })
  }

  const analyzeCrop = async () => {
    if (!image) return

    setIsAnalyzing(true)
    setResult(null)
    setError(null)
    setRetryCount(0)
    setProgress(10)

    try {
      const compressedBase64 = await compressImage(image)
      const base64Data = compressedBase64.split(',')[1]
      setProgress(30)

      const userLoc = await getUserLocationData()
      const location = userLoc?.city || ''

      const languageNames: Record<Language, string> = {
        en: 'English', hi: 'Hindi (हिंदी)', ta: 'Tamil (தமிழ்)', te: 'Telugu (తెలుగు)',
        ml: 'Malayalam (മലയാളം)', kn: 'Kannada (ಕನ್ನಡ)', gu: 'Gujarati (ગુજરાતી)',
        bn: 'Bengali (বাংলা)', mr: 'Marathi (मराठी)', pa: 'Punjabi (ਪੰਜਾਬੀ)'
      }
      const languageName = languageNames[currentLang] || 'English'

      const prompt = `You are an expert agricultural pathologist. Analyze this crop image carefully.

**IMPORTANT**: Provide your entire response in ${languageName} language. All field values (crop_name, disease_name, symptoms, treatment, prevention) must be in ${languageName}.

Provide your analysis in this EXACT JSON format:
{
  "crop_name": "Name of the crop in ${languageName}",
  "health_status": "Healthy" or "Diseased",
  "disease_name": "Name of disease if diseased, otherwise 'None' (in ${languageName})",
  "symptoms": ["symptom 1 in ${languageName}", "symptom 2 in ${languageName}"],
  "treatment": {
    "organic": ["organic solution 1 in ${languageName}", "organic solution 2 in ${languageName}"],
    "chemical": ["chemical solution 1 in ${languageName}", "chemical solution 2 in ${languageName}"],
    "cultural": ["cultural practice 1 in ${languageName}", "cultural practice 2 in ${languageName}"]
  },
  "prevention": ["prevention tip 1 in ${languageName}", "prevention tip 2 in ${languageName}"],
  "urgency": "Low", "Medium", or "High"
}

Be specific and practical. Respond ONLY with valid JSON.`

      let success = false
      let attempts = 0
      let finalParsedResult: DiagnosisResult | null = null

      while (attempts <= MAX_RETRIES && !success) {
        try {
          attempts++
          if (attempts > 1) {
            setRetryCount(attempts - 1)
            await new Promise(resolve => setTimeout(resolve, 1500))
          }
          setProgress(40 + (attempts * 10))

          const response = await groq.analyzeCropImage(base64Data, prompt, currentLang, location)
          
          const cleanResponse = response
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .replace(/^[\s\S]*?({[\s\S]*})[\s\S]*$/, '$1')
            .trim()

          finalParsedResult = JSON.parse(cleanResponse)

          if (finalParsedResult && finalParsedResult.crop_name && finalParsedResult.health_status) {
            success = true
          } else {
            throw new Error('Incomplete JSON response')
          }
        } catch (e) {
          if (attempts > MAX_RETRIES) throw e
        }
      }

      if (success && finalParsedResult) {
        setProgress(100)
        setResult(finalParsedResult)
      } else {
        throw new Error('Analysis failed after retries')
      }
    } catch (error) {
      setError(
        getTranslation('dashboard.cropDiagnosis.analysisFailedRetry', currentLang) ||
        'Failed to analyze image. Please ensure the photo is clear and try again.'
      )
      setResult(null)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  const playAudio = async () => {
    if (!result) return;
    
    if (isPlaying) {
      playTTS('');
      return; 
    }

    try {
      let explanation = "";
      if (result.health_status === 'Healthy') {
        explanation = getTranslation('diagnosis.laymanHealthy', currentLang) || 
          `Great news! Your ${result.crop_name} crop looks healthy. To keep it this way, ensure proper watering and monitor for any future issues.`;
      } else {
        const baseString = getTranslation('diagnosis.laymanDiseased', currentLang) || 
          `It looks like your ${result.crop_name} is suffering from ${result.disease_name}. 
          Some common symptoms you might have noticed are ${result.symptoms.slice(0, 2).join(" and ")}. 
          To treat this, you can use organic solutions like ${result.treatment.organic[0] || "neem oil"} 
          or chemical options like ${result.treatment.chemical[0] || "appropriate fungicides"}. 
          For prevention in the future, ${result.prevention[0] || "ensure good drainage and proper spacing"}.`;
        
        explanation = baseString.replace('{crop_name}', result.crop_name)
                                .replace('{disease_name}', result.disease_name)
                                .replace('{symptoms}', result.symptoms.slice(0, 2).join(" and "))
                                .replace('{treatment_organic}', result.treatment.organic[0] || "neem oil")
                                .replace('{treatment_chemical}', result.treatment.chemical[0] || "appropriate fungicides")
                                .replace('{prevention}', result.prevention[0] || "ensure good drainage and proper spacing");
      }

      playTTS(explanation);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="pb-10 font-sans">
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

      {/* Hero Welcome */}
      {!image && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 mt-2">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="text-emerald-500" size={28} />
            {getTranslation('dashboard.cropDiagnosis.title', currentLang)}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium max-w-xs">
            {getTranslation('dashboard.cropDiagnosis.description', currentLang)}
          </p>
        </motion.div>
      )}

      {/* Image Preview & Scanner Frame */}
      {image && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/10 mb-6 bg-black flex justify-center border-4 border-slate-900/5 dark:border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Crop" className={`w-full h-[40vh] object-cover transition-opacity duration-500 ${isAnalyzing ? 'opacity-50 grayscale-[50%]' : 'opacity-100'}`} />
          
          {/* AI Viewfinder Overlays */}
          {isAnalyzing && (
            <div className="absolute inset-0 z-10 pointer-events-none">
              <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
              <motion.div 
                className="w-full h-1 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] opacity-70"
                animate={{ y: ['20%', '38vh', '20%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-x-0 bottom-12 flex flex-col items-center justify-center">
                <p className="text-white font-black tracking-widest uppercase text-xs mb-2 drop-shadow-md">
                   {retryCount > 0 ? getTranslation('diagnosis.retrying', currentLang) : getTranslation('diagnosis.analyzing', currentLang)}
                </p>
                <div className="w-48 bg-white/20 rounded-full h-1.5 backdrop-blur-sm overflow-hidden border border-white/20">
                  <div className="bg-emerald-400 h-full transition-all duration-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {!isAnalyzing && !result && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/30 flex flex-col justify-end p-6">
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-3 text-center">Ready for Analysis</p>
              <div className="flex gap-3">
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setImage(null)} className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 font-bold rounded-2xl py-3.5 text-sm transition-colors">
                  Retake
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={analyzeCrop} className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl py-3.5 text-sm shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2">
                  <Sparkles size={16} /> Run AI Scan
                </motion.button>
              </div>
            </div>
          )}

          {result && (
            <button onClick={() => { setImage(null); setResult(null); }} className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 text-white rounded-full p-2.5 transition-colors z-20">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {!image && (
          <motion.div key="inputs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => cameraInputRef.current?.click()}
                className="bg-emerald-500 text-white p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-lg shadow-emerald-500/20 border border-emerald-400/50 aspect-square group"
              >
                <div className="size-16 bg-white/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Camera size={32} />
                </div>
                <span className="font-black text-lg leading-tight">{getTranslation('diagnosis.takePhoto', currentLang)}</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => fileInputRef.current?.click()}
                className="bg-white dark:bg-slate-800/80 text-slate-800 dark:text-white p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-sm border border-slate-200 dark:border-white/5 aspect-square group"
              >
                <div className="size-16 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <ImageIcon size={32} />
                </div>
                <span className="font-bold text-sm leading-tight text-slate-600 dark:text-slate-300">{getTranslation('diagnosis.uploadFromGallery', currentLang)}</span>
              </motion.button>
            </div>

            <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20 rounded-3xl p-5 mt-4 flex gap-4">
              <div className="bg-amber-100 dark:bg-amber-500/20 w-10 h-10 rounded-2xl flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-amber-600 dark:text-amber-500" />
              </div>
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-400 text-sm mb-1">{getTranslation('diagnosis.tipsTitle', currentLang)}</p>
                <ul className="text-amber-700/80 dark:text-amber-500/80 text-xs font-semibold space-y-1">
                  <li>• {getTranslation('diagnosis.tip1', currentLang)}</li>
                  <li>• {getTranslation('diagnosis.tip2', currentLang)}</li>
                  <li>• {getTranslation('diagnosis.tip3', currentLang)}</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-2xl text-xs font-bold flex items-center gap-3">
            <span className="material-symbols-outlined">error</span>
            {error}
          </motion.div>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            
            {/* Health Status Header */}
            <div className={`p-6 rounded-3xl border shadow-sm relative overflow-hidden ${
              result.health_status === 'Diseased' 
                ? 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-500/20' 
                : 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-500/20'
            }`}>
              {/* Blur accent */}
              <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-50 ${result.health_status === 'Diseased' ? 'bg-red-500' : 'bg-emerald-500'}`} />
              
              <div className="flex justify-between items-start mb-4">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border flex items-center gap-1 ${
                  result.health_status === 'Diseased' 
                    ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:border-red-500/30' 
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:border-emerald-500/30'
                }`}>
                  {result.health_status === 'Diseased' ? <ShieldAlert size={12} /> : <CheckCircle size={12} />}
                  {result.health_status}
                </div>
                {result.health_status === 'Diseased' && (
                  <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                    result.urgency === 'High' ? 'bg-red-500 text-white' : result.urgency === 'Medium' ? 'bg-orange-500 text-white' : 'bg-yellow-400 text-yellow-900'
                  }`}>
                    Urgency: {result.urgency}
                  </div>
                )}
              </div>

              <h3 className={`text-2xl font-black leading-tight mb-1 ${result.health_status === 'Diseased' ? 'text-red-950 dark:text-red-100' : 'text-emerald-950 dark:text-emerald-100'}`}>
                {result.health_status === 'Diseased' ? result.disease_name : 'No Issues Detected'}
              </h3>
              <p className={`text-sm font-bold opacity-80 ${result.health_status === 'Diseased' ? 'text-red-900 dark:text-red-300' : 'text-emerald-900 dark:text-emerald-300'}`}>
                Crop: {result.crop_name}
              </p>

              <button 
                onClick={playAudio} 
                className={`mt-5 w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
                  result.health_status === 'Diseased'
                    ? (isPlaying ? 'bg-red-200 text-red-800' : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20')
                    : (isPlaying ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20')
                }`}
              >
                {isPlaying ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                {isPlaying ? 'Playing Audio...' : 'Listen to Report'}
              </button>
            </div>

            {/* Symptoms / Details */}
            {result.health_status === 'Diseased' && (
              <div className="bg-white dark:bg-slate-800/80 p-5 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-white/5 pb-2">
                  <HeartPulse className="text-red-500" size={16} /> Symptoms
                </h4>
                <ul className="space-y-2">
                  {result.symptoms.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                      <span className="text-red-400 font-bold">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Treatment */}
            {result.health_status === 'Diseased' && (
              <div className="bg-white dark:bg-slate-800/80 p-5 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-white/5 pb-2">
                  <Droplets className="text-blue-500" size={16} /> Recommended Treatment
                </h4>
                
                <div className="space-y-4">
                  {result.treatment.organic.length > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-500/5 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/10">
                      <h5 className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Organic Solutions</h5>
                      <ul className="space-y-1">
                        {result.treatment.organic.map((t, i) => <li key={i} className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex gap-2"><ArrowRight size={12} className="shrink-0 mt-0.5 opacity-50" /><span>{t}</span></li>)}
                      </ul>
                    </div>
                  )}
                  {result.treatment.chemical.length > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-500/5 p-4 rounded-2xl border border-purple-100 dark:border-purple-500/10">
                      <h5 className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-2">Chemical Options</h5>
                      <ul className="space-y-1">
                        {result.treatment.chemical.map((t, i) => <li key={i} className="text-xs font-semibold text-purple-900 dark:text-purple-200 flex gap-2"><ArrowRight size={12} className="shrink-0 mt-0.5 opacity-50" /><span>{t}</span></li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prevention */}
            <div className="bg-blue-50 dark:bg-blue-500/5 p-5 rounded-3xl border border-blue-100 dark:border-blue-500/10 mb-6 shadow-sm">
              <h4 className="flex items-center gap-2 text-sm font-black text-blue-800 dark:text-blue-400 uppercase tracking-wider mb-3">
                <Recycle size={16} /> Prevention Guide
              </h4>
              <ul className="space-y-2">
                {result.prevention.map((p, i) => (
                  <li key={i} className="flex gap-2 text-xs font-semibold text-blue-900 dark:text-blue-200">
                    <span className="text-blue-400 font-bold">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2">
              <motion.button 
                whileTap={{ scale: 0.95 }} 
                onClick={() => {
                  const reportLines = [
                    `🌾 CROP HEALTH DIAGNOSTIC REPORT`,
                    `Generated by Kisan Mitra AI — Bharat Setu`,
                    `Date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                    ``,
                    `━━━━━━━━━━━━━━━━━━━━━━`,
                    `CROP: ${result.crop_name}`,
                    `STATUS: ${result.health_status === 'Diseased' ? '⚠️ Diseased' : '✅ Healthy'}`,
                    result.health_status === 'Diseased' ? `DISEASE: ${result.disease_name}` : '',
                    result.health_status === 'Diseased' ? `URGENCY: ${result.urgency}` : '',
                    ``,
                    result.symptoms?.length > 0 ? `📋 OBSERVED SYMPTOMS:` : '',
                    ...(result.symptoms || []).map((s, i) => `  ${i + 1}. ${s}`),
                    ``,
                    result.treatment?.organic?.length > 0 ? `🌿 ORGANIC TREATMENT:` : '',
                    ...(result.treatment?.organic || []).map((t, i) => `  ${i + 1}. ${t}`),
                    ``,
                    result.treatment?.chemical?.length > 0 ? `🧪 CHEMICAL TREATMENT:` : '',
                    ...(result.treatment?.chemical || []).map((t, i) => `  ${i + 1}. ${t}`),
                    ``,
                    result.treatment?.cultural?.length > 0 ? `🧑‍🌾 CULTURAL PRACTICES:` : '',
                    ...(result.treatment?.cultural || []).map((t, i) => `  ${i + 1}. ${t}`),
                    ``,
                    result.prevention?.length > 0 ? `🔒 PREVENTION GUIDE:` : '',
                    ...(result.prevention || []).map((p, i) => `  ${i + 1}. ${p}`),
                    ``,
                    `━━━━━━━━━━━━━━━━━━━━━━`,
                    `Powered by Kisan Mitra · Bharat Setu Digital India`,
                    `This report is AI-generated. Consult a local agricultural officer for confirmation.`,
                  ].filter(line => line !== null && line !== undefined).join('\n');

                  navigator.share?.({
                    title: `Crop Diagnosis: ${result.disease_name || result.crop_name}`,
                    text: reportLines,
                  });
                }} 
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-black rounded-2xl py-4 flex justify-center items-center gap-2 shadow-lg"
              >
                <span className="material-symbols-outlined text-[18px]">share</span>
                Share Full Report
              </motion.button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
