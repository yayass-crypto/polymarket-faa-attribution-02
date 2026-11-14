# Forecast Polymarket's FAA outage attribution prices minute by minute, 4 hours ahead

Entry for make.fun bounty `polymarket-faa-attribution-02` ($250, 100 places).

## What it does

`main.ts` (Node 22, standard library only) reads one case at a time from
`/input/<id>.in` — every trading market of the family with its Yes price at
every minute of the 72 hours up to a checkpoint — and writes
`/output/<id>.out` with, for each market and each of the 240 minutes after
the checkpoint, five quantiles (5%, 25%, 50%, 75%, 95%) of that minute's
price.

## Method

A persistence forecast with a price-level-scaled two-sigma spread:

```
q_tau(h) = clamp(x + z_tau * sigma_tau * sqrt(h), 0, 1)
```

- The **median stays at the last price** `x`. The last price beat every
  trailing mean as a center on the practice, and any drift or
  mean-reversion shift scored worse.
- The spread uses **two sigmas**, because the price-change distribution is
  sharply peaked at zero with fat tails: most minutes a market does not
  move at all, and now and then it jumps. The inner quantiles (25%/75%)
  are tight (`sigma_inner = 0.0008 * f`) and the outer quantiles (5%/95%)
  are wide (`sigma_outer = 0.0020 * f`).
- `f = (x(1-x))^0.65 / 0.25^1.3` scales the spread by the price level: a
  market near 0.5 can move far more than one near 0.003, both because its
  moves are bigger in practice and because the [0,1] bounds bite near the
  edges. `f` is floored at 0.1 so a market at exactly 0 or 1 still gets
  some spread.

The numbers were picked on the kit's six practice cases (NVIDIA CEO event);
the optimum is flat, so the choice is not a knife-edge fit. The practice is
a different, calmer event than the final FAA markets, so the level scaling
is what carries over: it widens the bands exactly where the final's
high-price markets need them and keeps them tight where prices sit near 0.

## Practice score

Pinball loss **0.2847** on the six practice cases, against the house
baseline's **0.3636** (median error 0.7675 for the baseline, same median
here). Valid on every case, deterministic (two runs byte-identical), ~0.09s
per case, well inside the 8s cap.

## Run locally

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT.
