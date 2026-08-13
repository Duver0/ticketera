import {render, screen} from '@testing-library/react';
import {StatusPill} from './StatusPill';
import {STATE_ORDER, STATE_LABELS} from '@/lib/constants';
import type {TicketStateValue} from '@ticketera/types';

describe('StatusPill', () => {
  it('pinta el label y la clase de color correcta para cada estado', () => {
    for (const state of STATE_ORDER) {
      const {container} = render(<StatusPill state={state} />);
      expect(screen.getByText(STATE_LABELS[state])).toBeInTheDocument();
      // La clase de color del estado debe estar presente (no solo color).
      const el = container.querySelector('span');
      expect(el?.className).toContain(`bg-state-${state}-bg`);
      expect(el?.className).toContain(`text-state-${state}-fg`);
    }
  });

  it('usa el tamaño sm sin romper el contraste (texto + dot)', () => {
    render(<StatusPill state={'resuelto' as TicketStateValue} size="sm" />);
    const dot = document.querySelector('span span');
    expect(dot).toBeInTheDocument();
    expect(screen.getByText('Resuelto')).toBeInTheDocument();
  });
});
