/* =====================================================================
   config.js — ElectroStock
   ---------------------------------------------------------------------
   CADA EQUIPO DEBE EDITAR ESTE ARCHIVO ÚNICAMENTE.
   No hay login: la identidad de "quién soy" ahora se define aquí,
   copiando este mismo set de archivos en cada equipo y cambiando
   solo estos valores.

   - Equipos 1, 2, 3, 5, 6, 7, 8, 9  ->  ES_MATRIZ = false (sucursales)
   - Equipo 4                        ->  ES_MATRIZ = true  (Central)
   ===================================================================== */

const SUCURSAL_ACTUAL = {
    id: 7,                     // <-- Cambia esto por el número de TU equipo (1-9)
    nombre: 'Sucursal 7' // <-- Cambia esto por el nombre de TU sucursal
};

const ES_MATRIZ = false; // Solo el equipo 4 debe poner esto en true

// Nombre visible en el "badge" de usuario (ya no hay login, es solo informativo)
const OPERADOR_ACTUAL = 'Encargado de Turno';
