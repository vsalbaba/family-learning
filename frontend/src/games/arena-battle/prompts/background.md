# Prompt — Background (hrady + lane)

Pozadí se skládá ze tří samostatných sprite souborů. Všechny sdílejí stejný vizuální styl.

---

## Společný styl

Anime-inspired pixel art. Pohádkový, jasný, dětsky přívětivý. Čisté barvy, výrazné obrysy. Pozadí musí být čitelné i při malém zobrazení a nesmí vizuálně soupeřit s jednotkami v popředí — spíše tlumené, méně detailní než postavy.

**Pozadí všech spritů:** Čistá magenta (RGB 255, 0, 255). Žádná průhlednost, žádný anti-aliasing proti magentě.

---

## 1. castle-good.png — Hrad hráče (levý)

**Rozměr:** 60 × 200 px

Malý pohádkový hrad na levém okraji bojiště. Modrá/stříbrná barevná paleta (odpovídá hráčovým jednotkám).

**Popis:**
- Kamenné zdivo ve spodní části (šedé/modré kameny)
- Jedna věž s modrou střechou nahoře
- Malá brána uprostřed (tmavý otvor, odkud vycházejí jednotky)
- Vlajka na věži — modrá/stříbrná
- Celkový dojem: bezpečný, "domovský" hrad
- Styl: jednoduchý, ne příliš detailní — jde o pozadí

**Omezení:**
- Přesně 60 × 200 px
- Magenta pozadí (255, 0, 255)
- Pixel art, viditelné pixely

---

## 2. castle-evil.png — Hrad nepřítele (pravý)

**Rozměr:** 60 × 200 px

Temný hrad na pravém okraji bojiště. Červená/tmavá barevná paleta (odpovídá nepřátelským jednotkám).

**Popis:**
- Tmavé kamenné zdivo (černé/tmavě šedé kameny)
- Jedna věž s červenou/černou střechou, možná s rohy nebo ostny
- Temná brána uprostřed (odkud vycházejí nepřátelé)
- Vlajka na věži — červená/černá, roztrhaná
- Celkový dojem: hrozivý, nepřátelský hrad
- Styl: jednoduchý, pozadí

**Omezení:**
- Přesně 60 × 200 px
- Magenta pozadí (255, 0, 255)
- Pixel art, viditelné pixely

---

## 3. lane.png — Turnajová dráha (střed)

**Rozměr:** 680 × 200 px

Horizontální dráha mezi hrady, po které se pohybují jednotky. Vypadá jako turnajové kolbiště / jousting track.

**Popis:**
- **Země (střed):** Udusaná hlína / písek — béžová/hnědá barva, mírně texturovaná (ne jednotvárná). Zabírá zhruba prostředních 120 px (y = 40..160).
- **Horní plot (y = 0..40):** Dřevěný plot / ohrazení nahoře. Horizontální dřevěné trámy s vertikálními kůly. Hnědá barva, jednoduché. Plot je nízký — naznačuje hranici, ne zeď.
- **Dolní plot (y = 160..200):** Stejný dřevěný plot dole, zrcadlový k hornímu.
- **Detaily (volitelné):** Pár trsů trávy u plotů. Občasný kamínek na zemi. Stopy v hlíně. Vše velmi subtilní — nesmí rušit jednotky.
- Dráha se opakuje horizontálně (tileable) — levý a pravý okraj na sebe navazují, protože dráha je delší než viewport.

**Omezení:**
- Přesně 680 × 200 px
- Magenta pozadí pouze tam, kde NENÍ součást dráhy (tj. prakticky nikde — celý obrázek je vyplněný dráhou)
- Pixel art, viditelné pixely
- Tlumené barvy — pozadí nesmí soupeřit s jednotkami

---

## Shrnutí souborů

| Soubor | Rozměr | Popis |
|--------|--------|-------|
| `castle-good.png` | 60 × 200 | Modrý pohádkový hrad (hráč, levý) |
| `castle-evil.png` | 60 × 200 | Temný hrad (nepřítel, pravý) |
| `lane.png` | 680 × 200 | Turnajová dráha s ploty nahoře a dole |

**Celkové složení na canvasu (800 × 200):**
```
[castle-good 60px] [lane 680px] [castle-evil 60px]
```

## Poznámky pro implementaci

- Renderer aktuálně kreslí hrady jako barevné obdélníky a pozadí jako jednobarevnou plochu. Tyto sprity je nahradí.
- Hrady se vykreslí jako `drawImage` na pozicích x=0 (good) a x=740 (evil).
- Lane se vykreslí na x=60, y=0 jako pozadí mezi hrady.
- Pokud sprite chybí, renderer zachová aktuální fallback (barevné obdélníky).
