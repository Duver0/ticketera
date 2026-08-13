import {cn} from '@/lib/utils';
import {initials} from '@/lib/utils';

export interface AvatarProps {
  name?: string | null;
  image?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
} as const;

/** Avatar con fallback a iniciales si no hay imagen. */
export function Avatar({name, image, size = 'md', className}: AvatarProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand',
        SIZES[size],
        className,
      )}
      title={name ?? undefined}
      aria-label={name ?? 'Usuario'}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
