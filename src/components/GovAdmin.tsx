'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';

const OFFICERS = [
  { name: 'Dr. Anita Sharma', role: 'District Magistrate', dept: 'Administration', status: 'active' as const, avatar: 'AS', casesHandled: 245, rating: 4.8 },
  { name: 'Raj Verma', role: 'Sub-Divisional Officer', dept: 'Revenue', status: 'active' as const, avatar: 'RV', casesHandled: 189, rating: 4.5 },
  { name: 'Priya Gupta', role: 'Block Dev. Officer', dept: 'Rural Dev.', status: 'on_leave' as const, avatar: 'PG', casesHandled: 156, rating: 4.3 },
  { name: 'Amit Singh', role: 'Executive Engineer', dept: 'PWD', status: 'active' as const, avatar: 'AS', casesHandled: 312, rating: 4.6 },
  { name: 'Neha Tiwari', role: 'Health Officer', dept: 'Health', status: 'field' as const, avatar: 'NT', casesHandled: 98, rating: 4.9 },
  { name: 'Vikrant Yadav', role: 'Tax Inspector', dept: 'Revenue', status: 'active' as const, avatar: 'VY', casesHandled: 72, rating: 4.1 },
];

const DEPARTMENTS_OVERVIEW = [
  { name: 'PWD', head: 'Amit Singh', activeCase: 42, resolved: 186, budget: '₹45L', color: '#3B82F6' },
  { name: 'Municipal Corp', head: 'Rekha Iyer', activeCase: 38, resolved: 201, budget: '₹28L', color: '#F59E0B' },
  { name: 'Jal Board', head: 'Suresh Rao', activeCase: 22, resolved: 134, budget: '₹35L', color: '#06B6D4' },
  { name: 'Health Dept', head: 'Dr. Neha Tiwari', activeCase: 15, resolved: 89, budget: '₹52L', color: '#10B981' },
  { name: 'Revenue', head: 'Raj Verma', activeCase: 28, resolved: 167, budget: '₹18L', color: '#8B5CF6' },
  { name: 'Town Planning', head: 'Deepak Mehra', activeCase: 11, resolved: 45, budget: '₹22L', color: '#EF4444' },
];

const AUDIT_LOG = [
  { action: 'Case GRV-2026-1293 escalated to District level', officer: 'Dr. Anita Sharma', time: '15 min ago', type: 'escalation' },
  { action: 'Budget ₹5L approved for Ward 12 drainage project', officer: 'Raj Verma', time: '1 hour ago', type: 'approval' },
  { action: 'Emergency protocol FLOOD deactivated', officer: 'System', time: '3 hours ago', type: 'system' },
  { action: 'Broadcast sent: Water supply disruption notice', officer: 'Amit Singh', time: '4 hours ago', type: 'broadcast' },
  { action: 'Officer Priya Gupta marked on leave', officer: 'System', time: '8 hours ago', type: 'system' },
  { action: '12 cases bulk-resolved in Sanitation dept', officer: 'Rekha Iyer', time: '1 day ago', type: 'resolution' },
  { action: 'New scheme PM Modi Awas registered', officer: 'System', time: '2 days ago', type: 'system' },
  { action: 'SOS response dispatched to Ward 14', officer: 'Control Room', time: '2 days ago', type: 'emergency' },
];

