import { BRAND, escape, formatPence, renderShell } from './_shared';

export interface BookingConfirmationVars {
  code: string;
  retreatTitle: string;
  retreatDates: string;
  totalPence: number;
}

export function bookingConfirmationTemplate(vars: BookingConfirmationVars): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You're in — ${vars.retreatTitle}`;

  const body = `
    <p style="margin:0 0 18px 0;">A quiet welcome from us. Your place at <em style="font-style:italic;color:${BRAND.ink};">${escape(vars.retreatTitle)}</em> is held.</p>
    <p style="margin:0 0 24px 0;">${escape(vars.retreatDates)}. We'll write again closer to the weekend with directions, what to pack, and a few small things to know before you arrive.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.sand};background:${BRAND.creamDeep};margin:8px 0 24px 0;">
      <tr>
        <td style="padding:18px 22px;">
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${BRAND.goldDark};">Confirmation code</p>
          <p style="margin:0;font-size:22px;letter-spacing:0.12em;font-family:'SFMono-Regular',Menlo,Consolas,monospace;color:${BRAND.ink};">${escape(vars.code)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 22px 18px 22px;">
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${BRAND.goldDark};">Total paid</p>
          <p style="margin:0;font-size:18px;color:${BRAND.ink};">${escape(formatPence(vars.totalPence))}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 18px 0;">If you ever need to look back at the details, head to <a href="https://kamalaretreats.com/my-booking" style="color:${BRAND.goldDark};">kamalaretreats.com/my-booking</a> and we'll send you straight to your booking.</p>

    <p style="margin:0 0 6px 0;">Until October,<br /><em style="font-style:italic;color:${BRAND.ink};">Holly</em></p>
  `;

  const html = renderShell({
    preheader: `Your place at ${vars.retreatTitle} is held. Confirmation code: ${vars.code}.`,
    eyebrow: 'Booking confirmed',
    heading: "You're in.",
    bodyHtml: body,
    footerHtml: `Questions? Reply to this email — we read every one. <br />All bookings are binding and non-refundable. <a href="https://kamalaretreats.com/legal/booking-terms" style="color:${BRAND.goldDark};">Booking terms</a>.`,
  });

  const text = [
    `You're in.`,
    ``,
    `A quiet welcome from us. Your place at ${vars.retreatTitle} is held.`,
    `${vars.retreatDates}.`,
    ``,
    `Confirmation code: ${vars.code}`,
    `Total paid: ${formatPence(vars.totalPence)}`,
    ``,
    `Look back at your booking any time at https://kamalaretreats.com/my-booking`,
    ``,
    `Until October,`,
    `Holly`,
    ``,
    `Kamala Retreats — United Kingdom`,
    `Booking terms: https://kamalaretreats.com/legal/booking-terms`,
  ].join('\n');

  return { subject, html, text };
}
