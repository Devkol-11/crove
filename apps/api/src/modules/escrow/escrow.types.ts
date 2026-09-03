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

// ── State machine ─────────────────────────────────────────────────────────────
//
// Funded is a transient state set by the payment worker the moment a payment
// is confirmed. The worker immediately transitions to Held in the same DB
// transaction, so the escrow never rests in Funded from an application
// perspective. Funded is kept in the enum for audit/ledger purposes.
//
// Refund path requires a dispute first (Held → Disputed → Refunded via
// resolveDispute) or platform review (Held → AwaitingAction → Refunded).
// Neither party can unilaterally refund a funded escrow.
export const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  [EscrowStatus.Created]:         [EscrowStatus.AwaitingPayment, EscrowStatus.Funded, EscrowStatus.Cancelled],
  [EscrowStatus.AwaitingPayment]: [EscrowStatus.Funded, EscrowStatus.Cancelled],
  // Payment worker atomically transitions Funded → Held — no other code moves from Funded
  [EscrowStatus.Funded]:          [EscrowStatus.Held],
  [EscrowStatus.Held]: [
    EscrowStatus.AwaitingAction,
    EscrowStatus.Released,
    EscrowStatus.Disputed,
  ],
  // AwaitingAction = platform review in progress; can resolve either way
  [EscrowStatus.AwaitingAction]: [
    EscrowStatus.Released,
    EscrowStatus.Refunded,
    EscrowStatus.Disputed,
  ],
  [EscrowStatus.Released]:  [],
  [EscrowStatus.Refunded]:  [],
  // Disputed → Released or Refunded via resolveDispute (other party must agree)
  [EscrowStatus.Disputed]:  [EscrowStatus.Released, EscrowStatus.Refunded],
  [EscrowStatus.Cancelled]: [],
}

export function canTransition(from: EscrowStatus, to: EscrowStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
