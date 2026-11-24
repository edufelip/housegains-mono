import type { ThemeId } from '@/features/appearance';
import type { Chore, Household, Instance, Member } from '@/features/household';
import type { ReactNode } from 'react';

export type AppTab = 'today' | 'feed' | 'add' | 'ranks' | 'me';

export type HouseGainsScreen =
  | { name: 'theme-picker' }
  | { name: 'create-household' }
  | { name: 'catalog'; mode: 'setup' | 'manage'; choreListReturnTo?: 'today' | 'settings' }
  | { name: 'invite'; returnTo?: 'setup' | 'settings' }
  | { name: 'assignments' }
  | { name: 'join' }
  | { name: 'today' }
  | { name: 'feed' }
  | { name: 'ranks' }
  | { name: 'wallet' }
  | { name: 'streak' }
  | { name: 'settings' }
  | { name: 'reports' }
  | { name: 'household-edit' }
  | { name: 'delete-account' }
  | { name: 'chore-list'; returnTo: 'today' | 'settings' }
  | { name: 'chore-detail'; instanceId: string }
  | { name: 'celebration'; instanceId: string }
  | {
      name: 'builder';
      choreId?: string;
      templateId?: string;
      returnTo: 'catalog' | 'chore-list';
      choreListReturnTo?: 'today' | 'settings';
    }
  | {
      name: 'catalog-detail';
      choreId: string;
      returnTo: 'catalog' | 'chore-list';
      choreListReturnTo?: 'today' | 'settings';
    };

export interface DashboardProps {
  weeklyGoalXp?: number | null;
  themeId: ThemeId;
  household: Household;
  members: Member[];
  currentMember: Member;
  chores: Chore[];
  instances: Instance[];
  weeklyTotals: Record<string, number>;
  totalXp: number;
  streak: number;
  onOpenInstance(instanceId: string): void;
  onNavigate(tab: AppTab): void;
  /** The Ganhos wallet chip; only passed while gamification is visible, so nothing else changes. */
  ganhosChip?: ReactNode;
}
