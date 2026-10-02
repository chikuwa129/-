"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_EVENT = "trend-study:open-sidebar";

/** スマホでサイドバーを開く（focus に要素IDを渡すとそこまでスクロールする） */
export function openSidebar(focus?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { focus } }));
}

export function OpenCalendarButton() {
  return (
    <button
      type="button"
      onClick={() => openSidebar("calendar")}
      aria-label="カレンダーを開く"
      className="rounded border border-zinc-300 px-2 py-1 text-sm lg:hidden dark:border-zinc-600"
    >
      📅
    </button>
  );
}

/**
 * PC：記事一覧の右に固定。スマホ：右からスライドして出るサイドバー＋右下の丸ボタン。
 */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const panelRef = useRef<HTMLElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const focus = (e as CustomEvent<{ focus?: string }>).detail?.focus;
      if (focus) {
        requestAnimationFrame(() => document.getElementById(focus)?.scrollIntoView({ block: "start" }));
      } else {
        panelRef.current?.scrollTo({ top: 0 });
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // 下にスクロール中は丸ボタンを隠し、少し上に戻すと表示する
  useEffect(() => {
    let lastY = window.scrollY;
    let upDistance = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (delta > 0) {
        upDistance = 0;
        if (y > 80) setFabVisible(false);
      } else if (delta < 0) {
        upDistance -= delta;
        if (upDistance > 40 || y < 80) setFabVisible(true);
      }
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 開いている間は後ろのページをスクロールさせない
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // PC幅になったら閉じる
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        aria-label="サイドバー"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) close();
        }}
        className={`fixed inset-y-0 right-0 z-50 w-[85%] max-w-[24rem] overflow-y-auto overscroll-contain bg-zinc-50 p-4 shadow-2xl transition-[transform,visibility] duration-200 dark:bg-zinc-950 ${
          open ? "visible translate-x-0" : "invisible translate-x-full"
        } lg:visible lg:sticky lg:top-4 lg:bottom-auto lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-auto lg:max-w-none lg:translate-x-0 lg:bg-transparent lg:p-0 lg:pr-1 lg:shadow-none dark:lg:bg-transparent`}
      >
        <div className="mb-2 flex justify-end lg:hidden">
          <button type="button" onClick={close} aria-label="閉じる" className="rounded px-2 py-1 text-lg">
            ✕
          </button>
        </div>
        {children}
      </aside>
      <button
        type="button"
        onClick={() => openSidebar()}
        aria-label="サイドバーを開く"
        className={`fixed bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-xl text-white shadow-lg transition-all duration-200 lg:hidden ${
          fabVisible && !open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        📊
      </button>
    </>
  );
}
