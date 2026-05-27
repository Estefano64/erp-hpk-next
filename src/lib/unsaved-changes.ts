"use client";

// Aviso de cambios sin guardar.
//
// Implementación simple: un registro global de "razones" activas (por
// componente). Cualquier formulario que tenga datos sin guardar registra una
// razón cuando se modifica y la limpia al guardar / cancelar / desmontarse.
//
// Quien hace navegación (sidebar, botones internos) puede preguntar
// `confirmLeave()` antes de cambiar de ruta y mostrar un confirm nativo si
// hay razones activas. También cubrimos el cierre/refresh del navegador con
// el evento beforeunload (registrado una sola vez al cargar el módulo).

import { useEffect } from "react";

const reasons = new Map<string, string>();

function hasUnsaved(): boolean {
  return reasons.size > 0;
}

function firstReason(): string | null {
  for (const r of reasons.values()) return r;
  return null;
}

// Listener global para refresh / cierre de pestaña. El mensaje real lo decide
// el navegador (suele ser uno propio "¿Salir del sitio?"); igual prevenimos
// el default.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (ev) => {
    if (!hasUnsaved()) return;
    ev.preventDefault();
    // Algunos navegadores requieren un string en returnValue para mostrar prompt.
    ev.returnValue = firstReason() ?? "Hay cambios sin guardar";
  });
}

// Llamar antes de navegar. Devuelve true si se puede continuar, false si el
// usuario canceló. Si no hay razones activas, devuelve true sin preguntar.
export function confirmLeave(message?: string): boolean {
  if (!hasUnsaved()) return true;
  const text = message ?? firstReason() ?? "Hay cambios sin guardar. ¿Salir y descartarlos?";
  return typeof window === "undefined" ? true : window.confirm(text);
}

// Hook para que un form registre/limpie su razón. `dirty=true` activa el
// aviso; `dirty=false` lo desactiva. Al desmontar siempre se limpia.
export function useUnsavedChangesWarning(dirty: boolean, reason: string, key: string): void {
  useEffect(() => {
    if (dirty) reasons.set(key, reason);
    else reasons.delete(key);
    return () => { reasons.delete(key); };
  }, [dirty, reason, key]);
}
