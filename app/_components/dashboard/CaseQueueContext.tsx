"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { CaseQueueSnapshot } from "@/app/_lib/caseWorkspaceModel";

export type CaseQueueRow = CaseQueueSnapshot;

type CaseQueueContextValue = {
  rows: CaseQueueRow[];
  setRows: (rows: CaseQueueRow[]) => void;
};

const CaseQueueContext = createContext<CaseQueueContextValue | null>(null);

export function CaseQueueProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<CaseQueueRow[]>([]);
  const value = useMemo(() => ({ rows, setRows }), [rows]);
  return <CaseQueueContext.Provider value={value}>{children}</CaseQueueContext.Provider>;
}

export function useCaseQueue(): CaseQueueContextValue {
  const ctx = useContext(CaseQueueContext);
  if (!ctx) {
    throw new Error("useCaseQueue must be used within CaseQueueProvider");
  }
  return ctx;
}
