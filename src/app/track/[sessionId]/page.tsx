import React from 'react';

// This is a simplified demo version of the tracking page.
// In a full implementation, this page would connect to the database via polling or websockets
// to get live updates for the specific `sessionId` and render them on a real map library (like mapping mapbox/google maps API).

// Required for static export
export function generateStaticParams() {
    // Return a demo session ID for static generation
    // In production, this would be handled dynamically or via a different approach
    return [
        { sessionId: 'demo' },
    ];
}

export default function TrackingPage({ params }: { params: { sessionId: string } }) {
    const { sessionId } = params;

    return (
        <div className="min-h-screen bg-[#0a1628] text-slate-900 dark:text-white flex flex-col items-center justify-center p-8 text-center gap-6">
            <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                <span className="material-symbols-outlined text-red-500 text-5xl">radar</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-widest text-red-400">Live SOS Tracking</h1>
            <p className="text-slate-400 max-w-md">
                Emergency event ID: <span className="text-slate-900 dark:text-white font-mono break-all">{sessionId}</span>
            </p>

            <div className="w-full max-w-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-8 mt-4 flex flex-col gap-6 shadow-2xl relative overflow-hidden">
                {/* Decorative Grid Background */}
                <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                        <span className="material-symbols-outlined text-red-500 animate-pulse">emergency_home</span>
                        <p className="font-bold text-red-400 text-sm uppercase tracking-wider text-left">Status: SOS Active & Broadcasting</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-4 rounded-xl text-left space-y-1">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">DIGIPIN (ISRO Grid)</p>
                            <p className="text-xl font-mono text-slate-900 dark:text-white">4H9J-R2X-9PA</p>
                        </div>
                        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-4 rounded-xl text-left space-y-1">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Last Updated (Accuracy)</p>
                            <p className="text-xl font-mono text-green-400">Just now (±12m)</p>
                        </div>
                    </div>

                    <div className="mt-4 bg-[#11233A] rounded-xl h-64 flex items-center justify-center border border-black/10 dark:border-white/10">
                        <p className="text-slate-500 font-mono text-sm max-w-xs">{`[Map component tracking ${sessionId} would render here]`}</p>
                    </div>
                </div>
            </div>

            <div className="mt-8 text-sm text-slate-500 max-w-lg">
                This is a live tracking link dispatched to emergency responders and personal contacts. The victim&apos;s device is continuously pushing coordinates via background tasks.
            </div>
        </div>
    );
}
