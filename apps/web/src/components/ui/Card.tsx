import {cn} from '@/lib/utils';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={cn('rounded-xl border border-line bg-surface shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({className, children}: {className?: string; children: React.ReactNode}): React.JSX.Element {
  return <div className={cn('border-b border-line px-4 py-3', className)}>{children}</div>;
}

export function CardBody({className, children}: {className?: string; children: React.ReactNode}): React.JSX.Element {
  return <div className={cn('p-4', className)}>{children}</div>;
}
