-BLOQUE ASISTENTE-
 
Gestión del contexto (el factor de mayor impacto)
 
Lo primero que hay que entender es que el coste no viene tanto de lo que tú escribes, sino de todo el contexto que el IDE manda automáticamente al modelo: archivo activo, tabs abiertas, historial de conversación, schemas de herramientas. Copilot construye cada respuesta usando contexto recopilado automáticamente del entorno del desarrollado.
Cerrar tabs que no estés usando activamente (cada archivo abierto infla el payload), no abrir archivos generados solo como referencia, y usar content exclusion rules a nivel enterprise u organización para excluir directorios como target/, archivos .xml, .yml, .log, secrets, builds.
 
 
Selección de modelo
 
Para tareas rutinarias un modelo estándar es suficiente. Los modelos frontier consumen multiplicadores significativamente mayores. La idea es usar un modelo ligero como default y escalar a frontier solo cuando necesitas razonamiento complejo o arquitectura
Prompts concisos y en inglés
el inglés es más eficiente en tokenización (aproximadamente 1 token ≈ 0.75 palabras en inglés, mientras que en español la ratio es peor porque los tokenizers están entrenados predominantemente en inglés). Pero además, el prompt en sí importa: "What's on my calendar today?" cuesta unos 8 tokens, pero "Could you please provide me with a comprehensive overview of my scheduled appointments for today?" sube a 18
 
 
Plan mode vs Agent mode
 
En VS Code y Copilot CLI, plan mode mejora la eficiencia y el éxito de las tareas, reduciendo el consumo total de tokens. Agent mode lanza múltiples llamadas al modelo, lee archivos, ejecuta comandos,  cada iteración es más contexto acumulado. Plan mode piensa primero, ejecuta después. Las herramientas paralelizadas generan un consumo mucho mayor de tokens y deberían usarse con moderación. [GitHubGitHub](https://teams.public.onecdn.static.microsoft/evergreen-assets/safelinks/2/atp-safelinks.html)
 
 
Compact / resumen de conversación
 
En sesiones largas, el historial de conversación crece y se reenvía completo en cada turno. La complejidad de atención escala cuadráticamente con la longitud del contexto. /compact resume el historial.  Iniciar conversaciones nuevas frecuentemente en vez de mantener un chat eterno, o ser explícito pidiendo respuestas cortas.
GitHub ahora genera un artefacto token-usage.jsonl con un registro por llamada API que contiene input tokens, output tokens, cache-read, cache-write, modelo, proveedor y timestamps. No puedes optimizar lo que no mides. Instalar copilot-token-audit y copilot-token-optimizer te da visibilidad inmediata. [GitHub](https://github.blog/ai-and-ml/github-copilot/improving-token-efficiency-in-github-agentic-workflows/)
 
 
Reducir el toolset disponible
 
Cada schema de herramienta añade aproximadamente 2.5-3K(ahora menos) tokens al system prompt, y se repite en cada turno del agente. El workflow "Token Optimizer" de GitHub consumía 14.9M tokens en una sola ejecución, y una de las mayores optimizaciones fue reducir el toolset de 22 herramientas por defecto a solo las que el workflow realmente necesitaba. [GitHubGitHub](https://teams.public.onecdn.static.microsoft/evergreen-assets/safelinks/2/atp-safelinks.html)
Referenciación de Símbolos en lugar de Archivos Completos: En lugar de indexar todo un archivo de 2000 líneas, usa herramientas de @mention (o equivalentes) para referenciar solo la definición de una función o una interfaz específica.
-BLOQUE  ORQUESTACION-
Structured outputs / JSON mode. Pedir respuestas en JSON o formatos estructurados en vez de lenguaje natural reduce el consumo de tokens y mejora la fiabilidad del parseo. Equipos que implementan esto consiguen reducciones del 20-30%. En vez de "explícame qué cambios necesita este código", pide { "file": "...", "line": ..., "action": "...", "code": "..." }. El modelo no gasta tokens siendo educado ni repitiendo tu pregunta. [Maxim Articles](https://www.getmaxim.ai/articles/reduce-llm-cost-and-latency-a-comprehensive-guide-for-2026/)
 
 
Prompt caching
 
Es probablemente la técnica con mayor ROI en producción. Si los tokens cacheados cuestan un 10% del precio normal y tienes un prefijo de 3000 tokens que reutilizas en 100 peticiones, pasas de 400K tokens a precio completo a ~132K equivalentes — una reducción del 67% en input. La clave: colocar el contenido estático al principio del prompt (system instructions, reglas, documentos base) y el contenido dinámico al final. No muevas timestamps ni datos variables al system prompt porque rompen la caché. Prompt Builder
Deduplicación y filtrado pre-LLM
Antes de meter chunks en el prompt del LLM, deduplica. Si tu retriever trae 5 chunks y 2 dicen básicamente lo mismo, estás pagando tokens por redundancia sin ganar calidad. Usa similarity thresholds para descartar chunks demasiado parecidos entre sí. Además, aplica un reranker para que solo los chunks verdaderamente relevantes lleguen al modelo.
 
 
Semantic caching
 
El caché semántico elimina la llamada al LLM completamente en cache hits, y los workloads de producción contienen más repetición de la que uno espera. Si 100 usuarios preguntan variaciones de lo mismo, un buen cache semántico (que matchea por embedding similarity, no por string exacto) te ahorra esas 99 llamadas restantes. [Redis](https://redis.io/blog/llm-token-optimization-speed-up-apps/)
 
 
Limitar output explícitamente
 
Tanto en la API (max_tokens) como en el prompt ("responde en máximo 3 frases", "devuelve solo el JSON, sin explicación"). Muchos tokens se gastan en que el modelo sea educado, repita la pregunta o añada disclaimers que nadie necesita.
 
 
Embeddings: elegir el modelo correcto

Un modelo de embedding ligero y bien afinado a tu dominio puede ser más eficiente en almacenamiento, más rápido en retrieval, y dar mejores resultados que uno genérico de 1536 dimensiones. [Substack](https://nandigamharikrishna.substack.com/p/rag-chunking-strategies-and-embeddings)
 
 
Compresión de contexto
 
Técnicas como LLMLingua o similares que comprimen el contexto antes de enviarlo al LLM, eliminando tokens redundantes o de baja información. También entra aquí el resumir documentos largos en una pasada barata con un modelo pequeño, y usar el resumen como contexto para el modelo grande
 
 
-COBRO-

Tokens de input se cobran cada vez que envías una petición. Eso incluye TODO lo que va en el context window: system prompt, los .prompt.md e instructions.md que se inyectan, el historial de la conversación, y tu mensaje. Se cobran una vez por petición.
 
Tokens de output lo que el modelo genera como respuesta. Se cobran a medida que se generan. (Son los mas caros)
Los tokens de razonamiento (extended thinking) son tokens que el modelo genera "pensando" antes de darte la respuesta final. Se cobran como output(pero son mucho mas baratos y no aplica en todos los modelos)
 
Tool calls / herramientas Una llamada a herramienta  genera peticiones adicionales. El flujo es: el modelo responde con "quiero llamar a esta herramienta" (output tokens) → el framework ejecuta la herramienta → mete el resultado de vuelta como input → hace otra petición al modelo con ese resultado. Así que cada tool call es potencialmente una ida y vuelta completa extra con sus propios input + output tokens.

El historial se reenvía entero en cada petición. Los LLMs no tienen memoria, cada vez que haces un turno nuevo, mandas toda la conversación anterior como input(aqui interviene cache que se paga a un 10%).