import type { EmailProvider, SendEmailParams, SendEmailResult } from './types'

const BASE = 'https://api.resend.com'

export class Resend implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
  ) {}

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const res = await fetch(`${BASE}/emails`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     params.from ?? this.defaultFrom,
        to:       Array.isArray(params.to) ? params.to : [params.to],
        subject:  params.subject,
        html:     params.html,
        text:     params.text,
        reply_to: params.replyTo,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Resend sendEmail [${res.status}]: ${body}`)
    }

    const json = (await res.json()) as { id: string }
    return { messageId: json.id }
  }
}
