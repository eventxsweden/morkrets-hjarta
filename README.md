# Mörkrets Hjärta

En Dungeon Keeper-inspirerad prototyp som körs direkt i webbläsaren.

**▶ Spela:** https://eventxsweden.github.io/morkrets-hjarta/

## Så spelar du

- **Vänster-dra** över jord för att markera den för grävning. Dina imps gräver, hämtar guld, gör anspråk på golv och befäster murar.
- Gräv fram till **portalen** (lila, norrut) och bygg **Lya + Kläckeri** för att locka varelser.
  - Träningssal lockar Härskarinnor, Bibliotek lockar Häxmästare (som forskar fram magi).
- **Vänsterklick** på en varelse plockar upp den, **högerklick** släpper den eller ger den en örfil (den jobbar snabbare men blir sur).
- Betala lön varannan minut. Missnöjda varelser lämnar dig.
- Överlev **5 hjältevågor** från porten i öster. Försvara Dungeon-hjärtat!
- **Mellanslag** pausar, **1–3** ändrar hastighet.

## Det nya jämfört med originalet

- Varje varelse har namn och personlighet (Girig, Lat, Feg, Grälsjuk, Blodtörstig, Flitig) som påverkar hur den beter sig.
- Hjältarna anpassar sig: mycket guld lockar fler, många murar gör att de tar med dvärgar, mycket magi gör att de tar med präster.
- Befästa murar tar lång tid för hjältarna att bryta igenom, så de väljer väg därefter.

## Köra lokalt

```bash
python -m http.server 5173
```

Öppna sedan http://localhost:5173.

Grafiken är genererad i DaVinci och utklippt med `tools/cut_sprites.py`.
