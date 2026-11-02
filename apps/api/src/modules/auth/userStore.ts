import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null; // Stored in strict E.164 (+91XXXXXXXXXX) or null for existing users
  role: 'CITIZEN' | 'ADMIN';
  smsEnabled: boolean;
  minSeverityThreshold: 'WATCH' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  updatedAt: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

/**
 * Normalizes an Indian phone number to E.164 format (+91XXXXXXXXXX).
 * Throws an error if invalid.
 */
export function normalizeIndianMobile(input: string): string {
  if (!input) {
    throw new Error('Phone number is required');
  }
  let digits = input.replace(/\D/g, '');

  if (digits.startsWith('0091') && digits.length >= 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith('91') && digits.length >= 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    throw new Error(`Indian mobile number must be exactly 10 digits. Received ${digits.length} digit(s).`);
  }

  if (!/^[6-9]/.test(digits)) {
    throw new Error('Indian mobile number must begin with digits 6, 7, 8, or 9.');
  }

  return `+91${digits}`;
}

/**
 * Validates whether string is an Indian mobile number in E.164 format.
 */
export function isValidIndianMobileE164(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone);
}

export class UserStore {
  private users: Map<string, UserRecord> = new Map();

  constructor() {
    this.seedDefaultUsers();
    this.loadFromDisk();
    this.runMigrations();
  }

  private seedDefaultUsers() {
    const defaultCitizen: UserRecord = {
      id: 'user-001',
      email: 'citizen@smartcity.org',
      fullName: 'Metro Resident',
      phoneNumber: null,
      role: 'CITIZEN',
      smsEnabled: true,
      minSeverityThreshold: 'WARNING',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const defaultAdmin: UserRecord = {
      id: 'admin-001',
      email: 'admin@smartcity.org',
      fullName: 'EOC Commander',
      phoneNumber: null,
      role: 'ADMIN',
      smsEnabled: true,
      minSeverityThreshold: 'WARNING',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    this.users.set(defaultCitizen.id, defaultCitizen);
    this.users.set(defaultAdmin.id, defaultAdmin);
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((u: UserRecord) => {
            if (u.id) this.users.set(u.id, u);
          });
        }
      }
    } catch {
      // Non-fatal, use in-memory store
    }
  }

  private saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const list = Array.from(this.users.values());
      fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch {
      // Non-fatal in read-only / test environments
    }
  }

  /**
   * Database migration:
   * Adds nullable phoneNumber column to users table.
   * Existing users without an Indian mobile number get NULL.
   * Preserves NULL for citizen@smartcity.org and does not break existing accounts.
   */
  public runMigrations(): void {
    let migratedCount = 0;
    for (const [id, user] of this.users.entries()) {
      if (user.email === 'citizen@smartcity.org' && user.phoneNumber === '+919876543210') {
        user.phoneNumber = null;
        user.updatedAt = new Date().toISOString();
        this.users.set(id, user);
        migratedCount++;
      } else if (user.phoneNumber === undefined) {
        user.phoneNumber = null;
        user.updatedAt = new Date().toISOString();
        this.users.set(id, user);
        migratedCount++;
      } else if (user.phoneNumber !== null) {
        if (!isValidIndianMobileE164(user.phoneNumber)) {
          try {
            user.phoneNumber = normalizeIndianMobile(user.phoneNumber);
          } catch {
            user.phoneNumber = null;
          }
          user.updatedAt = new Date().toISOString();
          this.users.set(id, user);
          migratedCount++;
        }
      }
    }
    if (migratedCount > 0) {
      this.saveToDisk();
    }
  }

  public getUserByEmail(email: string): UserRecord | undefined {
    const target = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase().trim() === target) {
        return { ...user };
      }
    }
    return undefined;
  }

  public getUserById(id: string): UserRecord | undefined {
    const user = this.users.get(id);
    return user ? { ...user } : undefined;
  }

  public createUser(params: {
    email: string;
    fullName: string;
    phoneNumber?: string | null;
    role?: 'CITIZEN' | 'ADMIN';
    smsEnabled?: boolean;
    minSeverityThreshold?: 'WATCH' | 'WARNING' | 'CRITICAL';
  }): UserRecord {
    const normalizedPhone = params.phoneNumber ? normalizeIndianMobile(params.phoneNumber) : null;
    const existing = this.getUserByEmail(params.email);
    if (existing) {
      // Update existing record
      return this.updateUser(existing.id, {
        fullName: params.fullName,
        phoneNumber: normalizedPhone,
        smsEnabled: params.smsEnabled ?? existing.smsEnabled,
        minSeverityThreshold: params.minSeverityThreshold ?? existing.minSeverityThreshold,
      });
    }

    const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newUser: UserRecord = {
      id,
      email: params.email.toLowerCase().trim(),
      fullName: params.fullName.trim(),
      phoneNumber: normalizedPhone,
      role: params.role || (params.email.includes('admin') ? 'ADMIN' : 'CITIZEN'),
      smsEnabled: params.smsEnabled ?? true,
      minSeverityThreshold: params.minSeverityThreshold || 'WARNING',
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(newUser.id, newUser);
    this.saveToDisk();
    return { ...newUser };
  }

  public updateUser(
    id: string,
    updates: Partial<Omit<UserRecord, 'id' | 'email' | 'createdAt'>> & { phoneNumber?: string | null }
  ): UserRecord {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }

    let phone = user.phoneNumber;
    if (updates.phoneNumber !== undefined) {
      if (updates.phoneNumber === null || updates.phoneNumber === '') {
        phone = null;
      } else {
        phone = normalizeIndianMobile(updates.phoneNumber);
      }
    }

    const updatedUser: UserRecord = {
      ...user,
      ...updates,
      phoneNumber: phone,
      updatedAt: new Date().toISOString(),
    };

    this.users.set(id, updatedUser);
    this.saveToDisk();
    return { ...updatedUser };
  }

  public getAllUsers(): UserRecord[] {
    return Array.from(this.users.values()).map((u) => ({ ...u }));
  }
}

export const userStore = new UserStore();
