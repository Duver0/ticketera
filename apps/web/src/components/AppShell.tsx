'use client';

import {useState} from 'react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {signOut} from 'next-auth/react';
import {useAuth} from '@/lib/auth-context';
import {ROLE_LABELS} from '@/lib/constants';
import {cn} from '@/lib/utils';
import {Avatar} from '@/components/ui/Avatar';
import {Button} from '@/components/ui/Button';
import {Spinner} from '@/components/ui/Spinner';
import {ThemeToggle} from '@/components/ThemeToggle';
import {NotificationBell} from '@/components/NotificationBell';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z" fill="currentColor" />
    ),
  },
  {
    href: '/tickets',
    label: 'Tickets',
    icon: (
      <path
        d="M4 5h16v4H4zM4 11h16v8H4zM8 15h4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/board',
    label: 'Tablero',
    icon: (
      <path
        d="M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/admin',
    label: 'Admin',
    adminOnly: true,
    icon: (
      <path
        d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/profile',
    label: 'Perfil',
    icon: (
      <path
        d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
];

function NavLinks({role, onNavigate}: {role: string | null; onNavigate?: () => void}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegación principal">
      {NAV.filter((n) => !n.adminOnly || role === 'admin').map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-soft text-brand'
                : 'text-content-secondary hover:bg-surface-muted hover:text-content',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              {item.icon}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Shell de la app autenticada: sidebar + topbar + contenido. */
export function AppShell({children}: {children: React.ReactNode}): React.JSX.Element {
  const {status, user, isAuthed} = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (status === 'loading' || (status === 'authenticated' && !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthed) {
    if (typeof window !== 'undefined') router.replace('/login');
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const role = user?.role ?? null;

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar escritorio */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface-subtle md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand font-bold text-brand-fg">
            t
          </span>
          <span className="text-base font-semibold text-content">ticketera</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks role={role} />
        </div>
        <div className="border-t border-line p-3">
          <UserCard name={user?.name} email={user?.email} role={role} image={user?.image} />
        </div>
      </aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-line bg-surface-subtle p-3 animate-slide-in">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-semibold text-content">ticketera</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="rounded-md p-1 text-content-tertiary hover:bg-surface-muted"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavLinks role={role} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-4 border-t border-line pt-3">
              <UserCard name={user?.name} email={user?.email} role={role} image={user?.image} />
            </div>
          </aside>
        </div>
      )}

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="rounded-md p-1.5 text-content-secondary hover:bg-surface-muted md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex-1" />
          <ThemeToggle />
          <NotificationBell />
          <button
            onClick={() => signOut({callbackUrl: '/login'})}
            aria-label="Cerrar sesión"
            className="rounded-lg p-1.5 text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 12H4m0 0l4-4m-4 4l4 4M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function UserCard({
  name,
  email,
  role,
  image,
}: {
  name?: string | null;
  email?: string | null;
  role: string | null;
  image?: string | null;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-1">
      <Avatar name={name} image={image} size="md" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-content">{name ?? email}</p>
        <p className="truncate text-xs text-content-tertiary">
          {role ? ROLE_LABELS[role as keyof typeof ROLE_LABELS] : ''}
        </p>
      </div>
    </div>
  );
}
