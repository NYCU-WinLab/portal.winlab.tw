import { AuthFinish } from "@/app/auth/finish/_components/auth-finish"

// Tiny landing page after a successful OAuth callback. The callback route
// can't honor `?next=` on its redirect URL (Supabase rejects redirect_to
// with extra query params), so SignInButton stashes the deep link in
// sessionStorage. This page reads it client-side and replaces the URL.
export default function AuthFinishPage() {
  return <AuthFinish />
}
