import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { EscrowStatus, EscrowType } from '../escrow.types'
import type { CreateEscrowInput, CreateQuickEscrowInput } from '../escrow.schema'
import { appendEscrowEvent } from './helpers/escrow-event.helper'
import { env } from '../../../config'

type DbTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)

async function generateUniqueCode(tx: DbTx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const existing = await tx.escrow.findUnique({ where: { code }, select: { id: true } })
    if (!existing) return code
  }
  throw new Error('Failed to generate a unique escrow code after 5 attempts')
}

function paymentLink(code: string): string {
  return `${env.FRONTEND_URL}/e/${code}`
}

function expiresAt(days?: number): Date | undefined {
  if (!days) return undefined
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

// ── Standard ──────────────────────────────────────────────────────────────────

export async function createStandardEscrow(
  tx: DbTx,
  creatorId: string,
  input: Extract<CreateEscrowInput, { type: EscrowType.Standard }>,
) {
  const code = await generateUniqueCode(tx)
  const escrow = await tx.escrow.create({
    data: {
      code,
      title:       input.title,
      description: input.description,
      type:        EscrowType.Standard,
      status:      EscrowStatus.Created,
      amount:      input.amount,
      currency:    input.currency,
      creatorId,
      expiresAt:   expiresAt(input.expiresInDays),
      participants: { create: { userId: creatorId, role: input.creatorRole } },
    },
    include: { milestones: true, participants: true },
  })
  await appendEscrowEvent(tx, escrow.id, 'EscrowCreated', creatorId)
  return { escrow, paymentLink: paymentLink(code) }
}

// ── Milestone ─────────────────────────────────────────────────────────────────

export async function createMilestoneEscrow(
  tx: DbTx,
  creatorId: string,
  input: Extract<CreateEscrowInput, { type: EscrowType.Milestone }>,
) {
  const code = await generateUniqueCode(tx)
  const totalAmount = input.milestones.reduce((sum, m) => sum + m.amount, 0)
  const escrow = await tx.escrow.create({
    data: {
      code,
      title:       input.title,
      description: input.description,
      type:        EscrowType.Milestone,
      status:      EscrowStatus.Created,
      amount:      totalAmount,
      currency:    input.currency,
      creatorId,
      expiresAt:   expiresAt(input.expiresInDays),
      participants: { create: { userId: creatorId, role: input.creatorRole } },
      milestones: {
        create: input.milestones.map((m, i) => ({
          title:       m.title,
          description: m.description,
          amount:      m.amount,
          deadline:    m.deadline ? new Date(m.deadline) : null,
          order:       i + 1,
        })),
      },
    },
    include: { milestones: true, participants: true },
  })
  await appendEscrowEvent(tx, escrow.id, 'EscrowCreated', creatorId)
  return { escrow, paymentLink: paymentLink(code) }
}

// ── Conditional ───────────────────────────────────────────────────────────────

export async function createConditionalEscrow(
  tx: DbTx,
  creatorId: string,
  input: Extract<CreateEscrowInput, { type: EscrowType.Conditional }>,
) {
  const code = await generateUniqueCode(tx)
  const escrow = await tx.escrow.create({
    data: {
      code,
      title:            input.title,
      description:      input.description,
      type:             EscrowType.Conditional,
      status:           EscrowStatus.Created,
      amount:           input.amount,
      currency:         input.currency,
      releaseCondition: input.releaseCondition,
      creatorId,
      expiresAt:        expiresAt(input.expiresInDays),
      participants: { create: { userId: creatorId, role: input.creatorRole } },
    },
    include: { milestones: true, participants: true },
  })
  await appendEscrowEvent(tx, escrow.id, 'EscrowCreated', creatorId)
  return { escrow, paymentLink: paymentLink(code) }
}

// ── Deposit ───────────────────────────────────────────────────────────────────

export async function createDepositEscrow(
  tx: DbTx,
  creatorId: string,
  input: Extract<CreateEscrowInput, { type: EscrowType.Deposit }>,
) {
  const code = await generateUniqueCode(tx)
  const escrow = await tx.escrow.create({
    data: {
      code,
      title:       input.title,
      description: input.description,
      type:        EscrowType.Deposit,
      status:      EscrowStatus.Created,
      amount:      input.amount,
      currency:    input.currency,
      creatorId,
      expiresAt:   expiresAt(input.expiresInDays),
      participants: { create: { userId: creatorId, role: input.creatorRole } },
    },
    include: { milestones: true, participants: true },
  })
  await appendEscrowEvent(tx, escrow.id, 'EscrowCreated', creatorId)
  return { escrow, paymentLink: paymentLink(code) }
}

// ── Quick Link (no auth) ──────────────────────────────────────────────────────
// Always Standard type. Creator identified by name + email only.

export async function createQuickLinkEscrow(tx: DbTx, input: CreateQuickEscrowInput) {
  const code = await generateUniqueCode(tx)
  const escrow = await tx.escrow.create({
    data: {
      code,
      title:       input.title,
      description: input.description,
      type:        EscrowType.Standard,
      status:      EscrowStatus.Created,
      amount:      input.amount,
      currency:    input.currency,
      creatorId:   null,
      isQuickLink: true,
      expiresAt:   new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
      participants: {
        create: {
          userId:        null,
          name:          input.creatorName,
          email:         input.creatorEmail,
          role:          input.creatorRole,
          accountNumber: input.payeeAccount?.accountNumber,
          bankCode:      input.payeeAccount?.bankCode,
          bankName:      input.payeeAccount?.bankName,
          accountName:   input.payeeAccount?.accountName,
        },
      },
    },
    include: { milestones: true, participants: true },
  })
  await appendEscrowEvent(tx, escrow.id, 'EscrowCreated', input.creatorEmail)
  return { escrow, paymentLink: paymentLink(code) }
}
