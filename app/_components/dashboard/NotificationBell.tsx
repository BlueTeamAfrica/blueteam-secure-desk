"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/app/_lib/firebase/firestore";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

type NotificationItem = {
  id: string;
  type: "assigned" | "designed";
  caseId: string;
  caseRef: string;
  message: string;
  read: boolean;
  createdAt: { seconds: number } | null;
};

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

export function NotificationBell() {
  const { state } = useAuth();
  const { labels } = useDashboardBranding();
  const nl = labels.notificationLabels;
  const uid = state.status === "signedInWorkspace" ? state.user.uid : null;

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((n) => !n.read).length;

  // Real-time listener
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "notifications", uid, "items"),
      orderBy("createdAt", "desc"),
      limit(30),
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type as "assigned" | "designed",
            caseId: typeof data.caseId === "string" ? data.caseId : "",
            caseRef: typeof data.caseRef === "string" ? data.caseRef : "",
            message: typeof data.message === "string" ? data.message : "",
            read: data.read === true,
            createdAt: data.createdAt ?? null,
          };
        }),
      );
    });
    return unsub;
  }, [uid]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleMarkAllRead() {
    const unread = items.filter((n) => !n.read).map((n) => n.id);
    if (!unread.length || markingRead) return;
    setMarkingRead(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const token = await user.getIdToken(false);
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: unread }),
      });
    } catch {
      /* silent — Firestore snapshot will reflect truth */
    } finally {
      setMarkingRead(false);
    }
  }

  async function handleOpenBell() {
    setOpen((v) => !v);
  }

  if (!uid) return null;

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={nl?.bellAriaLabel ?? "Notifications"}
        aria-expanded={open}
        onClick={handleOpenBell}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notif-bell-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="region" aria-label={nl?.bellAriaLabel ?? "Notifications"}>
          <div className="notif-panel-header">
            <span className="notif-panel-title">{nl?.bellAriaLabel ?? "Notifications"}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-read-btn"
                onClick={handleMarkAllRead}
                disabled={markingRead}
              >
                {nl?.markAllRead ?? "Mark all read"}
              </button>
            )}
          </div>

          <ul className="notif-list">
            {items.length === 0 ? (
              <li className="notif-empty">{nl?.emptyState ?? "No notifications yet"}</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className={`notif-item${n.read ? "" : " notif-item--unread"}`}>
                  <span className="notif-ref">{n.caseRef}</span>
                  <span className="notif-msg">{n.message}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