export default function GovAdmin() {
  const { citizenProfile, logout } = useAppStore();
  const [adminTab, setAdminTab] = useState<'officers' | 'departments' | 'audit' | 'settings'>('officers');
  const [notifPrefs, setNotifPrefs] = useState({ sos: true, cases: true, schemes: false, broadcast: true });

  // --- NEW STATES FOR INTERACTIVITY ---
  const [expandedOfficer, setExpandedOfficer] = useState<number | null>(null);
  
  // Real-time Chat States
  type ChatMessage = { sender: 'admin' | 'officer', text: string, time: string };
  const [chatHistories, setChatHistories] = useState<Record<number, ChatMessage[]>>({
     0: [{ sender: 'officer', text: 'I have successfully deployed the rapid action force in Ward 3 as per yesterday\'s directive.', time: '10:30 AM' }]
  });
  const [chatInputs, setChatInputs] = useState<Record<number, string>>({});
  const [isTyping, setIsTyping] = useState<Record<number, boolean>>({});
  
  const [expandedDept, setExpandedDept] = useState<number | null>(null);
  const [msgSentToDept, setMsgSentToDept] = useState<Set<number>>(new Set());
  
  const [aiModal, setAiModal] = useState<{isOpen: boolean, target: string, type: 'officer' | 'dept' | null, isAnalyzing: boolean, result: {title: string, data: {label: string, text: string, color: string}[]} | null}>({ isOpen: false, target: '', type: null, isAnalyzing: false, result: null });
  const [exportModal, setExportModal] = useState<{isOpen: boolean, reportName: string | null}>({isOpen: false, reportName: null});
  const [exportFilters, setExportFilters] = useState({timeline: '30d', ward: 'all'});
  const [isExporting, setIsExporting] = useState(false);

  const handleSimulateDownload = async (filename: string, aiData?: any) => {
    setIsExporting(true);
    try {
      const jspdfModule = await import('jspdf');
      // Next.js ESM interop fallback logic to prevent silent throws
      const jsPDF = jspdfModule.default || (jspdfModule as any).jsPDF;
      const Constructor = typeof jsPDF === 'function' ? jsPDF : (jspdfModule as any).jsPDF;
      const doc = new Constructor();
      
      let logoBase64 = null;
      try {
        const response = await fetch('/logo.png');
        if (response.ok) {
           const blob = await response.blob();
           logoBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
           });
        }
      } catch (e) { console.warn("Logo fetch failed"); }

      // Beautiful Header Formatting
      doc.setFillColor(19, 136, 8); // #138808 Green
      doc.rect(0, 0, 210, 42, 'F');
      
      if (logoBase64) {
         doc.setFillColor(255, 255, 255);
         doc.circle(28, 21, 12, 'F');
         doc.addImage(logoBase64 as string, 'PNG', 18, 11, 20, 20);
      } else {
         // Vector Logo Fallback
         doc.setFillColor(255, 255, 255);
         doc.circle(28, 21, 10, 'F');
         doc.setTextColor(19, 136, 8);
         doc.setFontSize(14);
         doc.setFont("helvetica", "bold");
         doc.text("BS", 23.5, 23);
      }
      
      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("Bharat Setu Official Report", 45, 25);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("GOVERNMENT OF INDIA • LUCKNOW REGION", 45, 33);
      
      // Metadata
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(14);
      doc.text(`Subject: ${filename}`, 22, 58);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 22, 68);
      doc.text("Location Jurisdiction: Lucknow (LKO-UP)", 22, 75);
      
      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 81, 190, 81);
      
      // If AI Context is passed, format it brilliantly
      if (aiData) {
         doc.setFontSize(16);
         doc.setFont("helvetica", "bold");
         doc.text("AI Intelligence Snapshot", 22, 98);
         
         let y = 110;
         aiData.data.forEach((item: any) => {
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            const labelStr = item.label + ": ";
            const labelWidth = doc.getTextWidth(labelStr);
            doc.text(labelStr, 22, y);
            
            doc.setFont("helvetica", "normal");
            const maxLineWidth = 188 - (22 + labelWidth);
            const wrappedText = doc.splitTextToSize(item.text, maxLineWidth);
            
            doc.text(wrappedText, 22 + labelWidth, y);
            y += (wrappedText.length * 6) + 6; // Move down dynamically based on wrapped height
         });
         
         doc.setFillColor(245, 248, 255); // Subtle blue highlight block
         doc.setDrawColor(200, 220, 255);
         doc.rect(17, y + 2, 176, 12, 'FD'); // Fill and Border
         doc.setFontSize(9);
         doc.setFont("helvetica", "italic");
         doc.setTextColor(100, 110, 130);
         doc.text("This intelligence analysis was generated securely by the Bharat Setu AI-Twin Engine.", 22, y + 10);
      } else {
         doc.setFontSize(16);
         doc.setFont("helvetica", "bold");
         doc.setTextColor(40, 40, 40);
         doc.text("Performance Overview", 22, 98);
         
         const drawCard = (x: number, y: number, w: number, h: number, title: string, value: string, color: number[]) => {
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.roundedRect(x, y, w, h, 3, 3, 'FD');
            
            doc.setDrawColor(color[0], color[1], color[2]);
            doc.setLineWidth(1.5);
            doc.line(x, y + 4, x, y + h - 4);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "bold");
            doc.text(title, x + 6, y + 8);
            
            doc.setFontSize(22);
            doc.setTextColor(15, 23, 42);
            doc.text(value, x + 6, y + 20);
         };

         // Generate procedural metrics for standard reports
         const val1 = Math.floor(filename.length * 12.5).toString();
         const val2 = Math.floor(filename.length * 3.1 + 14).toString();
         
         drawCard(22, 108, 75, 28, "ACTIVE CASES", val1, [59, 130, 246]); // Blue
         drawCard(105, 108, 75, 28, "RESOLUTIONS", val2, [16, 185, 129]); // Green
         drawCard(22, 142, 75, 28, "SLA COMPLIANCE", "94.2%", [139, 92, 246]); // Purple
         drawCard(105, 142, 75, 28, "CRITICAL ALERTS", "3", [239, 68, 68]); // Red

         // Generate Graphs or Tables based on context
         if (filename.includes("Data") || filename.includes("Report") || filename.includes("History")) {
            // Settings Context (Export) -> Draw a Ward-Wise Breakdown Table!
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(40, 40, 40);
            doc.text("Regional Breakdown (Ward Wise)", 22, 190);
            
            // Draw Table Header
            doc.setFillColor(241, 245, 249);
            doc.rect(22, 195, 158, 10, 'F');
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.text("WARD NAME", 25, 202);
            doc.text("CASES", 80, 202);
            doc.text("RESOLVED", 115, 202);
            doc.text("SLA %", 150, 202);

            // Draw Rows
            const wards = ["Gomti Nagar", "Hazratganj", "Aliganj", "Indira Nagar", "Chowk Area", "Aminabad"];
            let tableY = 205;
            wards.forEach((w, i) => {
               doc.setDrawColor(226, 232, 240);
               doc.setLineWidth(0.5);
               doc.line(22, tableY + 8, 180, tableY + 8); // bottom border
               
               doc.setFont("helvetica", "normal");
               doc.setTextColor(71, 85, 105);
               doc.text(w, 25, tableY + 5);
               doc.text((40 + i * 15).toString(), 80, tableY + 5);
               doc.text((35 + i * 12).toString(), 115, tableY + 5);
               doc.text((90 + i).toString() + "%", 150, tableY + 5);
               tableY += 10;
            });
         } else {
            // Officer Context -> Draw a Weekly Trend Bar Chart
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(40, 40, 40);
            doc.text("Resolution Velocity (Last 4 Weeks)", 22, 190);

            // Draw a cool mini Bar Chart
            const chartX = 22;
            const chartY = 200;
            const chartW = 158;
            const chartH = 45;
            
            // Background
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(chartX, chartY, chartW, chartH, 3, 3, 'F');
            
            // Bars
            const data = [12, 28, 19, 45];
            const max = 50;
            const barWidth = 22;
            const spacing = (chartW - (barWidth * 4)) / 5;
            
            data.forEach((val, i) => {
                const barHeight = (val / max) * (chartH - 12);
                const x = chartX + spacing + (i * (barWidth + spacing));
                const y = chartY + chartH - barHeight - 8;
                
                doc.setFillColor(16, 185, 129); // Green (#10b981)
                doc.roundedRect(x, y, barWidth, barHeight, 2, 2, 'F');
                
                // Label
                doc.setFontSize(9);
                doc.setTextColor(100, 116, 139);
                doc.setFont("helvetica", "normal");
                doc.text(`Week ${i+1}`, x + 3.5, chartY + chartH - 2);
                
                // Value
                doc.setFontSize(10);
                doc.setTextColor(15, 23, 42);
                doc.setFont("helvetica", "bold");
                doc.text(val.toString(), x + 6, y - 3);
            });
         }
      }

      // Manual Data URI bypass to prevent browser blob UUID filename stripping bug
      const safeFilename = `${filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_report.pdf`;
      const pdfDataUri = doc.output('datauristring');
      const downloadLink = document.createElement('a');
      downloadLink.href = pdfDataUri;
      downloadLink.download = safeFilename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
       console.error("jsPDF formatting error:", error);
       alert("PDF Generation Failed: " + error);
    }
    setIsExporting(false);
    setExportModal({isOpen: false, reportName: null});
  };

  const runAiAnalysis = async (target: string, type: 'officer' | 'dept', stats?: any) => {
    setAiModal({ isOpen: true, target, type, isAnalyzing: true, result: null });
    
    try {
      const res = await fetch('/api/ml/performance-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, type, stats })
      });
      
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      
      setAiModal({
        isOpen: true,
        target,
        type,
        isAnalyzing: false,
        result: data
      });
    } catch (err) {
      console.error("AI Analysis failed", err);
      setAiModal({
        isOpen: true,
        target,
        type,
        isAnalyzing: false,
        result: {
           title: "Analysis Error",
           data: [{ label: "System Status", text: "Failed to reach AI models", color: "text-red-500" }]
        }
      });
    }
  };

  const handleSendChat = (idx: number, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const text = chatInputs[idx]?.trim();
    if (!text) return;
    
    setChatHistories(prev => ({
       ...prev,
       [idx]: [...(prev[idx] || []), { sender: 'admin', text, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }]
    }));
    setChatInputs(prev => ({...prev, [idx]: ''}));
    
    // Simulate natural delay for reading, then typing...
    setTimeout(() => {
       setIsTyping(prev => ({...prev, [idx]: true}));
       setTimeout(() => {
          setChatHistories(prev => ({
             ...prev,
             [idx]: [...(prev[idx] || []), { sender: 'officer', text: 'Noted. I am pulling up the specific logs for this query right now. Please allow me a few minutes.', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }]
          }));
          setIsTyping(prev => ({...prev, [idx]: false}));
       }, 2000); // 2 seconds typing duration
    }, 1000); // 1 second read delay
  };

  const statusMeta = {
    active: { label: 'Active', color: 'text-green-500', bg: 'bg-green-500/10', dot: 'bg-green-500' },
    on_leave: { label: 'Leave', color: 'text-amber-500', bg: 'bg-amber-500/10', dot: 'bg-amber-400' },
    field: { label: 'Field', color: 'text-blue-500', bg: 'bg-blue-500/10', dot: 'bg-blue-400' },
  };

  return (
    <div className="flex flex-col h-full text-slate-900 dark:text-white overflow-y-auto pb-6 no-scrollbar">
      <div className="p-4 space-y-4">
        {/* Officer profile card */}
        <div className="bg-gradient-to-br from-[#138808]/10 to-[#138808]/5 border border-[#138808]/20 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-[#138808] flex items-center justify-center text-white text-lg font-black shadow-lg">DM</div>
            <div className="flex-1">
              <h3 className="text-base font-black">{citizenProfile?.name || 'District Magistrate'}</h3>
              <p className="text-[10px] text-[#138808] font-bold uppercase tracking-widest">Government Admin · {citizenProfile?.district || 'Lucknow'}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] bg-[#138808]/10 text-[#138808] px-2 py-0.5 rounded-full font-bold">IAS Cadre</span>
                <span className="text-[9px] bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-bold">Since 2024</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1">
          {[
            { id: 'officers' as const, label: 'Officers', icon: 'badge' },
            { id: 'departments' as const, label: 'Depts', icon: 'corporate_fare' },
            { id: 'audit' as const, label: 'Audit', icon: 'history' },
            { id: 'settings' as const, label: 'Settings', icon: 'settings' },
          ].map(t => (
            <button key={t.id} onClick={() => setAdminTab(t.id)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${adminTab === t.id ? 'bg-[#138808] text-white' : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-400'}`}>
              <span className="material-symbols-outlined text-sm">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ OFFICERS TAB ═══ */}
        {adminTab === 'officers' && (
          <div className="space-y-2">
            {OFFICERS.map((o, i) => {
              const s = statusMeta[o.status];
              const isExpanded = expandedOfficer === i;
              return (
                <div 
                  key={i} 
                  onClick={() => setExpandedOfficer(isExpanded ? null : i)}
                  className={`bg-white dark:bg-white/[0.03] border transition-all rounded-2xl p-4 cursor-pointer overflow-hidden ${isExpanded ? 'border-[#138808]/30 shadow-md ring-1 ring-[#138808]/20' : 'border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10 shadow-sm dark:shadow-none'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm transition-colors ${isExpanded ? 'bg-[#138808] text-white shadow-lg' : 'bg-gradient-to-br from-[#138808]/20 to-[#138808]/5 text-[#138808]'}`}>{o.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-black truncate">{o.name}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${s.bg} ${s.color}`}>{s.label}</span>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 dark:text-gray-400">{o.role} · {o.dept}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-black text-[#138808]">⭐ {o.rating}</p>
                      <p className="text-[9px] font-bold text-slate-400 dark:text-gray-500">{o.casesHandled} cases</p>
                    </div>
                  </div>

                  {/* Expanded Action Panel */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#138808]/10 animate-in fade-in slide-in-from-top-2 duration-200">
                      {/* Officer Two-Way Chat Box */}
                      <div className="bg-black/[0.02] dark:bg-white/[0.02] p-3 rounded-xl border border-black/5 dark:border-white/5 mb-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                           <p className="text-[10px] font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">forum</span> Direct Channel</p>
                           {isTyping[i] && <p className="text-[9px] text-[#138808] font-bold animate-pulse">{o.name.split(' ')[o.name.split(' ').length-1]} is typing...</p>}
                        </div>
                        
                        {/* Chat History Container */}
                        <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1 mb-3 no-scrollbar scroll-smooth">
                           {(!chatHistories[i] || chatHistories[i].length === 0) ? (
                              <div className="text-center py-4 text-slate-400 dark:text-slate-500">
                                 <span className="material-symbols-outlined text-[24px] opacity-50 mb-1">chat</span>
                                 <p className="text-[9px]">No recent messages. Start a secure conversation.</p>
                              </div>
                           ) : (
                              chatHistories[i].map((msg, mIdx) => (
                                 <div key={mIdx} className={`flex flex-col ${msg.sender === 'admin' ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-2.5 py-1.5 rounded-lg text-[11px] max-w-[85%] ${msg.sender === 'admin' ? 'bg-[#138808] text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-sm'}`}>
                                       {msg.text}
                                    </div>
                                    <span className="text-[8px] text-slate-400 mt-0.5 px-0.5">{msg.time}</span>
                                 </div>
                              ))
                           )}
                        </div>

                        {/* Input Box */}
                        <div className="flex gap-2">
                           <input 
                              type="text" 
                              value={chatInputs[i] || ''}
                              onChange={(e) => setChatInputs(prev => ({...prev, [i]: e.target.value}))}
                              onKeyDown={(e) => e.key === 'Enter' && handleSendChat(i, e)}
                              placeholder="Message officer securely..." 
                              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-[#138808]"
                           />
                           <button onClick={(e) => handleSendChat(i, e)} className="px-3 rounded-lg bg-[#138808] text-white flex items-center justify-center hover:bg-green-700 transition-colors">
                              <span className="material-symbols-outlined text-[16px]">send</span>
                           </button>
                        </div>
                      </div>

                      <div className="bg-black/[0.02] dark:bg-white/[0.02] p-2.5 rounded-lg border border-black/5 dark:border-white/5 flex flex-col justify-center">
                         <p className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Analytics & Reporting</p>
                         <div className="flex gap-2">
                           <button onClick={(e) => { e.stopPropagation(); handleSimulateDownload(`${o.name}_Performance`); }} className="flex-1 py-1.5 rounded-md bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors shadow flex items-center justify-center gap-1 border border-white/10 active:scale-[0.98]">
                             <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span> Get PDF
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); void runAiAnalysis(o.name, 'officer', { rating: o.rating, resolved: o.casesHandled, dept: o.dept }); }} className="flex-1 py-1.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1 active:scale-[0.98]">
                             <span className="material-symbols-outlined text-[14px]">smart_toy</span> AI Analyze
                           </button>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ DEPARTMENTS TAB ═══ */}
        {adminTab === 'departments' && (
          <div className="space-y-2.5">
            {DEPARTMENTS_OVERVIEW.map((d, i) => {
              const isExpanded = expandedDept === i;
              const hasMsgSent = msgSentToDept.has(i);
              return (
              <div 
                key={i} 
                onClick={() => setExpandedDept(isExpanded ? null : i)}
                className={`bg-white dark:bg-white/[0.03] border transition-all rounded-2xl p-4 cursor-pointer overflow-hidden ${isExpanded ? 'border-blue-500/30 shadow-md ring-1 ring-blue-500/20' : 'border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10 shadow-sm dark:shadow-none'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h5 className="text-[14px] font-black flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shadow-inner" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </h5>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-gray-400 mt-0.5">Head of Dept: <span className="text-slate-700 dark:text-gray-300 font-bold">{d.head}</span></p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-black text-[#138808] bg-[#138808]/10 px-2.5 py-1 rounded-lg">{d.budget} Allocated</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-2.5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-8 h-8 bg-orange-500/10 rounded-full blur-xl" />
                    <p className="text-xl font-black text-orange-600 dark:text-orange-400 leading-tight relative z-10">{d.activeCase}</p>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-orange-500/60 uppercase tracking-widest mt-0.5 relative z-10">Active Cases</p>
                  </div>
                  <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-2.5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-8 h-8 bg-green-500/10 rounded-full blur-xl" />
                    <p className="text-xl font-black text-green-600 dark:text-green-400 leading-tight relative z-10">{d.resolved}</p>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-green-500/60 uppercase tracking-widest mt-0.5 relative z-10">Resolved</p>
                  </div>
                </div>

                {/* Expanded Action Panel for Departments */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3">
                      
                      {/* Convey to HOD Form */}
                      <div className="bg-black/[0.02] dark:bg-white/[0.02] p-3 rounded-xl border border-black/5 dark:border-white/5">
                        <p className="text-[10px] font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">mail</span> Directive to HOD</p>
                        {hasMsgSent ? (
                          <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                             <span className="material-symbols-outlined text-green-500 text-[16px]">how_to_reg</span>
                             <div>
                               <p className="text-[10px] font-bold text-green-700 dark:text-green-400">Message Delivered</p>
                               <p className="text-[8px] text-green-600 dark:text-green-500/70">The Head of Department has been notified.</p>
                             </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Type a message or urgent directive..." 
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-blue-500"
                            />
                            <button 
                              onClick={(e) => { e.stopPropagation(); setMsgSentToDept(prev => new Set(prev).add(i)); }}
                              className="w-9 h-9 shrink-0 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                              <span className="material-symbols-outlined text-[16px]">send</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Analytics & Reporting Grid */}
                       <div className="grid grid-cols-2 gap-2">
                         <button onClick={(e) => { e.stopPropagation(); handleSimulateDownload(`${d.name}_Dept_Analytics`); }} className="py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-bold hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors shadow flex items-center justify-center gap-1.5 border border-white/10 active:scale-[0.98]">
                           <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> Get PDF
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); void runAiAnalysis(d.name, 'dept', { active: d.activeCase, resolved: d.resolved, budget: d.budget }); }} className="py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-[11px] font-bold hover:from-teal-600 hover:to-emerald-700 transition-colors shadow-lg shadow-teal-500/20 flex items-center justify-center gap-1.5 active:scale-[0.98]">
                           <span className="material-symbols-outlined text-[16px]">auto_awesome</span> AI Analyze
                         </button>
                      </div>

                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* ═══ AUDIT & FRAUD TAB ═══ */}
        {adminTab === 'audit' && (
          <div className="space-y-4">
            {/* Benford's Law Fraud Radar */}
            <div className="bg-gradient-to-br from-red-500/5 to-orange-500/10 border border-red-500/15 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-3 flex items-center gap-1.5 font-black">
                <span className="material-symbols-outlined text-[14px] animate-pulse">security</span>
                Benford Fraud Radar — Scheme Leakage
                <span className="ml-auto text-[8px] bg-red-500 text-white px-2 py-0.5 rounded-full animate-bounce">ML ACTIVE</span>
              </h4>
              <p className="text-[9px] text-slate-500 dark:text-gray-400 mb-3">Statistical anomaly detection in beneficiary disbursements (Benford&apos;s Law χ² Test):</p>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { label: 'PM-KISAN', suspect: true, pValue: 0.002, dev: '+12.4%', msg: 'Significant first-digit deviation' },
                  { label: 'Awas Yojana', suspect: false, pValue: 0.45, dev: '-1.2%', msg: 'Normal distribution' },
                ].map((s, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${s.suspect ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/5 border-green-500/10'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-[10px] font-black">{s.label}</p>
                      {s.suspect && <span className="material-symbols-outlined text-red-500 text-xs">gavel</span>}
                    </div>
                    <p className={`text-lg font-black ${s.suspect ? 'text-red-600' : 'text-green-600'}`}>{s.dev}</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase">Deviation (p={s.pValue})</p>
                    {s.suspect && <p className="text-[8px] text-red-500 font-bold mt-1">⚠️ {s.msg}</p>}
                  </div>
                ))}
              </div>
              <button 
                onClick={() => handleSimulateDownload('Fraud_Audit_Report')}
                className="w-full py-2 rounded-xl bg-red-600 text-white text-[10px] font-black shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-base">verified_user</span>
                EXPEDITE FULL AUDIT
              </button>
            </div>

            <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3">Administrative Log</h4>
              <div className="space-y-0">
              {AUDIT_LOG.map((log, i) => {
                const typeIcon = {
                  escalation: { icon: 'arrow_upward', color: '#EF4444' },
                  approval: { icon: 'check_circle', color: '#10B981' },
                  system: { icon: 'settings', color: '#6B7280' },
                  broadcast: { icon: 'campaign', color: '#3B82F6' },
                  resolution: { icon: 'task_alt', color: '#138808' },
                  emergency: { icon: 'emergency', color: '#EF4444' },
                }[log.type] || { icon: 'info', color: '#6B7280' };

                return (
                  <div key={i} className="flex gap-3 py-3 border-b border-black/5 dark:border-white/5 last:border-0">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeIcon.color + '15' }}>
                        <span className="material-symbols-outlined text-[14px]" style={{ color: typeIcon.color }}>{typeIcon.icon}</span>
                      </div>
                      {i < AUDIT_LOG.length - 1 && <div className="w-px flex-1 bg-black/5 dark:bg-white/5 mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold leading-snug">{log.action}</p>
                      <p className="text-[9px] text-slate-400 dark:text-gray-500 mt-0.5">{log.officer} · {log.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

        {/* ═══ MARL SYSTEM OPTIMIZER ═══ */}
        {adminTab === 'settings' && (
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-4 text-white shadow-xl shadow-indigo-500/20 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">hub</span>
                MARL Resource Optimizer
              </h4>
              <span className="text-[8px] font-black bg-white/20 px-2 py-0.5 rounded-full">MULTI-AGENT RL</span>
            </div>
            <p className="text-[11px] font-medium leading-relaxed mb-4 opacity-90">
              Run a global Markov Decision Process simulation to re-allocate 42 active cases across 6 departments for maximum SLA utility.
            </p>
            <div className="bg-white/10 rounded-xl p-3 border border-white/10 mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-[9px] font-bold opacity-80">Predicted Efficiency Gain</span>
                <span className="text-[11px] font-black">+24.5%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white w-[75%]" />
              </div>
            </div>
            <button 
              onClick={() => { alert("Global MARL re-allocation logic triggered. Optimization in progress..."); }}
              className="w-full py-2.5 rounded-xl bg-white text-indigo-700 text-[11px] font-black hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">rocket_launch</span>
              EXECUTE GLOBAL OPTIMIZATION
            </button>
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {adminTab === 'settings' && (
          <>
            {/* Notification prefs */}
            <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3">Notification Preferences</h4>
              {[
                { key: 'sos' as const, label: 'SOS Alerts', desc: 'Receive distress signal notifications', icon: 'sos', color: '#EF4444' },
                { key: 'cases' as const, label: 'Case Updates', desc: 'New complaints & status changes', icon: 'assignment', color: '#3B82F6' },
                { key: 'schemes' as const, label: 'Scheme Updates', desc: 'Beneficiary milestones', icon: 'policy', color: '#FF9933' },
                { key: 'broadcast' as const, label: 'Broadcast Receipts', desc: 'Delivery confirmations', icon: 'campaign', color: '#138808' },
              ].map(n => (
                <div key={n.key} className="flex items-center gap-3 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
                  <span className="material-symbols-outlined text-lg" style={{ color: n.color }}>{n.icon}</span>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold">{n.label}</p>
                    <p className="text-[9px] text-slate-400 dark:text-gray-500">{n.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifPrefs(prev => ({ ...prev, [n.key]: !prev[n.key] }))}
                    className={`w-10 h-5 rounded-full transition-all relative ${notifPrefs[n.key] ? 'bg-[#138808]' : 'bg-slate-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${notifPrefs[n.key] ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Data export */}
            <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3">Data Export</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Cases Report', icon: 'assignment' },
                  { label: 'Scheme Data', icon: 'policy' },
                  { label: 'SOS History', icon: 'sos' },
                  { label: 'Audit Trail', icon: 'history' },
                ].map((ex, i) => (
                  <button key={i} onClick={() => setExportModal({isOpen: true, reportName: ex.label})} className="flex items-center gap-2 p-3 rounded-xl border border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[#138808]/5 translate-y-full group-hover:translate-y-0 transition-transform" />
                    <span className="material-symbols-outlined text-[18px] text-[#138808] relative z-10">{ex.icon}</span>
                    <div className="text-left relative z-10">
                      <p className="text-[11px] font-bold">{ex.label}</p>
                      <p className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">tune</span> Configure</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Logout */}
            <button onClick={logout} className="w-full py-3 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-500 text-sm font-bold hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg">logout</span>
              Logout from Admin Panel
            </button>
          </>
        )}
      </div>

      {/* Global AI Processing Modal */}
      {aiModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white dark:bg-slate-900 border border-[#138808]/20 rounded-2xl p-6 shadow-2xl max-w-sm w-full relative overflow-hidden">
            {/* Background glowing effects */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full" />
            
            <button 
              onClick={() => setAiModal(prev => ({...prev, isOpen: false}))}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors z-10"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-4">
                <span className={`material-symbols-outlined text-3xl ${aiModal.isAnalyzing ? 'animate-spin' : ''}`}>
                  {aiModal.isAnalyzing ? 'settings' : 'smart_toy'}
                </span>
              </div>
              
              <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">
                {aiModal.isAnalyzing ? 'Processing Intelligence...' : 'AI Insights Ready'}
              </h3>
              
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-6 font-bold uppercase tracking-widest">
                Target: {aiModal.target}
              </p>

              {aiModal.isAnalyzing || !aiModal.result ? (
                <div className="w-full space-y-3 mb-2">
                   <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                     <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 animate-[pulse_1s_ease-in-out_infinite] w-full origin-left" style={{ transformOrigin: '0% 50%' }} />
                   </div>
                   <p className="text-[10px] text-slate-400 dark:text-gray-500 animate-pulse">Cross-referencing historical case load and SLA metrics...</p>
                </div>
              ) : (
                <div className="w-full text-left bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 p-4 rounded-xl space-y-3 shadow-inner">
                  <h4 className="text-[12px] font-black text-slate-800 dark:text-white border-b border-black/5 dark:border-white/5 pb-2 mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-blue-500">analytics</span> 
                    {aiModal.result.title}
                  </h4>
                  
                  {aiModal.result.data.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{item.label}</p>
                      <p className={`text-[12px] font-bold ${item.color}`}>{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {!aiModal.isAnalyzing && aiModal.result && (
               <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-center gap-3 relative z-10">
                 <button onClick={() => { handleSimulateDownload(`${aiModal.target}_AI_Analysis`, aiModal.result); setAiModal(prev => ({...prev, isOpen: false})); }} className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-[11px] font-black hover:bg-slate-900 transition-colors shadow flex items-center justify-center gap-1.5 active:scale-[0.98]">
                   <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> Download PDF Snapshot
                 </button>
               </div>
            )}
          </div>
        </div>
      )}

      {/* Global Data Export Modal */}
      {exportModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4 pb-12 sm:pb-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-sm w-full relative animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0">
            
            <button 
              onClick={() => !isExporting && setExportModal({isOpen: false, reportName: null})}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            
            <div className="mb-6 pr-8">
              <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#138808]">download</span>
                Export Report
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-1 font-medium">{exportModal.reportName}</p>
            </div>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-[10px] font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest mb-2">Timeline Range</label>
                <div className="grid grid-cols-3 gap-2">
                  {['7d', '30d', '1y'].map(time => (
                    <button 
                      key={time} 
                      onClick={() => setExportFilters(prev => ({...prev, timeline: time}))}
                      className={`py-2 rounded-xl text-[12px] font-bold border transition-colors ${exportFilters.timeline === time ? 'bg-[#138808]/10 border-[#138808]/30 text-[#138808]' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-slate-700'}`}
                    >
                      {time === '7d' ? 'Last 7 Days' : time === '30d' ? 'Last Month' : 'Last Year'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest mb-2">Ward Filter</label>
                <select 
                  value={exportFilters.ward}
                  onChange={(e) => setExportFilters(prev => ({...prev, ward: e.target.value}))}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[13px] font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[#138808]/50 focus:ring-1 focus:ring-[#138808]/50 appearance-none"
                  style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.5em 1.5em' }}
                >
                  <option value="all">All Lucknow Wards (Citywide)</option>
                  <option value="w1">Ward 1 - Gomti Nagar</option>
                  <option value="w2">Ward 2 - Hazratganj</option>
                  <option value="w3">Ward 3 - Aliganj</option>
                  <option value="w4">Ward 4 - Indira Nagar</option>
                </select>
              </div>
            </div>
            
            <button 
              disabled={isExporting}
              onClick={() => handleSimulateDownload(`${exportModal.reportName}_${exportFilters.ward}_${exportFilters.timeline}`)}
              className="w-full py-3.5 rounded-2xl bg-[#138808] text-white text-[13px] font-black hover:bg-[#0f6b06] shadow-xl shadow-[#138808]/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-75"
            >
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                  GATHERING DATA...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  COMPILE & EXPORT PDF
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
