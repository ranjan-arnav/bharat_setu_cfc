'use client';

interface VoiceFABProps {
  active: boolean;
  onToggle: () => void;
}

export default function VoiceFAB({ active, onToggle }: VoiceFABProps) {
  return (
    <button
      onClick={onToggle}
      className={`
        fixed z-[60] right-4 bottom-24 w-14 h-14 rounded-full shadow-2xl
        flex items-center justify-center transition-all duration-500 ease-out
        ${active
          ? 'bg-gradient-to-br from-[#138808] to-[#0d5c06] scale-110 shadow-green-500/40'
          : 'bg-gradient-to-br from-[#FF9933] to-[#E68A2E] shadow-orange-500/30 hover:scale-105'
        }
      `}
      aria-label={active ? 'Stop voice assistant' : 'Start voice assistant'}
    >
      {/* Pulse rings when active */}
      {active && (
        <>
          <span className="absolute inset-0 rounded-full border-2 border-green-400/40 animate-ping" />
          <span
            className="absolute -inset-2 rounded-full border-2 border-green-400/20"
            style={{ animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s' }}
          />
        </>
      )}

      <span className="material-symbols-outlined text-slate-900 dark:text-white text-2xl relative z-10">
        {active ? 'hearing' : 'mic'}
      </span>

      {/* Active label */}
      {active && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-green-400 bg-slate-50/90 dark:bg-[#0a1628]/90 px-2 py-0.5 rounded-full border border-green-500/30">
          🎤 Listening...
        </span>
      )}
    </button>
  );
}
