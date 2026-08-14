'use client';

import {useState} from 'react';
import Link from 'next/link';
import {
  useCreateOrganization,
  useJoinOrganization,
  useOrganization,
  useOrganizationMembers,
  useRotateInviteCode,
} from '@/lib/api-hooks';
import {ApiClientError} from '@/lib/api';
import {useToast} from '@/components/ui/Toast';
import {Card, CardBody, CardHeader} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Field, Input} from '@/components/ui/Field';
import {Spinner} from '@/components/ui/Spinner';
import {Avatar} from '@/components/ui/Avatar';
import {ROLE_LABELS} from '@/lib/constants';
import {formatDate} from '@/lib/utils';

const ORG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Sección "Mi organización": muestra la org del usuario (slug, miembros,
 * código de invitación si es dueño/admin) o, si es org-less, permite crear una
 * o unirse por código.
 */
export default function OrganizationPage(): React.JSX.Element {
  const {data: org, isLoading, error} = useOrganization();
  const {data: members = [], isLoading: loadingMembers} = useOrganizationMembers();

  const isOrgless =
    error instanceof ApiClientError && error.code === 'ORG_NOT_FOUND';

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isOrgless || !org) {
    return <JoinOrCreateOrg />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-content">Mi organización</h1>
          <p className="mt-1 text-sm text-content-secondary">
            <span className="font-mono text-content">{org.slug}</span> · {org.memberCount} miembro(s)
          </p>
        </div>
        {/* El backend solo incluye `inviteCode` para el dueño de la org o admin global. */}
        {org.inviteCode && <InviteCodeCard inviteCode={org.inviteCode} />}
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">Miembros</h2>
        </CardHeader>
        <CardBody>
          {loadingMembers ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-2">
                    <Avatar size="sm" name={m.name} />
                    <span>
                      <span className="text-sm font-medium text-content">{m.name ?? '—'}</span>
                      <span className="block text-xs text-content-tertiary">{m.email}</span>
                    </span>
                  </span>
                  <span className="text-xs uppercase text-content-tertiary">
                    {ROLE_LABELS[m.role]}
                  </span>
                </li>
              ))}
              {members.length === 0 && (
                <li className="py-2 text-sm text-content-tertiary">Sin miembros.</li>
              )}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="mt-4 text-xs text-content-tertiary">
        Miembro desde: {formatDate(org.createdAt)}
      </p>
    </div>
  );
}

/** Tarjeta con el código de invitación y botón para regenerarlo. */
function InviteCodeCard({inviteCode}: {inviteCode: string}): React.JSX.Element {
  const rotate = useRotateInviteCode();
  const {toast} = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible */
    }
  };

  return (
    <Card className="min-w-72">
      <CardHeader>
        <h2 className="text-sm font-semibold text-content">Código de invitación</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <code className="block break-all rounded-lg bg-surface-muted px-3 py-2 text-sm text-content">
          {inviteCode}
        </code>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copy()} type="button">
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={rotate.isPending}
            onClick={() =>
              rotate.mutate(undefined, {
                onSuccess: (res) => {
                  toast('Código regenerado', 'success');
                  void navigator.clipboard?.writeText(res.inviteCode);
                },
                onError: (e) => toast(e.message, 'error'),
              })
            }
            type="button"
          >
            Regenerar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Para usuarios sin org: crear (slug) o unirse (código). */
function JoinOrCreateOrg(): React.JSX.Element {
  const {toast} = useToast();
  const create = useCreateOrganization();
  const join = useJoinOrganization();

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [slug, setSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const slugInvalid = slug.length > 0 && (!ORG_SLUG_RE.test(slug) || slug.length > 40);

  const submit = () => {
    setSubmitting(true);
    const onError = (e: unknown) => {
      setSubmitting(false);
      const code = e instanceof ApiClientError ? e.code : '';
      if (code === 'ORG_SLUG_TAKEN') toast('Ese slug ya está en uso', 'error');
      else if (code === 'ORG_SLUG_INVALID') toast('El slug no es válido (3–40, minúsculas, guiones)', 'error');
      else if (code === 'INVITE_CODE_INVALID') toast('El código de invitación no es válido', 'error');
      else if (code === 'ORG_ALREADY_MEMBER') toast('Ya perteneces a una organización', 'error');
      else toast((e as Error)?.message ?? 'No pudimos completar la operación', 'error');
    };

    if (mode === 'create') {
      if (slug.trim().length < 3 || slugInvalid) {
        toast('El slug debe tener 3–40 caracteres válidos', 'error');
        setSubmitting(false);
        return;
      }
      create.mutate(
        {slug: slug.trim()},
        {
          onSuccess: () => {
            setSubmitting(false);
            toast('Organización creada', 'success');
          },
          onError,
        },
      );
    } else {
      if (!inviteCode.trim()) {
        toast('Ingresa el código de invitación', 'error');
        setSubmitting(false);
        return;
      }
      join.mutate(
        {inviteCode: inviteCode.trim()},
        {
          onSuccess: () => {
            setSubmitting(false);
            toast('Te uniste a la organización', 'success');
          },
          onError,
        },
      );
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold text-content">Únete a una organización</h1>
      <p className="mb-6 text-sm text-content-secondary">
        Para crear proyectos necesitas una organización. Créala o únete con un código.
      </p>

      <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Modo de organización">
        {(['create', 'join'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line text-content-secondary hover:bg-surface-muted'
            }`}
          >
            {m === 'create' ? 'Crear organización' : 'Unirme con código'}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-4">
          {mode === 'create' ? (
            <Field
              label="Slug de la organización"
              htmlFor="org-slug"
              required
              error={slugInvalid ? 'Formato no válido (3–40, minúsculas, guiones)' : undefined}
              hint="Identificador único, p.ej. mi-equipo"
            >
              <Input
                id="org-slug"
                value={slug}
                invalid={slugInvalid}
                placeholder="mi-equipo"
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
            </Field>
          ) : (
            <Field label="Código de invitación" htmlFor="org-invite" required>
              <Input
                id="org-invite"
                value={inviteCode}
                placeholder="código de tu org"
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </Field>
          )}

          <Button className="w-full" loading={submitting} onClick={() => submit()} type="button">
            {mode === 'create' ? 'Crear organización' : 'Unirme'}
          </Button>

          <p className="text-center text-xs text-content-tertiary">
            ¿Ya tienes cuenta?{' '}
            <Link href="/profile" className="text-brand hover:underline">
              Ver perfil
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
