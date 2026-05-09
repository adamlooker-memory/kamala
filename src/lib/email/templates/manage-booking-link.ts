import { BRAND, escape, renderButton, renderShell } from './_shared';

export interface ManageBookingLinkVars {
  url: string;
  code: string;
}

export function manageBookingLinkTemplate(vars: ManageBookingLinkVars): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Your booking, ready to view';

  const body = `
    <p style="margin:0 0 18px 0;">As requested — a one-time link to view your booking.</p>
    ${renderButton(vars.url, 'Open my booking')}
    <p style="margin:18px 0 18px 0;font-size:13px;color:${BRAND.inkSoft};">If the button doesn't work, copy and paste this into your browser:<br /><a href="${escape(vars.url)}" style="color:${BRAND.goldDark};word-break:break-all;">${escape(vars.url)}</a></p>
    <p style="margin:0 0 18px 0;">The link works once and expires in 15 minutes — for your security. You can request another any time.</p>
    <p style="margin:0;">Confirmation code: <strong style="color:${BRAND.ink};font-family:'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.08em;">${escape(vars.code)}</strong></p>
  `;

  const html = renderShell({
    preheader: 'Your one-time link to view your Kamala booking. Expires in 15 minutes.',
    eyebrow: 'Secure link',
    heading: 'Your booking, ready to view',
    bodyHtml: body,
    footerHtml: `If you didn't request this link, you can ignore this email. The link expires in 15 minutes either way.`,
  });

  const text = [
    `Your booking, ready to view.`,
    ``,
    `As requested — a one-time link to view your booking.`,
    `Open: ${vars.url}`,
    ``,
    `The link works once and expires in 15 minutes.`,
    ``,
    `Confirmation code: ${vars.code}`,
    ``,
    `If you didn't request this link, you can ignore this email.`,
  ].join('\n');

  return { subject, html, text };
}
