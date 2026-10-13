'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

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
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-full gap-1.5 text-xs border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
    >
      <LogOut className="w-3.5 h-3.5" />
      {loading ? 'Signing out...' : 'Sign Out'}
    </Button>
  );
}
