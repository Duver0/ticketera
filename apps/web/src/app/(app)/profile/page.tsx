'use client';

import {signOut} from 'next-auth/react';
import {useAuth} from '@/lib/auth-context';
import {Avatar} from '@/components/ui/Avatar';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card, CardBody, CardHeader} from '@/components/ui/Card';
import {ThemeToggle} from '@/components/ThemeToggle';
import {ROLE_LABELS} from '@/lib/constants';
import {Spinner} from '@/components/ui/Spinner';

export default function ProfilePage(): React.JSX.Element {
  const {user, status} = useAuth();

  if (status === 'loading' || !user) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-content">Perfil</h1>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">Información de la cuenta</h2>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} image={user.image} size="lg" />
            <div>
              <p className="text-lg font-semibold text-content">{user.name ?? '—'}</p>
              <p className="text-sm text-content-secondary">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-content-secondary">Rol:</span>
            <Badge tone="info">{ROLE_LABELS[user.role]}</Badge>
            <span className="text-xs text-content-tertiary">(solo lectura)</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-subtle px-3 py-2">
            <span className="text-sm text-content-secondary">Tema de la interfaz</span>
            <ThemeToggle />
          </div>

          <div>
            <Button variant="danger" onClick={() => signOut({callbackUrl: '/login'})}>
              Cerrar sesión
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
