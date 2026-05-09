/**
 * Shared HTML email scaffolding for Kamala templates.
 *
 * Email clients are unforgiving — tables for layout, inline styles only,
 * conservative widths, no external CSS. Brand:
 *   - cream background  #f9f3f1
 *   - gold accent       #b78f38
 *   - ink text          #2a2622
 */

export const BRAND = {
  cream: '#f9f3f1',
  creamDeep: '#f1e8e3',
  sand: '#e6dbd2',
  ink: '#2a2622',
  inkSoft: '#5a5048',
  gold: '#b78f38',
  goldDark: '#97742d',
} as const;

const FONT_DISPLAY =
  "'Cormorant Garamond', 'Cormorant', Georgia, 'Times New Roman', serif";
const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface ShellOptions {
  /** Pre-header text shown in inbox previews — keep under ~90 chars. */
  preheader?: string;
  /** Optional small caps eyebrow above the heading. */
  eyebrow?: string;
  /** Page heading rendered in the serif display face. */
  heading: string;
  /** Inner HTML for the body region (already-formatted paragraphs/tables). */
  bodyHtml: string;
  /** Optional footer line shown muted under the body (e.g. unsubscribe). */
  footerHtml?: string;
}

/**
 * Wraps body content in the standard email shell.
 */
export function renderShell(opts: ShellOptions): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.cream};">${escape(opts.preheader)}</div>`
    : '';

  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 16px 0;font-family:${FONT_SANS};font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${BRAND.goldDark};">${escape(opts.eyebrow)}</p>`
    : '';

  const footer = opts.footerHtml
    ? `<tr><td style="padding:32px 40px 40px 40px;border-top:1px solid ${BRAND.sand};font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${BRAND.inkSoft};">${opts.footerHtml}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <title>${escape(opts.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.cream};font-family:${FONT_SANS};color:${BRAND.ink};">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.sand};">
            <tr>
              <td style="padding:36px 40px 12px 40px;">
                <p style="margin:0;font-family:${FONT_DISPLAY};font-weight:300;letter-spacing:0.32em;text-transform:uppercase;font-size:14px;color:${BRAND.ink};">Kamala Retreats</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 28px 40px;">
                ${eyebrow}
                <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:400;font-size:30px;line-height:1.15;color:${BRAND.ink};">${escape(opts.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 36px 40px;font-family:${FONT_SANS};font-size:15px;line-height:1.65;color:${BRAND.inkSoft};">
                ${opts.bodyHtml}
              </td>
            </tr>
            ${footer}
          </table>
          <p style="margin:20px 0 0 0;font-family:${FONT_SANS};font-size:11px;line-height:1.5;color:${BRAND.inkSoft};letter-spacing:0.04em;">
            Kamala Retreats &middot; United Kingdom
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Escape a value for safe interpolation into HTML attributes / text. */
export function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a Kamala-branded button link. */
export function renderButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
  <tr>
    <td style="background:${BRAND.ink};">
      <a href="${escape(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT_SANS};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.cream};text-decoration:none;">${escape(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Format pence as British pounds with no trailing decimals when whole. */
export function formatPence(pence: number): string {
  if (!Number.isFinite(pence)) return '';
  const pounds = pence / 100;
  const isWhole = Math.abs(pounds - Math.round(pounds)) < 1e-9;
  return isWhole
    ? `£${Math.round(pounds).toLocaleString('en-GB')}`
    : `£${pounds.toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}
