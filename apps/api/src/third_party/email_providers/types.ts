export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Override the default from address */
  from?: string
  replyTo?: string
}

export interface SendEmailResult {
  messageId: string
}

export interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>
}
