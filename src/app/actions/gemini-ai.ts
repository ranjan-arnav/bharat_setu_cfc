'use server';
import { GoogleGenAI } from '@google/genai';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';


export async function translateText(text: string, toLang: string) {
  const genai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const prompt = `Translate the following text to ${toLang}. Output ONLY the translated text, with no extra explanation or quotes.\n\nText: ${text}`;
  
  try {
    const response = await genai.models.generateContent({
      model: geminiConfig.model,
      contents: prompt,
    });
    return response.text || text;
  } catch (err) {
    console.error("Gemini Translation Error:", err);
    return text;
  }
}



export async function generateAudioSummary(text: string, langName: string): Promise<string> {
  const genai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const prompt = `You are a helpful assistant. 
Summarize the following document explanation into about 50 words in ${langName}. 
The summary should be concise, clear, and easy to understand when spoken.
Explanation:
${text}`;

  try {
    const response = await genai.models.generateContent({
      model: geminiConfig.model,
      contents: prompt,
    });
    return response.text?.trim() || text.slice(0, 200);
  } catch (err) {
    console.error('Audio summarization failed:', err);
    return text.slice(0, 200);
  }
}
