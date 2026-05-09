import { BRAND, escape, renderShell } from './_shared';

export interface ContactNotificationVars {
  name: string;
  email: string;
  message: string;
}

export function contactNotificationTemplate(vars: ContactNotificationVars): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Kamala] Contact form — ${vars.name}`;

  const messageHtml = escape(vars.message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, '<br />')}</p>`)
    .join('');

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.sand};margin:0 0 20px 0;">
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid ${BRAND.sand};font-size:13px;color:${BRAND.inkSoft};">
          <strong style="color:${BRAND.ink};">From:</strong> ${escape(vars.name)} &lt;<a href="mailto:${escape(vars.email)}" style="color:${BRAND.goldDark};">${escape(vars.email)}</a>&gt;
        </td>
      </tr>
      <tr>
        <td style="padding:18px;color:${BRAND.ink};font-size:14px;line-height:1.6;">
          ${messageHtml}
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${BRAND.inkSoft};">Reply to this email to respond directly to ${escape(vars.name)}.</p>
  `;

  const html = renderShell({
    preheader: `New contact form message from ${vars.name}`,
    eyebrow: 'Contact form',
    heading: `Message from ${vars.name}`,
    bodyHtml: body,
  });

  const text = [
    `Contact form — Kamala Retreats`,
    ``,
    `From: ${vars.name} <${vars.email}>`,
    ``,
    vars.message,
    ``,
    `--`,
    `Reply to respond directly.`,
  ].join('\n');

  return { subject, html, text };
}
