"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n: number) => String(n).padStart(2, "0");

function shiftMonth(ym: string, diff: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + diff, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 表示中の日は青、今日は枠付き、おすすめがある日だけ押せる */
export function Calendar({ selected, today, available }: { selected: string; today: string; available: string[] }) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const availableSet = useMemo(() => new Set(available), [available]);

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`),
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="前の月">
          ‹
        </button>
        <span className="font-medium">
          {y}年{m}月
        </span>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="次の月">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {WEEK.map((w, i) => (
          <div key={w} className={`py-1 ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-zinc-500"}`}>
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const day = Number(date.slice(8));
          const isSelected = date === selected;
          const ring = date === today ? "ring-1 ring-inset ring-blue-500" : "";
          if (isSelected) {
            return (
              <span key={date} className={`rounded bg-blue-600 py-1 font-semibold text-white ${ring}`} aria-current="date">
                {day}
              </span>
            );
          }
          if (availableSet.has(date)) {
            return (
              <Link key={date} href={`/?date=${date}`} className={`rounded py-1 font-medium hover:bg-blue-100 dark:hover:bg-blue-900 ${ring}`}>
                {day}
              </Link>
            );
          }
          return (
            <span key={date} className={`rounded py-1 text-zinc-300 dark:text-zinc-600 ${ring}`}>
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
