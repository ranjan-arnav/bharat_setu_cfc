import { GoogleGenAI } from '@google/genai';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

export class AzureKeyCredential {
  constructor(public key: string) {}
}

export function isUnexpected(res: any) {
  return res.status >= 400 || !!res.body?.error;
}

export default function ModelClient(endpoint: string, credential: AzureKeyCredential) {
  // Use Gemini SDK under the hood, ignoring the endpoint and credential (using central config)
  const genai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  
  return {
    path: (path: string) => {
      return {
        post: async (options: any) => {
          try {
            const body = options.body;
            const messages = body.messages || [];
            
            // Convert Azure/OpenAI messages to Gemini contents
            let systemInstruction = undefined;
            let contents = [];
            
            for (const msg of messages) {
              if (msg.role === 'system') {
                systemInstruction = msg.content;
              } else {
                contents.push({
                  role: msg.role === 'assistant' ? 'model' : 'user',
                  parts: [{ text: msg.content }]
                });
              }
            }

            // Determine the model
            // If they asked for gpt-4o, use pro, else flash
            const isPro = body.model?.includes('gpt-4o') && !body.model?.includes('mini');
            const modelToUse = isPro ? geminiConfig.proModel : geminiConfig.model;
            
            const req: any = {
              model: modelToUse,
              contents: contents,
              config: {
                temperature: body.temperature ?? 0.7,
              }
            };

            if (systemInstruction) {
              req.config.systemInstruction = systemInstruction;
            }
            if (body.response_format?.type === 'json_object') {
               req.config.responseMimeType = 'application/json';
            }

            const response = await genai.models.generateContent(req);
            
            return {
              status: '200',
              body: {
                choices: [
                  {
                    message: {
                      content: response.text
                    }
                  }
                ]
              }
            };
          } catch (e: any) {
            console.error("Gemini Adapter Error:", e);
            return {
              status: '500',
              body: { error: { message: e.message } }
            };
          }
        }
      }
    }
  };
}
