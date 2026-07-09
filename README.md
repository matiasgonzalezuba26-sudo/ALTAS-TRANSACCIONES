# ALTAS / TRANSACCIONES

**Sistema de Detección de Operaciones Inusuales con IA**
Trabajo Final Integrador — Diplomatura en IA Aplicada a Entornos Digitales de Gestión
FCE-UBA · Cohorte 2026 · Área: Prevención de Lavado de Dinero

🔗 **App desplegada:** https://altas-transacciones.vercel.app/

---

## 🎯 ¿Qué hace este proyecto?

Elegí este tema porque trabajo directamente vinculado a la prevención de lavado de dinero, y en el día a día veo cómo el análisis de operaciones inusuales sigue dependiendo en gran parte de procesos manuales: cruzar contrapartes, identificar nodos compartidos y documentar los hallazgos "a mano". Esta plataforma automatiza esa primera etapa del análisis, ahorrando horas de trabajo y mejorando la calidad y consistencia de los informes.

**ALTAS/TRANSACCIONES** es una plataforma web de análisis de operaciones financieras orientada a la **detección temprana de patrones compatibles con lavado de activos**, tanto a nivel individual como en redes de empresas vinculadas que operan de forma coordinada para perder la trazabilidad de los fondos.

> ⚠️ La herramienta es un **apoyo al analista, no un reemplazo**: sugiere, visualiza y documenta, pero la decisión final siempre queda en manos humanas.

### Objetivos

- Desarrollar una herramienta de análisis accesible vía web, sin instalación local.
- Automatizar la detección de sujetos con alta transaccionalidad reciente mediante un motor de reglas determinístico.
- Incorporar visualización de redes de flujo de fondos para análisis individual y grupal.
- Generar dictámenes técnicos automáticos con narrativa dinámica según los hallazgos.
- Identificar nodos comunes entre sujetos como indicador de posibles esquemas de lavado por triangulación o convergencia.

## 🧩 Nivel de ambición

**Nivel 1 — Implementación funcional.** Aplicación web desplegada de punta a punta (frontend en Vercel, base de datos en Supabase).

## 🛠️ Herramientas de IA generativa utilizadas

| Herramienta | Rol en el proyecto |
|---|---|
| **Google Gemini** | Ideación y definición del problema; generación del prompt inicial para construir la app |
| **Google AI Studio** | Prototipo inicial funcional: interfaz visual, carga de archivos, tabla de resultados y primera versión del grafo de flujos |
| **Claude** | Refinamiento técnico avanzado: corrección de algoritmos, lógica de detección de redes y narrativa del dictamen |
| **GitHub + Vercel + Supabase** | Control de versiones, despliegue automático y base de datos en producción |

## 🚀 Cómo se usa

1. Ingresar a [altas-transacciones.vercel.app](https://altas-transacciones.vercel.app/)
2. Cargar el archivo de transacciones financieras y el padrón de sujetos analizados.
3. El sistema calcula automáticamente, para cada CUIT: días desde el alta fiscal y volumen acumulado de operaciones respecto al umbral asignado.
4. Revisar los resultados en dos niveles:
   - **Análisis individual:** sujetos con inscripción reciente y volumen que supera el umbral (tipología compatible con empresas cáscara de uso único).
   - **Análisis grupal:** redes de sujetos conectados por contrapartes compartidas, agrupadas automáticamente.
5. Exportar el reporte completo (grafo, dictamen técnico, tablas de fondos entrantes/egresos y alertas grupales) como HTML autocontenido.

## 📄 Metodología (resumen)

El desarrollo siguió un proceso iterativo de 4 fases:

1. **Definición del problema (Gemini)** — ideación y prompt inicial.
2. **Prototipo (Google AI Studio)** — primera versión funcional de interfaz, carga y grafo.
3. **Refinamiento técnico (Claude)** — ajustes clave:
   - Algoritmo **Union-Find** para agrupar sujetos por componentes conexos (reemplazando el enfoque par a par, que generaba grupos duplicados).
   - Lógica de nodos comunes entre duplas de sujetos.
   - Corrección de un bug real: el cálculo de nodos comunes ignoraba parte de las conexiones y mostraba "0 nodos" en grupos con conexiones reales.
   - Narrativa dinámica del dictamen técnico según el escenario detectado.
4. **Despliegue y validación** — commit en GitHub, deploy en Vercel, pruebas con datos sintéticos (redes de 2, 6 y 10 sujetos con distinto grado de interconexión).

## ✅ Resultados

- Motor de análisis individual y grupal funcionando en producción.
- Detección automática de redes mediante Union-Find, evitando grupos duplicados.
- Dictámenes técnicos generados automáticamente, con lenguaje orientado a informes de la Unidad de Información Financiera (UIF).
- Visualización interactiva de red de flujos, con layout adaptable según tamaño de la red.
- Exportación de reportes HTML autocontenidos.

## 🔍 Análisis crítico

**Fortalezas:** velocidad (análisis en segundos vs. horas), exhaustividad en la detección de conexiones, narrativa estandarizada entre analistas, bajo costo (stack basado en herramientas gratuitas o económicas).

**Limitaciones:** motor de reglas determinístico (no aprende de casos pasados), sin conexión en tiempo real a bases oficiales (ARCA), reporte exportado estático.

**Oportunidades:** integración con APIs de ARCA, incorporación de un módulo LLM para enriquecer el análisis de tipologías y la narrativa.

### Evaluación AIBPS

| Dimensión | Evaluación |
|---|---|
| **Ágil** | ✅ Sí — procesa en segundos análisis que manualmente demandan horas |
| **Fluida** | ✅ Sí — interfaz web sin instalación ni conocimientos técnicos |
| **Protegida** | ⚠️ Parcial — sin conexión en tiempo real a datos oficiales (ARCA); pendiente reforzar controles para producción con datos reales |
| **Bajo control humano** | ✅ Sí — el motor sugiere, visualiza y documenta; la validación final es siempre del analista |

## 💡 Conclusiones

La IA generativa demostró aportar valor concreto en un contexto técnico y de alta especialización (AML), no solo en tareas genéricas. Los mejores resultados surgieron cuando el analista definía la dirección analítica (qué estaba mal desde el punto de vista AML) y la IA resolvía la implementación. La precisión del prompt —describir comportamiento observado, esperado y contexto de negocio— fue determinante, y los errores de lógica resultaron más difíciles de detectar que los errores técnicos, ya que requerían comprensión del dominio, no solo de la tecnología.

**Principio de diseño central:** ALTAS/TRANSACCIONES sugiere, visualiza y documenta — pero no decide.

## 🔗 Links

- Repositorio: https://github.com/matiasgonzalezuba26-sudo/ALTAS-TRANSACCIONES
- Deploy: https://altas-transacciones.vercel.app/

---

*Proyecto realizado en el marco de la Diplomatura en IA Aplicada a Entornos Digitales de Gestión, FCE-UBA, Cohorte 2026.*
