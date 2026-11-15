import React, { useState, useEffect } from 'react';
import FragAdminDashboard from './components/FragAdminDashboard';

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('theme') !== 'light';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    } catch (e) {}
  }, [isDark]);

  return (
    <FragAdminDashboard
      isDark={isDark}
      onToggleTheme={() => setIsDark(prev => !prev)}
      onOpenSellerPortal={() => {
        window.open('https://fragdashboard.vercel.app', '_blank', 'noopener,noreferrer');
      }}
    />
  );
}
