'use client';

import { useState, useRef, useEffect } from 'react';
import { IMPACT_DATA } from '@/lib/demo-data';
import { useTTS } from '@/hooks/useTTS';
import html2canvas from 'html2canvas';
import { useAppStore, getUserLevelDescriptor } from '@/lib/store';
import { hasPermission } from '@/lib/permissions';
import NagarPulse from './NagarPulse';
import { FlagStripe } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getAllClusters, getAllTrustScores } from '@/lib/intelligence';

// Simple chart components (to avoid recharts SSR issues)
function BarChart({ data, max }: { data: { label: string; value: number; color: string }[]; max: number }) {
  const safeMax = Math.max(1, max);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold text-slate-900 dark:text-white">{d.value}</span>
          <div
            className="w-full rounded-t-lg transition-all duration-700"
            style={{
              height: `${(d.value / safeMax) * 100}%`,
              background: d.color,
              animation: `slideUp 0.5s ease-out ${i * 0.1}s both`,
              minHeight: '4px',
            }}
          />
          <span className="text-[9px] text-slate-500 dark:text-gray-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, data.reduce((sum, d) => sum + d.value, 0));
  let cumulative = 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {data.map((d, i) => {
            const pct = (d.value / total) * 100;
            const offset = cumulative;
            cumulative += pct;
            return (
              <circle
                key={i}
                cx="18" cy="18" r="14"
                fill="none"
                stroke={d.color}
                strokeWidth="4"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={-offset}
                className="transition-all duration-1000"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black text-slate-900 dark:text-white">{total}</span>
          <span className="text-[8px] text-slate-500 dark:text-gray-400">TOTAL</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600 dark:text-gray-300">{d.label}</span>
            <span className="font-bold text-slate-900 dark:text-white ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOCK_NEWS = [
  { id: 1, title: 'Road Repair Project Approved', tKey_title: 'roadRepairProjectApproved', description: 'Municipal corporation has finally approved ₹45L for patching Sector 12 internal roads taking action on 12 community complaints.', tKey_desc: 'municipalCorporationHasFinallyApproved45lForPatchingSector12InternalRoadsTakingActionOn12CommunityComplaints', location: 'Sector 12', time: '2 hours ago', tag: 'Civic Action', tKey_tag: 'civicAction', alert: false },
  { id: 2, title: 'PM-Svanidhi Loan Camp Tomorrow', tKey_title: 'pmSvanidhiLoanCampTomorrow', description: 'Street vendors can register for ₹10k micro-loans instantly at the District Magistrate office. Bring Aadhaar.', tKey_desc: 'streetVendorsCanRegisterFor10kMicroloansInstantlyAtTheDistrictMagistrateOfficeBringAadhaar', location: 'DM Office', time: '5 hours ago', tag: 'Scheme Alert', tKey_tag: 'schemeAlert', alert: true },
  { id: 3, title: 'Dengue Prevention Drive', tKey_title: 'denguePreventionDrive', description: 'Health workers will pass through Ward 4 to spray targeted zones today. Keep windows closed during 4-5 PM.', tKey_desc: 'healthWorkersWillPassThroughWard4ToSprayTargetedZonesTodayKeepWindowsClosedDuring45Pm', location: 'Ward 4', time: '1 day ago', tag: 'Health', tKey_tag: 'health', alert: false },
];

export default function ImpactDashboard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'overview' | 'trends' | 'agents' | 'trust' | 'pulse' | 'collective'>('overview');
  const [newsFilter, setNewsFilter] = useState<'all' | 'alerts' | 'updates'>('all');
  const { weeklyTrend, agentUsage, topGrievances, schemeSaturation } = IMPACT_DATA;

  // Real user data from store — blended with platform-wide IMPACT_DATA base
  const { trackedItems, karmaScore, role, collectiveClusters, addCluster, addKarma, userProfile } = useAppStore();
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [playingNewsId, setPlayingNewsId] = useState<number | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState<number | null>(null);
  const { isPlaying, playTTS } = useTTS(userProfile.language?.split('-')[0] || 'hi');

  async function handleListenNews(news: typeof MOCK_NEWS[0]) {
    if (playingNewsId === news.id && isPlaying) {
      playTTS(''); // toggle off
      setPlayingNewsId(null);
      return;
    }

    setIsSynthesizing(news.id);

    try {
      const res = await fetch('/api/explain-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: news.title,
          description: news.description,
          targetLang: userProfile.language || 'en-IN'
        })
      });

      if (!res.ok) throw new Error('Failed to generate explanation');

      const { explanation } = await res.json();
      
      playTTS(explanation);
      setPlayingNewsId(news.id);
    } catch (err) {
      console.error(err);
      alert(t('errorGeneratingAudio', 'Failed to read news loudly.'));
      setPlayingNewsId(null);
    } finally {
      setIsSynthesizing(null);
    }
  }

  type NewsSummaryData = { headline: string; intro: string; bullets: string[]; labels?: Record<string, string> };
  const [isSummarizingNews, setIsSummarizingNews] = useState(false);
  const [newsSummary, setNewsSummary] = useState<NewsSummaryData | null>(null);
  const [hasGeneratedNewspaper, setHasGeneratedNewspaper] = useState(false);
  const [isPlayingSummary, setIsPlayingSummary] = useState(false);
  const newspaperRef = useRef<HTMLDivElement | null>(null);

  async function handleSummarizeAllNews() {
    setIsSummarizingNews(true);
    setNewsSummary(null);
    setHasGeneratedNewspaper(false);

    try {
      const res = await fetch('/api/summarize-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsArray: filteredNews,
          targetLang: userProfile?.language || 'en-IN'
        })
      });

      if (!res.ok) throw new Error('Failed to summarize news');
      const { summary } = await res.json();
      setNewsSummary(summary);

      await new Promise(r => setTimeout(r, 800));

      if (newspaperRef.current) {
        const canvas = await html2canvas(newspaperRef.current, { backgroundColor: '#FDFBF7', scale: 2 });
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Bharat-Setu-Daily-${new Date().toLocaleDateString()}.png`;
        a.click();
      }

      setHasGeneratedNewspaper(true);
    } catch (err) {
      console.error(err);
      alert(t('errorSummarizingNews', 'Failed to summarize news.'));
    } finally {
      setIsSummarizingNews(false);
    }
  }

  async function handleListenToSummary() {
    if (!newsSummary) return;

    if (isPlayingSummary && isPlaying) {
      playTTS('');
      setIsPlayingSummary(false);
      return;
    }

    setIsPlayingSummary(true);
    try {
      const fullText = `${newsSummary.headline}. ${newsSummary.intro} ${newsSummary.bullets.join('. ')}`;
      playTTS(fullText);
    } catch (err) {
      console.error(err);
      setIsPlayingSummary(false);
    }
  }

  const myResolved = trackedItems.filter(i => i.status === 'Resolved').length;
  const mySchemes = trackedItems.filter(i => i.type === 'scheme').length;
  const myGrievances = trackedItems.filter(i => i.type === 'grievance').length;
  const level = getUserLevelDescriptor(karmaScore);
  const canBroadcast = hasPermission(role, 'broadcast');
  const canJoinCollective = hasPermission(role, 'community_engage');
  const [broadcastSent, setBroadcastSent] = useState(false);

  // Platform total = base demo + current user's real contributions
  const totalGrievancesResolved = IMPACT_DATA.overview.grievancesResolved + myResolved;
  const totalSchemesMatched = IMPACT_DATA.overview.schemesMatched + mySchemes;
  const filteredNews = MOCK_NEWS.filter((news) => {
    if (newsFilter === 'alerts') return news.alert;
    if (newsFilter === 'updates') return !news.alert;
    return true;
  });
  const weeklyTotals = weeklyTrend.map((d) => ({ day: t(d.day, d.day), total: d.grievances + d.schemes + d.voice, schemes: d.schemes }));
  const busiestDay = weeklyTotals.reduce((best, current) => (current.total > best.total ? current : best), weeklyTotals[0]);
  const calmestDay = weeklyTotals.reduce((lowest, current) => (current.total < lowest.total ? current : lowest), weeklyTotals[0]);
  const avgDailyActivity = Math.round(weeklyTotals.reduce((sum, d) => sum + d.total, 0) / Math.max(1, weeklyTotals.length));
  const avgDailySchemes = Math.round(weeklyTotals.reduce((sum, d) => sum + d.schemes, 0) / Math.max(1, weeklyTotals.length));
  const highAdoptionSchemes = schemeSaturation.filter((s) => s.enrolled >= 70).length;
  const allActiveClusters = getAllClusters();
  const priorityCluster = allActiveClusters.reduce((best, current) => (
    current.participantCount > best.participantCount ? current : best
  ), allActiveClusters[0]);
  const topAlert = MOCK_NEWS.find((news) => news.alert);
  const communityLoadLevel = avgDailyActivity >= 620 ? 'high' : avgDailyActivity <= 500 ? 'low' : 'normal';
  const schemeReachLevel = highAdoptionSchemes >= 3 ? 'strong' : highAdoptionSchemes === 2 ? 'growing' : 'weak';
  const recommendedCommunityMove = communityLoadLevel === 'high'
    ? t('recommendationCollectiveFocus', 'Today: prioritize collective escalation for faster resolution.')
    : schemeReachLevel === 'weak'
      ? t('recommendationSchemeAwareness', 'Today: boost scheme awareness via local alerts and campaigns.')
      : t('recommendationSteadyOperations', 'Today: maintain steady operations and publish one community update.');

  const statCards = [
    { label: t('grievancesResolved', 'Grievances Resolved'), value: totalGrievancesResolved.toLocaleString(), icon: 'task_alt', color: '#138808' },
    { label: t('schemesMatched', 'Schemes Matched'), value: totalSchemesMatched.toLocaleString(), icon: 'verified', color: '#FF9933' },
    { label: t('citizensServed', 'Citizens Served'), value: IMPACT_DATA.overview.totalUsers.toLocaleString(), icon: 'group', color: '#4299E1' },
    { label: t('myKarmaScore', 'My Karma Score'), value: karmaScore.toLocaleString(), icon: 'military_tech', color: '#9F7AEA' },
    { label: t('myCasesFiled', 'My Cases Filed'), value: myGrievances.toLocaleString(), icon: 'folder_open', color: '#D69E2E' },
    { label: t('avgResolution', 'Avg Resolution'), value: `${IMPACT_DATA.overview.avgResolutionDays}${t('d', 'd')}`, icon: 'speed', color: '#E53E3E' },
  ];

  const tabs = [
    { id: 'overview', label: t('overview', 'Overview'), icon: 'dashboard' },
    { id: 'collective', label: t('collective', 'Collective'), icon: 'group_work' },
    { id: 'trends', label: t('trends', 'Trends'), icon: 'trending_up' },
    { id: 'agents', label: t('agents', 'Agents'), icon: 'smart_toy' },
    { id: 'trust', label: t('trust', 'Trust'), icon: 'verified_user' },
    { id: 'pulse', label: t('pulse', 'Pulse'), icon: 'location_city' }
  ] as const;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />
      {/* Header */}
      <div className="px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] active:scale-[0.98]">
            <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              {t('communityHub', 'Community Hub')}
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${level.bg} ${level.color}`}>
                {t(level.title, level.title)}
              </span>
            </h2>
            <span className="text-[10px] text-slate-500 dark:text-gray-400">{t('realtimeGovernanceAnalytics', 'Real-time governance analytics')}</span>
          </div>
          <div className="bg-black/5 dark:bg-white/5 px-2 py-1 rounded-lg border border-black/10 dark:border-white/10">
            <span className="text-[9px] text-green-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              {t('live', 'LIVE')}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-12 px-3 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all ${tab === t.id ? 'bg-[#FF9933] text-slate-900 dark:text-white shadow-sm border border-black/10' : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-300 active:scale-[0.98] border border-transparent'}`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4 no-scrollbar">
        {tab === 'overview' && (
          <>
            {/* Government-only: Broadcast Announcement */}
            {canBroadcast && (
              <div className="bg-[#138808]/10 border border-[#138808]/20 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[#138808] text-base">campaign</span>
                  <h4 className="text-[11px] font-black text-[#138808] uppercase tracking-widest">{t('broadcastAnnouncement', 'Broadcast Announcement')}</h4>
                </div>
                {broadcastSent ? (
                  <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {t('announcementSentToAllCitizensInYourJurisdiction', 'Announcement sent to all citizens in your jurisdiction!')}
                  </div>
                ) : (
                  <button
                    onClick={() => setBroadcastSent(true)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#138808] text-white hover:bg-[#0d6b06] transition-all active:scale-[0.98] shadow-md shadow-green-800/20"
                  >
                    <span className="material-symbols-outlined text-[14px] align-middle mr-1">send</span>
                    {t('sendPublicAnnouncement', 'Send Public Announcement')}
                  </button>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-[#FF9933]/20 bg-gradient-to-br from-[#FF9933]/12 to-[#138808]/10 p-4 shadow-sm">
              <div className="flex items-start gap-2.5 mb-3">
                <span className="material-symbols-outlined text-[#FF9933] text-[22px]">auto_awesome</span>
                <div>
                  <h4 className="text-[12px] font-black uppercase tracking-wider text-slate-900 dark:text-white">{t('communityActionEngine', 'Community Action Engine')}</h4>
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{recommendedCommunityMove}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => setTab('collective')}
                  className="min-h-12 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/10 dark:border-white/10 px-3 text-left active:scale-[0.99]"
                >
                  <p className="text-[12px] font-bold text-slate-900 dark:text-white">{t('priorityCollectiveAction', 'Priority Collective Action')}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">{priorityCluster ? `${t(priorityCluster.category, priorityCluster.category)} · ${t('zone', 'Zone')} ${priorityCluster.location}` : t('openCollectiveDesk', 'Open collective desk')}</p>
                </button>
                <button
                  onClick={() => setNewsFilter('alerts')}
                  className="min-h-12 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/10 dark:border-white/10 px-3 text-left active:scale-[0.99]"
                >
                  <p className="text-[12px] font-bold text-slate-900 dark:text-white">{t('urgentCommunityAlert', 'Urgent Community Alert')}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">{topAlert ? t(topAlert.title, topAlert.title) : t('noUrgentAlertRightNow', 'No urgent alert right now')}</p>
                </button>
                <button
                  onClick={() => setTab('trends')}
                  className="min-h-12 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/10 dark:border-white/10 px-3 text-left active:scale-[0.99]"
                >
                  <p className="text-[12px] font-bold text-slate-900 dark:text-white">{t('forecastAndPrepare', 'Forecast and Prepare')}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">{t('seeNext48HourRiskSignals', 'See next 48-hour risk signals and suggested response')}</p>
                </button>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              {statCards.map((s, i) => (
                <div
                  key={i}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3 flex flex-col gap-1"
                  style={{ animation: `fadeIn 0.4s ease-out ${i * 0.05}s both` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm" style={{ color: s.color }}>{s.icon}</span>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">{s.label}</span>
                  </div>
                  <span className="text-xl font-black text-slate-900 dark:text-white">{s.value}</span>
                </div>
              ))}
            </div>

            {/* Community News Feed */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 relative overflow-hidden">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">public</span>
                  {t('communityNews', 'Community News')}
                </h4>

                {hasGeneratedNewspaper ? (
                  <button
                    onClick={handleListenToSummary}
                    className="px-2 py-1 bg-gradient-to-r from-[#FF9933] to-[#138808] text-white rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md hover:opacity-90 active:scale-95 transition-all"
                  >
                    {isPlayingSummary ? (
                      <><span className="material-symbols-outlined text-[12px]">stop_circle</span> {t('stopSummary', 'Stop AI Summary')}</>
                    ) : (
                      <><span className="material-symbols-outlined text-[12px]">volume_up</span> {t('listenSummary', 'Listen AI Summary')}</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSummarizeAllNews}
                    disabled={isSummarizingNews}
                    className="px-2 py-1 border border-[#FF9933]/30 text-[#FF9933] rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-[#FF9933]/10 active:scale-95 transition-all"
                  >
                    {isSummarizingNews ? (
                      <><span className="material-symbols-outlined text-[12px] animate-spin">sync</span> {t('generating', 'Generating...')}</>
                    ) : (
                      <><span className="material-symbols-outlined text-[12px]">auto_awesome</span> {t('summarizeAll', 'AI Summary & Newspaper')}</>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
                {[
                  { id: 'all' as const, label: t('allUpdates', 'All Updates'), icon: 'view_list' },
                  { id: 'alerts' as const, label: t('alerts', 'Alerts'), icon: 'notification_important' },
                  { id: 'updates' as const, label: t('localUpdates', 'Local Updates'), icon: 'newspaper' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setNewsFilter(chip.id)}
                    className={`min-h-10 px-3.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 ${newsFilter === chip.id
                        ? 'bg-[#FF9933]/15 text-[#FF9933] border-[#FF9933]/30'
                        : 'bg-white/70 dark:bg-white/[0.03] text-slate-500 dark:text-slate-300 border-black/10 dark:border-white/10 active:scale-[0.98]'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">{chip.icon}</span>
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {filteredNews.map(news => (
                  <div key={news.id} className="w-full text-left bg-white dark:bg-[#162a4a] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm hover:border-[#FF9933]/50 transition-all">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5 w-max ${news.alert ? 'bg-red-500/10 text-red-500' : 'bg-[#FF9933]/10 text-[#FF9933]'}`}>
                        {news.alert && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>}
                        {t(news.tag, news.tag)}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-300 font-semibold">{t(news.time, news.time)}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight mb-2">{t(news.title, news.title)}</h5>
                    <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed mb-3">{t(news.description, news.description)}</p>
                    <div className="flex items-center justify-between gap-2">
                      {news.location ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                          <span className="material-symbols-outlined text-[14px]">location_on</span>
                          {t(news.location, news.location)}
                        </div>
                      ) : <div />}
                      <button
                        onClick={() => handleListenNews(news)}
                        disabled={isSynthesizing === news.id}
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full outline-none transition-all ${
                          playingNewsId === news.id
                            ? 'bg-green-500/10 text-green-500 border border-green-500/20 shadow-inner'
                            : 'bg-[#FF9933]/10 text-[#FF9933] border border-[#FF9933]/20 hover:bg-[#FF9933]/20 active:scale-[0.95]'
                        }`}
                      >
                        {isSynthesizing === news.id ? (
                          <>
                            <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>
                            {t('translating', 'Translating...')}
                          </>
                        ) : playingNewsId === news.id ? (
                          <>
                            <span className="material-symbols-outlined text-[14px] animate-pulse">volume_up</span>
                            {t('playing', 'Playing...')}
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[14px]">record_voice_over</span>
                            {t('listenUpdate', 'Listen Update')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
                {filteredNews.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-4 text-center">
                    <p className="text-[12px] text-slate-500 dark:text-slate-300 font-medium">{t('noNewsInThisFilter', 'No news updates in this filter right now.')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Top Grievances */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('topGrievanceCategories', 'Top Grievance Categories')}</h4>
              <div className="space-y-3">
                {topGrievances.map((g, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-900 dark:text-white font-bold">{t(g.category, g.category)}</span>
                      <span className="text-[10px] text-slate-500 dark:text-gray-400">{g.count} {t('reported', 'reported')}</span>
                    </div>
                    <div className="h-2 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${(g.count / topGrievances[0].count) * 100}%`,
                          background: g.trend === 'down' ? '#138808' : '#FF9933',
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-500">{t('trend', 'Trend:')} {g.trend === 'down' ? t('Decreasing', '↓ Decreasing') : g.trend === 'up' ? t('Increasing', '↑ Increasing') : t('Stable', '→ Stable')}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'trends' && (
          <>
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-300 uppercase tracking-wider mb-3">{t('civicCommandCenter', 'Civic Command Center')}</h4>
              <div className="rounded-2xl border border-[#FF9933]/20 bg-gradient-to-r from-[#FF9933]/10 to-[#138808]/10 p-4 mb-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#FF9933] text-[22px]">psychology</span>
                  <div className="flex-1">
                    <p className="text-[12px] font-bold text-slate-900 dark:text-white">{t('aiGuidedSummary', 'AI-Guided Summary')}</p>
                    <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{recommendedCommunityMove}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-4 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-slate-900 dark:text-white">{t('riskInNext48Hours', 'Risk in Next 48 Hours')}</p>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${communityLoadLevel === 'high' ? 'bg-red-500/10 text-red-500' : communityLoadLevel === 'normal' ? 'bg-[#FF9933]/10 text-[#FF9933]' : 'bg-[#138808]/10 text-[#138808]'}`}>
                    {communityLoadLevel === 'high' ? t('highRisk', 'High Risk') : communityLoadLevel === 'normal' ? t('moderateRisk', 'Moderate Risk') : t('lowRisk', 'Low Risk')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {communityLoadLevel === 'high'
                    ? t('riskHighGuidance', 'Demand is rising. Push collective actions and immediate local alerts to prevent complaint backlog.')
                    : communityLoadLevel === 'normal'
                      ? t('riskMediumGuidance', 'Demand is manageable. Focus on quick closures and one awareness push for weak schemes.')
                      : t('riskLowGuidance', 'Demand is low. Use this window for prevention, follow-ups, and service quality checks.')}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-white/70 dark:bg-white/[0.03] border border-black/10 dark:border-white/10 p-3">
                  <p className="text-[11px] text-slate-500 dark:text-gray-300 font-semibold mb-1">{t('serviceLoad', 'Service Load')}</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">{communityLoadLevel === 'high' ? t('high', 'High') : communityLoadLevel === 'low' ? t('low', 'Low') : t('normal', 'Normal')}</p>
                  <p className="text-[11px] font-bold mt-1 text-[#FF9933]">{t('todayAcrossYourArea', 'Today across your area')}</p>
                </div>
                <div className="rounded-xl bg-white/70 dark:bg-white/[0.03] border border-black/10 dark:border-white/10 p-3">
                  <p className="text-[11px] text-slate-500 dark:text-gray-300 font-semibold mb-1">{t('focusDay', 'Focus Day')}</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">{busiestDay.day}</p>
                  <p className="text-[11px] font-bold mt-1 text-[#138808]">{t('bestDayToDeployTeams', 'Best day to deploy teams')}</p>
                </div>
                <div className="rounded-xl bg-white/70 dark:bg-white/[0.03] border border-black/10 dark:border-white/10 p-3">
                  <p className="text-[11px] text-slate-500 dark:text-gray-300 font-semibold mb-1">{t('schemeHealth', 'Scheme Health')}</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">{schemeReachLevel === 'strong' ? t('strong', 'Strong') : schemeReachLevel === 'growing' ? t('growing', 'Growing') : t('needsPush', 'Needs Push')}</p>
                  <p className="text-[11px] font-bold mt-1 text-[#FF9933]">{t('basedOnRecentAdoption', 'Based on recent adoption')}</p>
                </div>
              </div>
            </div>

            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-300 uppercase tracking-wider mb-3">{t('dayByDaySignals', 'Day-by-Day Signals')}</h4>
              <div className="space-y-2.5">
                {weeklyTotals.map((d, i) => {
                  const level = d.total >= avgDailyActivity * 1.08 ? 'high' : d.total <= avgDailyActivity * 0.92 ? 'low' : 'normal';
                  const levelLabel = level === 'high'
                    ? t('highCitizenActivity', 'High citizen activity')
                    : level === 'low'
                      ? t('lowCitizenActivity', 'Low citizen activity')
                      : t('steadyCitizenActivity', 'Steady citizen activity');
                  const levelStyles = level === 'high'
                    ? 'bg-[#FF9933]/12 text-[#FF9933] border-[#FF9933]/20'
                    : level === 'low'
                      ? 'bg-[#138808]/12 text-[#138808] border-[#138808]/20'
                      : 'bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border-black/10 dark:border-white/10';

                  return (
                    <div key={i} className="min-h-12 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-black/10 dark:border-white/10 px-3 py-2.5 flex items-center justify-between gap-2">
                      <p className="text-[13px] font-bold text-slate-900 dark:text-white">{d.day}</p>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${levelStyles}`}>{levelLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scheme Saturation */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-300 uppercase tracking-wider mb-1">{t('schemeSaturationIndex', 'Scheme Saturation Index')}</h4>
              <p className="text-[11px] text-slate-500 dark:text-gray-300 mb-3">{t('easyReadMode', 'Easy read mode: High / Medium / Low adoption')}</p>
              <div className="space-y-3">
                {schemeSaturation.map((s, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] text-slate-900 dark:text-white font-bold">{t(s.scheme, s.scheme)}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.enrolled >= 70
                        ? 'text-[#138808] bg-[#138808]/10'
                        : s.enrolled >= 50
                          ? 'text-[#FF9933] bg-[#FF9933]/10'
                          : 'text-slate-600 dark:text-slate-300 bg-black/5 dark:bg-white/5'
                        }`}>
                        {s.enrolled >= 70 ? t('high', 'High') : s.enrolled >= 50 ? t('medium', 'Medium') : t('low', 'Low')}
                      </span>
                    </div>
                    <div className="h-3 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${s.enrolled}%`,
                          background: `linear-gradient(90deg, #FF9933, ${s.enrolled > 70 ? '#138808' : '#FF9933'})`,

                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-gray-300 mt-3">
                {t('weeklySummarySimpleText', 'Simple summary: activity is highest on')} <span className="font-bold text-slate-900 dark:text-white">{busiestDay.day}</span>, {t('quietestOn', 'quietest on')} <span className="font-bold text-slate-900 dark:text-white">{calmestDay.day}</span>. {t('averageDailyActivity', 'Average daily activity is')} <span className="font-bold text-slate-900 dark:text-white">{avgDailyActivity}</span>.
              </p>
              <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-1">
                {t('averageSchemeMatchesPerDay', 'Average scheme matches per day')}: <span className="font-bold">{avgDailySchemes}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={() => setTab('collective')}
                  className="min-h-11 rounded-xl bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20 text-[11px] font-bold active:scale-[0.98]"
                >
                  {t('openCollectiveNow', 'Open Collective Now')}
                </button>
                <button
                  onClick={() => {
                    setNewsFilter('alerts');
                    setTab('overview');
                  }}
                  className="min-h-11 rounded-xl bg-[#FF9933]/10 text-[#FF9933] border border-[#FF9933]/20 text-[11px] font-bold active:scale-[0.98]"
                >
                  {t('checkPriorityAlerts', 'Check Priority Alerts')}
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'agents' && (
          <>
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t('agentUsageDistribution', 'Agent Usage Distribution')}</h4>
              <DonutChart
                data={agentUsage.map((a) => ({
                  label: t(a.name, a.name),
                  value: a.value,
                  color: a.color,
                }))}
              />
            </div>

            {/* Agent Cards */}
            <div className="space-y-3">
              {agentUsage.map((a, i) => {
                const icons = ['diversity_3', 'handshake', 'medical_services', 'currency_rupee', 'gavel'];
                return (
                  <div
                    key={i}
                    className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3 flex items-center gap-3"
                    style={{ animation: `fadeIn 0.4s ease-out ${i * 0.1}s both` }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: a.color + '20' }}>
                      <span className="material-symbols-outlined text-lg" style={{ color: a.color }}>{icons[i] || 'smart_toy'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">{t(a.name, a.name)}</h5>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-slate-500 dark:text-gray-400">{a.value}% {t('ofQueries', 'of queries')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-slate-900 dark:text-white">{a.value}%</span>
                      <span className="block text-[8px] text-gray-500">{t('usage', 'USAGE')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'trust' && (
          <>
            {/* Trust Score */}
            <div className="bg-gradient-to-br from-[#FF9933]/10 to-[#138808]/10 border border-black/10 dark:border-white/10 rounded-2xl p-6 text-center">
              <span className="material-symbols-outlined text-5xl text-[#FF9933]">verified_user</span>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-2">94.2<span className="text-sm text-slate-500 dark:text-gray-400 font-normal">/100</span></h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{t('communityTrustScore', 'Community Trust Score')}</p>
              <div className="flex items-center justify-center gap-1 mt-3">
                <span className="text-[10px] text-green-400 font-bold">↑ 12.5%</span>
                <span className="text-[10px] text-gray-500">{t('vsLastMonth', 'vs last month')}</span>
              </div>
            </div>

            {/* Trust Metrics */}
            {[
              { label: t('transparencyIndex', 'Transparency Index'), value: 96, icon: 'visibility', description: t('allAiDecisionsIncludeFullReasoningChain', 'All AI decisions include full reasoning chain') },
              { label: t('contentSafety', 'Content Safety'), value: 99.8, icon: 'shield', description: t('azureContentSafetyFiltersActiveOnAllIo', 'Azure Content Safety filters active on all I/O') },
              { label: t('biasScore', 'Bias Score'), value: 2.1, icon: 'balance', description: t('lowBiasDetectedAcrossDemographicGroups', 'Low bias detected across demographic groups'), invert: true },
              { label: t('dataPrivacy', 'Data Privacy'), value: 100, icon: 'lock', description: t('zeroPersonalDataStoredDigipinbasedAnonymization', 'Zero personal data stored. DIGIPIN-based anonymization') },
              { label: t('uptimeSla', 'Uptime SLA'), value: 99.9, icon: 'speed', description: t('pwaOfflinePhi3MiniEnsuresAlwaysonAccess', 'PWA + offline Phi-3 Mini ensures always-on access') },
            ].map((m, i) => (
              <div key={i} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4" style={{ animation: `fadeIn 0.4s ease-out ${i * 0.1}s both` }}>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#FF9933]">{m.icon}</span>
                  <div className="flex-1">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">{m.label}</h5>
                    <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">{m.description}</p>
                  </div>
                  <span className={`text-lg font-black ${m.invert ? (m.value < 5 ? 'text-green-400' : 'text-red-400') : (m.value > 90 ? 'text-green-400' : 'text-amber-400')}`}>
                    {m.value}{m.invert ? '' : '%'}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'pulse' && (
          <NagarPulse />
        )}

        {tab === 'collective' && (() => {
          const activeClusters = allActiveClusters;
          const myClusters = collectiveClusters;
          const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
            water: { icon: 'water_drop', color: '#06B6D4' },
            road: { icon: 'add_road', color: '#F59E0B' },
            sanitation: { icon: 'cleaning_services', color: '#10B981' },
            electricity: { icon: 'bolt', color: '#8B5CF6' },
          };

          return (
            <>
              {/* Header explanation */}
              <div className="bg-gradient-to-r from-[#8B5CF6]/12 to-[#8B5CF6]/5 border border-[#8B5CF6]/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#8B5CF6] text-[28px] mt-0.5">group_work</span>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">{t('collectiveIssues', 'Collective Issues')}</h4>
                    <p className="text-[12px] text-slate-500 dark:text-gray-300 leading-relaxed mt-1.5">
                      {t('whenManyCitizensReportTheSameIssueItBecomesACollectiveComplaintAmplifyingYourVoiceAndPrioritizingResolution', 'When many citizens report the same issue, it becomes a collective complaint — amplifying your voice and prioritizing resolution.')}
                    </p>
                  </div>
                </div>
              </div>

              {/* My joined clusters */}
              {myClusters.length > 0 && (
                <div className="bg-[#138808]/5 border border-[#138808]/15 rounded-2xl p-4">
                  <h4 className="text-[11px] font-bold text-[#138808] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    {t('myCollectiveComplaints', 'My Collective Complaints')}
                  </h4>
                  <div className="space-y-2.5">
                    {myClusters.map((c, i) => {
                      const ci = CATEGORY_ICONS[c.category] || { icon: 'category', color: '#6B7280' };
                      return (
                        <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-white/60 dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ci.color + '15' }}>
                            <span className="material-symbols-outlined text-[19px]" style={{ color: ci.color }}>{ci.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold capitalize leading-tight">{t(c.category, c.category)} {t('issues', 'Issues')} — {t('zone', 'Zone')} {c.location}</p>
                            <p className="text-[11px] text-slate-500 dark:text-gray-300 mt-0.5">{c.participantCount} {t('citizensJoined', 'citizens joined')} · {c.clusterId}</p>
                          </div>
                          <span className="text-[10px] font-bold text-[#138808] bg-[#138808]/10 px-2 py-1 rounded-md">{t('joined', 'Joined ✓')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Browse active clusters */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
                <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#FF9933]">campaign</span>
                  {t('activeCollectiveIssuesNearYou', 'Active Collective Issues Near You')}
                </h4>
                {!canJoinCollective && (
                  <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
                    <span className="font-bold">{t('unlockCollectiveActions', 'Unlock Collective Actions')}:</span>{' '}
                    {t('reachContributorLevelByIncreasingKarmaToJoinAndAmplifyCollectiveComplaints', 'Reach Contributor level by increasing Karma to join and amplify collective complaints.')}
                  </div>
                )}
                <div className="space-y-3">
                  {activeClusters.map((c, i) => {
                    const ci = CATEGORY_ICONS[c.category] || { icon: 'category', color: '#6B7280' };
                    const alreadyJoined = joinedIds.has(c.clusterId) || myClusters.some(mc => mc.clusterId === c.clusterId);
                    return (
                      <div key={i} className={`rounded-xl border overflow-hidden transition-all ${
                        alreadyJoined ? 'bg-[#138808]/5 border-[#138808]/20' : 'bg-white/60 dark:bg-white/[0.02] border-black/5 dark:border-white/5'
                      }`}>
                        <div className="flex items-center gap-3 p-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ci.color + '15' }}>
                            <span className="material-symbols-outlined text-[22px]" style={{ color: ci.color }}>{ci.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-bold capitalize">{t(c.category, c.category)} {t('issues', 'Issues')}</p>
                            <p className="text-[11px] text-slate-500 dark:text-gray-300 mt-0.5">{t('zone', 'Zone')} {c.location} · {c.participantCount} {t('citizens', 'citizens')}</p>
                            <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-1">{c.clusterId} · {c.status === 'amplified' ? t('EscalatedToOfficials', '🔊 Escalated to officials') : t('CollectingVoices', '📢 Collecting voices')}</p>
                          </div>
                        </div>
                        {!alreadyJoined ? (
                          <button
                            disabled={!canJoinCollective}
                            onClick={() => {
                              if (!canJoinCollective) return;
                              setJoinedIds(prev => new Set(prev).add(c.clusterId));
                              addCluster({ ...c, participantCount: c.participantCount + 1 });
                              addKarma(5);
                            }}
                            className={`w-full min-h-11 py-2.5 text-[12px] font-bold border-t transition-all ${
                              canJoinCollective
                                ? 'text-[#8B5CF6] bg-[#8B5CF6]/5 border-[#8B5CF6]/10 hover:bg-[#8B5CF6]/10 active:scale-[0.99]'
                                : 'text-slate-400 dark:text-gray-500 bg-black/5 dark:bg-white/[0.02] border-black/10 dark:border-white/10 cursor-not-allowed'
                            }`}
                          >
                            {canJoinCollective
                              ? `👥 ${t('joinThisCollective', 'Join This Collective')} (${c.participantCount}+ ${t('citizens', 'citizens')})`
                              : `🔒 ${t('contributorRoleRequired', 'Contributor role required')}`}
                          </button>
                        ) : (
                          <div className="w-full min-h-11 py-2.5 text-center text-[12px] font-bold text-[#138808] bg-[#138808]/5 border-t border-[#138808]/10">
                            ✓ {t('youveJoinedYourVoiceCounts', 'You\'ve joined · Your voice counts')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Department Trust Scores */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
                <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-[#138808]">verified</span>
                  {t('departmentPerformance', 'Department Performance')}
                </h4>
                <div className="space-y-2">
                  {getAllTrustScores().slice(0, 5).map((ts, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                      <div className="w-8 text-center shrink-0">
                        <p className="text-sm font-black" style={{ color: ts.color }}>{ts.score}</p>
                        <p className="text-[7px] text-slate-400">/10</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold">{t(ts.department, ts.department)}</p>
                        <p className="text-[8px] text-slate-400 dark:text-gray-500">⏱ {ts.avgResolutionDays}{t('dAvg', 'd avg')} · 📋 {ts.backlog} {t('pending', 'pending')}</p>
                      </div>
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ color: ts.color, backgroundColor: ts.color + '15' }}>{t(ts.label, ts.label)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}
      </div>

      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        <div
          ref={newspaperRef}
          className="w-[800px] min-h-[1131px] bg-[#FDFBF7] text-slate-900 p-3 font-serif flex flex-col border border-slate-400"
          style={{ letterSpacing: '-0.02em', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23noise)\' opacity=\'0.05\'/%3E%3C/svg%3E")' }}
        >
          <div className="flex-1 border-[6px] border-slate-900 p-10 pt-12 flex flex-col">
            <div className="flex flex-col items-center pt-2 mb-6 text-center relative">
              <div className="absolute top-0 w-full flex justify-between px-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
                <span>EST. 2026</span>
                <span>INDIA'S FIRST AI NEWSPAPER</span>
              </div>
              <img src="/logo.png" alt="Bharat Setu" className="h-[64px] object-contain mt-8 mb-5 grayscale mix-blend-multiply opacity-90" />
              <h1 className="text-[4.2rem] font-black uppercase tracking-widest mb-2 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>{newsSummary?.labels?.theBharatSetuDaily || t('theBharatSetuDaily', 'The Bharat Setu Daily')}</h1>
            </div>

            <div className="w-full flex justify-between items-center border-[4px] border-x-0 border-slate-900 py-3 px-3 mb-8 text-[14px] font-bold uppercase tracking-widest bg-slate-900/5">
              <span className="flex-1 text-left">{newsSummary?.labels?.volAndNo || t('volAndNo', 'Volume 1, Issue')} {new Date().getDate()}</span>
              <span className="flex-1 text-center font-black drop-shadow-sm">{new Date().toLocaleDateString(userProfile?.language || 'en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="flex-1 text-right">{newsSummary?.labels?.localEdition || t('localEdition', 'Local Edition')}</span>
            </div>

            <h2 className="text-[3rem] font-black leading-tight mb-6" style={{ fontFamily: 'Georgia, serif' }}>
              {newsSummary?.headline || t('todaysTopStories', 'Today\'s Top Stories & Civic Updates')}
            </h2>

            <div className="text-[20px] leading-relaxed text-justify mb-8 flex-1">
              <p className="font-medium mb-8 text-[22px] leading-relaxed">
                {newsSummary?.intro || 'Generating latest intelligence...'}
              </p>

              {newsSummary?.bullets && (
                <div className="bg-slate-900/5 p-8 border-y-[4px] border-slate-900 my-8">
                  <h3 className="font-bold uppercase tracking-widest text-[17px] mb-5">{newsSummary?.labels?.todaysKeyHighlights || t('todaysKeyHighlights', 'Today\'s Key Highlights:')}</h3>
                  <ul className="space-y-4 font-medium text-[20px]">
                    {newsSummary.bullets.map((bullet, index) => (
                      <li key={index} className="flex gap-4 items-start">
                        <span className="text-[24px] leading-none mt-1 text-[#138808]">■</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t-[4px] border-slate-900 pt-8 mt-8">
              <h3 className="text-[22px] font-black uppercase tracking-widest border-b-2 border-slate-900 pb-3 mb-6">{newsSummary?.labels?.newsBriefs || t('newsBriefs', 'News Briefs')}</h3>
              <div className="grid grid-cols-2 gap-6">
                {filteredNews.slice(0, 4).map((news) => (
                  <div key={news.id} className="border-2 border-slate-900/10 bg-slate-900/5 p-5 rounded px-6">
                    <span className="font-black uppercase tracking-wider text-[11px] bg-slate-900 text-white px-2.5 py-1 rounded-sm inline-block mb-3">{t(news.tKey_tag || news.tag, news.tag)}</span>
                    <h4 className="font-bold text-[19px] mb-2 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>{t(news.tKey_title || news.title, news.title)}</h4>
                    <p className="text-slate-800 text-[15px] leading-snug">{t(news.tKey_desc || news.description, news.description)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 pt-5 border-t-[3px] border-slate-900 flex justify-between items-center text-[12px] font-bold uppercase text-slate-500">
              <span>{newsSummary?.labels?.officialAITranslationProtocol || t('officialAITranslationProtocol', 'Official AI Translation Protocol')}</span>
              <span className="px-3 py-1 bg-slate-200 text-slate-700 rounded-full text-[10px] lowercase">{userProfile?.language || 'en-IN'}</span>
              <span>{newsSummary?.labels?.generatedByBharatSetuIntelligence || t('generatedByBharatSetuIntelligence', 'Generated by Bharat Setu Intelligence')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
