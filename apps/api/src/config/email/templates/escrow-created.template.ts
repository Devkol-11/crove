import { wrapLayout, ctaButton, amountBox, detailRow, styles, formatAmount, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  creatorName: string
  escrowTitle: string
  amount: number
  currency: string
  escrowType: string
  code: string
  paymentLink: string
}

export function escrowCreatedTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">Your escrow is live</h1>
    <p style="${styles.p}">Hi ${p.creatorName},</p>
    <p style="${styles.p}">
      Your escrow <strong>&ldquo;${p.escrowTitle}&rdquo;</strong> has been created successfully.
      Share the link below with the other party so they can view and fund it.
    </p>

    ${amountBox(p.amount, p.currency)}

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
      ${detailRow('Escrow code', p.code)}
      ${detailRow('Type', p.escrowType)}
      ${detailRow('Amount', formatAmount(p.amount, p.currency))}
    </table>

    ${ctaButton('View Escrow', `${env.FRONTEND_URL}/e/${p.code}`)}

    <p style="${styles.muted}">
      Share this link with the other party:<br/>
      <a href="${env.FRONTEND_URL}/e/${p.code}" style="color:#2D6BE4;">
        ${env.FRONTEND_URL}/e/${p.code}
      </a>
    </p>
  `)

  const text = [
    `Hi ${p.creatorName},`,
    ``,
    `Your escrow "${p.escrowTitle}" has been created.`,
    `Amount: ${formatAmount(p.amount, p.currency)}`,
    `Code: ${p.code}`,
    ``,
    `Share this link with the other party: ${env.FRONTEND_URL}/e/${p.code}`,
  ].join('\n')

  return {
    subject: `Your escrow "${p.escrowTitle}" is live`,
    html,
    text,
  }
}
