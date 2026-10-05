// Server-side helpers shared by the Google Photos and iNaturalist routes.
// The browser sends its Supabase access token as `Authorization: Bearer <jwt>`.
// OAuth tokens live in public.integration_tokens, which only the service-role
// key can touch (RLS on, no policies).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createError, getHeader, type H3Event } from 'h3'

export type Provider = 'google' | 'inat'
export interface StoredTokens {
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  extra: Record<string, any>
}

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw createError({ statusCode: 500, statusMessage: `Server is missing ${name}` })
  return v
}

/** Service-role client. Never expose this to the browser. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } })
}

/** Verify the caller's Supabase JWT and return their user id. */
export async function requireUserId(event: H3Event): Promise<string> {
  const header = getHeader(event, 'authorization') || ''
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!jwt) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const { data, error } = await adminClient().auth.getUser(jwt)
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: 'Invalid session' })
  return data.user.id
}

export async function getTokens(userId: string, provider: Provider): Promise<StoredTokens | null> {
  const { data, error } = await adminClient()
    .from('integration_tokens')
    .select('access_token, refresh_token, expires_at, extra')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return (data as StoredTokens | null) ?? null
}

export async function saveTokens(userId: string, provider: Provider, t: Partial<StoredTokens>) {
  const { error } = await adminClient()
    .from('integration_tokens')
    .upsert({ user_id: userId, provider, ...t, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
}

export async function deleteTokens(userId: string, provider: Provider) {
  await adminClient().from('integration_tokens').delete().eq('user_id', userId).eq('provider', provider)
}

/** Public origin for OAuth redirect URIs (set APP_ORIGIN in Vercel; falls back to the request host). */
export function appOrigin(event: H3Event): string {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '')
  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host')
  const proto = getHeader(event, 'x-forwarded-proto') || 'http'
  return `${proto}://${host}`
}
