'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import { useRouter } from '@/i18n/navigation';

export default function ProfileSignOutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.push('/');
      router.refresh();
    } catch (e) {
      console.error('Failed to sign out:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSignOut}
      disabled={loading}
      aria-busy={loading}
      className="gap-1.5 hover:border-destructive/50 hover:text-destructive"
    >
      <LogOut aria-hidden className="w-3.5 h-3.5" />
      {loading ? 'Signing out...' : 'Sign Out'}
    </Button>
  );
}
