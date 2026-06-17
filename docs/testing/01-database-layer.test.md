# Unit Test Spec: Database Layer (Prisma & MySQL)

## 🎯 Goal
Ensure the database layer is correctly configured with Prisma, can connect to the MySQL database, and can perform basic CRUD operations on our core entities (`users`, `channels`, `messages`).

## 📁 Files to Create/Test
- `lib/db/prisma.ts` (Prisma Client Singleton)
- `lib/db/users.ts` (User operations)
- `lib/db/channels.ts` (Channel operations)
- `lib/db/messages.ts` (Message operations)

## 🧪 Test Cases (`__tests__/unit/lib/db/`)

### 1. Prisma Client Singleton (`prisma.test.ts`)
| Test Case | Expected Behavior |
|-----------|-------------------|
| Initialization | Should create a single instance of PrismaClient. |
| Re-use in dev | Should attach to `globalThis` in non-production environments to prevent connection limit exhaustion during hot reloading. |

### 2. Users Operations (`users.test.ts`)
| Test Case | Expected Behavior | Mock DB State |
|-----------|-------------------|---------------|
| `createUser` (Success) | Should insert a new user and return the user object. | Empty |
| `createUser` (Duplicate) | Should throw a structured error when email already exists. | User with email exists |
| `getUserById` (Exists) | Should return the user object. | User exists |
| `getUserById` (Not Found) | Should return `null`. | User does not exist |

### 3. Channels Operations (`channels.test.ts`)
| Test Case | Expected Behavior | Mock DB State |
|-----------|-------------------|---------------|
| `createChannel` (Success) | Should insert a new channel linked to a user. | User exists |
| `getChannelsByUserId` | Should return an array of channels for the given user. | User has 2 channels |
| `updateChannelToken` | Should update the access token and expiry date. | Channel exists |
| `deleteChannel` | Should delete the channel and return the deleted object. | Channel exists |

### 4. Messages Operations (`messages.test.ts`)
| Test Case | Expected Behavior | Mock DB State |
|-----------|-------------------|---------------|
| `createMessage` (Success) | Should insert a new message linked to a channel. | Channel exists |
| `createMessage` (Duplicate) | Should throw or handle duplicate `platform_message_id`. | Message with ID exists |
| `getMessagesByChannelId` | Should return paginated messages, ordered by `platform_created_at` DESC. | Channel has 15 msgs |
| `updateMessageStatus` | Should update status (e.g., 'open' -> 'resolved'). | Message exists |

## 🛠️ Setup Instructions (Next Steps)
1. Initialize Prisma: `npx prisma init`
2. Update `.env` with MySQL connection string.
3. Define the schema in `prisma/schema.prisma` (based on `README.md`).
4. Generate Prisma client: `npx prisma generate`
5. Write the mock configuration (`__tests__/mocks/prisma.ts`).
6. Write the unit tests based on this spec.

**Should we proceed with setting up Prisma and writing these initial tests?** And to confirm your earlier prompt, the core domain is the **Social Media Management Platform (Carapal360)**, correct?
