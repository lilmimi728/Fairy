// Optional AI coach: Claude reads last week's computed review and writes a short,
// direct accountability note. Uses your own Anthropic API key, stored on this device only.
import { reviewForCoach } from './review.js';

const SYSTEM = `You are a direct, supportive accountability coach for one person tracking their own health and training.
You get a JSON summary of their past week: averages, goals, workouts planned vs done, commitments they made and whether they kept them, and observations.

Write a short weekly check-in (120-180 words, plain text, no headings, no bullet lists):
- Open with an honest one-sentence verdict on the week.
- Name what they actually did well, with the numbers.
- Hold them to account for what slipped. Be specific about which days/sessions/commitments, without moralising or shaming.
- Connect cause and effect where the data supports it (e.g. short sleep -> lower readiness).
- End with exactly one concrete, measurable action for this coming week.
Speak to them as "you". Do not invent data that is not in the summary. This is not medical advice; if a signal looks concerning (e.g. resting heart rate rising sharply for days), suggest checking in with a professional.`;

let sdk;
async function loadSdk() {
  sdk ||= import('https://esm.sh/@anthropic-ai/sdk@0');
  return (await sdk).default;
}

export async function coachReview(review, state) {
  const apiKey = state.settings.anthropicKey;
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings to use the coach.');
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  let response;
  try {
    response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(reviewForCoach(review, state), null, 1) }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the API key. Check it in Settings.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited by Anthropic. Try again shortly.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your connection.');
    throw e;
  }

  if (response.stop_reason === 'refusal') throw new Error('The coach declined this request.');
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The coach returned an empty response.');
  return text;
}
