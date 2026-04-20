# Arena Battle — Sprite Specification

Specifikace sprite sheetů pro minihru Aréna. Každý sprite sheet je PNG obrázek s pravidelnou mřížkou framů. Jeden řádek = jeden animační stav, sloupce = jednotlivé framy animace.

## Technické parametry

- **Formát:** PNG, průhledné pozadí (alfa kanál)
- **Velikost framu:** 128 × 128 px (jednotky i nepřátelé)
- **Efekty:** 64 × 64 px (šíp, kouzlo)
- **Orientace:** Všechny jednotky směřují **doprava**. Renderer flipne horizontálně pokud je potřeba.
- **Umístění:** `frontend/public/games/arena-battle/sprites/`
- **Pojmenování:** `{entity}.png`, varianty `{entity}-{variant}.png`
- **Pozadi** - Ciste magenta pozadi RGB 255 0 255 vhodne pro odstraneni.

## Vizuální styl

Jednoduchý, čitelný, pohádkově stylizovaný 
Anime inspired pixel art. Postava by měla být vizuálně rozlišitelná i v malé velikosti (~28–32 px na obrazovce). Preferuj výrazné siluety a kontrastní barvy. Postavy hrace v s modro-stribrnymi highlighty, postavy nepritele s cerveno-zlatymi highlighty. 

Soucasti postavicek nesmi byt pruhlednost.
---

## Hráčovy jednotky (128 × 128 px, 4 sloupce)

### pesak.png — Pěšák (easy tier, melee)

c

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | walking | 4 | Chůze doprava, pohyb nohou + meč u boku |
| 1 | attacking | 3 | Máchnutí mečem dopředu |
| 2 | hit | 2 | Zásah — postava sebou škubne / červený blik |
| 3 | dying | 4 | Pád k zemi, fade out |

**Rozměr sheetu:** 512 × 512 px (4 sloupce × 4 řádky)

### lucistnik.png — Lučištník (easy tier, ranged)

Voják s lukem. Zelený/hnědý odstín.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | walking | 4 | Chůze doprava, luk u boku |
| 1 | attacking | 3 | Natažení tětivy → výstřel |
| 2 | hit | 2 | Zásah |
| 3 | dying | 4 | Pád |

**Rozměr sheetu:** 512 × 512 px

### carodej.png — Čaroděj (hard tier, ranged splash)

Kouzelník v plášti s holí/knihou. Fialový/modrý odstín.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | walking | 4 | Chůze, plášť vlaje |
| 1 | attacking | 3 | Zvedne hůl, záblesk magie |
| 2 | hit | 2 | Zásah |
| 3 | dying | 4 | Kolaps, rozpuštění |

**Rozměr sheetu:** 512 × 512 px

### obr.png — Obr (hard tier, melee tank)

Velká robustní postava s kyjem/palicí. Hnědý/šedý odstín. Měl by vypadat masivněji než pěšák.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | walking | 4 | Těžká chůze, pomalé kroky |
| 1 | attacking | 3 | Úder palicí shora dolů |
| 2 | hit | 2 | Zásah — mírné zakolísání |
| 3 | dying | 4 | Pomalý pád |

**Rozměr sheetu:** 512 × 512 px

---

## Nepřátelé (128 × 128 px, 4 sloupce)

Všechny varianty nepřátel mají **stejnou animační strukturu** (stejné řádky, stejný počet framů), liší se jen vizuálně. To umožňuje sdílet jednu definici v kódu.

### enemy-skeleton.png — Kostlivec (základní nepřítel)

Kostra s mečem. Tmavě červený/šedý odstín.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | spawning | 3 | Vyleze ze země / materializace |
| 1 | walking | 4 | Chůze doleva (sprite směřuje doprava, renderer flipne) |
| 2 | attacking | 3 | Útok mečem |
| 3 | hit | 2 | Zásah |
| 4 | dying | 4 | Rozpad na kosti |

**Rozměr sheetu:** 512 × 640 px (4 sloupce × 5 řádků)

### enemy-orc.png — Ork (varianta)

Zelený válečník se sekerou. Agresivnější silueta.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | spawning | 3 | Objevení |
| 1 | walking | 4 | Chůze |
| 2 | attacking | 3 | Seknutí sekerou |
| 3 | hit | 2 | Zásah |
| 4 | dying | 4 | Pád |

**Rozměr sheetu:** 512 × 640 px

### enemy-bat.png — Netopýr (varianta)

Létající stvoření. Menší silueta, ale ve 128×128 framu.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | spawning | 3 | Přiletí |
| 1 | walking | 4 | Let s mávajícími křídly |
| 2 | attacking | 3 | Útok drápy |
| 3 | hit | 2 | Zásah — zakymácení |
| 4 | dying | 4 | Pád ze vzduchu |

**Rozměr sheetu:** 512 × 640 px

---

## Efekty (64 × 64 px, 4 sloupce)

### arrow-hit.png — Šíp zabodnutý v cíli

Malý sprite šípu překrytý přes nepřítele při zásahu lučištníkem.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | hit | 2 | Šíp zabodnutý, mírné zakmitání |

**Rozměr sheetu:** 128 × 64 px (2 framy × 1 řádek)

### spell.png — Kouzlo čaroděje

Záblesk magie vycházející ze země pod cílem.

| Řádek | Stav | Framů | Popis |
|-------|------|-------|-------|
| 0 | cast | 4 | Záblesk/sloup světla, narůstání → fade out |

**Rozměr sheetu:** 256 × 64 px (4 framy × 1 řádek)

---

## Shrnutí souborů

| Soubor | Typ | Frame | Sloupce | Řádky | Rozměr sheetu |
|--------|-----|-------|---------|-------|---------------|
| `pesak.png` | hráč | 128² | 4 | 4 | 512 × 512 |
| `lucistnik.png` | hráč | 128² | 4 | 4 | 512 × 512 |
| `carodej.png` | hráč | 128² | 4 | 4 | 512 × 512 |
| `obr.png` | hráč | 128² | 4 | 4 | 512 × 512 |
| `enemy-skeleton.png` | nepřítel | 128² | 4 | 5 | 512 × 640 |
| `enemy-orc.png` | nepřítel | 128² | 4 | 5 | 512 × 640 |
| `enemy-bat.png` | nepřítel | 128² | 4 | 5 | 512 × 640 |
| `arrow-hit.png` | efekt | 64² | 2 | 1 | 128 × 64 |
| `spell.png` | efekt | 64² | 4 | 1 | 256 × 64 |

**Celkem: 9 sprite sheetů.**

---

## Poznámky pro implementaci

- Renderer má fallback na barevné kolečka + emoji pokud sprite chybí.
- Nepřátelé směřují doleva — sprite se kreslí doprava, renderer flipne horizontálně.
- Perspektiva (back/mid/front) ovlivňuje scale (0.85–1.15×) — sprity musí vypadat dobře i při zmenšení.
- Varianta nepřítele se vybírá náhodně při spawnu.
