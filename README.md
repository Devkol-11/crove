# Crove — Escrow Platform

A trust-layer for digital transactions. Crove holds funds securely between two parties and releases them only when agreed conditions are met.

Built as a **pnpm monorepo** with a Fastify API backend, PostgreSQL database, Redis-backed job queues, and a Partial DDD architecture.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Domain Model](#domain-model)
- [Escrow State Machine](#escrow-state-machine)
- [DDD Layer Design](#ddd-layer-design)
- [API Routes](#api-routes)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts Reference](#scripts-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (apps/web)                        │
│                    React / Next.js (TBD)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / REST
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API  (apps/api)                           │
│                                                                 │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │
│   │   Fastify   │   │ Better Auth │   │   Fastify Plugins   │  │
│   │   Routes    │   │ /api/auth/* │   │  db · redis · auth  │  │
│   └──────┬──────┘   └──────┬──────┘   └─────────────────────┘  │
│          │                 │                                     │
│   ┌──────▼─────────────────▼──────────────────────────────┐    │
│   │                  Module Layer                          │    │
│   │                                                        │    │
│   │  ┌──────────┐   ┌──────────────┐   ┌───────────────┐  │    │
│   │  │  /auth   │   │   /escrow    │   │    /users     │  │    │
│   │  │controller│   │  controller  │   │  controller   │  │    │
│   │  │ service  │   │   service    │   │   service     │  │    │
│   │  └────┬─────┘   └──────┬───────┘   └──────┬────────┘  │    │
│   │       │                │                  │            │    │
│   │  ┌────▼────────────────▼──────────────────▼────────┐  │    │
│   │  │                 Domain Layer                     │  │    │
│   │  │   Entities · Aggregates · Value Objects          │  │    │
│   │  │   Domain Events · Business Rules                 │  │    │
│   │  └──────────────────────┬───────────────────────────┘  │    │
│   └─────────────────────────┼──────────────────────────────┘    │
│                             │                                    │
│   ┌─────────────────────────▼──────────────────────────────┐    │
│   │              Infrastructure Layer                       │    │
│   │                                                         │    │
│   │   ┌──────────────────┐      ┌──────────────────────┐   │    │
│   │   │  Prisma ORM (v7) │      │  BullMQ + Redis      │   │    │
│   │   │  PrismaPg adapter│      │  notifications queue │   │    │
│   │   │  PostgreSQL 16   │      │  escrow queue        │   │    │
│   │   └──────────────────┘      └──────────────────────┘   │    │
│   └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
crove/
├── apps/
│   ├── api/                          # Fastify backend
│   │   ├── prisma/
│   │   │   └── schema.prisma         # Database schema
│   │   ├── prisma.config.ts          # Prisma 7 migrate config
│   │   ├── src/
│   │   │   ├── app.ts                # Fastify app builder
│   │   │   ├── index.ts              # Entry point, queue bootstrap
│   │   │   ├── config/
│   │   │   │   └── index.ts          # Zod env validation
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts           # Better Auth instance + hooks
│   │   │   │   ├── prisma.ts         # PrismaClient singleton
│   │   │   │   └── event-dispatcher.ts # Domain event dispatch seam
│   │   │   ├── plugins/
│   │   │   │   ├── db.plugin.ts      # Decorates app.db
│   │   │   │   ├── redis.plugin.ts   # Decorates app.redis
│   │   │   │   ├── auth.plugin.ts    # Decorates app.authenticate
│   │   │   │   └── sensible.plugin.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── entity/   auth-user.entity.ts
│   │   │   │   │   │   ├── events/   user-registered · email-verified
│   │   │   │   │   │   └── value-object/ email.vo · user-id.vo
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   └── auth.schema.ts
│   │   │   │   ├── escrow/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── entity/   escrow.aggregate · milestone · participant
│   │   │   │   │   │   ├── events/   created · funded · released · milestone-*
│   │   │   │   │   │   └── value-object/ money.vo · escrow-code.vo
│   │   │   │   │   ├── milestones/   milestone.service · milestone.schema
│   │   │   │   │   ├── escrow.controller.ts
│   │   │   │   │   ├── escrow.service.ts
│   │   │   │   │   ├── escrow.types.ts   # Enums + state machine
│   │   │   │   │   └── escrow.schema.ts
│   │   │   │   └── users/
│   │   │   │       ├── domain/
│   │   │   │       │   ├── entity/   user-profile.entity.ts
│   │   │   │       │   ├── events/   profile-updated.event.ts
│   │   │   │       │   └── value-object/ phone-number.vo.ts
│   │   │   │       ├── users.controller.ts
│   │   │   │       ├── users.service.ts
│   │   │   │       └── users.schema.ts
│   │   │   ├── queues/
│   │   │   │   ├── index.ts              # Queue factory
│   │   │   │   └── workers/
│   │   │   │       ├── notifications.worker.ts
│   │   │   │       └── escrow.worker.ts
│   │   │   ├── shared/
│   │   │   │   └── base/
│   │   │   │       ├── Entity.ts         # Identity equality
│   │   │   │       ├── AggregateRoot.ts  # + domain event collection
│   │   │   │       ├── ValueObject.ts    # Value equality, immutable
│   │   │   │       └── DomainEvent.ts    # Event interface
│   │   │   └── types/
│   │   │       └── index.ts              # Fastify augmentations
│   │   └── package.json
│   └── web/                          # Frontend (TBD)
├── packages/
│   └── shared/                       # Shared types/utilities
├── docker-compose.yml                # PostgreSQL 16 + Redis 7
├── pnpm-workspace.yaml
└── package.json                      # Root scripts
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.5 |
| Framework | Fastify 4 |
| Authentication | Better Auth 1.0 |
| ORM | Prisma 7 (adapter-pg) |
| Database | PostgreSQL 16 |
| Job Queue | BullMQ 5 + Redis 7 |
| Validation | Zod 3 |
| Logging | Pino (pino-pretty in dev) |
| Package Manager | pnpm workspaces |
| Infrastructure | Docker Compose |
| Testing | Vitest |

---

## Domain Model

```
┌────────────────────────────────────────────────────────────────┐
│                          User                                  │
│  id · email · firstName · lastName · phone · image             │
│                                                                │
│  (Better Auth fields: name · emailVerified)                    │
│  (Better Auth relations: sessions[] · accounts[])              │
└──────────────────────────┬─────────────────────────────────────┘
                           │ creatorId
                           │ 1
                           ▼ N
┌────────────────────────────────────────────────────────────────┐
│                         Escrow                                 │
│  id · code(unique) · title · description                       │
│  type: Standard | Milestone | Conditional | Deposit            │
│  status: (see state machine below)                             │
│  amount · currency · releaseCondition                          │
│  fundedAt · releasedAt                                         │
└──┬─────────────┬──────────────┬──────────────┬────────────────┘
   │             │              │              │
   │ N           │ N            │ N            │ N
   ▼             ▼              ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Milestone│ │Participant│ │Transaction│ │  EscrowEvent │
│          │ │          │ │          │ │  (audit log) │
│ title    │ │ userId   │ │ type     │ │  type · actor│
│ amount   │ │ email    │ │ amount   │ └──────────────┘
│ status   │ │ role:    │ │ reference│
│ order    │ │ Creator  │ │ provider │    ┌──────────────┐
│ deadline │ │ Buyer    │ │ status   │    │   Dispute    │
└──────────┘ │ Seller   │ └──────────┘    │              │
             └──────────┘                 │ reason       │
                                          │ status       │
                                          │ resolution   │
                                          └──────────────┘
```

---

## Escrow State Machine

Every status change is validated against this table before any database write.
The `EscrowAggregate.assertCanTransitionTo()` method enforces it — a failed check
throws a domain error that Fastify returns as a `400 Bad Request`.

```
                     ┌───────────┐
             ─ ─ ─ ─▶│  Created  │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
            │         └─────┬─────┘
                            │                                       │
            │               ▼
                    ┌───────────────┐                           ┌───────────┐
            │       │AwaitingPayment│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│ Cancelled │
                    └───────┬───────┘                           └───────────┘
            │               │ payment confirmed
                            ▼
            │          ┌────────┐
                       │ Funded │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
            │          └────┬───┘
                            │ conditions verified               │
            │               ▼
                        ┌──────┐                          ┌──────────┐
            │           │ Held │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▶│ Refunded │
                        └──┬───┘                          └──────────┘
            │              │
                    ┌───────▼──────┐
            │       │AwaitingAction│
                    └───────┬──────┘
            │               │
              ┌─────────────┼──────────────┐
            │ │             │              │
              ▼             ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Released │  │ Refunded │  │ Disputed │
        │ (final)  │  │ (final)  │  └─────┬────┘
        └──────────┘  └──────────┘        │
                                   ┌──────┴──────┐
                                   ▼             ▼
                              ┌─────────┐  ┌──────────┐
                              │Released │  │ Refunded │
                              └─────────┘  └──────────┘
```

**Transition table:**

| From | To (allowed) |
|---|---|
| `Created` | `AwaitingPayment`, `Cancelled` |
| `AwaitingPayment` | `Funded`, `Cancelled` |
| `Funded` | `Held`, `Refunded` |
| `Held` | `AwaitingAction`, `Released`, `Refunded`, `Disputed` |
| `AwaitingAction` | `Released`, `Refunded`, `Disputed` |
| `Disputed` | `Released`, `Refunded` |
| `Released` | *(terminal)* |
| `Refunded` | *(terminal)* |
| `Cancelled` | *(terminal)* |

---

## DDD Layer Design

Crove uses **Partial DDD** — domain logic lives in entities and aggregates, but Prisma controls all persistence directly (no repository abstraction).

### Base Classes

```
shared/base/
│
├── Entity<TId>
│     └── Identity equality (same id = same entity)
│         Protected _id · public id getter · equals()
│
├── AggregateRoot<TId>  extends Entity
│     └── Collects domain events internally
│         addDomainEvent() (protected) · domainEvents · clearDomainEvents()
│
├── ValueObject<TProps>
│     └── Value equality (same props = same object)
│         Immutable (Object.freeze) · equals() by JSON comparison
│
└── DomainEvent (interface)
      eventType · aggregateId · aggregateType · occurredAt
```

### The Service → Aggregate → Event Pattern

Every state-changing operation follows this 7-step pattern (see `escrow.service.ts`):

```
1. Load from DB          db.escrow.findUnique({ include: { participants } })
        │
        ▼
2. Wrap in aggregate     EscrowAggregate.from(data)
        │
        ▼
3. Validate transition   escrow.assertCanTransitionTo(toStatus)
        │                  └── throws domain error → Fastify 400
        ▼
4. Authorise actor       escrow.isParticipant(actorId)
        │                  └── throws → Fastify 403
        ▼
5. Execute command       escrow.fund(actorId)
        │                  └── adds EscrowFundedEvent to internal list
        ▼
6. Persist               db.escrow.update({ status, fundedAt, events: { create } })
        │
        ▼
7. Dispatch events       eventDispatcher.dispatchMany(escrow.domainEvents)
                           └── today: logs. later: BullMQ queue.add()
```

### Value Objects

Value objects self-validate on construction — invalid data never enters the domain:

| Value Object | Module | Rule enforced |
|---|---|---|
| `Email` | auth | RFC-compliant email format |
| `UserId` | auth | Non-empty string |
| `PhoneNumber` | users | Nigerian E.164 (+234...) |
| `Money` | escrow | Amount > 0, same-currency arithmetic |
| `EscrowCode` | escrow | 6-char uppercase alphanumeric |

### Domain Events

Events are raised inside aggregate commands and dispatched after the DB write.
The `EventDispatcher` is a single seam — swap the implementation (logs → BullMQ) without touching any domain code.

| Event | Raised by |
|---|---|
| `UserRegisteredEvent` | Better Auth `databaseHook` on user create |
| `EmailVerifiedEvent` | Better Auth `databaseHook` on user update |
| `ProfileUpdatedEvent` | `UsersService.updateProfile()` |
| `EscrowCreatedEvent` | `EscrowAggregate.raiseCreatedEvent()` |
| `EscrowFundedEvent` | `EscrowAggregate.fund()` |
| `EscrowReleasedEvent` | `EscrowAggregate.release()` |
| `MilestoneSubmittedEvent` | `MilestoneEntity.submit()` |
| `MilestoneApprovedEvent` | `MilestoneEntity.approve()` |

---

## API Routes

### Auth — handled entirely by Better Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | Register with email + password |
| `POST` | `/api/auth/sign-in/email` | Login |
| `POST` | `/api/auth/sign-out` | Logout |
| `GET` | `/api/auth/session` | Get current session |

### Users — requires authentication

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users/profile` | Get authenticated user's profile |
| `PATCH` | `/api/users/profile` | Update firstName, lastName, phone |

### Escrow

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/escrow/:code/public` | None | Public escrow view (for payment link recipients) |
| `GET` | `/api/escrow` | Required | List all escrows the user participates in |
| `POST` | `/api/escrow` | Required | Create a new escrow |
| `GET` | `/api/escrow/:code` | Required | Full authenticated escrow view |
| `POST` | `/api/escrow/:id/transition` | Required | Trigger a state change |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server health check |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/Devkol-11/crove.git
cd crove
pnpm install
```

### 2. Install adapter packages

```bash
pnpm --filter api add @prisma/adapter-pg pg
```

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and fill in the values (see [Environment Variables](#environment-variables) below).

### 4. Start Docker services

```bash
pnpm docker:up
```

Wait for the healthchecks to pass — Postgres and Redis must be healthy before migrating.

### 5. Generate Prisma client and run migrations

```bash
pnpm db:generate
pnpm db:migrate
# When prompted for a migration name, type: init
```

### 6. Start the API

```bash
pnpm dev:api
```

The API will be available at `http://localhost:3001`.

---

## Environment Variables

Create `apps/api/.env` from the example:

```env
# Application
NODE_ENV=development
PORT=3001

# Database (match docker-compose.yml credentials)
DATABASE_URL=postgresql://crove:crove_secret@localhost:5432/crove_db

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=7d

# CORS — frontend origin
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=info
```

---

## Scripts Reference

Run all scripts from the **project root** unless noted.

| Script | Command | Description |
|---|---|---|
| Start API (dev) | `pnpm dev:api` | tsx watch — auto-restarts on changes |
| Build API | `pnpm build:api` | tsup → `apps/api/dist/` |
| Start Docker | `pnpm docker:up` | Start Postgres + Redis containers |
| Stop Docker | `pnpm docker:down` | Stop containers (data persisted in volumes) |
| Generate Prisma | `pnpm db:generate` | Regenerate `@prisma/client` types |
| Run migrations | `pnpm db:migrate` | Apply pending migrations to DB |
| Prisma Studio | `pnpm db:studio` | Open visual DB browser at localhost:5555 |
| Run tests | `pnpm --filter api test` | Vitest (run from root) |

---

## Roadmap

- [ ] Paystack payment integration (`fund()` command flow)
- [ ] Milestone submit / approve endpoints
- [ ] BullMQ notification workers (email, in-app)
- [ ] Dispute resolution workflow
- [ ] Frontend (apps/web) — React / Next.js
- [ ] OAuth providers (Google, GitHub) via Better Auth
- [ ] Admin dashboard
