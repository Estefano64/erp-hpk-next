-- CreateTable
CREATE TABLE "planta" (
    "planta_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "direccion" VARCHAR(200),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "planta_pkey" PRIMARY KEY ("planta_id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "codigo_empleado" VARCHAR(20) NOT NULL,
    "email" VARCHAR(100),
    "dni" VARCHAR(20),
    "password" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "rol" VARCHAR(20) NOT NULL DEFAULT 'viewer',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area" (
    "area_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "planta_codigo" VARCHAR(10),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "area_pkey" PRIMARY KEY ("area_id")
);

-- CreateTable
CREATE TABLE "sub_area" (
    "sub_area_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "area_codigo" VARCHAR(10) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sub_area_pkey" PRIMARY KEY ("sub_area_id")
);

-- CreateTable
CREATE TABLE "unidad_medida" (
    "unidad_medida_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "abreviatura" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "unidad_medida_pkey" PRIMARY KEY ("unidad_medida_id")
);

-- CreateTable
CREATE TABLE "moneda" (
    "moneda_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "simbolo" VARCHAR(10),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "moneda_pkey" PRIMARY KEY ("moneda_id")
);

-- CreateTable
CREATE TABLE "fabricante" (
    "fabricante_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "pais" VARCHAR(100),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fabricante_pkey" PRIMARY KEY ("fabricante_id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "categoria_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("categoria_id")
);

-- CreateTable
CREATE TABLE "clasificacion" (
    "clasificacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clasificacion_pkey" PRIMARY KEY ("clasificacion_id")
);

-- CreateTable
CREATE TABLE "status_equipo" (
    "status_equipo_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "status_equipo_pkey" PRIMARY KEY ("status_equipo_id")
);

-- CreateTable
CREATE TABLE "tipo_equipo" (
    "tipo_equipo_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_equipo_pkey" PRIMARY KEY ("tipo_equipo_id")
);

-- CreateTable
CREATE TABLE "criticidad" (
    "criticidad_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "nivel" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "criticidad_pkey" PRIMARY KEY ("criticidad_id")
);

-- CreateTable
CREATE TABLE "status_estrategia" (
    "status_estrategia_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "status_estrategia_pkey" PRIMARY KEY ("status_estrategia_id")
);

-- CreateTable
CREATE TABLE "tipo_estrategia" (
    "tipo_estrategia_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_estrategia_pkey" PRIMARY KEY ("tipo_estrategia_id")
);

-- CreateTable
CREATE TABLE "tipo_tarea" (
    "tipo_tarea_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_tarea_pkey" PRIMARY KEY ("tipo_tarea_id")
);

-- CreateTable
CREATE TABLE "tipo_cod_rep" (
    "tipo_cod_rep_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_cod_rep_pkey" PRIMARY KEY ("tipo_cod_rep_id")
);

-- CreateTable
CREATE TABLE "categoria_cod_rep" (
    "categoria_cod_rep_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_cod_rep_pkey" PRIMARY KEY ("categoria_cod_rep_id")
);

-- CreateTable
CREATE TABLE "flota_equipo" (
    "flota_equipo_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "flota_equipo_pkey" PRIMARY KEY ("flota_equipo_id")
);

-- CreateTable
CREATE TABLE "posicion" (
    "posicion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "posicion_pkey" PRIMARY KEY ("posicion_id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "cliente_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "razon_social" VARCHAR(200) NOT NULL,
    "nombre_comercial" VARCHAR(200),
    "ruc" VARCHAR(20),
    "direccion" VARCHAR(300),
    "telefono" VARCHAR(50),
    "email" VARCHAR(100),
    "contacto_principal" VARCHAR(200),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("cliente_id")
);

-- CreateTable
CREATE TABLE "garantia" (
    "garantia_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "garantia_pkey" PRIMARY KEY ("garantia_id")
);

-- CreateTable
CREATE TABLE "atencion_reparacion" (
    "atencion_reparacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "atencion_reparacion_pkey" PRIMARY KEY ("atencion_reparacion_id")
);

-- CreateTable
CREATE TABLE "tipo_reparacion" (
    "tipo_reparacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_reparacion_pkey" PRIMARY KEY ("tipo_reparacion_id")
);

-- CreateTable
CREATE TABLE "tipo_garantia" (
    "tipo_garantia_id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_garantia_pkey" PRIMARY KEY ("tipo_garantia_id")
);

-- CreateTable
CREATE TABLE "prioridad_atencion" (
    "prioridad_atencion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "nivel" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "prioridad_atencion_pkey" PRIMARY KEY ("prioridad_atencion_id")
);

-- CreateTable
CREATE TABLE "base_metalica" (
    "base_metalica_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "base_metalica_pkey" PRIMARY KEY ("base_metalica_id")
);

-- CreateTable
CREATE TABLE "ot_status" (
    "ot_status_id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ot_status_pkey" PRIMARY KEY ("ot_status_id")
);

-- CreateTable
CREATE TABLE "recursos_status" (
    "recursos_status_id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "recursos_status_pkey" PRIMARY KEY ("recursos_status_id")
);

-- CreateTable
CREATE TABLE "taller_status" (
    "taller_status_id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "taller_status_pkey" PRIMARY KEY ("taller_status_id")
);

-- CreateTable
CREATE TABLE "material" (
    "material_id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "descripcion_compuesta" TEXT,
    "descripcion" TEXT NOT NULL,
    "planta_codigo" VARCHAR(10) NOT NULL,
    "area_codigo" VARCHAR(10) NOT NULL,
    "categoria_codigo" VARCHAR(10) NOT NULL,
    "clasificacion_codigo" VARCHAR(10) NOT NULL,
    "punto_reposicion" DECIMAL(10,2),
    "stock_maximo" DECIMAL(10,2),
    "unidad_medida_codigo" VARCHAR(10) NOT NULL,
    "plazo_entrega" INTEGER,
    "precio" DECIMAL(15,4),
    "moneda_codigo" VARCHAR(10),
    "fabricante_codigo" VARCHAR(20),
    "np" VARCHAR(100),
    "modelo" VARCHAR(100),
    "caja" VARCHAR(50),
    "stock_actual" DECIMAL(10,2) DEFAULT 0,
    "ubicacion" VARCHAR(50),
    "activo" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_pkey" PRIMARY KEY ("material_id")
);

-- CreateTable
CREATE TABLE "equipo" (
    "equipo_id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "status_codigo" VARCHAR(10) NOT NULL,
    "area_codigo" VARCHAR(10) NOT NULL,
    "sub_area_codigo" VARCHAR(10),
    "tipo_codigo" VARCHAR(10) NOT NULL,
    "fecha_inicio" DATE,
    "fecha_fabricacion" DATE,
    "fabricante_codigo" VARCHAR(20),
    "modelo" VARCHAR(100),
    "numero_serie" VARCHAR(100),
    "numero_parte" VARCHAR(100),
    "capacidad" DECIMAL(10,2),
    "unidad_medida_codigo" VARCHAR(10),
    "observaciones" TEXT,
    "planta_codigo" VARCHAR(10) NOT NULL,
    "criticidad_codigo" VARCHAR(10),

    CONSTRAINT "equipo_pkey" PRIMARY KEY ("equipo_id")
);

-- CreateTable
CREATE TABLE "estrategia" (
    "estrategia_id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "area_codigo" VARCHAR(10) NOT NULL,
    "equipo_codigo" VARCHAR(50) NOT NULL,
    "actividad_codigo" VARCHAR(50) NOT NULL,
    "frecuencia" INTEGER NOT NULL,
    "unidad_medida_codigo" VARCHAR(10) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo_estrategia_codigo" VARCHAR(10) NOT NULL,
    "status_codigo" VARCHAR(10) NOT NULL,
    "fecha_ultima_ejecucion" DATE,
    "fecha_proxima_ejecucion" DATE,

    CONSTRAINT "estrategia_pkey" PRIMARY KEY ("estrategia_id")
);

-- CreateTable
CREATE TABLE "tarea" (
    "tarea_id" SERIAL NOT NULL,
    "actividad_codigo" VARCHAR(50) NOT NULL,
    "cod_rep_codigo" VARCHAR(50),
    "np_cod1" VARCHAR(100),
    "np_cod2" VARCHAR(100),
    "id_tubo" VARCHAR(50),
    "od_vas" VARCHAR(50),
    "descripcion" TEXT NOT NULL,
    "item_numero" INTEGER NOT NULL,
    "tipo_codigo" VARCHAR(10) NOT NULL,
    "material_codigo" VARCHAR(50),
    "requerimiento" DECIMAL(10,2) NOT NULL,
    "ref_descripcion" TEXT,
    "np" VARCHAR(100),
    "texto" TEXT,
    "precio" DECIMAL(12,2),

    CONSTRAINT "tarea_pkey" PRIMARY KEY ("tarea_id")
);

-- CreateTable
CREATE TABLE "codigo_reparacion" (
    "cod_rep_id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo_codigo" VARCHAR(10) NOT NULL,
    "categoria_codigo" VARCHAR(10) NOT NULL,
    "flota_codigo" VARCHAR(10) NOT NULL,
    "fabricante_codigo" VARCHAR(20),
    "np" VARCHAR(100),
    "posicion_codigo" VARCHAR(10),
    "precio" DECIMAL(15,4),
    "moneda_codigo" VARCHAR(10),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_reparacion_pkey" PRIMARY KEY ("cod_rep_id")
);

-- CreateTable
CREATE TABLE "orden_trabajo" (
    "id" SERIAL NOT NULL,
    "ot" VARCHAR(50),
    "id_cliente" INTEGER,
    "estrategia" BOOLEAN,
    "id_cod_rep" INTEGER,
    "tipo" VARCHAR(100),
    "np" VARCHAR(100),
    "descripcion" TEXT,
    "id_fabricante" INTEGER,
    "cod_rep_flota" VARCHAR(100),
    "cod_rep_posicion" VARCHAR(100),
    "equipo_codigo" VARCHAR(100),
    "ns" VARCHAR(100),
    "plaqueteo" VARCHAR(100),
    "wo_cliente" VARCHAR(100),
    "po_cliente" VARCHAR(100),
    "id_viajero" VARCHAR(100),
    "guia_remision" VARCHAR(100),
    "empresa_entrega" VARCHAR(200),
    "fecha_recepcion" DATE,
    "pcr" DECIMAL(10,2),
    "horas" DECIMAL(10,2),
    "porcentaje_pcr" DECIMAL(5,2),
    "garantia_codigo" VARCHAR(10),
    "atencion_reparacion_codigo" VARCHAR(50),
    "tipo_reparacion_codigo" VARCHAR(20),
    "tipo_garantia_codigo" VARCHAR(30),
    "prioridad_atencion_codigo" VARCHAR(10),
    "contrato_dias" INTEGER,
    "base_metalica_codigo" VARCHAR(30),
    "comentarios" TEXT,
    "fecha_requerimiento_cliente" DATE,
    "fecha_reprogramada" DATE,
    "ot_status_codigo" VARCHAR(50),
    "recursos_status_codigo" VARCHAR(50),
    "taller_status_codigo" VARCHAR(50),
    "usuario_crea" VARCHAR(100),
    "fecha_creacion" DATE DEFAULT CURRENT_TIMESTAMP,
    "usuario_actualiza" VARCHAR(100),
    "fecha_actualizacion" DATE,
    "fecha_evaluacion" DATE,
    "evaluador" VARCHAR(100),
    "nro_informe_evaluacion" VARCHAR(100),
    "fecha_entrega_informe" DATE,
    "dias_evaluacion" INTEGER,
    "reparacion_cil" VARCHAR(10),
    "reparacion_vas" VARCHAR(10),
    "reparacion_tapa" VARCHAR(10),
    "reparacion_piston" VARCHAR(10),
    "nro_cotizacion" VARCHAR(100),
    "monto_cotizacion" DECIMAL(15,2),
    "fecha_cotizacion" DATE,
    "dias_cotizacion" INTEGER,
    "fecha_aprobacion" DATE,
    "dias_aprobacion" INTEGER,
    "fecha_req_1" DATE,
    "fecha_req_2" DATE,
    "fecha_llegada_repuestos" DATE,
    "dias_proceso" INTEGER,
    "fecha_entrega" DATE,
    "cumplimiento" VARCHAR(20),
    "nro_informe_entrega" VARCHAR(100),
    "guia_entrega_salida" VARCHAR(100),
    "nro_factura" VARCHAR(100),
    "fecha_facturacion" DATE,
    "dias_en_taller" INTEGER,
    "pct_cilindro" DECIMAL(5,2) DEFAULT 0,
    "pct_vastago" DECIMAL(5,2) DEFAULT 0,
    "pct_tapa" DECIMAL(5,2) DEFAULT 0,
    "pct_piston" DECIMAL(5,2) DEFAULT 0,
    "pct_cuerpo_int_1" DECIMAL(5,2) DEFAULT 0,
    "pct_cuerpo_int_2" DECIMAL(5,2) DEFAULT 0,
    "pct_otros" DECIMAL(5,2) DEFAULT 0,

    CONSTRAINT "orden_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "almacenes" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "capacidad" DECIMAL(10,2) NOT NULL,
    "ocupacion" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "zonas" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" VARCHAR(200) NOT NULL,
    "estado" VARCHAR(10) NOT NULL DEFAULT 'Activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "almacenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "ruc" VARCHAR(11) NOT NULL,
    "razonSocial" VARCHAR(200) NOT NULL,
    "contacto" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "direccion" TEXT,
    "estado" VARCHAR(10) NOT NULL DEFAULT 'Activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras" (
    "id" SERIAL NOT NULL,
    "numero_po" VARCHAR(50) NOT NULL,
    "numero_req" VARCHAR(50),
    "ot_id" INTEGER,
    "proveedor_id" INTEGER NOT NULL,
    "fecha_solicitud" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_entrega_esperada" DATE,
    "fecha_entrega_real" DATE,
    "almacen_id" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "nro_factura" VARCHAR(100),
    "nro_guia" VARCHAR(100),
    "observaciones" TEXT,
    "usuario_solicita" VARCHAR(100) NOT NULL,
    "usuario_aprueba" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_detalle" (
    "id" SERIAL NOT NULL,
    "compra_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(12,2) DEFAULT 0,
    "impuesto" DECIMAL(12,2) DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compras_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" SERIAL NOT NULL,
    "numero_oc" VARCHAR(50) NOT NULL,
    "fecha_orden" DATE NOT NULL,
    "fecha_entrega_requerida" DATE,
    "proveedor_id" INTEGER NOT NULL,
    "contacto_proveedor" VARCHAR(200),
    "material_id" INTEGER,
    "descripcion" TEXT,
    "cantidad" DECIMAL(12,4),
    "unidad_medida" VARCHAR(20),
    "precio_unitario" DECIMAL(14,4),
    "subtotal" DECIMAL(14,2),
    "igv_porcentaje" DECIMAL(5,2) DEFAULT 18,
    "descuento_porcentaje" DECIMAL(5,2) DEFAULT 0,
    "total_final" DECIMAL(14,2),
    "forma_pago" VARCHAR(50),
    "plazo_pago" INTEGER,
    "moneda" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "almacen_id" INTEGER,
    "direccion_entrega" TEXT,
    "incoterm" VARCHAR(10),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "prioridad" VARCHAR(10) NOT NULL DEFAULT 'media',
    "tipo_compra" VARCHAR(30),
    "observaciones" TEXT,
    "user_crea" VARCHAR(100),
    "ot_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "tipo_movimiento" VARCHAR(10) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "documento_referencia" VARCHAR(50),
    "observacion" TEXT,
    "usuario" VARCHAR(50) NOT NULL,
    "fecha_movimiento" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "herramientas" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "asignadas" INTEGER NOT NULL DEFAULT 0,
    "estado" VARCHAR(15) NOT NULL DEFAULT 'Disponible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "herramientas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ot_historial" (
    "id" SERIAL NOT NULL,
    "ot_id" INTEGER NOT NULL,
    "tipo_operacion" VARCHAR(50) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "usuario" VARCHAR(100) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datos_adicionales" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ot_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ot_repuestos" (
    "id" SERIAL NOT NULL,
    "ot_id" INTEGER NOT NULL,
    "material_id" INTEGER,
    "material_codigo" VARCHAR(20),
    "nro_req" VARCHAR(50),
    "item_req" INTEGER,
    "tipo_codigo" VARCHAR(10),
    "cantidad" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT,
    "texto" TEXT,
    "fabricante_codigo" VARCHAR(50),
    "unidad_medida" VARCHAR(20) DEFAULT 'UNIDAD',
    "fecha_solicitud" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_requerida" DATE,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'REV',
    "estado_cot" VARCHAR(20),
    "po_id" INTEGER,
    "nro_oc" VARCHAR(50),
    "item_oc" INTEGER,
    "proveedor_id" INTEGER,
    "precio_unitario" DECIMAL(15,4),
    "precio_venta" DECIMAL(15,4),
    "moneda" VARCHAR(10) DEFAULT 'USD',
    "t_req" DECIMAL(10,2),
    "t_oc" DECIMAL(10,2),
    "t_total" DECIMAL(10,2),
    "t_almacenaje" DECIMAL(10,2),
    "t_armado" DECIMAL(10,2),
    "t_fact" DECIMAL(10,2),
    "fecha_oc" DATE,
    "fecha_entrega_esperada" DATE,
    "fecha_entrega_real" DATE,
    "fecha_salida_almacen" DATE,
    "fecha_envio_mina" DATE,
    "fecha_facturacion" DATE,
    "nro_guia" VARCHAR(100),
    "nro_factura_proveedor" VARCHAR(100),
    "factura_cliente" VARCHAR(100),
    "gr_mina" VARCHAR(100),
    "evaluador" VARCHAR(100),
    "es_adicional" BOOLEAN DEFAULT false,
    "ubicacion" VARCHAR(50),
    "observaciones" TEXT,
    "usuario_solicita" VARCHAR(100) NOT NULL,
    "usuario_aprueba" VARCHAR(100),
    "fecha_aprobacion" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ot_repuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planificacion_ot" (
    "id" SERIAL NOT NULL,
    "ot_id" INTEGER NOT NULL,
    "componente" VARCHAR(10) NOT NULL,
    "operacion_codigo" VARCHAR(20) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "tipo_reparacion" VARCHAR(10),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "horas_estimadas" DECIMAL(5,1),
    "fecha_inicio" TIMESTAMP,
    "fecha_fin" TIMESTAMP,
    "tecnico" VARCHAR(100),
    "maquina" VARCHAR(50),
    "estado" VARCHAR(30) DEFAULT 'Pendiente',
    "observaciones" TEXT,
    "semana_plan" VARCHAR(10),
    "qty_personal" INTEGER DEFAULT 1,
    "horas_extras" BOOLEAN DEFAULT false,
    "horas_extras_qty" DECIMAL(5,1),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planificacion_ot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "cod_rep_id" INTEGER,
    "fecha_inicio" DATE NOT NULL,
    "fecha_termino" DATE NOT NULL,
    "dias_reparacion" INTEGER NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planta_codigo_key" ON "planta"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigo_empleado_key" ON "usuarios"("codigo_empleado");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_key" ON "usuarios"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "area_codigo_key" ON "area"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sub_area_codigo_key" ON "sub_area"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_medida_codigo_key" ON "unidad_medida"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "moneda_codigo_key" ON "moneda"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "fabricante_codigo_key" ON "fabricante"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_codigo_key" ON "categoria"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "clasificacion_codigo_key" ON "clasificacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "status_equipo_codigo_key" ON "status_equipo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_equipo_codigo_key" ON "tipo_equipo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "criticidad_codigo_key" ON "criticidad"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "status_estrategia_codigo_key" ON "status_estrategia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_estrategia_codigo_key" ON "tipo_estrategia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_tarea_codigo_key" ON "tipo_tarea"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_cod_rep_codigo_key" ON "tipo_cod_rep"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_cod_rep_codigo_key" ON "categoria_cod_rep"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "flota_equipo_codigo_key" ON "flota_equipo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "posicion_codigo_key" ON "posicion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_codigo_key" ON "cliente"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "garantia_codigo_key" ON "garantia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "atencion_reparacion_codigo_key" ON "atencion_reparacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_reparacion_codigo_key" ON "tipo_reparacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_garantia_codigo_key" ON "tipo_garantia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "prioridad_atencion_codigo_key" ON "prioridad_atencion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "base_metalica_codigo_key" ON "base_metalica"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ot_status_codigo_key" ON "ot_status"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "recursos_status_codigo_key" ON "recursos_status"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "taller_status_codigo_key" ON "taller_status"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "material_codigo_key" ON "material"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "equipo_codigo_key" ON "equipo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "estrategia_codigo_key" ON "estrategia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_reparacion_codigo_key" ON "codigo_reparacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "almacenes_codigo_key" ON "almacenes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_ruc_key" ON "proveedores"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "compras_numero_po_key" ON "compras"("numero_po");

-- CreateIndex
CREATE INDEX "compras_numero_po_idx" ON "compras"("numero_po");

-- CreateIndex
CREATE INDEX "compras_estado_idx" ON "compras"("estado");

-- CreateIndex
CREATE INDEX "compras_ot_id_idx" ON "compras"("ot_id");

-- CreateIndex
CREATE INDEX "compras_detalle_compra_id_idx" ON "compras_detalle"("compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_numero_oc_key" ON "ordenes_compra"("numero_oc");

-- CreateIndex
CREATE UNIQUE INDEX "herramientas_codigo_key" ON "herramientas"("codigo");

-- CreateIndex
CREATE INDEX "ot_historial_ot_id_idx" ON "ot_historial"("ot_id");

-- CreateIndex
CREATE INDEX "ot_historial_fecha_idx" ON "ot_historial"("fecha");

-- CreateIndex
CREATE INDEX "ot_repuestos_ot_id_idx" ON "ot_repuestos"("ot_id");

-- CreateIndex
CREATE INDEX "ot_repuestos_nro_req_idx" ON "ot_repuestos"("nro_req");

-- CreateIndex
CREATE INDEX "ot_repuestos_estado_idx" ON "ot_repuestos"("estado");

-- CreateIndex
CREATE INDEX "ot_repuestos_po_id_idx" ON "ot_repuestos"("po_id");

-- CreateIndex
CREATE INDEX "ot_repuestos_nro_oc_idx" ON "ot_repuestos"("nro_oc");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_codigo_key" ON "contrato"("codigo");

-- CreateIndex
CREATE INDEX "contrato_cliente_id_idx" ON "contrato"("cliente_id");

-- CreateIndex
CREATE INDEX "contrato_codigo_idx" ON "contrato"("codigo");

-- CreateIndex
CREATE INDEX "contrato_cod_rep_id_idx" ON "contrato"("cod_rep_id");

-- CreateIndex
CREATE INDEX "contrato_cliente_id_cod_rep_id_idx" ON "contrato"("cliente_id", "cod_rep_id");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_planta_codigo_fkey" FOREIGN KEY ("planta_codigo") REFERENCES "planta"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_area" ADD CONSTRAINT "sub_area_area_codigo_fkey" FOREIGN KEY ("area_codigo") REFERENCES "area"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_planta_codigo_fkey" FOREIGN KEY ("planta_codigo") REFERENCES "planta"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_area_codigo_fkey" FOREIGN KEY ("area_codigo") REFERENCES "area"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_categoria_codigo_fkey" FOREIGN KEY ("categoria_codigo") REFERENCES "categoria"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_clasificacion_codigo_fkey" FOREIGN KEY ("clasificacion_codigo") REFERENCES "clasificacion"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_unidad_medida_codigo_fkey" FOREIGN KEY ("unidad_medida_codigo") REFERENCES "unidad_medida"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_moneda_codigo_fkey" FOREIGN KEY ("moneda_codigo") REFERENCES "moneda"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_fabricante_codigo_fkey" FOREIGN KEY ("fabricante_codigo") REFERENCES "fabricante"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_status_codigo_fkey" FOREIGN KEY ("status_codigo") REFERENCES "status_equipo"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_area_codigo_fkey" FOREIGN KEY ("area_codigo") REFERENCES "area"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_sub_area_codigo_fkey" FOREIGN KEY ("sub_area_codigo") REFERENCES "sub_area"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_tipo_codigo_fkey" FOREIGN KEY ("tipo_codigo") REFERENCES "tipo_equipo"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_fabricante_codigo_fkey" FOREIGN KEY ("fabricante_codigo") REFERENCES "fabricante"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_unidad_medida_codigo_fkey" FOREIGN KEY ("unidad_medida_codigo") REFERENCES "unidad_medida"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_planta_codigo_fkey" FOREIGN KEY ("planta_codigo") REFERENCES "planta"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_criticidad_codigo_fkey" FOREIGN KEY ("criticidad_codigo") REFERENCES "criticidad"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_area_codigo_fkey" FOREIGN KEY ("area_codigo") REFERENCES "area"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_equipo_codigo_fkey" FOREIGN KEY ("equipo_codigo") REFERENCES "equipo"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_unidad_medida_codigo_fkey" FOREIGN KEY ("unidad_medida_codigo") REFERENCES "unidad_medida"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_tipo_estrategia_codigo_fkey" FOREIGN KEY ("tipo_estrategia_codigo") REFERENCES "tipo_estrategia"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_status_codigo_fkey" FOREIGN KEY ("status_codigo") REFERENCES "status_estrategia"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_cod_rep_codigo_fkey" FOREIGN KEY ("cod_rep_codigo") REFERENCES "codigo_reparacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_tipo_codigo_fkey" FOREIGN KEY ("tipo_codigo") REFERENCES "tipo_tarea"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_material_codigo_fkey" FOREIGN KEY ("material_codigo") REFERENCES "material"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_tipo_codigo_fkey" FOREIGN KEY ("tipo_codigo") REFERENCES "tipo_cod_rep"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_categoria_codigo_fkey" FOREIGN KEY ("categoria_codigo") REFERENCES "categoria_cod_rep"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_flota_codigo_fkey" FOREIGN KEY ("flota_codigo") REFERENCES "flota_equipo"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_fabricante_codigo_fkey" FOREIGN KEY ("fabricante_codigo") REFERENCES "fabricante"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_posicion_codigo_fkey" FOREIGN KEY ("posicion_codigo") REFERENCES "posicion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_moneda_codigo_fkey" FOREIGN KEY ("moneda_codigo") REFERENCES "moneda"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("cliente_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_id_cod_rep_fkey" FOREIGN KEY ("id_cod_rep") REFERENCES "codigo_reparacion"("cod_rep_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_id_fabricante_fkey" FOREIGN KEY ("id_fabricante") REFERENCES "fabricante"("fabricante_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_garantia_codigo_fkey" FOREIGN KEY ("garantia_codigo") REFERENCES "garantia"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_atencion_reparacion_codigo_fkey" FOREIGN KEY ("atencion_reparacion_codigo") REFERENCES "atencion_reparacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_tipo_reparacion_codigo_fkey" FOREIGN KEY ("tipo_reparacion_codigo") REFERENCES "tipo_reparacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_tipo_garantia_codigo_fkey" FOREIGN KEY ("tipo_garantia_codigo") REFERENCES "tipo_garantia"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_prioridad_atencion_codigo_fkey" FOREIGN KEY ("prioridad_atencion_codigo") REFERENCES "prioridad_atencion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_base_metalica_codigo_fkey" FOREIGN KEY ("base_metalica_codigo") REFERENCES "base_metalica"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_ot_status_codigo_fkey" FOREIGN KEY ("ot_status_codigo") REFERENCES "ot_status"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_recursos_status_codigo_fkey" FOREIGN KEY ("recursos_status_codigo") REFERENCES "recursos_status"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_taller_status_codigo_fkey" FOREIGN KEY ("taller_status_codigo") REFERENCES "taller_status"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_detalle" ADD CONSTRAINT "compras_detalle_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_detalle" ADD CONSTRAINT "compras_detalle_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_historial" ADD CONSTRAINT "ot_historial_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("material_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "compras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planificacion_ot" ADD CONSTRAINT "planificacion_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("cliente_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_cod_rep_id_fkey" FOREIGN KEY ("cod_rep_id") REFERENCES "codigo_reparacion"("cod_rep_id") ON DELETE SET NULL ON UPDATE CASCADE;
