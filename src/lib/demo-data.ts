// Rich demo data for when Azure keys aren't configured
// This makes the app fully functional and impressive in demo mode

import type { AgentKey } from './store';

const DEMO_YEAR = new Date().getFullYear();

export const DEMO_AGENT_RESPONSES: Record<AgentKey, Record<string, string>> = {
  nagarik_mitra: {
    default: `🏛️ नमस्ते! मैं नागरिक मित्र हूँ, आपका सिविक सेवा सहायक।

मैं इन सेवाओं में आपकी मदद कर सकता हूँ:

📋 **जन्म/मृत्यु प्रमाणपत्र** - ऑनलाइन आवेदन में सहायता
🏠 **संपत्ति पंजीकरण** - दस्तावेज़ चेकलिस्ट और प्रक्रिया
🪪 **राशन कार्ड** - नया/अपडेट/पोर्टेबिलिटी
📍 **DIGIPIN पता सत्यापन** - ISRO 4x4m grid verification
🔧 **नगर निगम शिकायत** - सड़क, पानी, बिजली, सफाई
📝 **RTI आवेदन** - Right to Information दाखिल करें

आपको किस सेवा की ज़रूरत है? हिंदी या English में बताएं।`,
    streetlight: `🔦 **टूटे स्ट्रीटलाइट की शिकायत दर्ज की जा रही है...**

📍 DIGIPIN: 88-H2K-99L1 से आपका स्थान detect हुआ
📸 Azure Vision से फोटो analyze हो रही है → "Dark street with non-functional lamp post detected"

✅ **शिकायत ID: GRV-NM-${DEMO_YEAR}-0847** 
⏱️ अनुमानित समाधान: 48 घंटे (Priority: HIGH)
📧 SMS और WhatsApp पर updates मिलेंगे

🔁 मैं इसे **Ward Officer** और **Electricity Board** दोनों को भेज रहा हूँ।

*💡 क्या आप Vidhi Sahayak से Zero FIR के बारे में जानना चाहेंगे?*`,
    water: `💧 **जल शिकायत - Jal Jeevan Mission Portal**

आपके DIGIPIN 88-H2K-99L1 के आधार पर:
- वार्ड: 42, ब्लॉक C
- जल आपूर्ति स्थिति: ⚠️ Intermittent (3 दिन से अनियमित)

📊 **IoT Sensor Data (Azure IoT Hub):**
- पाइपलाइन दबाव: 1.2 bar (सामान्य: 3.5 bar)
- जल प्रवाह: 0.8 m³/s (सामान्य: 4.2 m³/s)

✅ **Auto-Generated Report:** PHE Department को भेजा गया
🔔 Ticket: WTR-${DEMO_YEAR}-1156 | Priority: CRITICAL
📱 SMS update अगले 2 घंटे में`,
  },
  swasthya_sahayak: {
    default: `🏥 नमस्ते! मैं स्वास्थ्य सहायक हूँ।

मैं इनमें मदद कर सकता हूँ:

💊 **आयुष्मान भारत PM-JAY** - ₹5 लाख तक का स्वास्थ्य बीमा
🏨 **नज़दीकी अस्पताल** - DIGIPIN-based location search
💉 **टीकाकरण शेड्यूल** - U-WIN portal integration
📋 **स्वास्थ्य रिकॉर्ड** - ABDM Health Records
🚑 **Emergency: 108 कॉल करें** - तुरंत एम्बुलेंस

क्या आप आयुष्मान भारत में एनरोल करना चाहते हैं?`,
    vaccination: `💉 **टीकाकरण शेड्यूल - U-WIN Integration**

👶 बच्चे का नाम: (कृपया बताएं)
📍 DIGIPIN: आपके क्षेत्र में

**आगामी टीकाकरण:**
| Date | Vaccine | Center |
|------|---------|--------|
| 28 Oct | OPV Booster | निकटतम PHC |
| 15 Nov | DPT-3 | CHC Main |
| 20 Dec | Measles-1 | निकटतम PHC |

🏨 निकटतम केंद्र: आपके नज़दीकी PHC
⏰ समय: सोम-शनि, 9AM-2PM

SMS reminder set करना चाहेंगे?`,
  },
  yojana_saathi: {
    default: `📋 नमस्ते! मैं योजना साथी हूँ - आपका वेलफेयर स्कीम मैचर।

🧬 **Scheme DNA Scanner** से मैं 800+ सरकारी योजनाओं में से आपके लिए सही योजनाएं ढूंढता हूँ।

✅ **लोकप्रिय योजनाएं:**
1. 🌾 PM-KISAN - ₹6,000/वर्ष (3 किस्तें)
2. 🏠 PM Awas Yojana - मकान सहायता
3. 💼 MGNREGA - 100 दिन गारंटी रोज़गार
4. 🌧️ PM Fasal Bima - फसल बीमा
5. ⛽ PM Ujjwala - मुफ्त गैस कनेक्शन

अपनी ज़रूरत बताएं — मैं पात्रता जांचकर सही योजना ढूंढूंगा।`,
    kisan: `🌾 **PM-KISAN Samman Nidhi - पूरी जानकारी**

💰 **लाभ:** ₹6,000/वर्ष (₹2,000 × 3 किस्तें)
📅 **अगली किस्त:** Dec ${DEMO_YEAR} - Feb ${DEMO_YEAR + 1}

**आवेदन प्रक्रिया:**
1️⃣ pmkisan.gov.in पर जाएं
2️⃣ "New Farmer Registration" पर क्लिक करें
3️⃣ आधार नंबर दर्ज करें
4️⃣ ज़मीन के कागज़ात अपलोड करें
5️⃣ बैंक खाता विवरण भरें

📑 **ज़रूरी दस्तावेज़:**
- आधार कार्ड ✓
- खसरा/खतौनी (भूमि रिकॉर्ड) ✓
- बैंक पासबुक ✓

🤖 मैं form auto-fill कर सकता हूँ। शुरू करें?`,
  },
  arthik_salahkar: {
    default: `💰 नमस्ते! मैं आर्थिक सलाहकार हूँ।

मैं इनमें सहायता करता हूँ:

🏦 **Jan Dhan खाता** - Banking services
📱 **UPI सहायता** - Digital payment help
💳 **Mudra Loan** - ₹10 लाख तक collateral-free
💰 **सेविंग्स गाइड** - बचत और निवेश
🚨 **Scam Alert** - धोखाधड़ी से सुरक्षा

⚠️ **आज का Scam Alert:**
🔴 फ़र्ज़ी "PM Yojana" WhatsApp messages से सावधान! सरकार कभी OTP नहीं माँगती।

किस विषय पर मदद चाहिए?`,
    scam: `🚨 **SCAM DETECTED - MuleHunter.AI Analysis**

📞 बताएं क्या हुआ:
"किसी ने फोन किया और बोला कि PM Yojana का ₹15,000 आपके खाते में आ रहा है, बस OTP बताइए"

🔍 **AI Analysis:**
- Pattern: "Government Scheme OTP Fraud"
- Risk Level: 🔴 HIGH
- Known Scam DB Match: 94.7%

**तुरंत कदम:**
1️⃣ ❌ OTP कभी न बताएं
2️⃣ 📱 1930 पर Cyber Crime Helpline कॉल करें
3️⃣ 📝 cybercrime.gov.in पर शिकायत दर्ज करें
4️⃣ 🏦 बैंक को तुरंत सूचित करें

📊 **Socratic Teaching Mode:**
❓ क्या सरकार कभी फोन पर OTP माँगती है?
👉 नहीं! सरकारी योजनाओं का पैसा सीधे बैंक में आता है, बिना OTP।

*🔁 Vidhi Sahayak से Zero FIR guidance चाहिए?*`,
  },
  vidhi_sahayak: {
    default: `⚖️ नमस्ते! मैं विधि सहायक हूँ - आपका कानूनी मार्गदर्शक।

मैं इनमें मदद करता हूँ:

📋 **FIR दर्ज करना** - प्रक्रिया और अधिकार
⚖️ **मुफ्त कानूनी सहायता** - NALSA/Nyaya Bandhu
🏠 **ज़मीन विवाद** - समाधान के रास्ते
🛡️ **उपभोक्ता अधिकार** - e-Daakhil शिकायत
📑 **कानूनी दस्तावेज़** - सरल भाषा में समझें
🚨 **Zero FIR** - कहीं भी FIR दर्ज करें

⚠️ *मैं कानूनी जानकारी देता हूँ, legal advice नहीं। गंभीर मामलों में वकील से मिलें।*`,
    zerofir: `🚨 **Zero FIR - आपका अधिकार (BNSS Section 173)**

**Zero FIR क्या है?**
किसी भी थाने में, किसी भी अपराध की FIR दर्ज कराने का आपका अधिकार। पुलिस मना नहीं कर सकती।

**प्रक्रिया:**
1️⃣ नज़दीकी थाने जाएं (कोई भी थाना)
2️⃣ लिखित शिकायत दें
3️⃣ FIR की कॉपी माँगें (आपका अधिकार)
4️⃣ FIR नंबर नोट करें

**अगर पुलिस FIR न ले:**
📱 SP/SSP को शिकायत करें
📧 IGRS Portal: igrs.up.gov.in पर online दर्ज करें
⚖️ Magistrate (BNSS 175(3)) से direct order

🔗 **Nyaya Bandhu (मुफ्त वकील):**
Helpline: 15100
App: NALSA Nyaya Bandhu

*💡 क्या मैं Nyaya Bandhu से appointment बुक करूँ?*`,
  },
  kisan_mitra: {
    default: `🌾 नमस्ते! मैं किसान मित्र हूँ - आपका कृषि सहायक।

मैं इनमें मदद कर सकता हूँ:

🔍 **फसल रोग पहचान** - फोटो भेजें
📊 **मंडी भाव** - ताज़ा कीमतें जानें
🌦️ **मौसम अलर्ट** - खेती की सलाह
🚜 **PM-KISAN** - स्थिति और पंजीकरण
🐄 **पशुपालन** - देखभाल और योजनाएं

आज मैं आपके खेत के लिए क्या मदद कर सकता हूँ?`,
    market: `📊 **मंडी भाव - Mandi Prices**
आज के ताज़ा भाव:
- गेहूँ: ₹2,275/क्विंटल
- सरसों: ₹5,450/क्विंटल
- चना: ₹5,440/क्विंटल
क्या आप किसी अन्य फसल का भाव जानना चाहते हैं?`,
    diagnosis: `🔍 **फसल रोग पहचान**
कृपया अपनी फसल की बीमारी वाली पत्ती या पौधे की फोटो खींचकर भेजें। मैं देखकर बताऊंगा कि यह कौन सा रोग है और इसका क्या इलाज है।`,
  },
};

