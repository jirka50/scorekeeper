# Baseball Scorekeeper – webová verze

Zápis t-ballových zápasů pro více týmů. Správce spravuje týmy, každý tým má zapisovatele s vlastním kódem a rodiče sledují živé skóre na odkazu svého týmu.

## Soubory
- `index.html`, `app.js`, `app.css` – aplikace
- `manifest.json`, `sw.js`, `icon*.png`, `apple-touch-icon.png`, `favicon*` – instalace na plochu telefonu a práce bez signálu
- `database.rules.json` – pravidla zabezpečení pro Firebase (vkládají se do konzole Firebase, na web se nenahrávají, ale nevadí, když tam jsou)

## Role
- **Správce** – kód správce si zvolíš při prvním spuštění. Vidí všechny týmy, zakládá týmy a kódy zapisovatelů.
- **Zapisovatel** – přihlásí se kódem svého týmu. Vidí a zapisuje jen svůj tým.
- **Rodiče** – odkaz `…/?tym=<id týmu>`, jen tabule se skóre a čísla dresů, bez jmen.
