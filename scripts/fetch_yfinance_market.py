from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import json
import math
from typing import Any

import pandas as pd
import yfinance as yf


OUT_DIR = Path("data/yfinance")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LATEST_JSON = OUT_DIR / "latest.json"
HISTORY_CSV = OUT_DIR / "history.csv"

LIMA_TZ = ZoneInfo("America/Lima")

# Edita esta lista cuando quieras agregar o quitar activos.
MARKET_TICKERS = {
    "USDPEN=X": {
        "name": "USD/PEN",
        "category": "FX",
    },
    "EURUSD=X": {
        "name": "EUR/USD",
        "category": "FX",
    },
    "DX-Y.NYB": {
        "name": "DXY",
        "category": "Dólar",
    },
    "^GSPC": {
        "name": "S&P 500",
        "category": "Índice",
    },
    "^IXIC": {
        "name": "Nasdaq",
        "category": "Índice",
    },
    "^DJI": {
        "name": "Dow Jones",
        "category": "Índice",
    },
    "^VIX": {
        "name": "VIX",
        "category": "Volatilidad",
    },
    "^TNX": {
        "name": "US 10Y",
        "category": "Tasa",
    },
    "GC=F": {
        "name": "Oro",
        "category": "Commodity",
    },
    "CL=F": {
        "name": "WTI",
        "category": "Commodity",
    },
    "HG=F": {
        "name": "Cobre",
        "category": "Commodity",
    },
    "BTC-USD": {
        "name": "Bitcoin",
        "category": "Crypto",
    },
}


def clean_float(value: Any) -> float | None:
    try:
        if pd.isna(value):
            return None

        number = float(value)

        if math.isnan(number) or math.isinf(number):
            return None

        return number

    except Exception:
        return None


def round_or_none(value: float | None, digits: int = 6) -> float | None:
    if value is None:
        return None

    return round(value, digits)


def get_symbol_frame(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    if isinstance(df.columns, pd.MultiIndex):
        level_0 = df.columns.get_level_values(0)
        level_1 = df.columns.get_level_values(1)

        if symbol in level_0:
            return df[symbol].copy()

        if symbol in level_1:
            return df.xs(symbol, axis=1, level=1).copy()

        return pd.DataFrame()

    return df.copy()


def get_close_series(df: pd.DataFrame, symbol: str) -> pd.Series:
    symbol_df = get_symbol_frame(df, symbol)

    if symbol_df.empty:
        return pd.Series(dtype="float64")

    if "Close" not in symbol_df.columns:
        return pd.Series(dtype="float64")

    close = symbol_df["Close"].dropna()
    close = close[close.apply(lambda x: clean_float(x) is not None)]

    return close


def get_last_timestamp(series: pd.Series) -> str | None:
    if series.empty:
        return None

    try:
        value = series.index[-1]

        if hasattr(value, "isoformat"):
            return value.isoformat()

        return str(value)

    except Exception:
        return None


def get_sparkline(series: pd.Series, points: int = 32) -> list[float]:
    if series.empty:
        return []

    values = []

    for item in series.tail(points).tolist():
        number = clean_float(item)

        if number is not None:
            values.append(round(number, 6))

    return values


def calculate_change(price: float | None, previous: float | None) -> tuple[float | None, float | None, str]:
    if price is None or previous is None or previous == 0:
        return None, None, "flat"

    change = price - previous
    change_pct = change / previous * 100

    if change > 0:
        direction = "up"
    elif change < 0:
        direction = "down"
    else:
        direction = "flat"

    return change, change_pct, direction


def main() -> None:
    now_utc = datetime.now(timezone.utc)
    now_lima = now_utc.astimezone(LIMA_TZ)

    symbols = list(MARKET_TICKERS.keys())

    print(f"Fetching {len(symbols)} symbols from yfinance...")
    print(f"UTC:  {now_utc.isoformat()}")
    print(f"Lima: {now_lima.isoformat()}")

    intraday_df = yf.download(
        tickers=symbols,
        period="5d",
        interval="15m",
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
    )

    daily_df = yf.download(
        tickers=symbols,
        period="10d",
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
    )

    latest_records = []
    history_records = []
    errors = []

    for symbol in symbols:
        meta = MARKET_TICKERS[symbol]

        try:
            intraday_close = get_close_series(intraday_df, symbol)
            daily_close = get_close_series(daily_df, symbol)

            if intraday_close.empty and daily_close.empty:
                raise RuntimeError("No price data returned.")

            price_series = intraday_close if not intraday_close.empty else daily_close

            price = clean_float(price_series.iloc[-1])

            previous_close = None

            if len(daily_close) >= 2:
                previous_close = clean_float(daily_close.iloc[-2])
            elif len(price_series) >= 2:
                previous_close = clean_float(price_series.iloc[-2])

            change, change_pct, direction = calculate_change(price, previous_close)

            record = {
                "symbol": symbol,
                "name": meta["name"],
                "category": meta["category"],
                "price": round_or_none(price, 6),
                "previous_close": round_or_none(previous_close, 6),
                "change": round_or_none(change, 6),
                "change_pct": round_or_none(change_pct, 4),
                "direction": direction,
                "price_time": get_last_timestamp(price_series),
                "sparkline": get_sparkline(price_series),
                "status": "ok",
            }

            latest_records.append(record)

            history_records.append({
                "snapshot_time_lima": now_lima.isoformat(),
                "snapshot_time_utc": now_utc.isoformat(),
                "symbol": symbol,
                "name": meta["name"],
                "category": meta["category"],
                "price": record["price"],
                "previous_close": record["previous_close"],
                "change": record["change"],
                "change_pct": record["change_pct"],
                "direction": record["direction"],
                "price_time": record["price_time"],
            })

        except Exception as exc:
            error_record = {
                "symbol": symbol,
                "name": meta["name"],
                "category": meta["category"],
                "status": "error",
                "error": str(exc),
            }

            latest_records.append(error_record)
            errors.append(error_record)

    payload = {
        "source": "yfinance",
        "fetched_at_utc": now_utc.isoformat(),
        "fetched_at_lima": now_lima.isoformat(),
        "interval": "15m",
        "period": "5d",
        "count": len(latest_records),
        "ok_count": len([x for x in latest_records if x.get("status") == "ok"]),
        "error_count": len(errors),
        "data": latest_records,
        "errors": errors,
        "disclaimer": "Data referencial obtenida mediante yfinance/Yahoo Finance. No usar como fuente oficial de trading, contabilidad o reporting regulatorio.",
    }

    LATEST_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    new_history = pd.DataFrame(history_records)

    if not new_history.empty:
        if HISTORY_CSV.exists():
            old_history = pd.read_csv(HISTORY_CSV)
            full_history = pd.concat([old_history, new_history], ignore_index=True)

            full_history = full_history.drop_duplicates(
                subset=["snapshot_time_lima", "symbol"],
                keep="last",
            )
        else:
            full_history = new_history

        full_history.to_csv(HISTORY_CSV, index=False, encoding="utf-8")

    print(f"Saved: {LATEST_JSON}")
    print(f"Saved: {HISTORY_CSV}")
    print(f"OK: {payload['ok_count']} | Errors: {payload['error_count']}")


if __name__ == "__main__":
    main()
