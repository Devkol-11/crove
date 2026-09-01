export enum EscrowType {
  Standard    = 'Standard',    // Payer/Payee — delivery + confirmation
  Milestone   = 'Milestone',   // Progress-based multi-payment
  Conditional = 'Conditional', // Condition-gated release
  Deposit     = 'Deposit',     // Upfront reservation deposit
}

export enum EscrowStatus {
  Created         = 'Created',
  AwaitingPayment = 'AwaitingPayment',
  Funded          = 'Funded',
  Held            = 'Held',
  AwaitingAction  = 'AwaitingAction',
  Released        = 'Released',
  Refunded        = 'Refunded',
  Disputed        = 'Disputed',
  Cancelled       = 'Cancelled',
}

export enum MilestoneStatus {
  Pending    = 'Pending',
  InProgress = 'InProgress',
  Submitted  = 'Submitted', // Payee submitted for payer approval
  Approved   = 'Approved',  // Payer approved
  Released   = 'Released',  // Funds disbursed for this milestone
}

export enum EscrowRole {
  Payer = 'Payer', // The party depositing money into escrow
  Payee = 'Payee', // The party receiving funds after delivery
}

export enum DisputeStatus {
  Open        = 'Open',
  UnderReview = 'UnderReview',
  Resolved    = 'Resolved',
  Closed      = 'Closed',
}

export enum TransactionType {
  Funding = 'Funding',
  Release = 'Release',
  Refund  = 'Refund',
  Fee     = 'Fee',
}

export enum TransactionStatus {
  Pending    = 'Pending',
  Processing = 'Processing',
  Completed  = 'Completed',
  Failed     = 'Failed',
}

export enum LedgerEntryType {
  Funding = 'Funding', // Payer deposits funds
  Release = 'Release', // Funds disbursed to payee
  Refund  = 'Refund',  // Funds returned to payer
  Fee     = 'Fee',     // Platform fee deducted
}

// Payer can fund from Created OR AwaitingPayment — both paths lead to Funded.
// AwaitingPayment exists for cases where the payer signals intent (link shared)
// before the actual Paystack payment completes.
export const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  [EscrowStatus.Created]:         [EscrowStatus.AwaitingPayment, EscrowStatus.Funded, EscrowStatus.Cancelled],
  [EscrowStatus.AwaitingPayment]: [EscrowStatus.Funded, EscrowStatus.Cancelled],
  [EscrowStatus.Funded]:          [EscrowStatus.Held, EscrowStatus.Refunded],
  [EscrowStatus.Held]: [
    EscrowStatus.AwaitingAction,
    EscrowStatus.Released,
    EscrowStatus.Refunded,
    EscrowStatus.Disputed,
  ],
  [EscrowStatus.AwaitingAction]: [
    EscrowStatus.Released,
    EscrowStatus.Refunded,
    EscrowStatus.Disputed,
  ],
  [EscrowStatus.Released]:  [],
  [EscrowStatus.Refunded]:  [],
  [EscrowStatus.Disputed]:  [EscrowStatus.Released, EscrowStatus.Refunded],
  [EscrowStatus.Cancelled]: [],
}

export function canTransition(from: EscrowStatus, to: EscrowStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
