import { create } from 'zustand';
import type { FiledReport, ReportStatus, VRCNotification } from '../types/vrchat';

const STORAGE_KEY = 'vrcstudio_reports';
const MAX_REPORTS = 200;

function loadReports(): FiledReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReports(reports: FiledReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, MAX_REPORTS)));
}

interface ReportState {
  reports: FiledReport[];
  addReport: (report: FiledReport) => void;
  updateStatus: (id: string, status: ReportStatus, actionedAt?: number, notifId?: string) => void;
  updateUserNotes: (id: string, notes: string) => void;
  deleteReport: (id: string) => void;
  handleModerationNotification: (notification: VRCNotification) => void;
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: loadReports(),

  addReport: (report) => {
    const updated = [report, ...get().reports];
    saveReports(updated);
    set({ reports: updated });
  },

  updateStatus: (id, status, actionedAt, notifId) => {
    const updated = get().reports.map(r =>
      r.id === id
        ? { ...r, status, ...(actionedAt ? { actionedAt } : {}), ...(notifId ? { actionNotificationId: notifId } : {}) }
        : r
    );
    saveReports(updated);
    set({ reports: updated });
  },

  updateUserNotes: (id, notes) => {
    const updated = get().reports.map(r => r.id === id ? { ...r, userNotes: notes } : r);
    saveReports(updated);
    set({ reports: updated });
  },

  deleteReport: (id) => {
    const updated = get().reports.filter(r => r.id !== id);
    saveReports(updated);
    set({ reports: updated });
  },

  handleModerationNotification: (notification) => {
    const pending = get().reports.filter(r => r.status === 'filed');
    if (pending.length === 0) return;

    const { updateStatus } = get();

    // 1. Exact userId match in notification details
    const targetId = (notification.details?.userId || notification.details?.targetId) as string | undefined;
    if (targetId) {
      const exact = pending.find(r => r.targetId === targetId);
      if (exact) {
        updateStatus(exact.id, 'actioned', Date.now(), notification.id);
        return;
      }
    }

    // 2. Target name appears in notification message
    const msgLower = (notification.message || '').toLowerCase();
    const nameMatch = pending.find(r => r.targetName && msgLower.includes(r.targetName.toLowerCase()));
    if (nameMatch) {
      updateStatus(nameMatch.id, 'actioned', Date.now(), notification.id);
      return;
    }

    // 3. Time-proximity heuristic: pending reports from last 60 days
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const recent = pending
      .filter(r => r.reportTime > cutoff)
      .sort((a, b) => b.reportTime - a.reportTime);

    if (recent.length === 1) {
      updateStatus(recent[0].id, 'actioned', Date.now(), notification.id);
    } else if (recent.length > 1) {
      recent.forEach(r => updateStatus(r.id, 'potential_action', Date.now(), notification.id));
    }
  },
}));
