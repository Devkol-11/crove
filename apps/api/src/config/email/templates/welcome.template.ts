import { wrapLayout, ctaButton, styles, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  firstName: string
}

export function welcomeTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">Welcome to Crove, ${p.firstName}!</h1>
    <p style="${styles.p}">
      You&rsquo;re now part of a safer way to handle payments. With Crove, funds are held
      securely in escrow until both parties confirm delivery &mdash; no more chasing
      payments or worrying about trust.
    </p>
    <p style="${styles.p}">Here&rsquo;s what you can do right now:</p>
    <ul style="margin:0 0 20px;padding-left:20px;color:#4B5563;font-size:15px;line-height:1.8;">
      <li>Create an escrow and share the payment link</li>
      <li>Join an existing escrow as the other party</li>
      <li>Track the status of all your active escrows</li>
    </ul>
    ${ctaButton('Go to Dashboard', `${env.FRONTEND_URL}/dashboard`)}
    <p style="${styles.muted}">
      If you have any questions, reply to this email — we&rsquo;re happy to help.
    </p>
  `)

  const text = [
    `Welcome to Crove, ${p.firstName}!`,
    ``,
    `You're now part of a safer way to handle payments.`,
    `Funds are held securely in escrow until both parties confirm delivery.`,
    ``,
    `Get started: ${env.FRONTEND_URL}/dashboard`,
  ].join('\n')

  return {
    subject: `Welcome to Crove, ${p.firstName}!`,
    html,
    text,
  }
}
