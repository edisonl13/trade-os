"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

export interface PerformanceHeatmapCell {
  hour: number;
  day: number;
  value: number;
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  totalR: number | null;
  avgR: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  confidenceScore: number;
  symbols: string[];
  instrumentStats: Array<{
    symbol: string;
    trades: number;
    wins: number;
    losses: number;
    breakEven: number;
    winRate: number | null;
    pnl: number;
    totalR: number | null;
  }>;
}

export interface InstrumentPerformance {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnL: number;
  avgRR: number | null;
  totalR: number | null;
}

type Mode = "confidence" | "r" | "frequency";

interface AggregatedCell {
  key: string;
  day: number;
  hour: number;
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  pnl: number;
  totalR: number | null;
  winRate: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  confidenceScore: number;
  symbols: Set<string>;
}

const HOURS = [0, 4, 8, 12, 16, 20];
const DAY_KEYS = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
];

function wilsonInterval(wins: number, total: number): [number, number] | null {
  if (total <= 0) return null;
  const z = 1.96;
  const p = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const halfWidth =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) /
    denominator;
  return [
    Math.max(0, (centre - halfWidth) * 100),
    Math.min(100, (centre + halfWidth) * 100),
  ];
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

function evidenceLabel(cell: AggregatedCell | null, t: (key: string) => string) {
  if (!cell || cell.trades === 0) return t("heatmap.noSample");
  const outcomes = cell.wins + cell.losses + cell.breakEven;
  if (outcomes < 10) return t("heatmap.insufficient");
  if (outcomes < 30) return t("heatmap.preliminary");
  if (
    cell.confidenceLow !== null &&
    cell.confidenceHigh !== null &&
    (cell.confidenceLow > 50 || cell.confidenceHigh < 50)
  ) {
    return t("heatmap.stable");
  }
  return t("heatmap.review");
}