// Typing indicator delay simulation
export function getTypingDelay(text: string): number {
  return Math.min(Math.max(text.length * 15, 800), 3000);
}

// Demo grievance response for Sunita persona
export const SUNITA_FLOW = {
  photoAnalysis: {
    caption: 'Dark street corner with a broken street light post. The area appears poorly lit with potential safety hazard.',
    tags: ['street', 'night', 'dark', 'broken lamp', 'safety hazard', 'urban', 'infrastructure'],
    objects: ['street_light', 'road', 'building'],
    severity: 'HIGH',
    autoCategory: 'Infrastructure - Street Lighting',
  },
  grievanceTicket: {
    id: `GRV-NM-${DEMO_YEAR}-0847`,
    status: 'Submitted' as const,
    department: 'Municipal Corporation - Electrical Wing',
    ward: 'Ward 42, Sector C',
    priority: 'HIGH (Safety Hazard Detected)',
    estimatedResolution: '48 hours',
    digipin: '88-H2K-99L1',
  },
  scamDetection: {
    type: 'Deepfake Voice OTP Fraud',
    riskLevel: 94.7,
    pattern: 'Government Scheme OTP Scam',
    action: 'Report to MuleHunter.AI + Cybercrime.gov.in',
  },
  zeroFIR: {
    right: 'BNSS Section 173',
    helpline: '15100 (Nyaya Bandhu)',
    cyberCrime: '1930',
    portal: 'cybercrime.gov.in',
  },
};

