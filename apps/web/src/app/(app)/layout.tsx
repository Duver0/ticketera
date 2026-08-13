import {AppShell} from '@/components/AppShell';

/** Layout autenticado: envuelve todas las rutas del grupo (app) con el shell. */
export default function AppLayout({children}: {children: React.ReactNode}): React.JSX.Element {
  return <AppShell>{children}</AppShell>;
}
