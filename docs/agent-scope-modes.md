# Agent Scope Modes

Este documento describe tres modos de alcance posibles para el agente ciudadano. El despliegue actual queda fijado en **Modo 1: ciudad completa factual**.

## Modo 1: Ciudad Completa Factual

### Definición
- El agente actúa como oficina de información local del municipio.
- Responde consultas factuales sobre vida local si la información está en la base vectorial.
- Puede usar fuentes no estrictamente municipales si están indexadas y son relevantes.

### Qué cubre
- Trámites y servicios públicos
- Instalaciones deportivas, culturales y de ocio
- Eventos y agenda local
- Turismo, puntos de interés y recursos del municipio
- Movilidad, equipamientos, asociaciones y comercios locales

### Routing
- Usar `local_factual` para cualquier consulta local factual, incluso si está formulada de manera subjetiva pero puede contestarse con opciones factuales.
- Reservar `out_of_scope` para política, opiniones, temas no locales o información no relacionada con el municipio.

### Prompt
- Identidad: oficina de información local.
- Regla clave: responder solo con hechos presentes en la base; no inventar ni rankear subjetivamente.

### Fallback y out-of-scope
- Si falta evidencia, responder con honestidad y derivar a teléfono, web o atención municipal.
- Si la pregunta es subjetiva, ofrecer opciones factuales sin ranking.

### Casos representativos
- “¿Dónde puedo jugar al fútbol?”
- “¿Qué eventos hay este fin de semana?”
- “¿Qué instalaciones deportivas hay en el pueblo?”
- “¿Cuál es el mejor bar?” -> responder sin ranking, solo opciones factuales si existen en la base.

## Modo 2: Servicios Públicos Ampliados

### Definición
- El agente sigue centrado en utilidad ciudadana, pero limita el alcance a instituciones, equipamientos y servicios públicos o semipúblicos.

### Qué cubre
- Ayuntamiento, trámites, oficinas, eventos públicos
- Transporte y movilidad pública
- Instalaciones municipales y recursos comunitarios
- Información cultural o deportiva organizada institucionalmente

### Routing
- `local_factual` solo para información pública, institucional o de servicio ciudadano.
- Consultas sobre comercios privados, ocio libre o recomendaciones de negocios pasan a `out_of_scope` o a respuesta conservadora.

### Prompt
- Identidad: asistente de servicios públicos locales.
- Regla clave: evitar responder sobre vida comercial o privada salvo que forme parte de un servicio público.

### Fallback y out-of-scope
- Derivar antes cuando la consulta se salga del perímetro público.
- Mantener respuesta honesta si no hay confirmación documental.

### Casos representativos
- “¿Dónde está la piscina municipal?”
- “¿Qué actividades organiza la casa de cultura?”
- “¿Qué bar me recomienda?” -> fuera de alcance.

## Modo 3: Solo Ayuntamiento

### Definición
- El agente opera como asistente institucional del ayuntamiento y responde solo a trámites, servicios y dependencias oficiales.

### Qué cubre
- Trámites administrativos
- Horarios y ubicaciones de oficinas
- Sede electrónica
- Normativa y servicios municipales formales

### Routing
- `local_factual` solo para temas claramente institucionales.
- Todo lo demás se considera `out_of_scope`.

### Prompt
- Identidad: asistente administrativo del ayuntamiento.
- Regla clave: rechazar cualquier tema no institucional aunque sea local.

### Fallback y out-of-scope
- Respuesta conservadora con derivación a canales oficiales.
- No responder sobre ocio, comercios, turismo o vida local general.

### Casos representativos
- “¿Qué horario tiene el ayuntamiento?”
- “¿Cómo pido un volante de empadronamiento?”
- “¿Dónde puedo jugar al fútbol?” -> fuera de alcance.

## Diferencias de implementación

### Routing
- Modo 1: heurísticas y prompt permiten consultas de vida local.
- Modo 2: heurísticas se restringen a servicios públicos y equipamientos institucionales.
- Modo 3: routing conservador centrado en ayuntamiento.

### Prompt
- Modo 1: oficina de información local.
- Modo 2: asistente de utilidad pública local.
- Modo 3: asistente institucional del ayuntamiento.

### Fallback
- Modo 1: reconocer límites, pero intentar orientar con recursos locales.
- Modo 2: derivar cuando la consulta se salga de lo público.
- Modo 3: derivar casi todo lo no institucional.

## Decisión actual

- Despliegue actual: **Modo 1**
- Respuesta permitida: **información factual local**
- Respuesta no permitida: **opinión subjetiva, rankings, política, datos personales, expedientes concretos y temas no locales**
