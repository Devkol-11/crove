import { wrapLayout, codeBlock, styles, type EmailContent } from '../layout'

interface Params {
  recipientName: string
  code: string
  escrowTitle: string
  expiresInMinutes: number
}

export function otpJoinTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">You're invited to join an escrow</h1>
    <p style="${styles.p}">Hi ${p.recipientName},</p>
    <p style="${styles.p}">
      Someone has invited you to participate in an escrow titled
      <strong>&ldquo;${p.escrowTitle}&rdquo;</strong>.
      Use the code below to verify your identity and join.
    </p>

    ${codeBlock(p.code)}

    <p style="${styles.p}">
      This code expires in <strong>${p.expiresInMinutes} minutes</strong>.
      Do not share it with anyone.
    </p>
    <p style="${styles.muted}">
      If you did not request this, you can safely ignore this email.
    </p>
  `)

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `You've been invited to join the escrow "${p.escrowTitle}".`,
    `Your verification code is: ${p.code}`,
    ``,
    `This code expires in ${p.expiresInMinutes} minutes. Do not share it with anyone.`,
    ``,
    `If you did not request this, you can safely ignore this email.`,
  ].join('\n')

  return {
    subject: `Your Crove verification code: ${p.code}`,
    html,
    text,
  }
}
