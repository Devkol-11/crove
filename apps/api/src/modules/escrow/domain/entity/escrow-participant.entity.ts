import type { EscrowParticipant } from '@prisma/client'
import { Entity } from '../../../../shared/base/Entity'
import { EscrowRole } from '../../escrow.types'

export class EscrowParticipantEntity extends Entity<string> {
  private constructor(private readonly props: EscrowParticipant) {
    super(props.id)
  }

  static from(data: EscrowParticipant): EscrowParticipantEntity {
    return new EscrowParticipantEntity(data)
  }

  get userId(): string | null {
    return this.props.userId
  }
  get name(): string | null {
    return this.props.name
  }
  get email(): string | null {
    return this.props.email
  }
  get role(): EscrowRole {
    return this.props.role as EscrowRole
  }
  get escrowId(): string {
    return this.props.escrowId
  }

  isPayer(): boolean {
    return this.role === EscrowRole.Payer
  }

  isPayee(): boolean {
    return this.role === EscrowRole.Payee
  }

  // Payers deposit funds; payees cannot fund their own escrow
  canFund(): boolean {
    return this.isPayer()
  }

  // Payers confirm delivery and approve payout
  canApproveDelivery(): boolean {
    return this.isPayer()
  }

  // Payees mark work as submitted for payer review
  canSubmitWork(): boolean {
    return this.isPayee()
  }
}
