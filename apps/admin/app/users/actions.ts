'use server'

import { revalidatePath } from 'next/cache'
import { adminFetch } from '../../lib/api'

export async function deleteUserAction(id: number): Promise<void> {
  await adminFetch(`/v1/admin/users/${id}`, { method: 'DELETE' })
  revalidatePath('/users')
}
