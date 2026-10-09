import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Loader2, LogIn, RefreshCw } from "lucide-react";

import { getAuthConfig, login, register } from "../api/auth";
import type { TokenResponse } from "../api/auth";
import EmailCodeSignIn from "../components/EmailCodeSignIn";
import { getInvitePath } from "../api/client";
import { setToken } from "../lib/storage";
import { useUiStore } from "../store/uiStore";

interface Props {
  mode: "login" | "register";
}

export default function AuthPage({ mode }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const next = getInvitePath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";
  const config = useQuery({ queryKey: ["auth-config"], queryFn: getAuthConfig, retry: false, staleTime: 0, gcTime: 0 });

  function authenticated(response: TokenResponse) {
    setToken(response.access_token);
    queryClient.clear();
    useUiStore.getState().resetPersonalNavigation();
    localStorage.removeItem("zenos_team");
    navigate(next ?? "/", { replace: true, state: next ? { joinAfterSignIn: true } : null });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || config.data?.method !== "password") return;
    setError(null);
    setLoading(true);
    try {
      const response = isRegister ? await register(email, password) : await login(email, password);
      authenticated(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ccfbf1,transparent_32%),linear-gradient(135deg,#f8fafc,#f1f5f9_48%,#ecfeff)] px-5 py-8 dark:bg-none dark:bg-slate-950">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-3 rounded-md border border-slate-200 bg-white/80 px-4 py-3 shadow-soft dark:border-slate-800 dark:bg-slate-900/80">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-teal-600 text-white">
              <BrainCircuit size={22} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal text-slate-950 dark:text-white">zenOS</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">A shared workspace for teams that build.</p>
            </div>
          </div>
          <div className="hidden max-w-2xl lg:block">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">A simple place to work together.</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-tight text-slate-950 dark:text-white md:text-6xl">
              Less chasing updates. More getting things done.
            </h2>
          </div>
        </div>

        {config.isPending ? <section className="surface flex min-h-64 items-center justify-center gap-3 rounded-2xl p-6 text-sm text-slate-500 dark:text-slate-400" role="status"><Loader2 size={20} className="animate-spin" />Getting sign-in ready…</section>
          : config.isError ? <section className="surface rounded-2xl p-6 sm:p-8"><h2 className="text-2xl font-bold text-slate-950 dark:text-white">Sign-in is unavailable</h2><p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400" role="alert">We couldn't load sign-in settings. Please try again.</p><button className="primary-button mt-5" type="button" disabled={config.isFetching} onClick={() => void config.refetch()}>{config.isFetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}{config.isFetching ? "Checking…" : "Try again"}</button></section>
          : config.data.method === "email_otp" ? <EmailCodeSignIn next={next} onAuthenticated={authenticated} />
          : config.data.method === "password" ? <form onSubmit={onSubmit} className="surface rounded-lg p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
              {isRegister ? "Create your account" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {next
                ? "Sign in or create an account to join the space you were invited to. Your invitation is saved."
                : isRegister
                ? "After signing up, create a space or open an invitation link."
                : "See what needs doing and pick up where you left off."}
            </p>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Email
              <input
                className="soft-input mt-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Password
              <input
                className="soft-input mt-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isRegister ? 8 : undefined}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          <button className="primary-button mt-6 w-full" disabled={loading} type="submit">
            <LogIn size={17} />
            {loading ? "Working..." : isRegister ? "Create account" : "Log in"}
          </button>
          <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            {isRegister ? "Already have an account?" : "New to zenOS?"}{" "}
            <Link className="font-semibold text-teal-700 dark:text-teal-300" to={`${isRegister ? "/login" : "/register"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
              {isRegister ? "Log in" : "Create an account"}
            </Link>
          </p>
        </form> : null}
      </section>
    </main>
  );
}
