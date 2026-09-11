import fs from 'fs/promises';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'data.json');
const DB_TMP_FILE = `${DB_FILE}.tmp`;

export let db = {
  latest_snapshots: {} as Record<string, any>,
  history_logs: [] as any[],
  public_state: {} as Record<string, any>,
  public_incidents: {} as Record<string, any>
};

export async function initDb() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    db = {
      latest_snapshots: parsed.latest_snapshots || {},
      history_logs: Array.isArray(parsed.history_logs) ? parsed.history_logs : [],
      public_state: parsed.public_state || {},
      public_incidents: parsed.public_incidents || {}
    };
  } catch (e) {
    db = { latest_snapshots: {}, history_logs: [], public_state: {}, public_incidents: {} };
  }
}

export async function saveDb() {
  await fs.writeFile(DB_TMP_FILE, JSON.stringify(db));
  await fs.rename(DB_TMP_FILE, DB_FILE);
}
