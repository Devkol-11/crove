import { wrapLayout, amountBox, detailRow, badge, styles, formatAmount, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  payeeName: string
  escrowTitle: string
  amount: number
  currency: string
  code: string
}

export function escrowReleasedTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">Funds released ${badge('Released', '#16A34A')}</h1>
    <p style="${styles.p}">Hi ${p.payeeName},</p>
    <p style="${styles.p}">
      The payer has approved delivery and released the funds for
      <strong>&ldquo;${p.escrowTitle}&rdquo;</strong>.
      The amount below will be disbursed to your account shortly.
    </p>

    ${amountBox(p.amount, p.currency)}

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
      ${detailRow('Escrow', p.escrowTitle)}
      ${detailRow('Amount released', formatAmount(p.amount, p.currency))}
      ${detailRow('Reference', p.code)}
    </table>

    <p style="${styles.muted}">
      Payouts are processed within 1&ndash;3 business days depending on your bank.
      <a href="${env.FRONTEND_URL}/e/${p.code}" style="color:#2D6BE4;">View escrow details.</a>
    </p>
  `)

  const text = [
    `Hi ${p.payeeName},`,
    ``,
    `Funds for "${p.escrowTitle}" have been released to you.`,
    `Amount: ${formatAmount(p.amount, p.currency)}`,
    ``,
    `Payouts are processed within 1–3 business days.`,
    `View details: ${env.FRONTEND_URL}/e/${p.code}`,
  ].join('\n')

  return {
    subject: `Funds released for "${p.escrowTitle}"`,
    html,
    text,
  }
}
