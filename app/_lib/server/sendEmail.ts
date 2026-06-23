import "server-only";

import { Resend } from "resend";

const SENDER = "notifications@desk.blueteamafrica.com";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export type EmailPayload = {
  to: string;
  subject: string;
  /** Plain text body for clients that don't render HTML. */
  text: string;
  html: string;
};

/**
 * Sends a transactional email via Resend.
 * Returns silently on missing API key (useful in dev without credentials).
 * Throws on send error so callers can decide whether to swallow it.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const resend = getResend();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[sendEmail] RESEND_API_KEY not set — skipping email to", payload.to);
    }
    return;
  }

  const { error } = await resend.emails.send({
    from: SENDER,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/** Replaces {ref} placeholder in a label string. */
export function interpolateRef(template: string, ref: string): string {
  return template.replace(/\{ref\}/g, ref);
}

/** Replaces any {key} placeholders in template with the corresponding values from vars. */
export function interpolateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/**
 * Builds a plain functional HTML email.
 * dir/lang used for Arabic RTL support.
 */
export function buildEmailHtml(opts: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
  dir?: "ltr" | "rtl";
  lang?: string;
}): string {
  const { title, body, ctaLabel, ctaUrl, footer, dir = "ltr", lang = "en" } = opts;
  const align = dir === "rtl" ? "right" : "left";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:#1a1a2e;padding:20px 28px;">
          <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;">Secure Desk</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 28px 0;text-align:${align};">
          <h1 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1a2e;line-height:1.3;">${title}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#444;line-height:1.6;">${body}</p>
          <a href="${ctaUrl}" style="display:inline-block;background:#1a1a2e;color:#ffffff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">${ctaLabel}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;text-align:${align};">
          <p style="margin:0;font-size:12px;color:#999;">${footer}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
