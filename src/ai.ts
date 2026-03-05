import { GoogleGenAI } from '@google/genai';

export async function generateEraSummary(
  eraNumber: number,
  playerAction: string,
  startStats: Record<string, number>,
  endStats: Record<string, number>
): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return "The era passed, but the records were lost to time (Missing API Key).";
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an ecological simulation narrator, like David Attenborough.
Era: ${eraNumber}
Player's Divine Action: ${playerAction}
Starting Population: ${JSON.stringify(startStats)}
Ending Population: ${JSON.stringify(endStats)}

Write a very brief, 1-paragraph summary (max 3 sentences) of how the ecosystem adapted during this era. Focus on the consequences of the player's action and the population changes. Keep it flavorful and dramatic. Do not use markdown formatting like bold or italics, just plain text.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "The era passed in silence.";
  } catch (e) {
    console.error(e);
    return "The era passed, but the records were lost to time (API Error).";
  }
}
