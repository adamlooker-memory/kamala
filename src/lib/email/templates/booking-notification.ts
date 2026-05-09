import { BRAND, escape, formatPence, renderShell } from './_shared';

export interface BookingNotificationVars {
  code: string;
  retreatTitle: string;
  leadEmail: string;
  totalPence: number;
}

export function bookingNotificationTemplate(vars: BookingNotificationVars): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Kamala] New booking — ${vars.retreatTitle} — ${vars.code}`;

  const body = `
    <p style="margin:0 0 18px 0;">A new booking has come through.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.sand};margin:0 0 20px 0;">
      <tr><td style="padding:10px 16px;border-bottom:1px solid ${BRAND.sand};font-size:13px;"><strong style="color:${BRAND.ink};">Retreat:</strong> ${escape(vars.retreatTitle)}</td></tr>
      <tr><td style="padding:10px 16px;border-bottom:1px solid ${BRAND.sand};font-size:13px;"><strong style="color:${BRAND.ink};">Code:</strong> <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.08em;">${escape(vars.code)}</span></td></tr>
      <tr><td style="padding:10px 16px;border-bottom:1px solid ${BRAND.sand};font-size:13px;"><strong style="color:${BRAND.ink};">Lead email:</strong> <a href="mailto:${escape(vars.leadEmail)}" style="color:${BRAND.goldDark};">${escape(vars.leadEmail)}</a></td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;"><strong style="color:${BRAND.ink};">Total:</strong> ${escape(formatPence(vars.totalPence))}</td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:${BRAND.inkSoft};">Full booking details are in the admin dashboard.</p>
  `;

  const html = renderShell({
    preheader: `New booking ${vars.code} — ${vars.retreatTitle}`,
    eyebrow: 'New booking',
    heading: `Booking ${vars.code}`,
    bodyHtml: body,
  });

  const text = [
    `New booking — Kamala Retreats`,
    ``,
    `Retreat: ${vars.retreatTitle}`,
    `Code: ${vars.code}`,
    `Lead email: ${vars.leadEmail}`,
    `Total: ${formatPence(vars.totalPence)}`,
  ].join('\n');

  return { subject, html, text };
}
