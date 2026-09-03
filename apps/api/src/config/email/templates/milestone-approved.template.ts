import { wrapLayout, amountBox, ctaButton, badge, styles, formatAmount, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  payeeName: string
  milestoneTitle: string
  escrowTitle: string
  amount: number
  currency: string
  code: string
}

export function milestoneApprovedTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">Milestone approved ${badge('Approved', '#16A34A')}</h1>
    <p style="${styles.p}">Hi ${p.payeeName},</p>
    <p style="${styles.p}">
      The payer has approved your milestone <strong>&ldquo;${p.milestoneTitle}&rdquo;</strong>
      on the escrow <strong>&ldquo;${p.escrowTitle}&rdquo;</strong>.
      The corresponding funds will be released to you shortly.
    </p>

    ${amountBox(p.amount, p.currency)}

    ${ctaButton('View Escrow', `${env.FRONTEND_URL}/e/${p.code}`)}

    <p style="${styles.muted}">
      Payment of ${formatAmount(p.amount, p.currency)} will be disbursed within
      1&ndash;3 business days.
    </p>
  `)

  const text = [
    `Hi ${p.payeeName},`,
    ``,
    `Your milestone "${p.milestoneTitle}" has been approved.`,
    `Amount: ${formatAmount(p.amount, p.currency)}`,
    ``,
    `Funds will be disbursed within 1–3 business days.`,
    `View details: ${env.FRONTEND_URL}/e/${p.code}`,
  ].join('\n')

  return {
    subject: `Milestone approved: "${p.milestoneTitle}"`,
    html,
    text,
  }
}
