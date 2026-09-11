import { apiUrl } from "../config";
import type { PublicBotSnapshot, PublicFeatureStatus, PublicIncident, StatusSample } from "../types";

export interface DashboardData {
  bots: PublicBotSnapshot[];
  history: Record<string, StatusSample[]>;
  features: PublicFeatureStatus[];
  incidents: PublicIncident[];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const response = await fetch(apiUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return {
      bots: Array.isArray(data.bots) ? data.bots : [],
      history: data.history && typeof data.history === "object" ? data.history : {},
      features: Array.isArray(data.features) ? data.features : [],
      incidents: Array.isArray(data.incidents) ? data.incidents : [],
    };
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu từ backend:", error);
    throw error;
  }
}
