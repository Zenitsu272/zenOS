import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";

import { requestEmailCode, verifyEmailCode } from "../api/auth";
import type { TokenResponse } from "../api/auth";
import { ApiError } from "../api/client";

interface Props {
  next: string | null;
  onAuthenticated: (response: TokenResponse) => void;
}

type Cooldown = { send: number; verify: number };

const countdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const codeDigits = (value: string) => value.replace(/\D/g, "").slice(0, 6);
const errorMessage = (cause: unknown, fallback: string) => cause instanceof TypeError
  ? "We couldn't reach zenOS. Check your connection and try again."
  : cause instanceof Error ? cause.message : fallback;

export default function EmailCodeSignIn({ next, onAuthenticated }: Props) {
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "resend" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [invalidCode, setInvalidCode] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [cooldowns, setCooldowns] = useState<Record<string, Cooldown>>({});
  const [now, setNow] = useState(Date.now());
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const requestInFlight = useRef(false);
  const mounted = useRef(false);
  const activeEmail = sentEmail ?? email.trim().toLowerCase();
  const sendAvailableAt = cooldowns[activeEmail]?.send ?? 0;
  const verifyAvailableAt = cooldowns[activeEmail]?.verify ?? 0;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (sentEmail) codeInput.current?.focus();
    else emailInput.current?.focus();
  }, [sentEmail]);

  useEffect(() => {
    setNow(Date.now());
    if (!expiresAt && !sendAvailableAt && !verifyAvailableAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, sendAvailableAt, verifyAvailableAt]);

  const remaining = (deadline: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
  const sendWait = remaining(sendAvailableAt);
  const verifyWait = remaining(verifyAvailableAt);
  const expiresIn = remaining(expiresAt);
  const expired = !!sentEmail && expiresAt > 0 && expiresIn === 0;

  function rememberCooldown(destination: string, action: keyof Cooldown, deadline: number) {
    setCooldowns((previous) => ({
      ...previous,
      [destination]: { ...(previous[destination] ?? { send: 0, verify: 0 }), [action]: deadline },
    }));
  }

  function applyCooldown(cause: unknown, action: keyof Cooldown, destination: string) {
    if (!(cause instanceof ApiError)) return;
    const seconds = cause.retryAfterSeconds ?? (cause.status === 429 ? 60 : null);
    if (seconds === null) return;
    const current = Date.now();
    setNow(current);
    rememberCooldown(destination, action, current + seconds * 1000);
  }

  async function sendCode(resend = false) {
    if (requestInFlight.current || sendAvailableAt > Date.now()) return;
    const destination = resend ? sentEmail : email.trim().toLowerCase();
    if (!destination) return;
    requestInFlight.current = true;
    setBusy(resend ? "resend" : "send");
    setError("");
    setFeedback("");
    setInvalidCode(false);
    try {
      const response = await requestEmailCode(destination);
      if (!mounted.current) return;
      const current = Date.now();
      const validity = Number.isFinite(response.expires_in) && response.expires_in > 0 ? response.expires_in : 600;
      const cooldown = Number.isFinite(response.resend_after) && response.resend_after >= 0 ? response.resend_after : 60;
      setNow(current);
      setEmail(destination);
      setSentEmail(destination);
      setExpiresAt(current + validity * 1000);
      rememberCooldown(destination, "send", current + cooldown * 1000);
      setCode("");
      if (resend) setFeedback("A new code was sent. Use the latest email.");
      window.setTimeout(() => codeInput.current?.focus(), 0);
    } catch (cause) {
      if (!mounted.current) return;
      setError(errorMessage(cause, "We couldn't send your code. Please try again."));
      applyCooldown(cause, "send", destination);
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current || !sentEmail || verifyAvailableAt > Date.now()) return;
    if (expiresAt > 0 && expiresAt <= Date.now()) { setNow(Date.now()); setError("This code has expired. Request a new code below."); return; }
    if (!/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your email."); setInvalidCode(true); codeInput.current?.focus(); return; }
    requestInFlight.current = true;
    setBusy("verify");
    setError("");
    setFeedback("");
    setInvalidCode(false);
    try {
      const response = await verifyEmailCode(sentEmail, code);
      if (!mounted.current) return;
      onAuthenticated(response);
    } catch (cause) {
      if (!mounted.current) return;
      setError(errorMessage(cause, "We couldn't check your code. Please try again."));
      setInvalidCode(cause instanceof ApiError && (cause.status === 400 || cause.status === 422));
      applyCooldown(cause, "verify", sentEmail);
      window.setTimeout(() => { codeInput.current?.focus(); codeInput.current?.select(); }, 0);
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function changeEmail() {
    if (busy) return;
    setSentEmail(null);
    setCode("");
    setExpiresAt(0);
    setError("");
    setFeedback("");
    setInvalidCode(false);
  }

  function useExistingCode() {
    if (busy || !emailInput.current?.reportValidity()) return;
    const destination = email.trim().toLowerCase();
    if (!destination) return;
    setEmail(destination);
    setSentEmail(destination);
    setCode("");
    setExpiresAt(0);
    setError("");
    setFeedback("");
    setInvalidCode(false);
  }

  return <section className="surface rounded-2xl p-6 sm:p-8" aria-label="Sign in with email">
    <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">{sentEmail ? <ShieldCheck size={25} /> : <Mail size={25} />}</span>
    <h2 className="text-2xl font-bold text-slate-950 dark:text-white">{sentEmail ? "Check your email" : "Welcome to zenOS"}</h2>
    {sentEmail ? <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Enter the six-digit code sent to <strong className="break-all font-semibold text-slate-700 dark:text-slate-200">{sentEmail}</strong>.</p> : <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Use your email to sign in or get started. No password needed.</p>}
    {next && <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-xs leading-6 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200">Your invitation is saved. You'll join the space after signing in.</p>}

    {!sentEmail ? <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Your email<input ref={emailInput} className="soft-input mt-2 py-3 text-base" type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} disabled={!!busy} /></label>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">{error}</p>}
      {sendWait > 0 && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">You can send another code in {countdown(sendWait)}.</p>}
      <button className="primary-button mt-5 min-h-11 w-full" type="submit" disabled={!!busy || sendWait > 0}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Mail size={17} />}{busy ? "Sending code…" : "Email me a code"}</button>
      <button className="secondary-button mt-3 min-h-11 w-full" type="button" onClick={useExistingCode} disabled={!!busy}>I already have a code</button>
      <p className="mt-5 text-center text-xs leading-6 text-slate-400 dark:text-slate-500">New here? Your account is created when you verify your email.</p>
    </form> : <form className="mt-6" onSubmit={verifyCode}>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Email code<input
        ref={codeInput}
        className="soft-input mt-2 py-3 text-center text-2xl font-semibold tracking-[0.45em] placeholder:tracking-[0.25em]"
        type="text"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(event) => { setCode(codeDigits(event.target.value)); setInvalidCode(false); }}
        onPaste={(event) => { event.preventDefault(); setCode(codeDigits(event.clipboardData.getData("text"))); setInvalidCode(false); }}
        aria-invalid={invalidCode}
        aria-describedby={`email-code-help${error ? " email-code-error" : ""}`}
        required
        disabled={!!busy}
      /></label>
      <p id="email-code-help" className={`mt-3 text-xs leading-6 ${expired ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>{expired ? "This code has expired. Send another code below." : expiresAt > 0 ? <>Code expires in {countdown(expiresIn)}. Check your spam folder if the email hasn't arrived.</> : "Codes expire 10 minutes after they're sent. Use the most recent code from your email."}</p>
      {feedback && <p className="mt-3 text-sm text-teal-700 dark:text-teal-300" role="status">{feedback}</p>}
      {error && <p id="email-code-error" className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">{error}</p>}
      {verifyWait > 0 && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Try verifying again in {countdown(verifyWait)}.</p>}
      <button className="primary-button mt-5 min-h-11 w-full" type="submit" disabled={!!busy || expired || verifyWait > 0 || code.length !== 6}>{busy === "verify" ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}{busy === "verify" ? "Verifying…" : "Verify & continue"}</button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800" type="button" onClick={changeEmail} disabled={!!busy}><ArrowLeft size={14} />Change email</button>
        <button className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-teal-300 dark:hover:bg-teal-950/40" type="button" onClick={() => void sendCode(true)} disabled={!!busy || sendWait > 0}>{busy === "resend" ? <><Loader2 size={14} className="animate-spin" />Sending…</> : sendWait > 0 ? `Resend in ${countdown(sendWait)}` : "Send another code"}</button>
      </div>
    </form>}
  </section>;
}
