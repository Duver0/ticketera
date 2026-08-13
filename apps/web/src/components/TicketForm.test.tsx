import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {TicketForm} from './TicketForm';
import type {ProjectDto} from '@ticketera/types';

const stubProject: ProjectDto = {
  id: 'p1',
  key: 'TST',
  name: 'Proyecto test',
  description: null,
  createdById: 'u1',
  createdAt: new Date().toISOString(),
};

function renderForm() {
  const qc = new QueryClient();
  qc.setQueryData(['projects'], [stubProject]);
  return render(
    <QueryClientProvider client={qc}>
      <TicketForm />
    </QueryClientProvider>,
  );
}

describe('TicketForm', () => {
  it('valida campos obligatorios y muestra errores', async () => {
    renderForm();
    // El formulario renderiza porque hay un proyecto disponible.
    expect(screen.getByLabelText(/título/i)).toBeInTheDocument();

    const submit = screen.getByRole('button', {name: /crear ticket/i});
    fireEvent.click(submit);

    expect(await screen.findByText(/selecciona un proyecto/i)).toBeInTheDocument();
    expect(await screen.findByText(/al menos 3 caracteres/i)).toBeInTheDocument();
  });

  it('no envía el formulario si el título es muy corto', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/proyecto/i), {target: {value: 'p1'}});
    fireEvent.change(screen.getByLabelText(/título/i), {target: {value: 'ab'}});
    fireEvent.click(screen.getByRole('button', {name: /crear ticket/i}));

    // Con título < 3 el envío se bloquea por validación.
    expect(await screen.findByText(/al menos 3 caracteres/i)).toBeInTheDocument();
  });
});
