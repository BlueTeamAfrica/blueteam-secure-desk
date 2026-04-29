"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/app/_lib/firebase/firestore";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import type { OrgLabels } from "@/app/_lib/org/types";

export type WorkspaceBrandingDoc = {
  orgName: string;
  logoUrl: string;
  accentColor: string;
  welcomeText: string;
  terminology: { item: string; items: string };
};

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseBrandingDoc(raw: unknown): Partial<WorkspaceBrandingDoc> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const terminologyRaw = r.terminology;
  const terminology =
    terminologyRaw && typeof terminologyRaw === "object"
      ? {
          item: safeString((terminologyRaw as Record<string, unknown>).item) ?? "",
          items: safeString((terminologyRaw as Record<string, unknown>).items) ?? "",
        }
      : null;

  return {
    orgName: safeString(r.orgName) ?? undefined,
    logoUrl: safeString(r.logoUrl) ?? undefined,
    accentColor: safeString(r.accentColor) ?? undefined,
    welcomeText: safeString(r.welcomeText) ?? undefined,
    terminology:
      terminology && terminology.item && terminology.items ? (terminology as WorkspaceBrandingDoc["terminology"]) : undefined,
  };
}

export type WorkspaceBranding = {
  orgName: string;
  logoUrl: string | null;
  accentColor: string | null;
  welcomeText: string;
  terminology: { item: string; items: string };
};

export type DashboardBrandingContextValue = {
  branding: WorkspaceBranding;
  labels: OrgLabels;
};

const DashboardBrandingContext = createContext<DashboardBrandingContextValue | null>(null);

export function WorkspaceBrandingProvider({ children }: { children: ReactNode }) {
  const baseLabels = useMemo(() => getOrgLabels(), []);
  const [remote, setRemote] = useState<Partial<WorkspaceBrandingDoc> | null>(null);

  useEffect(() => {
    const ref = doc(db, "settings", "branding");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setRemote(snap.exists() ? parseBrandingDoc(snap.data()) : null);
      },
      () => {
        // Fail quietly; fallbacks below keep UI stable.
        setRemote(null);
      },
    );
    return () => unsub();
  }, []);

  const branding: WorkspaceBranding = useMemo(() => {
    const orgName = remote?.orgName ?? "Workspace";
    const welcomeText = remote?.welcomeText ?? "Command Center";
    const item = remote?.terminology?.item ?? "Item";
    const items = remote?.terminology?.items ?? "Items";
    const logoUrl = remote?.logoUrl ?? null;
    const accentColor = remote?.accentColor ?? null;
    return { orgName, welcomeText, terminology: { item, items }, logoUrl, accentColor };
  }, [remote]);

  const labels: OrgLabels = useMemo(() => {
    return {
      ...baseLabels,
      // Identity layer overrides (no tenants; single global doc).
      workspaceName: branding.orgName || baseLabels.workspaceName,
      workspaceLogoPath: branding.logoUrl || baseLabels.workspaceLogoPath,
      itemSingular: branding.terminology.item || baseLabels.itemSingular,
      itemPlural: branding.terminology.items || baseLabels.itemPlural,
    };
  }, [baseLabels, branding.orgName, branding.logoUrl, branding.terminology.item, branding.terminology.items]);

  const value = useMemo(() => ({ branding, labels }), [branding, labels]);

  return <DashboardBrandingContext.Provider value={value}>{children}</DashboardBrandingContext.Provider>;
}

export function useDashboardBranding(): DashboardBrandingContextValue {
  const ctx = useContext(DashboardBrandingContext);
  if (!ctx) {
    // Safe fallback for any accidental usage outside provider.
    const base = getOrgLabels();
    return {
      branding: {
        orgName: "Workspace",
        welcomeText: "Command Center",
        terminology: { item: "Item", items: "Items" },
        logoUrl: null,
        accentColor: null,
      },
      labels: base,
    };
  }
  return ctx;
}

