import type {Priority, Role, TicketStateValue, TicketType} from '@ticketera/types';

/** Etiquetas en español para los valores de dominio (la UI siempre en español). */
export const STATE_LABELS: Record<TicketStateValue, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  en_revision: 'En revisión',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
};

export const STATE_ORDER: TicketStateValue[] = [
  'abierto',
  'en_progreso',
  'en_revision',
  'resuelto',
  'cerrado',
  'reabierto',
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const PRIORITY_ORDER: Priority[] = ['baja', 'media', 'alta', 'urgente'];

export const TYPE_LABELS: Record<TicketType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  tarea: 'Tarea',
  epic: 'Epic',
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  agente: 'Agente',
  usuario: 'Usuario',
};

/** Color sólido para barras/gráficos (no depende de clases Tailwind). */
export const STATUS_BAR_COLOR: Record<TicketStateValue, string> = {
  abierto: '#1e40af',
  en_progreso: '#3730a3',
  en_revision: '#92400e',
  resuelto: '#065f46',
  cerrado: '#475569',
  reabierto: '#9f1239',
};

export const STATE_TOKEN: Record<TicketStateValue, string> = {
  abierto: 'state-abierto',
  en_progreso: 'state-en_progreso',
  en_revision: 'state-en_revision',
  resuelto: 'state-resuelto',
  cerrado: 'state-cerrado',
  reabierto: 'state-reabierto',
};