export function PerformanceHeatmap({
  cells,
  instruments,
  compact = false,
}: {
  cells: PerformanceHeatmapCell[];
  instruments: InstrumentPerformance[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("confidence");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const aggregated = useMemo(() => {
    const map = new Map<string, AggregatedCell>();
    for (const source of cells) {
      const hour = Math.floor(source.hour / 4) * 4;
      const key = `${source.day}-${hour}`;
      const current = map.get(key) ?? {
        key,
        day: source.day,
        hour,
        trades: 0,
        wins: 0,
        losses: 0,
        breakEven: 0,
        pnl: 0,
        totalR: null,
        winRate: null,
        confidenceLow: null,
        confidenceHigh: null,
        confidenceScore: 0,
        symbols: new Set<string>(),
      };

      if (selectedSymbol) {
        const stat = source.instrumentStats.find(
          (item) => item.symbol === selectedSymbol
        );
        if (!stat) continue;
        current.trades += stat.trades;
        current.wins += stat.wins;
        current.losses += stat.losses;
        current.breakEven += stat.breakEven;
        current.pnl += stat.pnl;
        if (stat.totalR !== null) {
          current.totalR = (current.totalR ?? 0) + stat.totalR;
        }
        current.symbols.add(stat.symbol);
      } else {
        current.trades += source.trades;
        current.wins += source.wins;
        current.losses += source.losses;
        current.breakEven += source.breakEven;
        current.pnl += source.value;
        if (source.totalR !== null) {
          current.totalR = (current.totalR ?? 0) + source.totalR;
        }
        source.symbols.forEach((symbol) => current.symbols.add(symbol));
      }
      map.set(key, current);
    }

    for (const cell of map.values()) {
      const outcomes = cell.wins + cell.losses + cell.breakEven;
      cell.winRate = outcomes > 0 ? (cell.wins / outcomes) * 100 : null;
      const interval = wilsonInterval(cell.wins, outcomes);
      cell.confidenceLow = interval?.[0] ?? null;
      cell.confidenceHigh = interval?.[1] ?? null;
      const direction =
        cell.winRate === null ? 0 : Math.abs(2 * (cell.winRate / 100) - 1);
      cell.confidenceScore = direction * (1 - Math.exp(-outcomes / 20));
    }
    return map;
  }, [cells, selectedSymbol]);

  const maxFrequency = Math.max(
    1,
    ...Array.from(aggregated.values()).map((cell) => cell.trades)
  );
  const maxR = Math.max(
    1,
    ...Array.from(aggregated.values()).map((cell) =>
      Math.abs(cell.totalR ?? cell.pnl)
    )
  );
  const selectedCell = selectedKey ? aggregated.get(selectedKey) ?? null : null;

  const cellStyle = (cell: AggregatedCell | undefined) => {
    if (!cell || cell.trades === 0) {
      return {
        background: "rgba(154,168,184,0.045)",
        borderColor: "rgba(154,168,184,0.08)",
      };
    }

    if (mode === "frequency") {
      const intensity = Math.max(0.12, cell.trades / maxFrequency);
      return {
        background: `rgba(22,217,255,${0.08 + intensity * 0.62})`,
        borderColor: `rgba(22,217,255,${0.18 + intensity * 0.55})`,
      };
    }

    if (mode === "r") {
      const value = cell.totalR ?? cell.pnl;
      const intensity = Math.max(0.08, Math.abs(value) / maxR);
      const rgb = value > 0 ? "32,215,133" : value < 0 ? "255,77,100" : "154,168,184";
      return {
        background: `rgba(${rgb},${0.06 + intensity * 0.66})`,
        borderColor: `rgba(${rgb},${0.16 + intensity * 0.58})`,
      };
    }

    const winRate = cell.winRate ?? 50;
    const rgb = winRate > 50 ? "32,215,133" : winRate < 50 ? "255,77,100" : "154,168,184";
    const intensity = Math.max(0.04, cell.confidenceScore);
    return {
      background: `rgba(${rgb},${0.045 + intensity * 0.68})`,
      borderColor: `rgba(${rgb},${0.14 + intensity * 0.6})`,
    };
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-[#16D9FF]" />
            <h2 className="text-[17px] font-extrabold text-white">
              {t("heatmap.title")}
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#718094]">
            {t("heatmap.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/8 bg-black/20 p-1">
          {(["confidence", "r", "frequency"] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                "rounded-md px-3 py-2 text-[11px] font-extrabold transition",
                mode === item
                  ? "bg-[#16D9FF]/12 text-[#16D9FF] shadow-[0_0_14px_rgba(22,217,255,0.12)]"
                  : "text-[#718094] hover:text-white"
              )}
            >
              {t(`heatmap.mode.${item}`)}
            </button>
          ))}
        </div>
      </div>

      {instruments.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setSelectedSymbol(null);
              setSelectedKey(null);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition",
              selectedSymbol === null
                ? "border-[#16D9FF]/50 bg-[#16D9FF]/10 text-[#16D9FF]"
                : "border-white/10 text-[#718094] hover:text-white"
            )}
          >
            {t("heatmap.allInstruments")} · {instruments.reduce((sum, item) => sum + item.trades, 0)}
          </button>
          {instruments.map((instrument) => (
            <button
              key={instrument.symbol}
              type="button"
              onClick={() => {
                setSelectedSymbol(instrument.symbol);
                setSelectedKey(null);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition",
                selectedSymbol === instrument.symbol
                  ? "border-[#D65CFF]/55 bg-[#D65CFF]/10 text-[#E28AFF]"
                  : "border-white/10 text-[#718094] hover:text-white"
              )}
            >
              {instrument.symbol} · {instrument.trades}
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          "grid gap-5",
          compact ? "lg:grid-cols-[minmax(0,1fr)_250px]" : "xl:grid-cols-[minmax(0,1fr)_300px]"
        )}
      >
        <div className="min-w-0 overflow-x-auto">
          <div className="grid min-w-[620px] grid-cols-[46px_repeat(7,minmax(58px,1fr))] gap-2">
            <div />
            {DAY_KEYS.map((key) => (
              <div
                key={key}
                className="pb-1 text-center text-[10px] font-extrabold text-[#718094]"
              >
                {t(key)}
              </div>
            ))}
            {HOURS.flatMap((hour) => [
              <div
                key={`hour-${hour}`}
                className="flex items-center font-data text-[10px] text-[#59697C]"
              >
                {String(hour).padStart(2, "0")}:00
              </div>,
              ...DAY_KEYS.map((_, day) => {
                const key = `${day}-${hour}`;
                const cell = aggregated.get(key);
                const isSelected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setSelectedKey((current) => (current === key ? null : key))
                    }
                    style={cellStyle(cell)}
                    className={cn(
                      "group relative min-h-12 rounded-md border transition hover:-translate-y-0.5 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]",
                      isSelected && "ring-2 ring-[#16D9FF] shadow-[0_0_18px_rgba(22,217,255,0.18)]"
                    )}
                    aria-label={`${t(DAY_KEYS[day])} ${String(hour).padStart(2, "0")}:00`}
                  >
                    {cell && cell.trades > 0 && (
                      <>
                        <span className="font-data text-[11px] font-extrabold text-white">
                          {mode === "confidence"
                            ? `${(cell.winRate ?? 0).toFixed(0)}%`
                            : mode === "r"
                              ? cell.totalR !== null
                                ? `${cell.totalR > 0 ? "+" : ""}${cell.totalR.toFixed(1)}R`
                                : formatMoney(cell.pnl)
                              : cell.trades}
                        </span>
                        <span className="absolute bottom-1 right-1 text-[8px] font-bold text-white/45">
                          n={cell.trades}
                        </span>
                      </>
                    )}
                  </button>
                );
              }),
            ])}
          </div>
        </div>

        <div className="rounded-lg border border-[#9AA8B8]/12 bg-[#070B12]/72 p-4">
          {selectedCell ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#16D9FF]">
                    {t(DAY_KEYS[selectedCell.day])} · {String(selectedCell.hour).padStart(2, "0")}:00–{String(selectedCell.hour + 4).padStart(2, "0")}:00
                  </p>
                  <h3 className="mt-2 text-[15px] font-extrabold text-white">
                    {selectedSymbol ?? t("heatmap.allInstruments")}
                  </h3>
                </div>
                {selectedCell.wins + selectedCell.losses + selectedCell.breakEven >= 30 ? (
                  <CheckCircle2 className="h-5 w-5 text-[#20D785]" />
                ) : (
                  <CircleAlert className="h-5 w-5 text-[#FFB84D]" />
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-[#59697C]">{t("heatmap.sample")}</span>
                  <strong className="mt-1 block font-data text-[17px]">{selectedCell.trades}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-[#59697C]">{t("overview.winRate")}</span>
                  <strong className="mt-1 block font-data text-[17px]">{selectedCell.winRate?.toFixed(1) ?? "—"}%</strong>
                </div>
                <div>
                  <span className="text-[10px] text-[#59697C]">{t("heatmap.netResult")}</span>
                  <strong className={cn("mt-1 block font-data text-[15px]", selectedCell.pnl >= 0 ? "text-[#20D785]" : "text-[#FF4D64]")}>
                    {formatMoney(selectedCell.pnl)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-[#59697C]">{t("heatmap.totalR")}</span>
                  <strong className="mt-1 block font-data text-[15px]">
                    {selectedCell.totalR === null ? "—" : `${selectedCell.totalR > 0 ? "+" : ""}${selectedCell.totalR.toFixed(2)}R`}
                  </strong>
                </div>
              </div>
              <div className="mt-4 border-t border-white/8 pt-4">
                <p className="text-[11px] font-extrabold text-white">
                  {evidenceLabel(selectedCell, t)}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[#718094]">
                  {selectedCell.confidenceLow === null
                    ? t("heatmap.noOutcome")
                    : `${t("heatmap.wilson")}: ${selectedCell.confidenceLow.toFixed(1)}%–${selectedCell.confidenceHigh?.toFixed(1)}%`}
                </p>
                <p className="mt-3 text-[10px] leading-4 text-[#718094]">
                  {Array.from(selectedCell.symbols).join(" · ") || t("heatmap.noInstrument")}
                </p>
              </div>
            </>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center text-center">
              <Clock3 className="h-6 w-6 text-[#16D9FF]" />
              <p className="mt-3 text-[12px] font-extrabold text-white">
                {t("heatmap.selectCell")}
              </p>
              <p className="mt-1 max-w-[220px] text-[10px] leading-4 text-[#718094]">
                {t("heatmap.selectCellDesc")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
