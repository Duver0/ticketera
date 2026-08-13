import {cn} from '@/lib/utils';

export function Spinner({className}: {className?: string}): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent',
        className,
      )}
    />
  );
}

/** Estado vacío reutilizable (lista de tickets, sin resultados, etc.). */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="mb-3 text-content-tertiary">{icon}</div>}
      <h3 className="text-sm font-semibold text-content">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-content-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
