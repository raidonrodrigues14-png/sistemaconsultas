-- ============================================================
-- Agendamento por WhatsApp — Portal APS
-- Rode este script inteiro no SQL Editor do Supabase (uma vez só)
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.agenda_horarios (
  id bigint generated always as identity primary key,
  data date not null,
  horario text not null,
  tipo text,
  ubs text,
  microarea text,
  profissional text,
  status text not null default 'disponivel' check (status in ('disponivel','reservado')),
  paciente_nome text,
  paciente_telefone text,
  paciente_cns text,
  token text,
  agendado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (data, horario, profissional)
);

alter table public.agenda_horarios enable row level security;

-- Pacientes (link público) só enxergam horários disponíveis
create policy "publico_ve_disponiveis"
  on public.agenda_horarios for select
  to anon
  using (status = 'disponivel');

-- Equipe logada (authenticated) enxerga e edita tudo
create policy "equipe_ve_tudo"
  on public.agenda_horarios for select
  to authenticated
  using (true);

create policy "equipe_cria_horarios"
  on public.agenda_horarios for insert
  to authenticated
  with check (true);

create policy "equipe_atualiza_horarios"
  on public.agenda_horarios for update
  to authenticated
  using (true) with check (true);

create policy "equipe_remove_horarios"
  on public.agenda_horarios for delete
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- Reserva de horário: atômica, evita que dois pacientes peguem
-- o mesmo horário ao mesmo tempo. Só ela pode marcar "reservado".
-- ------------------------------------------------------------
create or replace function public.reservar_horario(
  p_id bigint,
  p_nome text,
  p_telefone text,
  p_cns text default null
) returns table(id bigint, token text, data date, horario text, tipo text, ubs text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(9), 'hex');
begin
  update public.agenda_horarios ah
  set status = 'reservado',
      paciente_nome = p_nome,
      paciente_telefone = p_telefone,
      paciente_cns = p_cns,
      token = v_token,
      agendado_em = now()
  where ah.id = p_id and ah.status = 'disponivel'
  returning ah.id, ah.token, ah.data, ah.horario, ah.tipo, ah.ubs
  into id, token, data, horario, tipo, ubs;

  if id is null then
    raise exception 'horario_indisponivel';
  end if;
  return next;
end;
$$;

grant execute on function public.reservar_horario(bigint, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Consulta pública do agendamento (para a página de cancelamento
-- exibir os dados sem precisar de SELECT direto na tabela)
-- ------------------------------------------------------------
create or replace function public.obter_agendamento(
  p_id bigint,
  p_token text
) returns table(data date, horario text, tipo text, paciente_nome text, status text)
language sql
security definer
set search_path = public
as $$
  select ah.data, ah.horario, ah.tipo, ah.paciente_nome, ah.status
  from public.agenda_horarios ah
  where ah.id = p_id and ah.token = p_token;
$$;

grant execute on function public.obter_agendamento(bigint, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Cancelamento: só funciona até 6h antes do horário marcado.
-- ------------------------------------------------------------
create or replace function public.cancelar_horario(
  p_id bigint,
  p_token text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_momento timestamp;
begin
  select (ah.data + ah.horario::time) into v_momento
  from public.agenda_horarios ah
  where ah.id = p_id and ah.token = p_token and ah.status = 'reservado';

  if v_momento is null then
    raise exception 'agendamento_nao_encontrado';
  end if;

  if now() > (v_momento - interval '6 hours') then
    raise exception 'prazo_expirado';
  end if;

  update public.agenda_horarios
  set status = 'disponivel', paciente_nome = null, paciente_telefone = null,
      paciente_cns = null, token = null, agendado_em = null
  where id = p_id;

  return true;
end;
$$;

grant execute on function public.cancelar_horario(bigint, text) to anon, authenticated;
