import { wrapLayout, ctaButton, badge, styles, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  recipientName: string
  escrowTitle: string
  reason: string
  raisedByName: string
  code: string
}

export function escrowDisputedTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">A dispute has been opened ${badge('Disputed', '#DC2626')}</h1>
    <p style="${styles.p}">Hi ${p.recipientName},</p>
    <p style="${styles.p}">
      <strong>${p.raisedByName}</strong> has opened a dispute on the escrow
      <strong>&ldquo;${p.escrowTitle}&rdquo;</strong>.
      Funds are frozen while the dispute is under review.
    </p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin:0 0 24px;background:#FEF2F2;border-radius:8px;padding:16px;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#991B1B;text-transform:uppercase;letter-spacing:0.5px;">
          Reason for dispute
        </p>
        <p style="margin:0;font-size:15px;color:#1F2937;line-height:1.6;">${p.reason}</p>
      </td></tr>
    </table>

    <p style="${styles.p}">
      Our team will review the dispute and reach out to both parties.
      Please do not make any transfers until the dispute is resolved.
    </p>

    ${ctaButton('View Dispute', `${env.FRONTEND_URL}/e/${p.code}`)}

    <p style="${styles.muted}">
      Reference: ${p.code}. If you believe this is in error, reply to this email.
    </p>
  `)

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `A dispute has been opened on the escrow "${p.escrowTitle}" by ${p.raisedByName}.`,
    ``,
    `Reason: ${p.reason}`,
    ``,
    `Funds are frozen while the dispute is under review.`,
    `View details: ${env.FRONTEND_URL}/e/${p.code}`,
  ].join('\n')

  return {
    subject: `Dispute opened on "${p.escrowTitle}"`,
    html,
    text,
  }
}
