-- Quita el estado intermedio "COMPLETADA" de la hoja de evaluacion tecnica.
-- Antes el flujo era: BORRADOR -> COMPLETADA (al guardar) -> PENDIENTE_APROBACION.
-- Ahora: guardar deja la evaluacion en BORRADOR, y "solicitar revision" la lleva
-- directo a PENDIENTE_APROBACION. Los registros antiguos en COMPLETADA se
-- mueven a BORRADOR (los datos ya estaban guardados; el cambio es solo de label).
UPDATE "evaluaciones_tecnicas"
SET "estado" = 'BORRADOR'
WHERE "estado" = 'COMPLETADA';
