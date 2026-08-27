-- Ponto eletrônico (REP-P) conforme Portaria MTP 671/2021.
-- NSR sequencial e ininterrupto por empregador.
-- registros_ponto é imutável (sem UPDATE/DELETE/TRUNCATE).
-- Biometria apenas como template/hash — sem imagem bruta (LGPD).

create table if not exists public.empregadores (
  id bigint generated always as identity primary key,
  empresa_id bigint null references public.empresas (id) on delete set null,
  tipo_inscricao char(1) not null,
  numero_inscricao varchar(14) not null,
  razao_social varchar(150) not null,
  local_trabalho varchar(150) null,
  criado_em timestamptz not null default now(),
  constraint empregadores_tipo_inscricao_chk check (tipo_inscricao in ('1', '2')),
  constraint empregadores_numero_inscricao_chk check (numero_inscricao ~ '^[0-9]{11,14}$'),
  constraint empregadores_razao_nao_vazia check (btrim(razao_social) <> ''),
  constraint empregadores_numero_inscricao_uq unique (numero_inscricao),
  constraint empregadores_empresa_id_uq unique (empresa_id)
);

comment on table public.empregadores is
  'Empregador para cabeçalho fiscal AFD/AEJ (Portaria 671/2021). tipo_inscricao 1=CNPJ, 2=CPF.';
comment on column public.empregadores.empresa_id is
  'Vínculo opcional com public.empresas do Podoquiro.';

create table if not exists public.funcionarios (
  id bigint generated always as identity primary key,
  empregador_id bigint not null references public.empregadores (id) on delete restrict,
  usuario_id bigint null references public.usuarios (id) on delete set null,
  cpf varchar(11) not null,
  nome varchar(100) not null,
  cargo varchar(50) null,
  data_admissao date not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint funcionarios_cpf_chk check (cpf ~ '^[0-9]{11}$'),
  constraint funcionarios_nome_nao_vazio check (btrim(nome) <> ''),
  constraint funcionarios_empregador_cpf_uq unique (empregador_id, cpf)
);

comment on table public.funcionarios is
  'Trabalhador identificado por CPF (Portaria 671/2021).';
comment on column public.funcionarios.usuario_id is
  'Vínculo opcional com public.usuarios (colaborador já cadastrado no sistema).';

create unique index if not exists funcionarios_usuario_id_uq
  on public.funcionarios (usuario_id)
  where usuario_id is not null;

create table if not exists public.biometrias (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.funcionarios (id) on delete cascade,
  tipo_biometria varchar(20) not null,
  template_hash text not null,
  data_cadastro timestamptz not null default now(),
  constraint biometrias_tipo_chk check (tipo_biometria in ('DIGITAL', 'FACIAL')),
  constraint biometrias_template_nao_vazio check (btrim(template_hash) <> '')
);

comment on table public.biometrias is
  'Template biométrico (vetor/hash). Proibido armazenar imagem bruta da digital (LGPD).';
comment on column public.biometrias.template_hash is
  'Template SourceAFIS ou hash do vetor — nunca a imagem do sensor.';

create table if not exists public.registros_ponto (
  id bigint generated always as identity primary key,
  nsr bigint not null,
  empregador_id bigint not null references public.empregadores (id) on delete restrict,
  funcionario_id bigint not null references public.funcionarios (id) on delete restrict,
  data_hora_fato timestamptz not null,
  fuso_horario varchar(10) not null,
  tipo_batida varchar(20) not null default 'ORIGINAL',
  dispositivo_id varchar(50) not null,
  metodo_validacao varchar(20) not null default 'BIOMETRIA',
  score_precisao numeric(8, 2) null,
  hash_registro varchar(128) not null,
  criado_em timestamptz not null default now(),
  constraint registros_ponto_nsr_positivo check (nsr > 0),
  constraint registros_ponto_tipo_batida_chk check (tipo_batida in ('ORIGINAL', 'INCLUIDO_MANUAL')),
  constraint registros_ponto_fuso_chk check (fuso_horario ~ '^[+-][0-9]{2}:[0-9]{2}$'),
  constraint registros_ponto_dispositivo_nao_vazio check (btrim(dispositivo_id) <> ''),
  constraint registros_ponto_hash_nao_vazio check (btrim(hash_registro) <> ''),
  constraint registros_ponto_empregador_nsr_uq unique (empregador_id, nsr)
);

comment on table public.registros_ponto is
  'Marcação de ponto com NSR sequencial por empregador. Imutável: sem UPDATE/DELETE (Portaria 671/2021, REP-P).';
comment on column public.registros_ponto.nsr is
  'Número Sequencial de Registro, único e crescente por empregador.';
comment on column public.registros_ponto.hash_registro is
  'SHA-256 do registro (integridade REP-P). Calculado no INSERT.';

