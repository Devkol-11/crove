// These enums mirror the Prisma schema enums exactly.
// PascalCase values match what Prisma stores in the database.

export enum EscrowType {
  Standard    = 'Standard',
  Milestone   = 'Milestone',
  Conditional = 'Conditional',
  Deposit     = 'Deposit',
}

export enum EscrowStatus {
  Created        = 'Created',
  AwaitingPayment = 'AwaitingPayment',
  Funded         = 'Funded',
  Held           = 'Held',
  AwaitingAction = 'AwaitingAction',
  Released       = 'Released',
  Refunded       = 'Refunded',
  Disputed       = 'Disputed',
  Cancelled      = 'Cancelled',
}

export enum MilestoneStatus {
  Pending    = 'Pending',
  InProgress = 'InProgress',
  Submitted  = 'Submitted',
  Approved   = 'Approved',
  Released   = 'Released',
}

export enum EscrowRole {
  Creator = 'Creator',
  Buyer   = 'Buyer',
  Seller  = 'Seller',
}

// Valid state transitions — the only place this rule lives.
// Enforced in EscrowAggregate.assertCanTransitionTo() and EscrowService.transition().
export const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  [EscrowStatus.Created]:         [EscrowStatus.AwaitingPayment, EscrowStatus.Cancelled],
  [EscrowStatus.AwaitingPayment]: [EscrowStatus.Funded, EscrowStatus.Cancelled],
  [EscrowStatus.Funded]:          [EscrowStatus.Held, EscrowStatus.Refunded],
  [EscrowStatus.Held]:            [EscrowStatus.AwaitingAction, EscrowStatus.Released, EscrowStatus.Refunded, EscrowStatus.Disputed],
  [EscrowStatus.AwaitingAction]:  [EscrowStatus.Released, EscrowStatus.Refunded, EscrowStatus.Disputed],
  [EscrowStatus.Released]:        [],
  [EscrowStatus.Refunded]:        [],
  [EscrowStatus.Disputed]:        [EscrowStatus.Released, EscrowStatus.Refunded],
  [EscrowStatus.Cancelled]:       [],
}

export function canTransition(from: EscrowStatus, to: EscrowStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
