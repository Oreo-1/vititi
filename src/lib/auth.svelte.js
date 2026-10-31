import { pb } from './pb.js';

export const USERS = 'vititi_users';

export const auth = $state({
  user: pb.authStore.isValid ? pb.authStore.record : null,
});

pb.authStore.onChange(() => {
  auth.user = pb.authStore.isValid ? pb.authStore.record : null;
});

export const isDM = () => auth.user?.role === 'dm';

/** Log in with name + password (vititi_users uses `name` as its identity field). */
export async function login(name, password) {
  await pb.collection(USERS).authWithPassword(name.trim(), password);
}

export async function register(name, password) {
  // Self-registration always creates a player. Promote to DM in the PocketBase dashboard.
  await pb.collection(USERS).create({
    name: name.trim(),
    password,
    passwordConfirm: password,
    role: 'player',
  });
  await login(name, password);
}

export function logout() {
  pb.authStore.clear();
}
