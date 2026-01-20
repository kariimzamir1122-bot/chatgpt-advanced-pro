
import { GoogleGenAI } from "@google/genai";
import { Message, Tone, Format } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async generateResponse(
    messages: Message[], 
    systemPrompt: string, 
    options: { tone?: Tone, format?: Format, image?: string } = {}
  ): Promise<string> {
    const { tone, format, image } = options;
    
    // Build context-aware system instruction
    let contextInstruction = systemPrompt;
    if (tone) contextInstruction += `\n- TONE: Please respond in a ${tone.toLowerCase()} manner.`;
    if (format) contextInstruction += `\n- FORMAT: Present your answer specifically as a ${format.toLowerCase()}.`;
    
    // If it's a specific format like Table, remind to use Markdown tables
    if (format === Format.Table) {
        contextInstruction += ` Use Markdown tables with clear headers.`;
    }

    const model = image ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
    
    // Map conversation history
    const contents: any[] = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    // If there's an image, attach it to the LAST user message (the current query)
    if (image && contents.length > 0) {
      const lastUserIndex = contents.map(c => c.role).lastIndexOf('user');
      if (lastUserIndex !== -1) {
        contents[lastUserIndex].parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: image.includes('base64,') ? image.split(',')[1] : image
          }
        });
      }
    }

    try {
      // Use a new instance to ensure latest key is used if it changes
      const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await currentAi.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: contextInstruction,
          temperature: 0.8,
          topP: 0.95,
          topK: 40
        }
      });

      return response.text || "I'm sorry, I'm having trouble processing that right now. Could you try again?";
    } catch (error: any) {
      console.error("Gemini Error:", error);
      if (error.message?.includes("API_KEY_INVALID")) {
        return "ERROR: Invalid API Key. Please check your configuration.";
      }
      return "An unexpected error occurred. Please check your connection and try again.";
    }
  }
}

export const gemini = new GeminiService();