// Demo scheme data with more rich details
export const DEMO_SCHEMES = [
  {
    scheme_name: 'PM-KISAN Samman Nidhi',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    description: 'Direct income support of ₹6,000/year to all land-holding farmer families, transferred in 3 installments.',
    eligibility: 'All land-holding farmer families with cultivable land (Aadhaar-linked bank account required)',
    benefits: '₹6,000/year (₹2,000 × 3 installments)',
    category: 'Agriculture',
    application_url: 'https://pmkisan.gov.in',
    deadline: 'Open enrollment',
    match_score: 98,
    status: 'eligible',
    docs_needed: ['Aadhaar Card', 'Land Records (Khatauni)', 'Bank Passbook'],
  },
  {
    scheme_name: 'Ayushman Bharat PM-JAY',
    ministry: 'Ministry of Health & Family Welfare',
    description: 'Health insurance coverage of ₹5 lakh per family per year for secondary and tertiary hospitalization.',
    eligibility: 'Bottom 40% vulnerable families as per SECC 2011 data',
    benefits: '₹5,00,000 cashless health cover per family per year at empanelled hospitals',
    category: 'Health',
    application_url: 'https://pmjay.gov.in',
    deadline: 'Open enrollment',
    match_score: 92,
    status: 'eligible',
    docs_needed: ['Aadhaar Card', 'Ration Card', 'Income Certificate'],
  },
  {
    scheme_name: 'PM Awas Yojana (Gramin)',
    ministry: 'Ministry of Rural Development',
    description: 'Financial assistance for construction of pucca houses for rural families without adequate housing.',
    eligibility: 'Houseless or living in kutcha/dilapidated houses in rural areas',
    benefits: '₹1,20,000 (plains) / ₹1,30,000 (hilly areas) + 90 days MGNREGA wages',
    category: 'Housing',
    application_url: 'https://pmayg.nic.in',
    deadline: 'Rolling basis',
    match_score: 85,
    status: 'eligible',
    docs_needed: ['Aadhaar Card', 'BPL Certificate', 'Land Ownership Proof'],
  },
  {
    scheme_name: 'MGNREGA',
    ministry: 'Ministry of Rural Development',
    description: '100 days guaranteed wage employment per financial year to every rural household.',
    eligibility: 'Any rural household adult willing to do unskilled manual work',
    benefits: '100 days employment @ ₹267-348/day (state-wise rates)',
    category: 'Employment',
    application_url: 'https://nrega.nic.in',
    deadline: 'Always open',
    match_score: 95,
    status: 'registered',
    docs_needed: ['Job Card', 'Aadhaar Card'],
  },
  {
    scheme_name: 'PM Mudra Yojana',
    ministry: 'Ministry of Finance',
    description: 'Collateral-free loans for micro and small enterprise development under Shishu, Kishore, and Tarun categories.',
    eligibility: 'Non-farm small/micro enterprises, individuals starting business',
    benefits: 'Shishu: ₹50K | Kishore: ₹5L | Tarun: ₹10L (collateral-free)',
    category: 'Finance',
    application_url: 'https://mudra.org.in',
    deadline: 'Open',
    match_score: 72,
    status: 'not_applied',
    docs_needed: ['Identity Proof', 'Business Plan', 'Address Proof'],
  },
  {
    scheme_name: 'PM Fasal Bima Yojana',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    description: 'Comprehensive crop insurance against natural calamities, pests, and diseases at minimal premium.',
    eligibility: 'All farmers growing notified crops in notified areas (loanee farmers auto-enrolled)',
    benefits: 'Premium: 2% Kharif, 1.5% Rabi, 5% Commercial | Full sum insured coverage',
    category: 'Agriculture',
    application_url: 'https://pmfby.gov.in',
    deadline: 'Season-wise enrollment',
    match_score: 96,
    status: 'eligible',
    docs_needed: ['Land Records', 'Bank Account', 'Aadhaar', 'Sowing Certificate'],
  },
  {
    scheme_name: 'PM Ujjwala Yojana 2.0',
    ministry: 'Ministry of Petroleum & Natural Gas',
    description: 'Free LPG gas connection with first refill and stove for female members of eligible households.',
    eligibility: 'Adult women from BPL/SC/ST/PMAY/AAY/forest dweller households without LPG connection',
    benefits: 'Free deposit-free LPG connection + first refill + stove',
    category: 'Energy',
    application_url: 'https://pmuy.gov.in',
    deadline: 'Open enrollment',
    match_score: 88,
    status: 'eligible',
    docs_needed: ['Aadhaar Card', 'BPL Ration Card', 'Bank Account'],
  },
];

