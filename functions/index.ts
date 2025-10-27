/**
 * Firebase Cloud Functions backend for NameScore.
 *
 * These functions securely call the Gemini API on behalf of the frontend application.
 */

// FIX: Changed from require to ES module imports.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI, Type } from "@google/genai";

// Numerology calculation logic (moved from the frontend)
// This ensures calculations are consistent and performed on the server.
const letterValues: Record<string, number> = {
  'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8, 'I': 9,
  'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'O': 6, 'P': 7, 'Q': 8, 'R': 9,
  'S': 1, 'T': 2, 'U': 3, 'V': 4, 'W': 5, 'X': 6, 'Y': 7, 'Z': 8,
};
const vowels = new Set(['A', 'E', 'I', 'O', 'U']);
const reduceNumber = (num: number): number => {
  if ([11, 22, 33].includes(num)) return num;
  if (num < 10) return num;
  let sum = 0;
  const s = num.toString();
  for (let i = 0; i < s.length; i++) sum += parseInt(s[i], 10);
  return reduceNumber(sum);
};
const calculateNameValue = (name: string): number => name.toUpperCase().split('').reduce((acc, char) => acc + (letterValues[char] || 0), 0);
const numberToScoreMapping: Record<number, number> = {
  1: 22, 2: 20, 3: 21, 4: 18, 5: 23, 6: 24, 7: 19, 8: 17, 9: 21, 11: 25, 22: 25, 33: 25,
};
const calculateScores = (name: string, birthdate: string) => {
    const cleanedName = name.toUpperCase().replace(/[^A-Z]/g, "");
    const destinyNumber = reduceNumber(calculateNameValue(cleanedName));
    const soulUrgeNumber = reduceNumber(calculateNameValue(cleanedName.split("").filter((char) => vowels.has(char)).join("")));
    const personalityNumber = reduceNumber(calculateNameValue(cleanedName.split("").filter((char) => !vowels.has(char)).join("")));
    let lifePathNumber = 0;
    if (birthdate) {
        const digits = birthdate.replace(/\D/g, "");
        if (digits.length >= 6) {
            const birthdateValue = digits.split("").reduce((sum, digit) => sum + parseInt(digit, 10), 0);
            lifePathNumber = reduceNumber(birthdateValue);
        }
    }
    const breakdown = {
        life_path: lifePathNumber > 0 ? (numberToScoreMapping[lifePathNumber] || 15) : 0,
        destiny: numberToScoreMapping[destinyNumber] || 15,
        soul_urge: numberToScoreMapping[soulUrgeNumber] || 15,
        personality: numberToScoreMapping[personalityNumber] || 15,
    };
    const totalScore = Math.round(breakdown.life_path + breakdown.destiny + breakdown.soul_urge + breakdown.personality);
    const coreNumbers = { lifePathNumber, destinyNumber, soulUrgeNumber, personalityNumber };
    return { score: Math.min(100, totalScore), breakdown, coreNumbers };
};

const getCompatibilityScore = (num1: number, num2: number): number => {
    if (num1 === 0 || num2 === 0) return 0.5;
    const diff = Math.abs(num1 - num2);
    if (diff === 0) return 1.0;
    if ([11, 22, 33].includes(num1) || [11, 22, 33].includes(num2)) return 0.85;
    if (diff <= 2) return 0.8;
    if (diff <= 4) return 0.6;
    return 0.4;
};

