import { wrapLayout, ctaButton, badge, styles, type EmailContent } from '../layout'
import { env } from '../../index'

interface Params {
  firstName: string
}

export function emailVerifiedTemplate(p: Params): EmailContent {
  const html = wrapLayout(`
    <h1 style="${styles.h1}">Email confirmed ${badge('Verified', '#16A34A')}</h1>
    <p style="${styles.p}">Hi ${p.firstName},</p>
    <p style="${styles.p}">
      Your email address has been verified. Your account is now fully active
      and you&rsquo;re ready to create and manage escrows.
    </p>
    ${ctaButton('Go to Dashboard', `${env.FRONTEND_URL}/dashboard`)}
  `)

  const text = [
    `Hi ${p.firstName},`,
    ``,
    `Your email address has been verified. Your Crove account is now fully active.`,
    ``,
    `Dashboard: ${env.FRONTEND_URL}/dashboard`,
  ].join('\n')

  return {
    subject: 'Your Crove email has been verified',
    html,
    text,
  }
}
