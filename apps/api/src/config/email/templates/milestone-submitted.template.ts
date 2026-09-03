import { wrapLayout, ctaButton, badge, styles, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  payerName: string
  milestoneTitle: string
  escrowTitle: string
  code: string
  payeeName: string
}

export function milestoneSubmittedTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">Work submitted for review ${badge('Awaiting Review', '#D97706')}</h1>
    <p style="${styles.p}">Hi ${p.payerName},</p>
    <p style="${styles.p}">
      <strong>${p.payeeName}</strong> has submitted the milestone
      <strong>&ldquo;${p.milestoneTitle}&rdquo;</strong> for your review
      on the escrow <strong>&ldquo;${p.escrowTitle}&rdquo;</strong>.
    </p>
    <p style="${styles.p}">
      Please review the submission and approve it if you&rsquo;re satisfied with the work.
      If there are issues, you can raise a dispute.
    </p>

    ${ctaButton('Review Submission', `${env.FRONTEND_URL}/e/${p.code}`)}

    <p style="${styles.muted}">
      This milestone will be automatically approved after 3 days if no action is taken.
    </p>
  `)

  const text = [
    `Hi ${p.payerName},`,
    ``,
    `${p.payeeName} has submitted the milestone "${p.milestoneTitle}" for your review.`,
    `Escrow: ${p.escrowTitle}`,
    ``,
    `Review and approve: ${env.FRONTEND_URL}/e/${p.code}`,
    ``,
    `Note: This milestone will be auto-approved after 3 days if no action is taken.`,
  ].join('\n')

  return {
    subject: `Milestone submitted for review: "${p.milestoneTitle}"`,
    html,
    text,
  }
}
