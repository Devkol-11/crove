import type { EmailProvider, SendEmailParams, SendEmailResult } from './types'

export class SendByte implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
  ) {}

  sendEmail(_params: SendEmailParams): Promise<SendEmailResult> {
    void this.apiKey
    void this.defaultFrom
    throw new Error('SendByte email integration is not yet implemented')
  }
}
