# Skill: First Mobile

## Descripción

Esta skill fuerza el enfoque mobile-first en todo el código de frontend y estilos. Siempre que se escriba, revise o refactorice código de UI, aplica estas reglas:

- El diseño, los breakpoints y los estilos deben priorizar la experiencia en pantallas pequeñas (móviles) antes que desktop.
- Usa unidades relativas (`rem`, `%`, `vw`, `vh`) y evita valores fijos en píxeles salvo para bordes o detalles mínimos.
- El layout debe ser vertical, con botones y campos de entrada grandes y fáciles de tocar.
- El menú y navegación deben ser accesibles y usables con el pulgar.
- Los media queries deben partir de mobile y escalar hacia desktop (`min-width` approach).
- El peso visual y la jerarquía deben ser claros en móvil.
- El testing visual y de interacción debe hacerse primero en viewport móvil.

## Ejemplo de uso

> Cuando el usuario pida un cambio de UI, primero piensa y sugiere la versión mobile, luego adapta a desktop si es necesario.

---

**Ubicación:**
.github/skills/first-mobile/SKILL.md
