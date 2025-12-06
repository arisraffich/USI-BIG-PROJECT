'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteAllProjects(formData: FormData) {
    const supabase = await createAdminClient()

    // First, get all project IDs
    const { data: projects } = await supabase.from('projects').select('id')

    if (!projects || projects.length === 0) {
        return
    }

    // Delete all
    const { error } = await supabase
        .from('projects')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Catch-all to delete everything

    if (error) {
        console.error('Delete All Error:', error)
        throw new Error(error.message)
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/')
}
