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
  get email(): string | null {
    return this.props.email
  }
  get role(): EscrowRole {
    return this.props.role as EscrowRole
  }
  get escrowId(): string {
    return this.props.escrowId
  }

  isCreator(): boolean {
    return this.role === EscrowRole.Creator
  }
  isBuyer(): boolean {
    return this.role === EscrowRole.Buyer
  }
  isSeller(): boolean {
    return this.role === EscrowRole.Seller
  }

  // Buyers fund the escrow; sellers cannot
  canFund(): boolean {
    return this.isBuyer() || this.isCreator()
  }

  // Buyers confirm delivery; sellers cannot approve their own work
  canApproveDelivery(): boolean {
    return this.isBuyer() || this.isCreator()
  }

  // Sellers mark work as submitted
  canSubmitWork(): boolean {
    return this.isSeller()
  }
}
