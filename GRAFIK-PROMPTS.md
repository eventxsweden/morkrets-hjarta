# Grafikprompter för Mörkrets Hjärta

Klistra in **stilprefixet** först i varje prompt så att all grafik får samma stil.
Generera en sak per bild, i kvadratiskt format (1:1).

## Stilprefix (används i alla prompter)

```
Top-down 3/4 view game sprite, dark fantasy dungeon style inspired by 90s Bullfrog games, hand-painted pixel art look, rich shadows, warm torchlight from above, limited palette of deep purples, blood red, earthy browns and gold accents, crisp readable silhouette, centered, plain transparent background, no text, no border, no UI,
```

## Rutor (sömlösa, sedda rakt uppifrån)

```
[STIL] seamless tileable square floor tile seen straight from above, rough packed dirt with small pebbles
[STIL] seamless tileable square tile, solid brown earth block with roots and cracks, seen from above
[STIL] seamless tileable square tile, earth block with glittering gold veins and nuggets
[STIL] seamless tileable square tile, impenetrable dark granite bedrock, cold and jagged
[STIL] seamless tileable square tile, glowing cyan gem crystal cluster embedded in dark rock
[STIL] seamless tileable square tile, claimed dungeon floor, dark purple flagstones with a faint red demonic sigil
[STIL] seamless tileable square tile, fortified dungeon wall, dark stone bricks with iron studs and a small skull ornament
```

## Rum (golv med möbler, sömlösa)

```
[STIL] seamless tileable square room tile, creature lair, straw beds and animal furs on stone floor
[STIL] seamless tileable square room tile, hatchery, scattered straw with plump chickens and eggs
[STIL] seamless tileable square room tile, treasury, piles of gold coins and jewels on stone floor
[STIL] seamless tileable square room tile, training room, wooden training dummies and weapon racks
[STIL] seamless tileable square room tile, dark library, bookshelves, candles and floating spellbooks
```

## Specialobjekt (större, 3×3 rutor)

```
[STIL] the Dungeon Heart, a huge pulsing red crystalline heart on a dark stone altar, veins of glowing magma, menacing and alive
[STIL] a swirling purple magic portal set in a circle of ancient runestones, sparks and mist
[STIL] a heroic stone gate with blue banners and holy light shining through, the entrance for invading heroes
```

## Varelser (dina, röd/lila ton)

```
[STIL] small mischievous red imp with a pickaxe, big ears, grinning, full body character sprite
[STIL] hulking green goblin warrior with a crude club and leather armor, full body character sprite
[STIL] dark mistress in black leather with a whip, pale skin, confident pose, full body character sprite
[STIL] hunched old warlock in a tattered purple robe with a glowing staff, full body character sprite
```

## Hjältar (inkräktare, blå/guld ton)

```
[STIL] noble human warrior in shining plate armor with a blue tabard and sword, full body character sprite
[STIL] elven archer in green and blue cloak drawing a longbow, full body character sprite
[STIL] kind human priest in white and gold robes holding a glowing holy symbol, full body character sprite
[STIL] stout bearded dwarf with a big mining pickaxe and a helmet lamp, full body character sprite
[STIL] imposing knight lord in golden armor with a crown-helmet and a large shield, full body character sprite
```

## Tips

- **Samma frö (seed):** kör alla varelser med samma seed eller stilreferens så att stilen håller ihop.
- **Storlek:** generera stort (1024 px) och skala sedan ner till 64×64 (varelser) eller 32×32 (rutor) med "nearest neighbor". Då behåller bilderna den skarpa pixelkänslan.
- **Transparens:** om verktyget inte kan ge transparent bakgrund, lägg till `on solid magenta background` och ta bort bakgrunden efteråt.
- **Sömlöst:** testa rutorna genom att lägga fyra kopior 2×2. Syns det skarvar, kör om med `perfectly seamless, edges match`.
