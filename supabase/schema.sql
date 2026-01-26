-- Create Enums
CREATE TYPE estado_quedada AS ENUM ('Propuesta', 'Cerrada', 'Realizada');
CREATE TYPE rol_participacion AS ENUM ('Organizador', 'Fotografo', 'Pagafantas', 'Invitado');

-- PROFILES (Usuario)
-- Extends Supabase auth.users
CREATE TABLE public."Usuario" (
  id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  fecha_nac DATE,
  bio TEXT,
  id_grupo UUID -- FK added later
);

-- GRUPO
CREATE TABLE public."Grupo" (
  id_grupo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  fecha_crea TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Circular FK for Usuario -> Grupo
ALTER TABLE public."Usuario" ADD CONSTRAINT fk_usuario_grupo FOREIGN KEY (id_grupo) REFERENCES public."Grupo"(id_grupo) ON DELETE SET NULL;

-- CONFIGURACION
CREATE TABLE public."Configuracion" (
  id_config UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID UNIQUE NOT NULL REFERENCES public."Usuario"(id_usuario) ON DELETE CASCADE,
  campo1 TEXT,
  campo2 TEXT,
  campo3 TEXT
);

-- ESTADISTICAS USUARIO
CREATE TABLE public."EstadisticasUsuario" (
  id_estad_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID UNIQUE NOT NULL REFERENCES public."Usuario"(id_usuario) ON DELETE CASCADE,
  campo1 INTEGER DEFAULT 0,
  campo2 INTEGER DEFAULT 0,
  campo3 INTEGER DEFAULT 0
);

-- ESTADISTICAS GRUPO
CREATE TABLE public."EstadisticasGrupo" (
  id_estad_grupo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_grupo UUID UNIQUE NOT NULL REFERENCES public."Grupo"(id_grupo) ON DELETE CASCADE,
  campo1 INTEGER DEFAULT 0,
  campo2 INTEGER DEFAULT 0,
  campo3 INTEGER DEFAULT 0
);

-- QUEDADA
CREATE TABLE public."Quedada" (
  id_quedada UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_grupo UUID NOT NULL REFERENCES public."Grupo"(id_grupo) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  estado estado_quedada DEFAULT 'Propuesta',
  aforo_min INTEGER DEFAULT 1,
  aforo_max INTEGER DEFAULT 10,
  fecha_inicio TIMESTAMP WITH TIME ZONE,
  fecha_fin TIMESTAMP WITH TIME ZONE,
  CONSTRAINT check_fechas CHECK (fecha_inicio <= fecha_fin),
  CONSTRAINT check_aforo CHECK (aforo_min <= aforo_max)
);

-- PARTICIPACION QUEDADA
CREATE TABLE public."ParticipacionQuedada" (
  id_participacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL REFERENCES public."Usuario"(id_usuario) ON DELETE CASCADE,
  id_quedada UUID NOT NULL REFERENCES public."Quedada"(id_quedada) ON DELETE CASCADE,
  rol rol_participacion DEFAULT 'Invitado',
  UNIQUE(id_usuario, id_quedada)
);

-- INVITACION
CREATE TABLE public."Invitacion" (
  id_invitacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quedada UUID NOT NULL REFERENCES public."Quedada"(id_quedada) ON DELETE CASCADE,
  email_invitado TEXT NOT NULL,
  auth_invitacion TEXT NOT NULL,
  contenido TEXT
);

-- DISPONIBILIDAD HORARIA
CREATE TABLE public."DiaDisponible" (
  id_dia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_participacion UUID NOT NULL REFERENCES public."ParticipacionQuedada"(id_participacion) ON DELETE CASCADE,
  fecha DATE NOT NULL
);

CREATE TABLE public."PeriodoHorasDisponible" (
  id_periodo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_dia UUID NOT NULL REFERENCES public."DiaDisponible"(id_dia) ON DELETE CASCADE,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL
);

-- AVISOS
CREATE TABLE public."Aviso" (
  id_aviso UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL REFERENCES public."Usuario"(id_usuario) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  contenido TEXT,
  fecha_envio TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RECUERDOS
CREATE TABLE public."CalendarioRecuerdos" (
  id_calendario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_grupo UUID UNIQUE NOT NULL REFERENCES public."Grupo"(id_grupo) ON DELETE CASCADE,
  fecha_inicio TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public."Recuerdo" (
  id_recuerdo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_calendario UUID NOT NULL REFERENCES public."CalendarioRecuerdos"(id_calendario) ON DELETE CASCADE,
  descripcion TEXT,
  fecha_recuerdo TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public."FotoRecuerdo" (
  id_foto UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_recuerdo UUID NOT NULL REFERENCES public."Recuerdo"(id_recuerdo) ON DELETE CASCADE,
  comentario TEXT,
  url_foto TEXT NOT NULL,
  activa BOOLEAN DEFAULT TRUE
);

CREATE TABLE public."FotoDescartada" (
  id_foto_desc UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_recuerdo UUID NOT NULL REFERENCES public."Recuerdo"(id_recuerdo) ON DELETE CASCADE,
  url_foto TEXT NOT NULL,
  posicion_cola INTEGER
);

-- FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."Usuario" (id_usuario, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public."Usuario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public."Usuario" FOR SELECT USING (auth.uid() = id_usuario);
CREATE POLICY "Users update own profile" ON public."Usuario" FOR UPDATE USING (auth.uid() = id_usuario);
