'use client';

import { useState, useRef } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAppStore } from '@/lib/store';
import { FlagStripe, AshokaChakra } from '@/components/ui/GoiElements';
import { generateAudioSummary } from '@/app/actions/gemini-ai';
import { useTTS } from '@/hooks/useTTS';
import { motion, AnimatePresence } from 'framer-motion';

type DocumentAssistantResponse = {
  summary?: string;
  extractedText?: string;
  sourceType?: 'image' | 'pdf';
  extraction?: {
    fullName?: string;
    address?: string;
    issueDate?: string;
    referenceNumber?: string;
    documentType?: string;
    issueSummary?: string;
  };
  classification?: {
    requestType?: string;
    suggestedDepartment?: string;
    suggestedService?: string;
    priority?: string;
    rationale?: string;
  };
  prefill?: {
    fullName?: string;
    address?: string;
    issueDate?: string;
    referenceNumber?: string;
    category?: string;
    priority?: string;
    suggestedDepartment?: string;
    suggestedService?: string;
    description?: string;
  };
  error?: string;
};

export default function HelpNeighbourOverlay({
  onClose,
  onRouteGrievance
}: {
  onClose: () => void;
  onRouteGrievance: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { userProfile } = useAppStore();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAssistantResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const { isPlaying: playing, playTTS } = useTTS(userProfile.language?.split('-')[0] || 'hi');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setSelectedFile(file);
    setPreviewUrl(isPdf ? null : URL.createObjectURL(file));
    setSummary(null);
    setOcrText(null);
    setAnalysis(null);
    setErrorMsg(null);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setAnalyzing(true);
    setErrorMsg(null);
    setSummary(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('lang', userProfile.language || 'hi-IN');

    try {
      const res = await fetch('/api/document-assistant', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to analyze document');
      
      const data = (await res.json()) as DocumentAssistantResponse;
      if (data.error) throw new Error(data.error);

      setSummary(data.summary || 'Document analyzed successfully.');
      setOcrText(data.extractedText || '');
      setAnalysis(data);
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not read document. Please upload a clearer image or searchable PDF.');
    } finally {
      setAnalyzing(false);
    }
  };

  const buildGrievancePrefillText = () => {
    if (!analysis) return summary || '';
    const prefill = analysis.prefill;
    const extraction = analysis.extraction;
    const classification = analysis.classification;

    return [
      summary || '',
      '',
      '--- Structured Prefill ---',
      prefill?.fullName ? `Name: ${prefill.fullName}` : extraction?.fullName ? `Name: ${extraction.fullName}` : '',
      prefill?.address ? `Address: ${prefill.address}` : extraction?.address ? `Address: ${extraction.address}` : '',
      prefill?.issueDate ? `Date: ${prefill.issueDate}` : extraction?.issueDate ? `Date: ${extraction.issueDate}` : '',
      prefill?.referenceNumber
        ? `Reference Number: ${prefill.referenceNumber}`
        : extraction?.referenceNumber
          ? `Reference Number: ${extraction.referenceNumber}`
          : '',
      extraction?.documentType ? `Document Type: ${extraction.documentType}` : '',
      classification?.requestType ? `Request Type: ${classification.requestType}` : '',
      classification?.suggestedDepartment ? `Suggested Department: ${classification.suggestedDepartment}` : '',
      classification?.suggestedService ? `Suggested Service: ${classification.suggestedService}` : '',
      classification?.priority ? `Priority: ${classification.priority}` : '',
      prefill?.description || extraction?.issueSummary ? `Issue Summary: ${prefill?.description || extraction?.issueSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handlePlayAudio = async () => {
    if (playing) {
      playTTS('');
      return;
    }

    if (!summary) return;
    const shortLang = userProfile.language?.split('-')[0] || 'hi';

    try {
      setGeneratingAudio(true);
      // Generate a concise summary for audio
      const audioSummary = await generateAudioSummary(summary, shortLang);
      
      playTTS(audioSummary);
    } catch (e) {
      console.error('TTS generation failed', e);
    } finally {
      setGeneratingAudio(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />

      <div className="flex items-center gap-3 px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10 shrink-0">
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">close</span>
        </button>
        <div className="flex-1 text-center">
          <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[#f43f5e]">description</span>
            {t('documentExplainer', 'Document Explainer')}
          </h2>
          <div className="text-[10px] text-[#FF9933] font-bold">AI Document Explainer</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24 p-5 flex flex-col gap-6 relative">
        {!selectedFile && (
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center h-full gap-4 text-center">
             <div className="w-24 h-24 rounded-full bg-[#f43f5e]/10 flex items-center justify-center text-[#f43f5e]">
                 <span className="material-symbols-outlined text-5xl font-light">document_scanner</span>
             </div>
             <div>
               <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight mb-2">Scan an Official Letter</h3>
               <p className="text-slate-500 dark:text-gray-400 text-sm max-w-[260px] mx-auto">
                 Upload a photo or PDF of a government document. The AI will read it, extract key fields, classify the request, and explain it simply.
               </p>
             </div>
             <input type="file" accept="image/*,application/pdf" className="hidden" ref={fileInputRef} onChange={handleImagePick} />
             <button onClick={() => fileInputRef.current?.click()} className="mt-4 flex items-center gap-2 bg-[#f43f5e] text-white px-8 py-3.5 rounded-xl font-black shadow-lg shadow-[#f43f5e]/30 active:scale-95 transition-transform">
                <span className="material-symbols-outlined">upload_file</span>
                Upload Document
             </button>
           </motion.div>
        )}

        {selectedFile && (
          <div className="relative rounded-2xl overflow-hidden shadow-sm border border-black/5 dark:border-white/10 shrink-0 mx-auto max-w-full">
             {previewUrl ? (
               <img src={previewUrl} alt="Document preview" className={`w-full max-h-[300px] object-cover bg-black/5 ${analyzing ? 'opacity-50 blur-sm' : ''}`} />
             ) : (
               <div className={`w-full min-h-[180px] bg-black/5 dark:bg-white/5 flex items-center justify-center ${analyzing ? 'opacity-50 blur-sm' : ''}`}>
                 <div className="text-center p-6">
                   <span className="material-symbols-outlined text-5xl text-[#f43f5e]">picture_as_pdf</span>
                   <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200 break-all">{selectedFile.name}</p>
                   <p className="text-xs text-slate-500 dark:text-gray-400">PDF document selected</p>
                 </div>
               </div>
             )}
             
             {!analyzing && !summary && (
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                    setSummary(null);
                    setOcrText(null);
                    setAnalysis(null);
                    setErrorMsg(null);
                    if (playing) {
                      playTTS('');
                    }
                    setTimeout(() => fileInputRef.current?.click(), 50);
                  }}
                  className="absolute top-3 right-3 bg-black/50 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">edit</span> Retake
                </button>
             )}
             
             {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                   <div className="relative w-16 h-16 border-4 border-white border-t-[#f43f5e] rounded-full animate-spin"></div>
                   <div className="bg-black/70 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-xl">
                     Extracting & Translating Text...
                   </div>
                </div>
             )}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm font-bold text-center">
            {errorMsg}
          </div>
        )}

        <AnimatePresence>
          {summary && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
              
              <div className="bg-white dark:bg-[#0f1f3a] border border-[#f43f5e]/20 rounded-2xl p-5 shadow-lg shadow-[#f43f5e]/5">
                <div className="flex items-center justify-between mb-3 border-b border-black/5 dark:border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#f43f5e]">auto_awesome</span>
                    <h3 className="font-black text-sm uppercase tracking-widest text-[#f43f5e]">AI ELI5 Summary</h3>
                  </div>
                  
                  <button 
                    onClick={handlePlayAudio}
                    disabled={generatingAudio}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                      playing ? 'bg-red-500/10 text-red-600' : 'bg-[#FF9933]/10 text-[#FF9933]'
                    }`}
                  >
                    {generatingAudio ? (
                      <AshokaChakra size={12} color="#FF9933" spin />
                    ) : (
                      <span className="material-symbols-outlined text-sm">{playing ? 'stop_circle' : 'volume_up'}</span>
                    )}
                    {playing ? 'Stop' : generatingAudio ? 'Summarizing...' : 'Listen'}
                  </button>
                </div>
                
                <p className="text-slate-900 dark:text-white font-medium leading-relaxed text-base whitespace-pre-wrap">
                  {summary}
                </p>

                {analysis?.classification && (
                  <div className="mt-4 border-t border-black/5 dark:border-white/5 pt-3 grid grid-cols-1 gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Request Type</span>
                      <span className="font-bold text-slate-900 dark:text-white">{analysis.classification.requestType || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Department</span>
                      <span className="font-bold text-slate-900 dark:text-white">{analysis.classification.suggestedDepartment || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Service</span>
                      <span className="font-bold text-slate-900 dark:text-white">{analysis.classification.suggestedService || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Priority</span>
                      <span className="font-black text-red-500">{analysis.classification.priority || '-'}</span>
                    </div>
                  </div>
                )}

                {analysis?.extraction && (
                  <details className="mt-3">
                    <summary className="text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer select-none">Show Extracted Fields</summary>
                    <div className="mt-2 bg-black/5 dark:bg-white/5 p-3 rounded-lg text-xs text-slate-600 dark:text-gray-300 space-y-1">
                      <p><span className="font-bold">Name:</span> {analysis.extraction.fullName || '-'}</p>
                      <p><span className="font-bold">Address:</span> {analysis.extraction.address || '-'}</p>
                      <p><span className="font-bold">Date:</span> {analysis.extraction.issueDate || '-'}</p>
                      <p><span className="font-bold">Reference:</span> {analysis.extraction.referenceNumber || '-'}</p>
                      <p><span className="font-bold">Document Type:</span> {analysis.extraction.documentType || '-'}</p>
                      <p><span className="font-bold">Issue:</span> {analysis.extraction.issueSummary || '-'}</p>
                    </div>
                  </details>
                )}
                
                {ocrText && (
                   <details className="mt-4">
                      <summary className="text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer select-none">Show Raw Extracted Text</summary>
                      <div className="mt-2 bg-black/5 dark:bg-white/5 p-3 rounded-lg text-xs font-mono text-slate-500 dark:text-gray-400 overflow-x-auto break-all max-h-32 overflow-y-auto">
                        {ocrText}
                      </div>
                   </details>
                )}
              </div>

              <div className="flex flex-col gap-2 mt-2">
                 <button 
                   onClick={() => onRouteGrievance(buildGrievancePrefillText())}
                   className="w-full bg-gradient-to-r from-[#138808] to-emerald-600 text-white rounded-2xl py-4 font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all"
                 >
                   <span className="material-symbols-outlined">send</span>
                   File Grievance with Prefill
                 </button>
                 <button 
                   onClick={() => {
                      setPreviewUrl(null); setSelectedFile(null); setSummary(null); setOcrText(null); setAnalysis(null);
                      if (playing) { playTTS(''); }
                    }}
                   className="w-full bg-black/5 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                 >
                   <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
                   Scan Another Document
                 </button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
        
        {selectedFile && !summary && !analyzing && (
          <div className="mt-auto">
            <button 
              onClick={handleAnalyze}
              className="w-full bg-[#f43f5e] text-white py-4 rounded-2xl font-black shadow-lg shadow-[#f43f5e]/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">auto_read_play</span>
              Analyze Document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
