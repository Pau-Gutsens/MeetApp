-- ==========================================
-- SCRIPT DE ADMINISTRACIÓN: ELIMINAR USUARIO (VERSIÓN ROBUSTA)
-- ==========================================
-- 
-- 1. Ve a tu panel de control de Supabase.
-- 2. Entra en "SQL Editor".
-- 3. Pega este código.
-- 4. Cambia el correo dentro de las comillas simples por el correo del usuario que quieres ELIMINAR PARA SIEMPRE.
-- 5. Dale al botón verde de "Run".

DO $$ 
DECLARE
  target_user_id UUID;
BEGIN
  -- Buscar el ID del usuario en base a su email
  SELECT id INTO target_user_id FROM auth.users WHERE email = 'CORREO_A_ELIMINAR@ejemplo.com';

  IF target_user_id IS NOT NULL THEN
    -- Borramos a mano las tablas más nuevas que se crearon SIN "ON DELETE CASCADE"
    -- para evitar el Error 23503 que acaba de pasarte.
    DELETE FROM public."SolicitudUnion" WHERE id_usuario = target_user_id;
    
    -- Por si acaso otras tablas de grupo tampoco tienen Cascade, las forzamos:
    DELETE FROM public."MiembroGrupo" WHERE id_usuario = target_user_id;
    
    -- Ahora sí, borramos al usuario del core, lo que limpiará automáticamente 
    -- el resto de tablas viejas (Usuario, Quedadas, Participacion, Disponibilidad...)
    DELETE FROM auth.users WHERE id = target_user_id;
    
    RAISE NOTICE 'Usuario eliminado correctamente.';
  ELSE
    RAISE NOTICE 'No se ha encontrado a ningún usuario con ese correo.';
  END IF;
END $$;
