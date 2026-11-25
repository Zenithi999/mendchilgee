import { supabase } from "../supabase";

// The app was written against Firebase's user object; keep `uid` and
// `isAnonymous` so components don't have to change.
export function toAppUser(u) {
  if (!u) return null;
  return { ...u, uid: u.id, isAnonymous: !!u.is_anonymous };
}

// Map Supabase auth errors onto the Firebase-style codes the UI already handles.
function authError(error) {
  const map = {
    invalid_credentials: "auth/invalid-credential",
    user_already_exists: "auth/email-already-in-use",
    email_exists: "auth/email-already-in-use",
    weak_password: "auth/weak-password",
    email_address_invalid: "auth/invalid-email",
    validation_failed: "auth/invalid-email",
    email_not_confirmed: "auth/email-not-confirmed",
  };
  const err = new Error(error.message);
  err.code = map[error.code] || (/already registered/i.test(error.message)
    ? "auth/email-already-in-use"
    : error.code);
  return err;
}

// Sign in with email and password
export const loginWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
  return { user: toAppUser(data.user) };
};

// Create new user with email and password
export const registerWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw authError(error);
  if (!data.session) {
    // "Confirm email" is on in Supabase → user must click the link first
    const err = new Error("Confirm your email");
    err.code = "auth/email-not-confirmed";
    throw err;
  }
  return { user: toAppUser(data.user) };
};

// Sign in with Google (redirects to Google, then back to the site)
export const loginWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
  });
  if (error) throw authError(error);
};

// Send a password reset email (needed once: Firebase passwords can't be copied)
export const sendPasswordReset = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=1`,
  });
  if (error) throw authError(error);
};

export const updatePassword = async (password) => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authError(error);
};

// Sign out
export const logout = async () => {
  await supabase.auth.signOut();
};

// Auth state observer. The callback runs outside Supabase's auth lock
// (setTimeout) so it may safely call other Supabase methods.
export const onAuthChange = (callback) => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => callback(toAppUser(session?.user), event), 0);
  });
  return () => data.subscription.unsubscribe();
};

// Get current user
export const getCurrentUser = async () => {
  const { data } = await supabase.auth.getUser();
  return toAppUser(data.user);
};
