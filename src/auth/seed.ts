import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { account, createDb, user } from '#db'

import { auth } from './index'

function requiredEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

async function main() {
  const db = createDb()
  const seedUser = {
    email: requiredEnv('INITIAL_ADMIN_EMAIL'),
    password: requiredEnv('INITIAL_ADMIN_PASSWORD'),
    name: process.env.INITIAL_ADMIN_NAME ?? 'Admin',
    role: 'admin',
  } as const

  const existingUser = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, seedUser.email),
  })

  if (!existingUser) {
    const result = await auth.api.createUser({
      body: seedUser,
    })

    console.log(`Created admin user ${result.user.email}`)
    return
  }

  const now = new Date()
  const password = await hashPassword(seedUser.password)

  await db
    .update(user)
    .set({
      name: seedUser.name,
      role: seedUser.role,
      banned: false,
      banReason: null,
      banExpires: null,
      updatedAt: now,
    })
    .where(eq(user.id, existingUser.id))

  const existingCredentialAccount = await db.query.account.findFirst({
    where: (table, { and, eq }) =>
      and(eq(table.userId, existingUser.id), eq(table.providerId, 'credential')),
  })

  if (existingCredentialAccount) {
    await db
      .update(account)
      .set({
        accountId: existingUser.id,
        password,
        updatedAt: now,
      })
      .where(eq(account.id, existingCredentialAccount.id))
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: existingUser.id,
      providerId: 'credential',
      userId: existingUser.id,
      password,
      createdAt: now,
      updatedAt: now,
    })
  }

  console.log(`Updated admin user ${seedUser.email} and reset password`)
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
