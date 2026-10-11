// Login.jsx - our own sign-in form (instead of Amplify's ready-made one), so Hearth can
// react to it: the eyes follow the pointer, then the text you type; energy flows in
// while you type the email; the blinds close for the password; the lights come on
// when you are in. A first sign-in with a temporary password asks for a new one.
import React, { useEffect, useRef, useState } from "react";
import { confirmSignIn, signIn } from "aws-amplify/auth";
import { HouseAvatar } from "../components/House.jsx";
import { ArrowRight, Eye, EyeOff, Info } from "../components/Icons.jsx";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function messageFor(error) {
  switch (error.name) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "PasswordResetRequiredException":
      return "This account needs a password reset. Ask the admin.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return error.message || "Sign-in failed. Try again.";
  }
}

// Where the caret is in the email field (0 = start).
function caretOf(input) {
  return input.selectionStart == null ? input.value.length : input.selectionStart;
}

export default function Login({ onSignedIn }) {
  const [step, setStep] = useState("signIn"); // signIn | newPassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [caret, setCaret] = useState(0);
  const [focus, setFocus] = useState(null); // email | password | null
  const [typing, setTyping] = useState(false);
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState("");
  const [look, setLook] = useState(null);
  const avatar = useRef(null);
  const timer = useRef(0);

  // The eyes follow the pointer anywhere on the page (one update per frame).
  useEffect(() => {
    let frame = 0;
    function move(event) {
      const { clientX, clientY } = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!avatar.current) return;
        const box = avatar.current.getBoundingClientRect();
        const dx = clientX - (box.left + box.width / 2);
        const dy = clientY - (box.top + box.height * 0.58);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(distance / 240, 1);
        setLook({ x: (dx / distance) * reach, y: (dy / distance) * reach });
      });
    }
    const leave = () => setLook(null);
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer.current);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  const valid = EMAIL.test(email.trim());
  const busy = phase === "loading";

  // Hearth's pose for the current moment.
  const house = { look: { x: -2, y: 3 }, blinds: [0, 0], energy: 0.41 * Math.min(email.length / 20, 1), mood: "smile", lights: false, happy: false };
  let flow = "off";
  if (look) house.look = { x: 8 * look.x, y: 5.5 * look.y };
  if (phase === "success") {
    Object.assign(house, { look: { x: 0, y: 0 }, energy: 1, mood: "wide", lights: true, happy: true });
    flow = "in";
  } else if (phase === "loading") {
    Object.assign(house, { look: { x: 0, y: -5 }, energy: 0.61, mood: "o" });
    flow = "fast";
  } else if (phase === "error") {
    Object.assign(house, { blinds: [0.32, 0.32], energy: 0.09, mood: "wavy" });
  } else if (focus === "password") {
    // Blinds down; "show password" lifts the left one halfway so he can peek.
    house.blinds = show ? [0.45, 1] : [1, 1];
    if (show) Object.assign(house, { look: { x: 3, y: 4.5 }, mood: "o" });
  } else if (focus === "email" && typing) {
    // Once typing starts, the eyes stay on the text and follow the caret.
    const along = Math.min(caret / 30, 1);
    Object.assign(house, { look: { x: -7 + 14 * along, y: 4 }, mood: email ? (valid ? "wide" : "open") : "smile" });
    flow = email ? "in" : "off";
  }

  function clearError() {
    if (phase === "error") {
      setPhase("idle");
      setError("");
    }
  }

  function fail(message) {
    setPhase("error");
    setError(message);
  }

  function succeed() {
    setPhase("success");
    timer.current = setTimeout(onSignedIn, 1100); // long enough to see the lights come on
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (step === "signIn" && !valid) return fail("Enter your email address, like name@example.com.");
    if (step === "newPassword" && password.length < 10) return fail("Use at least 10 characters.");
    setPhase("loading");
    setError("");
    try {
      const result = step === "signIn" ? await signIn({ username: email.trim(), password }) : await confirmSignIn({ challengeResponse: password });
      if (result.isSignedIn) return succeed();
      if (result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setStep("newPassword");
        setPassword("");
        setShow(false);
        setPhase("idle");
        return;
      }
      fail(`This account needs a sign-in step the app does not support (${result.nextStep.signInStep}).`);
    } catch (e) {
      if (e.name === "UserAlreadyAuthenticatedException") return succeed();
      fail(messageFor(e));
    }
  }

  const newPassword = step === "newPassword";

  return (
    <div className="login">
      <div className="brand">
        <span className="wordmark">T<span>.</span>H<span>.</span>E<span>.</span>O<span>.</span></span>
        <span className="label">The Holistic Energy Orchestrator</span>
      </div>

      <main className={`card login-card${phase === "error" ? " shake" : ""}`}>
        <HouseAvatar avatarRef={avatar} size={176} cable flow={flow} glow={phase === "success"} {...house} />

        {phase === "success" ? (
          <div className="done heading" role="status">
            <h1>You're <em>in</em></h1>
            <p className="lead">The lights are on. Opening your dashboard…</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="heading">
              {newPassword ? <h1>Choose a new <em>password</em></h1> : <h1>Welcome <em>home</em></h1>}
              <p className="lead">
                {newPassword
                  ? "First sign-in: replace the temporary password. At least 10 characters, with upper and lower case letters, a number and a symbol."
                  : "Sign in to see how your car powers your home."}
              </p>
            </div>

            {!newPassword && (
              <div className="field">
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  placeholder="you@example.com"
                  value={email}
                  disabled={busy}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCaret(caretOf(e.target));
                    setTyping(true);
                    clearError();
                  }}
                  onKeyDown={() => setTyping(true)}
                  onSelect={(e) => setCaret(caretOf(e.target))}
                  onFocus={(e) => {
                    setFocus("email");
                    setTyping(false);
                    setCaret(caretOf(e.target));
                  }}
                  onBlur={() => {
                    setFocus(null);
                    setTyping(false);
                  }}
                />
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="password">{newPassword ? "New password" : "Password"}</label>
              <div className="password">
                <input
                  id="password"
                  className="input"
                  type={show ? "text" : "password"}
                  autoComplete={newPassword ? "new-password" : "current-password"}
                  value={password}
                  disabled={busy}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  onFocus={() => setFocus("password")}
                  onBlur={() => setFocus(null)}
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  onMouseDown={(e) => e.preventDefault()} // keep the focus (and the blinds) on the password field
                  onClick={() => setShow(!show)}
                  onFocus={() => setFocus("password")}
                  onBlur={() => setFocus(null)}
                >
                  {show ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {phase === "error" && (
              <p className="note" role="alert">
                <Info size={18} />
                {error}
              </p>
            )}

            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {newPassword ? "Saving…" : "Signing in…"}
                </>
              ) : (
                <>
                  {newPassword ? "Save and sign in" : "Sign in"}
                  <ArrowRight />
                </>
              )}
            </button>
          </form>
        )}
      </main>

      <p className="footnote">No sign-up · the admin creates demo accounts</p>
    </div>
  );
}
