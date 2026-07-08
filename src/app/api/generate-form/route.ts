import { NextRequest, NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import { extractStructuredAction } from '../../../../BACKEND/src/action-ner';

let rrCounter = 0;
function pickDeployment(): string {
  const depB = geminiConfig.model;
  if (!depB) return geminiConfig.model; // only A configured
  return (rrCounter++ % 2 === 0) ? geminiConfig.model : depB;
}

type PrecreatedForm = {
  formKey?: string;
  title: string;
  type: 'scheme' | 'health' | 'finance' | 'legal' | 'grievance';
  subtitle?: string;
  ministry?: string;
  fields: {
    name: string;
    label: string;
    section?: string;
    inputType?: 'text' | 'textarea' | 'number' | 'date' | 'radio' | 'checkboxGroup' | 'select' | 'file';
    options?: string[];
    required?: boolean;
    helpText?: string;
    autofillSource?: string;
  }[];
  documents: string[];
  eligibility?: string[];
  benefits?: string[];
};

const precreatedTranslationCache = new Map<string, string>();

const ONBOARDING_LANG_CODES = new Set([
  'hi', 'en', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as',
  'ur', 'ne', 'mai', 'kok', 'mni', 'doi', 'sat', 'brx', 'ks', 'sd',
]);

const LANG_FALLBACK_MAP: Record<string, string> = {
  mai: 'hi',
  doi: 'hi',
  sat: 'hi',
  kok: 'mr',
  mni: 'bn',
  brx: 'as',
  ks: 'ur',
  sd: 'ur',
};

function normalizeLanguageCode(input: string | undefined): string {
  const code = String(input || 'en').trim().toLowerCase().split('-')[0];
  if (ONBOARDING_LANG_CODES.has(code)) return code;
  return 'en';
}

function resolveTranslatorTarget(languageCode: string): string {
  return LANG_FALLBACK_MAP[languageCode] || languageCode;
}

async function translateBatchOnce(texts: string[], targetLang: string): Promise<string[] | null> {
  if (!texts.length) return [];
  if (!geminiConfig.translator.key) return null;

  const body = texts.map((text) => ({ Text: text }));
  const url =
    `${geminiConfig.translator.endpoint}/translate` +
    `?api-version=3.0&from=en&to=${targetLang}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': geminiConfig.translator.key,
        'Ocp-Apim-Subscription-Region': geminiConfig.translator.region,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;
    const payload = await response.json() as Array<{ translations?: Array<{ text?: string }> }>;

    return payload.map((row, idx) => row?.translations?.[0]?.text || texts[idx]);
  } catch {
    return null;
  }
}

async function translateTextsForLanguage(texts: string[], languageCode: string): Promise<string[]> {
  if (!texts.length || languageCode === 'en') return texts;

  const results = [...texts];
  const missingIndices: number[] = [];
  const missingTexts: string[] = [];

  texts.forEach((text, idx) => {
    const cacheKey = `${languageCode}::${text}`;
    if (precreatedTranslationCache.has(cacheKey)) {
      results[idx] = precreatedTranslationCache.get(cacheKey) as string;
      return;
    }
    missingIndices.push(idx);
    missingTexts.push(text);
  });

  if (!missingTexts.length) return results;

  const primaryTarget = resolveTranslatorTarget(languageCode);
  let translated = await translateBatchOnce(missingTexts, primaryTarget);

  if (!translated && primaryTarget !== 'hi') {
    translated = await translateBatchOnce(missingTexts, 'hi');
  }

  if (!translated) {
    return results;
  }

  translated.forEach((text, idx) => {
    const originalIdx = missingIndices[idx];
    const originalText = missingTexts[idx];
    results[originalIdx] = text;
    precreatedTranslationCache.set(`${languageCode}::${originalText}`, text);
  });

  return results;
}

async function localizePrecreatedForm(
  form: PrecreatedForm,
  languageRaw: string | undefined,
): Promise<{ form: PrecreatedForm; sourceLanguageRequested: string; sourceLanguageUsed: string }> {
  const sourceLanguageRequested = normalizeLanguageCode(languageRaw);
  const sourceLanguageUsed = resolveTranslatorTarget(sourceLanguageRequested);
  if (sourceLanguageRequested === 'en') {
    return { form, sourceLanguageRequested, sourceLanguageUsed: 'en' };
  }

  const labels = form.fields.map((field) => field.label);
  const sections = form.fields.map((field) => field.section || '');
  const helps = form.fields.map((field) => field.helpText || '');
  const options = form.fields.flatMap((field) => field.options || []);
  const stringsToTranslate = [
    form.title,
    form.subtitle || '',
    form.ministry || '',
    ...labels,
    ...sections,
    ...helps,
    ...options,
    ...form.documents,
    ...(form.eligibility || []),
    ...(form.benefits || []),
  ];
  const translated = await translateTextsForLanguage(stringsToTranslate, sourceLanguageRequested);

  let pointer = 0;
  const translatedTitle = translated[pointer++] || form.title;
  const translatedSubtitle = form.subtitle ? translated[pointer++] || form.subtitle : undefined;
  const translatedMinistry = form.ministry ? translated[pointer++] || form.ministry : undefined;
  const translatedLabels = translated.slice(pointer, pointer + labels.length);
  pointer += labels.length;
  const translatedSections = translated.slice(pointer, pointer + sections.length);
  pointer += sections.length;
  const translatedHelps = translated.slice(pointer, pointer + helps.length);
  pointer += helps.length;
  const translatedOptions = translated.slice(pointer, pointer + options.length);
  pointer += options.length;
  const translatedDocuments = translated.slice(pointer, pointer + form.documents.length);
  pointer += form.documents.length;
  const translatedEligibility = translated.slice(pointer, pointer + (form.eligibility || []).length);
  pointer += (form.eligibility || []).length;
  const translatedBenefits = translated.slice(pointer, pointer + (form.benefits || []).length);

  let optionPointer = 0;

  return {
    form: {
      ...form,
      title: translatedTitle,
      subtitle: translatedSubtitle,
      ministry: translatedMinistry,
      fields: form.fields.map((field, idx) => ({
        ...field,
        label: translatedLabels[idx] || field.label,
        section: field.section ? (translatedSections[idx] || field.section) : undefined,
        helpText: field.helpText ? (translatedHelps[idx] || field.helpText) : undefined,
        options: field.options
          ? field.options.map((option) => translatedOptions[optionPointer++] || option)
          : undefined,
      })),
      documents: form.documents.map((doc, idx) => translatedDocuments[idx] || doc),
      eligibility: form.eligibility?.map((item, idx) => translatedEligibility[idx] || item),
      benefits: form.benefits?.map((item, idx) => translatedBenefits[idx] || item),
    },
    sourceLanguageRequested,
    sourceLanguageUsed,
  };
}

const PRECREATED_SCHEME_FORMS: Record<string, PrecreatedForm> = {
  pm_kisan: {
    title: '📝 PM-KISAN SAMMAN NIDHI YOJANA',
    subtitle: 'New Farmer Registration Form (Mock)',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    type: 'scheme',
    fields: [
      { name: 'name', label: 'Farmer Name (as per Aadhaar)', section: '🔹 SECTION A: BASIC DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'fatherOrHusbandName', label: 'Father’s / Husband’s Name', section: '🔹 SECTION A: BASIC DETAILS', inputType: 'text', required: true },
      { name: 'gender', label: 'Gender', section: '🔹 SECTION A: BASIC DETAILS', inputType: 'radio', options: ['Male', 'Female', 'Other'], required: true },
      { name: 'dobOrAge', label: 'Date of Birth / Age', section: '🔹 SECTION A: BASIC DETAILS', inputType: 'date', required: true },
      { name: 'category', label: 'Category', section: '🔹 SECTION A: BASIC DETAILS', inputType: 'radio', options: ['General', 'SC', 'ST', 'OBC'], required: true },
      { name: 'mobileNumber', label: 'Mobile Number (Aadhaar-linked)', section: '🔹 SECTION A: BASIC DETAILS', inputType: 'text', required: true },

      { name: 'state', label: 'State', section: '🔹 SECTION B: ADDRESS DETAILS', inputType: 'text', required: true, autofillSource: 'DigiLocker' },
      { name: 'district', label: 'District', section: '🔹 SECTION B: ADDRESS DETAILS', inputType: 'text', required: true },
      { name: 'subDistrictOrBlock', label: 'Sub-District / Block', section: '🔹 SECTION B: ADDRESS DETAILS', inputType: 'text', required: true },
      { name: 'village', label: 'Village', section: '🔹 SECTION B: ADDRESS DETAILS', inputType: 'text', required: true },
      { name: 'pinCode', label: 'PIN Code', section: '🔹 SECTION B: ADDRESS DETAILS', inputType: 'text', required: true },
      { name: 'fullAddress', label: 'Full Address', section: '🔹 SECTION B: ADDRESS DETAILS', inputType: 'textarea', required: true },

      { name: 'aadhaarNumber', label: 'Aadhaar Number', section: '🔹 SECTION C: AADHAAR DETAILS', inputType: 'text', required: true },
      { name: 'aadhaarConsent', label: 'Consent for Aadhaar Authentication', section: '🔹 SECTION C: AADHAAR DETAILS', inputType: 'radio', options: ['Yes', 'No'], required: true, helpText: 'Aadhaar is mandatory for identity verification and eKYC.' },
      { name: 'ekycStatus', label: 'eKYC Status', section: '🔹 SECTION C: AADHAAR DETAILS', inputType: 'radio', options: ['Completed', 'Pending'], required: true },

      { name: 'bankName', label: 'Bank Name', section: '🔹 SECTION D: BANK DETAILS (FOR DBT)', inputType: 'text', required: true },
      { name: 'branchName', label: 'Branch Name', section: '🔹 SECTION D: BANK DETAILS (FOR DBT)', inputType: 'text', required: true },
      { name: 'accountNumber', label: 'Account Number', section: '🔹 SECTION D: BANK DETAILS (FOR DBT)', inputType: 'text', required: true },
      { name: 'ifscCode', label: 'IFSC Code', section: '🔹 SECTION D: BANK DETAILS (FOR DBT)', inputType: 'text', required: true },
      { name: 'aadhaarLinkedAccount', label: 'Aadhaar Linked Account', section: '🔹 SECTION D: BANK DETAILS (FOR DBT)', inputType: 'radio', options: ['Yes', 'No'], required: true, helpText: 'Funds are transferred directly via DBT to the farmer’s bank account.' },

      { name: 'landOwnershipType', label: 'Land Ownership Type', section: '🔹 SECTION E: LAND DETAILS', inputType: 'radio', options: ['Owner', 'Joint Owner'], required: true },
      { name: 'totalLandHoldingHectares', label: 'Total Land Holding (in hectares)', section: '🔹 SECTION E: LAND DETAILS', inputType: 'number', required: true },
      { name: 'landRecordType', label: 'Land Record Type', section: '🔹 SECTION E: LAND DETAILS', inputType: 'radio', options: ['Khata', 'Patta', 'Jamabandi', 'Others'], required: true },
      { name: 'landRecordNumber', label: 'Land Record Number', section: '🔹 SECTION E: LAND DETAILS', inputType: 'text', required: true },
      { name: 'landDocumentUpload', label: 'Upload Land Document', section: '🔹 SECTION E: LAND DETAILS', inputType: 'file', required: true, helpText: 'Ownership of cultivable land is mandatory for eligibility.' },

      { name: 'farmerType', label: 'Type of Farmer', section: '🔹 SECTION F: FARMER CATEGORY', inputType: 'radio', options: ['Small', 'Marginal', 'Other'], required: true },
      { name: 'incomeTaxPayer', label: 'Do you pay Income Tax?', section: '🔹 SECTION F: FARMER CATEGORY', inputType: 'radio', options: ['Yes', 'No'], required: true },
      { name: 'governmentEmployee', label: 'Are you a Government Employee?', section: '🔹 SECTION F: FARMER CATEGORY', inputType: 'radio', options: ['Yes', 'No'], required: true, helpText: 'Certain categories like taxpayers or government employees are excluded.' },

      { name: 'declarationStatement', label: 'Declaration (I am a citizen of India; own cultivable land; details are true; no conflicting scheme benefits)', section: '🔹 SECTION G: DECLARATION', inputType: 'textarea', required: true },
      { name: 'signature', label: 'Signature / Thumb Impression', section: '🔹 SECTION G: DECLARATION', inputType: 'text', required: true },
      { name: 'declarationDate', label: 'Date', section: '🔹 SECTION G: DECLARATION', inputType: 'date', required: true },
    ],
    documents: [
      '✔ Mandatory Documents',
      'Aadhaar Card (for identity & eKYC)',
      'Bank Account Details / Passbook',
      'Land Ownership Documents (Khata, Patta, etc.)',
      'Mobile Number (linked with Aadhaar)',
      '✔ Additional Supporting Documents',
      'Proof of Citizenship',
      'Passport Size Photograph',
      'Address Proof (if required)',
    ],
    eligibility: ['Citizen of India', 'Owns cultivable agricultural land', 'Not in excluded category (income-tax payer/government employee)'],
    benefits: ['₹6,000 per year support in three installments through DBT'],
  },
  ayushman_bharat_pmjay: {
    title: '🏥 AYUSHMAN BHARAT (PM-JAY)',
    subtitle: '📝 APPLICATION FORM (Mock)',
    ministry: 'Ministry of Health & Family Welfare',
    type: 'scheme',
    fields: [
      { name: 'name', label: 'Name (as per Aadhaar)', section: '🔹 SECTION A: PERSONAL DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'gender', label: 'Gender', section: '🔹 SECTION A: PERSONAL DETAILS', inputType: 'radio', options: ['M', 'F', 'Other'], required: true },
      { name: 'age', label: 'Age', section: '🔹 SECTION A: PERSONAL DETAILS', inputType: 'number', required: true },
      { name: 'mobileNumber', label: 'Mobile Number', section: '🔹 SECTION A: PERSONAL DETAILS', inputType: 'text', required: true },
      { name: 'familyIdOrRationCard', label: 'Family ID / Ration Card No', section: '🔹 SECTION A: PERSONAL DETAILS', inputType: 'text', required: true },

      { name: 'totalFamilyMembers', label: 'Total Family Members', section: '🔹 SECTION B: FAMILY DETAILS', inputType: 'number', required: true },
      { name: 'headOfFamily', label: 'Head of Family', section: '🔹 SECTION B: FAMILY DETAILS', inputType: 'text', required: true },
      { name: 'category', label: 'Category', section: '🔹 SECTION B: FAMILY DETAILS', inputType: 'radio', options: ['SC', 'ST', 'OBC', 'General'], required: true },

      { name: 'seccIncluded', label: 'Included in SECC 2011 list', section: '🔹 SECTION C: SOCIO-ECONOMIC STATUS', inputType: 'radio', options: ['Yes', 'No'], required: true },
      { name: 'housingType', label: 'Housing Type', section: '🔹 SECTION C: SOCIO-ECONOMIC STATUS', inputType: 'radio', options: ['Kutcha', 'Semi-pucca', 'Pucca'], required: true },
      { name: 'occupation', label: 'Occupation', section: '🔹 SECTION C: SOCIO-ECONOMIC STATUS', inputType: 'text', required: true },

      { name: 'aadhaarNumber', label: 'Aadhaar Number', section: '🔹 SECTION D: IDENTIFICATION', inputType: 'text', required: true },
      { name: 'ekycStatus', label: 'eKYC Status', section: '🔹 SECTION D: IDENTIFICATION', inputType: 'radio', options: ['Completed', 'Pending'], required: true },

      { name: 'signature', label: 'Signature', section: '🔹 SECTION E: DECLARATION', inputType: 'text', required: true },
      { name: 'declarationDate', label: 'Date', section: '🔹 SECTION E: DECLARATION', inputType: 'date', required: true },
    ],
    documents: ['Aadhaar Card', 'Ration Card / Family ID', 'SECC verification proof', 'Mobile number'],
    eligibility: [
      'Based on SECC 2011 data (poor/vulnerable families)',
      'Landless laborers',
      'SC/ST households',
      'Kutcha house families',
    ],
    benefits: ['₹5 lakh health insurance per family/year', 'Cashless treatment in empanelled hospitals'],
  },
  pmay_g: {
    title: '🏠 PM AWAS YOJANA – GRAMIN (PMAY-G)',
    subtitle: '📝 APPLICATION FORM',
    ministry: 'Ministry of Rural Development',
    type: 'scheme',
    fields: [
      { name: 'name', label: 'Applicant Name', section: '🔹 BASIC DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'gender', label: 'Gender', section: '🔹 BASIC DETAILS', inputType: 'text', required: true },
      { name: 'mobileNumber', label: 'Mobile', section: '🔹 BASIC DETAILS', inputType: 'text', required: true },

      { name: 'village', label: 'Village', section: '🔹 ADDRESS', inputType: 'text', required: true },
      { name: 'gramPanchayat', label: 'Gram Panchayat', section: '🔹 ADDRESS', inputType: 'text', required: true },
      { name: 'district', label: 'District', section: '🔹 ADDRESS', inputType: 'text', required: true },

      { name: 'currentHouseType', label: 'Current House Type', section: '🔹 HOUSING STATUS', inputType: 'radio', options: ['Kutcha', 'Homeless'], required: true },
      { name: 'landOwnership', label: 'Land Ownership', section: '🔹 HOUSING STATUS', inputType: 'radio', options: ['Yes', 'No'], required: true },
      { name: 'seccIncluded', label: 'Identified via SECC data', section: '🔹 HOUSING STATUS', inputType: 'radio', options: ['Yes', 'No'], required: true },

      { name: 'accountNumber', label: 'Account Number', section: '🔹 BANK DETAILS', inputType: 'text', required: true },
      { name: 'ifscCode', label: 'IFSC', section: '🔹 BANK DETAILS', inputType: 'text', required: true },

      { name: 'declaration', label: 'Declaration', section: '🔹 DECLARATION', inputType: 'textarea', required: true },
    ],
    documents: ['Aadhaar Card', 'Bank Passbook', 'Land document (if available)', 'MGNREGA Job Card'],
    eligibility: ['Rural poor / homeless', 'Kutcha house owners', 'Identified via SECC data'],
    benefits: ['Financial assistance for pucca house', '₹1.2–1.3 lakh (approx depending on region)'],
  },
  mgnrega: {
    title: '👷 MGNREGA',
    subtitle: '📝 APPLICATION FORM (Job Card Registration)',
    ministry: 'Ministry of Rural Development',
    type: 'scheme',
    fields: [
      { name: 'name', label: 'Name', section: '🔹 DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'age', label: 'Age', section: '🔹 DETAILS', inputType: 'number', required: true },
      { name: 'address', label: 'Address', section: '🔹 DETAILS', inputType: 'textarea', required: true },
      { name: 'familyMembersTable', label: 'FAMILY MEMBERS (Adults willing to work) | Name | Age | Gender | Signature |', section: '🔹 FAMILY MEMBERS (Adults willing to work)', inputType: 'textarea', required: true },
      { name: 'daysRequested', label: 'Days requested', section: '🔹 EMPLOYMENT REQUEST', inputType: 'number', required: true },
      { name: 'declaration', label: 'Declaration', section: '🔹 DECLARATION', inputType: 'textarea', required: true },
    ],
    documents: ['Aadhaar Card', 'Address proof', 'Passport photo'],
    eligibility: ['Rural household', 'Adult (18+) willing to do unskilled work'],
    benefits: ['100 days guaranteed wage employment/year', 'Direct wage payment (DBT)'],
  },
  pm_mudra: {
    title: '💼 PM MUDRA YOJANA',
    subtitle: '📝 LOAN APPLICATION FORM',
    ministry: 'Ministry of Finance',
    type: 'finance',
    fields: [
      { name: 'name', label: 'Name', section: '🔹 APPLICANT DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'businessName', label: 'Business Name', section: '🔹 APPLICANT DETAILS', inputType: 'text', required: true },
      { name: 'mudraType', label: 'Type', section: '🔹 APPLICANT DETAILS', inputType: 'radio', options: ['Shishu', 'Kishor', 'Tarun'], required: true },
      { name: 'natureOfBusiness', label: 'Nature of Business', section: '🔹 BUSINESS DETAILS', inputType: 'text', required: true },
      { name: 'annualIncome', label: 'Annual Income', section: '🔹 BUSINESS DETAILS', inputType: 'number', required: true },
      { name: 'loanAmountRequired', label: 'Loan Amount Required', section: '🔹 LOAN DETAILS', inputType: 'number', required: true },
      { name: 'loanPurpose', label: 'Purpose', section: '🔹 LOAN DETAILS', inputType: 'textarea', required: true },
      { name: 'bankDetails', label: 'Bank Details', section: '🔹 BANK DETAILS', inputType: 'textarea', required: true },
    ],
    documents: ['Aadhaar Card', 'PAN Card', 'Business proof', 'Bank statements'],
    eligibility: ['Non-corporate small businesses', 'Entrepreneurs / MSMEs'],
    benefits: ['Loan up to ₹10 lakh', 'No collateral required'],
  },
  pm_fasal_bima: {
    title: '🌾 PM FASAL BIMA YOJANA',
    subtitle: '📝 APPLICATION FORM',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    type: 'scheme',
    fields: [
      { name: 'name', label: 'Name', section: '🔹 FARMER DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'aadhaarNumber', label: 'Aadhaar', section: '🔹 FARMER DETAILS', inputType: 'text', required: true },
      { name: 'landAreaHectares', label: 'Area (hectares)', section: '🔹 LAND DETAILS', inputType: 'number', required: true },
      { name: 'cropType', label: 'Crop Type', section: '🔹 LAND DETAILS', inputType: 'text', required: true },
      { name: 'season', label: 'Season', section: '🔹 INSURANCE DETAILS', inputType: 'radio', options: ['Kharif', 'Rabi'], required: true },
      { name: 'sumInsured', label: 'Sum insured', section: '🔹 INSURANCE DETAILS', inputType: 'number', required: true },
    ],
    documents: ['Aadhaar Card', 'Land records', 'Bank details', 'Crop sowing proof'],
    eligibility: ['Farmers growing notified crops', 'Landowners or sharecroppers'],
    benefits: ['Crop loss insurance', 'Low premium (2–5%)'],
  },
  pm_ujjwala_2: {
    title: '🔥 PM UJJWALA YOJANA 2.0',
    subtitle: '📝 APPLICATION FORM',
    ministry: 'Ministry of Petroleum & Natural Gas',
    type: 'scheme',
    fields: [
      { name: 'name', label: 'Name (Female)', section: '🔹 APPLICANT DETAILS', inputType: 'text', required: true, autofillSource: 'Aadhaar' },
      { name: 'age', label: 'Age', section: '🔹 APPLICANT DETAILS', inputType: 'number', required: true },
      { name: 'mobileNumber', label: 'Mobile', section: '🔹 APPLICANT DETAILS', inputType: 'text', required: true },
      { name: 'village', label: 'Village', section: '🔹 ADDRESS', inputType: 'text', required: true },
      { name: 'district', label: 'District', section: '🔹 ADDRESS', inputType: 'text', required: true },
      { name: 'bplHousehold', label: 'BPL Household', section: '🔹 ELIGIBILITY CHECK', inputType: 'radio', options: ['Yes', 'No'], required: true },
      { name: 'existingLpgConnection', label: 'Existing LPG connection', section: '🔹 ELIGIBILITY CHECK', inputType: 'radio', options: ['Yes', 'No'], required: true },
      { name: 'aadhaarNumber', label: 'Aadhaar Number', section: '🔹 ID DETAILS', inputType: 'text', required: true },
      { name: 'bankDetails', label: 'Bank details', section: '🔹 ID DETAILS', inputType: 'textarea', required: true },
    ],
    documents: ['Aadhaar Card', 'Address proof', 'BPL certificate', 'Bank details'],
    eligibility: ['Woman (18+) from poor household', 'No existing LPG connection'],
    benefits: ['Free LPG connection', 'Financial support for cylinder & stove'],
  },
};

function getPrecreatedSchemeForm(prompt: string): PrecreatedForm | null {
  const q = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
  const matchers: Array<{ key: keyof typeof PRECREATED_SCHEME_FORMS; re: RegExp }> = [
    { key: 'pm_kisan', re: /\b(pm[\s-]?kisan|kisan samman nidhi)\b/i },
    { key: 'ayushman_bharat_pmjay', re: /\b(ayushman|pm[\s-]?jay|pmjay)\b/i },
    { key: 'pmay_g', re: /\b(pm[\s-]?awas|pmay[\s-]?g|awas yojana|housing)\b/i },
    { key: 'mgnrega', re: /\b(mgnrega|mnrega|nrega|narega|job card)\b/i },
    { key: 'pm_mudra', re: /\b(mudra|shishu|kishor|tarun)\b/i },
    { key: 'pm_fasal_bima', re: /\b(pmfby|pm[\s-]?fasal|fasal bima|crop insurance)\b/i },
    { key: 'pm_ujjwala_2', re: /\b(ujjwala|ujwala|lpg connection|gas subsidy)\b/i },
  ];

  const hit = matchers.find((m) => m.re.test(q));
  return hit ? { ...PRECREATED_SCHEME_FORMS[hit.key], formKey: hit.key } : null;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, agentKey, userProfile } = await req.json();
    const structuredAction = await extractStructuredAction(String(prompt || ''));

    const precreatedForm = getPrecreatedSchemeForm(String(prompt || ''));
    if (precreatedForm) {
      const localizedPrecreated = await localizePrecreatedForm(precreatedForm, userProfile?.language);
      return NextResponse.json({
        success: true,
        form: localizedPrecreated.form,
        structuredAction,
        source: 'precreated',
        sourceLanguageRequested: localizedPrecreated.sourceLanguageRequested,
        sourceLanguageUsed: localizedPrecreated.sourceLanguageUsed,
      });
    }

    let client;
    let modelName;

    if (geminiConfig.openai.apiKey) {
      client = ModelClient(
        geminiConfig.openai.endpoint,
        new AzureKeyCredential(geminiConfig.openai.apiKey)
      );
      modelName = pickDeployment();
    } else if (geminiConfig.githubModels?.token) {
      client = ModelClient(
        geminiConfig.githubModels.endpoint,
        new AzureKeyCredential(geminiConfig.githubModels.token)
      );
      modelName = geminiConfig.githubModels.model || 'openai/gpt-4o-mini';
    } else {
      console.log('[Generate Form] No LLM keys found. Returning mock contextual form.');
      const lowerPrompt = prompt.toLowerCase();
      let type = 'grievance';
      let title = 'General Service Request';
      let ctxFields = [{ name: 'details', label: 'Additional Details' }];

      if (lowerPrompt.includes('loan') || lowerPrompt.includes('kcc') || lowerPrompt.includes('finance')) {
        type = 'finance'; title = 'Loan Application';
        ctxFields = [{ name: 'amount', label: 'Requested Amount' }, { name: 'purpose', label: 'Loan Purpose' }];
      } else if (lowerPrompt.includes('hospital') || lowerPrompt.includes('health') || lowerPrompt.includes('doctor')) {
        type = 'health'; title = 'Medical Assistance';
        ctxFields = [{ name: 'symptoms', label: 'Symptoms / Issue' }, { name: 'hospital', label: 'Preferred Clinic' }];
      } else if (lowerPrompt.includes('scheme') || lowerPrompt.includes('yojana') || lowerPrompt.includes('kisan')) {
        type = 'scheme'; title = 'Scheme Application';
        ctxFields = [{ name: 'income', label: 'Annual Household Income' }, { name: 'category', label: 'Beneficiary Category' }];
      } else if (lowerPrompt.includes('fir') || lowerPrompt.includes('police') || lowerPrompt.includes('scam')) {
        type = 'legal'; title = 'Legal Incident Report';
        ctxFields = [{ name: 'incidentTime', label: 'Time of Incident' }, { name: 'suspect', label: 'Suspect Details (if any)' }];
      }

      return NextResponse.json({
        success: true,
        form: {
          title,
          type,
          fields: [
            { name: 'name', label: 'Full Name', autofillSource: 'Aadhaar' },
            { name: 'location', label: 'Location / DIGIPIN', autofillSource: 'DigiLocker' },
            ...ctxFields
          ],
          documents: ['Aadhaar Card', 'Recent Photograph', 'Proof of Address']
        },
        structuredAction,
      });
    }

    const userLang = userProfile?.language || 'hi';
    const systemPrompt = `You are an AI assistant specialized in generating structured JSON forms based on user intents. 
The user is talking to the agent: ${agentKey || 'assistant'}.

Here is the secure Citizen Profile of the user requesting help. Use this to determine if you can accurately "auto-fill" fields you generate.
USER PROFILE:
${userProfile ? JSON.stringify(userProfile, null, 2) : 'No profile provided.'}

Your task: Extract the exact custom fields required to fulfill the user's request, and guess the likely required documents.
Generate a JSON object containing:
1. "title": A short, clear title for the form (e.g., "Mudra Loan Application"). MUST BE IN THE LANGUAGE: ${userLang}.
2. "type": The core category type. Must be one of: ["grievance", "scheme", "health", "legal", "finance"]. Keep this in English.
3. "fields": An array of objects, each representing a required data input field. Every field MUST be highly relevant to fulfilling the user's specific context. Include:
   - "name": CamelCase key for the data field. Keep this in English.
   - "label": A user-facing short readable label (e.g., "Type of Crop", "Name of Hospital", "Details of Incident"). MUST BE TRANSLATED TO: ${userLang}.
   - "autofillSource": (OPTIONAL). If the user profile contains data that directly answers this field, set this to "Aadhaar" or "DigiLocker".
4. "documents": An array of strings representing official documents the user will likely need to provide for this specific request. MUST BE TRANSLATED TO: ${userLang}.

Always include "name" (Full Name) and "location" (Location / DIGIPIN) as standard starting fields. Translate these labels into ${userLang}. Then add 2-5 highly contextual fields.

OUTPUT STRICTLY VALID JSON. DO NOT WRAP IN BACKTICKS.`;

    const response = await client.path('/chat/completions').post({
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please generate a structured form data extraction JSON for the following request: "${prompt}"` }
        ],
        model: modelName,
        temperature: 0.2, // Low temp for strictly structured output
        response_format: { type: "json_object" }
      }
    });

    if (isUnexpected(response)) {
      console.error('[Generate Form] Unexpected Azure response:', response.body);
      return NextResponse.json({ error: 'Failed to generate form LLM response' }, { status: 500 });
    }

    const content = response.body.choices?.[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[Generate Form] Failed to parse JSON from LLM:', content);
      return NextResponse.json({ error: 'Failed to parse JSON' }, { status: 500 });
    }

    return NextResponse.json({ success: true, form: parsed, structuredAction });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Generate Form] Exception:', message);
    if (message.includes('NER service unavailable')) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
