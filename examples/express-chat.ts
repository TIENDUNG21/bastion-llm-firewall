/**
 * A chat endpoint protected by Bastion. The model call is a stub so the
 * example runs offline; replace `callModel` with your provider's client.
 *
 *   npm run build && npm run example    # listens on :5202
 */
import { createCanary, embedCanary } from '@bastion/core';
import { bastion } from '@bastion/express';
import express from 'express';

const canary = createCanary();
const systemPrompt = embedCanary('You are the booking assistant of a hotel in Hanoi.', canary);

// Stand-in for an LLM call. It "leaks" a guest's e-mail address when asked
// for a contact, to show output-side redaction.
async function callModel(_system: string, question: string): Promise<string> {
  return /contact|email/i.test(question)
    ? 'The front desk manager is Lan Nguyen, lan.nguyen@example.vn, ext. 204.'
    : 'Check-in starts at 2 pm and breakfast is served until 10 am.';
}

const app = express();
app.use(express.json());
app.use(
  bastion({
    policy: { routes: [{ match: '/admin/**', policy: { input: { blockAt: 0.6 } } }] },
    onDecision: (e) => console.log(`${e.side} ${e.route} ${e.action}`),
  }),
);

app.post('/chat', async (req, res) => {
  res.locals.bastionCanaries = [canary];
  res.locals.bastionSystemPrompt = systemPrompt;
  const question = String((req.body as { message?: unknown }).message ?? '');
  res.json({ reply: await callModel(systemPrompt, question) });
});

const port = Number(process.env.PORT ?? 5202);
app.listen(port, () => console.log(`listening on http://localhost:${port}`));
