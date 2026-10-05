// Calls our own Nitro server routes with the user's Supabase JWT attached.
export async function apiFetch<T = any>(path: string, opts: Record<string, any> = {}): Promise<T> {
  const sb = useSupabaseClient()
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in on the Settings page first')
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You are offline')
  return $fetch<T>(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } })
}
