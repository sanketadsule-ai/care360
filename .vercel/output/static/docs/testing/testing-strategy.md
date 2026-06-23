# Testing Strategy — Carapal360

## Overview

We follow **Test-Driven Development (TDD)** — every feature has test specs written BEFORE implementation code. This document is the master testing guide.

## Test Structure

```
__tests__/
├── unit/              # Isolated function/component tests
│   ├── lib/           # Business logic tests
│   └── components/    # UI component tests
├── integration/       # Multi-layer tests (API → DB → response)
│   ├── api/           # Route handler tests
│   └── pages/         # SSR page rendering tests
└── mocks/             # Shared mock data & handlers
```

## Testing Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Jest | ^29.x | Test runner, assertions, mocking |
| @testing-library/react | ^16.x | Component rendering & queries |
| @testing-library/jest-dom | ^6.x | Custom DOM matchers |
| msw | ^2.x | Mock Service Worker for API mocking |
| @prisma/client (mock) | ^6.x | Database layer mocking |
| ts-jest | ^29.x | TypeScript support in Jest |

## Mock Strategy

### Database (Prisma)
- **Never hit real DB in tests.** Use `jest.mock('@prisma/client')` with a singleton mock.
- Mock file: `__tests__/mocks/prisma.ts`
- Each DB function test mocks the specific Prisma method it calls.

### Facebook Graph API
- **Never hit real Facebook API in tests.** Use MSW to intercept HTTP requests.
- Mock file: `__tests__/mocks/facebook.ts` (response fixtures)
- Mock file: `__tests__/mocks/handlers.ts` (MSW request handlers)

### Example Pattern
```typescript
// __tests__/mocks/prisma.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});
```

## Naming Conventions

- Test files: `{module-name}.test.ts` or `{Component}.test.tsx`
- Describe blocks: `describe('{ModuleName}', () => { ... })`
- Test names: `it('should {expected behavior} when {condition}', () => { ... })`

## Coverage Requirements

| Layer | Minimum | Target |
|-------|---------|--------|
| `lib/utils/` | 95% | 100% |
| `lib/db/` | 85% | 95% |
| `lib/facebook/` | 80% | 90% |
| `app/api/` | 80% | 90% |
| `components/` | 75% | 85% |
| **Overall** | **80%** | **90%** |

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test file
npx jest __tests__/unit/lib/db/channels.test.ts

# Run in watch mode during development
npx jest --watch

# Run only failing tests
npx jest --onlyFailures
```

## Feature Test Spec Files

Each feature has a corresponding `.test.md` file in `docs/testing/` that defines:
1. What the feature does
2. All test cases (happy path + edge cases)
3. Mock data requirements
4. Expected assertions

These specs are written FIRST, before any implementation code.

| Order | File | Feature |
|-------|------|---------|
| 01 | [01-database-layer.test.md](./01-database-layer.test.md) | Prisma client, CRUD operations |
| 02 | [02-facebook-api.test.md](./02-facebook-api.test.md) | Facebook OAuth, Graph API client |
| 03 | [03-api-routes.test.md](./03-api-routes.test.md) | All API route handlers |
| 04 | [04-components.test.md](./04-components.test.md) | UI components |
| 05 | [05-pages-ssr.test.md](./05-pages-ssr.test.md) | SSR pages |
