/**
 * Email service entrypoint.
 *
 * High-level functions used by booking, waitlist, newsletter and contact
 * flows. Each function picks the right template, calls Resend (or logs in
 * dev) and resolves on success.
 *
 * Dev fallback: when `env.RESEND_API_KEY` is missing or empty, payloads are
 * logged via `console.info('[email:dev]', ...)` and resolved successfully —
 * which keeps the booking flow runnable end-to-end without a live key.
 */

import { FROM_HEADER } from './from';
import { sendEmail, ResendError } from './resend';
import { bookingConfirmationTemplate } from './templates/booking-confirmation';
import { manageBookingLinkTemplate } from './templates/manage-booking-link';
import { waitlistConfirmationTemplate } from './templates/waitlist-confirmation';
import { newsletterConfirmationTemplate } from './templates/newsletter-confirmation';
import { contactNotificationTemplate } from './templates/contact-notification';
import { bookingNotificationTemplate } from './templates/booking-notification';

// `CloudflareEnv` lives in env.d.ts as a non-exported type. Rebuild the bits
// the email service needs so we don't depend on global ambient types.
type EmailEnv = {
  RESEND_API_KEY?: string;
  NOTIFICATIONS_EMAIL?: string;
};

interface DispatchInput {
  env: EmailEnv;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

async function dispatch(input: DispatchInput): Promise<void> {
  const apiKey = input.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info('[email:dev]', {
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo,
      // Keep payloads short in logs.
      textPreview: input.text.slice(0, 240),
    });
    return;
  }

  try {
    await sendEmail({
      apiKey,
      from: FROM_HEADER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
  } catch (err) {
    if (err instanceof ResendError) {
      console.error('[email:resend]', {
        to: input.to,
        subject: input.subject,
        status: err.status,
        body: err.body,
      });
    } else {
      console.error('[email:error]', {
        to: input.to,
        subject: input.subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

// ---------- Customer-facing ----------

export interface SendBookingConfirmationInput {
  env: EmailEnv;
  to: string;
  code: string;
  retreatTitle: string;
  retreatDates: string;
  totalPence: number;
}

export async function sendBookingConfirmation(
  input: SendBookingConfirmationInput,
): Promise<void> {
  const tpl = bookingConfirmationTemplate({
    code: input.code,
    retreatTitle: input.retreatTitle,
    retreatDates: input.retreatDates,
    totalPence: input.totalPence,
  });
  await dispatch({
    env: input.env,
    to: input.to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

export interface SendManageBookingLinkInput {
  env: EmailEnv;
  to: string;
  url: string;
  code: string;
}

export async function sendManageBookingLink(
  input: SendManageBookingLinkInput,
): Promise<void> {
  const tpl = manageBookingLinkTemplate({ url: input.url, code: input.code });
  await dispatch({
    env: input.env,
    to: input.to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

export interface SendWaitlistConfirmationInput {
  env: EmailEnv;
  to: string;
  retreatTitle: string;
}

export async function sendWaitlistConfirmation(
  input: SendWaitlistConfirmationInput,
): Promise<void> {
  const tpl = waitlistConfirmationTemplate({
    retreatTitle: input.retreatTitle,
  });
  await dispatch({
    env: input.env,
    to: input.to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

export interface SendNewsletterConfirmationInput {
  env: EmailEnv;
  to: string;
  confirmUrl: string;
}

export async function sendNewsletterConfirmation(
  input: SendNewsletterConfirmationInput,
): Promise<void> {
  const tpl = newsletterConfirmationTemplate({ confirmUrl: input.confirmUrl });
  await dispatch({
    env: input.env,
    to: input.to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

// ---------- Internal / staff-facing ----------

export interface SendContactNotificationInput {
  env: EmailEnv;
  name: string;
  email: string;
  message: string;
}

export async function sendContactNotification(
  input: SendContactNotificationInput,
): Promise<void> {
  const to = input.env.NOTIFICATIONS_EMAIL;
  if (!to) {
    console.warn('[email] NOTIFICATIONS_EMAIL not set — dropping contact notification');
    return;
  }
  const tpl = contactNotificationTemplate({
    name: input.name,
    email: input.email,
    message: input.message,
  });
  await dispatch({
    env: input.env,
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    replyTo: input.email,
  });
}

export interface SendBookingNotificationInput {
  env: EmailEnv;
  code: string;
  retreatTitle: string;
  leadEmail: string;
  totalPence: number;
}

export async function sendBookingNotification(
  input: SendBookingNotificationInput,
): Promise<void> {
  const to = input.env.NOTIFICATIONS_EMAIL;
  if (!to) {
    console.warn('[email] NOTIFICATIONS_EMAIL not set — dropping booking notification');
    return;
  }
  const tpl = bookingNotificationTemplate({
    code: input.code,
    retreatTitle: input.retreatTitle,
    leadEmail: input.leadEmail,
    totalPence: input.totalPence,
  });
  await dispatch({
    env: input.env,
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}
