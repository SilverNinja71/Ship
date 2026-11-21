// The signed-in Firebase user, or null, kept current as people sign in and out.

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth, subscribeAuthUser } from "../lib/firebase.js";

export function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  useEffect(() => subscribeAuthUser(setUser), []);
  return user;
}
