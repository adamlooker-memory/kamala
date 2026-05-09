import { BRAND, escape, renderButton, renderShell } from './_shared';

export interface NewsletterConfirmationVars {
  confirmUrl: string;
}

export function newsletterConfirmationTemplate(
  vars: NewsletterConfirmationVars,
): { subject: string; html: string; text: string } {
  const subject = 'Welcome to Kamala';

  const body = `
    <p style="margin:0 0 18px 0;">Hello,</p>
    <p style="margin:0 0 18px 0;">Thank you for joining the Kamala letter. One small thing first — would you confirm your address? It keeps the list clean and makes sure you actually wanted us in your inbox.</p>
    ${renderButton(vars.confirmUrl, 'Confirm subscription')}
    <p style="margin:18px 0 18px 0;font-size:13px;color:${BRAND.inkSoft};">If the button doesn't work, paste this into your browser:<br /><a href="${escape(vars.confirmUrl)}" style="color:${BRAND.goldDark};word-break:break-all;">${escape(vars.confirmUrl)}</a></p>
    <p style="margin:0 0 18px 0;">Once a month after that, we'll send you something quiet — new retreat dates as they open, the occasional reflection from Holly, and once in a while a recipe or a practitioner we want you to meet. Nothing else.</p>
    <p style="margin:0 0 6px 0;">With warmth,<br /><em style="font-style:italic;color:${BRAND.ink};">Holly</em></p>
  `;

  const html = renderShell({
    preheader: 'One last step — confirm your subscription to the Kamala letter.',
    eyebrow: 'Almost there',
    heading: 'Welcome to Kamala.',
    bodyHtml: body,
    footerHtml: `If you didn't sign up, ignore this email and you'll never hear from us again.`,
  });

  const text = [
    `Welcome to Kamala.`,
    ``,
    `Hello,`,
    ``,
    `Thank you for joining the Kamala letter. One small thing first — would you confirm your address?`,
    ``,
    `Confirm: ${vars.confirmUrl}`,
    ``,
    `Once a month after that, we'll send you something quiet — new retreat dates as they open, the occasional reflection from Holly, and once in a while a recipe or a practitioner we want you to meet. Nothing else.`,
    ``,
    `With warmth,`,
    `Holly`,
    ``,
    `Kamala Retreats — United Kingdom`,
    `If you didn't sign up, ignore this email and you'll never hear from us again.`,
  ].join('\n');

  return { subject, html, text };
}
