import { Redirect } from 'expo-router';

/** Landing route for groundwork://auth/callback deep links (the OAuth helper completes the exchange). */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
