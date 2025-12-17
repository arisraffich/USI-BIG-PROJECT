import { redirect } from 'next/navigation'

export default async function CharactersRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Redirect old /characters route to main page with search param
  redirect(`/admin/project/${id}?tab=characters`)
}










