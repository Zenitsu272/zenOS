import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BrainCircuit, FolderKanban, Loader2, LockKeyhole, Users } from "lucide-react";

import { apiRequest, getInvitePath } from "../api/client";
import { getMe } from "../api/auth";
import { getToken } from "../lib/storage";

interface Invitation {
  id: number;
  name: string;
  invite_expires_at: string | null;
}

export default function JoinSpacePage() {
  const { code = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invitePath = getInvitePath(`/join/${code}`);
  const signedIn = !!getToken();
  const started = useRef(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const invitation = useQuery({
    queryKey: ["invitation", code],
    queryFn: () => apiRequest<Invitation>(`/teams/invites/${code}`, { auth: false }),
    enabled: !!invitePath,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: getMe, enabled: signedIn });

  async function joinSpace() {
    if (started.current || !invitePath || !invitation.data) return;
    started.current = true;
    setJoining(true);
    setJoinError("");
    try {
      const space = await apiRequest<{ id: number }>("/teams/join", {
        method: "POST",
        body: { code },
      });
      localStorage.setItem("zenos_team", String(space.id));
      queryClient.removeQueries({ queryKey: ["teams"] });
      queryClient.removeQueries({ queryKey: ["team"] });
      navigate("/", { replace: true });
    } catch (error) {
      started.current = false;
      setJoinError(error instanceof Error ? error.message : "We couldn't join this space. Please try again.");
      setJoining(false);
    }
  }

  useEffect(() => {
    if (signedIn && invitation.data && location.state?.joinAfterSignIn && !joinError) {
      void joinSpace();
    }
  }, [signedIn, invitation.data, location.state, joinError]);

  const error = !invitePath
    ? "This invitation link doesn't look right. Ask the space owner to send a new link."
    : invitation.error instanceof Error
      ? invitation.error.message
      : null;
  const next = invitePath ? `?next=${encodeURIComponent(invitePath)}` : "";

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#ccfbf1,transparent_40%),linear-gradient(135deg,#f8fafc,#f1f5f9_48%,#ecfeff)] px-5 py-10 dark:bg-none dark:bg-slate-950">
      <div className="w-full max-w-lg">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-extrabold text-slate-900 dark:text-white">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-600 text-white"><BrainCircuit size={21} /></span>
          zenOS
        </Link>
        <section className="surface rounded-2xl p-7 sm:p-9" aria-live="polite">
          {invitation.isLoading && invitePath ? (
            <div className="flex items-center justify-center gap-3 py-10 text-slate-500"><Loader2 className="animate-spin" size={20} /> Opening your invitation…</div>
          ) : error ? (
            <>
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><LockKeyhole size={25} /></div>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">This invitation isn't available</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300" role="alert">{error}</p>
              <p className="mt-3 text-sm leading-6 text-slate-500">Ask the space owner for a new invitation link.</p>
              <Link to={signedIn ? "/" : "/login"} className="secondary-button mt-6">{signedIn ? "Go to my spaces" : "Go to sign in"}</Link>
            </>
          ) : invitation.data ? (
            <>
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300"><Users size={25} /></div>
              <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">You've been invited</p>
              <h1 className="mt-2 break-words text-3xl font-bold text-slate-950 dark:text-white">Join {invitation.data.name}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">A shared place for your team's projects, tasks, and updates.</p>
              <div className="my-6 space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <p className="flex items-start gap-3"><FolderKanban size={18} className="mt-0.5 shrink-0 text-teal-600" /> See the projects and move tasks from To do to Doing to Done.</p>
                <p className="flex items-start gap-3"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-teal-600" /> Only members of this space can see its work.</p>
              </div>
              {signedIn ? (
                <>
                  {me.data && <p className="mb-4 break-words text-sm text-slate-500">Signed in as <span className="font-medium text-slate-700 dark:text-slate-200">{me.data.email}</span></p>}
                  {joinError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{joinError}</p>}
                  <button type="button" className="primary-button w-full py-3" disabled={joining} onClick={() => void joinSpace()}>
                    {joining ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                    {joining ? "Opening your space…" : "Join space"}
                  </button>
                  {!joining && <Link className="mt-4 block text-center text-sm font-medium text-teal-700 dark:text-teal-300" to={`/login${next}`}>Use a different account</Link>}
                </>
              ) : (
                <>
                  <Link to={`/login${next}`} className="primary-button w-full py-3">Continue to join <ArrowRight size={17} /></Link>
                  <p className="mt-4 text-center text-sm text-slate-500">Sign in or create an account to accept this invitation.</p>
                </>
              )}
              <p className="mt-6 text-xs leading-5 text-slate-400">This invitation gives you access to this space and its projects.</p>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
