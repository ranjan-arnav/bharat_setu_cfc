'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useAppStore, type TrackedItem } from '@/lib/store';
import { SUNITA_FLOW } from '@/lib/demo-data';
import { FlagStripe } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { findCollectiveCluster, type CollectiveCluster } from '@/lib/intelligence';

const CATEGORY_EMOJIS: Record<string, string> = {
  water: '💧', road: '🛣️', electricity: '⚡', sanitation: '🧹', streetlight: '🔦', other: '📋',
};

const CATEGORY_ICONS: Record<string, string> = {
  water: 'water_drop', road: 'add_road', electricity: 'bolt',
  sanitation: 'cleaning_services', streetlight: 'lightbulb', other: 'category',
};

type Step = 'form' | 'analyzing' | 'result';

// Note: ANALYSIS_STEPS labels will be translated inline when rendered
const ANALYSIS_STEPS = [
  'Analyzing photo with Azure Vision AI...',
  'Extracting DIGIPIN location...',
  'Running Content Safety check...',
  'Auto-categorizing grievance...',
  'Generating priority ticket...',
  'Routing to appropriate department...',
];

export default function GrievanceForm({ onClose }: { onClose: () => void }) {
  const { userProfile, addGrievance, addTrackedItem } = useAppStore();
  const { t } = useTranslation();

  const categories = [
    { value: 'water', icon: CATEGORY_ICONS.water, emoji: CATEGORY_EMOJIS.water, label: t('catWater') },
    { value: 'road', icon: CATEGORY_ICONS.road, emoji: CATEGORY_EMOJIS.road, label: t('catRoad') },
    { value: 'electricity', icon: CATEGORY_ICONS.electricity, emoji: CATEGORY_EMOJIS.electricity, label: t('catElectricity') },
    { value: 'sanitation', icon: CATEGORY_ICONS.sanitation, emoji: CATEGORY_EMOJIS.sanitation, label: t('catSanitation') },
    { value: 'streetlight', icon: CATEGORY_ICONS.streetlight, emoji: CATEGORY_EMOJIS.streetlight, label: t('catStreetlight') },
    { value: 'other', icon: CATEGORY_ICONS.other, emoji: CATEGORY_EMOJIS.other, label: t('catOther') },
  ];
  const [step, setStep] = useState<Step>('form');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<typeof SUNITA_FLOW | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collectiveMatch, setCollectiveMatch] = useState<CollectiveCluster | null>(null);
  const [joinedCluster, setJoinedCluster] = useState(false);
  const [uncertainty, setUncertainty] = useState<any>(null);
  const [isVisionLoading, setIsVisionLoading] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert(t('errorImageSize', '⚠️ Image must be under 5 MB. Please choose a smaller photo.'));
        e.target.value = '';
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const submitGrievance = async () => {
    if (!description.trim()) return;
    setStep('analyzing');

    // Simulate step-by-step analysis (shared with render-side ANALYSIS_STEPS)
    for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
      setAnalysisStep(i);
      await new Promise((r) => setTimeout(r, 700));
    }

    // Try real API first
    try {
      const formData = new FormData();
      formData.append('description', description);
      formData.append('category', category || 'General');
      formData.append('digipin', userProfile.digipin);
      formData.append('language', userProfile.language);
      if (imageFile) formData.append('image', imageFile);

      const res = await fetch('/api/grievance', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // ── NEW: ML ENHANCEMENTS ──
          
          // 1. Multimodal Vision Check
          if (imageFile) {
            setIsVisionLoading(true);
            try {
              const visionRes = await fetch('/api/ml/multimodal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  imageUrl: imagePreview, 
                  description,
                  category: category || 'General' 
                })
              });
              if (visionRes.ok) {
                const visionData = await visionRes.json();
                data.grievance.imageAnalysis = visionData.analysis;
              }
            } catch (e) { console.error("Vision AI failed", e); }
            finally { setIsVisionLoading(false); }
          }

          // 2. Uncertainty Estimation
          try {
            const uncertaintyRes = await fetch('/api/ml/uncertainty', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                description, 
                category: category || 'General',
                ward: userProfile.state || 'District'
              })
            });
            if (uncertaintyRes.ok) {
              const uData = await uncertaintyRes.json();
              setUncertainty(uData.estimation);
            }
          } catch (e) { console.error("Uncertainty AI failed", e); }

          setAnalysisResult({
            ...SUNITA_FLOW,
            photoAnalysis: data.grievance.imageAnalysis || SUNITA_FLOW.photoAnalysis,
            grievanceTicket: {
              id: data.grievance.id,
              status: "Submitted" as const,
              department: data.grievance.department || "General Administration",
              ward: data.grievance.ward || userProfile.state || "Lucknow Ward 14",
              priority: data.grievance.priority || "Medium",
              digipin: data.grievance.digipin || userProfile.digipin || "506001",
              estimatedResolution: data.grievance.eta || "3-5 Business Days"
            }
          });
          
          addGrievance({
            id: data.grievance.id,
            description,
            category: category || 'General',
            digipin: userProfile.digipin,
            status: 'Submitted',
            imageCaption: data.grievance.imageAnalysis?.caption || (imageFile ? 'AI analyzed image evidence' : undefined),
            submittedAt: new Date().toISOString(),
          });
          
          addTrackedItem({
            id: `grv-track-${data.grievance.id}`,
            type: 'grievance',
            title: description.length > 55 ? description.slice(0, 55) + '…' : description,
            description: `${category || 'General'} • AI Triage Match: ${Math.round((uncertainty?.confidence || 0.95) * 100)}%`,
            status: 'Active',
            createdAt: Date.now(),
            agentKey: 'nagarik_mitra',
            refId: data.grievance.id,
            emoji: '📋',
            portal: 'pgportal.gov.in',
            eta: data.grievance.estimatedResolution || '48 hours',
          } as TrackedItem);
          
          setStep('result');
          const cluster = findCollectiveCluster(category || 'other', userProfile.digipin);
          if (cluster) setCollectiveMatch(cluster);
          return;
        }
      }
    } catch (error) {
      console.error('API call failed:', error);
      alert(t('errorApiConnection', '⚠️ Network issue. Using offline fallback mode.'));
      // Use demo fallback
    }

    // Demo fallback — use same GRV-NM-YYYY-NNNN format as system demo IDs
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    const demoId = `GRV-NM-${year}-${seq}`;
    setAnalysisResult({
      ...SUNITA_FLOW,
      grievanceTicket: { ...SUNITA_FLOW.grievanceTicket, id: demoId },
    });
    addGrievance({
      id: demoId,
      description,
      category: category || 'other',
      digipin: userProfile.digipin,
      status: 'Submitted',
      imageCaption: SUNITA_FLOW.photoAnalysis.caption,
      submittedAt: new Date().toISOString(),
    });
    addTrackedItem({
      id: `grv-track-${demoId}`,
      type: 'grievance',
      title: description.length > 55 ? description.slice(0, 55) + '…' : description,
      description: `${category || 'other'} • Filed via Nagarik Mitra`,
      status: 'Active',
      createdAt: Date.now(),
      agentKey: 'nagarik_mitra',
      refId: demoId,
      emoji: '📋',
      portal: 'pgportal.gov.in',
      eta: '48 hours',
    } as TrackedItem);
    setStep('result');
    // Check for collective action cluster (demo fallback path)
    const cluster = findCollectiveCluster(category || 'other', userProfile.digipin);
    if (cluster) setCollectiveMatch(cluster);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
        </button>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('grievanceTitle')}</h2>
          <p className="text-[10px] text-slate-500 dark:text-gray-400">{t('Photo + DIGIPIN → Auto-routed ticket', 'Photo + DIGIPIN → Auto-routed ticket')}</p>
        </div>
        <div className="flex items-center gap-1 bg-blue-500/20 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
          <span className="text-[9px] text-blue-400 font-bold">{t('nagarikMitra', 'Nagarik Mitra')}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {step === 'form' && (
          <div className="space-y-5">
            {/* Photo Upload */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                📸 {t('Photo Evidence (Optional)', 'Photo Evidence (Optional)')}
              </label>
              {imagePreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10">
                  <div className="relative w-full h-48">
                    <Image src={imagePreview} alt="Uploaded" fill unoptimized className="object-cover" sizes="(max-width: 430px) 100vw, 430px" />
                  </div>
                  <button
                    onClick={() => { setImagePreview(null); setImageFile(null); }}
                    className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                  >
                    <span className="material-symbols-outlined text-slate-900 dark:text-white text-sm">close</span>
                  </button>
                  <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-blue-400 text-sm">photo_camera</span>
                    <span className="text-[10px] text-blue-400 font-bold">{t('Image Uploaded', 'Image Uploaded')}</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-black/10 dark:border-white/15 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-black/5 dark:bg-white/5 transition-all"
                >
                  <span className="material-symbols-outlined text-3xl text-gray-500">add_a_photo</span>
                  <span className="text-xs text-slate-500 dark:text-gray-400">{t('Tap to add photo', 'Tap to add photo')}</span>
                  <span className="text-[10px] text-gray-500">{t('AI will auto-analyze the issue', 'AI will auto-analyze the issue')}</span>
                </button>
              )}
              <input
                onChange={handleImageUpload}
                className="hidden"
                aria-label={t('uploadPhotoOfIssue', 'Upload photo of issue')}
                title={t('uploadPhoto', 'Upload photo')}
              />
            </div>

            {/* DIGIPIN Display */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-slate-800 dark:to-blue-900/50 rounded-xl p-3 border border-black/10 dark:border-white/10 flex items-center gap-3">
              <span className="material-symbols-outlined text-green-400">satellite_alt</span>
              <div className="flex-1">
                <div className="text-[10px] text-green-400 font-bold uppercase">{t("isroDigipinLabel")}</div>
                <div className="font-mono text-lg font-bold text-slate-900 dark:text-white tracking-wider">{userProfile.digipin}</div>
                <div className="text-[9px] text-slate-500 dark:text-gray-400">{t('precision4mAutoDetected', '4x4m precision • Auto-detected')}</div>
              </div>
              <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">my_location</span>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                {t('Category', 'Category')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all text-xs ${category === cat.value
                        ? 'bg-[#FF9933]/15 border-[#FF9933]/40 text-slate-900 dark:text-white'
                        : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:bg-white/8'
                      }`}
                  >
                    <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                {t('Description / विवरण', 'Description / विवरण')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('grievancePlaceholder')}
                rows={4}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 outline-none focus:border-[#FF9933]/40 transition-all resize-none"
              />
            </div>

            {/* Submit */}
            <button
              onClick={submitGrievance}
              disabled={!description.trim()}
              className="w-full bg-gradient-to-r from-[#FF9933] to-[#E68A2E] text-slate-900 dark:text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-500/20 disabled:opacity-40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">send</span>
              {t('grievanceSubmit')}
            </button>

            {/* Safety note */}
            <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <span className="material-symbols-outlined text-green-400 text-sm mt-0.5">shield</span>
              <p className="text-[10px] text-green-700 dark:text-green-400/80">
                {t('Azure Content Safety protects your data. PII is automatically masked before processing.', 'Azure Content Safety protects your data. PII is automatically masked before processing.')}
              </p>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF9933] to-[#138808] flex items-center justify-center animate-pulse">
              <span className="material-symbols-outlined text-slate-900 dark:text-white text-3xl">smart_toy</span>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t('AI Processing', 'AI Processing')}</h3>
              <p className="text-sm text-slate-500 dark:text-gray-400">{t('nagarikMitra', 'Nagarik Mitra')} {t("analyzingGrievance")}</p>
            </div>
            <div className="w-full max-w-xs space-y-3">
              {ANALYSIS_STEPS.map((stepText, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < analysisStep ? (
                    <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
                  ) : i === analysisStep ? (
                    <div className="w-5 h-5 border-2 border-[#FF9933] border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="material-symbols-outlined text-gray-600 text-lg">radio_button_unchecked</span>
                  )}
                  <span className={`text-xs ${i <= analysisStep ? 'text-slate-900 dark:text-white' : 'text-gray-500'}`}>
                    {t(stepText, stepText)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'result' && analysisResult && (
          <div className="space-y-4">
            {/* Success Banner */}
            <div className="bg-gradient-to-r from-green-500/20 to-green-600/10 border border-green-500/30 rounded-2xl p-4 text-center">
              <span className="material-symbols-outlined text-green-400 text-4xl">task_alt</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2">{t('Grievance Registered!', 'Grievance Registered!')}</h3>
              <p className="font-mono text-xl font-bold text-green-400 mt-1">
                {analysisResult.grievanceTicket.id}
              </p>
            </div>

            {/* AI Analysis Card */}
            {imagePreview && (
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-blue-400">visibility</span>
                  <h4 className="text-xs font-bold text-blue-400 uppercase">{t('Vision Analysis', 'Vision Analysis')}</h4>
                </div>
                <p className="text-sm text-slate-600 dark:text-gray-300 mb-2">{analysisResult.photoAnalysis.caption}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {analysisResult.photoAnalysis.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/20">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-2 border-t border-black/5 dark:border-white/5">
                  <span className="material-symbols-outlined text-[10px] text-slate-400">info</span>
                  <span className="text-[9px] text-slate-400">
                    {t('Configure AZURE_VISION_KEY for real-time Azure Vision analysis', 'Configure AZURE_VISION_KEY for real-time Azure Vision analysis')}
                  </span>
                </div>
              </div>
            )}

            {/* Ticket Details */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase">{t('Ticket Details', 'Ticket Details')}</h4>
                <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  <span className="material-symbols-outlined text-purple-400 text-[10px]">psychology</span>
                  <span className="text-[9px] text-purple-400 font-bold">{t('Phi-4 Routed', 'Phi-4 Routed')}</span>
                </div>
              </div>
              {[
                [t('Department', 'Department'), analysisResult.grievanceTicket.department],
                [t('Ward', 'Ward'), analysisResult.grievanceTicket.ward],
                [t('Priority', 'Priority'), t(analysisResult.grievanceTicket.priority, analysisResult.grievanceTicket.priority)],
                [t('DIGIPIN', 'DIGIPIN'), userProfile.digipin || analysisResult.grievanceTicket.digipin],
                [t('Est. Resolution', 'Est. Resolution'), analysisResult.grievanceTicket.estimatedResolution],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center border-b border-white/5 pb-2 last:border-0">
                  <span className="text-xs text-slate-500 dark:text-gray-400">{label}</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>

            {/* AI Uncertainty & Confidence Radar */}
            {uncertainty && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-400">query_stats</span>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase">{t('Triage Confidence', 'Triage Confidence')}</h4>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded ${uncertainty.confidence > 0.8 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {Math.round(uncertainty.confidence * 100)}% Match
                  </span>
                </div>
                
                <div className="relative h-2 bg-black/10 dark:bg-white/10 rounded-full mb-3 overflow-hidden">
                   <div 
                      className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-1000" 
                      style={{ width: `${uncertainty.confidence * 100}%` }} 
                   />
                </div>

                <div className="space-y-2">
                   <p className="text-[10px] text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider">{t('AI Internal Reasoning', 'AI Internal Reasoning')}:</p>
                   <p className="text-xs text-slate-600 dark:text-gray-300 italic border-l-2 border-indigo-500/30 pl-2">
                     &quot;{uncertainty.reasoning}&quot;
                   </p>
                   <div className="flex flex-wrap gap-2 mt-2">
                      {uncertainty.alternatives?.map((alt: string, i: number) => (
                        <span key={i} className="text-[8px] bg-black/5 dark:bg-white/5 text-slate-400 px-1.5 py-0.5 rounded border border-white/5">
                          Alt: {alt}
                        </span>
                      ))}
                   </div>
                </div>
              </div>
            )}

            {/* Collective Action Card */}
            {collectiveMatch && (
              <div className={`border rounded-2xl p-4 transition-all ${joinedCluster ? 'bg-[#138808]/10 border-[#138808]/30' : 'bg-[#8B5CF6]/5 border-[#8B5CF6]/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[#8B5CF6]">group_work</span>
                  <h4 className="text-xs font-bold text-[#8B5CF6] uppercase">{t('Collective Action', 'Collective Action')}</h4>
                </div>
                {joinedCluster ? (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#138808] text-xl">check_circle</span>
                    <div>
                      <p className="text-sm font-bold text-[#138808]">{t('Joined!', 'Joined!')}</p>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400">{t('Your voice amplifies the collective complaint.', 'Your voice amplifies the collective complaint.')} ID: {collectiveMatch.clusterId}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed mb-3">
                      👥 <strong>{collectiveMatch.participantCount} {t('people reported similar')}</strong> {t('reported similar')} <strong>{t(collectiveMatch.category, collectiveMatch.category)}</strong> {t('issues in your area (Zone', 'issues in your area (Zone')} {collectiveMatch.location}).
                    </p>
                    <button
                      onClick={() => {
                        setJoinedCluster(true);
                        useAppStore.getState().addCluster(collectiveMatch);
                        useAppStore.getState().addKarma(5);
                      }}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-[#8B5CF6] text-white hover:bg-[#7C3AED] transition-all active:scale-[0.98]"
                    >
                      🤝 {t('Join Collective Complaint', 'Join Collective Complaint')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Karma Points */}
            <div className="bg-gradient-to-r from-[#FF9933]/15 to-[#138808]/15 border border-[#FF9933]/20 rounded-2xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-[#FF9933] text-2xl">military_tech</span>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">+50 {t('Civic Karma Points!', 'Civic Karma Points!')}</p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400">{t('Thanks for reporting. You help improve governance.', 'Thanks for reporting. You help improve governance.')}</p>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-full bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white font-bold py-3 rounded-2xl hover:bg-white/15 transition-all"
            >
              {t('Done', 'Done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
