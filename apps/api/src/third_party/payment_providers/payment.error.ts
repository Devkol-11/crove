export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly providerBody?: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PaymentError'
    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`
    }
  }
}