const calculateCompatibility = (coreNumbers1: any, coreNumbers2: any) => {
    const lifePathHarmony = getCompatibilityScore(coreNumbers1.lifePathNumber, coreNumbers2.lifePathNumber) * 40;
    const destinyHarmony = getCompatibilityScore(coreNumbers1.destinyNumber, coreNumbers2.destinyNumber) * 30;
    const soulUrgeHarmony = getCompatibilityScore(coreNumbers1.soulUrgeNumber, coreNumbers2.soulUrgeNumber) * 20;
    const personalityHarmony = getCompatibilityScore(coreNumbers1.personalityNumber, coreNumbers2.personalityNumber) * 10;
    const totalScore = Math.round(lifePathHarmony + destinyHarmony + soulUrgeHarmony + personalityHarmony);
    return Math.min(100, totalScore);
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

function safeJsonParse(jsonString: string) {
    try {
        const markdownMatch = jsonString.match(/```(json)?\s*([\s\S]+?)\s*```/);
        if (markdownMatch && markdownMatch[2]) {
            return JSON.parse(markdownMatch[2]);
        }
        return JSON.parse(jsonString);
    } catch (e) {
        logger.error("Failed to parse JSON from Gemini response:", jsonString, e);
        return null;
    }
}

// ---- Cloud Function for Name Analysis ----
export const analyzeName = onCall(async (request) => {
    logger.info("analyzeName function triggered");

    if (!request.data) {
        throw new HttpsError('invalid-argument', 'The function must be called with valid data.');
    }
    const { name, mode, birthdate, goal } = request.data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'The function must be called with a non-empty "name" argument.');
    }

    // 1. Calculate base numerological data
    const { score: baseScore, breakdown, coreNumbers } = calculateScores(name, birthdate);

    // 2. Define the new, more powerful AI prompt and schema for holistic analysis
    const systemInstruction = `You are NameScore, a sophisticated AI blending ancient numerology with modern linguistic and phonetic analysis. Your task is to provide a holistic name evaluation.
    
    You will be given a base score calculated from pure numerology. Your job is to refine this score into a final 'holistic_score'. This adjustment should be based on factors like:
    - The name's phonetic appeal (is it pleasant to say?).
    - Memorability and distinctiveness.
    - How well it aligns with the user's stated goal (e.g., a name for 'Career Growth' should sound strong and professional).
    - Modern branding considerations (for brand names).
    
    RULES:
    1. The final 'holistic_score' MUST NOT deviate more than 7 points (up or down) from the 'baseScore'.
    2. Provide a 'holistic_rationale' explaining EXACTLY why you adjusted the score (or why you kept it the same).
    3. The 'short_rationale' should summarize the overall feeling of the final 'holistic_score'.
    4. Provide 'positive_traits' and 'challenges' based on the complete analysis (numerology + linguistics).
    5. ALWAYS RETURN a single, valid JSON object that adheres to the schema.`;
    
    const prompt = `Perform a holistic analysis for the following user data:
- Name: ${name}
- Intent: ${mode}
- Birthdate: ${birthdate}
- Goal: ${goal || 'General Insight'}
- Base Numerology Score: ${baseScore}
- Base Numerology Breakdown: ${JSON.stringify(breakdown)}
- Base Core Numbers: ${JSON.stringify(coreNumbers)}`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            holistic_score: { type: Type.INTEGER, description: "The final, adjusted score between 1 and 100." },
            holistic_rationale: { type: Type.STRING, description: "Brief reason for adjusting the score from the base numerology score." },
            short_rationale: { type: Type.STRING, description: "A concise summary for the final holistic score." },
            positive_traits: { type: Type.ARRAY, items: { type: Type.STRING } },
            challenges: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["holistic_score", "holistic_rationale", "short_rationale", "positive_traits", "challenges"]
    };

    // 3. Make the API call for the main analysis
    let holisticResult;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro", // Using a more powerful model for this complex task
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        const parsed = safeJsonParse(response.text);
        if (!parsed) {
            throw new Error("Failed to parse holistic analysis response.");
        }
        holisticResult = parsed;
        // Clamp the score to be safe
        holisticResult.holistic_score = Math.max(1, Math.min(100, holisticResult.holistic_score));

    } catch (error) {
        logger.error("Holistic analysis failed:", error);
        throw new HttpsError('internal', 'The AI failed to generate a holistic analysis. Please try again.');
    }

    // 4. Generate name suggestions based on the new holistic score
    let suggestions = [];
    try {
        suggestions = await generateNameSuggestions(name, holisticResult.holistic_score, coreNumbers, goal);
    } catch (error) {
        logger.error("Name suggestions failed after holistic analysis:", error);
    }
    
    // 5. Combine and return the results
    return {
        score: holisticResult.holistic_score,
        breakdown,
        coreNumbers,
        short_rationale: holisticResult.short_rationale,
        holistic_rationale: holisticResult.holistic_rationale,
        positive_traits: holisticResult.positive_traits,
        challenges: holisticResult.challenges,
        suggestions
    };
});


