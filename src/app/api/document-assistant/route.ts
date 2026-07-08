import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

// Maps short lang codes to full language names for the LLM prompt
const LANGUAGE_NAMES: Record<string, string> = {
  'hi': 'Hindi (हिंदी)', 'en': 'English', 'bn': 'Bengali (বাংলা)', 
  'te': 'Telugu (తెలుగు)', 'mr': 'Marathi (मराठी)', 'ta': 'Tamil (தமிழ்)',
  'gu': 'Gujarati (ગુજરાતી)', 'kn': 'Kannada (ಕನ್ನಡ)', 'ml': 'Malayalam (മലയാളം)', 
  'pa': 'Punjabi (ਪੰਜਾਬੀ)', 'or': 'Odia (ଓଡ଼ିଆ)'
};

type ExtractionFields = {
  fullName: string;
  address: string;
  issueDate: string;
  referenceNumber: string;
  documentType: string;
  issueSummary: string;
};

type Classification = {
  requestType: 'grievance' | 'scheme' | 'health' | 'legal' | 'finance';
  suggestedDepartment: string;
  suggestedService: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  rationale: string;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function pickLabeledField(lines: string[], labels: string[]): string {
  for (const line of lines) {
    for (const label of labels) {
      const regex = new RegExp(`^${label}\\s*[:\\-]\\s*(.+)$`, 'i');
      const match = line.match(regex);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
}

function detectDocumentType(text: string): string {
  const value = text.toLowerCase();
  if (/hospital|diagnos|medical|prescription|lab report|discharge|ayushman|pmjay/.test(value)) return 'Health Document';
  if (/fir|police|court|legal|notice|summon|affidavit|stamp/.test(value)) return 'Legal/Police Document';
  if (/ration|pds|aadhaar|aadhar|voter|pan|passport|certificate/.test(value)) return 'Identity/Citizen Document';
  if (/loan|bank|passbook|account|ifsc|upi|statement|financial/.test(value)) return 'Financial Document';
  if (/scheme|yojana|application|beneficiary|subsidy|pension|kisan|mgnrega/.test(value)) return 'Scheme/Application Document';
  if (/electricity|water|property|tax|municipal|ward|sewage|road|drain/.test(value)) return 'Civic Service Document';
  return 'General Government Document';
}

function inferIssueSummary(lines: string[], text: string): string {
  const likely = lines.find(
    (line) =>
      line.length > 24 &&
      !/^(name|address|date|dob|mobile|phone|ref|reference|id|aadhaar|aadhar)\s*[:\-]/i.test(line)
  );
  if (likely) return likely.slice(0, 220);
  return normalizeText(text).slice(0, 220);
}

function extractDate(text: string): string {
  const match = text.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/);
  return match?.[1] || '';
}

function extractReference(text: string): string {
  const labeled = text.match(/(?:ref(?:erence)?\s*(?:no|number)?|application\s*id|case\s*id|ticket\s*id)\s*[:\-]?\s*([A-Z0-9\/-]{4,})/i);
  if (labeled?.[1]) return labeled[1];
  const generic = text.match(/\b[A-Z]{2,6}[\/-]\d{2,}(?:[\/-][A-Z0-9]{2,})?\b/);
  return generic?.[0] || '';
}

function extractStructuredFields(extractedText: string): ExtractionFields {
  const lines = toLines(extractedText);
  const text = normalizeText(extractedText);

  const fullName =
    pickLabeledField(lines, ['name', 'full\\s*name', 'applicant\\s*name']) ||
    text.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/)?.[1] ||
    '';

  const address =
    pickLabeledField(lines, ['address', 'residential\\s*address', 'communication\\s*address']) || '';

  const issueDate = extractDate(extractedText);
  const referenceNumber = extractReference(extractedText);
  const documentType = detectDocumentType(extractedText);
  const issueSummary = inferIssueSummary(lines, extractedText);

  return {
    fullName: fullName.slice(0, 120),
    address: address.slice(0, 240),
    issueDate,
    referenceNumber,
    documentType,
    issueSummary,
  };
}

function classifyRequest(text: string, documentType: string): Classification {
  const source = `${documentType} ${text}`.toLowerCase();

  const hasEmergency = /emergency|urgent|critical|ambulance|severe|not responsive|bleeding|accident/.test(source);
  const hasHealth = /health|hospital|medical|prescription|pmjay|ayushman|abha|abdm/.test(source);
  const hasLegal = /legal|court|fir|police|complaint|fraud|cyber|arrest|notice/.test(source);
  const hasScheme = /scheme|yojana|subsidy|beneficiary|pension|kisan|mgnrega|pmay|ration/.test(source);
  const hasFinance = /bank|loan|account|upi|payment|debit|credit|statement/.test(source);

  if (hasHealth) {
    return {
      requestType: 'health',
      suggestedDepartment: 'Health Department',
      suggestedService: hasEmergency ? 'Emergency Medical Response' : 'Hospital/Health Assistance',
      priority: hasEmergency ? 'critical' : 'high',
      rationale: hasEmergency ? 'Emergency and health indicators detected in document text.' : 'Health/hospital related terminology detected.',
    };
  }

  if (hasLegal) {
    return {
      requestType: 'legal',
      suggestedDepartment: 'Police & Legal Services',
      suggestedService: 'Complaint/FIR/Legal Aid Support',
      priority: /fraud|cyber|threat|violence/.test(source) ? 'high' : 'medium',
      rationale: 'Legal, police, or dispute-related keywords detected.',
    };
  }

  if (hasScheme) {
    return {
      requestType: 'scheme',
      suggestedDepartment: 'Welfare & Scheme Office',
      suggestedService: 'Scheme Eligibility / Application Support',
      priority: 'medium',
      rationale: 'Government scheme/application signals detected.',
    };
  }

  if (hasFinance) {
    return {
      requestType: 'finance',
      suggestedDepartment: 'Banking & Financial Services',
      suggestedService: 'Loan/Account/Payment Issue Support',
      priority: /fraud|unauthori[sz]ed|chargeback/.test(source) ? 'high' : 'medium',
      rationale: 'Financial/banking terms detected in document.',
    };
  }

  return {
    requestType: 'grievance',
    suggestedDepartment: 'Municipal/Civic Department',
    suggestedService: 'Citizen Grievance Redressal',
    priority: 'low',
    rationale: 'Defaulted to civic grievance flow due to generic administrative content.',
  };
}

async function extractTextFromImage(image: File): Promise<string> {
  if (!geminiConfig.vision.key) {
    throw new Error('Azure Vision API key not configured');
  }

  const imageBytes = await image.arrayBuffer();
  const visionResponse = await fetch(
    `${geminiConfig.vision.endpoint}/computervision/imageanalysis:analyze?features=read&api-version=2024-02-01`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': geminiConfig.vision.key,
      },
      body: imageBytes,
    }
  );

  if (!visionResponse.ok) {
    const errText = await visionResponse.text();
    console.error('Vision API error:', errText);
    throw new Error('Failed to extract text from image document.');
  }

  const result = await visionResponse.json();
  const lines: string[] = [];
  if (result.readResult?.blocks) {
    for (const block of result.readResult.blocks) {
      if (!Array.isArray(block.lines)) continue;
      for (const line of block.lines) {
        if (line?.text) lines.push(String(line.text));
      }
    }
  }

  return lines.join('\n');
}

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: Buffer.from(arrayBuffer) });
    try {
      const result = await parser.getText();
      return String(result?.text || '');
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.error('PDF Parse detailed error:', err);
    throw new Error('Failed to parse PDF document. It may be encrypted or corrupted.');
  }
}

