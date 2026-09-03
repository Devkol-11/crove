import type { EscrowDispute } from '@prisma/client'
import { Entity } from '../../../../shared/base/Entity'
import { DisputeStatus } from '../../escrow.types'
import { DisputeInvalidTransitionError, DisputeOwnershipError } from '../errors/dispute.errors'

export class EscrowDisputeEntity extends Entity<string> {
  private constructor(private readonly props: EscrowDispute) {
    super(props.id)
  }

  static from(data: EscrowDispute): EscrowDisputeEntity {
    return new EscrowDisputeEntity(data)
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get escrowId(): string {
    return this.props.escrowId
  }
  get raisedById(): string {
    return this.props.raisedById
  }
  get reason(): string {
    return this.props.reason
  }
  get status(): DisputeStatus {
    return this.props.status as DisputeStatus
  }
  get resolution(): string | null {
    return this.props.resolution
  }
  get resolvedAt(): Date | null {
    return this.props.resolvedAt
  }
  get createdAt(): Date {
    return this.props.createdAt
  }

  // ── Status predicates ────────────────────────────────────────────────────

  isOpen(): boolean {
    return this.status === DisputeStatus.Open
  }
  isUnderReview(): boolean {
    return this.status === DisputeStatus.UnderReview
  }
  isResolved(): boolean {
    return this.status === DisputeStatus.Resolved
  }
  isClosed(): boolean {
    return this.status === DisputeStatus.Closed
  }

  // A dispute is "active" while it can still be acted on
  isActive(): boolean {
    return this.isOpen() || this.isUnderReview()
  }

  assertCanMarkUnderReview(): void {
    if (!this.isOpen()) {
      throw new DisputeInvalidTransitionError(
        `Dispute cannot move to UnderReview from '${this.status}'. It must be Open first.`,
      )
    }
  }

  assertCanResolve(): void {
    if (!this.isOpen() && !this.isUnderReview()) {
      throw new DisputeInvalidTransitionError(
        `Dispute cannot be resolved from '${this.status}'. It must be Open or UnderReview.`,
      )
    }
  }

  assertCanClose(): void {
    if (!this.isResolved()) {
      throw new DisputeInvalidTransitionError(
        `Dispute cannot be closed from '${this.status}'. Resolve it before closing.`,
      )
    }
  }

  // Ensures only the party who raised the dispute can take owner-only actions.
  assertIsRaisedBy(userId: string): void {
    if (this.raisedById !== userId) {
      throw new DisputeOwnershipError(
        'Only the user who raised this dispute can perform this action.',
      )
    }
  }
}
