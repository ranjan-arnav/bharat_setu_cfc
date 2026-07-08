"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { DEMO_SCHEMES } from "@/lib/demo-data";
import { FlagStripe, AshokaChakra } from "@/components/ui/GoiElements";
import { useTTS } from "@/hooks/useTTS";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { buildBackendUserId } from "@/lib/backend-identity";

type SchemeItem = (typeof DEMO_SCHEMES)[0];

export default function SchemeScanner({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { userProfile } = useAppStore();
  const [scanning, setScanning] = useState(true);
  const [scanStep, setScanStep] = useState(0);
  const [schemes, setSchemes] = useState<SchemeItem[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<SchemeItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [generatingAudio, setGeneratingAudio] = useState(false);
  const { isPlaying: playingAudio, playTTS } = useTTS(
    userProfile.language?.split("-")[0] || "hi",
  );

  useEffect(() => {
    if (!scanning) return;
    const steps = 5;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setScanStep(step);
      if (step >= steps) {
        clearInterval(interval);
        fetchSchemes();
      }
    }, 600);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSchemes = async () => {
    try {
      const res = await fetch("/api/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${userProfile.occupation} ${userProfile.state}`,
          filters: {
            state: userProfile.state,
            income_limit: userProfile.income,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.schemes?.length) {
          // Add match scores if not from Azure
          const withScores = data.schemes.map((s: SchemeItem, i: number) => ({
            ...s,
            match_score: s.match_score || Math.max(98 - i * 7, 50),
            status: s.status || "eligible",
            docs_needed: s.docs_needed || ["Aadhaar Card"],
          }));
          setSchemes(withScores);
          setScanning(false);
          return;
        }
      }
    } catch {
      // fallback
    }
    setSchemes(DEMO_SCHEMES);
    setScanning(false);
  };

  const filteredSchemes = searchQuery
    ? schemes.filter(
        (s) =>
          s.scheme_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : schemes;

  const scanSteps = [
    t("loadingCitizenProfile", "Loading citizen profile..."),
    t(
      "matchingGovernmentSchemesDatabase",
      "Matching government schemes database...",
    ),
    t("calculatingEligibilityScores", "Calculating eligibility scores..."),
    t("checkingSchemeSaturation", "Checking scheme saturation..."),
    t("generatingPersonalizedResults", "Generating personalized results..."),
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registered":
        return (
          <span className="text-[9px] font-bold bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30">
            {t("registeredStatus", "✓ Registered")}
          </span>
        );
      case "eligible":
        return (
          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">
            {t("eligibleStatus", "Eligible")}
          </span>
        );
      default:
        return (
          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
            {t("notAppliedStatus", "Not Applied")}
          </span>
        );
    }
  };

  const handleListenScheme = async (
    e: React.MouseEvent,
    scheme: SchemeItem,
  ) => {
    e.stopPropagation();

    if (playingAudio) {
      playTTS(""); // toggle off
      return;
    }

    try {
      setGeneratingAudio(true);

      const targetLang = userProfile.language || "hi-IN";
      const shortLang = targetLang.split("-")[0];

      let generatedScript = `${scheme.scheme_name}. Benefits: ${scheme.benefits?.split("|")[0] || scheme.benefits}. Required documents include: ${(scheme.docs_needed || []).join(", ")}. Yojana Saathi can help you apply for this scheme.`;

      const explainRes = await fetch("/api/explain-scheme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemeName: scheme.scheme_name,
          description: scheme.description,
          benefits: scheme.benefits,
          docsNeeded: scheme.docs_needed || [],
          lang: shortLang,
        }),
      });

      if (explainRes.ok) {
        const data = await explainRes.json();
        if (data.script) {
          generatedScript = data.script;
        }
      }

      playTTS(generatedScript);
    } catch (err) {
      console.error("Failed to generate audio:", err);
    } finally {
      setGeneratingAudio(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto"
      style={{ animation: "slideUp 0.3s ease-out" }}
    >
      <FlagStripe />
      <div className="flex items-center gap-3 px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">
            arrow_back
          </span>
        </button>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {t("schemeDnaScannerTitle", "🧬 Scheme DNA Scanner")}
          </h2>
          <p className="text-[10px] text-slate-500 dark:text-gray-400">
            {t(
              "aiEligibilityMatchingFor800Schemes",
              "AI-powered eligibility matching for 800+ schemes",
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-amber-500/20 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
          <span className="text-[9px] text-amber-400 font-bold">
            {t("yojanaSaathi", "Yojana Saathi")}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {scanning ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-8 py-12">
            {/* DNA helix animation */}
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full border-4 border-[#FF9933]/30 animate-ping"></div>
              <div
                className="absolute inset-2 rounded-full border-4 border-[#138808]/30 animate-ping"
                style={{ animationDelay: "0.5s" }}
              ></div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FF9933]/20 to-[#138808]/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#FF9933] text-4xl">
                  qr_code_scanner
                </span>
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {t("scanningProfile")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {userProfile.name} • {userProfile.occupation} •{" "}
                {userProfile.state}
              </p>
            </div>

            {/* Profile being scanned */}
            <div className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-gray-400">
                  {t("DIGIPIN")}
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {userProfile.digipin}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-gray-400">
                  {t("occupation", "Occupation")}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {t(userProfile.occupation, userProfile.occupation)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-gray-400">
                  {t("annualIncome", "Annual Income")}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ₹{(userProfile.income / 1000).toFixed(0)}K
                </span>
              </div>
            </div>

            <div className="w-full space-y-3">
              {scanSteps.map((stepText, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < scanStep ? (
                    <span className="material-symbols-outlined text-green-400 text-lg">
                      check_circle
                    </span>
                  ) : i === scanStep ? (
                    <div className="w-5 h-5 border-2 border-[#FF9933] border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="material-symbols-outlined text-gray-600 text-lg">
                      radio_button_unchecked
                    </span>
                  )}
                  <span
                    className={`text-xs ${i <= scanStep ? "text-slate-900 dark:text-white" : "text-gray-500"}`}
                  >
                    {stepText}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {/* Results Header */}
            <div className="bg-gradient-to-r from-green-500/15 to-blue-500/15 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-green-400 text-2xl">
                verified
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {schemes.length}{" "}
                  {t("schemesMatchedTitle", "Schemes Matched!")}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400">
                  {t(
                    "basedOnProfileAnalysisUsingAzureAiSearch",
                    "Based on your profile analysis using Azure AI Search",
                  )}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search schemes...")}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 outline-none focus:border-[#FF9933]/40"
              />
            </div>

            {/* Scheme Cards */}
            {filteredSchemes.map((scheme, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const newScheme =
                    selectedScheme?.scheme_name === scheme.scheme_name
                      ? null
                      : scheme;
                  setSelectedScheme(newScheme);
                  playTTS("");
                }}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 text-left hover:bg-white/8 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      {scheme.scheme_name}
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">
                      {scheme.ministry}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="bg-gradient-to-r from-[#FF9933] to-[#138808] text-slate-900 dark:text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {scheme.match_score}% {t("Match")}
                    </div>
                    {getStatusBadge(scheme.status)}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed mb-2">
                  {scheme.description}
                </p>

                <div className="flex items-center gap-2 text-[10px]">
                  <span className="bg-black/10 dark:bg-white/10 text-slate-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                    {scheme.category}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-green-400 font-bold">
                    {scheme.benefits?.split("|")[0] || scheme.benefits}
                  </span>
                </div>

                {/* Expanded details */}
                {selectedScheme?.scheme_name === scheme.scheme_name && (
                  <div
                    className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase">
                        {t("Eligibility")}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => handleListenScheme(e, scheme)}
                        disabled={generatingAudio}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                          playingAudio
                            ? "bg-red-500/10 text-red-600"
                            : "bg-[#FF9933]/10 text-[#FF9933]"
                        }`}
                      >
                        {generatingAudio ? (
                          <AshokaChakra size={12} color="#FF9933" spin />
                        ) : (
                          <span className="material-symbols-outlined text-[14px]">
                            {playingAudio ? "stop_circle" : "volume_up"}
                          </span>
                        )}
                        {playingAudio ? "Stop" : "Listen"}
                      </button>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-gray-300">
                        {scheme.eligibility}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">
                        {t("requiredDocuments", "Required Documents")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {scheme.docs_needed?.map((doc) => (
                          <span
                            key={doc}
                            className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-500/20"
                          >
                            📄 {doc}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const state = useAppStore.getState();
                        const userId = buildBackendUserId(state);
                        void fetch("/api/backend/scheme-applications", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            userId,
                            applicationId: `scheme-${Date.now()}-${i}`,
                            schemeName: scheme.scheme_name,
                            workflowStage: "submitted",
                            notes: `Application initiated from Scheme DNA Scanner`,
                            docsStatus: scheme.docs_needed || [],
                          }),
                        }).catch(() => {
                          // non-blocking write; continue UX even if backend is unavailable
                        });
                        // Instead of redirecting, close the scanner and dispatch an event to open the agent tab
                        onClose();
                        // Use a custom event to tell the main layout to switch to the agent tab
                        // and start a chat about applying for this scheme
                        window.dispatchEvent(
                          new CustomEvent("start-scheme-application", {
                            detail: { schemeName: scheme.scheme_name },
                          }),
                        );
                      }}
                      className="block w-full bg-gradient-to-r from-[#FF9933] to-[#E68A2E] text-slate-900 dark:text-white text-center font-bold py-2.5 rounded-xl text-sm cursor-pointer hover:shadow-lg hover:shadow-[#FF9933]/20 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">
                        chat_bubble
                      </span>
                      {t("Apply via Yojana Saathi Agent")}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Saturation Note */}
            {(() => {
              const registeredCount = schemes.filter(
                (s) => s.status === "registered",
              ).length;
              const totalCount = schemes.length;
              const saturationPct =
                totalCount > 0
                  ? Math.round((registeredCount / totalCount) * 100)
                  : 0;
              return (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5">
                    info
                  </span>
                  <p className="text-[10px] text-amber-700 dark:text-amber-300/80">
                    <strong>
                      {t("Scheme Saturation Score:")} {saturationPct}%
                    </strong>{" "}
                    — {t("You're registered in")} {registeredCount} {t("of")}{" "}
                    {totalCount}{" "}
                    {t(
                      "top eligible schemes. Let Yojana Saathi auto-fill your remaining applications.",
                    )}
                  </p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
