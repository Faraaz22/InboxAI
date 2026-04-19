import { Injectable, Logger } from '@nestjs/common';
import { EmailType } from '../../email/domain/email.entity';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor() {}

  async classifyEmail(subject: string, body: string): Promise<EmailType> {
    this.logger.log(`Classifying email: "${subject}"`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const truncatedBody = (body ?? '').slice(0, 800);

    const prompt = `Classify this email. Reply with ONLY one category name.

Categories:
- job_opportunity: ANYTHING career-related — recruiter outreach, LinkedIn/Naukri/Indeed/Wellfound alerts, application status updates (received/shortlisted/rejected), interview invites, ATS notifications, "we're hiring" emails. Prefer this over transactional or general when in doubt on jobs.
- hackathon: Devpost, MLH, Unstop, hackathon deadlines, submissions, winner announcements.
- newsletter: opted-in content digests, tech newsletters, Substack, weekly product updates.
- promotion: marketing, discounts, sales from companies.
- transactional: receipts, invoices, payment confirmations, OTPs, shipping updates, account notifications — NOT job-related.
- personal: one-to-one human correspondence.
- spam: unsolicited junk, phishing, scams.
- general: only if nothing else fits.

Examples:
  "New job match: Backend Engineer at Acme" → job_opportunity
  "Status of your application has changed" → job_opportunity
  "Your Uber receipt for Apr 18" → transactional
  "Submit your HackMIT entry by Sunday" → hackathon
  "Hey, still on for Friday?" → personal

Subject: ${subject}
Body: ${truncatedBody}

Category:`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 20,
        thinkingConfig: { thinkingBudget: 0 },
      },
    } as const;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      this.logger.error(`Gemini API error: ${res.status} ${txt}`);
      throw new Error('Gemini API request failed');
    }

    const data = await res.json();
    const raw = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, '');

    const allowed: EmailType[] = [
      'job_opportunity',
      'hackathon',
      'newsletter',
      'promotion',
      'transactional',
      'personal',
      'spam',
      'general',
    ];
    const result: EmailType = (allowed as string[]).includes(raw) ? (raw as EmailType) : 'general';

    if (raw === '') {
      this.logger.warn(
        `Empty classification response — check maxOutputTokens vs thinkingBudget. Full response: ${JSON.stringify(data)}`,
      );
    } else if (result === 'general' && raw !== 'general') {
      this.logger.warn(`Model returned unknown category "${raw}" — defaulted to general`);
    }

    this.logger.log(`Classification result: ${result} (raw: "${raw}")`);
    return result;
  }
}