create index if not exists registros_ponto_funcionario_quando_idx
  on public.registros_ponto (funcionario_id, data_hora_fato);
create index if not exists registros_ponto_empregador_quando_idx
  on public.registros_ponto (empregador_id, data_hora_fato);

create table if not exists public.tratamentos_ponto (
  id bigint generated always as identity primary key,
  empregador_id bigint not null references public.empregadores (id) on delete restrict,
  nsr_referencia bigint null,
  funcionario_id bigint not null references public.funcionarios (id) on delete restrict,
  data_hora_nova timestamptz not null,
  tipo_alteracao varchar(20) not null,
  motivo text not null,
  usuario_responsavel_id bigint not null references public.usuarios (id) on delete restrict,
  data_hora_processamento timestamptz not null default now(),
  constraint tratamentos_ponto_tipo_chk check (
    tipo_alteracao in ('INCLUSAO', 'CORRECAO_HORARIO', 'DESCONSIDERACAO')
  ),
  constraint tratamentos_ponto_motivo_nao_vazio check (btrim(motivo) <> ''),
  constraint tratamentos_ponto_nsr_fk
    foreign key (empregador_id, nsr_referencia)
    references public.registros_ponto (empregador_id, nsr)
    on delete restrict
);

comment on table public.tratamentos_ponto is
  'Inclusão/correção/desconsideração de ponto sem alterar registros_ponto (art. 84 da Portaria 671/2021).';

create index if not exists tratamentos_ponto_funcionario_idx
  on public.tratamentos_ponto (funcionario_id, data_hora_processamento desc);

create table if not exists public.espelho_ponto_mensal (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.funcionarios (id) on delete restrict,
  periodo_inicio date not null,
  periodo_fim date not null,
  total_horas_trabalhadas interval null,
  total_horas_extras interval null,
  total_faltas_atrasos interval null,
  hash_arquivo_espelho varchar(128) null,
  assinado_empregador boolean not null default false,
  assinado_funcionario boolean not null default false,
  data_assinatura timestamptz null,
  criado_em timestamptz not null default now(),
  constraint espelho_ponto_periodo_chk check (periodo_fim >= periodo_inicio),
  constraint espelho_ponto_funcionario_periodo_uq unique (funcionario_id, periodo_inicio, periodo_fim)
);

comment on table public.espelho_ponto_mensal is
  'Espelho de ponto eletrônico do período, com hash e flags de assinatura (empregador/empregado).';

create or replace function public.ponto_registros_atribuir_nsr()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(6712021, (new.empregador_id % 2147483647)::integer);
  select coalesce(max(nsr), 0) + 1
    into new.nsr
    from public.registros_ponto
   where empregador_id = new.empregador_id;
  return new;
end;
$$;

create or replace function public.ponto_registros_calcular_hash()
returns trigger
language plpgsql
as $$
begin
  new.hash_registro := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          new.empregador_id::text,
          new.nsr::text,
          new.funcionario_id::text,
          new.data_hora_fato::text,
          new.fuso_horario,
          new.tipo_batida,
          new.dispositivo_id,
          new.metodo_validacao,
          coalesce(new.score_precisao::text, '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

create or replace function public.ponto_registros_bloquear_mutacao()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Portaria 671/2021: registros_ponto é imutável. Use tratamentos_ponto para inclusão, correção ou desconsideração.'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists registros_ponto_01_nsr on public.registros_ponto;
create trigger registros_ponto_01_nsr
  before insert on public.registros_ponto
  for each row
  execute function public.ponto_registros_atribuir_nsr();

drop trigger if exists registros_ponto_02_hash on public.registros_ponto;
create trigger registros_ponto_02_hash
  before insert on public.registros_ponto
  for each row
  execute function public.ponto_registros_calcular_hash();

drop trigger if exists registros_ponto_no_update on public.registros_ponto;
create trigger registros_ponto_no_update
  before update on public.registros_ponto
  for each row
  execute function public.ponto_registros_bloquear_mutacao();

drop trigger if exists registros_ponto_no_delete on public.registros_ponto;
create trigger registros_ponto_no_delete
  before delete on public.registros_ponto
  for each row
  execute function public.ponto_registros_bloquear_mutacao();

drop trigger if exists registros_ponto_no_truncate on public.registros_ponto;
create trigger registros_ponto_no_truncate
  before truncate on public.registros_ponto
  for each statement
  execute function public.ponto_registros_bloquear_mutacao();

alter table public.empregadores enable row level security;
alter table public.funcionarios enable row level security;
alter table public.biometrias enable row level security;
alter table public.registros_ponto enable row level security;
alter table public.tratamentos_ponto enable row level security;
alter table public.espelho_ponto_mensal enable row level security;

revoke update, delete, truncate on table public.registros_ponto from anon, authenticated;
