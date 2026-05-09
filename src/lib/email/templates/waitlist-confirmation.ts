import { BRAND, escape, renderShell } from './_shared';

export interface WaitlistConfirmationVars {
  retreatTitle: string;
}

export function waitlistConfirmationTemplate(vars: WaitlistConfirmationVars): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `On the list — ${vars.retreatTitle}`;

  const body = `
    <p style="margin:0 0 18px 0;">Thank you for putting your name down for <em style="font-style:italic;color:${BRAND.ink};">${escape(vars.retreatTitle)}</em>.</p>
    <p style="margin:0 0 18px 0;">We hold the cohort small on purpose, so places open up rarely. If a room becomes available, we'll write to you first — quietly, with the details — and you'll have a few days to decide.</p>
    <p style="margin:0 0 18px 0;">In the meantime, watch this space. We're already shaping the next weekend.</p>
    <p style="margin:0 0 6px 0;">With warmth,<br /><em style="font-style:italic;color:${BRAND.ink};">Holly</em></p>
  `;

  const html = renderShell({
    preheader: `You're on the waitlist for ${vars.retreatTitle}. We'll be in touch if a room opens.`,
    eyebrow: 'Waitlist',
    heading: "You're on the list.",
    bodyHtml: body,
    footerHtml: `If you'd like to come off the waitlist, reply to this email and we'll take you off straight away.`,
  });

  const text = [
    `You're on the list.`,
    ``,
    `Thank you for putting your name down for ${vars.retreatTitle}.`,
    ``,
    `We hold the cohort small on purpose, so places open up rarely. If a room becomes available, we'll write to you first — quietly, with the details — and you'll have a few days to decide.`,
    ``,
    `With warmth,`,
    `Holly`,
    ``,
    `Kamala Retreats — United Kingdom`,
    `If you'd like to come off the waitlist, reply to this email.`,
  ].join('\n');

  return { subject, html, text };
}
