/**
 * Bharat Setu — Iframe Bridge Script
 * Injected into Stitch HTML iframes to capture button clicks
 * and communicate them to the parent Next.js app via postMessage.
 */
(function () {
  'use strict';

  // Prevent double-injection
  if (window.__bharatSetuBridge) return;
  window.__bharatSetuBridge = true;

  // Mapping of text content → actions
  const agentMap = {
    'nagarik mitra': 'nagarik_mitra',
    'swasthya sahayak': 'swasthya_sahayak',
    'yojana saathi': 'yojana_saathi',
    'arthik salahkar': 'arthik_salahkar',
    'vidhi sahayak': 'vidhi_sahayak',
  };

  const screenNavMap = {
    'home': 'home',
    'civic': 'civic',
    'schemes': 'scheme-scanner',
    'scan': 'scheme-scanner',
    'profile': 'profile',
    'docs': 'docs',
    'agents': 'agents',
    'track': 'xray-tracker',
    'impact': 'community',
    'governance': 'governance',
    'my cases': 'civic',
    'voice chat': 'voice',
  };

  function send(action, data) {
    window.parent.postMessage({ source: 'bharat-setu-iframe', action: action, ...data }, '*');
  }

  // Theme synchronization listener
  window.addEventListener('message', function (event) {
    if (event.data && event.data.action === 'sync-theme') {
      if (event.data.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button, a, [role="button"], .cursor-pointer');
    if (!el) return;

    var text = (el.textContent || '').trim().toLowerCase();
    var iconEl = el.querySelector('.material-symbols-outlined');
    var icon = iconEl ? iconEl.textContent.trim().toLowerCase() : '';

    // --- Voice button ---
    if (text.includes('tap to speak') || text.includes('बोलें') || (icon === 'mic' && el.closest('.bg-gradient-to-r'))) {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'voice' });
      return;
    }

    // --- Agent cards ---
    for (var name in agentMap) {
      if (text.includes(name)) {
        e.preventDefault();
        e.stopPropagation();
        send('open-agent-chat', { agent: agentMap[name] });
        return;
      }
    }

    // --- Grievance / Civic action buttons ---
    if (text.includes('initiate rapid response') || text.includes('file grievance') || text.includes('report issue')) {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'grievance' });
      return;
    }

    // --- Scheme scanner buttons ---
    if (text.includes('auto-apply') || text.includes('scan my eligibility') || text.includes('scheme dna')) {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'scheme-scanner' });
      return;
    }

    // --- DIGIPIN locator ---
    if (text.includes('digipin') || icon === 'satellite_alt' || icon === 'gps_fixed') {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'digipin' });
      return;
    }

    // --- Scam alert ---
    if (text.includes('scam') || text.includes('fraud') || text.includes('suspicious')) {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'scam-alert' });
      return;
    }

    // --- WhatsApp share for Civic Karma ---
    if (text.includes('share') && (text.includes('whatsapp') || text.includes('karma') || text.includes('civic karma'))) {
      e.preventDefault();
      e.stopPropagation();
      var karmaMsg = encodeURIComponent('🏆 मैंने Bharat Setu पर Civic Karma points कमाए! साथ मिलकर बेहतर भारत बनाएं। 🇮🇳\n\nDownload Bharat Setu & be a digital citizen hero! #BharatSetu #CivicKarma #DigitalIndia');
      window.open('https://wa.me/?text=' + karmaMsg, '_blank');
      return;
    }

    // --- SOS screen: Cancel SOS / I'm Safe ---
    if (text.includes('cancel sos') || text === "i'm safe" || text.includes('im safe') || text.includes('cancel') && window.location.pathname.includes('sos')) {
      e.preventDefault();
      e.stopPropagation();
      send('navigate', { screen: 'home' });
      return;
    }

    // --- SOS screen: Emergency call buttons ---
    if (text.includes('police') && (text.includes('100') || text.includes('dial') || text.includes('call'))) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'tel:100';
      return;
    }
    if (text.includes('ambulance') || (text.includes('108') && icon === 'medical_services')) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'tel:108';
      return;
    }
    if (text.includes('women') && (text.includes('helpline') || text.includes('1091'))) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'tel:1091';
      return;
    }
    if (text.includes('fire') && text.includes('101')) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'tel:101';
      return;
    }

    // --- SOS trigger (not cancel) ---
    if (icon === 'sos' || (text.includes('sos') && !text.includes('cancel')) || (text.includes('emergency') && !text.includes('cancel'))) {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'sos-active' });
      return;
    }

    // --- Notifications → navigate to Track Cases ---
    if (icon === 'notifications') {
      e.preventDefault();
      e.stopPropagation();
      send('navigate', { screen: 'cases' });
      return;
    }

    // --- Bottom nav links ---
    if (el.closest('nav') || el.closest('.absolute.bottom-0')) {
      var label = el.querySelector('p');
      if (label) {
        var navText = label.textContent.trim().toLowerCase();
        if (screenNavMap[navText]) {
          e.preventDefault();
          e.stopPropagation();
          send('navigate', { screen: screenNavMap[navText] });
          return;
        }
      }
    }

    // --- View All / View History ---
    if (text.includes('view all') || text.includes('view history')) {
      e.preventDefault();
      e.stopPropagation();
      send('navigate', { screen: 'civic' });
      return;
    }

    // --- Impact / Community cards ---
    if (el.closest('.glass-card') || el.closest('.rounded-xl')) {
      if (text.includes('health') || icon === 'vaccines' || icon === 'medical_services') {
        send('open-agent-chat', { agent: 'swasthya_sahayak' });
        return;
      }
      if (text.includes('welfare') || icon === 'payments' || icon === 'handshake') {
        send('open-agent-chat', { agent: 'yojana_saathi' });
        return;
      }
      if (text.includes('legal') || icon === 'gavel') {
        send('open-agent-chat', { agent: 'vidhi_sahayak' });
        return;
      }
      if (text.includes('civic') || icon === 'campaign' || icon === 'diversity_3') {
        send('open-agent-chat', { agent: 'nagarik_mitra' });
        return;
      }
      if (text.includes('finance') || icon === 'currency_rupee') {
        send('open-agent-chat', { agent: 'arthik_salahkar' });
        return;
      }
    }

    // --- Retry / Connection ---
    if (text.includes('retry') || text.includes('connection')) {
      e.preventDefault();
      e.stopPropagation();
      send('open-overlay', { overlay: 'voice' });
      return;
    }

    // --- Stop recording ---
    if (icon === 'stop' && el.classList.contains('bg-red-500')) {
      send('voice-stop', {});
      return;
    }
  }, true); // Use capture phase to intercept before any other handlers

  // Hide the bottom nav in Stitch screens (parent app provides its own)
  var style = document.createElement('style');
  style.textContent = `
    body > div > .absolute.bottom-0,
    body > div > nav:last-child,
    nav.fixed.bottom-0,
    .fixed.bottom-0 {
      display: none !important;
    }
    body > div > div {
      padding-bottom: 0 !important;
    }
    body {
      min-height: auto !important;
    }
  `;
  document.head.appendChild(style);

  // Log bridge activation
  console.log('[Bharat Setu Bridge] Active — postMessage relay enabled');
})();