// ---- Helper Function for Name Suggestions ----
async function generateNameSuggestions(name: string, score: number, coreNumbers: any, goal: string): Promise<any[]> {
    const suggestionSystemInstruction = `You are a highly creative numerology and branding expert. Your task is to generate 10 subtle, phonetically distinct variations of a given name. The goal is to improve its numerological score.

Key requirements:
1.  **Contextual relevance:** The suggestions should align with the user's stated goal.
2.  **Quantifiable improvement:** Each suggestion's 'new_score' MUST be higher than the original score.
3.  **Phonetic diversity:** The variations should not be just minor spelling changes; they should offer slightly different sounds while retaining the essence of the original name.
4.  **Concise rationale:** The 'reason' for each suggestion should be brief and compelling, explaining the numerological benefit.
5.  **Output format:** Return a JSON array of exactly 10 objects adhering to the specified schema.`;

    const prompt = `Generate 10 name suggestions based on the following data:
- Original Name: "${name}"
- Original Score: ${score}
- User's Goal: "${goal || 'General Insight'}"
- Core Numbers: ${JSON.stringify(coreNumbers)}

Please provide phonetically distinct variations that improve the score and align with the user's goal.`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: suggestionSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { suggested_name: { type: Type.STRING }, new_score: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["suggested_name", "new_score", "reason"] } },
            },
        });
        const suggestions = safeJsonParse(response.text);
        // Filter to ensure all suggested scores are an improvement
        return Array.isArray(suggestions) 
            ? suggestions
                .filter(s => s.new_score > score)
                .sort((a,b) => b.new_score - a.new_score)
            : [];
    } catch (error) {
        logger.error("Error generating name suggestions:", error);
        return [];
    }
}

// ---- Cloud Function for Compatibility Analysis ----
export const analyzeCompatibility = onCall(async (request) => {
    logger.info("analyzeCompatibility function triggered");
    
    if (!request.data) {
        logger.error("Request data is missing.");
        throw new HttpsError('invalid-argument', 'The function must be called with valid data.');
    }
    const { name1, birthdate1, name2, birthdate2 } = request.data;
    
    if (!name1 || typeof name1 !== 'string' || name1.trim().length === 0 || !name2 || typeof name2 !== 'string' || name2.trim().length === 0) {
        logger.error("Validation failed: 'name1' or 'name2' are missing or empty.", { data: request.data });
        throw new HttpsError('invalid-argument', 'The function must be called with non-empty "name1" and "name2" arguments.');
    }

    const person1Data = calculateScores(name1, birthdate1);
    const person2Data = calculateScores(name2, birthdate2);
    const compatibilityScore = calculateCompatibility(person1Data.coreNumbers, person2Data.coreNumbers);

    const systemInstruction = `You are a wise relationship numerologist. Based on the data provided in the prompt, provide a warm, constructive compatibility analysis. Create a catchy 2-4 word "title", highlight "strengths", gently point out "challenges", and write an uplifting "summary". Do not mention scores or numbers directly in your analysis. Return a single, valid JSON object that adheres to the schema.`;
    
    const prompt = `Provide the compatibility analysis for the following data:
- Person 1: { "name": "${name1}", "coreNumbers": ${JSON.stringify(person1Data.coreNumbers)} }
- Person 2: { "name": "${name2}", "coreNumbers": ${JSON.stringify(person2Data.coreNumbers)} }
- Calculated Compatibility Score: ${compatibilityScore}`;

    let qualitativeResult = { title: "A Powerful Connection", strengths: "You share a deep understanding.", challenges: "Communication may require conscious effort.", summary: "Your bond has great potential for growth." };
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, strengths: { type: Type.STRING }, challenges: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ["title", "strengths", "challenges", "summary"] },
            },
        });
        const parsed = safeJsonParse(response.text);
        if(parsed) qualitativeResult = parsed;
    } catch (e) {
        logger.error("Error in compatibility qualitative analysis:", e);
    }

    return { score: compatibilityScore, names: [name1, name2], ...qualitativeResult };
});

// ---- Cloud Function for Daily Insight ----
export const getDailyInsight = onCall(async (request) => {
    logger.info("getDailyInsight function triggered");
    
    if (!request.data) {
        logger.error("Request data is missing.");
        throw new HttpsError('invalid-argument', 'The function must be called with valid data.');
    }
    const { userName, coreNumbers } = request.data;

    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    const dateValue = ('' + day + month + year).split('').reduce((sum, digit) => sum + parseInt(digit), 0);
    const dateNumber = reduceNumber(dateValue);

    const systemInstruction = `You are a warm, insightful numerology guide. Provide a short (2-3 sentence) personalized "Daily Insight". Connect the user's personal numerology with the energy of today. Be personal, encouraging, and actionable. Return only plain text.`;
    
    const prompt = `Generate the daily insight based on this data:
- User: ${userName}
- Core Numbers: ${JSON.stringify(coreNumbers)}
- Today's Universal Day Number: ${dateNumber}`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { systemInstruction },
        });
        return response.text;
    } catch(e) {
        logger.error("Error generating daily insight:", e);
        return "Today is a great day to focus on your strengths and set a positive intention. Embrace the opportunities that come your way.";
    }
});
