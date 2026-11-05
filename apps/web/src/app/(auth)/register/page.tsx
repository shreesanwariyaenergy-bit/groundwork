import { Suspense } from 'react';
import { RegisterForm } from './RegisterForm';

export const metadata = { title: 'Create your account' };

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}
