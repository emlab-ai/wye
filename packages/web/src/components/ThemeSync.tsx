'use client';
import { useEffect } from 'react';
import { syncTheme } from '@/lib/theme';

// Applies the person's theme choice once the page is up (lib/theme); the server already painted light or dark from the cookie.
export function ThemeSync() { useEffect(() => { syncTheme(); }, []); return null; }
