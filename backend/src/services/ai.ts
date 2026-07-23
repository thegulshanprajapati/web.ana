const fetch = (global as any).fetch;
import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

/**
 * Free LLM API Service for WhatsApp Bot
 * Includes Security Limits & Chat Logging in SQLite Database
 */
export async function generateAiResponse(
  userPrompt: string, 
  personality: string = 'assistant', 
  customTone?: string | null,
  senderJid: string = 'unknown',
  sessionId: string = 'default'
): Promise<string> {
  let aiConfig = await prisma.aiConfig.findFirst();
  if (!aiConfig) {
    aiConfig = await prisma.aiConfig.create({
      data: {
        provider: 'pollinations',
        systemPrompt: 'You are Ana, a smart and friendly WhatsApp AI assistant. Give concise, helpful responses suited for WhatsApp messaging.',
        dailyLimit: 500,
        isEnabled: true
      }
    });
  }

  if (!aiConfig.isEnabled) {
    return "AI replies are currently disabled in settings.";
  }

  // Security Check: Daily Usage Limit
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayUsageCount = await prisma.aiChatLog.count({
    where: {
      createdAt: { gte: startOfDay }
    }
  });

  if (todayUsageCount >= (aiConfig.dailyLimit || 500)) {
    logger.warn(sessionId, `AI Daily Limit reached (${todayUsageCount}/${aiConfig.dailyLimit}). Request blocked.`);
    return "⚠️ AI daily limit reached for security. Please try again tomorrow!";
  }

  // Construct personality / custom tone instruction
  let personalityInstruction = "";
  if (personality === 'custom' && customTone && customTone.trim()) {
    personalityInstruction = `Adopt this custom tone/personality: "${customTone.trim()}".`;
  } else if (personality === 'professional') {
    personalityInstruction = "Respond in a formal, professional tone.";
  } else if (personality === 'funny') {
    personalityInstruction = "Respond with humor, puns, and emojis!";
  } else if (personality === 'friendly') {
    personalityInstruction = "Respond in a warm, welcoming, and casual friendly tone with emojis.";
  } else if (personality === 'hinglish') {
    personalityInstruction = "Respond in friendly Hinglish (Hindi + English mix), easy to understand!";
  } else {
    personalityInstruction = "Respond as a smart helpful AI assistant.";
  }

  const fullSystemPrompt = `${aiConfig.systemPrompt} ${personalityInstruction} Keep responses concise (under 150 words).`;
  let replyText = "";

  try {
    if (aiConfig.provider === 'groq' && aiConfig.apiKey) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: aiConfig.modelName || 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 300
        })
      });
      const data: any = await res.json();
      if (data.choices?.[0]?.message?.content) {
        replyText = data.choices[0].message.content.trim();
      }
    }

    if (!replyText) {
      // Default 100% FREE No-Key Provider: Pollinations AI API (GPT-4o-mini powered)
      const encodedPrompt = encodeURIComponent(`${fullSystemPrompt}\n\nUser Question: ${userPrompt}`);
      const pollinationsUrl = `https://text.pollinations.ai/${encodedPrompt}?model=openai&seed=42`;

      const response = await fetch(pollinationsUrl, {
        headers: { 'Accept': 'text/plain' }
      });

      if (response.ok) {
        const text = await response.text();
        if (text && text.trim()) {
          replyText = text.trim();
        }
      }
    }

    if (!replyText) {
      // Fallback free endpoint
      const fallbackRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model: 'openai'
        })
      });
      const fallbackText = await fallbackRes.text();
      if (fallbackText && fallbackText.trim()) {
        replyText = fallbackText.trim();
      }
    }

    if (!replyText) {
      replyText = "Hello! I received your message. How can I assist you today?";
    }

    // Persist LLM Chat in Database for auditing & usage tracking
    const estTokens = Math.ceil((userPrompt.length + replyText.length) / 4);
    await prisma.aiChatLog.create({
      data: {
        sessionId,
        senderJid,
        prompt: userPrompt,
        aiResponse: replyText,
        tokensUsed: estTokens
      }
    }).catch(err => logger.error(sessionId, 'Failed to persist AI Chat log', err));

    return replyText;
  } catch (err: any) {
    logger.error(sessionId, 'AI Service generation failed', err);
    return "I am currently having trouble processing AI requests. Please try again in a moment!";
  }
}
