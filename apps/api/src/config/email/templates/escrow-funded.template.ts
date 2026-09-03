import { wrapLayout, ctaButton, amountBox, detailRow, badge, styles, formatAmount, type EmailContent } from '../layout'
import { env } from '../../index'

interface BaseParams {
  escrowTitle: string
  amount: number
  currency: string
  code: string
}

interface PayerParams extends BaseParams {
  recipientName: string
  role: 'Payer'
}

interface PayeeParams extends BaseParams {
  recipientName: string
  role: 'Payee'
}

export type EscrowFundedParams = PayerParams | PayeeParams

export function escrowFundedTemplate(p: EscrowFundedParams): EmailContent {
  const isPayer = p.role === 'Payer'

  const heading   = isPayer ? 'Payment confirmed — funds are held' : 'Funds are now in escrow'
  const summary   = isPayer
    ? `Your payment for <strong>&ldquo;${p.escrowTitle}&rdquo;</strong> has been received. The funds are now held securely in escrow pending delivery confirmation.`
    : `Great news! The payer has funded the escrow <strong>&ldquo;${p.escrowTitle}&rdquo;</strong>. Funds are held securely and will be released to you once the payer confirms delivery.`

  const html = wrapLayout(`
    <h1 style="${styles.h1}">${heading} ${badge('Funded', '#16A34A')}</h1>
    <p style="${styles.p}">Hi ${p.recipientName},</p>
    <p style="${styles.p}">${summary}</p>

    ${amountBox(p.amount, p.currency)}

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
      ${detailRow('Escrow', p.escrowTitle)}
      ${detailRow('Amount held', formatAmount(p.amount, p.currency))}
      ${detailRow('Reference', p.code)}
    </table>

    ${ctaButton('View Escrow', `${env.FRONTEND_URL}/e/${p.code}`)}

    ${isPayer ? '' : `<p style="${styles.muted}">Begin work when you&rsquo;re ready. The payer will release funds once they confirm delivery.</p>`}
  `)

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    isPayer
      ? `Your payment for "${p.escrowTitle}" has been confirmed.`
      : `The escrow "${p.escrowTitle}" has been funded.`,
    `Amount held: ${formatAmount(p.amount, p.currency)}`,
    ``,
    `View escrow: ${env.FRONTEND_URL}/e/${p.code}`,
  ].join('\n')

  return {
    subject: isPayer
      ? `Payment confirmed — ₦ held in escrow for "${p.escrowTitle}"`
      : `Funds are now held in escrow for "${p.escrowTitle}"`,
    html,
    text,
  }
}
