# Calculadora hipotecaria

Aplicación web interactiva para calcular **cualquiera** de las variables de un préstamo hipotecario a partir de las demás:

- **Cuota** periódica
- **Tipo de interés** (TIN anual; muestra también la TAE equivalente)
- **Plazo** (admite plazos no enteros: la última cuota es parcial)
- **Capital inicial**
- **Capital final** pendiente al vencimiento (cuota final / *balloon*)

## Cómo se usa

Abre `index.html` en el navegador (no necesita instalación ni conexión). Pulsa **Calcular** en la variable que quieras obtener y mueve los deslizadores del resto: todo se recalcula al instante.

Para jugar:

- Gráfico del **capital pendiente**, con opción de **fijar un escenario** y compararlo con los cambios que hagas.
- Reparto **capital vs. intereses** (donut) y **pagos por año** (barras apiladas).
- **Sensibilidad** de la cuota al tipo de interés.
- **Cuadro de amortización** anual o por cuota, exportable a CSV.
- Periodicidad mensual, trimestral, semestral o anual; tema claro/oscuro.
- El estado se guarda en la URL, así que puedes compartir un escenario copiando el enlace.

## Desarrollo

```bash
npm test     # pruebas del motor financiero (node:test)
npm start    # servidor local en http://localhost:8000
```

El cálculo vive en `js/finance.js` (sistema francés, cuota constante):
`P·(1+i)^n − PMT·((1+i)^n − 1)/i = FV`. El tipo se obtiene numéricamente por bisección.
