import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthChange,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logout,
} from "../services/authService";
import {
  getTermsAgreement,
  saveTermsAgreement,
} from "../services/firestoreService";
import { TERMS_VERSION } from "../legal/terms";
import { getDoc, subscribe } from "../lib/docs";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsTermsReaccept, setNeedsTermsReaccept] = useState(false);
  const [credits, setCredits] = useState(0);
  const [role, setRole] = useState(null); // "admin" | null

  useEffect(() => {
    const unsubscribe = onAuthChange(async (authUser) => {
      setUser(authUser);
      // Check terms version for non-anonymous authenticated users
      if (authUser && !authUser.isAnonymous) {
        try {
          const agreement = await getTermsAgreement(authUser.uid);
          if (!agreement || agreement.termsVersion !== TERMS_VERSION) {
            setNeedsTermsReaccept(true);
          } else {
            setNeedsTermsReaccept(false);
          }
        } catch (err) {
          console.error("Error checking terms agreement:", err);
          setNeedsTermsReaccept(false);
        }
      } else {
        setNeedsTermsReaccept(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time credits + role subscription (single listener on userProfiles doc)
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setCredits(0);
      setRole(null);
      return;
    }

    const uid = user.uid;
    const unsubscribe = subscribe(
      "profiles",
      async () => {
        const row = await getDoc("profiles", uid);
        setCredits(row?.data?.credits || 0);
        setRole(row?.data?.role || null);
      },
      `id=eq.${uid}`,
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe only when the account changes
  }, [user?.uid, user?.isAnonymous]);

  // Accept updated terms
  const acceptTerms = async () => {
    if (!user || user.isAnonymous) return;
    try {
      await saveTermsAgreement(user.uid, TERMS_VERSION);
      setNeedsTermsReaccept(false);
    } catch (err) {
      console.error("Error saving terms agreement:", err);
      throw err;
    }
  };

  const value = {
    user,
    loading,
    credits,
    role,
    isAdmin: role === "admin",
    isAuthenticated: !!user,
    isAnonymous: user?.isAnonymous ?? false,
    needsTermsReaccept,
    acceptTerms,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