// Impact dashboard data
export const IMPACT_DATA = {
  overview: {
    totalUsers: 12847,
    grievancesResolved: 3421,
    schemesMatched: 8293,
    languagesServed: 14,
    districtsActive: 47,
    avgResolutionDays: 4.2,
  },
  weeklyTrend: [
    { day: 'Mon', grievances: 145, schemes: 312, voice: 89 },
    { day: 'Tue', grievances: 167, schemes: 298, voice: 112 },
    { day: 'Wed', grievances: 189, schemes: 345, voice: 98 },
    { day: 'Thu', grievances: 156, schemes: 378, voice: 134 },
    { day: 'Fri', grievances: 201, schemes: 356, voice: 121 },
    { day: 'Sat', grievances: 134, schemes: 289, voice: 76 },
    { day: 'Sun', grievances: 98, schemes: 245, voice: 54 },
  ],
  agentUsage: [
    { name: 'Nagarik Mitra', value: 34, color: '#3B82F6' },
    { name: 'Yojana Saathi', value: 28, color: '#F59E0B' },
    { name: 'Swasthya Sahayak', value: 18, color: '#10B981' },
    { name: 'Arthik Salahkar', value: 12, color: '#8B5CF6' },
    { name: 'Vidhi Sahayak', value: 8, color: '#EF4444' },
  ],
  topGrievances: [
    { category: 'Water Supply', count: 847, trend: 'down' },
    { category: 'Road & Infrastructure', count: 623, trend: 'up' },
    { category: 'Electricity', count: 512, trend: 'stable' },
    { category: 'Sanitation', count: 389, trend: 'down' },
    { category: 'Street Lighting', count: 298, trend: 'up' },
  ],
  schemeSaturation: [
    { scheme: 'PM-KISAN', enrolled: 89, target: 100 },
    { scheme: 'Ayushman Bharat', enrolled: 67, target: 100 },
    { scheme: 'PM Awas', enrolled: 45, target: 100 },
    { scheme: 'MGNREGA', enrolled: 78, target: 100 },
    { scheme: 'PM Ujjwala', enrolled: 52, target: 100 },
  ],
};
