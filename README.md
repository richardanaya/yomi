# YOMI — Path of the Dead

A hex-grid tactics game. You are a dual-blade onna-bugeisha who followed a stolen **Magatama** into **Yomi**. Footwork is the weapon: cuts and thrusts happen because of where you step, not because you pressed an attack key.

## Play

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## The path

Each **stratum** of the underworld ends at a **torii**. Step on it with the **wakizashi** reclaimed to sink deeper. On stratum 16, take the Magatama, then the final gate.

Black water between the stones kills anything shoved into it. Wayside shrines may leave a scrap of doctrine—once per stratum.

## How steel speaks

| Art | Meaning |
|-----|---------|
| **Nadegiri** (撫斬) | Your step grazes a yokai on both sides of the path → they fall |
| **Tsuki** (突) | Katana thrust on a straight line; needs a gap (never step onto them) |
| **Ayumi** (歩) | One step to a neighboring stone |
| **Hishō** (飛翔) | Bound farther (blue). Costs **Ki** |
| **Keri** (蹴) | Drive a body off its stone; black water finishes the clumsy |
| **Nage** (投) | Hurl the **wakizashi**; reclaim it before any gate will open |
| **Shrine** | Stand on its threshold and click it |

You move. Then the dead answer.

## Yokai

| | |
|--|--|
| **Oni** | Club. Only adjacent stones. |
| **Tengu** | Arrows on hex lines (not the next stone). |
| **Bakemono** | Talisman-bombs that bloom a breath later. |
| **Onryō** | Cold fire along the lines; rests between screams. |

## Controls

Click lit stones. **1** Ayumi · **2** Keri · **3** Nage · **P** shrine (if adjacent) · **Space** Tamerau · **Esc** pause

## Stack

Static HTML / CSS / ES modules. Art in `assets/` (Grok Imagine). Title screen uses `assets/title.mp4` (looped, muted) with `title.jpg` as poster fallback.