async function summarizeDocument(
  extractedText: string,
  langName: string,
  extraction: ExtractionFields,
  classification: Classification
): Promise<string> {
  const token = process.env.GITHUB_TOKEN_PHI || process.env.GITHUB_TOKEN;
  if (!token) {
    return [
      `Document Type: ${extraction.documentType}`,
      `Main Issue: ${extraction.issueSummary || 'No clear issue statement found.'}`,
      `Suggested Department: ${classification.suggestedDepartment}`,
      `Suggested Service: ${classification.suggestedService}`,
      `Priority: ${classification.priority.toUpperCase()}`,
    ].join('\n');
  }

  const prompt = `You are a citizen-help assistant.
Document text:\n"""${extractedText.slice(0, 3200)}"""

Detected facts:
- Document type: ${extraction.documentType}
- Main issue: ${extraction.issueSummary || 'unknown'}
- Suggested department: ${classification.suggestedDepartment}
- Suggested service: ${classification.suggestedService}
- Priority: ${classification.priority}

Task:
Create a very simple explanation in ${langName} with exactly these 3 sections:
1) What is this document?
2) Main Message
3) Action Required
Keep it short, practical, and easy for first-time citizens.`;

  try {
    const client = ModelClient('https://models.github.ai/inference', new AzureKeyCredential(token));
    const inferenceRes = await client.path('/chat/completions').post({
      body: {
        messages: [{ role: 'user', content: prompt }],
        model: 'openai/gpt-4o-mini',
        max_tokens: 320,
        temperature: 0.2,
      },
    });

    if (isUnexpected(inferenceRes)) {
      return `Document scanned. Suggested department: ${classification.suggestedDepartment}.`;
    }

    return (
      inferenceRes.body.choices?.[0]?.message?.content?.trim() ||
      `Document scanned. Suggested department: ${classification.suggestedDepartment}.`
    );
  } catch {
    return `Document scanned. Suggested department: ${classification.suggestedDepartment}.`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploaded = (formData.get('file') as File | null) || (formData.get('image') as File | null);
    const lang = (formData.get('lang') as string) || 'hi';
    const langName = LANGUAGE_NAMES[lang.split('-')[0]] || LANGUAGE_NAMES['hi'];

    if (!uploaded) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const mime = String(uploaded.type || '').toLowerCase();
    const isPdf = mime === 'application/pdf' || uploaded.name.toLowerCase().endsWith('.pdf');

    let extractedText = '';
    if (isPdf) {
      extractedText = await extractTextFromPdf(uploaded);
    } else {
      extractedText = await extractTextFromImage(uploaded);
    }

    if (!extractedText.trim() || extractedText.length < 5) {
      return NextResponse.json({ 
        summary: 'No readable text was found. Please upload a clearer image or a searchable PDF.',
        extractedText: '' 
      });
    }

    const extraction = extractStructuredFields(extractedText);
    const classification = classifyRequest(extractedText.slice(0, 3000), extraction.documentType);
    const summary = await summarizeDocument(extractedText, langName, extraction, classification);

    const prefill = {
      fullName: extraction.fullName,
      address: extraction.address,
      issueDate: extraction.issueDate,
      referenceNumber: extraction.referenceNumber,
      category: classification.requestType,
      priority: classification.priority,
      suggestedDepartment: classification.suggestedDepartment,
      suggestedService: classification.suggestedService,
      description: [
        extraction.issueSummary,
        extraction.documentType ? `Document Type: ${extraction.documentType}` : '',
        extraction.referenceNumber ? `Reference: ${extraction.referenceNumber}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };

    return NextResponse.json({ 
      summary, 
      extractedText: extractedText.substring(0, 2000),
      sourceType: isPdf ? 'pdf' : 'image',
      extraction,
      classification,
      prefill,
    });

  } catch (error: unknown) {
    console.error('Document Assistant Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error processing document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
