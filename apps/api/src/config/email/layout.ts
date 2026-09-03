/** Shared building blocks used across every email template. */

export interface EmailContent {
  subject: string
  html: string
  text: string
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

// ── Inline style constants ────────────────────────────────────────────────────

export const styles = {
  h1:   'margin:0 0 20px;font-size:22px;font-weight:600;color:#1F2937;line-height:1.3;',
  p:    'margin:0 0 16px;font-size:15px;color:#4B5563;line-height:1.7;',
  muted:'margin:0 0 16px;font-size:13px;color:#6B7280;line-height:1.6;',
  label:'font-size:13px;color:#6B7280;',
  value:'font-size:14px;color:#1F2937;font-weight:500;',
} as const

// ── HTML component helpers ────────────────────────────────────────────────────

/** Large centred amount display */
export function amountBox(amount: number, currency: string): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;">
      <tr><td style="background:#F3F4F6;border-radius:8px;padding:20px;text-align:center;">
        <span style="font-size:30px;font-weight:700;color:#1F2937;">${formatAmount(amount, currency)}</span>
      </td></tr>
    </table>`
}

/** CTA button */
export function ctaButton(label: string, href: string): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
      <tr><td>
        <a href="${href}" target="_blank"
           style="display:inline-block;background:#2D6BE4;color:#ffffff;padding:13px 28px;
                  border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">
          ${label}
        </a>
      </td></tr>
    </table>`
}

/** Large centred OTP / code block */
export function codeBlock(code: string): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;">
      <tr><td style="background:#F3F4F6;border-radius:8px;padding:20px;text-align:center;">
        <span style="font-size:36px;font-weight:700;color:#1F2937;letter-spacing:10px;">${code}</span>
      </td></tr>
    </table>`
}

/** Horizontal key-value detail row */
export function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="${styles.label}padding:9px 0;border-bottom:1px solid #F3F4F6;">${label}</td>
      <td style="${styles.value}padding:9px 0;border-bottom:1px solid #F3F4F6;text-align:right;">${value}</td>
    </tr>`
}

/** Coloured status badge */
export function badge(text: string, color: '#16A34A' | '#DC2626' | '#D97706' | '#2D6BE4'): string {
  return `<span style="display:inline-block;background:${color}1A;color:${color};
                        padding:2px 10px;border-radius:20px;font-size:13px;font-weight:600;">${text}</span>`
}

// ── Outer HTML wrapper ────────────────────────────────────────────────────────

export function wrapLayout(content: string): string {
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" border="0"
             style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:580px;width:100%;
                    box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- Brand header -->
        <tr>
          <td style="background:#1A1A2E;padding:26px 40px;text-align:center;">
            <span style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">crove</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 28px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:22px 40px;text-align:center;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.7;">
              © ${year} Crove &mdash; Secure escrow payments.<br/>
              You&rsquo;re receiving this because you have an active escrow on Crove.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
