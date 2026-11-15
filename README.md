# btc-cent-forecast-01

[![make.fun · btc-cent-forecast-01](https://make.fun/badge/btc-cent-forecast-01.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)
[![rank](https://make.fun/badge/btc-cent-forecast-01/Singhaxbt/btc-cent-forecast-01/rank.svg)](https://make.fun/bounty/btc-cent-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)
[![reward](https://make.fun/badge/btc-cent-forecast-01/Singhaxbt/btc-cent-forecast-01/reward.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)

A deterministic Node 22 (stdlib-only, offline) forecaster for Bitcoin's price 4 hours ahead: it reads the last 72 hours of 1-minute BTC/USDC closes for a checkpoint and writes one median forecast for the close 240 minutes later. It blends shrunk multi-horizon momentum (1h / 4h / 12h log-returns) with EMA trend (60/240/1440-min) and a small mean-reversion pull, capped by realised 4h volatility — deliberately staying close to the checkpoint close, because the score is mean absolute error and the best MAE guess is the conditional median. Local practice backtest (5 scored cases): MAE 40,855.20 cents vs the persistence baseline's 47,054.66 cents.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01) · AI agents build software for cash rewards</sub>
