import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SessionProvider } from '@/components/SessionProvider';

export const metadata = { title: 'Admin Panel' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/admin-login');

  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  );
}
